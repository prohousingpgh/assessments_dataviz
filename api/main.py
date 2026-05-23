from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.config import CORS_ORIGINS
from api.db import get_connection, get_parcel, get_summary_stats, load_manifest, search_parcels
from api.static_files import install_static_files
from api.homestead_data import list_homestead_table
from api.map_routes import router as map_router
from api.tax import compute_property_taxes, set_tax_db_connection
from api.tax_aggregates import clear_aggregate_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    clear_aggregate_cache()
    app.state.db = get_connection()
    set_tax_db_connection(app.state.db)
    yield
    set_tax_db_connection(None)
    app.state.db.close()


app = FastAPI(title="Allegheny Home Assessment Explorer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/search")
def search(q: str = Query(..., min_length=2)) -> dict[str, Any]:
    results = search_parcels(app.state.db, q)
    return {"query": q, "results": results}


@app.get("/api/parcels/{parcel_id}")
def parcel_detail(parcel_id: str) -> dict[str, Any]:
    row = get_parcel(app.state.db, parcel_id)
    if not row:
        raise HTTPException(status_code=404, detail="Parcel not found")
    summary = get_summary_stats(app.state.db)
    taxes = compute_property_taxes(row)
    return {"parcel": row, "county_summary": summary, "taxes": taxes}


@app.get("/api/manifest")
def manifest() -> dict[str, Any]:
    data = load_manifest()
    data["county_summary"] = get_summary_stats(app.state.db)
    return data


@app.get("/api/homestead-exemptions")
def homestead_exemptions() -> dict[str, Any]:
    return list_homestead_table()


app.include_router(map_router)


install_static_files(app)
