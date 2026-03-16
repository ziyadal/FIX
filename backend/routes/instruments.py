"""Instrument search and listing endpoints."""
from __future__ import annotations
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api", tags=["instruments"])

_fix_client = None

def init_router(fix_client) -> None:
    global _fix_client
    _fix_client = fix_client

@router.get("/instruments")
async def get_instruments():
    await _fix_client.request_instrument_list()
    return {"instruments": _fix_client.instruments}

@router.get("/instruments/search")
async def search_instruments(q: str = Query(default="")):
    instruments = _fix_client.instruments
    if q:
        q_upper = q.upper()
        instruments = [i for i in instruments if q_upper in i.get("symbol", "").upper()]
    return {"instruments": instruments}
