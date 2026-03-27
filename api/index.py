import os
import httpx
import asyncio
import datetime
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co"
SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu"
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=representation"}

# 💡 Vercel 환경 전용 자동 경로 탐색 (최상위 폴더, api 폴더 모두 뒤짐)
API_DIR = os.path.dirname(os.path.abspath(__file__))    # /var/task/api
ROOT_DIR = os.path.dirname(API_DIR)                     # /var/task (최상위 루트)

def get_file_path(filename):
    # 1. 루트 폴더 확인 (현재 조님의 폴더 구조)
    if os.path.exists(os.path.join(ROOT_DIR, filename)): return os.path.join(ROOT_DIR, filename)
    # 2. api 폴더 안쪽 확인
    if os.path.exists(os.path.join(API_DIR, filename)): return os.path.join(API_DIR, filename)
    # 3. public 폴더 확인
    if os.path.exists(os.path.join(ROOT_DIR, "public", filename)): return os.path.join(ROOT_DIR, "public", filename)
    return None

@app.middleware("http")
async def add_cache_control_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

# 💡 파일 제공 라우터
@app.get("/")
@app.get("/api")
@app.get("/api/")
async def serve_ui():
    path = get_file_path("index.html")
    return FileResponse(path) if path else HTMLResponse(f"<h1>HTML 낫파운드 (탐색 경로: {ROOT_DIR})</h1>", status_code=404)

@app.get("/script.js")
async def serve_script():
    path = get_file_path("script.js")
    return FileResponse(path) if path else HTMLResponse("JS 낫파운드", status_code=404)

@app.get("/logo.jpg")
async def serve_logo():
    path = get_file_path("logo.jpg")
    return FileResponse(path) if path else HTMLResponse("Logo 낫파운드", status_code=404)

# --- Pydantic 데이터 모델 ---
class InboundData(BaseModel): location_id: str; category: str; item_name: str; quantity: int; pallet_count: float = 1.0; production_date: Optional[str] = None; remarks: Optional[str] = ""
class OutboundData(BaseModel): inventory_id: str; location_id: str; item_name: str; quantity: int; pallet_count: float = 1.0
class ProductData(BaseModel): category: str; item_name: str; supplier: str = "기본입고처"; daily_usage: int = 0; unit_price: int = 0; pallet_ea: int = 1
class TransferData(BaseModel): inventory_id: str; from_location: str; to_location: str; item_name: str; quantity: int; pallet_count: float = 1.0
class EditInventoryData(BaseModel): inventory_id: str; location_id: str; item_name: str; action: str; new_quantity: Optional[int] = None; new_date: Optional[str] = None; pallet_count: Optional[float] = None
class OrderCreateData(BaseModel): item_name: str; quantity: int; pallet_count: float; supplier: str

# --- DB 통신 공통 함수 ---
async def fetch_get(endpoint):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/{endpoint}", headers=HEADERS)
        return r.json() if r.status_code == 200 else []
        
async def fetch_delete(endpoint):
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/{endpoint}", headers=HEADERS)
        return {"status": "success"}

# --- API 라우터 ---
@app.get("/api/products")
async def get_products(): return await fetch_get("products?select=*")

@app.get("/api/finished_products")
async def get_finished_products(): return await fetch_get("finished_products?select=*")

@app.get("/api/bom")
async def get_bom(): return await fetch_get("bom_master?select=*")

@app.get("/api/inventory")
async def get_inventory(): return await fetch_get("inventory_v2?select=*")

@app.get("/api/history")
async def get_history(): return await fetch_get("history_log?select=*")

@app.post("/api/bom")
async def add_bom(data: dict):
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{SUPABASE_URL}/rest/v1/bom_master", json=data, headers=HEADERS)
        return {"status": "success"} if res.status_code in [200, 201, 204] else {"status": "error"}

@app.delete("/api/bom")
async def delete_bom(id: str): return await fetch_delete(f"bom_master?id=eq.{id}")

@app.post("/api/products")
async def add_product(data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{SUPABASE_URL}/rest/v1/products", json=data.dict(), headers=HEADERS)
        return {"status": "success"} if res.status_code in [200, 201, 204] else {"status": "error"}

@app.put("/api/products")
async def update_product(old_name: str, old_supplier: str, data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.patch(f"{SUPABASE_URL}/rest/v1/products?item_name=eq.{old_name}&supplier=eq.{old_supplier}", json=data.dict(), headers=HEADERS)
        return {"status": "success"} if res.status_code in [200, 201, 204] else {"status": "error"}

@app.delete("/api/products")
async def delete_product(item_name: str, supplier: str): return await fetch_delete(f"products?item_name=eq.{item_name}&supplier=eq.{supplier}")

@app.post("/api/finished_products")
async def add_finished_product(data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{SUPABASE_URL}/rest/v1/finished_products", json=data.dict(), headers=HEADERS)
        return {"status": "success"} if res.status_code in [200, 201, 204] else {"status": "error"}

@app.put("/api/finished_products")
async def update_finished_product(old_name: str, old_supplier: str, data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.patch(f"{SUPABASE_URL}/rest/v1/finished_products?item_name=eq.{old_name}&supplier=eq.{old_supplier}", json=data.dict(), headers=HEADERS)
        return {"status": "success"} if res.status_code in [200, 201, 204] else {"status": "error"}

@app.delete("/api/finished_products")
async def delete_finished_product(item_name: str, supplier: str): return await fetch_delete(f"finished_products?item_name=eq.{item_name}&supplier=eq.{supplier}")

@app.post("/api/inbound")
async def inbound_stock(data: InboundData):
    async with httpx.AsyncClient() as client:
        p_date = data.production_date if data.production_date else datetime.datetime.now().strftime('%Y-%m-%d')
        inv_payload = {"location_id": data.location_id, "category": data.category, "item_name": data.item_name, "quantity": data.quantity, "pallet_count": data.pallet_count, "production_date": p_date, "remarks": data.remarks}
        await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=inv_payload, headers=HEADERS)
        log_payload = {"location_id": data.location_id, "action_type": "입고", "item_name": data.item_name, "quantity": data.quantity, "pallet_count": data.pallet_count, "remarks": data.remarks, "payment_status": "미지급", "production_date": p_date, "created_at": f"{p_date}T00:00:00Z"}
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=log_payload, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/outbound")
async def outbound_stock(data: OutboundData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json()
        if not inv: return {"status": "error"}
        current_qty = inv[0]['quantity']; current_pallet = inv[0].get('pallet_count', 1.0)
        if data.quantity >= current_qty: await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        else: await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity, "pallet_count": current_pallet - data.pallet_count}, headers=HEADERS)
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "출고", "item_name": data.item_name, "quantity": data.quantity, "pallet_count": data.pallet_count}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/transfer")
async def transfer_stock(data: TransferData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json()
        if not inv: return {"status": "error"}
        item_data = inv[0]; current_qty = item_data['quantity']; current_pallet = item_data.get('pallet_count', 1.0)
        to_loc = data.to_location.upper()
        if not to_loc.startswith("FL-") and not to_loc.startswith("R-") and not to_loc.startswith("C-") and not to_loc.startswith("W-"):
            to_loc = ("C-" if "C-" in data.from_location else "R-") + to_loc
        
        if data.quantity >= current_qty: await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"location_id": to_loc}, headers=HEADERS)
        else:
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity, "pallet_count": current_pallet - data.pallet_count}, headers=HEADERS)
            new_row = item_data.copy()
            for k in ['id', 'created_at']: new_row.pop(k, None)
            new_row.update({"location_id": to_loc, "quantity": data.quantity, "pallet_count": data.pallet_count})
            await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=new_row, headers=HEADERS)
                
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": to_loc, "action_type": "이동", "item_name": data.item_name, "quantity": data.quantity, "remarks": f"From {data.from_location}", "pallet_count": data.pallet_count}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/inventory_edit")
async def edit_inventory_item(data: EditInventoryData):
    async with httpx.AsyncClient() as client:
        if data.action == "DELETE":
            await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
            await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "삭제(취소)", "item_name": data.item_name, "quantity": 0, "remarks": "오입력 삭제"}, headers=HEADERS)
        elif data.action == "UPDATE_QTY":
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": data.new_quantity, "pallet_count": data.pallet_count}, headers=HEADERS)
        elif data.action == "UPDATE_DATE":
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"production_date": data.new_date}, headers=HEADERS)
    return {"status": "success"}

@app.post("/api/orders_create")
async def create_orders(items: List[OrderCreateData]):
    today = datetime.datetime.now().strftime('%Y-%m-%d')
    payloads = [{"location_id": "발주대기", "action_type": "발주중", "item_name": it.item_name, "quantity": it.quantity, "pallet_count": it.pallet_count, "remarks": it.supplier, "payment_status": "미지급", "production_date": today, "created_at": f"{today}T00:00:00Z"} for it in items]
    async with httpx.AsyncClient() as client:
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=payloads, headers=HEADERS)
    return {"status": "success"}

@app.delete("/api/history/{log_id}")
async def delete_history_log(log_id: str): return await fetch_delete(f"history_log?id=eq.{log_id}")

@app.post("/api/close_inventory")
async def close_inventory():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?select=*", headers=HEADERS)
        inv_list = r.json() if r.status_code == 200 else []
        async def patch_item(item):
            remarks = item.get('remarks', '') or ''
            if '[기존재고]' not in remarks:
                await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{item['id']}", json={"remarks": f"{remarks} [기존재고]".strip()}, headers=HEADERS)
        await asyncio.gather(*(patch_item(item) for item in inv_list))
        return {"status": "success"}
