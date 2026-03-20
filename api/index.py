import os
import httpx
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional

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

HTML_CONTENT = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HANSFARM WMS & ERP - PC Version</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <style>
        body { background-color: #e2e8f0; }
        .rack-cell { transition: all 0.15s; position: relative; }
        .cell-empty { background-color: #ffffff; border: 1px dashed #cbd5e1; color: #94a3b8; }
        .cell-full { background-color: #4ade80; border: 1px solid #166534; color: #064e3b; font-weight: bold; }
        .cell-active { background-color: #3b82f6; border: 2px solid #1e3a8a; color: #ffffff; font-weight: bold; transform: scale(1.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 10; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #cbd5e1; }
        ::-webkit-scrollbar-thumb { background: #64748b; border-radius: 4px; }
        @keyframes pulse-red { 0% { opacity: 1; border-color: red; } 50% { opacity: 0.5; background-color: #fecdd3; border-color: red; } 100% { opacity: 1; border-color: red; } }
        .highlight-pulse { animation: pulse-red 1s infinite; border: 3px solid red !important; z-index: 20; }
        .donut-ring { transition: background 1s ease-out; }
    </style>
</head>
<body class="font-sans h-screen flex overflow-hidden text-slate-800 selection:bg-indigo-200">

    <input type="file" id="excel-upload" accept=".xlsx, .xls, .csv" class="hidden" onchange="importExcel(event)">
    <input type="file" id="product-upload" accept=".xlsx, .xls, .csv" class="hidden" onchange="importProductsExcel(event)">

    <aside class="w-36 bg-white border-r border-slate-300 flex flex-col items-center py-6 shadow-lg z-20 shrink-0">
        <div class="mb-8 w-full px-4 flex justify-center"><img src="/logo.jpg" alt="HANS FARM" class="max-w-full h-auto object-contain drop-shadow-sm"></div>
        <div class="flex flex-col space-y-2 w-full px-3 flex-1">
            <button onclick="showView('dashboard')" id="nav-dashboard" class="nav-btn w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all">대시보드</button>
            <button onclick="showView('inventory')" id="nav-inventory" class="nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">재고조회</button>
            <button onclick="showView('search')" id="nav-search" class="nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">검색</button>
            <button onclick="showView('safety')" id="nav-safety" class="nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all text-rose-600">안전재고/발주</button>
            <button onclick="showView('products')" id="nav-products" class="nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">품목관리</button>
            <button onclick="showView('accounting')" id="nav-accounting" class="hidden nav-btn w-full py-3 rounded-md border border-slate-200 text-yellow-700 font-black hover:bg-yellow-50 shadow-sm text-sm transition-all">💰 정산/회계</button>
            <div class="my-2 border-b border-slate-200 w-full"></div>
            <button onclick="exportPhysicalCountExcel()" class="w-full py-3 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-black shadow-inner text-[12px] transition-all hover:bg-blue-100">📋 실사/업로드 양식</button>
            <button onclick="document.getElementById('excel-upload').click()" class="w-full mt-1 py-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-black shadow-inner text-[12px] transition-all hover:bg-emerald-100">⬆️ 엑셀 대량 입고</button>
        </div>
        <div class="w-full px-3 mt-auto pb-4">
            <button id="admin-btn" onclick="adminLogin()" class="w-full py-3 rounded-md bg-slate-800 border border-slate-900 text-slate-300 font-black shadow-inner text-[11px] transition-all hover:bg-slate-700 hover:text-white">🔒 관리자 로그인</button>
        </div>
    </aside>

    <main class="flex-1 bg-slate-200 relative overflow-hidden flex flex-col">
        
        <div id="view-inventory" class="hidden flex-col h-full w-full absolute inset-0 transition-opacity duration-300">
            <header class="h-16 bg-white border-b border-slate-300 flex items-end justify-between px-6 pt-4 shrink-0 shadow-sm z-10">
                <div class="flex space-x-1">
                    <button id="tab-room" onclick="switchZone('실온')" class="px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner">실온 (Room)</button>
                    <button id="tab-cold" onclick="switchZone('냉장')" class="px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200">냉장 (Cold)</button>
                    <button id="tab-floor" onclick="switchZone('현장')" class="px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200">생산 현장 (Floor)</button>
                </div>
                <div class="flex items-center space-x-4 pb-2">
                    <div id="fifo-btn-container" class="hidden mr-4"><button onclick="highlightFIFO()" class="px-4 py-1.5 bg-rose-100 border border-rose-300 text-rose-700 font-black rounded-md hover:bg-rose-200 text-sm flex items-center shadow-sm">선입선출 추천</button></div>
                    <label class="font-bold text-slate-600 text-sm" id="floor-select-label">층 선택</label>
                    <select id="floor-select" onchange="renderMap()" class="bg-white border-2 border-slate-300 text-slate-800 font-bold text-sm rounded-md px-4 py-1.5 shadow-sm"><option value="1">1층 (1F)</option><option value="2">2층 (2F)</option></select>
                    <button onclick="load()" class="ml-4 p-1.5 bg-white border border-slate-300 rounded hover:bg-slate-100"><svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                </div>
            </header>
            <div class="flex-1 overflow-auto p-6 relative">
                <div class="min-w-max min-h-max bg-white p-10 rounded-xl shadow-xl border border-slate-300 mx-auto w-fit transition-all" id="map-container">
                    <div id="vertical-racks" class="flex items-end"></div>
                    <div class="h-14 w-full flex items-center justify-center text-slate-400 font-black tracking-[0.5em] bg-yellow-50/50 border-y-2 border-yellow-300 my-4 shadow-inner text-sm" id="aisle-text">통로 (Aisle)</div>
                    <div class="flex justify-end pr-[168px]" id="horizontal-rack"></div>
                </div>
            </div>
        </div>

        <div id="view-dashboard" class="flex flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-black text-slate-800">📊 한스팜 물류 대시보드</h1>
                <select id="dash-period" onchange="updateDashboard()" class="border-2 border-indigo-200 rounded-lg p-2 font-bold text-indigo-700 bg-white outline-none"><option value="daily">일간 (Daily)</option><option value="weekly">주간 (Weekly)</option><option value="monthly">월간 (Monthly)</option></select>
            </div>
            <div class="grid grid-cols-3 gap-6 mb-6">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border-t-4 border-emerald-500 flex flex-col items-center justify-center">
                    <div class="text-slate-500 font-black text-sm mb-4 w-full text-left">전체 창고 적재율 (현장 제외)</div>
                    <div class="relative w-36 h-36 rounded-full donut-ring flex items-center justify-center shadow-inner" id="dash-donut" style="background: conic-gradient(#10b981 0%, #e2e8f0 0%);">
                        <div class="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center shadow-sm">
                            <span class="text-3xl font-black text-emerald-600" id="dash-cap-percent">0%</span>
                            <span class="text-[10px] text-slate-400 font-bold" id="dash-cap-text">0 / 0 파레트</span>
                        </div>
                    </div>
                </div>
                <div class="col-span-2 grid grid-cols-2 gap-4">
                    <div class="bg-indigo-50 p-5 rounded-2xl shadow-sm border border-indigo-100 flex flex-col justify-between">
                        <div class="flex justify-between items-center mb-2"><div class="font-black text-indigo-800">❄️ 냉장 창고 (Cold)</div><div class="text-indigo-500 font-bold text-sm" id="dash-cold-percent">0%</div></div>
                        <div class="space-y-2 text-sm mt-2">
                            <div class="flex justify-between text-slate-600"><span class="font-bold">총 렉(파레트) 수용량</span><span class="font-black" id="dash-cold-total">0</span></div>
                            <div class="flex justify-between text-indigo-600"><span class="font-bold">적재된 파레트 볼륨</span><span class="font-black" id="dash-cold-occ">0</span></div>
                            <div class="flex justify-between text-emerald-600"><span class="font-bold">비어있는 렉 수</span><span class="font-black" id="dash-cold-empty">0</span></div>
                        </div>
                    </div>
                    <div class="bg-orange-50 p-5 rounded-2xl shadow-sm border border-orange-100 flex flex-col justify-between">
                        <div class="flex justify-between items-center mb-2"><div class="font-black text-orange-800">☀️ 실온 창고 (Room)</div><div class="text-orange-500 font-bold text-sm" id="dash-room-percent">0%</div></div>
                        <div class="space-y-2 text-sm mt-2">
                            <div class="flex justify-between text-slate-600"><span class="font-bold">총 렉(파레트) 수용량</span><span class="font-black" id="dash-room-total">0</span></div>
                            <div class="flex justify-between text-orange-600"><span class="font-bold">적재된 파레트 볼륨</span><span class="font-black" id="dash-room-occ">0</span></div>
                            <div class="flex justify-between text-emerald-600"><span class="font-bold">비어있는 렉 수</span><span class="font-black" id="dash-room-empty">0</span></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-6 mb-6">
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-blue-500">
                    <div class="text-slate-500 font-bold text-sm mb-1 flex items-center justify-between"><span>기간 내 총 입고량 (IN)</span><span class="bg-blue-100 text-blue-600 text-[10px] px-2 py-0.5 rounded font-black">파레트 볼륨 합산</span></div>
                    <div class="text-4xl font-black text-blue-600 mt-2" id="dash-in">0 P</div>
                </div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-rose-500">
                    <div class="text-slate-500 font-bold text-sm mb-1 flex items-center justify-between"><span>기간 내 총 출고량 (OUT)</span><span class="bg-rose-100 text-rose-600 text-[10px] px-2 py-0.5 rounded font-black">파레트 볼륨 합산</span></div>
                    <div class="text-4xl font-black text-rose-600 mt-2" id="dash-out">0 P</div>
                </div>
            </div>
            <div id="admin-finance-panel" class="hidden grid grid-cols-2 gap-6 mb-6">
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

        <div id="view-search" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-8">🔍 산란일/입고일 기반 스마트 스캔</h1>
            <div class="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl text-center">
                <div class="flex space-x-4 mb-6">
                    <div class="w-2/3 text-left"><label class="block text-xs font-bold text-slate-500 mb-1">품목명</label><input type="text" id="search-keyword" placeholder="찾으실 품목명" class="w-full text-lg p-3 border-2 border-indigo-200 rounded-xl font-bold text-indigo-800 outline-none"></div>
                    <div class="w-1/3 text-left"><label class="block text-xs font-bold text-slate-500 mb-1">필요 수량 (EA)</label><input type="number" id="search-count" value="1" min="1" class="w-full text-lg p-3 border-2 border-indigo-200 rounded-xl font-bold text-indigo-800 outline-none"></div>
                </div>
                <button onclick="executeSearch()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg py-4 px-12 rounded-xl shadow-lg transition-all w-full">날짜 빠른 순으로 렉 찾기</button>
            </div>
        </div>

        <div id="view-safety" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex justify-between items-end mb-8 border-b-2 border-slate-200 pb-4">
                <div>
                    <h1 class="text-3xl font-black text-slate-800 flex items-center"><svg class="w-8 h-8 mr-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> 자동 발주/안전재고</h1>
                </div>
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
            <div class="flex justify-between items-center mb-8 border-b pb-4">
                <h1 class="text-3xl font-black text-slate-800">🗂️ 품목 마스터 DB 관리</h1>
                <div class="flex space-x-2">
                    <button onclick="document.getElementById('product-upload').click()" class="bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 py-2 px-4 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors text-sm">대량 업로드 (Excel)</button>
                    <button onclick="exportProductsExcel()" class="bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 py-2 px-4 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors text-sm">양식 다운로드</button>
                    <button id="pm-wipe-btn" onclick="deleteAllProducts()" class="hidden bg-rose-50 text-rose-700 font-bold border border-rose-200 py-2 px-4 rounded-lg shadow-sm hover:bg-rose-100 transition-colors text-sm">⚠️ 품목 일괄 삭제</button>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-8">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit">
                    <h2 class="font-black text-lg text-indigo-700 mb-4 border-b pb-2" id="pm-form-title">신규 품목 추가</h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">카테고리</label><input type="text" id="pm-cat" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">품목명</label><input type="text" id="pm-name" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-rose-500 mb-1">입고처 (거래처명)</label><input type="text" id="pm-supplier" placeholder="예: 서울계란" class="w-full border border-rose-300 bg-rose-50 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">일간 소모량 (EA)</label><input type="number" id="pm-usage" value="0" min="0" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-indigo-600 mb-1">1 파레트당 적재 수량 (EA) - 부피 자동계산용</label><input type="number" id="pm-pallet-ea" value="1" min="1" class="w-full border border-indigo-300 bg-indigo-50 rounded p-2 mb-3 font-bold text-sm text-indigo-700">
                    <label class="block text-xs font-bold text-slate-500 mb-1">단가(원) - 비용계산용</label><input type="number" id="pm-price" value="0" min="0" class="w-full border border-slate-300 rounded p-2 mb-6 font-bold text-sm text-slate-700">
                    <button id="pm-submit-btn" onclick="submitProduct()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-md transition-colors mb-2">DB에 등록하기</button>
                    <button id="pm-cancel-btn" onclick="cancelEdit()" class="hidden w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3 rounded-xl shadow-sm transition-colors">수정 취소</button>
                </div>
                <div class="col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200">
                    <h2 class="font-black text-lg text-slate-700 mb-4 border-b pb-2">등록된 품목 리스트</h2>
                    <div id="pm-list" class="grid grid-cols-2 gap-3 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2"></div>
                </div>
            </div>
        </div>

        <div id="view-accounting" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-yellow-800 mb-8 flex items-center"><svg class="w-8 h-8 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> 매입처별 월마감 및 정산</h1>
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

    </main>

    <aside id="right-sidebar" class="hidden w-80 bg-white border-l border-slate-300 flex-col shadow-lg z-20 shrink-0 transition-all">
        <div class="p-6 border-b border-slate-200 bg-slate-50">
            <h2 class="text-lg font-black text-slate-800 flex items-center"><svg class="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> 위치 상세 정보</h2>
        </div>
        <div class="p-6 flex-1 overflow-y-auto" id="info-panel"><div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div></div>
    </aside>

    <script>
        let globalOccupancy = []; let productMaster = []; let globalHistory = []; let currentZone = '실온'; let selectedCellId = null; let isAdmin = false;
        let editingProductOriginalName = null; let editingProductOriginalSupplier = null;
        
        const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
        const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];
        const layoutFloor = [ { id: 'FL-C', title: '❄️ 생산 현장 (원재료 / 냉장)', cols: 20 }, { aisle: true, text: '==================== 생산 조립 라인 ====================' }, { id: 'FL-R', title: '📦 생산 현장 (부자재 / 실온)', cols: 20 } ];

        function adminLogin() {
            if(isAdmin) { isAdmin = false; alert("관리자 모드 해제"); document.getElementById('admin-btn').innerText = "🔒 관리자 로그인"; document.getElementById('admin-btn').className = "w-full py-3 rounded-md bg-slate-800 border border-slate-900 text-slate-300 font-black shadow-inner text-[11px] transition-all hover:bg-slate-700 hover:text-white"; document.getElementById('nav-accounting').classList.add('hidden'); document.getElementById('admin-finance-panel').classList.add('hidden'); document.getElementById('pm-wipe-btn').classList.add('hidden'); if(document.getElementById('view-accounting').classList.contains('flex')) showView('dashboard'); load(); return; }
            const pw = prompt("비밀번호 입력 (1234):"); if(pw === "1234") { isAdmin = true; alert("관리자 권한 활성화"); document.getElementById('admin-btn').innerText = "🔓 관리자 권한 (ON)"; document.getElementById('admin-btn').className = "w-full py-3 rounded-md bg-rose-600 border border-rose-700 text-white font-black shadow-inner text-[11px] transition-all hover:bg-rose-500 animate-pulse"; document.getElementById('nav-accounting').classList.remove('hidden'); document.getElementById('admin-finance-panel').classList.remove('hidden'); document.getElementById('pm-wipe-btn').classList.remove('hidden'); let today = new Date(); document.getElementById('acc-month').value = today.toISOString().substring(0, 7); load(); }
        }

        async function load() {
            try {
                const [occRes, prodRes, histRes] = await Promise.all([ fetch('/api/inventory'), fetch('/api/products'), fetch('/api/history') ]);
                globalOccupancy = await occRes.json(); productMaster = await prodRes.json(); globalHistory = await histRes.json();
                renderMap(); renderProductMaster(); updateDashboard(); renderSafetyStock(); if(isAdmin) renderAccounting();
                if(selectedCellId) clickCell(selectedCellId); else clearInfo();
            } catch (e) { console.error("로딩 에러:", e); }
        }

        function showView(viewName) {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.className = "nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all");
            let targetBtn = document.getElementById('nav-' + viewName);
            if(targetBtn) { targetBtn.className = "nav-btn w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all" + (viewName==='safety' ? ' text-rose-600 border-rose-200 bg-rose-50' : '') + (viewName==='accounting' ? ' text-yellow-700 border-yellow-300 bg-yellow-50' : ''); }
            ['view-inventory', 'view-dashboard', 'view-search', 'view-products', 'view-safety', 'view-accounting'].forEach(id => { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); });
            document.getElementById('right-sidebar').classList.add('hidden'); document.getElementById('view-' + viewName).classList.remove('hidden'); document.getElementById('view-' + viewName).classList.add('flex');
            if(viewName === 'inventory') { document.getElementById('right-sidebar').classList.remove('hidden'); document.getElementById('right-sidebar').classList.add('flex'); renderMap(); }
            else if(viewName === 'products') renderProductMaster(); else if(viewName === 'dashboard') updateDashboard(); else if(viewName === 'safety') renderSafetyStock(); else if(viewName === 'accounting') renderAccounting();
        }

        // 💡 [핵심] 실시간 동적 파레트 계산 헬퍼 함수
        function getDynamicPalletCount(itemName, supplier, quantity) {
            let targetSup = supplier ? supplier.trim() : "기본입고처";
            let pInfo = productMaster.find(p => p.item_name.trim() === itemName.trim() && p.supplier.trim() === targetSup);
            if (!pInfo) pInfo = productMaster.find(p => p.item_name.trim() === itemName.trim()); // 입고처 틀려도 이름 같으면 보험으로 찾기
            let ea = (pInfo && pInfo.pallet_ea > 0) ? pInfo.pallet_ea : 1;
            return quantity / ea;
        }

        function generateLocations(zone) {
            let locs = [];
            if(zone === '실온') {
                layoutRoom.forEach(col => { if(col.cols) { for(let r=1; r<=col.cols; r++) { locs.push(`R-${col.id}-${r.toString().padStart(2, '0')}`); locs.push(`R-${col.id}-${r.toString().padStart(2, '0')}-2F`); } } });
                for(let c=1; c<=12; c++) { locs.push(`R-K-${c.toString().padStart(2, '0')}`); locs.push(`R-K-${c.toString().padStart(2, '0')}-2F`); }
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
                    if (items.length > 0) { items.forEach(item => { wsData.push({ "구역": zone, "렉 위치": displayLocId, "카테고리": item.category, "품목명": item.item_name, "입고처(비고)": item.remarks || "", "전산 현재고": item.quantity, "➕신규 입고수량(EA)": "", "산란일/입고일": item.production_date || "" }); }); } 
                    else { wsData.push({ "구역": zone, "렉 위치": displayLocId, "카테고리": "", "품목명": "", "입고처(비고)": "", "전산 현재고": 0, "➕신규 입고수량(EA)": "", "산란일/입고일": "" }); }
                });
                const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [ {wch: 10}, {wch: 15}, {wch: 15}, {wch: 25}, {wch: 15}, {wch: 12}, {wch: 20}, {wch: 15} ]; XLSX.utils.book_append_sheet(wb, ws, zone); 
            });
            const refData = productMaster.map(p => ({ "복사용_카테고리": p.category, "복사용_품목명": p.item_name, "복사용_입고처": p.supplier, "1P_EA기준": p.pallet_ea }));
            const wsRef = XLSX.utils.json_to_sheet(refData); wsRef['!cols'] = [ {wch: 15}, {wch: 25}, {wch: 15}, {wch: 12} ]; XLSX.utils.book_append_sheet(wb, wsRef, "품목DB(참조용)");
            XLSX.writeFile(wb, "한스팜_재고실사및입고양식.xlsx");
        }

        function importExcel(e) { 
            const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); 
            reader.onload = async function(ev) { 
                try {
                    const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); let allRows = [];
                    workbook.SheetNames.forEach(sheetName => { 
                        if(sheetName !== "품목DB(참조용)") { 
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
                        else { alert(`업로드 실패 (서버 에러): ${result.message}`); }
                    } else { alert("업로드할 데이터가 비어있습니다."); }
                } catch(err) { alert("엑셀 파일 양식에 문제가 있습니다. 날짜나 숫자 형식을 확인해주세요!"); }
            }; 
            reader.readAsArrayBuffer(file); e.target.value = ''; 
        }

        function renderProductMaster() { document.getElementById('pm-list').innerHTML = productMaster.map(p => { let delBtn = isAdmin ? `<button onclick="deleteProduct('${p.item_name}', '${p.supplier}')" class="text-rose-500 hover:bg-rose-100 p-1.5 rounded transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''; return `<div class="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200"><div><span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded mr-1">${p.category}</span><span class="font-bold text-sm text-slate-800">${p.item_name}</span> <span class="text-xs font-bold text-rose-600">[${p.supplier}]</span><div class="text-[10px] text-slate-500 mt-1">1P기준: <b class="text-indigo-600">${p.pallet_ea} EA</b> | 소모량: ${p.daily_usage} EA | 단가: ${p.unit_price.toLocaleString()}원</div></div><div class="flex space-x-1"><button onclick="editProductSetup('${p.category}', '${p.item_name}', '${p.supplier}', ${p.daily_usage}, ${p.unit_price}, ${p.pallet_ea})" class="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>${delBtn}</div></div>`; }).join(''); }
        function editProductSetup(cat, name, supplier, usage, price, ea) { editingProductOriginalName = name; editingProductOriginalSupplier = supplier; document.getElementById('pm-cat').value = cat; document.getElementById('pm-name').value = name; document.getElementById('pm-supplier').value = supplier; document.getElementById('pm-usage').value = usage; document.getElementById('pm-price').value = price; document.getElementById('pm-pallet-ea').value = ea || 1; document.getElementById('pm-form-title').innerText = "기존 품목 수정 모드"; document.getElementById('pm-submit-btn').innerText = "✅ 변경사항 저장"; document.getElementById('pm-submit-btn').classList.replace('bg-indigo-600', 'bg-emerald-600'); document.getElementById('pm-submit-btn').classList.replace('hover:bg-indigo-700', 'hover:bg-emerald-700'); document.getElementById('pm-cancel-btn').classList.remove('hidden'); }
        function cancelEdit() { editingProductOriginalName = null; editingProductOriginalSupplier = null; document.getElementById('pm-cat').value = ''; document.getElementById('pm-name').value = ''; document.getElementById('pm-supplier').value = ''; document.getElementById('pm-usage').value = '0'; document.getElementById('pm-price').value = '0'; document.getElementById('pm-pallet-ea').value = '1'; document.getElementById('pm-form-title').innerText = "신규 품목 추가"; document.getElementById('pm-submit-btn').innerText = "DB에 등록하기"; document.getElementById('pm-submit-btn').classList.replace('bg-emerald-600', 'bg-indigo-600'); document.getElementById('pm-submit-btn').classList.replace('hover:bg-emerald-700', 'hover:bg-indigo-700'); document.getElementById('pm-cancel-btn').classList.add('hidden'); }
        async function submitProduct() { const cat = document.getElementById('pm-cat').value.trim(); const name = document.getElementById('pm-name').value.trim(); const supplier = document.getElementById('pm-supplier').value.trim() || '기본입고처'; const usage = parseInt(document.getElementById('pm-usage').value) || 0; const price = parseInt(document.getElementById('pm-price').value) || 0; const ea = parseInt(document.getElementById('pm-pallet-ea').value) || 1; if(!cat || !name) return alert("카테고리와 품목명은 필수입니다."); try { if(editingProductOriginalName) { await fetch(`/api/products?old_name=${encodeURIComponent(editingProductOriginalName)}&old_supplier=${encodeURIComponent(editingProductOriginalSupplier)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); alert("수정 완료"); cancelEdit(); } else { await fetch('/api/products', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); alert("등록 완료"); document.getElementById('pm-name').value = ''; document.getElementById('pm-supplier').value = ''; } load(); } catch(e) { alert("서버 통신 실패"); } }
        async function deleteProduct(name, supplier) { if(!confirm(`[${name} - ${supplier}] 품목을 개별 삭제하시겠습니까?`)) return; try { await fetch(`/api/products?item_name=${encodeURIComponent(name)}&supplier=${encodeURIComponent(supplier)}`, { method: 'DELETE' }); load(); } catch(e) {} }
        async function deleteAllProducts() { if(!confirm("⚠️ 정말 모든 품목 마스터를 일괄 삭제하시겠습니까?")) return; const pw = prompt("관리자 비밀번호(1234) 입력:"); if(pw !== "1234") return alert("틀렸습니다."); try { await fetch('/api/products_all', { method: 'DELETE' }); alert("일괄 삭제 완료!"); load(); } catch(e) { alert("삭제 실패!"); } }
        function exportProductsExcel() { try { let wsData = []; if (productMaster.length === 0) { wsData = [{ "카테고리": "", "품목명": "", "입고처(공급사)": "", "일간소모량(EA)": "", "단가(비용)": "", "1P기준수량(EA)": "" }]; } else { wsData = productMaster.map(p => ({ "카테고리": p.category || "미분류", "품목명": p.item_name || "", "입고처(공급사)": p.supplier || "기본입고처", "일간소모량(EA)": p.daily_usage || 0, "단가(비용)": p.unit_price || 0, "1P기준수량(EA)": p.pallet_ea || 1 })); } const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, "품목마스터"); XLSX.writeFile(wb, "품목마스터_양식(기존데이터포함).xlsx"); } catch (error) { console.error(error); alert("엑셀 다운로드 중 오류가 발생했습니다."); } }
        function importProductsExcel(e) { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = async function(ev) { try { const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); if(json.length > 0) { await fetch('/api/products_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); alert("품목 대량 업로드 완료!"); load(); } } catch(err) { console.error(err); alert("업로드 처리 중 오류 발생: 양식을 다시 확인해주세요."); } }; reader.readAsArrayBuffer(file); e.target.value = ''; }
        function generateKakaoText(itemName) { const supplier = prompt(`[${itemName}] 발주처:`); if(!supplier) return; const moq = prompt(`[${supplier}] 수량(EA):`, "1000개"); if(!moq) return; const leadTime = prompt(`납기일:`, "최대한 빠르게"); const text = `[발주 요청서]\\n수신: ${supplier}\\n\\n안녕하세요, 한스팜입니다.\\n아래 품목 발주 요청드립니다.\\n\\n- 품목명: ${itemName}\\n- 발주수량: ${moq}\\n- 납기요청: ${leadTime}\\n\\n확인 후 회신 부탁드립니다. 감사합니다.`; navigator.clipboard.writeText(text.replace(/\\n/g, '\\n')).then(() => { alert("복사 완료"); }); }
        function renderSafetyStock() { const targetDays = parseInt(document.getElementById('safe-days-target').value) || 7; let currentTotals = {}; globalOccupancy.forEach(item => { let key = item.item_name + "|" + item.remarks; currentTotals[key] = (currentTotals[key] || 0) + item.quantity; }); let html = ''; let monitoredProducts = productMaster.filter(p => p.daily_usage > 0); if(monitoredProducts.length === 0) { html = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">일간 소모량이 등록된 품목이 없습니다.</td></tr>`; } else { monitoredProducts.forEach(p => { let key = p.item_name + "|" + p.supplier; let totalQty = currentTotals[key] || 0; let safeDaysLeft = totalQty / p.daily_usage; let isDanger = safeDaysLeft < targetDays; let actionBtn = isDanger ? `<button onclick="generateKakaoText('${p.item_name}')" class="mt-2 block w-full bg-yellow-400 hover:bg-yellow-500 text-slate-800 text-[10px] px-2 py-1.5 rounded shadow-sm font-black transition-colors">💬 카톡 발주 복사</button>` : ''; let statusHtml = isDanger ? `<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full font-black text-xs animate-pulse">🔴 위험</span>${actionBtn}` : `<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-black text-xs">🟢 여유</span>`; html += `<tr class="hover:bg-slate-50 transition-colors ${isDanger ? 'bg-rose-50/30' : ''}"><td class="p-4 text-slate-500 text-sm font-bold">${p.category}</td><td class="p-4 text-slate-800 font-black">${p.item_name} <span class="text-rose-600 text-xs">[${p.supplier}]</span></td><td class="p-4 text-right font-bold text-lg text-indigo-700">${totalQty.toLocaleString()}</td><td class="p-4 text-right font-bold text-slate-500">${p.daily_usage.toLocaleString()} / 일</td><td class="p-4 text-center"><div class="w-full bg-slate-200 rounded-full h-2.5 mb-1 max-w-[150px] mx-auto overflow-hidden"><div class="h-2.5 rounded-full ${isDanger ? 'bg-rose-500' : 'bg-emerald-500'}" style="width: ${Math.min((safeDaysLeft/targetDays)*100, 100)}%"></div></div><span class="text-xs font-bold ${isDanger ? 'text-rose-600' : 'text-slate-500'}">${safeDaysLeft.toFixed(1)} 일 버팀</span></td><td class="p-4 text-center">${statusHtml}</td></tr>`; }); } document.getElementById('safety-list').innerHTML = html; }

        function switchZone(zone) { 
            currentZone = zone; selectedCellId = null; clearInfo(); 
            ['tab-room', 'tab-cold', 'tab-floor'].forEach(id => { document.getElementById(id).className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200"; }); 
            if(zone === '실온') { document.getElementById('tab-room').className = "px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner"; document.getElementById('fifo-btn-container').classList.add('hidden'); document.getElementById('floor-select').classList.remove('hidden'); document.getElementById('floor-select-label').classList.remove('hidden'); } 
            else if(zone === '냉장') { document.getElementById('tab-cold').className = "px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner"; document.getElementById('fifo-btn-container').classList.remove('hidden'); document.getElementById('floor-select').classList.remove('hidden'); document.getElementById('floor-select-label').classList.remove('hidden'); } 
            else if(zone === '현장') { document.getElementById('tab-floor').className = "px-8 py-2.5 bg-emerald-500 text-white font-bold rounded-t-lg shadow-inner"; document.getElementById('fifo-btn-container').classList.add('hidden'); document.getElementById('floor-select').classList.add('hidden'); document.getElementById('floor-select-label').classList.add('hidden'); } 
            renderMap(); 
        }

        function renderMap() { 
            const floor = document.getElementById('floor-select').value; const vContainer = document.getElementById('vertical-racks'); const hContainer = document.getElementById('horizontal-rack'); 
            const occMap = {}; const palletMap = {}; 
            
            // 💡 맵을 그리기 전, 모든 재고의 실시간 동적 부피 합산
            globalOccupancy.forEach(item => { 
                occMap[item.location_id] = true; 
                palletMap[item.location_id] = (palletMap[item.location_id] || 0) + getDynamicPalletCount(item.item_name, item.remarks, item.quantity); 
            }); 

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
                            vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}', '${searchId}')" class="h-16 rounded-xl border-2 flex flex-col items-center justify-center text-[11px] font-black cursor-pointer rack-cell ${cellState} shadow-sm hover:scale-105 transition-all">${badge}<span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}번 칸</span></div>`; 
                        } 
                        vHtml += `</div></div>`; 
                    } 
                }); vHtml += `</div>`; vContainer.innerHTML = vHtml; return; 
            } 
            
            document.getElementById('aisle-text').classList.remove('hidden'); document.getElementById('aisle-text').innerText = "통로 (Aisle)"; 
            const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; 
            const prefix = currentZone === '실온' ? 'R-' : 'C-'; 

            activeLayout.forEach(col => { 
                if (col.aisle) { vHtml += `<div class="w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1"><span class="text-yellow-600 font-black tracking-widest text-xs" style="writing-mode: vertical-rl;">통로</span></div>`; } 
                else if (col.gap) { vHtml += `<div class="w-4"></div>`; } 
                else { 
                    vHtml += `<div class="flex flex-col w-14 space-y-1 justify-end"><div class="text-center font-black text-2xl text-slate-800 pb-2">${col.id}</div>`; 
                    for (let r = col.cols; r >= 1; r--) { 
                        let displayId = `${col.id}${r}`;
                        let dbId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                        let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                        let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
                        vHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[10px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">${badge}${displayId}</div>`; 
                    } 
                    vHtml += `</div>`; 
                } 
            }); 
            vContainer.innerHTML = vHtml; 
            
            let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 12 : 8; 
            for (let c = hCols; c >= 1; c--) { 
                let displayId = `${hPrefix}${c}`; 
                let dbId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
                hHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="w-14 h-10 rounded-[3px] flex items-center justify-center text-[11px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">${badge}${displayId}</div>`; 
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
            const panel = document.getElementById('info-panel'); const floorName = currentZone === '현장' ? '생산현장' : document.getElementById('floor-select').options[document.getElementById('floor-select').selectedIndex].text; const items = globalOccupancy.filter(x => x.location_id === searchId); let dateLabel = currentZone === '냉장' ? '산란일' : '입고일'; 
            let panelHtml = `<div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4"><div class="flex justify-between items-start"><div><div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div><div class="text-3xl font-black text-indigo-900">${displayId}</div></div><div class="text-right"><span class="inline-block bg-white text-indigo-700 text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floorName}</span></div></div></div>`; 
            if(items.length > 0) { 
                panelHtml += `<div class="mb-2 text-xs font-bold text-slate-500">적재 목록 (${items.length}건)</div>`; 
                items.forEach(item => { 
                    let dateHtml = item.production_date ? `<div class="text-xs text-rose-600 font-bold mt-1">${dateLabel}: ${item.production_date}</div>` : ''; 
                    let pInfo = productMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks); let cost = pInfo ? (pInfo.unit_price * item.quantity).toLocaleString() : '0'; 
                    let adjustBtn = isAdmin ? `<button onclick="processAdjust('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="text-[9px] text-slate-400 font-normal underline hover:text-indigo-600 ml-2">수량 보정</button>` : ''; 
                    
                    // 💡 사이드 패널에서도 실시간 동적 부피 계산
                    let dynPallet = getDynamicPalletCount(item.item_name, item.remarks, item.quantity);
                    let palletDisplay = dynPallet > 0 ? `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px] ml-1 font-black">${dynPallet.toFixed(1)} P</span>` : ''; 
                    
                    panelHtml += `<div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3"><div class="flex justify-between items-start mb-2"><div><span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span><div class="font-black text-sm text-slate-800 mt-1">${item.item_name}${adjustBtn}</div><div class="text-[10px] text-slate-400 font-bold text-rose-600">입고처: ${item.remarks||'기본'} (총액: ${cost}원)</div></div><div class="text-right"><div class="text-sm font-bold text-indigo-600">${item.quantity.toLocaleString()} EA ${palletDisplay}</div></div></div>${dateHtml}<div class="flex space-x-2 mt-3 border-t pt-2"><button onclick="processTransfer('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-1.5 rounded text-[11px] font-bold transition-colors">위치 이동</button><button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-[11px] font-bold transition-colors">선택 출고</button></div></div>`; 
                }); 
            } else { panelHtml += `<div class="text-center text-slate-400 py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-4"><b class="text-emerald-600 inline-block">비어있습니다 (Empty)</b></div>`; } 
            const catOptions = [...new Set(productMaster.map(p => p.category))].map(c => `<option value="${c}">${c}</option>`).join(''); 
            panelHtml += `<div class="mt-4 pt-4 border-t border-slate-200"><h3 class="text-sm font-black text-slate-700 mb-3 flex items-center"><svg class="w-4 h-4 mr-1 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> 신규 입고</h3><div class="space-y-2"><div class="flex space-x-2"><div class="w-1/3"><label class="block text-[10px] font-bold text-slate-400 mb-1">카테고리</label><select id="in-cat" onchange="updateProductDropdown()" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">선택</option>${catOptions}</select></div><div class="w-2/3"><label class="block text-[10px] font-bold text-slate-400 mb-1">품목명</label><select id="in-item" onchange="updateSupplierDropdown()" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">선택 대기</option></select></div></div><div class="flex space-x-2"><div class="w-1/2"><label class="block text-[10px] font-bold text-rose-500 mb-1">입고처 (단가 매칭용)</label><select id="in-supplier" class="w-full border border-rose-300 bg-rose-50 rounded p-1.5 text-xs font-bold"><option value="">품목 선택</option></select></div><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">${dateLabel}</label><input type="date" id="in-date" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"></div></div><div><label class="block text-[10px] font-bold text-indigo-600 mb-1">수량 (EA)</label><input type="number" id="in-qty" value="1" min="1" class="w-full border border-indigo-300 bg-indigo-50 rounded p-1.5 text-xs font-black text-indigo-700"></div><p class="text-[9px] text-slate-400 text-center mb-1">* 파레트 부피(P)는 품목 마스터 정보를 바탕으로 자동 계산됩니다.</p><button onclick="processInbound('${searchId}')" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-black shadow-md transition-colors text-sm mt-1">입고 처리</button></div></div>`; 
            let locHistory = globalHistory.filter(h => h.location_id === searchId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5); let histHtml = '<div class="mt-6 pt-4 border-t border-slate-200"><h3 class="text-sm font-black text-slate-700 mb-3 flex items-center"><svg class="w-4 h-4 mr-1 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> 최근 내역 (최대 5건)</h3><div class="space-y-2">'; if(locHistory.length > 0) { locHistory.forEach(h => { let actionColor = h.action_type === '입고' ? 'text-emerald-600' : (h.action_type === '출고' ? 'text-rose-600' : 'text-blue-600'); let dateStr = new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); histHtml += `<div class="bg-white p-2 border border-slate-200 rounded text-xs shadow-sm"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${dateStr}</span><br><span class="font-bold text-slate-700">${h.item_name} <span class="text-slate-400">(${h.quantity}EA / ${h.pallet_count ? h.pallet_count.toFixed(1) : 1}P)</span></span></div>`; }); } else { histHtml += `<div class="text-xs text-slate-400 text-center py-4">기록이 없습니다.</div>`; } histHtml += '</div></div>'; panelHtml += histHtml; panel.innerHTML = panelHtml; 
        }

        function clearInfo() { document.getElementById('info-panel').innerHTML = `<div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div>`; }
        function updateProductDropdown() { const cat = document.getElementById('in-cat').value; const items = [...new Set(productMaster.filter(p => p.category === cat).map(p => p.item_name))]; document.getElementById('in-item').innerHTML = items.map(name => `<option value="${name}">${name}</option>`).join(''); updateSupplierDropdown(); }
        function updateSupplierDropdown() { const cat = document.getElementById('in-cat').value; const item = document.getElementById('in-item').value; const suppliers = productMaster.filter(p => p.category === cat && p.item_name === item).map(p => p.supplier); document.getElementById('in-supplier').innerHTML = suppliers.map(s => `<option value="${s}">${s}</option>`).join(''); }

        function updateDashboard() { 
            const period = document.getElementById('dash-period').value; let startDate = new Date(); if(period === 'daily') startDate.setDate(startDate.getDate() - 1); else if(period === 'weekly') startDate.setDate(startDate.getDate() - 7); else if(period === 'monthly') startDate.setMonth(startDate.getMonth() - 1); 
            let inPallets = 0, outPallets = 0, productionCost = 0; globalHistory.forEach(log => { if(new Date(log.created_at) >= startDate) { if(log.action_type === '입고') inPallets += (log.pallet_count || 1); if(log.action_type === '출고') { outPallets += (log.pallet_count || 1); let pInfo = productMaster.find(p => p.item_name === log.item_name); if(pInfo) productionCost += (pInfo.unit_price * log.quantity); } } }); document.getElementById('dash-in').innerText = inPallets.toFixed(1) + ' P'; document.getElementById('dash-out').innerText = outPallets.toFixed(1) + ' P'; if(isAdmin) document.getElementById('dash-cost-out').innerText = productionCost.toLocaleString() + ' 원'; 
            
            let totalRoom = 0, occRoom = 0, totalCold = 0, occCold = 0; let valRoom = 0, valCold = 0; 
            
            // 💡 대시보드도 실시간 동적 부피 합산 적용
            globalOccupancy.forEach(item => { 
                let dynP = getDynamicPalletCount(item.item_name, item.remarks, item.quantity);
                let pInfo = productMaster.find(prod => prod.item_name === item.item_name && prod.supplier === item.remarks); let val = pInfo ? pInfo.unit_price * item.quantity : 0; 
                if(item.location_id.startsWith('R-')) { occRoom += dynP; valRoom += val; } 
                else if(item.location_id.startsWith('C-')) { occCold += dynP; valCold += val; } 
                else { valRoom += val; } 
            }); 
            
            layoutRoom.forEach(col => { if(col.cols) totalRoom += col.cols * 2; }); totalRoom += 24; layoutCold.forEach(col => { if(col.cols) totalCold += col.cols * 2; }); totalCold += 16; let totalAll = totalRoom + totalCold; let occAll = occRoom + occCold; let capRate = totalAll > 0 ? Math.round((occAll / totalAll) * 100) : 0; document.getElementById('dash-cap-percent').innerText = capRate + '%'; document.getElementById('dash-cap-text').innerText = `${occAll.toFixed(1)} / ${totalAll} 파레트`; let color = capRate > 100 ? '#e11d48' : '#10b981'; document.getElementById('dash-donut').style.background = `conic-gradient(${color} 0% ${Math.min(capRate, 100)}%, #e2e8f0 ${Math.min(capRate, 100)}% 100%)`; document.getElementById('dash-room-total').innerText = totalRoom; document.getElementById('dash-room-occ').innerText = occRoom.toFixed(1); document.getElementById('dash-room-empty').innerText = Math.max(0, totalRoom - Math.floor(occRoom)); document.getElementById('dash-room-percent').innerText = totalRoom > 0 ? Math.round((occRoom/totalRoom)*100) + '%' : '0%'; document.getElementById('dash-cold-total').innerText = totalCold; document.getElementById('dash-cold-occ').innerText = occCold.toFixed(1); document.getElementById('dash-cold-empty').innerText = Math.max(0, totalCold - Math.floor(occCold)); document.getElementById('dash-cold-percent').innerText = totalCold > 0 ? Math.round((occCold/totalCold)*100) + '%' : '0%'; if(isAdmin) { document.getElementById('dash-val-room').innerText = valRoom.toLocaleString() + ' 원'; document.getElementById('dash-val-cold').innerText = valCold.toLocaleString() + ' 원'; document.getElementById('dash-val-total').innerText = (valRoom + valCold).toLocaleString() + ' 원'; document.getElementById('admin-dashboard-panel').innerHTML = `<div class="mt-8 p-6 bg-rose-50 border border-rose-200 rounded-2xl"><h3 class="text-rose-800 font-black text-lg mb-4 flex items-center">🚨 시스템 관리자 전용 구역</h3><div class="flex space-x-4"><button onclick="clearData('inventory')" class="bg-white border border-rose-300 text-rose-600 font-bold py-3 px-6 rounded-lg shadow-sm hover:bg-rose-100 transition-colors">📦 창고 재고 전체 삭제</button><button onclick="clearData('history')" class="bg-white border border-rose-300 text-rose-600 font-bold py-3 px-6 rounded-lg shadow-sm hover:bg-rose-100 transition-colors">📝 히스토리 내역 전체 삭제</button></div></div>`; } else { document.getElementById('admin-dashboard-panel').innerHTML = ''; } 
        }

        function renderAccounting() { const selMonth = document.getElementById('acc-month').value; if(!selMonth) return; let suppliers = [...new Set(globalHistory.filter(h => h.action_type === '입고').map(h => h.remarks || '기본입고처'))]; let supSelect = document.getElementById('acc-supplier'); let currentSel = supSelect.value; supSelect.innerHTML = `<option value="ALL">전체 매입처 보기</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join(''); if(suppliers.includes(currentSel)) supSelect.value = currentSel; const selectedSup = supSelect.value; let totalAcc = 0, unpaidAcc = 0, paidAcc = 0; let html = ''; let filtered = globalHistory.filter(h => { let hMonth = h.created_at.substring(0, 7); let hSup = h.remarks || '기본입고처'; return h.action_type === '입고' && hMonth === selMonth && (selectedSup === 'ALL' || selectedSup === hSup); }); filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); filtered.forEach(h => { let pInfo = productMaster.find(p => p.item_name === h.item_name && p.supplier === (h.remarks || '기본입고처')); let price = pInfo ? pInfo.unit_price : 0; let cost = price * h.quantity; totalAcc += cost; let isPaid = h.payment_status === '결제완료'; if(isPaid) paidAcc += cost; else unpaidAcc += cost; let dateStr = new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); let btnHtml = isPaid ? `<button onclick="togglePayment('${h.id}', '미지급')" class="bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded text-[10px] hover:bg-slate-200">취소</button>` : `<button onclick="togglePayment('${h.id}', '결제완료')" class="bg-blue-500 text-white font-bold px-2 py-1 rounded text-[10px] hover:bg-blue-600 shadow-sm">결제완료 처리</button>`; let statusTag = isPaid ? `<span class="text-blue-600 font-black text-xs mr-2">✅ 완료</span>` : `<span class="text-rose-500 font-black text-xs mr-2">⏳ 미지급</span>`; html += `<tr class="hover:bg-slate-50 transition-colors"><td class="p-3 text-slate-500">${dateStr}</td><td class="p-3 font-bold text-slate-700">${h.remarks || '기본'}</td><td class="p-3 font-black text-slate-800">${h.item_name}</td><td class="p-3 text-right font-bold text-indigo-600">${h.quantity.toLocaleString()}</td><td class="p-3 text-right text-slate-500">${price.toLocaleString()}</td><td class="p-3 text-right font-black text-slate-800">${cost.toLocaleString()}</td><td class="p-3 text-center flex items-center justify-center">${statusTag} ${btnHtml}</td></tr>`; }); document.getElementById('acc-list').innerHTML = html || `<tr><td colspan="7" class="p-10 text-center text-slate-400 font-bold">해당 월에 입고(매입) 내역이 없습니다.</td></tr>`; document.getElementById('acc-total').innerText = totalAcc.toLocaleString() + ' 원'; document.getElementById('acc-unpaid').innerText = unpaidAcc.toLocaleString() + ' 원'; document.getElementById('acc-paid').innerText = paidAcc.toLocaleString() + ' 원'; }
        async function togglePayment(logId, status) { try { await fetch(`/api/history/${logId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({payment_status: status}) }); load(); } catch(e) { alert("상태 변경 실패!"); } }
        async function processInbound(locId) { const cat = document.getElementById('in-cat').value; const item = document.getElementById('in-item').value; const qty = parseInt(document.getElementById('in-qty').value); let date = document.getElementById('in-date').value; const supplier = document.getElementById('in-supplier').value; if(!cat || !item || isNaN(qty)) return alert("필수값 입력 요망"); if(!date && currentZone !== '냉장') { let t = new Date(); date = t.toISOString().split('T')[0]; } let pInfo = productMaster.find(p => p.item_name === item && p.supplier === supplier); let palletEa = (pInfo && pInfo.pallet_ea > 0) ? pInfo.pallet_ea : 1; let autoPalletCount = qty / palletEa; try { await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ location_id: locId, category: cat, item_name: item, quantity: qty, pallet_count: autoPalletCount, production_date: date || null, remarks: supplier }) }); alert("입고 완료!"); load(); } catch(e) {} }
        async function processOutbound(invId, itemName, maxQty, currentPallet, locId) { const qtyStr = prompt(`[${itemName}] 소진할 수량(EA)을 입력하세요. (최대 ${maxQty}EA)`, maxQty); if(!qtyStr) return; const qty = parseInt(qtyStr); if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량"); const outPallet = (qty / maxQty) * currentPallet; try { await fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: qty, pallet_count: outPallet }) }); alert("출고 완료!"); load(); } catch(e) {} }
        async function processTransfer(invId, itemName, maxQty, currentPallet, fromLoc) { const qtyStr = prompt(`[${itemName}] 이동시킬 수량(EA)을 입력하세요. (최대 ${maxQty}EA)`, maxQty); if(!qtyStr) return; const qty = parseInt(qtyStr); if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량"); const toLoc = prompt(`[${itemName}] ${qty}EA를 이동할 목적지를 입력하세요\\n(창고 예시: C-B-02-1F, 현장 예시: FL-C-01)`, "FL-C-01"); if(!toLoc) return; const movePallet = (qty / maxQty) * currentPallet; try { await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc.toUpperCase(), item_name: itemName, quantity: qty, pallet_count: movePallet }) }); alert("이동 완료!"); load(); } catch(e) {} }
        async function processAdjust(invId, itemName, currentQty, locId) { const qtyStr = prompt(`실제 전산 수량을 보정합니다.\\n(현재: ${currentQty} EA)`); if(!qtyStr) return; const newQty = parseInt(qtyStr); if(isNaN(newQty) || newQty < 0) return; try { await fetch('/api/adjust', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, new_quantity: newQty }) }); alert("보정 완료!"); load(); } catch(e) {} }
        
        function executeSearch() { const keyword = document.getElementById('search-keyword').value.trim(); const countStr = document.getElementById('search-count').value; const count = parseInt(countStr); if(!keyword || isNaN(count) || count < 1) return alert("입력 확인 요망"); let matches = globalOccupancy.filter(x => x.item_name.includes(keyword) && x.production_date); if(matches.length === 0) return alert("데이터 없음"); matches.sort((a, b) => new Date(a.production_date) - new Date(b.production_date)); let targets = matches.slice(0, count); document.getElementById('nav-inventory').click(); alert(`날짜 가장 빠른 렉 ${targets.length}개 발견`); document.querySelectorAll('.highlight-pulse').forEach(el => el.classList.remove('highlight-pulse')); targets.forEach(item => { let displayId = item.location_id.replace(/^(R-|C-)/, ''); let match = displayId.match(/([A-Z])-([0-9]+)/) || displayId.match(/(FL-[CR]-[0-9]+)/); if(match) { let elId = match[0].startsWith('FL') ? `cell-${match[0]}` : `cell-${match[1]}${parseInt(match[2])}`; let el = document.getElementById(elId); if(el) el.classList.add('highlight-pulse'); } }); }
        function highlightFIFO() { const eggs = globalOccupancy.filter(x => x.production_date && x.location_id.startsWith('C-')); if(eggs.length === 0) return alert("냉장 창고에 산란일 데이터 없음"); eggs.sort((a, b) => new Date(a.production_date) - new Date(b.production_date)); const oldestDate = eggs[0].production_date; alert(`가장 오래된 산란일: ${oldestDate}\\n깜빡입니다!`); eggs.filter(x => x.production_date === oldestDate).map(x => x.location_id).forEach(loc => { let displayId = loc.replace('C-', ''); let match = displayId.match(/([A-Z])-([0-9]+)/); if(match) { let elId = `cell-${match[1]}${parseInt(match[2])}`; let el = document.getElementById(elId); if(el) el.classList.add('highlight-pulse'); } }); }
        async function clearData(target) { if(!confirm(`정말 삭제하시겠습니까?`)) return; try { await fetch(`/api/clear_data?target=${target}`, { method: 'DELETE' }); alert("초기화 완료"); load(); } catch(e) {} }

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
        payloads = []
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
            
            payloads.append({"category": str(r.get("카테고리", "미분류")).strip(), "item_name": name, "supplier": supplier, "daily_usage": usage, "unit_price": price, "pallet_ea": ea})
            
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
    async with httpx.AsyncClient() as client:
        inv_payload = {"location_id": data.location_id, "category": data.category, "item_name": data.item_name, "quantity": data.quantity, "pallet_count": data.pallet_count, "production_date": data.production_date if data.production_date else None, "remarks": data.remarks}
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

@app.post("/api/adjust")
async def adjust_stock(data: AdjustData):
    async with httpx.AsyncClient() as client:
        await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": data.new_quantity}, headers=HEADERS)
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "보정", "item_name": data.item_name, "quantity": data.new_quantity, "remarks": "관리자 임의 보정"}, headers=HEADERS)
        return {"status": "success"}

@app.patch("/api/history/{log_id}")
async def update_history_payment(log_id: str, data: PaymentUpdate):
    async with httpx.AsyncClient() as client:
        await client.patch(f"{SUPABASE_URL}/rest/v1/history_log?id=eq.{log_id}", json={"payment_status": data.payment_status}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/inbound_batch")
async def inbound_batch(rows: List[dict]):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/products?select=*", headers=HEADERS)
        pm_list = r.json() if r.status_code == 200 else []
        payloads = []
        for r_data in rows:
            name = str(r_data.get("품목명", "")).strip()
            if not name or name == "(빈 칸)": continue
            
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
            if raw_date and raw_date != "None":
                if raw_date.replace('.','').isdigit() and float(raw_date) > 30000:
                    import datetime
                    try: prod_date = (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(raw_date))).strftime('%Y-%m-%d')
                    except: prod_date = None
                else:
                    prod_date = raw_date.replace('/','-').replace('.','-')
                    if " " in prod_date: prod_date = prod_date.split(" ")[0]

            loc_id = str(r_data.get("렉 위치", "")).strip()
            zone = str(r_data.get("구역", "")).strip()
            
            if zone == "실온" and not loc_id.startswith("FL-") and not loc_id.startswith("R-"): loc_id = "R-" + loc_id
            elif zone == "냉장" and not loc_id.startswith("FL-") and not loc_id.startswith("C-"): loc_id = "C-" + loc_id

            payloads.append({
                "location_id": loc_id, 
                "category": str(r_data.get("카테고리", "미분류")).strip(), 
                "item_name": name, 
                "quantity": qty, 
                "pallet_count": round(calculated_pallet, 2), 
                "production_date": prod_date, 
                "remarks": supplier
            })
            
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
