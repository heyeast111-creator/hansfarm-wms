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
            
            <div class="flex-1 overflow-auto p-2 md:p-6 relative flex flex-col items-center">
                <div id="map-search-container" class="hidden bg-white p-3 md:p-4 rounded-xl shadow-md border border-slate-200 w-full max-w-[800px] mb-4 flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-3 items-center md:items-end shrink-0 text-center">
                    <div class="w-full md:w-1/4 text-left"><label class="block text-[10px] font-bold text-slate-500 mb-1">현재 구역 카테고리</label><select id="map-search-category" onchange="updateMapSearchItemDropdown()" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"><option value="ALL">전체</option></select></div>
                    <div class="w-full md:w-2/4 text-left"><label class="block text-[10px] font-bold text-slate-500 mb-1">품목명 (현재 탭 기준 필터링됨)</label><input type="text" id="map-search-keyword" list="map-search-item-list" placeholder="검색어 입력" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"><datalist id="map-search-item-list"></datalist></div>
                    <div class="w-full md:w-1/4 text-left flex space-x-2 md:block"><div class="flex-1"><label class="block text-[10px] font-bold text-slate-500 mb-1">찾을 개수(렉)</label><input type="number" id="map-search-count" value="1" min="1" class="w-full p-2 border border-slate-300 rounded bg-slate-50 text-xs font-bold outline-none"></div><div class="flex flex-1 space-x-1 md:mt-2 items-end md:hidden"><button onclick="executeMapSearch()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded shadow text-xs">스캔</button><button onclick="clearSearchTargets()" class="bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold py-2 px-2 rounded shadow-sm text-xs">리셋</button></div></div>
                    <button onclick="executeMapSearch()" class="hidden md:block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded shadow transition-colors text-sm whitespace-nowrap">FIFO 스캔</button>
                    <button onclick="clearSearchTargets()" class="hidden md:block bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold py-2 px-3 rounded shadow-sm transition-colors text-sm whitespace-nowrap">초기화</button>
                </div>

                <div class="w-full overflow-x-auto custom-scrollbar flex justify-center md:block">
                    <div class="min-w-max min-h-max bg-white p-4 md:p-10 rounded-xl shadow-xl border border-slate-300 transition-all mx-auto" id="map-container">
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
                    <div class="flex justify-between items-center mb-4 w-full">
                        <div class="text-slate-500 font-black text-xs md:text-sm">창고 적재율</div>
                        <select id="dash-zone-select" onchange="updateDashboard()" class="border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-600 outline-none bg-slate-50">
                            <option value="ALL">전체 창고</option>
                            <option value="ROOM">실온 (Room)</option>
                            <option value="COLD">냉장 (Cold)</option>
                        </select>
                    </div>
                    <div class="relative w-32 h-32 md:w-36 md:h-36 rounded-full donut-ring flex items-center justify-center shadow-inner" id="dash-donut" style="background: conic-gradient(#10b981 0%, #e2e8f0 0%);">
                        <div class="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center shadow-sm">
                            <span class="text-2xl md:text-3xl font-black text-emerald-600" id="dash-cap-percent">0%</span>
                            <span class="text-[9px] md:text-[10px] text-slate-400 font-bold" id="dash-cap-text">0 / 0 파레트</span>
                        </div>
                    </div>
                </div>
                <div class="col-span-1 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="bg-indigo-50 p-5 rounded-2xl shadow-sm border border-indigo-100 flex flex-col justify-between">
                        <div class="flex justify-between items-center mb-2"><div class="font-black text-indigo-800 text-sm md:text-base">❄️ 냉장 창고 (Cold)</div><div class="text-indigo-500 font-bold text-sm" id="dash-cold-percent">0%</div></div>
                        <div class="space-y-2 text-xs md:text-sm mt-2">
                            <div class="flex justify-between text-slate-600"><span class="font-bold">총 렉 수용량</span><span class="font-black" id="dash-cold-total">0</span></div>
                            <div class="flex justify-between text-indigo-600"><span class="font-bold">적재 볼륨</span><span class="font-black" id="dash-cold-occ">0</span></div>
                            <div class="flex justify-between text-emerald-600"><span class="font-bold">빈 렉 수</span><span class="font-black" id="dash-cold-empty">0</span></div>
                        </div>
                    </div>
                    <div class="bg-orange-50 p-5 rounded-2xl shadow-sm border border-orange-100 flex flex-col justify-between">
                        <div class="flex justify-between items-center mb-2"><div class="font-black text-orange-800 text-sm md:text-base">☀️ 실온 창고 (Room)</div><div class="text-orange-500 font-bold text-sm" id="dash-room-percent">0%</div></div>
                        <div class="space-y-2 text-xs md:text-sm mt-2">
                            <div class="flex justify-between text-slate-600"><span class="font-bold">총 렉 수용량</span><span class="font-black" id="dash-room-total">0</span></div>
                            <div class="flex justify-between text-orange-600"><span class="font-bold">적재 볼륨</span><span class="font-black" id="dash-room-occ">0</span></div>
                            <div class="flex justify-between text-emerald-600"><span class="font-bold">빈 렉 수</span><span class="font-black" id="dash-room-empty">0</span></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-blue-500"><div class="text-slate-500 font-bold text-xs md:text-sm mb-1 flex items-center justify-between"><span>기간 내 입고량 (IN)</span><span class="bg-blue-100 text-blue-600 text-[9px] px-2 py-0.5 rounded font-black">파레트 합산</span></div><div class="text-3xl md:text-4xl font-black text-blue-600 mt-2" id="dash-in">0 P</div></div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-rose-500"><div class="text-slate-500 font-bold text-xs md:text-sm mb-1 flex items-center justify-between"><span>기간 내 출고량 (OUT)</span><span class="bg-rose-100 text-rose-600 text-[9px] px-2 py-0.5 rounded font-black">파레트 합산</span></div><div class="text-3xl md:text-4xl font-black text-rose-600 mt-2" id="dash-out">0 P</div></div>
            </div>
            <div id="admin-finance-panel" class="hidden grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="bg-yellow-50 p-6 rounded-2xl shadow-md border border-yellow-200">
                    <h3 class="text-yellow-800 font-black text-lg mb-4 flex items-center">💰 실시간 창고 및 현장 재고자산</h3>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center text-sm font-bold text-yellow-700 border-b border-yellow-200 pb-2"><span>❄️ 냉장 자산</span><span id="dash-val-cold">0 원</span></div>
                        <div class="flex justify-between items-center text-sm font-bold text-yellow-700 border-b border-yellow-200 pb-2"><span>☀️ 실온 자산</span><span id="dash-val-room">0 원</span></div>
                        <div class="flex justify-between items-center text-xl font-black text-yellow-900 pt-2"><span>총 자산 가치</span><span id="dash-val-total">0 원</span></div>
                    </div>
                </div>
                <div class="bg-rose-50 p-6 rounded-2xl shadow-md border border-rose-200 flex flex-col justify-center">
                    <h3 class="text-rose-800 font-black text-lg mb-2 flex items-center">💸 기간 내 소모(생산) 원가</h3>
                    <p class="text-xs text-rose-500 font-bold mb-4">선택된 기간 동안 출고(소진)된 자재의 총 원가입니다.</p>
                    <div class="text-4xl font-black text-rose-600 text-right" id="dash-cost-out">0 원</div>
                </div>
            </div>
            <div id="admin-dashboard-panel"></div>
        </div>

        <div id="view-search" class="hidden flex-col items-center justify-start md:justify-center h-full w-full absolute inset-0 p-4 md:p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-2xl md:text-3xl font-black text-slate-800 mb-4 md:mb-8 mt-4 md:mt-0">📦 실시간 품목별 재고</h1>
            <div class="bg-white p-4 md:p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-5xl text-center">
                <div class="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-3 mb-6">
                    <div class="w-full md:w-1/4 text-left">
                        <label class="block text-[11px] font-bold text-slate-500 mb-1">① 관리 유형</label>
                        <select id="summary-type" onchange="updateSummarySupplierDropdown()" class="w-full text-sm p-3 border-2 border-slate-300 rounded-xl font-bold text-slate-800 outline-none bg-slate-50">
                            <option value="ALL">전체 유형</option>
                            <option value="FINISHED">제품 (완제품)</option>
                            <option value="MATERIAL">자재 (부자재)</option>
                            <option value="RAW">원란 (냉장)</option>
                        </select>
                    </div>
                    <div class="w-full md:w-1/4 text-left">
                        <label class="block text-[11px] font-bold text-slate-500 mb-1">② 입고처 (생산처)</label>
                        <select id="summary-supplier" onchange="updateSummaryCategoryDropdown()" class="w-full text-sm p-3 border-2 border-rose-200 rounded-xl font-bold text-rose-800 outline-none bg-white">
                            <option value="ALL">전체 입고처</option>
                        </select>
                    </div>
                    <div class="w-full md:w-1/4 text-left">
                        <label class="block text-[11px] font-bold text-slate-500 mb-1">③ 카테고리</label>
                        <select id="summary-category" onchange="updateSummaryItemDropdown()" class="w-full text-sm p-3 border-2 border-indigo-200 rounded-xl font-bold text-indigo-800 outline-none bg-white">
                            <option value="ALL">전체 카테고리</option>
                        </select>
                    </div>
                    <div class="w-full md:w-1/4 text-left">
                        <label class="block text-[11px] font-bold text-slate-500 mb-1">④ 품목명 확인</label>
                        <select id="summary-item" onchange="calculateSummary()" class="w-full text-sm p-3 border-2 border-emerald-200 rounded-xl font-bold text-emerald-800 outline-none bg-white">
                            <option value="">앞에서부터 선택해주세요</option>
                        </select>
                    </div>
                </div>
                
                <div class="mt-4 md:mt-8 p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
                    <div class="text-sm font-bold text-slate-500 mb-2">현재 총 가용 재고</div>
                    <div class="text-4xl md:text-5xl font-black text-indigo-600" id="summary-result">0 <span class="text-xl md:text-2xl text-indigo-400 font-bold">EA</span></div>
                    <div class="text-xs md:text-sm font-bold text-rose-500 mt-2 md:mt-3" id="summary-pallet">0.0 P (적재 부피 합산)</div>
                    
                    <div id="summary-breakdown" class="w-full max-w-sm mx-auto mb-6"></div>
                    
                    <button onclick="findItemLocationFromSummary()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-4 md:px-8 rounded-xl shadow-md transition-colors w-full max-w-sm mx-auto flex items-center justify-center text-sm md:text-base mt-6">
                        <svg class="w-4 h-4 md:w-5 md:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        📍 렉맵에서 위치 바로 확인
                    </button>
                </div>
            </div>
        </div>

        <div id="view-safety" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex justify-between items-end mb-8 border-b-2 border-slate-200 pb-4">
                <div><h1 class="text-3xl font-black text-slate-800 flex items-center"><svg class="w-8 h-8 mr-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> 자동 발주/안전재고 (PC 권장)</h1></div>
                <div class="flex items-center space-x-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                    <label class="font-bold text-slate-600">일괄 안전재고 기준:</label>
                    <div class="relative"><input type="number" id="safe-days-target" value="7" min="1" onchange="renderSafetyStock()" class="w-20 border-2 border-indigo-200 rounded-lg p-2 font-black text-indigo-700 text-center outline-none"><span class="absolute right-3 top-2.5 font-bold text-slate-400">일</span></div>
                </div>
            </div>
            <div class="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
                <table class="w-full text-left border-collapse">
                    <thead><tr class="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm"><th class="p-4 font-black">카테고리</th><th class="p-4 font-black">품목명 (입고처)</th><th class="p-4 font-black text-right">현재 총 재고 (EA)</th><th class="p-4 font-black text-right">일간 소모량 (EA)</th><th class="p-4 font-black text-center">예상 소진일</th><th class="p-4 font-black text-center">상태 및 발주</th></tr></thead>
                    <tbody id="safety-list" class="divide-y divide-slate-100"></tbody>
                </table>
            </div>
        </div>

        <div id="view-products" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex justify-between items-center mb-6 border-b pb-4 shrink-0">
                <div class="flex space-x-4">
                    <button onclick="switchProductTab('fp')" id="tab-btn-fp" class="text-xl md:text-2xl font-black text-indigo-700 border-b-4 border-indigo-700 pb-1 px-2 transition-colors">📦 제품 마스터 DB</button>
                    <button onclick="switchProductTab('pm')" id="tab-btn-pm" class="text-xl md:text-2xl font-black text-slate-400 hover:text-slate-600 pb-1 px-2 transition-colors">✂️ 자재 마스터 DB</button>
                    <button onclick="switchProductTab('bom')" id="tab-btn-bom" class="text-xl md:text-2xl font-black text-slate-400 hover:text-slate-600 pb-1 px-2 transition-colors">📜 BOM (레시피) 설정</button>
                </div>
                <div id="fp-header-btns" class="flex space-x-2">
                    <button onclick="document.getElementById('finished-upload').click()" class="bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 py-2 px-4 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors text-sm">제품 업로드</button>
                    <button onclick="exportProductsExcel('finished')" class="bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 py-2 px-4 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors text-sm">양식 다운로드</button>
                    <button id="fp-wipe-btn" onclick="deleteAllProducts('finished')" class="hidden bg-rose-50 text-rose-700 font-bold border border-rose-200 py-2 px-4 rounded-lg shadow-sm hover:bg-rose-100 transition-colors text-sm">일괄 삭제</button>
                </div>
                <div id="pm-header-btns" class="hidden space-x-2">
                    <button onclick="document.getElementById('product-upload').click()" class="bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 py-2 px-4 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors text-sm">자재 업로드</button>
                    <button onclick="exportProductsExcel('materials')" class="bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 py-2 px-4 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors text-sm">양식 다운로드</button>
                    <button id="pm-wipe-btn" onclick="deleteAllProducts('materials')" class="hidden bg-rose-50 text-rose-700 font-bold border border-rose-200 py-2 px-4 rounded-lg shadow-sm hover:bg-rose-100 transition-colors text-sm">일괄 삭제</button>
                </div>
                <div id="bom-header-btns" class="hidden space-x-2">
                    <button onclick="document.getElementById('bom-upload').click()" class="bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 py-2 px-4 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors text-sm">BOM 업로드</button>
                    <button onclick="exportBomExcel()" class="bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 py-2 px-4 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors text-sm">양식 다운로드</button>
                    <button id="bom-wipe-btn" onclick="deleteAllBom()" class="hidden bg-rose-50 text-rose-700 font-bold border border-rose-200 py-2 px-4 rounded-lg shadow-sm hover:bg-rose-100 transition-colors text-sm">일괄 삭제</button>
                </div>
            </div>
            
            <div id="subview-fp" class="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1 min-h-0">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit overflow-auto">
                    <h2 class="font-black text-lg text-indigo-700 mb-4 border-b pb-2" id="fp-form-title">신규 제품(완제품) 추가</h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">카테고리</label><input type="text" id="fp-cat" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">제품명</label><input type="text" id="fp-name" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-rose-500 mb-1">생산처/비고</label><input type="text" id="fp-supplier" placeholder="예: 자체생산" class="w-full border border-rose-300 bg-rose-50 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">일간 출고량 (EA)</label><input type="number" id="fp-usage" value="0" min="0" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-indigo-600 mb-1">1 파레트당 적재 수량 (EA)</label><input type="number" id="fp-pallet-ea" value="1" min="1" class="w-full border border-indigo-300 bg-indigo-50 rounded p-2 mb-3 font-bold text-sm text-indigo-700">
                    <label class="block text-xs font-bold text-slate-500 mb-1">단가(원) - 매출계산용</label><input type="number" id="fp-price" value="0" min="0" class="w-full border border-slate-300 rounded p-2 mb-6 font-bold text-sm text-slate-700">
                    <button id="fp-submit-btn" onclick="submitProduct('finished')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-md transition-colors mb-2">DB에 등록하기</button>
                    <button id="fp-cancel-btn" onclick="cancelEdit('finished')" class="hidden w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3 rounded-xl shadow-sm transition-colors">수정 취소</button>
                </div>
                <div class="col-span-1 md:col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col">
                    <div class="flex justify-between items-center mb-4 border-b pb-3 shrink-0">
                        <h2 class="font-black text-lg text-slate-700">등록된 제품 리스트</h2>
                        <div class="relative w-64">
                            <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></span>
                            <input type="text" id="fp-search" onkeyup="renderProductMaster('finished')" placeholder="제품명, 카테고리 검색..." class="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 text-sm font-bold outline-none focus:border-indigo-500 transition-colors">
                        </div>
                    </div>
                    <div class="overflow-y-auto flex-1 custom-scrollbar pr-2 h-[50vh]">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="sticky top-0 bg-white z-10 shadow-sm border-b-2 border-slate-200">
                                <tr class="text-slate-500">
                                    <th class="p-2 font-black">카테고리</th><th class="p-2 font-black">제품명</th><th class="p-2 font-black">비고</th><th class="p-2 font-black text-right">1P당 적재(EA)</th><th class="p-2 font-black text-right">출고량 / 단가</th><th class="p-2 font-black text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody id="fp-list" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="subview-pm" class="hidden grid-cols-1 md:grid-cols-3 gap-8 flex-1 min-h-0">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit overflow-auto">
                    <h2 class="font-black text-lg text-indigo-700 mb-4 border-b pb-2" id="pm-form-title">신규 자재(부자재) 추가</h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">카테고리</label><input type="text" id="pm-cat" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">자재명</label><input type="text" id="pm-name" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-rose-500 mb-1">입고처 (거래처명)</label><input type="text" id="pm-supplier" placeholder="예: 한스패키지" class="w-full border border-rose-300 bg-rose-50 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">일간 소모량 (EA)</label><input type="number" id="pm-usage" value="0" min="0" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-indigo-600 mb-1">1 파레트당 적재 수량 (EA)</label><input type="number" id="pm-pallet-ea" value="1" min="1" class="w-full border border-indigo-300 bg-indigo-50 rounded p-2 mb-3 font-bold text-sm text-indigo-700">
                    <label class="block text-xs font-bold text-slate-500 mb-1">단가(원) - 원가계산용</label><input type="number" id="pm-price" value="0" min="0" class="w-full border border-slate-300 rounded p-2 mb-6 font-bold text-sm text-slate-700">
                    <button id="pm-submit-btn" onclick="submitProduct('materials')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-md transition-colors mb-2">DB에 등록하기</button>
                    <button id="pm-cancel-btn" onclick="cancelEdit('materials')" class="hidden w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3 rounded-xl shadow-sm transition-colors">수정 취소</button>
                </div>
                <div class="col-span-1 md:col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col">
                    <div class="flex justify-between items-center mb-4 border-b pb-3 shrink-0">
                        <h2 class="font-black text-lg text-slate-700">등록된 자재 리스트</h2>
                        <div class="relative w-64">
                            <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></span>
                            <input type="text" id="pm-search" onkeyup="renderProductMaster('materials')" placeholder="자재명, 카테고리 검색..." class="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 text-sm font-bold outline-none focus:border-indigo-500 transition-colors">
                        </div>
                    </div>
                    <div class="overflow-y-auto flex-1 custom-scrollbar pr-2 h-[50vh]">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="sticky top-0 bg-white z-10 shadow-sm border-b-2 border-slate-200">
                                <tr class="text-slate-500">
                                    <th class="p-2 font-black">카테고리</th><th class="p-2 font-black">자재명</th><th class="p-2 font-black">입고처</th><th class="p-2 font-black text-right">1P당 적재(EA)</th><th class="p-2 font-black text-right">소모량 / 단가</th><th class="p-2 font-black text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody id="pm-list" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="subview-bom" class="hidden grid-cols-1 md:grid-cols-3 gap-8 flex-1 min-h-0">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit">
                    <h2 class="font-black text-lg text-emerald-700 mb-4 border-b pb-2 flex items-center">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg> 신규 레시피 등록
                    </h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">① 완제품 선택 (제품 DB 연동)</label>
                    <select id="bom-finished" class="w-full border border-slate-300 rounded p-2 mb-4 font-bold text-sm outline-none bg-white"></select>
                    
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                        <label class="block text-xs font-bold text-slate-500 mb-1">② 연결할 자재 선택 (자재 DB 연동)</label>
                        <select id="bom-material" class="w-full border border-indigo-300 bg-white rounded p-2 mb-4 font-bold text-sm text-indigo-700 outline-none"></select>
                        <label class="block text-xs font-bold text-slate-500 mb-1">③ 1개 생산 시 소요되는 자재 수량</label>
                        <input type="number" id="bom-qty" value="1" step="0.01" min="0.01" class="w-full border border-slate-300 rounded p-2 font-bold text-sm outline-none">
                        <p class="text-[10px] text-slate-400 mt-1">* 소수점 입력 가능 (예: 박스 1/10개 = 0.1)</p>
                    </div>
                    <button onclick="submitBom()" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl shadow-md transition-colors">🔗 연결 저장하기</button>
                </div>
                
                <div class="col-span-1 md:col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col">
                    <div class="flex justify-between items-center mb-4 border-b pb-3 shrink-0">
                        <h2 class="font-black text-lg text-slate-700">현재 등록된 BOM (레시피)</h2>
                    </div>
                    <div class="overflow-y-auto flex-1 custom-scrollbar pr-2 h-[50vh]">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="sticky top-0 bg-white z-10 shadow-sm border-b-2 border-slate-200">
                                <tr class="text-slate-500">
                                    <th class="p-2 font-black text-emerald-700 w-1/3">📦 완제품 (Finished)</th>
                                    <th class="p-2 font-black text-center w-[10%]"></th>
                                    <th class="p-2 font-black text-indigo-700 w-1/3">✂️ 자재 (Material)</th>
                                    <th class="p-2 font-black text-right">소요 수량</th>
                                    <th class="p-2 font-black text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody id="bom-list" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <div id="view-accounting" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-yellow-800 mb-8 flex items-center"><svg class="w-8 h-8 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> 매입처별 월마감 및 정산 (PC 전용)</h1>
            <div class="flex space-x-4 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <div><label class="block text-xs font-bold text-slate-500 mb-1">조회 월 (YYYY-MM)</label><input type="month" id="acc-month" onchange="renderAccounting()" class="border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 outline-none"></div>
                <div class="flex-1"><label class="block text-xs font-bold text-slate-500 mb-1">매입처 (입고처) 선택</label><select id="acc-supplier" onchange="renderAccounting()" class="w-full border border-slate-300 rounded p-2 text-sm font-bold text-slate-700 outline-none"><option value="ALL">전체 매입처 보기</option></select></div>
            </div>
            <div class="grid grid-cols-3 gap-6 mb-6">
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-slate-700"><div class="text-slate-500 font-bold text-sm mb-1">해당 월 총 매입금액</div><div class="text-3xl font-black text-slate-800" id="acc-total">0 원</div></div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-rose-500"><div class="text-rose-500 font-bold text-sm mb-1">지급 대기 (미지급금)</div><div class="text-3xl font-black text-rose-600" id="acc-unpaid">0 원</div></div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-blue-500"><div class="text-blue-500 font-bold text-sm mb-1">결제 완료</div><div class="text-3xl font-black text-blue-600" id="acc-paid">0 원</div></div>
            </div>
            <div class="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
                <table class="w-full text-left border-collapse">
                    <thead><tr class="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs"><th class="p-3 font-black">입고일시</th><th class="p-3 font-black">매입처</th><th class="p-3 font-black">품목명</th><th class="p-3 font-black text-right">입고수량(EA)</th><th class="p-3 font-black text-right">단가</th><th class="p-3 font-black text-right">매입금액</th><th class="p-3 font-black text-center">결제상태</th></tr></thead>
                    <tbody id="acc-list" class="divide-y divide-slate-100 text-sm"></tbody>
                </table>
            </div>
        </div>

        <div id="view-production" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-4">🏭 생산 관리 시스템</h1>
            <p class="text-slate-500 font-bold">BOM 레시피를 기반으로 한 완제품 생산 및 자재 자동 차감(Backflush) 기능이 곧 업데이트됩니다!</p>
        </div>
        <div id="view-outbound" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-4">🚚 출고 관리 시스템</h1>
            <p class="text-slate-500 font-bold">거래처별 출고 지시 및 패킹 리스트 생성 기능이 곧 업데이트됩니다!</p>
        </div>

    </main>

    <aside id="right-sidebar" class="hidden fixed md:relative bottom-16 md:bottom-0 right-0 w-full md:w-80 h-[60vh] md:h-full bg-white border-t md:border-l border-slate-300 flex-col shadow-[0_-10px_20px_rgba(0,0,0,0.15)] md:shadow-lg z-40 shrink-0 transition-all">
        <div class="p-3 md:p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 class="text-base md:text-lg font-black text-slate-800 flex items-center"><svg class="w-4 h-4 md:w-5 md:h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> 위치 상세 정보</h2>
            <button onclick="closeInfoPanel()" class="md:hidden text-slate-500 font-bold px-2 py-1 bg-slate-200 rounded text-xs">닫기 ⬇️</button>
        </div>
        <div class="p-4 md:p-6 flex-1 overflow-y-auto pb-20 md:pb-6" id="info-panel"><div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div></div>
    </aside>

    <script>
        let globalOccupancy = []; let productMaster = []; let finishedProductMaster = []; let globalHistory = []; let bomMaster = []; 
        let globalSearchTargets = []; 
        let currentZone = '실온'; let selectedCellId = null; let isAdmin = false;
        let editingProductOriginalName = null; let editingProductOriginalSupplier = null;
        
        const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
        const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];
        const layoutFloor = [ { id: 'FL-C', title: '❄️ 생산 현장 (원재료 / 냉장)', cols: 20 }, { aisle: true, text: '==================== 생산 조립 라인 ====================' }, { id: 'FL-R', title: '📦 생산 현장 (부자재 / 실온)', cols: 20 } ];

        function adminLogin() {
            if(isAdmin) { 
                isAdmin = false; alert("관리자 모드 해제"); 
                document.getElementById('admin-btn-pc').innerText = "🔒 관리자"; 
                document.getElementById('admin-btn-pc').className = "w-full py-3 rounded-md bg-slate-800 border border-slate-900 text-slate-300 font-black shadow-inner text-[11px] transition-all hover:bg-slate-700 hover:text-white"; 
                document.getElementById('admin-btn-mo').innerHTML = "🔒<span class='mt-1'>관리자</span>";
                document.getElementById('admin-btn-mo').classList.remove('bg-rose-100', 'text-rose-700', 'border-rose-300');
                
                document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden')); 
                document.getElementById('admin-finance-panel').classList.add('hidden'); 
                document.getElementById('pm-wipe-btn').classList.add('hidden'); document.getElementById('fp-wipe-btn').classList.add('hidden'); document.getElementById('bom-wipe-btn').classList.add('hidden'); 
                if(document.getElementById('view-accounting').classList.contains('flex')) showView('dashboard'); load(); return; 
            }
            const pw = prompt("비밀번호 입력 (1234):"); 
            if(pw === "1234") { 
                isAdmin = true; alert("관리자 권한 활성화"); 
                document.getElementById('admin-btn-pc').innerText = "🔓 관리자 (ON)"; 
                document.getElementById('admin-btn-pc').className = "w-full py-3 rounded-md bg-rose-600 border border-rose-700 text-white font-black shadow-inner text-[11px] transition-all hover:bg-rose-500 animate-pulse"; 
                document.getElementById('admin-btn-mo').innerHTML = "🔓<span class='mt-1'>관리자</span>";
                document.getElementById('admin-btn-mo').classList.add('bg-rose-100', 'text-rose-700', 'border-rose-300');

                document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden')); 
                document.getElementById('admin-finance-panel').classList.remove('hidden'); 
                document.getElementById('pm-wipe-btn').classList.remove('hidden'); document.getElementById('fp-wipe-btn').classList.remove('hidden'); document.getElementById('bom-wipe-btn').classList.remove('hidden'); 
                let today = new Date(); document.getElementById('acc-month').value = today.toISOString().substring(0, 7); load(); 
            }
        }

        async function load() {
            try {
                const [occRes, prodRes, fpRes, histRes, bomRes] = await Promise.all([ fetch('/api/inventory'), fetch('/api/products'), fetch('/api/finished_products'), fetch('/api/history'), fetch('/api/bom') ]);
                globalOccupancy = await occRes.json(); productMaster = await prodRes.json(); finishedProductMaster = await fpRes.json(); globalHistory = await histRes.json(); bomMaster = await bomRes.json();
                
                updateMapSearchCategoryDropdown(); 
                updateSummarySupplierDropdown(); 

                renderMap(); renderProductMaster('finished'); updateDashboard(); renderSafetyStock(); if(isAdmin) renderAccounting();
                if(selectedCellId) clickCell(selectedCellId); else clearInfo();
            } catch (e) { console.error("로딩 에러:", e); }
        }

        function showView(viewName) {
            // PC 버튼 리셋
            document.querySelectorAll('.nav-btn-pc').forEach(btn => {
                btn.className = "nav-btn-pc w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all";
            });
            // 모바일 버튼 리셋
            document.querySelectorAll('.nav-btn-mo').forEach(btn => {
                if(btn.id !== 'admin-btn-mo') {
                    btn.className = "nav-btn-mo flex-1 py-2 rounded-md text-[11px] border border-slate-200 text-slate-600 bg-white font-bold flex flex-col items-center justify-center mx-0.5 transition-all";
                }
            });

            // PC 버튼 활성화
            document.querySelectorAll('.nav-btn-pc.target-' + viewName).forEach(btn => {
                btn.className = "nav-btn-pc target-" + viewName + " w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all" + (viewName==='safety' ? ' text-rose-600 border-rose-200 bg-rose-50' : '') + (viewName==='accounting' ? ' text-yellow-700 border-yellow-300 bg-yellow-50' : '');
            });
            // 모바일 버튼 활성화
            document.querySelectorAll('.nav-btn-mo.target-' + viewName).forEach(btn => {
                btn.className = "nav-btn-mo target-" + viewName + " flex-1 py-2 rounded-md text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 font-black flex flex-col items-center justify-center mx-0.5 shadow-inner transition-all";
            });

            ['view-inventory', 'view-dashboard', 'view-search', 'view-products', 'view-safety', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); });
            
            if(viewName === 'inventory') { 
                if(window.innerWidth >= 768) { document.getElementById('right-sidebar').classList.remove('hidden'); document.getElementById('right-sidebar').classList.add('flex'); } 
                else { if(selectedCellId) { document.getElementById('right-sidebar').classList.remove('hidden'); document.getElementById('right-sidebar').classList.add('flex'); } else { document.getElementById('right-sidebar').classList.add('hidden'); document.getElementById('right-sidebar').classList.remove('flex'); } }
                renderMap(); 
            } else { document.getElementById('right-sidebar').classList.add('hidden'); document.getElementById('right-sidebar').classList.remove('flex'); }
            
            document.getElementById('view-' + viewName).classList.remove('hidden'); document.getElementById('view-' + viewName).classList.add('flex');
            
            if(viewName === 'products') { renderProductMaster('finished'); switchProductTab('fp'); }
            else if(viewName === 'search') { updateSummarySupplierDropdown(); }
            else if(viewName === 'dashboard') updateDashboard(); 
            else if(viewName === 'safety') renderSafetyStock(); 
            else if(viewName === 'accounting') renderAccounting();
        }

        function closeInfoPanel() { document.getElementById('right-sidebar').classList.add('hidden'); document.getElementById('right-sidebar').classList.remove('flex'); selectedCellId = null; renderMap(); }
        function toggleMapSearch() { const container = document.getElementById('map-search-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }

        function switchProductTab(tab) {
            ['fp', 'pm', 'bom'].forEach(t => {
                document.getElementById(`tab-btn-${t}`).className = "text-xl md:text-2xl font-black text-slate-400 hover:text-slate-600 pb-1 px-2 transition-colors";
                document.getElementById(`subview-${t}`).classList.add('hidden'); document.getElementById(`subview-${t}`).classList.remove('grid');
                document.getElementById(`${t}-header-btns`).classList.add('hidden'); document.getElementById(`${t}-header-btns`).classList.remove('flex');
            });
            document.getElementById(`tab-btn-${tab}`).className = "text-xl md:text-2xl font-black text-indigo-700 border-b-4 border-indigo-700 pb-1 px-2 transition-colors";
            if(tab === 'bom') { document.getElementById(`tab-btn-${tab}`).classList.replace('text-indigo-700', 'text-emerald-700'); document.getElementById(`tab-btn-${tab}`).classList.replace('border-indigo-700', 'border-emerald-700'); }
            document.getElementById(`subview-${tab}`).classList.remove('hidden'); document.getElementById(`subview-${tab}`).classList.add('grid');
            document.getElementById(`${tab}-header-btns`).classList.remove('hidden'); document.getElementById(`${tab}-header-btns`).classList.add('flex');
            if(tab === 'fp') renderProductMaster('finished');
            if(tab === 'pm') renderProductMaster('materials');
            if(tab === 'bom') { updateBomDropdowns(); renderBomMaster(); }
        }

        function exportProductsExcel(targetType) { 
            try { 
                let wsData = []; let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster; let sheetName = targetType === 'finished' ? "제품마스터" : "자재마스터"; let fileName = targetType === 'finished' ? "한스팜_제품마스터_양식.xlsx" : "한스팜_자재마스터_양식.xlsx";
                if (dataArray.length === 0) { wsData = [{ "카테고리": "", "품목명": "", "입고처(공급사)": "", "일간소모량(EA)": "0", "단가(비용)": "0", "1P기준수량(EA)": "1" }]; } 
                else { wsData = dataArray.map(p => ({ "카테고리": p.category || "미분류", "품목명": p.item_name || "", "입고처(공급사)": p.supplier || "", "일간소모량(EA)": p.daily_usage || 0, "단가(비용)": p.unit_price || 0, "1P기준수량(EA)": p.pallet_ea || 1 })); } 
                const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, sheetName); XLSX.writeFile(wb, fileName); 
            } catch (error) { alert("다운로드 중 오류"); } 
        }
        
        function importProductsExcel(e, targetType) { 
            const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); 
            const endpoint = targetType === 'finished' ? '/api/finished_products_batch' : '/api/products_batch';
            const msg = targetType === 'finished' ? "제품" : "자재";
            reader.onload = async function(ev) { 
                try { 
                    const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); 
                    const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); 
                    if(json.length > 0) { 
                        const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); 
                        const result = await res.json();
                        if(result.status === 'success') { alert(`${msg} 대량 업로드 완료!`); load(); } 
                        else { alert(`업로드 실패: 중복된 데이터가 있거나 양식이 맞지 않습니다. (${result.message})`); }
                    } else { alert("업로드할 데이터가 없습니다."); }
                } catch(err) { console.error(err); alert("업로드 처리 중 오류 발생: 엑셀 양식을 다시 확인해주세요."); } 
            }; reader.readAsArrayBuffer(file); e.target.value = ''; 
        }

        function exportBomExcel() {
            let wsData = bomMaster.length === 0 ? [{"완제품명": "", "부자재명": "", "소요수량(EA)": ""}] : bomMaster.map(b => ({"완제품명": b.finished_product, "부자재명": b.material_product, "소요수량(EA)": b.require_qty}));
            const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 25}, {wch: 25}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, "BOM마스터"); XLSX.writeFile(wb, "한스팜_BOM레시피_양식.xlsx");
        }

        function importBomExcel(e) {
            const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
            reader.onload = async function(ev) {
                try {
                    const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                    if(json.length > 0) { 
                        const res = await fetch('/api/bom_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); 
                        const result = await res.json();
                        if(result.status === 'success') { alert("BOM 대량 업로드 완료!"); load(); } 
                        else { alert(`업로드 실패: ${result.message}`); }
                    }
                } catch(err) { alert("업로드 처리 중 오류 발생"); }
            }; reader.readAsArrayBuffer(file); e.target.value = '';
        }

        function updateBomDropdowns() {
            const fNames = [...new Set(finishedProductMaster.map(p => p.item_name))].sort();
            const mNames = [...new Set(productMaster.map(p => p.item_name))].sort();
            const fOptions = fNames.length > 0 ? fNames.map(name => `<option value="${name}">${name}</option>`).join('') : `<option value="">[제품 마스터]에 제품을 등록해주세요</option>`;
            const mOptions = mNames.length > 0 ? mNames.map(name => `<option value="${name}">${name}</option>`).join('') : `<option value="">[자재 마스터]에 자재를 등록해주세요</option>`;
            document.getElementById('bom-finished').innerHTML = fOptions; document.getElementById('bom-material').innerHTML = mOptions;
        }

        function renderBomMaster() {
            const tbody = document.getElementById('bom-list');
            if(bomMaster.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-slate-400 font-bold">등록된 레시피가 없습니다.</td></tr>`; return; }
            bomMaster.sort((a, b) => a.finished_product.localeCompare(b.finished_product));
            tbody.innerHTML = bomMaster.map(b => {
                let delBtn = isAdmin ? `<button onclick="deleteBom('${b.id}')" class="text-rose-500 hover:bg-rose-100 p-1.5 rounded transition-colors" title="삭제"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';
                return `<tr class="hover:bg-slate-50 transition-colors"><td class="p-3 border-b border-slate-100 font-black text-emerald-800">${b.finished_product}</td><td class="p-3 border-b border-slate-100 text-center text-slate-400"><svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></td><td class="p-3 border-b border-slate-100 font-bold text-indigo-800">${b.material_product}</td><td class="p-3 border-b border-slate-100 text-right font-black text-slate-700">${b.require_qty} <span class="text-xs font-normal text-slate-500">EA</span></td><td class="p-3 border-b border-slate-100 text-center">${delBtn}</td></tr>`;
            }).join('');
        }

        async function submitBom() {
            const finished = document.getElementById('bom-finished').value; const material = document.getElementById('bom-material').value; const qty = parseFloat(document.getElementById('bom-qty').value);
            if(!finished || !material || isNaN(qty) || qty <= 0) return alert("입력값을 확인해주세요.");
            if(finished === material) return alert("완제품과 자재가 같을 수 없습니다!");
            try { 
                const res = await fetch('/api/bom', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ finished_product: finished, material_product: material, require_qty: qty }) }); 
                const result = await res.json();
                if(result.status === 'success') { alert("레시피 연결 완료!"); document.getElementById('bom-qty').value = 1; load(); }
                else { alert(`등록 실패: ${result.message}`); }
            } catch(e) { alert("서버 통신 실패"); }
        }

        async function deleteBom(id) { if(!confirm("이 레시피 연결을 삭제하시겠습니까?")) return; try { await fetch(`/api/bom?id=${id}`, { method: 'DELETE' }); load(); } catch(e) { alert("삭제 실패"); } }
        async function deleteAllBom() { if(!confirm("⚠️ 모든 레시피(BOM)를 일괄 삭제하시겠습니까?")) return; const pw = prompt("관리자 비밀번호(1234) 입력:"); if(pw !== "1234") return alert("틀렸습니다."); try { await fetch('/api/bom_all', { method: 'DELETE' }); alert("일괄 삭제 완료!"); load(); } catch(e) {} }

        function renderProductMaster(targetType) { 
            const searchInput = document.getElementById(targetType === 'finished' ? 'fp-search' : 'pm-search');
            const keyword = searchInput ? searchInput.value.toLowerCase().trim() : '';
            let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster;
            let filtered = dataArray;
            if (keyword) { filtered = dataArray.filter(p => p.item_name.toLowerCase().includes(keyword) || p.category.toLowerCase().includes(keyword) || p.supplier.toLowerCase().includes(keyword)); }
            const listHtml = filtered.map(p => { 
                let delBtn = isAdmin ? `<button onclick="deleteProduct('${p.item_name}', '${p.supplier}', '${targetType}')" class="text-rose-500 hover:bg-rose-100 p-1.5 rounded transition-colors" title="삭제"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''; 
                let badgeColor = targetType === 'finished' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600';
                return `<tr class="hover:bg-slate-50 transition-colors"><td class="p-2 border-b border-slate-100"><span class="text-[10px] ${badgeColor} px-2 py-0.5 rounded font-bold">${p.category}</span></td><td class="p-2 border-b border-slate-100 font-bold text-slate-800 text-sm">${p.item_name}</td><td class="p-2 border-b border-slate-100 text-xs font-bold text-rose-600">${p.supplier}</td><td class="p-2 border-b border-slate-100 text-right font-black text-indigo-600 text-sm">${p.pallet_ea.toLocaleString()} <span class="text-xs font-normal">EA</span></td><td class="p-2 border-b border-slate-100 text-right text-[10px] text-slate-500">일 ${p.daily_usage.toLocaleString()} / ${p.unit_price.toLocaleString()}원</td><td class="p-2 border-b border-slate-100 text-center flex justify-center space-x-1"><button onclick="editProductSetup('${p.category}', '${p.item_name}', '${p.supplier}', ${p.daily_usage}, ${p.unit_price}, ${p.pallet_ea}, '${targetType}')" class="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition-colors" title="수정"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>${delBtn}</td></tr>`; 
            }).join(''); 
            const tbodyId = targetType === 'finished' ? 'fp-list' : 'pm-list'; const tbody = document.getElementById(tbodyId);
            if(tbody) { if(filtered.length > 0) tbody.innerHTML = listHtml; else tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">검색 결과가 없습니다.</td></tr>`; }
        }

        function editProductSetup(cat, name, supplier, usage, price, ea, targetType) { 
            editingProductOriginalName = name; editingProductOriginalSupplier = supplier; 
            const prefix = targetType === 'finished' ? 'fp' : 'pm';
            document.getElementById(`${prefix}-cat`).value = cat; document.getElementById(`${prefix}-name`).value = name; document.getElementById(`${prefix}-supplier`).value = supplier; document.getElementById(`${prefix}-usage`).value = usage; document.getElementById(`${prefix}-price`).value = price; document.getElementById(`${prefix}-pallet-ea`).value = ea || 1; 
            document.getElementById(`${prefix}-form-title`).innerText = "기존 항목 수정 모드"; document.getElementById(`${prefix}-submit-btn`).innerText = "✅ 변경사항 저장"; document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-indigo-600', 'bg-emerald-600'); document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-indigo-700', 'hover:bg-emerald-700'); document.getElementById(`${prefix}-cancel-btn`).classList.remove('hidden'); 
        }

        function cancelEdit(targetType) { 
            editingProductOriginalName = null; editingProductOriginalSupplier = null; 
            const prefix = targetType === 'finished' ? 'fp' : 'pm'; const title = targetType === 'finished' ? '신규 제품(완제품) 추가' : '신규 자재(부자재) 추가';
            document.getElementById(`${prefix}-cat`).value = ''; document.getElementById(`${prefix}-name`).value = ''; document.getElementById(`${prefix}-supplier`).value = ''; document.getElementById(`${prefix}-usage`).value = '0'; document.getElementById(`${prefix}-price`).value = '0'; document.getElementById(`${prefix}-pallet-ea`).value = '1'; 
            document.getElementById(`${prefix}-form-title`).innerText = title; document.getElementById(`${prefix}-submit-btn`).innerText = "DB에 등록하기"; document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-emerald-600', 'bg-indigo-600'); document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-emerald-700', 'hover:bg-indigo-700'); document.getElementById(`${prefix}-cancel-btn`).classList.add('hidden'); 
        }

        async function submitProduct(targetType) { 
            const prefix = targetType === 'finished' ? 'fp' : 'pm';
            const cat = document.getElementById(`${prefix}-cat`).value.trim(); const name = document.getElementById(`${prefix}-name`).value.trim(); const supplier = document.getElementById(`${prefix}-supplier`).value.trim() || (targetType==='finished'?'자체생산':'기본입고처'); const usage = parseInt(document.getElementById(`${prefix}-usage`).value) || 0; const price = parseInt(document.getElementById(`${prefix}-price`).value) || 0; const ea = parseInt(document.getElementById(`${prefix}-pallet-ea`).value) || 1; 
            if(!cat || !name) return alert("카테고리와 이름은 필수입니다."); 
            const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
            try { 
                if(editingProductOriginalName) { 
                    const res = await fetch(`${endpoint}?old_name=${encodeURIComponent(editingProductOriginalName)}&old_supplier=${encodeURIComponent(editingProductOriginalSupplier)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
                    const result = await res.json();
                    if(result.status === 'success') { alert("수정 완료"); cancelEdit(targetType); } else { alert(`수정 실패: ${result.message}`); }
                } else { 
                    const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
                    const result = await res.json();
                    if(result.status === 'success') { alert("등록 완료"); document.getElementById(`${prefix}-name`).value = ''; document.getElementById(`${prefix}-supplier`).value = ''; } else { alert(`등록 실패: ${result.message}`); }
                } 
                load(); 
            } catch(e) { alert("서버 통신 실패"); } 
        }

        async function deleteProduct(name, supplier, targetType) { 
            if(!confirm(`[${name} - ${supplier}] 항목을 개별 삭제하시겠습니까?`)) return; 
            const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
            try { await fetch(`${endpoint}?item_name=${encodeURIComponent(name)}&supplier=${encodeURIComponent(supplier)}`, { method: 'DELETE' }); load(); } catch(e) {} 
        }

        async function deleteAllProducts(targetType) { 
            const msg = targetType === 'finished' ? "제품" : "자재";
            if(!confirm(`⚠️ 정말 모든 ${msg} 마스터를 일괄 삭제하시겠습니까?`)) return; 
            const pw = prompt("관리자 비밀번호(1234) 입력:"); if(pw !== "1234") return alert("틀렸습니다."); 
            const endpoint = targetType === 'finished' ? '/api/finished_products_all' : '/api/products_all';
            try { await fetch(endpoint, { method: 'DELETE' }); alert("일괄 삭제 완료!"); load(); } catch(e) { alert("삭제 실패!"); } 
        }

        function updateMapSearchCategoryDropdown() {
            let sourceItems = [];
            if (currentZone === '실온') sourceItems = productMaster.filter(p => !p.category.includes('원란'));
            else if (currentZone === '냉장') sourceItems = productMaster.filter(p => p.category.includes('원란'));
            else if (currentZone === '현장') sourceItems = finishedProductMaster;
            
            const categories = [...new Set(sourceItems.map(p => p.category))].filter(Boolean).sort();
            const catSelect = document.getElementById('map-search-category');
            if (catSelect) { 
                catSelect.innerHTML = `<option value="ALL">전체</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); 
                updateMapSearchItemDropdown(); 
            }
        }

        function updateMapSearchItemDropdown() {
            let sourceItems = [];
            if (currentZone === '실온') sourceItems = productMaster.filter(p => !p.category.includes('원란'));
            else if (currentZone === '냉장') sourceItems = productMaster.filter(p => p.category.includes('원란'));
            else if (currentZone === '현장') sourceItems = finishedProductMaster;

            const catSelect = document.getElementById('map-search-category'); 
            if (catSelect && catSelect.value !== 'ALL') { 
                sourceItems = sourceItems.filter(p => p.category === catSelect.value); 
            }
            
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
            let items = getSummarySourceItems();
            let suppliers = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
            const supSelect = document.getElementById('summary-supplier');
            if (supSelect) {
                supSelect.innerHTML = `<option value="ALL">전체 입고처</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join('');
                updateSummaryCategoryDropdown();
            }
        }

        function updateSummaryCategoryDropdown() {
            let items = getSummarySourceItems();
            const supSelect = document.getElementById('summary-supplier');
            const supplier = supSelect ? supSelect.value : 'ALL';
            
            if (supplier !== 'ALL') {
                items = items.filter(p => p.supplier === supplier);
            }
            
            let categories = [...new Set(items.map(p => p.category))].filter(Boolean).sort();
            const catSelect = document.getElementById('summary-category');
            if (catSelect) { 
                catSelect.innerHTML = `<option value="ALL">전체 카테고리</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); 
                updateSummaryItemDropdown(); 
            }
        }
        
        function updateSummaryItemDropdown() {
            let items = getSummarySourceItems();
            const supSelect = document.getElementById('summary-supplier');
            const catSelect = document.getElementById('summary-category');
            
            const supplier = supSelect ? supSelect.value : 'ALL';
            const cat = catSelect ? catSelect.value : 'ALL';
            
            if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
            if (cat !== 'ALL') items = items.filter(p => p.category === cat);
            
            const uniqueItems = [...new Set(items.map(p => p.item_name))].filter(Boolean).sort();
            const itemSelect = document.getElementById('summary-item');
            if(itemSelect) { 
                itemSelect.innerHTML = `<option value="">품목을 선택하세요</option>` + uniqueItems.map(name => `<option value="${name}">${name}</option>`).join(''); 
            }
            calculateSummary();
        }
        
        // 💡 [핵심] 재고조회 실시간 합산 로직 (입고처별 리스트 분리)
        function calculateSummary() {
            const itemName = document.getElementById('summary-item').value;
            const supplier = document.getElementById('summary-supplier').value;
            
            let breakdown = {};
            let totalQty = 0;
            let totalPallet = 0;
            
            if(itemName) {
                globalOccupancy.forEach(item => {
                    let itemSupplier = item.remarks || "기본입고처";
                    if(item.item_name === itemName) {
                        if (supplier === 'ALL' || itemSupplier === supplier) {
                            if(!breakdown[itemSupplier]) breakdown[itemSupplier] = { qty: 0, pallet: 0 };
                            let dynP = getDynamicPalletCount(item);
                            
                            breakdown[itemSupplier].qty += item.quantity;
                            breakdown[itemSupplier].pallet += dynP;
                            
                            totalQty += item.quantity;
                            totalPallet += dynP;
                        }
                    }
                });
            }
            
            document.getElementById('summary-result').innerHTML = `${totalQty.toLocaleString()} <span class="text-xl md:text-2xl text-indigo-400 font-bold">EA</span>`;
            document.getElementById('summary-pallet').innerText = `${totalPallet.toFixed(1)} P (적재 부피 합산)`;
            
            // 💡 입고처별 분리(Breakdown) HTML 렌더링
            let breakdownHtml = '';
            let supKeys = Object.keys(breakdown);
            if(supKeys.length > 0) {
                breakdownHtml = '<div class="space-y-2 mt-4">';
                supKeys.forEach(sup => {
                    breakdownHtml += `
                    <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm md:text-base">
                        <span class="font-bold text-slate-700 text-left w-1/3 truncate" title="${sup}">${sup}</span>
                        <span class="font-black text-indigo-600 w-1/3 text-right">${breakdown[sup].qty.toLocaleString()} EA</span>
                        <span class="font-bold text-rose-500 w-1/3 text-right">${breakdown[sup].pallet.toFixed(1)} P</span>
                    </div>`;
                });
                breakdownHtml += '</div>';
            }
            document.getElementById('summary-breakdown').innerHTML = breakdownHtml;
        }

        function findItemLocationFromSummary() {
            const itemName = document.getElementById('summary-item').value;
            const supplier = document.getElementById('summary-supplier').value;
            
            if(!itemName) return alert("먼저 위치를 확인할 품목을 선택해주세요.");

            let targets = globalOccupancy.filter(item => {
                let itemSupplier = item.remarks || "기본입고처";
                if(item.item_name === itemName) {
                    if (supplier === 'ALL' || itemSupplier === supplier) return true;
                }
                return false;
            });

            if(targets.length === 0) return alert("현재 창고에 해당 품목의 재고가 없습니다.");

            globalSearchTargets = targets.map(t => t.location_id);
            
            let firstLoc = globalSearchTargets[0];
            if (firstLoc.startsWith('FL-')) { currentZone = '현장'; } 
            else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } 
            else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
            
            showView('inventory');
            
            let zoneMap = {'실온':'실온(Room)', '냉장':'냉장(Cold)', '현장':'현장(Floor)'};
            let foundZones = new Set();
            globalSearchTargets.forEach(loc => {
                if(loc.startsWith('FL-')) foundZones.add('현장');
                else if(loc.startsWith('C-')) foundZones.add('냉장');
                else foundZones.add('실온');
            });
            let zoneList = Array.from(foundZones).map(z => zoneMap[z]).join(', ');
            alert(`[${itemName}] 위치 추적 완료!\\n(발견 구역: ${zoneList})`); 
        }

        function getDynamicPalletCount(itemObj) {
            if(!itemObj) return 0;
            let itemName = itemObj.item_name;
            let supplier = itemObj.remarks;
            let quantity = itemObj.quantity;

            let targetSup = supplier ? supplier.trim() : "기본입고처";
            let pInfo = finishedProductMaster.find(p => p.item_name.trim() === itemName.trim() && p.supplier.trim() === targetSup) ||
                        productMaster.find(p => p.item_name.trim() === itemName.trim() && p.supplier.trim() === targetSup) ||
                        finishedProductMaster.find(p => p.item_name.trim() === itemName.trim()) ||
                        productMaster.find(p => p.item_name.trim() === itemName.trim());
            
            if (pInfo && pInfo.pallet_ea > 0) {
                return quantity / pInfo.pallet_ea;
            }
            return itemObj.pallet_count || 1;
        }

        function generateLocations(zone) {
            let locs = [];
            if(zone === '실온') {
                layoutRoom.forEach(col => { if(col.cols) { for(let r=1; r<=col.cols; r++) { locs.push(`R-${col.id}-${r.toString().padStart(2, '0')}`); locs.push(`R-${col.id}-${r.toString().padStart(2, '0')}-2F`); } } });
                for(let c=1; c<=10; c++) { locs.push(`R-K-${c.toString().padStart(2, '0')}`); locs.push(`R-K-${c.toString().padStart(2, '0')}-2F`); }
            } else if(zone === '냉장') {
                layoutCold.forEach(col => { if(col.cols) { for(let r=1; r<=col.cols; r++) { locs.push(`C-${col.id}-${r.toString().padStart(2, '0')}`); locs.push(`C-${col.id}-${r.toString().padStart(2, '0')}-2F`); } } });
                for(let c=1; c<=8; c++) { locs.push(`C-I-${c.toString().padStart(2, '0')}`); locs.push(`C-I-${c.toString().padStart(2, '0')}-2F`); }
            } else if(zone === '현장') {
                for(let c=1; c<=20; c++) locs.push(`FL-C-${c.toString().padStart(2, '0')}`);
                for(let c=1; c<=20; c++) locs.push(`FL-R-${c.toString().padStart(2, '0')}`);
            }
            locs.sort((a, b) => a.localeCompare(b)); return locs;
        }

        function exportPhysicalCountExcel() {
            if(!confirm("구역별(실온/냉장/현장)로 시트가 완벽히 분리되고 렉 위치가 정렬된 '업로드/실사 겸용 양식'을 다운로드합니다.")) return;
            const wb = XLSX.utils.book_new(); 
            ['실온', '냉장', '현장'].forEach(zone => {
                const locs = generateLocations(zone); const wsData = [];
                locs.forEach(locId => {
                    const items = globalOccupancy.filter(x => x.location_id === locId);
                    let displayLocId = locId.replace(/^(R-|C-)/, '');
                    if (items.length > 0) { 
                        items.forEach(item => { wsData.push({ "구역": zone, "렉 위치": displayLocId, "카테고리": item.category, "품목명": item.item_name, "입고처(비고)": item.remarks || "", "전산 현재고": item.quantity, "➕신규 입고수량(EA)": "", "산란일/입고일": item.production_date || "" }); }); 
                    } else { wsData.push({ "구역": zone, "렉 위치": displayLocId, "카테고리": "", "품목명": "", "입고처(비고)": "", "전산 현재고": 0, "➕신규 입고수량(EA)": "", "산란일/입고일": "" }); }
                });
                const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [ {wch: 10}, {wch: 15}, {wch: 15}, {wch: 25}, {wch: 15}, {wch: 12}, {wch: 20}, {wch: 15} ]; XLSX.utils.book_append_sheet(wb, ws, zone); 
            });
            let allItems = [...finishedProductMaster, ...productMaster];
            const refData = allItems.map(p => ({ "복사용_카테고리": p.category, "복사용_품목명": p.item_name, "복사용_입고처": p.supplier, "1P_EA기준": p.pallet_ea }));
            const wsRef = XLSX.utils.json_to_sheet(refData); wsRef['!cols'] = [ {wch: 15}, {wch: 25}, {wch: 15}, {wch: 12} ]; XLSX.utils.book_append_sheet(wb, wsRef, "전체품목DB(참조용)");
            XLSX.writeFile(wb, "한스팜_재고실사및입고양식.xlsx");
        }

        function importExcel(e) { 
            const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); 
            reader.onload = async function(ev) { 
                try {
                    const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); let allRows = [];
                    workbook.SheetNames.forEach(sheetName => {
                        if(!sheetName.includes("참조용")) {
                            const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false, defval: "" });
                            json.forEach(row => {
                                if(row["구역"] === "실온" && !row["렉 위치"].startsWith("FL-")) row["렉 위치"] = "R-" + row["렉 위치"];
                                else if(row["구역"] === "냉장" && !row["렉 위치"].startsWith("FL-")) row["렉 위치"] = "C-" + row["렉 위치"];
                                allRows.push(row);
                            });
                        }
                    });
                    if(allRows.length > 0) { 
                        const res = await fetch('/api/inbound_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(allRows) }); 
                        const result = await res.json();
                        if(result.status === 'success') { alert(`업로드 성공! 총 ${result.count}건의 신규 입고 데이터가 반영되었습니다.`); load(); }
                        else { alert(`업로드 실패: ${result.message}`); }
                    } else { alert("업로드할 데이터가 비어있습니다."); }
                } catch(err) { alert("엑셀 파일 양식에 문제가 있습니다. 날짜나 숫자 형식을 확인해주세요!"); }
            }; reader.readAsArrayBuffer(file); e.target.value = ''; 
        }

        function generateKakaoText(itemName) { const supplier = prompt(`[${itemName}] 발주처:`); if(!supplier) return; const moq = prompt(`[${supplier}] 수량(EA):`, "1000개"); if(!moq) return; const leadTime = prompt(`납기일:`, "최대한 빠르게"); const text = `[발주 요청서]\\n수신: ${supplier}\\n\\n안녕하세요, 한스팜입니다.\\n아래 품목 발주 요청드립니다.\\n\\n- 품목명: ${itemName}\\n- 발주수량: ${moq}\\n- 납기요청: ${leadTime}\\n\\n확인 후 회신 부탁드립니다. 감사합니다.`; navigator.clipboard.writeText(text.replace(/\\n/g, '\\n')).then(() => { alert("복사 완료"); }); }
        
        function renderSafetyStock() { const targetDays = parseInt(document.getElementById('safe-days-target').value) || 7; let currentTotals = {}; globalOccupancy.forEach(item => { let key = item.item_name + "|" + item.remarks; currentTotals[key] = (currentTotals[key] || 0) + item.quantity; }); let html = ''; let monitoredProducts = productMaster.filter(p => p.daily_usage > 0); if(monitoredProducts.length === 0) { html = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">일간 소모량이 등록된 자재가 없습니다.</td></tr>`; } else { monitoredProducts.forEach(p => { let key = p.item_name + "|" + p.supplier; let totalQty = currentTotals[key] || 0; let safeDaysLeft = totalQty / p.daily_usage; let isDanger = safeDaysLeft < targetDays; let actionBtn = isDanger ? `<button onclick="generateKakaoText('${p.item_name}')" class="mt-2 block w-full bg-yellow-400 hover:bg-yellow-500 text-slate-800 text-[10px] px-2 py-1.5 rounded shadow-sm font-black transition-colors">💬 카톡 발주 복사</button>` : ''; let statusHtml = isDanger ? `<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full font-black text-xs animate-pulse">🔴 위험</span>${actionBtn}` : `<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-black text-xs">🟢 여유</span>`; html += `<tr class="hover:bg-slate-50 transition-colors ${isDanger ? 'bg-rose-50/30' : ''}"><td class="p-4 text-slate-500 text-sm font-bold">${p.category}</td><td class="p-4 text-slate-800 font-black">${p.item_name} <span class="text-rose-600 text-xs">[${p.supplier}]</span></td><td class="p-4 text-right font-bold text-lg text-indigo-700">${totalQty.toLocaleString()}</td><td class="p-4 text-right font-bold text-slate-500">${p.daily_usage.toLocaleString()} / 일</td><td class="p-4 text-center"><div class="w-full bg-slate-200 rounded-full h-2.5 mb-1 max-w-[150px] mx-auto overflow-hidden"><div class="h-2.5 rounded-full ${isDanger ? 'bg-rose-500' : 'bg-emerald-500'}" style="width: ${Math.min((safeDaysLeft/targetDays)*100, 100)}%"></div></div><span class="text-xs font-bold ${isDanger ? 'text-rose-600' : 'text-slate-500'}">${safeDaysLeft.toFixed(1)} 일 버팀</span></td><td class="p-4 text-center">${statusHtml}</td></tr>`; }); } document.getElementById('safety-list').innerHTML = html; }

        function updateZoneTabs() {
            ['tab-room', 'tab-cold', 'tab-floor'].forEach(id => { document.getElementById(id).className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200 text-sm md:text-base"; }); 
            if(currentZone === '실온') { document.getElementById('tab-room').className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base"; document.getElementById('fifo-btn-container').classList.add('hidden'); document.getElementById('floor-select').classList.remove('hidden'); document.getElementById('floor-select-label').classList.remove('hidden'); } 
            else if(currentZone === '냉장') { document.getElementById('tab-cold').className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base"; document.getElementById('fifo-btn-container').classList.remove('hidden'); document.getElementById('floor-select').classList.remove('hidden'); document.getElementById('floor-select-label').classList.remove('hidden'); } 
            else if(currentZone === '현장') { document.getElementById('tab-floor').className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-emerald-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base"; document.getElementById('fifo-btn-container').classList.add('hidden'); document.getElementById('floor-select').classList.add('hidden'); document.getElementById('floor-select-label').classList.add('hidden'); } 
            
            updateMapSearchCategoryDropdown(); 
        }

        function switchZone(zone) { 
            globalSearchTargets = []; 
            currentZone = zone; selectedCellId = null; 
            
            document.getElementById('right-sidebar').classList.add('hidden');
            document.getElementById('right-sidebar').classList.remove('flex');
            
            updateZoneTabs();
            renderMap(); 
        }

        function clearSearchTargets() {
            globalSearchTargets = [];
            document.getElementById('map-search-keyword').value = '';
            renderMap();
        }

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
                            
                            let isTarget = globalSearchTargets.includes(searchId);
                            let pulseClass = isTarget ? 'highlight-pulse' : '';
                            
                            vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}', '${searchId}')" class="h-16 rounded-xl border-2 flex flex-col items-center justify-center text-[11px] font-black cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm hover:scale-105 transition-all">${badge}<span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}번 칸</span></div>`; 
                        } 
                        vHtml += `</div></div>`; 
                    } 
                }); vHtml += `</div>`; vContainer.innerHTML = vHtml; return; 
            } 
            
            document.getElementById('aisle-text').classList.remove('hidden'); document.getElementById('aisle-text').innerText = "통로 (Aisle)"; 
            const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; 
            const prefix = currentZone === '실온' ? 'R-' : 'C-'; 

            activeLayout.forEach(col => { 
                if (col.aisle) { vHtml += `<div class="w-10 md:w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1"><span class="text-yellow-600 font-black tracking-widest text-[10px] md:text-xs" style="writing-mode: vertical-rl;">통로</span></div>`; } 
                else if (col.gap) { vHtml += `<div class="w-2 md:w-4"></div>`; } 
                else { 
                    vHtml += `<div class="flex flex-col w-10 md:w-14 space-y-1 justify-end"><div class="text-center font-black text-xl md:text-2xl text-slate-800 pb-2">${col.id}</div>`; 
                    for (let r = col.cols; r >= 1; r--) { 
                        let displayId = `${col.id}${r}`;
                        let dbId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                        let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                        let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
                        
                        let isTarget = globalSearchTargets.includes(searchId);
                        let pulseClass = isTarget ? 'highlight-pulse' : '';
                        let crossFloorBadge = '';
                        if(floor === "1" && globalSearchTargets.includes(`${dbId}-2F`)) {
                            crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">2F 타겟</div>`;
                        } else if(floor === "2" && globalSearchTargets.includes(dbId)) {
                            crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">1F 타겟</div>`;
                        }

                        vHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[9px] md:text-[10px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
                    } 
                    vHtml += `</div>`; 
                } 
            }); 
            vContainer.innerHTML = vHtml; 
            
            let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
            for (let c = hCols; c >= 1; c--) { 
                let displayId = `${hPrefix}${c}`; 
                let dbId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
                
                let isTarget = globalSearchTargets.includes(searchId);
                let pulseClass = isTarget ? 'highlight-pulse' : '';
                let crossFloorBadge = '';
                if(floor === "1" && globalSearchTargets.includes(`${dbId}-2F`)) {
                    crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">2F 타겟</div>`;
                } else if(floor === "2" && globalSearchTargets.includes(dbId)) {
                    crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">1F 타겟</div>`;
                }

                hHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="w-10 md:w-14 h-10 rounded-[3px] flex items-center justify-center text-[10px] md:text-[11px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
            } 
            hHtml += `</div>`; hContainer.innerHTML = hHtml; 
        }
        
        async function clickCell(displayId, searchId) { 
            selectedCellId = displayId; 
            if(!searchId) { 
                const floor = document.getElementById('floor-select').value; 
                const prefix = currentZone === '실온' ? 'R-' : (currentZone === '냉장' ? 'C-' : '');
                const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`); 
                searchId = floor === "1" ? baseId : `${baseId}-2F`; 
            } 
            renderMap(); 
            
            document.getElementById('right-sidebar').classList.remove('hidden'); 
            document.getElementById('right-sidebar').classList.add('flex');
            
            const panel = document.getElementById('info-panel'); const floorName = currentZone === '현장' ? '생산현장' : document.getElementById('floor-select').options[document.getElementById('floor-select').selectedIndex].text; const items = globalOccupancy.filter(x => x.location_id === searchId); let dateLabel = currentZone === '냉장' ? '산란일' : '입고일'; 
            let panelHtml = `<div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4"><div class="flex justify-between items-start"><div><div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div><div class="text-3xl font-black text-indigo-900">${displayId}</div></div><div class="text-right"><span class="inline-block bg-white text-indigo-700 text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floorName}</span></div></div></div>`; 
            if(items.length > 0) { 
                panelHtml += `<div class="mb-2 text-xs font-bold text-slate-500">적재 목록 (${items.length}건)</div>`; 
                items.forEach(item => { 
                    let dateHtml = item.production_date ? `<div class="text-xs text-rose-600 font-bold mt-1">${dateLabel}: ${item.production_date}</div>` : ''; 
                    
                    let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks) || productMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks); 
                    let cost = pInfo ? (pInfo.unit_price * item.quantity).toLocaleString() : '0'; 
                    
                    let dynPallet = getDynamicPalletCount(item);
                    let palletDisplay = dynPallet > 0 ? `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px] ml-1 font-black">${dynPallet.toFixed(1)} P</span>` : ''; 
                    
                    let editBtn = isAdmin ? `<button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date || ''}', '${searchId}', '${item.remarks || ''}')" class="flex-1 bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200 py-1.5 rounded text-[11px] font-bold transition-colors mt-2 w-full">⚙️ 편집/삭제</button>` : '';

                    panelHtml += `<div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3"><div class="flex justify-between items-start mb-2"><div><span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span><div class="font-black text-sm text-slate-800 mt-1 break-keep">${item.item_name}</div><div class="text-[10px] text-slate-400 font-bold text-rose-600">입고처: ${item.remarks||'기본'}</div></div><div class="text-right"><div class="text-base font-bold text-indigo-600">${item.quantity.toLocaleString()} EA ${palletDisplay}</div></div></div>${dateHtml}<div class="flex space-x-2 mt-3 border-t pt-2"><button onclick="processTransfer('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-1.5 rounded text-[11px] font-bold transition-colors">위치 이동</button><button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-[11px] font-bold transition-colors">선택 출고</button></div>${editBtn}</div>`; 
                }); 
            } else { panelHtml += `<div class="text-center text-slate-400 py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-4"><b class="text-emerald-600 inline-block">비어있습니다 (Empty)</b></div>`; } 
            
            let allItems = [...finishedProductMaster, ...productMaster];
            const catOptions = [...new Set(allItems.map(p => p.category))].map(c => `<option value="${c}">${c}</option>`).join(''); 
            
            panelHtml += `<div class="mt-4 pt-4 border-t border-slate-200"><h3 class="text-sm font-black text-slate-700 mb-3 flex items-center"><svg class="w-4 h-4 mr-1 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> 신규 입고</h3><div class="space-y-2"><div class="flex space-x-2"><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">카테고리</label><select id="in-cat" onchange="updateProductDropdown()" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">선택</option>${catOptions}</select></div><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">품목명</label><select id="in-item" onchange="updateSupplierDropdown()" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">대기</option></select></div></div><div class="flex space-x-2"><div class="w-1/2"><label class="block text-[10px] font-bold text-rose-500 mb-1">입고처</label><select id="in-supplier" onchange="updateQtyBySupplier()" class="w-full border border-rose-300 bg-rose-50 rounded p-1.5 text-xs font-bold"><option value="">품목 선택</option></select></div><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">${dateLabel}</label><input type="date" id="in-date" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"></div></div><div><label class="block text-[10px] font-bold text-indigo-600 mb-1">수량 (EA)</label><input type="number" id="in-qty" value="1" min="1" class="w-full border border-indigo-300 bg-indigo-50 rounded p-1.5 text-xs font-black text-indigo-700"></div><button onclick="processInbound('${searchId}')" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-black shadow-md transition-colors text-sm mt-1 mb-8 md:mb-0">입고 처리</button></div></div>`; 
            
            panel.innerHTML = panelHtml; 
        }

        // 💡 이하 로직은 직전과 동일하게 포함됨
        function executeMapSearch() { 
            const catSelect = document.getElementById('map-search-category').value;
            const keyword = document.getElementById('map-search-keyword').value.trim().toLowerCase(); 
            const countStr = document.getElementById('map-search-count').value; 
            const count = parseInt(countStr); 
            if(catSelect === 'ALL' && !keyword) return alert("카테고리를 선택하거나 검색할 단어를 입력해주세요."); 
            
            let matches = globalOccupancy; 
            if(catSelect !== 'ALL') matches = matches.filter(x => x.category === catSelect);
            if(keyword) matches = matches.filter(x => x.item_name.toLowerCase().includes(keyword));
            
            if(matches.length === 0) return alert("조건에 맞는 품목이 현재 구역에 없습니다."); 
            
            matches.sort((a, b) => {
                let tA = a.production_date ? new Date(a.production_date).getTime() : Infinity;
                let tB = b.production_date ? new Date(b.production_date).getTime() : Infinity;
                return tA - tB;
            }); 
            
            let targets = matches.slice(0, count); 
            globalSearchTargets = targets.map(t => t.location_id);
            
            let firstLoc = globalSearchTargets[0];
            if (firstLoc.startsWith('FL-')) { currentZone = '현장'; } 
            else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } 
            else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
            
            updateZoneTabs();
            renderMap(); 
        }

        function highlightFIFO() { 
            const eggs = globalOccupancy.filter(x => x.production_date && x.location_id.startsWith('C-')); 
            if(eggs.length === 0) return alert("냉장 창고에 산란일 데이터 없음"); 
            eggs.sort((a, b) => new Date(a.production_date) - new Date(b.production_date)); 
            const oldestDate = eggs[0].production_date; 
            let targets = eggs.filter(x => x.production_date === oldestDate);
            globalSearchTargets = targets.map(t => t.location_id);
            
            let firstLoc = globalSearchTargets[0];
            currentZone = '냉장';
            document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1";
            updateZoneTabs();
            renderMap();
            alert(`가장 오래된 산란일: ${oldestDate}\\n해당 위치를 깜빡이로 표시합니다.`); 
        }

        window.onload = function() { load(); showView('dashboard'); };
    </script>
</body>
</html>
