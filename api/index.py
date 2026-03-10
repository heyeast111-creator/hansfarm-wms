import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

# 🔑 조님의 실시간 정보 반영
SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co"
SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

class InventoryMove(BaseModel):
    from_loc: str
    to_loc: str
    item: str

@app.get("/api/layout")
async def get_layout():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/locations?select=*&order=display_order", headers=HEADERS)
        return {"cells": r.json() if r.status_code == 200 else []}

@app.get("/api/occupancy")
async def get_occupancy():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

@app.post("/api/move")
async def move_stock(data: InventoryMove):
    async with httpx.AsyncClient() as client:
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/inventory?location_id=eq.{data.from_loc}&item_name=eq.{data.item}",
            json={"location_id": data.to_loc},
            headers=HEADERS
        )
        return {"status": "success"}
