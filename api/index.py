import os
import httpx
import asyncio
import datetime
import io
import urllib.parse
import xlrd
from xlutils.copy import copy
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Any

app = FastAPI()

SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co"
SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu"
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=representation"}

API_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(API_DIR)

@app.middleware("http")
async def add_cache_control_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

# ==== 화면 및 파일 제공 ====
@app.get("/")
@app.get("/api")
@app.get("/api/")
async def serve_ui():
    path = os.path.join(ROOT_DIR, "index.html")
    if os.path.exists(path):
        return FileResponse(path)
    return HTMLResponse(f"<h1>HTML 파일을 찾을 수 없습니다. (경로: {path})</h1>", status_code=404)

@app.get("/{file_name}.js")
@app.get("/api/{file_name}.js")
async def serve_js(file_name: str):
    path = os.path.join(ROOT_DIR, f"{file_name}.js")
    if os.path.exists(path):
        return FileResponse(path)
    return HTMLResponse(f"{file_name}.js Not Found", status_code=404)

@app.get("/logo.jpg")
@app.get("/api/logo.jpg")
async def serve_logo():
    path = os.path.join(ROOT_DIR, "logo.jpg")
    if os.path.exists(path):
        return FileResponse(path)
    return HTMLResponse("Logo Not Found", status_code=404)

# ==== 데이터 모델 정의 ====
class InboundData(BaseModel): location_id: str; category: str; item_name: str; quantity: int; pallet_count: float = 1.0; production_date: Optional[str] = None; remarks: Optional[str] = ""
class OutboundData(BaseModel): inventory_id: str; location_id: str; item_name: str; quantity: int; pallet_count: float = 1.0
class ProductData(BaseModel): category: str; item_name: str; supplier: str = "기본입고처"; daily_usage: int = 0; unit_price: int = 0; pallet_ea: int = 1
class TransferData(BaseModel): inventory_id: str; from_location: str; to_location: str; item_name: str; quantity: int; pallet_count: float = 1.0
class EditInventoryData(BaseModel): inventory_id: str; location_id: str; item_name: str; action: str; new_quantity: Optional[int] = None; new_date: Optional[str] = None; pallet_count: Optional[float] = None

# ==== 헬퍼 함수 ====
async def fetch_get(endpoint):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/{endpoint}", headers=HEADERS)
        return r.json() if r.status_code == 200 else []
        
async def fetch_delete(endpoint):
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/{endpoint}", headers=HEADERS)
        return {"status": "success"}

# ==== 데이터 조회 API ====
@app.get("/api/products")
async def get_products(): return await fetch_get("products?select=*")
@app.get("/api/finished_products")
async def get_finished_products(): return await fetch_get("finished_products?select=*")
@app.get("/api/bom")
async def get_bom(): return await fetch_get("bom_master?select=*")
@app.get("/api/inventory")
async def get_inventory(): return await fetch_get("inventory_v2?select=*")
@app.get("/api/history")
async def get_history():
    async with httpx.AsyncClient() as client:
        # 💡 limit=5000 을 강제로 붙여서 며칠 전 데이터가 짤리는 현상 완벽 차단!
        res = await client.get(f"{SUPABASE_URL}/rest/v1/history_log?select=*&order=created_at.desc&limit=5000", headers=HEADERS)
        return res.json()

# ==== BOM 및 품목 마스터 ====
@app.post("/api/bom")
async def add_bom(data: dict):
    async with httpx.AsyncClient() as client:
        await client.post(f"{SUPABASE_URL}/rest/v1/bom_master", json=data, headers=HEADERS)
        return {"status": "success"}

@app.delete("/api/bom")
async def delete_bom(id: str): return await fetch_delete(f"bom_master?id=eq.{id}")

@app.post("/api/products")
async def add_product(data: ProductData):
    async with httpx.AsyncClient() as client:
        await client.post(f"{SUPABASE_URL}/rest/v1/products", json=data.dict(), headers=HEADERS)
        return {"status": "success"}

@app.put("/api/products")
async def update_product(old_name: str, old_supplier: str, data: ProductData):
    async with httpx.AsyncClient() as client:
        await client.patch(f"{SUPABASE_URL}/rest/v1/products?item_name=eq.{old_name}&supplier=eq.{old_supplier}", json=data.dict(), headers=HEADERS)
        return {"status": "success"}

@app.delete("/api/products")
async def delete_product(item_name: str, supplier: str): return await fetch_delete(f"products?item_name=eq.{item_name}&supplier=eq.{supplier}")

@app.post("/api/finished_products")
async def add_finished_product(data: ProductData):
    async with httpx.AsyncClient() as client:
        await client.post(f"{SUPABASE_URL}/rest/v1/finished_products", json=data.dict(), headers=HEADERS)
        return {"status": "success"}

@app.put("/api/finished_products")
async def update_finished_product(old_name: str, old_supplier: str, data: ProductData):
    async with httpx.AsyncClient() as client:
        await client.patch(f"{SUPABASE_URL}/rest/v1/finished_products?item_name=eq.{old_name}&supplier=eq.{old_supplier}", json=data.dict(), headers=HEADERS)
        return {"status": "success"}

@app.delete("/api/finished_products")
async def delete_finished_product(item_name: str, supplier: str): return await fetch_delete(f"finished_products?item_name=eq.{item_name}&supplier=eq.{supplier}")

# ==== 입/출고/이동 ====
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
        
        current_qty = inv[0]['quantity']
        current_pallet = inv[0].get('pallet_count', 1.0)
        
        if data.quantity >= current_qty: 
            await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        else: 
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity, "pallet_count": current_pallet - data.pallet_count}, headers=HEADERS)
            
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "출고", "item_name": data.item_name, "quantity": data.quantity, "pallet_count": data.pallet_count}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/transfer")
async def transfer_stock(data: TransferData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json()
        if not inv: return {"status": "error"}
        
        item_data = inv[0]
        current_qty = item_data['quantity']
        current_pallet = item_data.get('pallet_count', 1.0)
        
        to_loc = data.to_location.upper()
        if not to_loc.startswith("FL-") and not to_loc.startswith("R-") and not to_loc.startswith("C-") and not to_loc.startswith("W-"):
            to_loc = ("C-" if "C-" in data.from_location else "R-") + to_loc
        
        if data.quantity >= current_qty: 
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"location_id": to_loc}, headers=HEADERS)
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
async def create_orders(request: Request): 
    try:
        items = await request.json()
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        payloads = []
        
        for it in items:
            p_date = it.get('production_date') or it.get('expected_date') or today
            
            payloads.append({
                "location_id": "발주대기", 
                "action_type": "발주중", 
                "item_name": it.get('item_name', '알수없음'), 
                "quantity": int(it.get('quantity', 0)), 
                "pallet_count": float(it.get('pallet_count', 1.0)), 
                "remarks": it.get('supplier', ''), 
                "payment_status": "미지급",                  
                "production_date": p_date,
                "created_at": f"{today}T00:00:00Z"            
            })
        
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=payloads, headers=HEADERS)
            
            if res.status_code >= 400:
                print("DB Insert Error:", res.text)
                return {"status": "error", "message": f"DB Error: {res.text}"}
                
        return {"status": "success"}
    except Exception as e:
        print("발주 에러:", str(e))
        return {"status": "error", "message": str(e)}

@app.delete("/api/history/{log_id}")
async def delete_history_log(log_id: str): 
    return await fetch_delete(f"history_log?id=eq.{log_id}")

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

@app.post("/api/history_update_date")
async def update_history_date(data: dict):
    log_id = data.get('id')
    expected_date = data.get('expected_date')
    
    if not log_id or not expected_date:
        return {"status": "error", "message": "ID or date is missing"}
        
    async with httpx.AsyncClient() as client:
        response = await client.patch(
            f"{SUPABASE_URL}/rest/v1/history_log?id=eq.{log_id}", 
            json={"production_date": expected_date}, 
            headers=HEADERS
        )
        if response.status_code in [200, 204]:
            return {"status": "success"}
        else:
            return {"status": "error", "message": f"Supabase error: {response.text}"}

@app.post("/api/history_update")
async def history_update(request: Request):
    try:
        data = await request.json()
        async with httpx.AsyncClient() as client:
            for item in data:
                update_payload = {
                    "acc_status": item.get('acc_status'),
                    "acc_qty": item.get('acc_qty'),
                    "acc_price": item.get('acc_price'),
                    "acc_adj": item.get('acc_adj'),
                    "item_name": item.get('item_name'),
                    "production_date": item.get('production_date')
                }
                update_payload = {k: v for k, v in update_payload.items() if v is not None}
                
                await client.patch(
                    f"{SUPABASE_URL}/rest/v1/history_log?id=eq.{item['id']}",
                    json=update_payload,
                    headers=HEADERS
                )
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# =======================================================
# 💡 핵심 추가: 롯데 엑셀 서식 유지 & A1 삭제 후 다운로드 API
# =======================================================
@app.post("/api/convert_lotte_excel")
async def convert_lotte_excel(file: UploadFile = File(...)):
    try:
        # 1. 엑셀 원본 읽기 (formatting_info=True로 껍데기 서식 100% 보존!)
        contents = await file.read()
        rb = xlrd.open_workbook(file_contents=contents, formatting_info=True)
        
        # 2. 파일 복사 및 수정
        wb = copy(rb)
        ws = wb.get_sheet(0)
        
        # 3. A1 셀(0,0) 데이터만 삭제 (테두리, 색상은 유지됨)
        ws.write(0, 0, "")
        
        # 4. 시트 이름을 'rbf'로 강제 변경
        wb.set_name(0, 'rbf')
        
        # 5. 메모리 버퍼에 저장 (구형 .xls 형식)
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        # 파일명 인코딩 (한글 깨짐 방지)
        original_name = file.filename.rsplit('.', 1)[0]
        new_filename = f"[롯데_업로드용]_{original_name}.xls"
        encoded_filename = urllib.parse.quote(new_filename)
        
        return StreamingResponse(
            output, 
            media_type="application/vnd.ms-excel",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )
    except Exception as e:
        print("엑셀 변환 오류:", str(e))
        return {"error": str(e)}
