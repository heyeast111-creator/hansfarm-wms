import os
import httpx
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import datetime

app = FastAPI()

@app.middleware("http")
async def add_cache_control_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co"
SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu"
HEADERS = {
    "apikey": SUPABASE_KEY, 
    "Authorization": f"Bearer {SUPABASE_KEY}", 
    "Content-Type": "application/json", 
    "Prefer": "return=representation"
}

class InboundData(BaseModel): location_id: str; category: str; item_name: str; quantity: int; pallet_count: float = 1.0; production_date: Optional[str] = None; remarks: Optional[str] = ""
class OutboundData(BaseModel): inventory_id: str; location_id: str; item_name: str; quantity: int; pallet_count: float = 1.0
class ProductData(BaseModel): category: str; item_name: str; supplier: str = "기본입고처"; daily_usage: int = 0; unit_price: int = 0; pallet_ea: int = 1
class TransferData(BaseModel): inventory_id: str; from_location: str; to_location: str; item_name: str; quantity: int; pallet_count: float = 1.0
class AdjustData(BaseModel): inventory_id: str; location_id: str; item_name: str; new_quantity: int
class PaymentUpdate(BaseModel): payment_status: str
class BomData(BaseModel): finished_product: str; material_product: str; require_qty: float
class EditInventoryData(BaseModel): inventory_id: str; location_id: str; item_name: str; action: str; new_quantity: Optional[int] = None; new_date: Optional[str] = None; pallet_count: Optional[float] = None
class OrderCreateData(BaseModel): item_name: str; quantity: int; pallet_count: float; supplier: str

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

@app.get("/")
@app.get("/api")
@app.get("/api/")
@app.get("/api/index")
async def serve_ui():
    html_path = os.path.join(CURRENT_DIR, "index.html")
    if os.path.exists(html_path): return FileResponse(html_path)
    return HTMLResponse(content="<h1>HTML 파일을 찾을 수 없습니다. api 폴더 안에 index.html 파일이 있는지 확인해주세요.</h1>", status_code=404)

@app.get("/script.js")
async def serve_script():
    script_path = os.path.join(CURRENT_DIR, "script.js")
    if os.path.exists(script_path): return FileResponse(script_path)
    return HTMLResponse(content="JS Not Found", status_code=404)

@app.get("/logo.jpg")
async def serve_logo():
    logo_path = os.path.join(CURRENT_DIR, "logo.jpg")
    if os.path.exists(logo_path): return FileResponse(logo_path)
    return {"error": "Logo not found."}

@app.get("/api/products")
async def get_products():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/products?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

@app.get("/api/finished_products")
async def get_finished_products():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/finished_products?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

@app.get("/api/bom")
async def get_bom():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/bom_master?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

@app.post("/api/bom")
async def add_bom(data: dict):
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{SUPABASE_URL}/rest/v1/bom_master", json=data, headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error", "message": res.text}

@app.post("/api/bom_batch")
async def bom_batch(rows: List[dict]):
    async with httpx.AsyncClient() as client:
        payloads_dict = {}
        for r in rows:
            fin = str(r.get("완제품명", "")).strip(); mat = str(r.get("부자재명", "")).strip()
            if not fin or not mat: continue
            try: qty = float(str(r.get("소요수량(EA)", "0")).replace(',', ''))
            except Exception: qty = 0
            if qty <= 0: continue
            payloads_dict[(fin, mat)] = {"finished_product": fin, "material_product": mat, "require_qty": qty}
        payloads = list(payloads_dict.values())
        if payloads:
            headers = HEADERS.copy(); headers["Prefer"] = "resolution=merge-duplicates"
            res = await client.post(f"{SUPABASE_URL}/rest/v1/bom_master?on_conflict=finished_product,material_product", json=payloads, headers=headers)
            if res.status_code not in [200, 201, 204]: return {"status": "error", "message": res.text}
        return {"status": "success"}

@app.delete("/api/bom")
async def delete_bom(id: str):
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/bom_master?id=eq.{id}", headers=HEADERS)
        return {"status": "success"}

@app.delete("/api/bom_all")
async def delete_all_bom():
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/bom_master?id=not.is.null", headers=HEADERS)
        return {"status": "success"}

@app.post("/api/products")
async def add_product(data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{SUPABASE_URL}/rest/v1/products", json={"category": data.category, "item_name": data.item_name, "supplier": data.supplier, "daily_usage": data.daily_usage, "unit_price": data.unit_price, "pallet_ea": data.pallet_ea}, headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error", "message": res.text}

@app.put("/api/products")
async def update_product(old_name: str, old_supplier: str, data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.patch(f"{SUPABASE_URL}/rest/v1/products?item_name=eq.{old_name}&supplier=eq.{old_supplier}", json={"category": data.category, "item_name": data.item_name, "supplier": data.supplier, "daily_usage": data.daily_usage, "unit_price": data.unit_price, "pallet_ea": data.pallet_ea}, headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error", "message": res.text}

@app.post("/api/products_batch")
async def products_batch(rows: List[dict]):
    async with httpx.AsyncClient() as client:
        payloads_dict = {}
        for r in rows:
            name = str(r.get("품목명", "")).strip()
            if not name: continue
            try: usage = int(float(str(r.get("일간소모량(EA)", "0")).replace(',', '')))
            except Exception: usage = 0
            try: price = int(float(str(r.get("단가(비용)", "0")).replace(',', '')))
            except Exception: price = 0
            try: ea = int(float(str(r.get("1P기준수량(EA)", "1")).replace(',', '')))
            except Exception: ea = 1
            if ea <= 0: ea = 1 
            supplier = str(r.get("입고처(공급사)", "")).strip()
            if not supplier: supplier = "기본입고처"
            category = str(r.get("카테고리", "미분류")).strip()
            payloads_dict[(name, supplier)] = { "category": category, "item_name": name, "supplier": supplier, "daily_usage": usage, "unit_price": price, "pallet_ea": ea }
        payloads = list(payloads_dict.values())
        if payloads:
            headers = HEADERS.copy(); headers["Prefer"] = "resolution=merge-duplicates" 
            res = await client.post(f"{SUPABASE_URL}/rest/v1/products?on_conflict=item_name,supplier", json=payloads, headers=headers)
            if res.status_code not in [200, 201, 204]: return {"status": "error", "message": res.text}
        return {"status": "success"}

@app.delete("/api/products")
async def delete_product(item_name: str, supplier: str):
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/products?item_name=eq.{item_name}&supplier=eq.{supplier}", headers=HEADERS)
        return {"status": "success"}

@app.delete("/api/products_all")
async def delete_all_products():
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/products?id=not.is.null", headers=HEADERS)
        return {"status": "success"}

@app.post("/api/finished_products")
async def add_finished_product(data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{SUPABASE_URL}/rest/v1/finished_products", json={"category": data.category, "item_name": data.item_name, "supplier": data.supplier, "daily_usage": data.daily_usage, "unit_price": data.unit_price, "pallet_ea": data.pallet_ea}, headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error", "message": res.text}

@app.put("/api/finished_products")
async def update_finished_product(old_name: str, old_supplier: str, data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.patch(f"{SUPABASE_URL}/rest/v1/finished_products?item_name=eq.{old_name}&supplier=eq.{old_supplier}", json={"category": data.category, "item_name": data.item_name, "supplier": data.supplier, "daily_usage": data.daily_usage, "unit_price": data.unit_price, "pallet_ea": data.pallet_ea}, headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error", "message": res.text}

@app.post("/api/finished_products_batch")
async def finished_products_batch(rows: List[dict]):
    async with httpx.AsyncClient() as client:
        payloads_dict = {}
        for r in rows:
            name = str(r.get("품목명", "")).strip()
            if not name: continue
            try: usage = int(float(str(r.get("일간출고량(EA)", str(r.get("일간소모량(EA)", "0")))).replace(',', '')))
            except Exception: usage = 0
            try: price = int(float(str(r.get("단가(매출)", str(r.get("단가(비용)", "0")))).replace(',', '')))
            except Exception: price = 0
            try: ea = int(float(str(r.get("1P기준수량(EA)", "1")).replace(',', '')))
            except Exception: ea = 1
            if ea <= 0: ea = 1 
            supplier = str(r.get("생산처(비고)", str(r.get("입고처(공급사)", "")))).strip()
            if not supplier: supplier = "자체생산"
            category = str(r.get("카테고리", "완제품")).strip()
            payloads_dict[(name, supplier)] = { "category": category, "item_name": name, "supplier": supplier, "daily_usage": usage, "unit_price": price, "pallet_ea": ea }
        payloads = list(payloads_dict.values())
        if payloads:
            headers = HEADERS.copy(); headers["Prefer"] = "resolution=merge-duplicates" 
            res = await client.post(f"{SUPABASE_URL}/rest/v1/finished_products?on_conflict=item_name,supplier", json=payloads, headers=headers)
            if res.status_code not in [200, 201, 204]: return {"status": "error", "message": res.text}
        return {"status": "success"}

@app.delete("/api/finished_products")
async def delete_finished_product(item_name: str, supplier: str):
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/finished_products?item_name=eq.{item_name}&supplier=eq.{supplier}", headers=HEADERS)
        return {"status": "success"}

@app.delete("/api/finished_products_all")
async def delete_all_finished_products():
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/finished_products?id=not.is.null", headers=HEADERS)
        return {"status": "success"}

@app.get("/api/inventory")
async def get_inventory():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

@app.get("/api/history")
async def get_history():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/history_log?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

@app.post("/api/inbound")
async def inbound_stock(data: InboundData):
    import datetime
    async with httpx.AsyncClient() as client:
        p_date = data.production_date if data.production_date else datetime.datetime.now().strftime('%Y-%m-%d')
        inv_payload = {"location_id": data.location_id, "category": data.category, "item_name": data.item_name, "quantity": data.quantity, "pallet_count": data.pallet_count, "production_date": p_date, "remarks": data.remarks}
        res1 = await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=inv_payload, headers=HEADERS)
        if res1.status_code not in [200, 201, 204]: return {"status": "error", "message": f"DB 에러: {res1.text}"}
        
        log_payload = {"location_id": data.location_id, "action_type": "입고", "item_name": data.item_name, "quantity": data.quantity, "pallet_count": data.pallet_count, "remarks": data.remarks, "payment_status": "미지급", "production_date": p_date, "created_at": f"{p_date}T00:00:00Z"}
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=log_payload, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/outbound")
async def outbound_stock(data: OutboundData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json()
        current_qty = inv[0]['quantity']; current_pallet = inv[0].get('pallet_count', 1.0)
        
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
        
        item_data = inv[0]; current_qty = item_data['quantity']; current_pallet = item_data.get('pallet_count', 1.0)
        to_loc = data.to_location.upper()
        if not to_loc.startswith("FL-") and not to_loc.startswith("R-") and not to_loc.startswith("C-") and not to_loc.startswith("W-"):
            if "C-" in data.from_location: to_loc = "C-" + to_loc
            else: to_loc = "R-" + to_loc

        sup = item_data.get('remarks', '')
        if sup is None: sup = ''
            
        r_dest = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?location_id=eq.{to_loc}&item_name=eq.{data.item_name}", headers=HEADERS)
        dest_inv = r_dest.json()
        
        target_dest = None
        for d in dest_inv:
            d_sup = d.get('remarks', '')
            if d_sup is None: d_sup = ''
            if d_sup == sup: target_dest = d; break

        if target_dest and target_dest['id'] != data.inventory_id:
            dest_id = target_dest['id']
            new_dest_qty = target_dest['quantity'] + data.quantity
            new_dest_pallet = target_dest.get('pallet_count', 0.0) + data.pallet_count
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{dest_id}", json={"quantity": new_dest_qty, "pallet_count": new_dest_pallet}, headers=HEADERS)
            
            if data.quantity >= current_qty: await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
            else: await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity, "pallet_count": current_pallet - data.pallet_count}, headers=HEADERS)
        else:
            if data.quantity >= current_qty: await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"location_id": to_loc}, headers=HEADERS)
            else:
                await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity, "pallet_count": current_pallet - data.pallet_count}, headers=HEADERS)
                new_row = item_data.copy()
                if 'id' in new_row: del new_row['id']
                if 'created_at' in new_row: del new_row['created_at']
                new_row['location_id'] = to_loc; new_row['quantity'] = data.quantity; new_row['pallet_count'] = data.pallet_count
                await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=new_row, headers=HEADERS)
                
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": to_loc, "action_type": "이동", "item_name": data.item_name, "quantity": data.quantity, "remarks": f"From {data.from_location}", "pallet_count": data.pallet_count}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/inventory_edit")
async def edit_inventory_item(data: EditInventoryData):
    async with httpx.AsyncClient() as client:
        if data.action == "DELETE":
            await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
            await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "삭제(취소)", "item_name": data.item_name, "quantity": 0, "remarks": "오입력 재고 삭제"}, headers=HEADERS)
        elif data.action == "UPDATE_QTY":
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": data.new_quantity, "pallet_count": data.pallet_count}, headers=HEADERS)
            await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "수정", "item_name": data.item_name, "quantity": data.new_quantity, "remarks": "수량 보정"}, headers=HEADERS)
        elif data.action == "UPDATE_DATE":
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"production_date": data.new_date}, headers=HEADERS)
            await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "수정", "item_name": data.item_name, "quantity": 0, "remarks": f"날짜 보정 ({data.new_date})"}, headers=HEADERS)
    return {"status": "success"}

@app.patch("/api/history/{log_id}")
async def update_history_payment(log_id: str, data: PaymentUpdate):
    async with httpx.AsyncClient() as client:
        await client.patch(f"{SUPABASE_URL}/rest/v1/history_log?id=eq.{log_id}", json={"payment_status": data.payment_status}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/orders_create")
async def create_orders(items: List[OrderCreateData]):
    import datetime
    async with httpx.AsyncClient() as client:
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        payloads = []
        for it in items:
            payloads.append({
                "location_id": "발주대기",
                "action_type": "발주중",
                "item_name": it.item_name,
                "quantity": it.quantity,
                "pallet_count": it.pallet_count,
                "remarks": it.supplier,
                "payment_status": "미지급",
                "production_date": today,
                "created_at": f"{today}T00:00:00Z"
            })
        res = await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=payloads, headers=HEADERS)
        if res.status_code not in [200, 201, 204]: return {"status": "error", "message": res.text}
        return {"status": "success"}

@app.delete("/api/history/{log_id}")
async def delete_history_log(log_id: str):
    async with httpx.AsyncClient() as client:
        res = await client.delete(f"{SUPABASE_URL}/rest/v1/history_log?id=eq.{log_id}", headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error"}

@app.post("/api/inbound_batch")
async def inbound_batch(rows: List[dict]):
    import datetime
    async with httpx.AsyncClient() as client:
        r_prod = await client.get(f"{SUPABASE_URL}/rest/v1/products?select=*", headers=HEADERS)
        r_fin = await client.get(f"{SUPABASE_URL}/rest/v1/finished_products?select=*", headers=HEADERS)
        pm_list = (r_prod.json() if r_prod.status_code == 200 else []) + (r_fin.json() if r_fin.status_code == 200 else [])
        
        payloads = []; history_payloads = []
        for r_data in rows:
            if not r_data: continue
            name = str(r_data.get("품목명", "")).strip()
            if not name or name == "(빈 칸)" or name == "undefined": continue
            
            qty_raw = str(r_data.get("➕신규 입고수량(EA)", "0")).replace(',', '').strip()
            try: qty = int(float(qty_raw))
            except Exception: qty = 0
            if qty <= 0: continue

            supplier = str(r_data.get("입고처(비고)", "")).strip()
            target_sup = supplier if supplier else "기본입고처"
            
            p_info = None
            for p in pm_list:
                if p["item_name"].strip() == name and p["supplier"].strip() == target_sup:
                    p_info = p; break
            if not p_info:
                for p in pm_list:
                    if p["item_name"].strip() == name:
                        p_info = p; break

            pallet_ea = p_info["pallet_ea"] if p_info and p_info.get("pallet_ea", 0) > 0 else 1
            calculated_pallet = qty / pallet_ea
            
            raw_date = str(r_data.get("산란일/입고일", "")).strip()
            prod_date = None
            if raw_date and raw_date != "None" and raw_date != "undefined":
                if raw_date.replace('.','').isdigit() and float(raw_date) > 30000:
                    try: prod_date = (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(raw_date))).strftime('%Y-%m-%d')
                    except Exception: prod_date = None
                else:
                    prod_date = raw_date.replace('/','-').replace('.','-')
                    if " " in prod_date: prod_date = prod_date.split(" ")[0]
            if not prod_date: prod_date = datetime.datetime.now().strftime('%Y-%m-%d')

            loc_id = str(r_data.get("렉 위치", "")).strip()
            zone = str(r_data.get("구역", "")).strip()
            
            if zone == "실온" and not loc_id.startswith("FL-") and not loc_id.startswith("R-"): loc_id = "R-" + loc_id
            elif zone == "냉장" and not loc_id.startswith("FL-") and not loc_id.startswith("C-"): loc_id = "C-" + loc_id

            payloads.append({"location_id": loc_id, "category": str(r_data.get("카테고리", "미분류")).strip(), "item_name": name, "quantity": qty, "pallet_count": round(calculated_pallet, 2), "production_date": prod_date, "remarks": supplier})
            history_payloads.append({"location_id": loc_id, "action_type": "입고", "item_name": name, "quantity": qty, "pallet_count": round(calculated_pallet, 2), "remarks": supplier, "payment_status": "미지급", "production_date": prod_date, "created_at": f"{prod_date}T00:00:00Z"})
            
        if payloads: 
            res = await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=payloads, headers=HEADERS)
            if res.status_code not in [200, 201, 204]: return {"status": "error", "message": f"DB 에러: {res.text}"}
            await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=history_payloads, headers=HEADERS)
            
        return {"status": "success", "count": len(payloads)}

@app.delete("/api/clear_data")
async def clear_data(target: str):
    async with httpx.AsyncClient() as client:
        if target == 'inventory': await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?location_id=not.is.null", headers=HEADERS)
        elif target == 'history': await client.delete(f"{SUPABASE_URL}/rest/v1/history_log?location_id=not.is.null", headers=HEADERS)
    return {"status": "success"}

@app.post("/api/close_inventory")
async def close_inventory():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?select=*", headers=HEADERS)
        inv_list = r.json() if r.status_code == 200 else []
        async def patch_item(item):
            remarks = item.get('remarks', '') or ''
            if '[기존재고]' not in remarks:
                new_remarks = f"{remarks} [기존재고]".strip()
                await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{item['id']}", json={"remarks": new_remarks}, headers=HEADERS)
        await asyncio.gather(*(patch_item(item) for item in inv_list))
        return {"status": "success"}
