import os
import httpx
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import datetime

app = FastAPI()

SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co"
SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu"
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=representation"}

class InboundData(BaseModel):
    location_id: str; category: str; item_name: str; quantity: int; pallet_count: float = 1.0; production_date: Optional[str] = None; remarks: Optional[str] = ""
class OutboundData(BaseModel):
    inventory_id: str; location_id: str; item_name: str; quantity: int; pallet_count: float = 1.0
class ProductData(BaseModel):
    category: str; item_name: str; supplier: str = "기본입고처"; daily_usage: int = 0; unit_price: int = 0; pallet_ea: int = 1
class TransferData(BaseModel):
    inventory_id: str; from_location: str; to_location: str; item_name: str; quantity: int; pallet_count: float = 1.0
class AdjustData(BaseModel):
    inventory_id: str; location_id: str; item_name: str; new_quantity: int
class PaymentUpdate(BaseModel):
    payment_status: str
class BomData(BaseModel):
    finished_product: str; material_product: str; require_qty: float
class EditInventoryData(BaseModel):
    inventory_id: str; location_id: str; item_name: str; action: str; new_quantity: Optional[int] = None; new_date: Optional[str] = None; pallet_count: Optional[float] = None

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
                    <button id="tab-floor" onclick="switchZone('현장')" class="whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200 text-sm md:text-base">생산 (Floor)</button>
                </div>
                <div class="flex items-center space-x-2 md:space-x-4 pb-2 w-full md:w-auto justify-between md:justify-end mt-2 md:mt-0">
                    <button onclick="toggleMapSearch()" class="px-2 md:px-4 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 font-black rounded-md hover:bg-indigo-100 text-xs md:text-sm flex items-center shadow-sm transition-colors whitespace-nowrap">🔍 스캔창</button>
                    <div id="fifo-btn-container" class="hidden"><button onclick="highlightFIFO()" class="px-2 md:px-4 py-1.5 bg-rose-100 border border-rose-300 text-rose-700 font-black rounded-md hover:bg-rose-200 text-xs md:text-sm flex items-center shadow-sm whitespace-nowrap">선입선출 추천</button></div>
                    <div class="flex items-center space-x-2">
                        <select id="floor-select" onchange="renderMap()" class="bg-white border-2 border-slate-300 text-slate-800 font-bold text-xs md:text-sm rounded-md px-2 md:px-4 py-1.5 shadow-sm"><option value="1">1층 (1F)</option><option value="2">2층 (2F)</option></select>
                        <button onclick="load()" class="p-1.5 bg-white border border-slate-300 rounded hover:bg-slate-100"><svg class="w-4 h-4 md:w-5 md:h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                    </div>
                </div>
            </header>
            
            <div class="flex-1 overflow-auto p-2 md:p-6 relative flex flex-col">
                
                <div id="map-search-container" class="hidden bg-white p-3 md:p-4 rounded-xl shadow-md border border-slate-200 w-full max-w-[800px] mb-4 flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-3 items-center md:items-end shrink-0 text-center mx-auto">
                    <div class="w-full md:w-1/4 text-left"><label class="block text-[10px] font-bold text-slate-500 mb-1">현재 구역 카테고리</label><select id="map-search-category" onchange="updateMapSearchItemDropdown()" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"><option value="ALL">전체</option></select></div>
                    <div class="w-full md:w-2/4 text-left"><label class="block text-[10px] font-bold text-slate-500 mb-1">품목명 (현재 탭 기준 필터링됨)</label><input type="text" id="map-search-keyword" list="map-search-item-list" placeholder="검색어 입력" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"><datalist id="map-search-item-list"></datalist></div>
                    <div class="w-full md:w-1/4 text-left flex space-x-2 md:block"><div class="flex-1"><label class="block text-[10px] font-bold text-slate-500 mb-1">찾을 개수(렉)</label><input type="number" id="map-search-count" value="1" min="1" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"></div><div class="flex flex-1 space-x-1 md:mt-2 items-end md:hidden"><button onclick="executeMapSearch()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded shadow text-xs">스캔</button><button onclick="clearSearchTargets()" class="bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold py-2 px-2 rounded shadow-sm text-xs">리셋</button></div></div>
                    <button onclick="executeMapSearch()" class="hidden md:block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded shadow transition-colors text-sm whitespace-nowrap">FIFO 스캔</button>
                    <button onclick="clearSearchTargets()" class="hidden md:block bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold py-2 px-3 rounded shadow-sm transition-colors text-sm whitespace-nowrap">초기화</button>
                </div>

                <div class="w-full overflow-x-auto custom-scrollbar flex-1 pb-10">
                    <div class="w-fit min-h-max bg-white p-4 md:p-10 rounded-xl shadow-xl border border-slate-300 transition-all mx-auto" id="map-container">
                        <div id="vertical-racks" class="flex items-end"></div>
                        <div class="h-10 md:h-14 w-full flex items-center justify-center text-slate-400 font-black tracking-[0.2em] md:tracking-[0.5em] bg-yellow-50/50 border-y-2 border-yellow-300 my-4 shadow-inner text-xs md:text-sm" id="aisle-text">통로 (Aisle)</div>
                        <div class="flex justify-end md:pr-[168px]" id="horizontal-rack"></div>
                    </div>
                </div>
            </div>
        </div>

        <div id="view-dashboard" class="flex flex-col h-full w-full absolute inset-0 p-4 md:p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex flex-col md:flex-row justify-between items-center mb-6 space-y-2 md:space-y-0">
                <h1 class="text-2xl md:text-3xl font-black text-slate-800">📊 물류 대시보드</h1>
                <select id="dash-period" onchange="updateDashboard()" class="w-full md:w-auto border-2 border-indigo-200 rounded-lg p-2 font-bold text-indigo-700 bg-white outline-none"><option value="daily">일간 (Daily)</option><option value="weekly">주간 (Weekly)</option><option value="monthly">월간 (Monthly)</option></select>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border-t-4 border-emerald-500 flex flex-col items-center justify-center">
                    <div class="flex justify-between items-center mb-4 w-full"><div class="text-slate-500 font-black text-xs md:text-sm">창고 적재율</div><select id="dash-zone-select" onchange="updateDashboard()" class="border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-600 outline-none bg-slate-50"><option value="ALL">전체 창고</option><option value="ROOM">실온 (Room)</option><option value="COLD">냉장 (Cold)</option></select></div>
                    <div class="relative w-32 h-32 md:w-36 md:h-36 rounded-full donut-ring flex items-center justify-center shadow-inner" id="dash-donut" style="background: conic-gradient(#10b981 0%, #e2e8f0 0%);"><div class="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center shadow-sm"><span class="text-2xl md:text-3xl font-black text-emerald-600" id="dash-cap-percent">0%</span><span class="text-[9px] md:text-[10px] text-slate-400 font-bold" id="dash-cap-text">0 / 0 파레트</span></div></div>
                </div>
                <div class="col-span-1 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="bg-indigo-50 p-5 rounded-2xl shadow-sm border border-indigo-100 flex flex-col justify-between"><div class="flex justify-between items-center mb-2"><div class="font-black text-indigo-800 text-sm md:text-base">❄️ 냉장 창고</div><div class="text-indigo-500 font-bold text-sm" id="dash-cold-percent">0%</div></div><div class="space-y-2 text-xs md:text-sm mt-2"><div class="flex justify-between text-slate-600"><span class="font-bold">총 수용량</span><span class="font-black" id="dash-cold-total">0</span></div><div class="flex justify-between text-indigo-600"><span class="font-bold">적재 볼륨</span><span class="font-black" id="dash-cold-occ">0</span></div><div class="flex justify-between text-emerald-600"><span class="font-bold">빈 렉 수</span><span class="font-black" id="dash-cold-empty">0</span></div></div></div>
                    <div class="bg-orange-50 p-5 rounded-2xl shadow-sm border border-orange-100 flex flex-col justify-between"><div class="flex justify-between items-center mb-2"><div class="font-black text-orange-800 text-sm md:text-base">☀️ 실온 창고</div><div class="text-orange-500 font-bold text-sm" id="dash-room-percent">0%</div></div><div class="space-y-2 text-xs md:text-sm mt-2"><div class="flex justify-between text-slate-600"><span class="font-bold">총 수용량</span><span class="font-black" id="dash-room-total">0</span></div><div class="flex justify-between text-orange-600"><span class="font-bold">적재 볼륨</span><span class="font-black" id="dash-room-occ">0</span></div><div class="flex justify-between text-emerald-600"><span class="font-bold">빈 렉 수</span><span class="font-black" id="dash-room-empty">0</span></div></div></div>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-blue-500"><div class="text-slate-500 font-bold text-xs md:text-sm mb-1 flex items-center justify-between"><span>기간 내 입고량 (IN)</span><span class="bg-blue-100 text-blue-600 text-[9px] px-2 py-0.5 rounded font-black">파레트 합산</span></div><div class="text-3xl md:text-4xl font-black text-blue-600 mt-2" id="dash-in">0 P</div></div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-rose-500"><div class="text-slate-500 font-bold text-xs md:text-sm mb-1 flex items-center justify-between"><span>기간 내 출고량 (OUT)</span><span class="bg-rose-100 text-rose-600 text-[9px] px-2 py-0.5 rounded font-black">파레트 합산</span></div><div class="text-3xl md:text-4xl font-black text-rose-600 mt-2" id="dash-out">0 P</div></div>
            </div>
            <div id="admin-finance-panel" class="hidden grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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

        <div id="view-safety" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-8">발주 및 안전재고</h1><div id="safety-list"></div>
        </div>
        <div id="view-products" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-8">마스터 DB</h1><div id="fp-list"></div><div id="pm-list"></div><div id="bom-list"></div>
        </div>
        <div id="view-accounting" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-8">정산 및 회계</h1><div id="acc-list"></div>
        </div>
        <div id="view-production" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-4">🏭 생산 관리 시스템</h1><p class="text-slate-500 font-bold">BOM 레시피를 기반으로 한 완제품 생산 및 자재 자동 차감(Backflush) 기능이 곧 업데이트됩니다!</p>
        </div>
        <div id="view-outbound" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-4">🚚 출고 관리 시스템</h1><p class="text-slate-500 font-bold">거래처별 출고 지시 및 패킹 리스트 생성 기능이 곧 업데이트됩니다!</p>
        </div>

    </main>

    <aside id="right-sidebar" class="hidden fixed md:relative bottom-16 md:bottom-0 right-0 w-full md:w-80 h-[60vh] md:h-full bg-white border-t md:border-l border-slate-300 flex-col shadow-[0_-10px_20px_rgba(0,0,0,0.15)] md:shadow-lg z-40 shrink-0 transition-all">
        <div class="p-3 md:p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center"><h2 class="text-base md:text-lg font-black text-slate-800 flex items-center"><svg class="w-4 h-4 md:w-5 md:h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> 위치 상세 정보</h2><button onclick="closeInfoPanel()" class="md:hidden text-slate-500 font-bold px-2 py-1 bg-slate-200 rounded text-xs">닫기 ⬇️</button></div>
        <div class="p-4 md:p-6 flex-1 overflow-y-auto pb-20 md:pb-6" id="info-panel"><div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div></div>
    </aside>

    <script>
        let globalOccupancy = []; let productMaster = []; let finishedProductMaster = []; let globalHistory = []; let bomMaster = []; 
        let globalSearchTargets = []; let currentZone = '실온'; let selectedCellId = null; let isAdmin = false;
        
        const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
        const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];
        const layoutFloor = [ { id: 'FL-C', title: '❄️ 생산 현장 (원재료/냉장)', cols: 20 }, { aisle: true, text: '====================' }, { id: 'FL-R', title: '📦 생산 현장 (부자재/실온)', cols: 20 } ];

        async function load() {
            try {
                const [occRes, prodRes, fpRes, histRes, bomRes] = await Promise.all([ fetch('/api/inventory'), fetch('/api/products'), fetch('/api/finished_products'), fetch('/api/history'), fetch('/api/bom') ]);
                globalOccupancy = await occRes.json(); productMaster = await prodRes.json(); finishedProductMaster = await fpRes.json(); globalHistory = await histRes.json(); bomMaster = await bomRes.json();
                updateMapSearchCategoryDropdown(); updateSummarySupplierDropdown(); renderMap(); updateDashboard();
                if(selectedCellId) clickCell(selectedCellId); else clearInfo();
            } catch (e) { console.error("로딩 에러:", e); }
        }

        function showView(viewName) {
            document.querySelectorAll('.nav-btn-pc').forEach(btn => { btn.className = "nav-btn-pc w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all"; });
            document.querySelectorAll('.nav-btn-mo').forEach(btn => { if(btn.id !== 'admin-btn-mo') { btn.className = "nav-btn-mo flex-1 py-2 rounded-md text-[11px] border border-slate-200 text-slate-600 bg-white font-bold flex flex-col items-center justify-center mx-0.5 transition-all"; } });

            document.querySelectorAll('.nav-btn-pc.target-' + viewName).forEach(btn => { btn.className = "nav-btn-pc target-" + viewName + " w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all" + (viewName==='safety' ? ' text-rose-600 border-rose-200 bg-rose-50' : '') + (viewName==='accounting' ? ' text-yellow-700 border-yellow-300 bg-yellow-50' : ''); });
            document.querySelectorAll('.nav-btn-mo.target-' + viewName).forEach(btn => { btn.className = "nav-btn-mo target-" + viewName + " flex-1 py-2 rounded-md text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 font-black flex flex-col items-center justify-center mx-0.5 shadow-inner transition-all"; });

            ['view-inventory', 'view-dashboard', 'view-search', 'view-products', 'view-safety', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); });
            
            if(viewName === 'inventory') { 
                if(window.innerWidth >= 768) { document.getElementById('right-sidebar').classList.remove('hidden'); document.getElementById('right-sidebar').classList.add('flex'); } 
                else { if(selectedCellId) { document.getElementById('right-sidebar').classList.remove('hidden'); document.getElementById('right-sidebar').classList.add('flex'); } else { document.getElementById('right-sidebar').classList.add('hidden'); document.getElementById('right-sidebar').classList.remove('flex'); } }
                renderMap(); 
            } else { document.getElementById('right-sidebar').classList.add('hidden'); document.getElementById('right-sidebar').classList.remove('flex'); }
            
            document.getElementById('view-' + viewName).classList.remove('hidden'); document.getElementById('view-' + viewName).classList.add('flex');
            if(viewName === 'search') { updateSummarySupplierDropdown(); } else if(viewName === 'dashboard') updateDashboard(); 
        }

        function adminLogin() {
            if(isAdmin) { isAdmin = false; alert("관리자 모드 해제"); document.getElementById('admin-btn-pc').innerText = "🔒 관리자"; document.getElementById('admin-btn-mo').innerHTML = "🔒<span class='mt-1'>관리자</span>"; document.getElementById('admin-btn-mo').classList.remove('bg-rose-100', 'text-rose-700', 'border-rose-300'); document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden')); if(document.getElementById('view-accounting').classList.contains('flex')) showView('dashboard'); load(); return; }
            const pw = prompt("비밀번호 입력 (1234):"); if(pw === "1234") { isAdmin = true; alert("관리자 권한 활성화"); document.getElementById('admin-btn-pc').innerText = "🔓 관리자 (ON)"; document.getElementById('admin-btn-mo').innerHTML = "🔓<span class='mt-1'>관리자</span>"; document.getElementById('admin-btn-mo').classList.add('bg-rose-100', 'text-rose-700', 'border-rose-300'); document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden')); load(); }
        }

        function closeInfoPanel() { document.getElementById('right-sidebar').classList.add('hidden'); document.getElementById('right-sidebar').classList.remove('flex'); selectedCellId = null; renderMap(); }
        function toggleMapSearch() { const container = document.getElementById('map-search-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }

        function getDynamicPalletCount(itemObj) {
            if(!itemObj) return 0;
            let pInfo = finishedProductMaster.find(p => p.item_name === itemObj.item_name && p.supplier === (itemObj.remarks||"기본입고처")) || productMaster.find(p => p.item_name === itemObj.item_name && p.supplier === (itemObj.remarks||"기본입고처")) || finishedProductMaster.find(p => p.item_name === itemObj.item_name) || productMaster.find(p => p.item_name === itemObj.item_name);
            if (pInfo && pInfo.pallet_ea > 0) return itemObj.quantity / pInfo.pallet_ea;
            return itemObj.pallet_count || 1;
        }

        function updateMapSearchCategoryDropdown() {
            let sourceItems = [];
            if (currentZone === '실온') sourceItems = productMaster.filter(p => !p.category.includes('원란'));
            else if (currentZone === '냉장') sourceItems = productMaster.filter(p => p.category.includes('원란'));
            else if (currentZone === '현장') sourceItems = finishedProductMaster;
            const categories = [...new Set(sourceItems.map(p => p.category))].filter(Boolean).sort();
            const catSelect = document.getElementById('map-search-category');
            if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateMapSearchItemDropdown(); }
        }

        function updateMapSearchItemDropdown() {
            let sourceItems = [];
            if (currentZone === '실온') sourceItems = productMaster.filter(p => !p.category.includes('원란'));
            else if (currentZone === '냉장') sourceItems = productMaster.filter(p => p.category.includes('원란'));
            else if (currentZone === '현장') sourceItems = finishedProductMaster;
            const catSelect = document.getElementById('map-search-category'); 
            if (catSelect && catSelect.value !== 'ALL') sourceItems = sourceItems.filter(p => p.category === catSelect.value); 
            const uniqueItems = [...new Set(sourceItems.map(p => p.item_name))].filter(Boolean).sort();
            const datalist = document.getElementById('map-search-item-list');
            if(datalist) { datalist.innerHTML = uniqueItems.map(name => `<option value="${name}">`).join(''); }
            document.getElementById('map-search-keyword').value = '';
        }
        
        function getSummarySourceItems() {
            const type = document.getElementById('summary-type').value;
            if (type === 'FINISHED') return finishedProductMaster;
            if (type === 'MATERIAL') return productMaster.filter(p => !p.category.includes('원란'));
            if (type === 'RAW') return productMaster.filter(p => p.category.includes('원란'));
            return [...finishedProductMaster, ...productMaster];
        }

        function updateSummarySupplierDropdown() {
            let items = getSummarySourceItems(); let suppliers = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
            const supSelect = document.getElementById('summary-supplier');
            if (supSelect) { supSelect.innerHTML = `<option value="ALL">전체 입고처</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join(''); updateSummaryCategoryDropdown(); }
        }

        function updateSummaryCategoryDropdown() {
            let items = getSummarySourceItems(); const supSelect = document.getElementById('summary-supplier'); const supplier = supSelect ? supSelect.value : 'ALL';
            if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
            let categories = [...new Set(items.map(p => p.category))].filter(Boolean).sort();
            const catSelect = document.getElementById('summary-category');
            if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체 카테고리</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateSummaryItemDropdown(); }
        }
        
        function updateSummaryItemDropdown() {
            let items = getSummarySourceItems(); const supSelect = document.getElementById('summary-supplier'); const catSelect = document.getElementById('summary-category');
            const supplier = supSelect ? supSelect.value : 'ALL'; const cat = catSelect ? catSelect.value : 'ALL';
            if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
            if (cat !== 'ALL') items = items.filter(p => p.category === cat);
            const uniqueItems = [...new Set(items.map(p => p.item_name))].filter(Boolean).sort();
            const itemSelect = document.getElementById('summary-item');
            if(itemSelect) { itemSelect.innerHTML = `<option value="">품목을 선택하세요</option>` + uniqueItems.map(name => `<option value="${name}">${name}</option>`).join(''); }
            calculateSummary();
        }
        
        function calculateSummary() {
            const itemName = document.getElementById('summary-item').value; const supplier = document.getElementById('summary-supplier').value;
            let breakdown = {}; let totalQty = 0; let totalPallet = 0;
            if(itemName) {
                globalOccupancy.forEach(item => {
                    let itemSupplier = item.remarks || "기본입고처";
                    if(item.item_name === itemName) {
                        if (supplier === 'ALL' || itemSupplier === supplier) {
                            if(!breakdown[itemSupplier]) breakdown[itemSupplier] = { qty: 0, pallet: 0 };
                            let dynP = getDynamicPalletCount(item);
                            breakdown[itemSupplier].qty += item.quantity; breakdown[itemSupplier].pallet += dynP;
                            totalQty += item.quantity; totalPallet += dynP;
                        }
                    }
                });
            }
            document.getElementById('summary-result').innerHTML = `${totalQty.toLocaleString()} <span class="text-xl md:text-2xl text-indigo-400 font-bold">EA</span>`;
            document.getElementById('summary-pallet').innerText = `${totalPallet.toFixed(1)} P (부피 합산)`;
            
            let breakdownHtml = ''; let supKeys = Object.keys(breakdown);
            if(supKeys.length > 0) {
                breakdownHtml = '<div class="space-y-2 mt-4">';
                supKeys.forEach(sup => { breakdownHtml += `<div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm md:text-base"><span class="font-bold text-slate-700 text-left w-1/3 truncate" title="${sup}">${sup}</span><span class="font-black text-indigo-600 w-1/3 text-right">${breakdown[sup].qty.toLocaleString()} EA</span><span class="font-bold text-rose-500 w-1/3 text-right">${breakdown[sup].pallet.toFixed(1)} P</span></div>`; });
                breakdownHtml += '</div>';
            }
            document.getElementById('summary-breakdown').innerHTML = breakdownHtml;
        }

        function findItemLocationFromSummary() {
            const itemName = document.getElementById('summary-item').value; const supplier = document.getElementById('summary-supplier').value;
            if(!itemName) return alert("먼저 위치를 확인할 품목을 선택해주세요.");
            let targets = globalOccupancy.filter(item => { let itemSupplier = item.remarks || "기본입고처"; if(item.item_name === itemName) { if (supplier === 'ALL' || itemSupplier === supplier) return true; } return false; });
            if(targets.length === 0) return alert("현재 창고에 해당 품목의 재고가 없습니다.");
            globalSearchTargets = targets.map(t => t.location_id);
            let firstLoc = globalSearchTargets[0];
            if (firstLoc.startsWith('FL-')) { currentZone = '현장'; } else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
            showView('inventory');
            let zoneMap = {'실온':'실온(Room)', '냉장':'냉장(Cold)', '현장':'현장(Floor)'}; let foundZones = new Set();
            globalSearchTargets.forEach(loc => { if(loc.startsWith('FL-')) foundZones.add('현장'); else if(loc.startsWith('C-')) foundZones.add('냉장'); else foundZones.add('실온'); });
            alert(`[${itemName}] 위치 추적 완료!\\n(발견 구역: ${Array.from(foundZones).map(z => zoneMap[z]).join(', ')})`); 
        }

        function updateZoneTabs() {
            ['tab-room', 'tab-cold', 'tab-floor'].forEach(id => { document.getElementById(id).className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200 text-sm md:text-base"; }); 
            if(currentZone === '실온') { document.getElementById('tab-room').className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base"; document.getElementById('fifo-btn-container').classList.add('hidden'); document.getElementById('floor-select').classList.remove('hidden'); document.getElementById('floor-select-label').classList.remove('hidden'); } 
            else if(currentZone === '냉장') { document.getElementById('tab-cold').className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base"; document.getElementById('fifo-btn-container').classList.remove('hidden'); document.getElementById('floor-select').classList.remove('hidden'); document.getElementById('floor-select-label').classList.remove('hidden'); } 
            else if(currentZone === '현장') { document.getElementById('tab-floor').className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-emerald-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base"; document.getElementById('fifo-btn-container').classList.add('hidden'); document.getElementById('floor-select').classList.add('hidden'); document.getElementById('floor-select-label').classList.add('hidden'); } 
            updateMapSearchCategoryDropdown(); 
        }

        function switchZone(zone) { 
            globalSearchTargets = []; currentZone = zone; selectedCellId = null; 
            document.getElementById('right-sidebar').classList.add('hidden'); document.getElementById('right-sidebar').classList.remove('flex');
            updateZoneTabs(); renderMap(); 
        }

        function clearSearchTargets() { globalSearchTargets = []; document.getElementById('map-search-keyword').value = ''; renderMap(); }

        function renderMap() { 
            const floor = document.getElementById('floor-select').value; const vContainer = document.getElementById('vertical-racks'); const hContainer = document.getElementById('horizontal-rack'); 
            const occMap = {}; const palletMap = {}; globalOccupancy.forEach(item => { occMap[item.location_id] = true; palletMap[item.location_id] = (palletMap[item.location_id] || 0) + getDynamicPalletCount(item); }); 
            let vHtml = ''; hContainer.innerHTML = ''; 
            
            if(currentZone === '현장') { 
                document.getElementById('aisle-text').classList.add('hidden'); vHtml += `<div class="w-full min-w-[700px]">`; 
                layoutFloor.forEach(col => { 
                    if(col.aisle) { vHtml += `<div class="w-full h-10 bg-yellow-50/50 flex items-center justify-center border-y-2 border-yellow-300 shadow-inner my-6 rounded-lg"><span class="text-yellow-600 font-black tracking-widest text-sm">${col.text}</span></div>`; } 
                    else { 
                        let colorClass = col.id === 'FL-C' ? 'text-indigo-800 bg-indigo-50 border-indigo-200' : 'text-orange-800 bg-orange-50 border-orange-200'; 
                        vHtml += `<div class="mb-4 bg-white p-5 rounded-2xl shadow-md border border-slate-200"><div class="text-lg font-black ${colorClass} p-3 rounded-lg border mb-4 shadow-sm inline-block">${col.title}</div><div class="grid grid-cols-10 gap-3">`; 
                        for (let r = 1; r <= col.cols; r++) { 
                            let dbId = `${col.id}-${r.toString().padStart(2, '0')}`; let searchId = dbId; let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === dbId) cellState = 'cell-active'; 
                            let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md z-10 animate-bounce">${pCount.toFixed(1)}P</div>` : ''; 
                            let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : '';
                            vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}', '${searchId}')" class="h-16 rounded-xl border-2 flex flex-col items-center justify-center text-[11px] font-black cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm hover:scale-105 transition-all">${badge}<span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}번 칸</span></div>`; 
                        } 
                        vHtml += `</div></div>`; 
                    } 
                }); vHtml += `</div>`; vContainer.innerHTML = vHtml; return; 
            } 
            
            document.getElementById('aisle-text').classList.remove('hidden'); document.getElementById('aisle-text').innerText = "통로 (Aisle)"; 
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
                        vHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[9px] md:text-[10px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
                    } 
                    vHtml += `</div>`; 
                } 
            }); 
            vContainer.innerHTML = vHtml; 
            
            let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
            for (let c = hCols; c >= 1; c--) { 
                let displayId = `${hPrefix}${c}`; let dbId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
                let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : ''; let crossFloorBadge = '';
                if(floor === "1" && globalSearchTargets.includes(`${dbId}-2F`)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">2F 타겟</div>`; } else if(floor === "2" && globalSearchTargets.includes(dbId)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">1F 타겟</div>`; }
                hHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="w-10 md:w-14 h-10 rounded-[3px] flex items-center justify-center text-[10px] md:text-[11px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
            } 
            hHtml += `</div>`; hContainer.innerHTML = hHtml; 
        }

        async function clickCell(displayId, searchId) { 
            selectedCellId = displayId; 
            if(!searchId) { const floor = document.getElementById('floor-select').value; const prefix = currentZone === '실온' ? 'R-' : (currentZone === '냉장' ? 'C-' : ''); const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`); searchId = floor === "1" ? baseId : `${baseId}-2F`; } 
            renderMap(); document.getElementById('right-sidebar').classList.remove('hidden'); document.getElementById('right-sidebar').classList.add('flex');
            
            const panel = document.getElementById('info-panel'); const floorName = currentZone === '현장' ? '생산현장' : document.getElementById('floor-select').options[document.getElementById('floor-select').selectedIndex].text; const items = globalOccupancy.filter(x => x.location_id === searchId); let dateLabel = currentZone === '냉장' ? '산란일' : '입고일'; 
            let panelHtml = `<div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4"><div class="flex justify-between items-start"><div><div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div><div class="text-3xl font-black text-indigo-900">${displayId}</div></div><div class="text-right"><span class="inline-block bg-white text-indigo-700 text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floorName}</span></div></div></div>`; 
            if(items.length > 0) { 
                panelHtml += `<div class="mb-2 text-xs font-bold text-slate-500">적재 목록 (${items.length}건)</div>`; 
                items.forEach(item => { 
                    let dateHtml = item.production_date ? `<div class="text-xs text-rose-600 font-bold mt-1">${dateLabel}: ${item.production_date}</div>` : ''; 
                    let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks) || productMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks); 
                    let cost = pInfo ? (pInfo.unit_price * item.quantity).toLocaleString() : '0'; 
                    let dynPallet = getDynamicPalletCount(item); let palletDisplay = dynPallet > 0 ? `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px] ml-1 font-black">${dynPallet.toFixed(1)} P</span>` : ''; 
                    let editBtn = isAdmin ? `<button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date || ''}', '${searchId}', '${item.remarks || ''}')" class="flex-1 bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200 py-1.5 rounded text-[11px] font-bold transition-colors mt-2 w-full">⚙️ 편집/삭제</button>` : '';
                    panelHtml += `<div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3"><div class="flex justify-between items-start mb-2"><div><span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span><div class="font-black text-sm text-slate-800 mt-1 break-keep">${item.item_name}</div><div class="text-[10px] text-slate-400 font-bold text-rose-600">입고처: ${item.remarks||'기본'}</div></div><div class="text-right"><div class="text-base font-bold text-indigo-600">${item.quantity.toLocaleString()} EA ${palletDisplay}</div></div></div>${dateHtml}<div class="flex space-x-2 mt-3 border-t pt-2"><button onclick="processTransfer('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-1.5 rounded text-[11px] font-bold transition-colors">위치 이동</button><button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-[11px] font-bold transition-colors">선택 출고</button></div>${editBtn}</div>`; 
                }); 
            } else { panelHtml += `<div class="text-center text-slate-400 py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-4"><b class="text-emerald-600 inline-block">비어있습니다 (Empty)</b></div>`; } 
            
            let allItems = [...finishedProductMaster, ...productMaster]; const catOptions = [...new Set(allItems.map(p => p.category))].map(c => `<option value="${c}">${c}</option>`).join(''); 
            panelHtml += `<div class="mt-4 pt-4 border-t border-slate-200"><h3 class="text-sm font-black text-slate-700 mb-3 flex items-center"><svg class="w-4 h-4 mr-1 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> 신규 입고</h3><div class="space-y-2"><div class="flex space-x-2"><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">카테고리</label><select id="in-cat" onchange="updateProductDropdown()" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">선택</option>${catOptions}</select></div><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">품목명</label><select id="in-item" onchange="updateSupplierDropdown()" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">대기</option></select></div></div><div class="flex space-x-2"><div class="w-1/2"><label class="block text-[10px] font-bold text-rose-500 mb-1">입고처</label><select id="in-supplier" onchange="updateQtyBySupplier()" class="w-full border border-rose-300 bg-rose-50 rounded p-1.5 text-xs font-bold"><option value="">품목 선택</option></select></div><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">${dateLabel}</label><input type="date" id="in-date" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"></div></div><div><label class="block text-[10px] font-bold text-indigo-600 mb-1">수량 (EA)</label><input type="number" id="in-qty" value="1" min="1" class="w-full border border-indigo-300 bg-indigo-50 rounded p-1.5 text-xs font-black text-indigo-700"></div><button onclick="processInbound('${searchId}')" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-black shadow-md transition-colors text-sm mt-1 mb-8 md:mb-0">입고 처리</button></div></div>`; 
            panel.innerHTML = panelHtml; 
        }
        function updateProductDropdown() { const cat = document.getElementById('in-cat').value; let allItems = [...finishedProductMaster, ...productMaster]; const items = [...new Set(allItems.filter(p => p.category === cat).map(p => p.item_name))]; document.getElementById('in-item').innerHTML = items.map(name => `<option value="${name}">${name}</option>`).join(''); updateSupplierDropdown(); }
        function updateSupplierDropdown() { const cat = document.getElementById('in-cat').value; const item = document.getElementById('in-item').value; let allItems = [...finishedProductMaster, ...productMaster]; const matchingItems = allItems.filter(p => p.category === cat && p.item_name === item); const suppliers = matchingItems.map(p => p.supplier); document.getElementById('in-supplier').innerHTML = suppliers.map(s => `<option value="${s}">${s}</option>`).join(''); if(matchingItems.length > 0) { let defaultEa = matchingItems[0].pallet_ea > 0 ? matchingItems[0].pallet_ea : 1; document.getElementById('in-qty').value = defaultEa; } }
        function updateQtyBySupplier() { const cat = document.getElementById('in-cat').value; const item = document.getElementById('in-item').value; const sup = document.getElementById('in-supplier').value; let allItems = [...finishedProductMaster, ...productMaster]; const matched = allItems.find(p => p.category === cat && p.item_name === item && p.supplier === sup); if(matched && matched.pallet_ea > 0) { document.getElementById('in-qty').value = matched.pallet_ea; } }

        function updateDashboard() { 
            const period = document.getElementById('dash-period').value; let startDate = new Date(); if(period === 'daily') startDate.setDate(startDate.getDate() - 1); else if(period === 'weekly') startDate.setDate(startDate.getDate() - 7); else if(period === 'monthly') startDate.setMonth(startDate.getMonth() - 1); 
            let inPallets = 0, outPallets = 0, productionCost = 0; let allItems = [...finishedProductMaster, ...productMaster];
            globalHistory.forEach(log => { if(new Date(log.created_at) >= startDate) { if(log.action_type === '입고') inPallets += (log.pallet_count || 1); if(log.action_type === '출고') { outPallets += (log.pallet_count || 1); let pInfo = allItems.find(p => p.item_name === log.item_name); if(pInfo) productionCost += (pInfo.unit_price * log.quantity); } } }); 
            document.getElementById('dash-in').innerText = inPallets.toFixed(1) + ' P'; document.getElementById('dash-out').innerText = outPallets.toFixed(1) + ' P'; 
            let totalRoom = 0, occRoom = 0, totalCold = 0, occCold = 0; let valRoom = 0, valCold = 0; 
            globalOccupancy.forEach(item => { let dynP = getDynamicPalletCount(item); let pInfo = allItems.find(prod => prod.item_name === item.item_name && prod.supplier === item.remarks); let val = pInfo ? pInfo.unit_price * item.quantity : 0; if(item.location_id.startsWith('R-')) { occRoom += dynP; valRoom += val; } else if(item.location_id.startsWith('C-')) { occCold += dynP; valCold += val; } else { valRoom += val; } }); 
            layoutRoom.forEach(col => { if(col.cols) totalRoom += col.cols * 2; }); totalRoom += 20; layoutCold.forEach(col => { if(col.cols) totalCold += col.cols * 2; }); totalCold += 16; let totalAll = totalRoom + totalCold; let occAll = occRoom + occCold; 
            const dashZone = document.getElementById('dash-zone-select').value; let finalOcc = occAll, finalTotal = totalAll; if(dashZone === 'ROOM') { finalOcc = occRoom; finalTotal = totalRoom; } else if(dashZone === 'COLD') { finalOcc = occCold; finalTotal = totalCold; }
            let capRate = finalTotal > 0 ? Math.round((finalOcc / finalTotal) * 100) : 0; document.getElementById('dash-cap-percent').innerText = capRate + '%'; document.getElementById('dash-cap-text').innerText = `${finalOcc.toFixed(1)} / ${finalTotal} 파레트`; let color = capRate > 100 ? '#e11d48' : '#10b981'; document.getElementById('dash-donut').style.background = `conic-gradient(${color} 0% ${Math.min(capRate, 100)}%, #e2e8f0 ${Math.min(capRate, 100)}% 100%)`; 
            document.getElementById('dash-room-total').innerText = totalRoom; document.getElementById('dash-room-occ').innerText = occRoom.toFixed(1); document.getElementById('dash-room-empty').innerText = Math.max(0, totalRoom - Math.floor(occRoom)); document.getElementById('dash-room-percent').innerText = totalRoom > 0 ? Math.round((occRoom/totalRoom)*100) + '%' : '0%'; document.getElementById('dash-cold-total').innerText = totalCold; document.getElementById('dash-cold-occ').innerText = occCold.toFixed(1); document.getElementById('dash-cold-empty').innerText = Math.max(0, totalCold - Math.floor(occCold)); document.getElementById('dash-cold-percent').innerText = totalCold > 0 ? Math.round((occCold/totalCold)*100) + '%' : '0%'; 
        }

        async function processInbound(locId) { const cat = document.getElementById('in-cat').value; const item = document.getElementById('in-item').value; const qty = parseInt(document.getElementById('in-qty').value); let date = document.getElementById('in-date').value; const supplier = document.getElementById('in-supplier').value; if(!cat || !item || isNaN(qty)) return alert("필수값 입력 요망"); if(!date && currentZone !== '냉장') { let t = new Date(); date = t.toISOString().split('T')[0]; } let dynPallet = getDynamicPalletCount({item_name: item, remarks: supplier, quantity: qty}); try { const res = await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ location_id: locId, category: cat, item_name: item, quantity: qty, pallet_count: dynPallet, production_date: date || null, remarks: supplier }) }); const result = await res.json(); if(result.status === 'success') { alert("입고 완료!"); load(); } else { alert(`입고 실패: ${result.message}`); } } catch(e) {} }
        async function processOutbound(invId, itemName, maxQty, currentPallet, locId) { const qtyStr = prompt(`[${itemName}] 소진할 수량(EA)을 입력하세요. (최대 ${maxQty}EA)`, maxQty); if(!qtyStr) return; const qty = parseInt(qtyStr); if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량"); const outPallet = getDynamicPalletCount({item_name: itemName, remarks: null, quantity: qty}); try { const res = await fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: qty, pallet_count: outPallet }) }); const result = await res.json(); if(result.status === 'success') { alert("출고 완료!"); load(); } else { alert(`출고 실패: ${result.message}`); } } catch(e) {} }
        async function processTransfer(invId, itemName, maxQty, currentPallet, fromLoc) { const qtyStr = prompt(`[${itemName}] 이동시킬 수량(EA)을 입력하세요. (최대 ${maxQty}EA)`, maxQty); if(!qtyStr) return; const qty = parseInt(qtyStr); if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량"); const toLoc = prompt(`[${itemName}] ${qty}EA를 이동할 목적지를 입력하세요\\n(창고 예시: C-B-02-1F, 현장 예시: FL-C-01)`, "FL-C-01"); if(!toLoc) return; const movePallet = getDynamicPalletCount({item_name: itemName, remarks: null, quantity: qty}); try { const res = await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc.toUpperCase(), item_name: itemName, quantity: qty, pallet_count: movePallet }) }); const result = await res.json(); if(result.status === 'success') { alert("이동 완료!"); load(); } else { alert(`이동 실패: ${result.message}`); } } catch(e) {} }
        async function editInventoryItem(invId, itemName, qty, date, locId, remarks) {
            let action = prompt(`[${itemName}] 편집 메뉴\\n\\n1: 수량 수정 (EA)\\n2: 날짜 수정 (YYYY-MM-DD)\\n3: 기록 완전 삭제 (오입력 취소)\\n\\n원하시는 작업 번호를 입력하세요:`);
            if (action === '1') { let newQtyStr = prompt(`새로운 수량(EA)을 입력하세요:\\n(현재 수량: ${qty} EA)`, qty); if(newQtyStr) { let newQty = parseInt(newQtyStr); if(newQty > 0) { let newPallet = getDynamicPalletCount({item_name: itemName, remarks: remarks, quantity: newQty}); await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'UPDATE_QTY', new_quantity: newQty, pallet_count: newPallet }) }); alert("수량 수정 완료!"); load(); } else alert("올바른 수량을 입력하세요."); } } 
            else if (action === '2') { let newDate = prompt(`새로운 날짜를 입력하세요:\\n(형식: YYYY-MM-DD)`, date || ''); if(newDate !== null) { await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'UPDATE_DATE', new_date: newDate }) }); alert("날짜 수정 완료!"); load(); } } 
            else if (action === '3') { if(confirm(`⚠️ 정말 [${itemName}]의 이 재고 기록을 완전히 삭제하시겠습니까?\\n(실수로 입고 버튼을 두 번 누른 경우 사용하세요)`)) { await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'DELETE' }) }); alert("재고 삭제 완료!"); load(); } }
        }
        
        function executeMapSearch() { 
            const catSelect = document.getElementById('map-search-category').value; const keyword = document.getElementById('map-search-keyword').value.trim().toLowerCase(); const countStr = document.getElementById('map-search-count').value; const count = parseInt(countStr); 
            if(catSelect === 'ALL' && !keyword) return alert("카테고리를 선택하거나 검색할 단어를 입력해주세요."); 
            let matches = globalOccupancy; if(catSelect !== 'ALL') matches = matches.filter(x => x.category === catSelect); if(keyword) matches = matches.filter(x => x.item_name.toLowerCase().includes(keyword));
            if(matches.length === 0) return alert("조건에 맞는 품목이 현재 구역에 없습니다."); 
            matches.sort((a, b) => { let tA = a.production_date ? new Date(a.production_date).getTime() : Infinity; let tB = b.production_date ? new Date(b.production_date).getTime() : Infinity; return tA - tB; }); 
            let targets = matches.slice(0, count); globalSearchTargets = targets.map(t => t.location_id);
            let firstLoc = globalSearchTargets[0];
            if (firstLoc.startsWith('FL-')) { currentZone = '현장'; } else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
            updateZoneTabs(); renderMap(); 
        }

        window.onload = function() { load(); showView('dashboard'); };
    </script>
</body>
</html>
"""

@app.get("/")
async def serve_ui(): return HTMLResponse(content=HTML_CONTENT)

@app.get("/logo.jpg")
async def serve_logo():
    logo_path = os.path.join("public", "logo.jpg")
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
            fin = str(r.get("완제품명", "")).strip()
            mat = str(r.get("부자재명", "")).strip()
            if not fin or not mat: continue
            try: qty = float(str(r.get("소요수량(EA)", "0")).replace(',', ''))
            except: qty = 0
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
            except: usage = 0
            try: price = int(float(str(r.get("단가(비용)", "0")).replace(',', '')))
            except: price = 0
            try: ea = int(float(str(r.get("1P기준수량(EA)", "1")).replace(',', '')))
            except: ea = 1
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
            except: usage = 0
            try: price = int(float(str(r.get("단가(매출)", str(r.get("단가(비용)", "0")))).replace(',', '')))
            except: price = 0
            try: ea = int(float(str(r.get("1P기준수량(EA)", "1")).replace(',', '')))
            except: ea = 1
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
        log_payload = inv_payload.copy(); log_payload["action_type"] = "입고"; log_payload["payment_status"] = "미지급"
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=log_payload, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/outbound")
async def outbound_stock(data: OutboundData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json(); current_qty = inv[0]['quantity']; current_pallet = inv[0].get('pallet_count', 1.0)
        if data.quantity >= current_qty: await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        else: await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity, "pallet_count": current_pallet - data.pallet_count}, headers=HEADERS)
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "출고", "item_name": data.item_name, "quantity": data.quantity, "pallet_count": data.pallet_count}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/transfer")
async def transfer_stock(data: TransferData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json(); item_data = inv[0]; current_qty = item_data['quantity']; current_pallet = item_data.get('pallet_count', 1.0)
        
        to_loc = data.to_location.upper()
        if not to_loc.startswith("FL-") and not to_loc.startswith("R-") and not to_loc.startswith("C-"):
            if "C-" in data.from_location: to_loc = "C-" + to_loc
            else: to_loc = "R-" + to_loc

        if data.quantity >= current_qty: await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"location_id": to_loc}, headers=HEADERS)
        else:
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity, "pallet_count": current_pallet - data.pallet_count}, headers=HEADERS)
            new_row = item_data.copy(); del new_row['id']; del new_row['created_at']; new_row['location_id'] = to_loc; new_row['quantity'] = data.quantity; new_row['pallet_count'] = data.pallet_count
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

@app.post("/api/inbound_batch")
async def inbound_batch(rows: List[dict]):
    import datetime
    async with httpx.AsyncClient() as client:
        r_prod = await client.get(f"{SUPABASE_URL}/rest/v1/products?select=*", headers=HEADERS)
        r_fin = await client.get(f"{SUPABASE_URL}/rest/v1/finished_products?select=*", headers=HEADERS)
        pm_list = (r_prod.json() if r_prod.status_code == 200 else []) + (r_fin.json() if r_fin.status_code == 200 else [])
        
        payloads = []
        for r_data in rows:
            if not r_data: continue
            name = str(r_data.get("품목명", "")).strip()
            if not name or name == "(빈 칸)" or name == "undefined": continue
            
            qty_raw = str(r_data.get("➕신규 입고수량(EA)", "0")).replace(',', '').strip()
            try: qty = int(float(qty_raw))
            except: qty = 0
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
                    except: prod_date = None
                else:
                    prod_date = raw_date.replace('/','-').replace('.','-')
                    if " " in prod_date: prod_date = prod_date.split(" ")[0]
            if not prod_date: prod_date = datetime.datetime.now().strftime('%Y-%m-%d')

            loc_id = str(r_data.get("렉 위치", "")).strip()
            zone = str(r_data.get("구역", "")).strip()
            if zone == "실온" and not loc_id.startswith("FL-") and not loc_id.startswith("R-"): loc_id = "R-" + loc_id
            elif zone == "냉장" and not loc_id.startswith("FL-") and not loc_id.startswith("C-"): loc_id = "C-" + loc_id

            payloads.append({ "location_id": loc_id, "category": str(r_data.get("카테고리", "미분류")).strip(), "item_name": name, "quantity": qty, "pallet_count": round(calculated_pallet, 2), "production_date": prod_date, "remarks": supplier })
            
        if payloads: 
            res = await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=payloads, headers=HEADERS)
            if res.status_code not in [200, 201, 204]: return {"status": "error", "message": f"DB 에러: {res.text}"}
            history_payloads = []
            for p in payloads:
                hp = p.copy(); hp["action_type"] = "입고"; hp["payment_status"] = "미지급"
                history_payloads.append(hp)
            await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=history_payloads, headers=HEADERS)
        return {"status": "success", "count": len(payloads)}

@app.delete("/api/clear_data")
async def clear_data(target: str):
    async with httpx.AsyncClient() as client:
        if target == 'inventory': await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?location_id=not.is.null", headers=HEADERS)
        elif target == 'history': await client.delete(f"{SUPABASE_URL}/rest/v1/history_log?location_id=not.is.null", headers=HEADERS)
    return {"status": "success"}
