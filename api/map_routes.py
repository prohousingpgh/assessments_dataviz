from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from api.map_data import (
    PMTILES_PATH,
    map_config,
    map_hexbins_geojson,
    map_parcel_feature,
    map_parcels_geojson,
    map_tax_config,
    map_tax_hexbins_geojson,
    map_tax_parcel_feature,
    map_tax_parcels_geojson,
    map_valuation_config,
    map_valuation_hexbins_geojson,
    map_valuation_parcel_feature,
    map_valuation_parcels_geojson,
)

router = APIRouter(prefix="/api/map", tags=["map"])


def _db(request: Request) -> Any:
    return request.state.db


@router.get("/config")
def get_map_config(request: Request) -> dict[str, Any]:
    return map_config(_db(request))


@router.get("/parcels")
def get_map_parcels(
    request: Request,
    west: float = Query(..., description="Bounding box west longitude"),
    south: float = Query(..., description="Bounding box south latitude"),
    east: float = Query(..., description="Bounding box east longitude"),
    north: float = Query(..., description="Bounding box north latitude"),
    zoom: float | None = Query(None, ge=0, le=22, description="Map zoom for adaptive sampling"),
    limit: int | None = Query(None, ge=1, le=25000),
) -> dict[str, Any]:
    return map_parcels_geojson(
        _db(request),
        west=west,
        south=south,
        east=east,
        north=north,
        limit=limit,
        zoom=zoom,
    )


@router.get("/hexbins")
def get_map_hexbins(
    request: Request,
    hex_size_deg: float = Query(0.006, ge=0.0025, le=0.03),
    min_count: int = Query(10, ge=1, le=500),
) -> dict[str, Any]:
    return map_hexbins_geojson(
        _db(request),
        hex_size_deg=hex_size_deg,
        min_count=min_count,
    )


@router.get("/parcels/{parcel_id}")
def get_map_parcel(request: Request, parcel_id: str) -> dict[str, Any]:
    feature = map_parcel_feature(_db(request), parcel_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Parcel location not found")
    return feature


@router.get("/valuation/config")
def get_valuation_map_config(request: Request) -> dict[str, Any]:
    return map_valuation_config(_db(request))


@router.get("/valuation/parcels")
def get_valuation_map_parcels(
    request: Request,
    west: float = Query(..., description="Bounding box west longitude"),
    south: float = Query(..., description="Bounding box south latitude"),
    east: float = Query(..., description="Bounding box east longitude"),
    north: float = Query(..., description="Bounding box north latitude"),
    zoom: float | None = Query(None, ge=0, le=22, description="Map zoom for adaptive sampling"),
    limit: int | None = Query(None, ge=1, le=25000),
) -> dict[str, Any]:
    return map_valuation_parcels_geojson(
        _db(request),
        west=west,
        south=south,
        east=east,
        north=north,
        limit=limit,
        zoom=zoom,
    )


@router.get("/valuation/hexbins")
def get_valuation_map_hexbins(
    request: Request,
    hex_size_deg: float = Query(0.006, ge=0.0025, le=0.03),
    min_count: int = Query(10, ge=1, le=500),
) -> dict[str, Any]:
    return map_valuation_hexbins_geojson(
        _db(request),
        hex_size_deg=hex_size_deg,
        min_count=min_count,
    )


@router.get("/valuation/parcels/{parcel_id}")
def get_valuation_map_parcel(request: Request, parcel_id: str) -> dict[str, Any]:
    feature = map_valuation_parcel_feature(_db(request), parcel_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Parcel location not found")
    return feature


@router.get("/tax/config")
def get_tax_map_config(request: Request) -> dict[str, Any]:
    return map_tax_config(_db(request))


@router.get("/tax/parcels")
def get_tax_map_parcels(
    request: Request,
    west: float = Query(..., description="Bounding box west longitude"),
    south: float = Query(..., description="Bounding box south latitude"),
    east: float = Query(..., description="Bounding box east longitude"),
    north: float = Query(..., description="Bounding box north latitude"),
    zoom: float | None = Query(None, ge=0, le=22, description="Map zoom for adaptive sampling"),
    limit: int | None = Query(None, ge=1, le=25000),
) -> dict[str, Any]:
    return map_tax_parcels_geojson(
        _db(request),
        west=west,
        south=south,
        east=east,
        north=north,
        limit=limit,
        zoom=zoom,
    )


@router.get("/tax/hexbins")
def get_tax_map_hexbins(
    request: Request,
    hex_size_deg: float = Query(0.006, ge=0.0025, le=0.03),
    min_count: int = Query(10, ge=1, le=500),
) -> dict[str, Any]:
    return map_tax_hexbins_geojson(
        _db(request),
        hex_size_deg=hex_size_deg,
        min_count=min_count,
    )


@router.get("/tax/parcels/{parcel_id}")
def get_tax_map_parcel(request: Request, parcel_id: str) -> dict[str, Any]:
    feature = map_tax_parcel_feature(_db(request), parcel_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Parcel location not found")
    return feature


@router.get("/tiles/parcels.pmtiles")
def get_pmtiles() -> FileResponse:
    if not PMTILES_PATH.is_file():
        raise HTTPException(status_code=404, detail="Map tiles not available")
    return FileResponse(
        path=Path(PMTILES_PATH),
        media_type="application/vnd.pmtiles",
        filename="parcels.pmtiles",
    )
