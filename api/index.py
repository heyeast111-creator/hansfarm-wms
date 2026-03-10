import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI()

# 🔑 조님의 Supabase 정보 반영 완료!
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

# Vercel 환경에서 경로를 더 잘 찾도록 수정된 로직
@app.get("/")
async def serve_ui():
    # 현재 파일(index.py) 위치에서 한 단계 위로 올라가서 public/index.html 찾기
    base_path = os.path.dirname(os.path.dirname(__file__))
    ui_path = os.path.join(base_path, "public", "index.html")
    
    if os.path.exists(ui_path):
        return FileResponse(ui_path)
    return {"message": f"index.html을 찾을 수 없습니다! (경로: {ui_path})"}

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
