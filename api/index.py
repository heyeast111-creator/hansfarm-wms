import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI()

# 🚨 주의: 아래 두 줄의 내용을 본인의 Supabase 정보로 꼭 변경하셔야 합니다!
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

# 로컬에서 브라우저 접속 시 UI 화면을 보여주는 라우터
@app.get("/")
async def serve_ui():
    ui_path = os.path.join("public", "ui.html")
    if os.path.exists(ui_path):
        return FileResponse(ui_path)
    return {"message": "public/ui.html 파일을 찾을 수 없습니다."}

@app.get("/api/layout")
async def get_layout():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/locations?select=*&order=display_order", headers=HEADERS)
        if r.status_code != 200:
            return {"cells": []}
        return {"cells": r.json()}

@app.get("/api/occupancy")
async def get_occupancy():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory?select=*", headers=HEADERS)
        if r.status_code != 200:
            return []
        return r.json()

@app.post("/api/move")
async def move_stock(data: InventoryMove):
    async with httpx.AsyncClient() as client:
        r = await client.patch(
            f"{SUPABASE_URL}/rest/v1/inventory?location_id=eq.{data.from_loc}&item_name=eq.{data.item}",
            json={"location_id": data.to_loc},
            headers=HEADERS
        )
        return {"status": "success"}

