from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from api.config import CORS_ORIGINS
from api.db import get_connection, get_parcel, get_summary_stats, load_manifest, search_parcels
from api.static_files import install_static_files
from api.homestead_data import list_homestead_table
from api.map_routes import router as map_router
from api.tax import compute_property_taxes, set_tax_db_connection
from api.map_data import clear_map_data_cache
from api.tax_aggregates import clear_aggregate_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    clear_aggregate_cache()
    clear_map_data_cache()
    yield


async def db_connection_middleware(request: Request, call_next):
    conn = get_connection()
    request.state.db = conn
    set_tax_db_connection(conn)
    try:
        return await call_next(request)
    finally:
        set_tax_db_connection(None)
        conn.close()


app = FastAPI(title="Allegheny Home Assessment Explorer API", lifespan=lifespan)
app.middleware("http")(db_connection_middleware)

app.add_middleware(GZipMiddleware, minimum_size=500)
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
def search(request: Request, q: str = Query(..., min_length=2)) -> dict[str, Any]:
    results = search_parcels(request.state.db, q)
    return {"query": q, "results": results}


@app.get("/api/parcels/{parcel_id}")
def parcel_detail(request: Request, parcel_id: str) -> dict[str, Any]:
    row = get_parcel(request.state.db, parcel_id)
    if not row:
        raise HTTPException(status_code=404, detail="Parcel not found")
    summary = get_summary_stats(request.state.db)
    taxes = compute_property_taxes(row)
    return {"parcel": row, "county_summary": summary, "taxes": taxes}


@app.get("/api/manifest")
def manifest(request: Request) -> dict[str, Any]:
    data = load_manifest()
    data["county_summary"] = get_summary_stats(request.state.db)
    return data


@app.get("/api/homestead-exemptions")
def homestead_exemptions() -> dict[str, Any]:
    return list_homestead_table()


app.include_router(map_router)


install_static_files(app)
