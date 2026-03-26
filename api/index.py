import os
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import datetime

app = FastAPI()

# 💡 [핵심 버그 픽스] API 응답 캐싱(기억) 완전 차단! (수정 즉시 반영되도록 브라우저 강제)
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

class InboundData(BaseModel):
    location_id: str
    category: str
    item_name: str
    quantity: int
    pallet_count: float = 1.0
    production_date: Optional[str] = None
    remarks: Optional[str] = ""

class OutboundData(BaseModel):
    inventory_id: str
    location_id: str
    item_name: str
    quantity: int
    pallet_count: float = 1.0

class ProductData(BaseModel):
    category: str
    item_name: str
    supplier: str = "기본입고처"
    daily_usage: int = 0
    unit_price: int = 0
    pallet_ea: int = 1

class TransferData(BaseModel):
    inventory_id: str
    from_location: str
    to_location: str
    item_name: str
    quantity: int
    pallet_count: float = 1.0

class AdjustData(BaseModel):
    inventory_id: str
    location_id: str
    item_name: str
    new_quantity: int

class PaymentUpdate(BaseModel):
    payment_status: str

class BomData(BaseModel):
    finished_product: str
    material_product: str
    require_qty: float

class EditInventoryData(BaseModel):
    inventory_id: str
    location_id: str
    item_name: str
    action: str
    new_quantity: Optional[int] = None
    new_date: Optional[str] = None
    pallet_count: Optional[float] = None

HTML_CONTENT = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>HANSFARM WMS & ERP</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <style>
        body { background-color: #e2e8f0; }
        .rack-cell { transition: all 0.15s; position: relative; }
        .cell-empty { background-color: #ffffff; border: 1px dashed #cbd5e1; color: #94a3b8; }
        .cell-full { background-color: #4ade80; border: 1px solid #166534; color: #064e3b; font-weight: bold; }
        .cell-active { background-color: #3b82f6; border: 2px solid #1e3a8a; color: #ffffff; font-weight: bold; transform: scale(1.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 10; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #cbd5e1; }
        ::-webkit-scrollbar-thumb { background: #64748b; border-radius: 4px; }
        @keyframes pulse-red { 0% { opacity: 1; border-color: red; } 50% { opacity: 0.5; background-color: #fecdd3; border-color: red; } 100% { opacity: 1; border-color: red; } }
        .highlight-pulse { animation: pulse-red 1.5s infinite; border: 3px solid red !important; z-index: 20; }
        .donut-ring { transition: background 1s ease-out; }
        .nav-btn { transition: all 0.2s; }
        .nav-btn.inactive { border-color: #e2e8f0; color: #475569; background-color: transparent; font-weight: 700; }
        .nav-btn.active { background-color: #eef2ff; border-color: #c7d2fe; color: #4338ca; font-weight: 900; box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05); }
        .nav-btn.active-safety { background-color: #fff1f2; border-color: #fecdd3; color: #e11d48; font-weight: 900; }
        .nav-btn.active-accounting { background-color: #fefce8; border-color: #fde047; color: #a16207; font-weight: 900; }
        .dragging { opacity: 0.5; transform: scale(0.95); }
    </style>
</head>
<body class="font-sans h-screen flex flex-col md:flex-row overflow-hidden text-slate-800 selection:bg-indigo-200 pb-16 md:pb-0">

    <input type="file" id="excel-upload" accept=".xlsx, .xls, .csv" class="hidden" onchange="importExcel(event)">
    <input type="file" id="product-upload" accept=".xlsx, .xls, .csv" class="hidden" onchange="importProductsExcel(event, 'materials')">
    <input type="file" id="finished-upload" accept=".xlsx, .xls, .csv" class="hidden" onchange="importProductsExcel(event, 'finished')">
    <input type="file" id="bom-upload" accept=".xlsx, .xls, .csv" class="hidden" onchange="importBomExcel(event)">

    <aside class="hidden md:flex w-36 bg-white border-r border-slate-300 flex-col items-center py-6 shadow-lg z-20 shrink-0 h-screen">
        <div class="mb-8 w-full px-4 flex justify-center"><img src="/logo.jpg" alt="HANS FARM" class="max-w-full h-auto object-contain drop-shadow-sm"></div>
        <div class="flex flex-col space-y-2 w-full px-3 flex-1">
            <button onclick="showView('dashboard')" class="nav-btn-pc target-dashboard w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all">대시보드</button>
            <button onclick="showView('inventory')" class="nav-btn-pc target-inventory w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">렉맵</button>
            <button onclick="showView('search')" class="nav-btn-pc target-search w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">재고조회</button>
            <button onclick="showView('production')" class="nav-btn-pc target-production w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">생산관리</button>
            <button onclick="showView('outbound')" class="nav-btn-pc target-outbound w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">출고관리</button>
            <button onclick="showView('safety')" class="nav-btn-pc target-safety w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all text-rose-600">안전재고/발주</button>
            <button onclick="showView('products')" class="nav-btn-pc target-products w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">품목관리</button>
            <button onclick="showView('accounting')" class="nav-btn-pc target-accounting hidden w-full py-3 rounded-md border border-slate-200 text-yellow-700 font-black hover:bg-yellow-50 shadow-sm text-sm transition-all">💰 정산/회계</button>
            <div class="my-2 border-b border-slate-200 w-full"></div>
            <button onclick="exportPhysicalCountExcel()" class="w-full py-3 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-black shadow-inner text-[12px] transition-all hover:bg-blue-100">📋 실사 양식</button>
            <button onclick="document.getElementById('excel-upload').click()" class="w-full mt-1 py-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-black shadow-inner text-[12px] transition-all hover:bg-emerald-100">⬆️ 엑셀 입고</button>
        </div>
        <div class="w-full px-3 mt-auto pb-4">
            <button id="admin-btn-pc" onclick="adminLogin()" class="w-full py-3 rounded-md bg-slate-800 border border-slate-900 text-slate-300 font-black shadow-inner text-[11px] transition-all hover:bg-slate-700 hover:text-white">🔒 관리자</button>
        </div>
    </aside>

    <nav class="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex justify-around p-1 z-50 h-16">
        <button onclick="showView('dashboard')" class="nav-btn-mo target-dashboard flex-1 py-2 rounded-md text-[11px] border border-slate-200 text-slate-600 bg-white font-bold flex flex-col items-center justify-center mx-0.5 transition-all">📊<span class="mt-1">대시보드</span></button>
        <button onclick="showView('inventory')" class="nav-btn-mo target-inventory flex-1 py-2 rounded-md text-[11px] border border-slate-200 text-slate-600 bg-white font-bold flex flex-col items-center justify-center mx-0.5 transition-all">🗺️<span class="mt-1">렉맵</span></button>
        <button onclick="showView('search')" class="nav-btn-mo target-search flex-1 py-2 rounded-md text-[11px] border border-slate-200 text-slate-600 bg-white font-bold flex flex-col items-center justify-center mx-0.5 transition-all">📦<span class="mt-1">재고조회</span></button>
        <button onclick="adminLogin()" id="admin-btn-mo" class="nav-btn-mo flex-1 py-2 rounded-md text-[11px] border border-slate-200 text-slate-600 bg-white font-bold flex flex-col items-center justify-center mx-0.5 transition-all">🔒<span class="mt-1">관리자</span></button>
    </nav>

    <main class="flex-1 bg-slate-200 relative overflow-hidden flex flex-col h-full w-full">
        
        <div id="view-inventory" class="hidden flex-col h-full w-full absolute inset-0 transition-opacity duration-300">
            <header class="h-auto md:h-16 bg-white border-b border-slate-300 flex flex-col md:flex-row items-center justify-between px-4 md:px-6 pt-2 md:pt-4 shrink-0 shadow-sm z-10">
                <div class="flex space-x-1 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                    <button id="tab-room" onclick="switchZone('실온')" class="whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base">실온 (Room)</button>
                    <button id="tab-cold" onclick="switchZone('냉장')" class="whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200 text-sm md:text-base">냉장 (Cold)</button>
                    <button id="tab-floor" onclick="switchZone('현장')" class="whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200 text-sm md:text-base">생산 현장</button>
                </div>
                <div class="flex items-center space-x-2 md:space-x-4 pb-2 w-full md:w-auto justify-between md:justify-end mt-2 md:mt-0">
                    <button onclick="toggleWaitContainer()" class="px-2 md:px-4 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-black rounded-md hover:bg-emerald-100 text-xs md:text-sm flex items-center shadow-sm transition-colors whitespace-nowrap">📥 대기장</button>
                    <button onclick="toggleMapSearch()" class="px-2 md:px-4 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 font-black rounded-md hover:bg-indigo-100 text-xs md:text-sm flex items-center shadow-sm transition-colors whitespace-nowrap">🔍 스캔창</button>
                    <div id="fifo-btn-container" class="hidden"><button onclick="highlightFIFO()" class="px-2 md:px-4 py-1.5 bg-rose-100 border border-rose-300 text-rose-700 font-black rounded-md hover:bg-rose-200 text-xs md:text-sm flex items-center shadow-sm whitespace-nowrap">선입선출 추천</button></div>
                    <div class="flex items-center space-x-2">
                        <select id="floor-select" onchange="renderMap()" class="bg-white border-2 border-slate-300 text-slate-800 font-bold text-xs md:text-sm rounded-md px-2 md:px-4 py-1.5 shadow-sm"><option value="1">1층 (1F)</option><option value="2">2층 (2F)</option></select>
                        <button onclick="load()" class="p-1.5 bg-white border border-slate-300 rounded hover:bg-slate-100"><svg class="w-4 h-4 md:w-5 md:h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                    </div>
                </div>
            </header>
            
            <div class="flex-1 overflow-hidden p-2 md:p-6 relative flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 w-full">
                
                <div id="wait-container" class="hidden w-full md:w-80 flex-col bg-white rounded-xl shadow-md border border-slate-200 shrink-0 h-[40vh] md:h-full">
                    <div class="p-3 bg-emerald-50 border-b border-emerald-100 rounded-t-xl font-black text-emerald-800 flex justify-between items-center">
                        <span class="text-sm">📥 입고 대기장 (가상 렉)</span>
                        <span class="text-[10px] font-bold text-emerald-600">드래그로 자유 이동!</span>
                    </div>
                    <div class="p-3 border-b border-slate-200 space-y-2">
                        <div class="flex space-x-2">
                            <select id="wait-cat" class="w-1/2 p-1.5 border border-slate-300 rounded bg-slate-50 text-[10px] font-bold outline-none" onchange="updateWaitProductDropdown()"><option value="">카테고리</option></select>
                            <select id="wait-item" class="w-1/2 p-1.5 border border-slate-300 rounded bg-slate-50 text-[10px] font-bold outline-none" onchange="updateWaitSupplierDropdown()"><option value="">품목 선택</option></select>
                        </div>
                        <div class="flex space-x-2">
                            <select id="wait-supplier" class="w-1/2 p-1.5 border border-slate-300 rounded bg-slate-50 text-[10px] font-bold outline-none"><option value="">입고처</option></select>
                            <input type="date" id="wait-date" class="w-1/2 p-1.5 border border-slate-300 rounded bg-slate-50 text-[10px] font-bold outline-none">
                        </div>
                        <div class="flex space-x-2">
                            <input type="number" id="wait-qty" placeholder="총수량(EA)" class="w-1/2 p-1.5 border-2 border-emerald-300 rounded font-black text-emerald-700 text-[11px] outline-none">
                            <button onclick="createWaitingPallets()" class="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-2 rounded shadow text-xs transition-colors">박스 생성 ➕</button>
                        </div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-3 bg-slate-100 grid grid-cols-3 gap-2 content-start custom-scrollbar" id="waiting-grid">
                        </div>
                </div>

                <div class="flex-1 flex flex-col bg-white rounded-xl shadow-md border border-slate-200 h-[50vh] md:h-full relative overflow-hidden">
                    <div id="map-search-container" class="hidden bg-white p-3 md:p-4 border-b border-slate-200 w-full flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-3 items-center md:items-end shrink-0 text-center shadow-sm z-10 absolute top-0 left-0">
                        <div class="w-full md:w-1/4 text-left"><label class="block text-[10px] font-bold text-slate-500 mb-1">구역 카테고리</label><select id="map-search-category" onchange="updateMapSearchItemDropdown()" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"><option value="ALL">전체</option></select></div>
                        <div class="w-full md:w-2/4 text-left"><label class="block text-[10px] font-bold text-slate-500 mb-1">품목명 검색</label><input type="text" id="map-search-keyword" list="map-search-item-list" placeholder="검색어 입력" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"><datalist id="map-search-item-list"></datalist></div>
                        <div class="w-full md:w-1/4 text-left flex space-x-2 md:block"><div class="flex-1"><label class="block text-[10px] font-bold text-slate-500 mb-1">찾을 개수(렉)</label><input type="number" id="map-search-count" value="1" min="1" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"></div><div class="flex flex-1 space-x-1 md:mt-2 items-end md:hidden"><button onclick="executeMapSearch()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded shadow text-xs">스캔</button><button onclick="clearSearchTargets()" class="bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold py-2 px-2 rounded shadow-sm text-xs">리셋</button></div></div>
                        <button onclick="executeMapSearch()" class="hidden md:block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded shadow transition-colors text-sm whitespace-nowrap">FIFO 스캔</button>
                        <button onclick="clearSearchTargets()" class="hidden md:block bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold py-2 px-3 rounded shadow-sm transition-colors text-sm whitespace-nowrap">초기화</button>
                    </div>

                    <div class="w-full flex-1 overflow-auto custom-scrollbar flex items-start justify-center p-4 md:p-10 mt-12 md:mt-0">
                        <div class="w-fit min-h-max bg-white p-4 md:p-10 rounded-xl shadow-xl border border-slate-300 transition-all mx-auto" id="map-container">
                            <div id="vertical-racks" class="flex items-end"></div>
                            <div class="h-10 md:h-14 w-full flex items-center justify-center text-slate-400 font-black tracking-[0.2em] md:tracking-[0.5em] bg-yellow-50/50 border-y-2 border-yellow-300 my-4 shadow-inner text-xs md:text-sm" id="aisle-text">통로 (Aisle)</div>
                            <div class="flex justify-end md:pr-[168px]" id="horizontal-rack"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="view-dashboard" class="hidden flex-col h-full w-full absolute inset-0 p-4 md:p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex flex-col md:flex-row justify-between items-center mb-6 space-y-2 md:space-y-0"><h1 class="text-2xl md:text-3xl font-black text-slate-800">📊 물류 대시보드</h1><select id="dash-period" onchange="updateDashboard()" class="w-full md:w-auto border-2 border-indigo-200 rounded-lg p-2 font-bold text-indigo-700 bg-white outline-none"><option value="daily">일간</option><option value="weekly">주간</option><option value="monthly">월간</option></select></div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border-t-4 border-emerald-500 flex flex-col items-center justify-center"><div class="flex justify-between items-center mb-4 w-full"><div class="text-slate-500 font-black text-xs md:text-sm">창고 적재율</div><select id="dash-zone-select" onchange="updateDashboard()" class="border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-600 outline-none bg-slate-50"><option value="ALL">전체 창고</option><option value="ROOM">실온</option><option value="COLD">냉장</option></select></div><div class="relative w-32 h-32 md:w-36 md:h-36 rounded-full donut-ring flex items-center justify-center shadow-inner" id="dash-donut" style="background: conic-gradient(#10b981 0%, #e2e8f0 0%);"><div class="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center shadow-sm"><span class="text-2xl md:text-3xl font-black text-emerald-600" id="dash-cap-percent">0%</span><span class="text-[9px] md:text-[10px] text-slate-400 font-bold" id="dash-cap-text">0 / 0 파레트</span></div></div></div>
                <div class="col-span-1 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="bg-indigo-50 p-5 rounded-2xl shadow-sm border border-indigo-100 flex flex-col justify-between"><div class="flex justify-between items-center mb-2"><div class="font-black text-indigo-800 text-sm md:text-base">❄️ 냉장 창고</div><div class="text-indigo-500 font-bold text-sm" id="dash-cold-percent">0%</div></div><div class="space-y-2 text-xs md:text-sm mt-2"><div class="flex justify-between text-slate-600"><span class="font-bold">총 수용량</span><span class="font-black" id="dash-cold-total">0</span></div><div class="flex justify-between text-indigo-600"><span class="font-bold">적재 볼륨</span><span class="font-black" id="dash-cold-occ">0</span></div><div class="flex justify-between text-emerald-600"><span class="font-bold">빈 렉 수</span><span class="font-black" id="dash-cold-empty">0</span></div></div></div>
                    <div class="bg-orange-50 p-5 rounded-2xl shadow-sm border border-orange-100 flex flex-col justify-between"><div class="flex justify-between items-center mb-2"><div class="font-black text-orange-800 text-sm md:text-base">☀️ 실온 창고</div><div class="text-orange-500 font-bold text-sm" id="dash-room-percent">0%</div></div><div class="space-y-2 text-xs md:text-sm mt-2"><div class="flex justify-between text-slate-600"><span class="font-bold">총 수용량</span><span class="font-black" id="dash-room-total">0</span></div><div class="flex justify-between text-orange-600"><span class="font-bold">적재 볼륨</span><span class="font-black" id="dash-room-occ">0</span></div><div class="flex justify-between text-emerald-600"><span class="font-bold">빈 렉 수</span><span class="font-black" id="dash-room-empty">0</span></div></div></div>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-blue-500"><div class="text-slate-500 font-bold text-xs md:text-sm mb-1 flex items-center justify-between"><span>기간 내 입고량 (IN)</span></div><div class="text-3xl md:text-4xl font-black text-blue-600 mt-2" id="dash-in">0 P</div></div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-rose-500"><div class="text-slate-500 font-bold text-xs md:text-sm mb-1 flex items-center justify-between"><span>기간 내 출고량 (OUT)</span></div><div class="text-3xl md:text-4xl font-black text-rose-600 mt-2" id="dash-out">0 P</div></div>
            </div>
            <div id="admin-finance-panel" class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="bg-yellow-50 p-6 rounded-2xl shadow-md border border-yellow-200"><h3 class="text-yellow-800 font-black text-lg mb-4 flex items-center">💰 재고자산</h3><div class="space-y-3"><div class="flex justify-between items-center text-sm font-bold text-yellow-700 border-b border-yellow-200 pb-2"><span>❄️ 냉장 자산</span><span id="dash-val-cold">0 원</span></div><div class="flex justify-between items-center text-sm font-bold text-yellow-700 border-b border-yellow-200 pb-2"><span>☀️ 실온 자산</span><span id="dash-val-room">0 원</span></div><div class="flex justify-between items-center text-xl font-black text-yellow-900 pt-2"><span>총 자산 가치</span><span id="dash-val-total">0 원</span></div></div></div>
                <div class="bg-rose-50 p-6 rounded-2xl shadow-md border border-rose-200 flex flex-col justify-center"><h3 class="text-rose-800 font-black text-lg mb-2 flex items-center">💸 소모 원가</h3><div class="text-4xl font-black text-rose-600 text-right" id="dash-cost-out">0 원</div></div>
            </div>
            <div id="admin-dashboard-panel"></div>
        </div>

        <div id="view-search" class="hidden flex-col items-center justify-start md:justify-center h-full w-full absolute inset-0 p-4 md:p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-2xl md:text-3xl font-black text-slate-800 mb-4 md:mb-8 mt-4 md:mt-0">📦 실시간 품목별 재고</h1>
            <div class="bg-white p-4 md:p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-5xl text-center">
                <div class="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-3 mb-6">
                    <div class="w-full md:w-1/4 text-left"><label class="block text-[11px] font-bold text-slate-500 mb-1">① 관리 유형</label><select id="summary-type" onchange="updateSummarySupplierDropdown()" class="w-full text-sm p-3 border-2 border-slate-300 rounded-xl font-bold text-slate-800 outline-none bg-slate-50"><option value="ALL">전체 유형</option><option value="FINISHED">제품</option><option value="MATERIAL">자재</option><option value="RAW">원란</option></select></div>
                    <div class="w-full md:w-1/4 text-left"><label class="block text-[11px] font-bold text-slate-500 mb-1">② 입고처</label><select id="summary-supplier" onchange="updateSummaryCategoryDropdown()" class="w-full text-sm p-3 border-2 border-rose-200 rounded-xl font-bold text-rose-800 outline-none bg-white"><option value="ALL">전체 입고처</option></select></div>
                    <div class="w-full md:w-1/4 text-left"><label class="block text-[11px] font-bold text-slate-500 mb-1">③ 카테고리</label><select id="summary-category" onchange="updateSummaryItemDropdown()" class="w-full text-sm p-3 border-2 border-indigo-200 rounded-xl font-bold text-indigo-800 outline-none bg-white"><option value="ALL">전체</option></select></div>
                    <div class="w-full md:w-1/4 text-left"><label class="block text-[11px] font-bold text-slate-500 mb-1">④ 품목명 확인</label><select id="summary-item" onchange="calculateSummary()" class="w-full text-sm p-3 border-2 border-emerald-200 rounded-xl font-bold text-emerald-800 outline-none bg-white"><option value="">대기중</option></select></div>
                </div>
                <div class="mt-4 md:mt-8 p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
                    <div class="text-sm font-bold text-slate-500 mb-2">현재 총 가용 재고</div>
                    <div class="text-4xl md:text-5xl font-black text-indigo-600" id="summary-result">0 <span class="text-xl md:text-2xl text-indigo-400 font-bold">EA</span></div>
                    <div class="text-xs md:text-sm font-bold text-rose-500 mt-2 md:mt-3" id="summary-pallet">0.0 P</div>
                    <div id="summary-breakdown" class="w-full max-w-sm mx-auto mb-4"></div>
                    <button onclick="findItemLocationFromSummary()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-4 md:px-8 rounded-xl shadow-md transition-colors w-full max-w-sm mx-auto flex items-center justify-center text-sm md:text-base mt-2"><svg class="w-4 h-4 md:w-5 md:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>📍 렉맵에서 위치 확인</button>
                </div>
            </div>
        </div>

        <div id="view-safety" class="hidden flex-col h-full w-full absolute inset-0 p-4 md:p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b-2 border-slate-200 pb-4 space-y-4 md:space-y-0">
                <h1 class="text-2xl md:text-3xl font-black text-slate-800 flex items-center">🚨 자동 발주/안전재고</h1>
                <div class="flex items-center space-x-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 w-full md:w-auto"><label class="font-bold text-slate-600 text-sm md:text-base whitespace-nowrap">안전재고 기준:</label><div class="relative"><input type="number" id="safe-days-target" value="7" min="1" onchange="renderSafetyStock()" class="w-20 border-2 border-indigo-200 rounded-lg p-2 font-black text-indigo-700 text-center outline-none"><span class="absolute right-3 top-2.5 font-bold text-slate-400">일</span></div></div>
            </div>
            <div class="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[700px]">
                    <thead><tr class="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm"><th class="p-4 font-black">카테고리</th><th class="p-4 font-black">품목명 (입고처)</th><th class="p-4 font-black text-right">현재 총 재고 (EA)</th><th class="p-4 font-black text-right">일간 소모량 (EA)</th><th class="p-4 font-black text-center">예상 소진일</th><th class="p-4 font-black text-center">상태 및 발주</th></tr></thead>
                    <tbody id="safety-list" class="divide-y divide-slate-100"></tbody>
                </table>
            </div>
        </div>

        <div id="view-products" class="hidden flex-col h-full w-full absolute inset-0 p-4 md:p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex flex-col md:flex-row justify-between items-center mb-6 border-b pb-4 shrink-0 space-y-4 md:space-y-0">
                <div class="flex space-x-2 md:space-x-4 w-full md:w-auto overflow-x-auto custom-scrollbar">
                    <button onclick="switchProductTab('fp')" id="tab-btn-fp" class="whitespace-nowrap text-lg md:text-2xl font-black text-indigo-700 border-b-4 border-indigo-700 pb-1 px-2 transition-colors">📦 제품 마스터</button>
                    <button onclick="switchProductTab('pm')" id="tab-btn-pm" class="whitespace-nowrap text-lg md:text-2xl font-black text-slate-400 hover:text-slate-600 pb-1 px-2 transition-colors">✂️ 자재 마스터</button>
                    <button onclick="switchProductTab('bom')" id="tab-btn-bom" class="whitespace-nowrap text-lg md:text-2xl font-black text-slate-400 hover:text-slate-600 pb-1 px-2 transition-colors">📜 BOM 설정</button>
                </div>
                <div id="fp-header-btns" class="flex space-x-2 w-full md:w-auto justify-end"><button onclick="document.getElementById('finished-upload').click()" class="bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 py-2 px-3 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors text-xs md:text-sm">엑셀 업로드</button><button onclick="exportProductsExcel('finished')" class="bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 py-2 px-3 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors text-xs md:text-sm">양식 다운</button><button id="fp-wipe-btn" onclick="deleteAllProducts('finished')" class="hidden bg-rose-50 text-rose-700 font-bold border border-rose-200 py-2 px-3 rounded-lg shadow-sm hover:bg-rose-100 transition-colors text-xs md:text-sm">일괄 삭제</button></div>
                <div id="pm-header-btns" class="hidden space-x-2 w-full md:w-auto justify-end"><button onclick="document.getElementById('product-upload').click()" class="bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 py-2 px-3 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors text-xs md:text-sm">엑셀 업로드</button><button onclick="exportProductsExcel('materials')" class="bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 py-2 px-3 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors text-xs md:text-sm">양식 다운</button><button id="pm-wipe-btn" onclick="deleteAllProducts('materials')" class="hidden bg-rose-50 text-rose-700 font-bold border border-rose-200 py-2 px-3 rounded-lg shadow-sm hover:bg-rose-100 transition-colors text-xs md:text-sm">일괄 삭제</button></div>
                <div id="bom-header-btns" class="hidden space-x-2 w-full md:w-auto justify-end"><button onclick="document.getElementById('bom-upload').click()" class="bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 py-2 px-3 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors text-xs md:text-sm">엑셀 업로드</button><button onclick="exportBomExcel()" class="bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 py-2 px-3 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors text-xs md:text-sm">양식 다운</button><button id="bom-wipe-btn" onclick="deleteAllBom()" class="hidden bg-rose-50 text-rose-700 font-bold border border-rose-200 py-2 px-3 rounded-lg shadow-sm hover:bg-rose-100 transition-colors text-xs md:text-sm">일괄 삭제</button></div>
            </div>
            
            <div id="subview-fp" class="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit overflow-auto">
                    <h2 class="font-black text-lg text-indigo-700 mb-4 border-b pb-2" id="fp-form-title">신규 완제품 추가</h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">카테고리</label><input type="text" id="fp-cat" class="w-full border border-slate-300 rounded p-2 mb-3 text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">제품명</label><input type="text" id="fp-name" class="w-full border border-slate-300 rounded p-2 mb-3 text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">비고(생산처)</label><input type="text" id="fp-supplier" placeholder="자체생산" class="w-full border border-slate-300 rounded p-2 mb-3 text-sm">
                    <div class="flex space-x-2 mb-4"><div class="w-1/2"><label class="block text-xs font-bold text-slate-500 mb-1">일간출고량</label><input type="number" id="fp-usage" value="0" class="w-full border border-slate-300 rounded p-2 text-sm"></div><div class="w-1/2"><label class="block text-xs font-bold text-slate-500 mb-1">1P당 수량</label><input type="number" id="fp-pallet-ea" value="1" class="w-full border border-slate-300 rounded p-2 text-sm"></div></div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">단가(매출)</label><input type="number" id="fp-price" value="0" class="w-full border border-slate-300 rounded p-2 mb-6 text-sm">
                    <button id="fp-submit-btn" onclick="submitProduct('finished')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-md transition-colors mb-2">등록하기</button><button id="fp-cancel-btn" onclick="cancelEdit('finished')" class="hidden w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3 rounded-xl shadow-sm transition-colors">취소</button>
                </div>
                <div class="col-span-1 md:col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col overflow-hidden">
                    <input type="text" id="fp-search" onkeyup="renderProductMaster('finished')" placeholder="제품명 검색..." class="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold mb-4 outline-none">
                    <div class="overflow-y-auto flex-1 custom-scrollbar"><table class="w-full text-left border-collapse text-xs md:text-sm min-w-[500px]"><thead class="sticky top-0 bg-white z-10 border-b-2 border-slate-200 text-slate-500"><tr><th class="p-2">분류</th><th class="p-2">제품명</th><th class="p-2">비고</th><th class="p-2 text-right">1P수량</th><th class="p-2 text-center">관리</th></tr></thead><tbody id="fp-list" class="divide-y divide-slate-100"></tbody></table></div>
                </div>
            </div>

            <div id="subview-pm" class="hidden grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit">
                    <h2 class="font-black text-lg text-indigo-700 mb-4 border-b pb-2" id="pm-form-title">신규 자재 추가</h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">카테고리</label><input type="text" id="pm-cat" class="w-full border border-slate-300 rounded p-2 mb-3 text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">자재명</label><input type="text" id="pm-name" class="w-full border border-slate-300 rounded p-2 mb-3 text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">입고처</label><input type="text" id="pm-supplier" class="w-full border border-slate-300 rounded p-2 mb-3 text-sm">
                    <div class="flex space-x-2 mb-4"><div class="w-1/2"><label class="block text-xs font-bold text-slate-500 mb-1">일간소모량</label><input type="number" id="pm-usage" value="0" class="w-full border border-slate-300 rounded p-2 text-sm"></div><div class="w-1/2"><label class="block text-xs font-bold text-slate-500 mb-1">1P당 수량</label><input type="number" id="pm-pallet-ea" value="1" class="w-full border border-slate-300 rounded p-2 text-sm"></div></div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">단가(매입)</label><input type="number" id="pm-price" value="0" class="w-full border border-slate-300 rounded p-2 mb-6 text-sm">
                    <button id="pm-submit-btn" onclick="submitProduct('materials')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-md transition-colors mb-2">등록하기</button><button id="pm-cancel-btn" onclick="cancelEdit('materials')" class="hidden w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3 rounded-xl shadow-sm transition-colors">취소</button>
                </div>
                <div class="col-span-1 md:col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col overflow-hidden">
                    <input type="text" id="pm-search" onkeyup="renderProductMaster('materials')" placeholder="자재명 검색..." class="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold mb-4 outline-none">
                    <div class="overflow-y-auto flex-1 custom-scrollbar"><table class="w-full text-left border-collapse text-xs md:text-sm min-w-[500px]"><thead class="sticky top-0 bg-white z-10 border-b-2 border-slate-200 text-slate-500"><tr><th class="p-2">분류</th><th class="p-2">자재명</th><th class="p-2">입고처</th><th class="p-2 text-right">1P수량</th><th class="p-2 text-center">관리</th></tr></thead><tbody id="pm-list" class="divide-y divide-slate-100"></tbody></table></div>
                </div>
            </div>

            <div id="subview-bom" class="hidden grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit">
                    <h2 class="font-black text-lg text-emerald-700 mb-4 border-b pb-2">신규 레시피 등록</h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">완제품 선택</label><select id="bom-finished" class="w-full border border-slate-300 rounded p-2 mb-4 text-sm"></select>
                    <label class="block text-xs font-bold text-slate-500 mb-1">자재 선택</label><select id="bom-material" class="w-full border border-slate-300 rounded p-2 mb-4 text-sm"></select>
                    <label class="block text-xs font-bold text-slate-500 mb-1">소요 수량 (EA)</label><input type="number" id="bom-qty" value="1" step="0.01" class="w-full border border-slate-300 rounded p-2 mb-6 text-sm">
                    <button onclick="submitBom()" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl shadow-md transition-colors">연결 저장하기</button>
                </div>
                <div class="col-span-1 md:col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col overflow-hidden">
                    <h2 class="font-black text-lg text-slate-700 mb-4">현재 BOM (레시피)</h2>
                    <div class="overflow-y-auto flex-1 custom-scrollbar"><table class="w-full text-left border-collapse text-xs md:text-sm min-w-[400px]"><thead class="sticky top-0 bg-white z-10 border-b-2 border-slate-200 text-slate-500"><tr><th class="p-2">완제품</th><th class="p-2">자재</th><th class="p-2 text-right">수량</th><th class="p-2 text-center">관리</th></tr></thead><tbody id="bom-list" class="divide-y divide-slate-100"></tbody></table></div>
                </div>
            </div>
        </div>

        <div id="view-accounting" class="hidden flex-col h-full w-full absolute inset-0 p-4 md:p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-2xl md:text-3xl font-black text-yellow-800 mb-6">💰 매입처별 정산</h1>
            <div class="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <div class="w-full md:w-1/3"><label class="block text-xs font-bold text-slate-500 mb-1">월 선택</label><input type="month" id="acc-month" onchange="renderAccounting()" class="w-full border border-slate-300 rounded p-2 text-sm font-bold"></div>
                <div class="w-full md:w-2/3"><label class="block text-xs font-bold text-slate-500 mb-1">매입처 선택</label><select id="acc-supplier" onchange="renderAccounting()" class="w-full border border-slate-300 rounded p-2 text-sm font-bold"><option value="ALL">전체 매입처 보기</option></select></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-white p-4 rounded-xl shadow-md border-l-4 border-slate-700"><div class="text-xs text-slate-500 font-bold mb-1">총 매입금액</div><div class="text-xl font-black" id="acc-total">0 원</div></div>
                <div class="bg-white p-4 rounded-xl shadow-md border-l-4 border-rose-500"><div class="text-xs text-rose-500 font-bold mb-1">미지급금</div><div class="text-xl font-black text-rose-600" id="acc-unpaid">0 원</div></div>
                <div class="bg-white p-4 rounded-xl shadow-md border-l-4 border-blue-500"><div class="text-xs text-blue-500 font-bold mb-1">결제 완료</div><div class="text-xl font-black text-blue-600" id="acc-paid">0 원</div></div>
            </div>
            <div class="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[700px]">
                    <thead><tr class="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs"><th class="p-3">입고일시</th><th class="p-3">매입처</th><th class="p-3">품목명</th><th class="p-3 text-right">수량</th><th class="p-3 text-right">단가</th><th class="p-3 text-right">매입금액</th><th class="p-3 text-center">결제상태</th></tr></thead>
                    <tbody id="acc-list" class="divide-y divide-slate-100 text-sm"></tbody>
                </table>
            </div>
        </div>

        <div id="view-production" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-4">🏭 생산 관리 시스템</h1><p class="text-slate-500 font-bold text-center">BOM 기반 자동 차감(Backflush) 기능 준비중</p>
        </div>
        <div id="view-outbound" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-4">🚚 출고 관리 시스템</h1><p class="text-slate-500 font-bold text-center">패킹 리스트 생성 기능 준비중</p>
        </div>

    </main>

    <aside id="right-sidebar" class="hidden fixed md:relative bottom-16 md:bottom-0 right-0 w-full md:w-80 h-[60vh] md:h-full bg-white border-t md:border-l border-slate-300 flex-col shadow-[0_-10px_20px_rgba(0,0,0,0.15)] md:shadow-lg z-40 shrink-0 transition-all">
        <div class="p-3 md:p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center"><h2 class="text-base md:text-lg font-black text-slate-800 flex items-center">📍 위치 상세 정보</h2><button onclick="closeInfoPanel()" class="md:hidden text-slate-500 font-bold px-2 py-1 bg-slate-200 rounded text-xs">닫기 ⬇️</button></div>
        <div class="p-4 md:p-6 flex-1 overflow-y-auto pb-20 md:pb-6" id="info-panel"><div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div></div>
    </aside>

    <script>
        let globalOccupancy = []; let productMaster = []; let finishedProductMaster = []; let globalHistory = []; let bomMaster = []; 
        let globalSearchTargets = []; let currentZone = '실온'; let selectedCellId = null; let isAdmin = false;
        
        const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
        const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];
        const layoutFloor = [ { id: 'FL-C', title: '❄️ 생산 현장 (원재료 / 냉장)', cols: 20 }, { aisle: true, text: '====================' }, { id: 'FL-R', title: '📦 생산 현장 (부자재 / 실온)', cols: 20 } ];

        async function load() {
            try {
                const ts = new Date().getTime();
                const [occRes, prodRes, fpRes, histRes, bomRes] = await Promise.all([ 
                    fetch('/api/inventory?t=' + ts), 
                    fetch('/api/products?t=' + ts), 
                    fetch('/api/finished_products?t=' + ts), 
                    fetch('/api/history?t=' + ts), 
                    fetch('/api/bom?t=' + ts) 
                ]);
                globalOccupancy = await occRes.json() || []; productMaster = await prodRes.json() || []; finishedProductMaster = await fpRes.json() || []; globalHistory = await histRes.json() || []; bomMaster = await bomRes.json() || [];
                
                updateMapSearchCategoryDropdown(); updateSummarySupplierDropdown(); populateWaitDropdowns(); 
                
                let viewInv = document.getElementById('view-inventory');
                if(viewInv && !viewInv.classList.contains('hidden')) renderMap(); 
                
                let viewDash = document.getElementById('view-dashboard');
                if(viewDash && !viewDash.classList.contains('hidden')) updateDashboard();
                
                let viewAcc = document.getElementById('view-accounting');
                if(viewAcc && !viewAcc.classList.contains('hidden')) renderAccounting();
                
                if(selectedCellId) await clickCell(selectedCellId); else clearInfo();
            } catch (e) { console.error("로딩 에러:", e); }
        }

        // 💡 탭 이동 (JS 멈춤 방지용 try-catch)
        function updateZoneTabs() {
            try {
                ['tab-room', 'tab-cold', 'tab-floor'].forEach(id => {
                    let el = document.getElementById(id);
                    if(el) el.className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200 text-sm md:text-base";
                });
                let activeEl = null;
                if(currentZone === '실온') activeEl = document.getElementById('tab-room');
                else if(currentZone === '냉장') activeEl = document.getElementById('tab-cold');
                else if(currentZone === '현장') activeEl = document.getElementById('tab-floor');

                if(activeEl) {
                    if(currentZone === '실온') activeEl.className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base";
                    else if(currentZone === '냉장') activeEl.className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base";
                    else if(currentZone === '현장') activeEl.className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-emerald-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base";
                }

                let fifoBtn = document.getElementById('fifo-btn-container');
                let floorSel = document.getElementById('floor-select');
                
                if(currentZone === '현장') {
                    if(fifoBtn) fifoBtn.classList.add('hidden');
                    if(floorSel) floorSel.classList.add('hidden');
                } else {
                    if(currentZone === '냉장') { if(fifoBtn) fifoBtn.classList.remove('hidden'); }
                    else { if(fifoBtn) fifoBtn.classList.add('hidden'); }
                    if(floorSel) floorSel.classList.remove('hidden');
                }
                updateMapSearchCategoryDropdown();
            } catch(e) { console.error(e); }
        }

        function switchZone(zone) { 
            globalSearchTargets = []; currentZone = zone; selectedCellId = null; 
            let rs = document.getElementById('right-sidebar');
            if(window.innerWidth < 768 && rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
            updateZoneTabs(); renderMap(); 
        }

        function showView(viewName) {
            document.querySelectorAll('.nav-btn-pc').forEach(btn => { btn.className = "nav-btn-pc w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all"; });
            document.querySelectorAll('.nav-btn-mo').forEach(btn => { if(btn.id !== 'admin-btn-mo') { btn.className = "nav-btn-mo flex-1 py-2 rounded-md text-[11px] border border-slate-200 text-slate-600 bg-white font-bold flex flex-col items-center justify-center mx-0.5 transition-all"; } });
            
            document.querySelectorAll('.nav-btn-pc.target-' + viewName).forEach(btn => { btn.className = "nav-btn-pc target-" + viewName + " w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all" + (viewName==='safety' ? ' text-rose-600 border-rose-200 bg-rose-50' : '') + (viewName==='accounting' ? ' text-yellow-700 border-yellow-300 bg-yellow-50' : ''); });
            document.querySelectorAll('.nav-btn-mo.target-' + viewName).forEach(btn => { btn.className = "nav-btn-mo target-" + viewName + " flex-1 py-2 rounded-md text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 font-black flex flex-col items-center justify-center mx-0.5 shadow-inner transition-all"; });
            
            ['view-inventory', 'view-dashboard', 'view-search', 'view-products', 'view-safety', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
                let el = document.getElementById(id);
                if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
            });
            
            let rs = document.getElementById('right-sidebar');
            if(viewName === 'inventory') { 
                if(window.innerWidth >= 768 && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } 
                else if(rs) { if(selectedCellId) { rs.classList.remove('hidden'); rs.classList.add('flex'); } else { rs.classList.add('hidden'); rs.classList.remove('flex'); } }
                renderMap(); 
            } else if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
            
            let targetView = document.getElementById('view-' + viewName);
            if(targetView) { targetView.classList.remove('hidden'); targetView.classList.add('flex'); }
            
            if(viewName === 'products') { renderProductMaster('finished'); switchProductTab('fp'); } 
            else if(viewName === 'search') { updateSummarySupplierDropdown(); } 
            else if(viewName === 'dashboard') updateDashboard(); 
            else if(viewName === 'safety') renderSafetyStock(); 
            else if(viewName === 'accounting') renderAccounting();
        }

        function closeInfoPanel() { 
            let rs = document.getElementById('right-sidebar');
            if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
            selectedCellId = null; renderMap(); 
        }
        function toggleMapSearch() { const container = document.getElementById('map-search-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }
        function toggleWaitContainer() { const container = document.getElementById('wait-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }

        function getDynamicPalletCount(itemObj) {
            if(!itemObj) return 0;
            let itemName = itemObj.item_name || ""; let supplier = itemObj.remarks || "기본입고처"; let quantity = itemObj.quantity || 0;
            let targetSup = String(supplier).trim();
            let pInfo = finishedProductMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim() && String(p.supplier||"").trim() === targetSup) || productMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim() && String(p.supplier||"").trim() === targetSup) || finishedProductMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim()) || productMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim());
            if (pInfo && pInfo.pallet_ea > 0) return quantity / pInfo.pallet_ea;
            return itemObj.pallet_count || 1;
        }

        function onCardDragStart(event, invId, itemName, maxQty, currentPallet, fromLoc, supplier) {
            event.dataTransfer.setData("invId", invId); event.dataTransfer.setData("itemName", itemName); event.dataTransfer.setData("maxQty", maxQty); event.dataTransfer.setData("currentPallet", currentPallet); event.dataTransfer.setData("fromLoc", fromLoc); event.dataTransfer.setData("supplier", supplier || ""); event.dataTransfer.effectAllowed = "move"; event.currentTarget.classList.add('dragging');
        }
        function onWaitDragStart(event, wId) {
            let items = globalOccupancy.filter(o => o.location_id === wId); if(items.length === 0) return; let item = items[0];
            event.dataTransfer.setData("invId", item.id); event.dataTransfer.setData("itemName", item.item_name); event.dataTransfer.setData("maxQty", item.quantity); event.dataTransfer.setData("currentPallet", item.pallet_count || 1); event.dataTransfer.setData("fromLoc", wId); event.dataTransfer.setData("supplier", item.remarks || ""); event.dataTransfer.effectAllowed = "move"; event.currentTarget.classList.add('dragging');
        }
        function onDragEnd(event) { event.currentTarget.classList.remove('dragging'); }
        function onDragOver(event) { event.preventDefault(); event.currentTarget.classList.add('border-indigo-500', 'border-4', 'border-dashed'); }
        function onDragLeave(event) { event.currentTarget.classList.remove('border-indigo-500', 'border-4', 'border-dashed'); }

        async function onDrop(event, displayId, dbBaseId) {
            event.preventDefault(); event.currentTarget.classList.remove('border-indigo-500', 'border-4', 'border-dashed');
            let invId = event.dataTransfer.getData("invId"); let itemName = event.dataTransfer.getData("itemName"); let maxQty = parseInt(event.dataTransfer.getData("maxQty")); let fromLoc = event.dataTransfer.getData("fromLoc"); let supplier = event.dataTransfer.getData("supplier");
            if(!invId) return;
            
            let toLoc = dbBaseId;
            if (!toLoc.startsWith('W-') && currentZone !== '현장') {
                let floor = prompt(`[${itemName}]을(를) ${displayId}의 몇 층으로 이동할까요?\\n(1 또는 2 입력)`, "1");
                if(floor !== "1" && floor !== "2") return;
                toLoc = floor === "1" ? dbBaseId : `${dbBaseId}-2F`;
            }
            if(fromLoc === toLoc) return;

            let qtyStr = prompt(`이동(또는 합칠) 수량(EA)을 입력하세요.\\n(최대 ${maxQty}EA)`, maxQty);
            if(!qtyStr) return; let qty = parseInt(qtyStr);
            if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("수량이 올바르지 않습니다.");

            let movePallet = getDynamicPalletCount({item_name: itemName, remarks: supplier, quantity: qty});
            try { 
                await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc, item_name: itemName, quantity: qty, pallet_count: movePallet }) }); 
                await load(); // 💡 DB 처리 후 최신 데이터로 화면 강제 갱신
            } catch(e) { alert("서버 통신 오류"); }
        }

        function populateWaitDropdowns() {
            let allItems = [...finishedProductMaster, ...productMaster];
            let cats = [...new Set(allItems.map(p => p.category))].filter(Boolean).sort();
            let wc = document.getElementById('wait-cat');
            if(wc) wc.innerHTML = `<option value="">카테고리</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        function updateWaitProductDropdown() {
            let wc = document.getElementById('wait-cat'); if(!wc) return;
            let cat = wc.value; let allItems = [...finishedProductMaster, ...productMaster];
            let items = [...new Set(allItems.filter(p => p.category === cat).map(p => p.item_name))].filter(Boolean).sort();
            let wi = document.getElementById('wait-item');
            if(wi) wi.innerHTML = `<option value="">품목</option>` + items.map(c => `<option value="${c}">${c}</option>`).join(''); 
            updateWaitSupplierDropdown();
        }
        function updateWaitSupplierDropdown() {
            let wc = document.getElementById('wait-cat'); let wi = document.getElementById('wait-item'); if(!wc || !wi) return;
            let cat = wc.value; let item = wi.value; let allItems = [...finishedProductMaster, ...productMaster];
            let sups = [...new Set(allItems.filter(p => p.category === cat && p.item_name === item).map(p => p.supplier))].filter(Boolean).sort();
            let ws = document.getElementById('wait-supplier');
            if(ws) ws.innerHTML = `<option value="">입고처</option>` + sups.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        async function createWaitingPallets() {
            const cat = document.getElementById('wait-cat').value; const item = document.getElementById('wait-item').value; 
            const ws = document.getElementById('wait-supplier'); const supplier = ws ? ws.value || '기본입고처' : '기본입고처';
            let wd = document.getElementById('wait-date'); let date = wd ? wd.value : ''; 
            const qty = parseInt(document.getElementById('wait-qty').value);
            if(!cat || !item || isNaN(qty) || qty <= 0) return alert("필수값을 모두 입력하세요.");
            if(!date) { let t = new Date(); date = t.toISOString().split('T')[0]; }
            
            let pInfo = finishedProductMaster.find(p => p.item_name === item && p.supplier === supplier) || productMaster.find(p => p.item_name === item && p.supplier === supplier) || finishedProductMaster.find(p => p.item_name === item) || productMaster.find(p => p.item_name === item);
            let pEa = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : qty;
            
            let remaining = qty; let payloads = []; let waitIndex = 1;
            while(remaining > 0) {
                let chunk = remaining > pEa ? pEa : remaining; let chunkPallet = chunk / pEa; let emptyW = "";
                for(let i=waitIndex; i<=30; i++) { let wId = `W-${i.toString().padStart(2, '0')}`; if(!globalOccupancy.find(o => o.location_id === wId) && !payloads.find(p => p.location_id === wId)) { emptyW = wId; waitIndex = i + 1; break; } }
                if(!emptyW) { alert(`대기 렉이 꽉 찼습니다! (${payloads.length}박스만 생성됨)`); break; }
                payloads.push({ location_id: emptyW, category: cat, item_name: item, quantity: chunk, pallet_count: chunkPallet, production_date: date, remarks: supplier }); remaining -= chunk;
            }
            if(payloads.length > 0) {
                try { 
                    let promises = payloads.map(p => fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(p) })); 
                    await Promise.all(promises); 
                    document.getElementById('wait-qty').value = ''; 
                    await load(); // 💡 DB 반영 후 즉시 새로고침
                } catch(e) { alert("생성 중 오류 발생"); }
            }
        }

        function renderMap() { 
            try {
                let floorSelect = document.getElementById('floor-select');
                const floor = floorSelect ? floorSelect.value : "1"; 
                const vContainer = document.getElementById('vertical-racks'); 
                const hContainer = document.getElementById('horizontal-rack'); 
                const occMap = {}; const palletMap = {}; globalOccupancy.forEach(item => { occMap[item.location_id] = true; palletMap[item.location_id] = (palletMap[item.location_id] || 0) + getDynamicPalletCount(item); }); 
                
                let waitHtml = '';
                for(let i=1; i<=30; i++) {
                    let wId = `W-${i.toString().padStart(2, '0')}`;
                    let items = globalOccupancy.filter(o => o.location_id === wId);
                    if(items.length > 0) {
                        let item = items[0]; let totalQty = items.reduce((sum, o) => sum + o.quantity, 0); let totalPallet = items.reduce((sum, o) => sum + getDynamicPalletCount(o), 0); let palStr = totalPallet > 0 ? totalPallet.toFixed(1) : 1;
                        let supplierStr = item.remarks && item.remarks !== '기본입고처' ? `<span class="text-[6px] text-slate-500 truncate w-full px-1">${item.remarks}</span>` : '';
                        waitHtml += `<div id="cell-${wId}" draggable="true" ondragstart="onWaitDragStart(event, '${wId}')" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${wId}', '${wId}')" onclick="clickCell('${wId}', '${wId}')" class="bg-indigo-100 border-2 border-indigo-400 rounded-lg p-1 flex flex-col items-center justify-center text-center cursor-grab shadow-sm h-16 md:h-20 active:cursor-grabbing hover:scale-105 transition-all overflow-hidden">${supplierStr}<span class="text-[8px] md:text-[9px] font-black text-indigo-800 truncate w-full px-1">${item.item_name}</span><span class="text-[10px] md:text-xs font-black text-rose-600 mt-0.5">${totalQty.toLocaleString()}</span><span class="text-[7px] md:text-[8px] font-bold text-slate-500">${palStr}P</span></div>`;
                    } else {
                        waitHtml += `<div id="cell-${wId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${wId}', '${wId}')" class="bg-white border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center h-16 md:h-20 text-slate-300 font-black text-xs opacity-50">${i}</div>`;
                    }
                }
                let wGrid = document.getElementById('waiting-grid');
                if(wGrid) wGrid.innerHTML = waitHtml;

                let vHtml = ''; if(hContainer) hContainer.innerHTML = ''; 
                if(currentZone === '현장') { 
                    let aisleText = document.getElementById('aisle-text');
                    if(aisleText) aisleText.classList.add('hidden'); 
                    vHtml += `<div class="w-full min-w-[700px]">`; 
                    layoutFloor.forEach(col => { 
                        if(col.aisle) { vHtml += `<div class="w-full h-10 bg-yellow-50/50 flex items-center justify-center border-y-2 border-yellow-300 shadow-inner my-6 rounded-lg"><span class="text-yellow-600 font-black tracking-widest text-sm">${col.text}</span></div>`; } 
                        else { 
                            let colorClass = col.id === 'FL-C' ? 'text-indigo-800 bg-indigo-50 border-indigo-200' : 'text-orange-800 bg-orange-50 border-orange-200'; 
                            vHtml += `<div class="mb-4 bg-white p-5 rounded-2xl shadow-md border border-slate-200"><div class="text-lg font-black ${colorClass} p-3 rounded-lg border mb-4 shadow-sm inline-block">${col.title}</div><div class="grid grid-cols-10 gap-3">`; 
                            for (let r = 1; r <= col.cols; r++) { 
                                let dbId = `${col.id}-${r.toString().padStart(2, '0')}`; let searchId = dbId; let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === dbId) cellState = 'cell-active'; 
                                let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md z-10 animate-bounce">${pCount.toFixed(1)}P</div>` : ''; 
                                let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : '';
                                vHtml += `<div id="cell-${dbId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${dbId}', '${dbId}')" onclick="clickCell('${dbId}', '${searchId}')" class="h-16 rounded-xl border-2 flex flex-col items-center justify-center text-[11px] font-black cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm hover:scale-105 transition-all">${badge}<span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}번 칸</span></div>`; 
                            } 
                            vHtml += `</div></div>`; 
                        } 
                    }); vHtml += `</div>`; 
                    if(vContainer) vContainer.innerHTML = vHtml; 
                    return; 
                } 
                
                let aisleText = document.getElementById('aisle-text');
                if(aisleText) { aisleText.classList.remove('hidden'); aisleText.innerText = "통로 (Aisle)"; }
                const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; const prefix = currentZone === '실온' ? 'R-' : 'C-'; 

                activeLayout.forEach(col => { 
                    if (col.aisle) { vHtml += `<div class="w-10 md:w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1"><span class="text-yellow-600 font-black tracking-widest text-[10px] md:text-xs" style="writing-mode: vertical-rl;">통로</span></div>`; } 
                    else if (col.gap) { vHtml += `<div class="w-2 md:w-4"></div>`; } 
                    else { 
                        vHtml += `<div class="flex flex-col w-10 md:w-14 space-y-1 justify-end"><div class="text-center font-black text-xl md:text-2xl text-slate-800 pb-2">${col.id}</div>`; 
                        for (let r = col.cols; r >= 1; r--) { 
                            let displayId = `${col.id}${r}`; let dbId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                            let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                            let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
                            let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : ''; let crossFloorBadge = '';
                            if(floor === "1" && globalSearchTargets.includes(`${dbId}-2F`)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">2F 타겟</div>`; } else if(floor === "2" && globalSearchTargets.includes(dbId)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">1F 타겟</div>`; }
                            vHtml += `<div id="cell-${displayId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${displayId}', '${dbId}')" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[9px] md:text-[10px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
                        } 
                        vHtml += `</div>`; 
                    } 
                }); 
                if(vContainer) vContainer.innerHTML = vHtml; 
                
                let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
                for (let c = hCols; c >= 1; c--) { 
                    let displayId = `${hPrefix}${c}`; let dbId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                    let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                    let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
                    let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : ''; let crossFloorBadge = '';
                    if(floor === "1" && globalSearchTargets.includes(`${dbId}-2F`)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">2F 타겟</div>`; } else if(floor === "2" && globalSearchTargets.includes(dbId)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">1F 타겟</div>`; }
                    hHtml += `<div id="cell-${displayId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${displayId}', '${dbId}')" onclick="clickCell('${displayId}', '${searchId}')" class="w-10 md:w-14 h-10 rounded-[3px] flex items-center justify-center text-[10px] md:text-[11px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
                } 
                hHtml += `</div>`; 
                if(hContainer) hContainer.innerHTML = hHtml; 
            } catch(e) { console.error("Render Map Error:", e); }
        }

        async function clickCell(displayId, searchId) { 
            try {
                selectedCellId = displayId; 
                if(!searchId) { 
                    if(displayId.startsWith('W-')) { searchId = displayId; }
                    else { let floorSel = document.getElementById('floor-select'); const floor = floorSel ? floorSel.value : "1"; const prefix = currentZone === '실온' ? 'R-' : (currentZone === '냉장' ? 'C-' : ''); const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`); searchId = floor === "1" ? baseId : `${baseId}-2F`; }
                } 
                renderMap(); 
                let rs = document.getElementById('right-sidebar');
                if(rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); }
                
                const panel = document.getElementById('info-panel'); 
                let floorSel = document.getElementById('floor-select');
                const floorName = searchId.startsWith('W-') ? '입고 대기장' : (currentZone === '현장' ? '생산현장' : (floorSel ? floorSel.options[floorSel.selectedIndex].text : ''));
