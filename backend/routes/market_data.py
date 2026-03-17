"""Market data subscribe/unsubscribe and status endpoints."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["market_data"])

_fix_client = None

def init_router(fix_client) -> None:
    global _fix_client
    _fix_client = fix_client

class SubscribeRequest(BaseModel):
    symbol: str
    depth: int = 10

class UnsubscribeRequest(BaseModel):
    symbol: str

@router.post("/subscribe")
async def subscribe(req: SubscribeRequest):
    try:
        req_id = await _fix_client.subscribe(req.symbol, req.depth)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="FIX session not connected")
    return {"status": "subscribed", "symbol": req.symbol, "req_id": req_id}

@router.post("/unsubscribe")
async def unsubscribe(req: UnsubscribeRequest):
    try:
        await _fix_client.unsubscribe(req.symbol)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="FIX session not connected")
    return {"status": "unsubscribed", "symbol": req.symbol}

@router.get("/status")
async def get_status():
    return {
        "state": _fix_client.state if hasattr(_fix_client.state, 'value') else _fix_client.state,
        "subscriptions": list(_fix_client.subscriptions.keys()),
        "maintenance_warning": _fix_client.maintenance_warning,
    }

@router.get("/limits")
async def get_limits():
    await _fix_client.request_limits()
    return {"status": "limit_query_sent"}
