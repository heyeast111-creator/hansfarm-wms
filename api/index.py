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
    location_id: str; category: str; item_name: str; quantity: int; production_date: Optional[str] = None; remarks: Optional[str] = ""
class OutboundData(BaseModel):
    inventory_id: str; location_id: str; item_name: str; quantity: int
class ProductData(BaseModel):
    category: str; item_name: str; daily_usage: int = 0; unit_price: int = 0
class TransferData(BaseModel):
    inventory_id: str; from_location: str; to_location: str; item_name: str; quantity: int
class AdjustData(BaseModel):
    inventory_id: str; location_id: str; item_name: str; new_quantity: int

HTML_CONTENT = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HANSFARM WMS & MES - PC Version</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <style>
        body { background-color: #e2e8f0; }
        .rack-cell { transition: all 0.15s; }
        .cell-empty { background-color: #ffffff; border: 1px dashed #cbd5e1; color: #94a3b8; }
        .cell-full { background-color: #4ade80; border: 1px solid #166534; color: #064e3b; font-weight: bold; }
        .cell-active { background-color: #3b82f6; border: 2px solid #1e3a8a; color: #ffffff; font-weight: bold; transform: scale(1.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 10; relative; }
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
            <div class="my-2 border-b border-slate-200 w-full"></div>
            <button onclick="document.getElementById('excel-upload').click()" class="w-full py-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-black shadow-inner text-sm transition-all hover:bg-emerald-100">가져오기</button>
            <button onclick="exportExcel()" class="w-full py-3 rounded-md bg-orange-50 border border-orange-200 text-orange-700 font-black shadow-inner text-sm transition-all hover:bg-orange-100">내보내기</button>
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
            <div class="flex justify-between items-center mb-8">
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
                            <div class="flex justify-between text-slate-600"><span class="font-bold">총 렉(파레트) 수</span><span class="font-black" id="dash-cold-total">0</span></div>
                            <div class="flex justify-between text-indigo-600"><span class="font-bold">입고된 렉 수</span><span class="font-black" id="dash-cold-occ">0</span></div>
                            <div class="flex justify-between text-emerald-600"><span class="font-bold">비어있는 렉 수</span><span class="font-black" id="dash-cold-empty">0</span></div>
                        </div>
                    </div>
                    <div class="bg-orange-50 p-5 rounded-2xl shadow-sm border border-orange-100 flex flex-col justify-between">
                        <div class="flex justify-between items-center mb-2"><div class="font-black text-orange-800">☀️ 실온 창고 (Room)</div><div class="text-orange-500 font-bold text-sm" id="dash-room-percent">0%</div></div>
                        <div class="space-y-2 text-sm mt-2">
                            <div class="flex justify-between text-slate-600"><span class="font-bold">총 렉(파레트) 수</span><span class="font-black" id="dash-room-total">0</span></div>
                            <div class="flex justify-between text-orange-600"><span class="font-bold">입고된 렉 수</span><span class="font-black" id="dash-room-occ">0</span></div>
                            <div class="flex justify-between text-emerald-600"><span class="font-bold">비어있는 렉 수</span><span class="font-black" id="dash-room-empty">0</span></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-blue-500">
                    <div class="text-slate-500 font-bold text-sm mb-1 flex items-center justify-between"><span>기간 내 총 입고량 (IN)</span><span class="bg-blue-100 text-blue-600 text-[10px] px-2 py-0.5 rounded font-black">파레트 단위</span></div>
                    <div class="text-4xl font-black text-blue-600 mt-2" id="dash-in">0 파레트</div>
                </div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-rose-500">
                    <div class="text-slate-500 font-bold text-sm mb-1 flex items-center justify-between"><span>기간 내 총 출고량 (OUT)</span><span class="bg-rose-100 text-rose-600 text-[10px] px-2 py-0.5 rounded font-black">파레트 단위</span></div>
                    <div class="text-4xl font-black text-rose-600 mt-2" id="dash-out">0 파레트</div>
                </div>
            </div>
            <div id="admin-dashboard-panel"></div>
        </div>

        <div id="view-search" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-8">🔍 산란일 기반 스마트 스캔</h1>
            <div class="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl text-center">
                <div class="flex space-x-4 mb-6">
                    <div class="w-2/3 text-left"><label class="block text-xs font-bold text-slate-500 mb-1">품목명</label><input type="text" id="search-keyword" placeholder="찾으실 품목명" class="w-full text-lg p-3 border-2 border-indigo-200 rounded-xl font-bold text-indigo-800 outline-none"></div>
                    <div class="w-1/3 text-left"><label class="block text-xs font-bold text-slate-500 mb-1">필요 파레트 수</label><input type="number" id="search-count" value="1" min="1" class="w-full text-lg p-3 border-2 border-indigo-200 rounded-xl font-bold text-indigo-800 outline-none"></div>
                </div>
                <button onclick="executeSearch()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg py-4 px-12 rounded-xl shadow-lg transition-all w-full">산란일 빠른 순으로 렉 찾기</button>
            </div>
        </div>

        <div id="view-safety" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex justify-between items-end mb-8 border-b-2 border-slate-200 pb-4">
                <div>
                    <h1 class="text-3xl font-black text-slate-800 flex items-center"><svg class="w-8 h-8 mr-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> 자동 발주/안전재고</h1>
                    <p class="text-slate-500 font-bold mt-2">재고 위험 시 카카오톡 발주 텍스트를 즉시 생성합니다.</p>
                </div>
                <div class="flex items-center space-x-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                    <label class="font-bold text-slate-600">일괄 안전재고 기준:</label>
                    <div class="relative"><input type="number" id="safe-days-target" value="7" min="1" onchange="renderSafetyStock()" class="w-20 border-2 border-indigo-200 rounded-lg p-2 font-black text-indigo-700 text-center outline-none"><span class="absolute right-3 top-2.5 font-bold text-slate-400">일</span></div>
                </div>
            </div>
            <div class="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                            <th class="p-4 font-black">카테고리</th><th class="p-4 font-black">품목명</th><th class="p-4 font-black text-right">현재 총 재고</th><th class="p-4 font-black text-right">일간 소모량</th><th class="p-4 font-black text-center">예상 소진일</th><th class="p-4 font-black text-center">상태 및 발주</th>
                        </tr>
                    </thead>
                    <tbody id="safety-list" class="divide-y divide-slate-100"></tbody>
                </table>
            </div>
        </div>

        <div id="view-products" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex justify-between items-center mb-8 border-b pb-4">
                <h1 class="text-3xl font-black text-slate-800">🗂️ 품목 마스터 DB 관리</h1>
                <div class="flex space-x-2">
                    <button onclick="document.getElementById('product-upload').click()" class="bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 py-2 px-4 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors text-sm">대량 업로드 (Excel)</button>
                    <button onclick="exportProductsExcel()" class="bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 py-2 px-4 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors text-sm">엑셀 양식 다운로드</button>
                    <button onclick="deleteAllProducts()" class="bg-rose-50 text-rose-700 font-bold border border-rose-200 py-2 px-4 rounded-lg shadow-sm hover:bg-rose-100 transition-colors text-sm">⚠️ 품목 일괄 삭제</button>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-8">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit">
                    <h2 class="font-black text-lg text-indigo-700 mb-4 border-b pb-2" id="pm-form-title">신규 품목 추가</h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">카테고리</label><input type="text" id="pm-cat" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">품목명</label><input type="text" id="pm-name" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">일간 소모량</label><input type="number" id="pm-usage" value="0" min="0" class="w-full border border-slate-300 rounded p-2 mb-3 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">단가(원) - 비용계산용</label><input type="number" id="pm-price" value="0" min="0" class="w-full border border-slate-300 rounded p-2 mb-6 font-bold text-sm text-indigo-700">
                    
                    <button id="pm-submit-btn" onclick="submitProduct()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-md transition-colors mb-2">DB에 등록하기</button>
                    <button id="pm-cancel-btn" onclick="cancelEdit()" class="hidden w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3 rounded-xl shadow-sm transition-colors">수정 취소</button>
                </div>
                <div class="col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200">
                    <h2 class="font-black text-lg text-slate-700 mb-4 border-b pb-2">등록된 품목 리스트</h2>
                    <div id="pm-list" class="grid grid-cols-2 gap-3 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2"></div>
                </div>
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
        let editingProductOriginalName = null; // 수정 모드 추적용
        
        // 렉맵 레이아웃 (일반)
        const layoutRoom = [ { id: 'J', cols: 12 }, { aisle: true }, { id: 'I', cols: 10 }, { gap: true }, { id: 'H', cols: 10 }, { aisle: true }, { id: 'G', cols: 10 }, { gap: true }, { id: 'F', cols: 10 }, { aisle: true }, { id: 'E', cols: 12 }, { gap: true }, { id: 'D', cols: 12 }, { aisle: true }, { id: 'C', cols: 12 }, { gap: true }, { id: 'B', cols: 12 }, { aisle: true }, { id: 'A', cols: 12 } ];
        const layoutCold = [ { id: 'F', cols: 10 }, { aisle: true }, { id: 'E', cols: 12 }, { gap: true }, { id: 'D', cols: 12 }, { aisle: true }, { id: 'C', cols: 12 }, { gap: true }, { id: 'B', cols: 12 }, { aisle: true }, { id: 'A', cols: 10 } ];
        
        // 🚨 현장(Floor) 레이아웃 개편: 직관적인 칸 20개씩 배치
        const layoutFloor = [ 
            { id: 'FL-C', title: '❄️ 생산 현장 (원재료 / 냉장)', cols: 20 }, 
            { aisle: true, text: '==================== 생산 조립 라인 ====================' }, 
            { id: 'FL-R', title: '📦 생산 현장 (부자재 / 실온)', cols: 20 } 
        ];

        function adminLogin() {
            if(isAdmin) { isAdmin = false; alert("관리자 모드 해제"); document.getElementById('admin-btn').innerText = "🔒 관리자 로그인"; document.getElementById('admin-btn').className = "w-full py-3 rounded-md bg-slate-800 border border-slate-900 text-slate-300 font-black shadow-inner text-[11px] transition-all hover:bg-slate-700 hover:text-white"; load(); return; }
            const pw = prompt("비밀번호 입력 (1234):"); if(pw === "1234") { isAdmin = true; alert("관리자 권한 활성화"); document.getElementById('admin-btn').innerText = "🔓 관리자 권한 (ON)"; document.getElementById('admin-btn').className = "w-full py-3 rounded-md bg-rose-600 border border-rose-700 text-white font-black shadow-inner text-[11px] transition-all hover:bg-rose-500 animate-pulse"; load(); }
        }

        async function load() {
            try {
                const [occRes, prodRes, histRes] = await Promise.all([ fetch('/api/inventory'), fetch('/api/products'), fetch('/api/history') ]);
                globalOccupancy = await occRes.json(); productMaster = await prodRes.json(); globalHistory = await histRes.json();
                renderMap(); renderProductMaster(); updateDashboard(); renderSafetyStock();
                if(selectedCellId) clickCell(selectedCellId); else clearInfo();
            } catch (e) { console.error("로딩 에러:", e); }
        }

        function showView(viewName) {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.className = "nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all");
            let targetBtn = document.getElementById('nav-' + viewName);
            if(targetBtn) targetBtn.className = "nav-btn w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all" + (viewName==='safety' ? ' text-rose-600 border-rose-200 bg-rose-50' : '');
            ['view-inventory', 'view-dashboard', 'view-search', 'view-products', 'view-safety'].forEach(id => { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); });
            document.getElementById('right-sidebar').classList.add('hidden');
            document.getElementById('view-' + viewName).classList.remove('hidden'); document.getElementById('view-' + viewName).classList.add('flex');
            if(viewName === 'inventory') { document.getElementById('right-sidebar').classList.remove('hidden'); document.getElementById('right-sidebar').classList.add('flex'); renderMap(); }
            else if(viewName === 'products') renderProductMaster(); else if(viewName === 'dashboard') updateDashboard(); else if(viewName === 'safety') renderSafetyStock();
        }

        function generateKakaoText(itemName) {
            const supplier = prompt(`[${itemName}] 발주처(업체명)를 입력하세요:\\n(예: 서울계란)`); if(!supplier) return;
            const moq = prompt(`[${supplier}]에 요청할 수량을 입력하세요:\\n(예: 1000박스)`, "1000개"); if(!moq) return;
            const leadTime = prompt(`납기 요청일을 입력하세요:`, "최대한 빠르게");
            const text = `[발주 요청서]\\n수신: ${supplier}\\n\\n안녕하세요, 한스팜입니다.\\n아래 품목 발주 요청드립니다.\\n\\n- 품목명: ${itemName}\\n- 발주수량: ${moq}\\n- 납기요청: ${leadTime}\\n\\n확인 후 회신 부탁드립니다. 감사합니다.`;
            navigator.clipboard.writeText(text.replace(/\\n/g, '\\n')).then(() => { alert("✅ 카카오톡 발주 멘트가 복사되었습니다! 채팅방에 붙여넣기(Ctrl+V) 하세요."); });
        }

        function renderSafetyStock() {
            const targetDays = parseInt(document.getElementById('safe-days-target').value) || 7;
            let currentTotals = {}; globalOccupancy.forEach(item => { currentTotals[item.item_name] = (currentTotals[item.item_name] || 0) + item.quantity; });
            let html = ''; let monitoredProducts = productMaster.filter(p => p.daily_usage > 0);
            if(monitoredProducts.length === 0) { html = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">일간 소모량이 등록된 품목이 없습니다.</td></tr>`; } 
            else {
                monitoredProducts.forEach(p => {
                    let totalQty = currentTotals[p.item_name] || 0; let safeDaysLeft = totalQty / p.daily_usage; let isDanger = safeDaysLeft < targetDays;
                    let actionBtn = isDanger ? `<button onclick="generateKakaoText('${p.item_name}')" class="mt-2 block w-full bg-yellow-400 hover:bg-yellow-500 text-slate-800 text-[10px] px-2 py-1.5 rounded shadow-sm font-black transition-colors">💬 카톡 발주 복사</button>` : '';
                    let statusHtml = isDanger ? `<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full font-black text-xs animate-pulse">🔴 위험</span>${actionBtn}` : `<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-black text-xs">🟢 여유</span>`;
                    html += `<tr class="hover:bg-slate-50 transition-colors ${isDanger ? 'bg-rose-50/30' : ''}"><td class="p-4 text-slate-500 text-sm font-bold">${p.category}</td><td class="p-4 text-slate-800 font-black">${p.item_name}</td><td class="p-4 text-right font-bold text-lg text-indigo-700">${totalQty.toLocaleString()}</td><td class="p-4 text-right font-bold text-slate-500">${p.daily_usage.toLocaleString()} / 일</td><td class="p-4 text-center"><div class="w-full bg-slate-200 rounded-full h-2.5 mb-1 max-w-[150px] mx-auto overflow-hidden"><div class="h-2.5 rounded-full ${isDanger ? 'bg-rose-500' : 'bg-emerald-500'}" style="width: ${Math.min((safeDaysLeft/targetDays)*100, 100)}%"></div></div><span class="text-xs font-bold ${isDanger ? 'text-rose-600' : 'text-slate-500'}">${safeDaysLeft.toFixed(1)} 일 버팀</span></td><td class="p-4 text-center">${statusHtml}</td></tr>`;
                });
            }
            document.getElementById('safety-list').innerHTML = html;
        }

        function exportExcel() {
            let wsData = [];
            if(globalOccupancy.length === 0) {
                alert("재고가 없어 양식만 다운로드합니다.");
                wsData = [{ "렉 위치": "", "카테고리": "", "품목명": "", "수량": "", "단가(원)": "", "총비용(원)": "", "산란일": "", "입고처(비고)": "" }];
            } else {
                wsData = globalOccupancy.map(item => {
                    let pInfo = productMaster.find(p => p.item_name === item.item_name); let price = pInfo ? pInfo.unit_price : 0;
                    return { "렉 위치": item.location_id, "카테고리": item.category, "품목명": item.item_name, "수량": item.quantity, "단가(원)": price, "총비용(원)": price * item.quantity, "산란일": item.production_date || "", "입고처(비고)": item.remarks || "" };
                });
            }
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "재고 및 자산"); XLSX.writeFile(wb, "한스팜_재고자산현황.xlsx");
        }

        // ==========================================
        // ⚡ 현장(Floor) 탭 렌더링 개편
        // ==========================================
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
            const occMap = {}; globalOccupancy.forEach(item => { occMap[item.location_id] = true; });
            let vHtml = ''; hContainer.innerHTML = '';
            
            // 🚨 현장 탭: 넓고 직관적인 Grid 형태로 생성
            if(currentZone === '현장') {
                document.getElementById('aisle-text').classList.add('hidden'); // 기존 통로 텍스트 숨김
                vHtml += `<div class="w-full min-w-[700px]">`;
                layoutFloor.forEach(col => {
                    if(col.aisle) { 
                        vHtml += `<div class="w-full h-10 bg-yellow-50/50 flex items-center justify-center border-y-2 border-yellow-300 shadow-inner my-6 rounded-lg"><span class="text-yellow-600 font-black tracking-widest text-sm">${col.text}</span></div>`; 
                    } else {
                        let colorClass = col.id === 'FL-C' ? 'text-indigo-800 bg-indigo-50 border-indigo-200' : 'text-orange-800 bg-orange-50 border-orange-200';
                        vHtml += `<div class="mb-4 bg-white p-5 rounded-2xl shadow-md border border-slate-200">
                                    <div class="text-lg font-black ${colorClass} p-3 rounded-lg border mb-4 shadow-sm inline-block">${col.title}</div>
                                    <div class="grid grid-cols-10 gap-3">`;
                        for (let r = 1; r <= col.cols; r++) {
                            let dbId = `${col.id}-${r.toString().padStart(2, '0')}`; let searchId = dbId;
                            let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty';
                            if(selectedCellId === dbId) cellState = 'cell-active';
                            vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}', '${searchId}')" class="h-16 rounded-xl border-2 flex flex-col items-center justify-center text-[11px] font-black cursor-pointer rack-cell ${cellState} shadow-sm hover:scale-105 transition-all">
                                        <span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}번 칸</span>
                                      </div>`;
                        }
                        vHtml += `</div></div>`;
                    }
                });
                vHtml += `</div>`;
                vContainer.innerHTML = vHtml; return;
            }

            document.getElementById('aisle-text').classList.remove('hidden');
            document.getElementById('aisle-text').innerText = "통로 (Aisle)";
            const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold;
            activeLayout.forEach(col => {
                if (col.aisle) { vHtml += `<div class="w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1"><span class="text-yellow-600 font-black tracking-widest text-xs" style="writing-mode: vertical-rl;">통로</span></div>`; }
                else if (col.gap) { vHtml += `<div class="w-4"></div>`; }
                else {
                    vHtml += `<div class="flex flex-col w-14 space-y-1 justify-end"><div class="text-center font-black text-2xl text-slate-800 pb-2">${col.id}</div>`;
                    for (let r = col.cols; r >= 1; r--) {
                        let dbId = `${col.id}-${r.toString().padStart(2, '0')}`; let displayId = `${col.id}${r}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                        let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty';
                        if(selectedCellId === displayId) cellState = 'cell-active';
                        vHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[10px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">${displayId}</div>`;
                    }
                    vHtml += `</div>`;
                }
            });
            vContainer.innerHTML = vHtml;

            let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8;
            for (let c = hCols; c >= 1; c--) {
                let displayId = `${hPrefix}${c}`; let dbId = `${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty';
                if(selectedCellId === displayId) cellState = 'cell-active';
                hHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="w-14 h-10 rounded-[3px] flex items-center justify-center text-[11px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">${displayId}</div>`;
            }
            hHtml += `</div>`; hContainer.innerHTML = hHtml;
        }

        async function clickCell(displayId, searchId) {
            selectedCellId = displayId;
            if(!searchId) { const floor = document.getElementById('floor-select').value; const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${p1}-${p2.padStart(2, '0')}`); searchId = floor === "1" ? baseId : `${baseId}-2F`; }
            renderMap(); 
            const panel = document.getElementById('info-panel'); const floorName = currentZone === '현장' ? '생산현장' : document.getElementById('floor-select').options[document.getElementById('floor-select').selectedIndex].text;
            const items = globalOccupancy.filter(x => x.location_id === searchId);
            
            let panelHtml = `<div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4"><div class="flex justify-between items-start"><div><div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div><div class="text-3xl font-black text-indigo-900">${displayId}</div></div><div class="text-right"><span class="inline-block bg-white text-indigo-700 text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floorName}</span></div></div></div>`;

            if(items.length > 0) {
                panelHtml += `<div class="mb-2 text-xs font-bold text-slate-500">적재 목록 (${items.length}건)</div>`;
                items.forEach(item => {
                    let dateHtml = item.production_date ? `<div class="text-xs text-rose-600 font-bold mt-1">산란일: ${item.production_date}</div>` : '';
                    let pInfo = productMaster.find(p => p.item_name === item.item_name); let cost = pInfo ? (pInfo.unit_price * item.quantity).toLocaleString() : '0';
                    let adjustBtn = isAdmin ? `<button onclick="processAdjust('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="text-[9px] text-slate-400 font-normal underline hover:text-indigo-600 ml-2">수량 보정</button>` : '';
                    panelHtml += `
                        <div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3">
                            <div class="flex justify-between items-start mb-2">
                                <div><span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span>
                                <div class="font-black text-sm text-slate-800 mt-1">${item.item_name}${adjustBtn}</div><div class="text-[10px] text-slate-400">입고처: ${item.remarks||'없음'} (총 ${cost}원)</div></div>
                                <div class="text-right"><div class="text-sm font-bold text-indigo-600">${item.quantity} 박스</div></div>
                            </div>
                            ${dateHtml}
                            <div class="flex space-x-2 mt-3 border-t pt-2">
                                <button onclick="processTransfer('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-1.5 rounded text-[11px] font-bold transition-colors">위치 이동</button>
                                <button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-[11px] font-bold transition-colors">선택 출고</button>
                            </div>
                        </div>`;
                });
            } else { panelHtml += `<div class="text-center text-slate-400 py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-4"><b class="text-emerald-600 inline-block">비어있습니다 (Empty)</b></div>`; }

            const catOptions = [...new Set(productMaster.map(p => p.category))].map(c => `<option value="${c}">${c}</option>`).join('');
            panelHtml += `
                <div class="mt-4 pt-4 border-t border-slate-200">
                    <h3 class="text-sm font-black text-slate-700 mb-3 flex items-center"><svg class="w-4 h-4 mr-1 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> 신규 입고</h3>
                    <div class="space-y-2">
                        <div class="flex space-x-2"><div class="w-1/3"><label class="block text-[10px] font-bold text-slate-400 mb-1">카테고리</label><select id="in-cat" onchange="updateProductDropdown()" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">선택</option>${catOptions}</select></div><div class="w-2/3"><label class="block text-[10px] font-bold text-slate-400 mb-1">품목명</label><select id="in-item" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">선택 대기</option></select></div></div>
                        <div class="flex space-x-2"><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">수량</label><input type="number" id="in-qty" value="1" min="1" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"></div><div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">산란일</label><input type="date" id="in-date" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"></div></div>
                        <div><label class="block text-[10px] font-bold text-rose-500 mb-1">입고처 (비고)</label><input type="text" id="in-remark" placeholder="발주/입고처 입력" class="w-full border border-rose-300 bg-rose-50 rounded p-1.5 text-xs font-bold"></div>
                        <button onclick="processInbound('${searchId}')" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-black shadow-md transition-colors text-sm mt-1">입고 처리</button>
                    </div>
                </div>`;
            
            let locHistory = globalHistory.filter(h => h.location_id === searchId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
            let histHtml = '<div class="mt-6 pt-4 border-t border-slate-200"><h3 class="text-sm font-black text-slate-700 mb-3 flex items-center"><svg class="w-4 h-4 mr-1 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> 최근 내역 (최대 5건)</h3><div class="space-y-2">';
            if(locHistory.length > 0) {
                locHistory.forEach(h => {
                    let actionColor = h.action_type === '입고' ? 'text-emerald-600' : (h.action_type === '출고' ? 'text-rose-600' : 'text-blue-600');
                    let dateStr = new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
                    histHtml += `<div class="bg-white p-2 border border-slate-200 rounded text-xs shadow-sm"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${dateStr}</span><br><span class="font-bold text-slate-700">${h.item_name} <span class="text-slate-400">(${h.quantity})</span></span></div>`;
                });
            } else { histHtml += `<div class="text-xs text-slate-400 text-center py-4">기록이 없습니다.</div>`; }
            histHtml += '</div></div>';
            panelHtml += histHtml;

            panel.innerHTML = panelHtml;
        }

        function clearInfo() { document.getElementById('info-panel').innerHTML = `<div class="text-center text-slate-400 py-10 mt-10">도면에서 렉/구역을 선택해주세요</div>`; }
        function updateProductDropdown() { const cat = document.getElementById('in-cat').value; document.getElementById('in-item').innerHTML = productMaster.filter(p => p.category === cat).map(p => `<option value="${p.item_name}">${p.item_name}</option>`).join(''); }

        // ==========================================
        // 🗂️ 품목 관리 (등록/수정/삭제/일괄삭제)
        // ==========================================
        function renderProductMaster() { 
            document.getElementById('pm-list').innerHTML = productMaster.map(p => { 
                return `<div class="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div><span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded mr-1">${p.category}</span><span class="font-bold text-sm text-slate-800">${p.item_name}</span><div class="text-[10px] text-slate-500 mt-1">소모량: ${p.daily_usage}개 | 단가: ${p.unit_price.toLocaleString()}원</div></div>
                    <div class="flex space-x-1">
                        <button onclick="editProductSetup('${p.category}', '${p.item_name}', ${p.daily_usage}, ${p.unit_price})" class="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                        <button onclick="deleteProduct('${p.item_name}')" class="text-rose-500 hover:bg-rose-100 p-1.5 rounded transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                    </div>
                </div>`; 
            }).join(''); 
        }

        function editProductSetup(cat, name, usage, price) {
            editingProductOriginalName = name;
            document.getElementById('pm-cat').value = cat; document.getElementById('pm-name').value = name; document.getElementById('pm-usage').value = usage; document.getElementById('pm-price').value = price;
            document.getElementById('pm-form-title').innerText = "기존 품목 수정 모드";
            document.getElementById('pm-submit-btn').innerText = "✅ 변경사항 저장"; document.getElementById('pm-submit-btn').classList.replace('bg-indigo-600', 'bg-emerald-600'); document.getElementById('pm-submit-btn').classList.replace('hover:bg-indigo-700', 'hover:bg-emerald-700');
            document.getElementById('pm-cancel-btn').classList.remove('hidden');
        }
        function cancelEdit() {
            editingProductOriginalName = null;
            document.getElementById('pm-cat').value = ''; document.getElementById('pm-name').value = ''; document.getElementById('pm-usage').value = '0'; document.getElementById('pm-price').value = '0';
            document.getElementById('pm-form-title').innerText = "신규 품목 추가";
            document.getElementById('pm-submit-btn').innerText = "DB에 등록하기"; document.getElementById('pm-submit-btn').classList.replace('bg-emerald-600', 'bg-indigo-600'); document.getElementById('pm-submit-btn').classList.replace('hover:bg-emerald-700', 'hover:bg-indigo-700');
            document.getElementById('pm-cancel-btn').classList.add('hidden');
        }

        async function submitProduct() {
            const cat = document.getElementById('pm-cat').value.trim(); const name = document.getElementById('pm-name').value.trim(); const usage = parseInt(document.getElementById('pm-usage').value) || 0; const price = parseInt(document.getElementById('pm-price').value) || 0;
            if(!cat || !name) return alert("필수 입력 누락");
            try { 
                if(editingProductOriginalName) {
                    await fetch(`/api/products/${editingProductOriginalName}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, daily_usage: usage, unit_price: price}) });
                    alert("수정 완료"); cancelEdit();
                } else {
                    await fetch('/api/products', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, daily_usage: usage, unit_price: price}) });
                    alert("등록 완료"); document.getElementById('pm-name').value = '';
                }
                load(); 
            } catch(e) { alert("서버 통신 실패"); }
        }

        async function deleteProduct(name) { if(!confirm(`[${name}] 품목을 개별 삭제하시겠습니까?`)) return; try { await fetch(`/api/products/${name}`, { method: 'DELETE' }); load(); } catch(e) {} }
        
        async function deleteAllProducts() { 
            if(!confirm("⚠️ 정말 모든 품목 마스터를 일괄 삭제하시겠습니까?\\n(재고는 유지되지만 엑셀 업로드용 DB가 완전히 초기화됩니다.)")) return;
            const pw = prompt("안전을 위해 관리자 비밀번호(1234)를 입력하세요.");
            if(pw !== "1234") return alert("비밀번호가 틀렸습니다.");
            try { await fetch('/api/products_all', { method: 'DELETE' }); alert("품목 일괄 삭제 완료!"); load(); } catch(e) { alert("삭제 실패!"); } 
        }

        function exportProductsExcel() { let wsData = productMaster.length === 0 ? [{ "카테고리": "", "품목명": "", "일간소모량": "", "단가(비용)": "" }] : productMaster.map(p => ({ "카테고리": p.category, "품목명": p.item_name, "일간소모량": p.daily_usage, "단가(비용)": p.unit_price })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "품목마스터"); XLSX.writeFile(wb, "품목마스터_양식.xlsx"); }
        function importProductsExcel(e) { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = async function(ev) { const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); if(json.length > 0) { await fetch('/api/products_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); alert("품목 대량 업로드 완료!"); load(); } }; reader.readAsArrayBuffer(file); e.target.value = ''; }

        // ==========================================
        // 기타 통신 기능 유지
        // ==========================================
        function updateDashboard() { const period = document.getElementById('dash-period').value; let startDate = new Date(); if(period === 'daily') startDate.setDate(startDate.getDate() - 1); else if(period === 'weekly') startDate.setDate(startDate.getDate() - 7); else if(period === 'monthly') startDate.setMonth(startDate.getMonth() - 1); let inPallets = 0, outPallets = 0; globalHistory.forEach(log => { if(new Date(log.created_at) >= startDate) { if(log.action_type === '입고') inPallets++; if(log.action_type === '출고') outPallets++; } }); document.getElementById('dash-in').innerText = inPallets + ' 파레트'; document.getElementById('dash-out').innerText = outPallets + ' 파레트'; let totalRoom = 0, occRoom = 0, totalCold = 0, occCold = 0; const occMap = {}; globalOccupancy.forEach(item => occMap[item.location_id] = true); layoutRoom.forEach(col => { if(col.cols) { totalRoom += col.cols * 2; for(let r=1; r<=col.cols; r++) { if(occMap[`${col.id}-${r.toString().padStart(2, '0')}`]) occRoom++; if(occMap[`${col.id}-${r.toString().padStart(2, '0')}-2F`]) occRoom++; } } }); totalRoom += 20; for(let c=1; c<=10; c++) { if(occMap[`K-${c.toString().padStart(2, '0')}`]) occRoom++; if(occMap[`K-${c.toString().padStart(2, '0')}-2F`]) occRoom++; } layoutCold.forEach(col => { if(col.cols) { totalCold += col.cols * 2; for(let r=1; r<=col.cols; r++) { if(occMap[`${col.id}-${r.toString().padStart(2, '0')}`]) occCold++; if(occMap[`${col.id}-${r.toString().padStart(2, '0')}-2F`]) occCold++; } } }); totalCold += 16; for(let c=1; c<=8; c++) { if(occMap[`I-${c.toString().padStart(2, '0')}`]) occCold++; if(occMap[`I-${c.toString().padStart(2, '0')}-2F`]) occCold++; } let totalAll = totalRoom + totalCold; let occAll = occRoom + occCold; let capRate = totalAll > 0 ? Math.round((occAll / totalAll) * 100) : 0; document.getElementById('dash-cap-percent').innerText = capRate + '%'; document.getElementById('dash-cap-text').innerText = `${occAll} / ${totalAll} 파레트`; document.getElementById('dash-donut').style.background = `conic-gradient(#10b981 0% ${capRate}%, #e2e8f0 ${capRate}% 100%)`; document.getElementById('dash-room-total').innerText = totalRoom; document.getElementById('dash-room-occ').innerText = occRoom; document.getElementById('dash-room-empty').innerText = totalRoom - occRoom; document.getElementById('dash-room-percent').innerText = totalRoom > 0 ? Math.round((occRoom/totalRoom)*100) + '%' : '0%'; document.getElementById('dash-cold-total').innerText = totalCold; document.getElementById('dash-cold-occ').innerText = occCold; document.getElementById('dash-cold-empty').innerText = totalCold - occCold; document.getElementById('dash-cold-percent').innerText = totalCold > 0 ? Math.round((occCold/totalCold)*100) + '%' : '0%'; document.getElementById('admin-dashboard-panel').innerHTML = isAdmin ? `<div class="mt-8 p-6 bg-rose-50 border border-rose-200 rounded-2xl"><h3 class="text-rose-800 font-black text-lg mb-4 flex items-center">🚨 시스템 관리자 전용 구역</h3><div class="flex space-x-4"><button onclick="clearData('inventory')" class="bg-white border border-rose-300 text-rose-600 font-bold py-3 px-6 rounded-lg shadow-sm hover:bg-rose-100 transition-colors">📦 창고 재고 전체 삭제</button><button onclick="clearData('history')" class="bg-white border border-rose-300 text-rose-600 font-bold py-3 px-6 rounded-lg shadow-sm hover:bg-rose-100 transition-colors">📝 히스토리 내역 전체 삭제</button></div></div>` : ''; }
        async function clearData(target) { if(!confirm(`정말 삭제하시겠습니까?`)) return; try { await fetch(`/api/clear_data?target=${target}`, { method: 'DELETE' }); alert("초기화 완료"); load(); } catch(e) {} }
        function executeSearch() { const keyword = document.getElementById('search-keyword').value.trim(); const countStr = document.getElementById('search-count').value; const count = parseInt(countStr); if(!keyword || isNaN(count) || count < 1) return alert("입력 확인 요망"); let matches = globalOccupancy.filter(x => x.item_name.includes(keyword) && x.production_date); if(matches.length === 0) return alert("산란일 데이터 없음"); matches.sort((a, b) => new Date(a.production_date) - new Date(b.production_date)); let targets = matches.slice(0, count); document.getElementById('nav-inv').click(); alert(`가장 오래된 산란일 렉 ${targets.length}개 발견`); document.querySelectorAll('.highlight-pulse').forEach(el => el.classList.remove('highlight-pulse')); targets.forEach(item => { let match = item.location_id.match(/([A-Z])-([0-9]+)/) || item.location_id.match(/(FL-[CR]-[0-9]+)/); if(match) { let elId = match[0].startsWith('FL') ? `cell-${match[0]}` : `cell-${match[1]}${parseInt(match[2])}`; let el = document.getElementById(elId); if(el) el.classList.add('highlight-pulse'); } }); }
        
        async function processInbound(locId) { const cat = document.getElementById('in-cat').value; const item = document.getElementById('in-item').value; const qty = document.getElementById('in-qty').value; const date = document.getElementById('in-date').value; const rm = document.getElementById('in-remark').value; if(!cat || !item || !qty) return alert("필수값 입력 요망"); try { await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ location_id: locId, category: cat, item_name: item, quantity: parseInt(qty), production_date: date || null, remarks: rm }) }); alert("입고 완료!"); load(); } catch(e) {} }
        async function processOutbound(invId, itemName, maxQty, locId) { const qtyStr = prompt(`[${itemName}] 소진할 수량을 입력하세요. (최대 ${maxQty}박스)`, maxQty); if(!qtyStr) return; const qty = parseInt(qtyStr); if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량"); try { await fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: qty }) }); alert("출고 완료!"); load(); } catch(e) {} }
        async function processTransfer(invId, itemName, maxQty, fromLoc) { const qtyStr = prompt(`[${itemName}] 이동시킬 수량을 입력하세요. (최대 ${maxQty}박스)`, maxQty); if(!qtyStr) return; const qty = parseInt(qtyStr); if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량"); const toLoc = prompt(`[${itemName}] ${qty}박스 이동할 목적지를 입력하세요\\n(창고 예시: B-02-1F, 현장 예시: FL-C-01)`, "FL-C-01"); if(!toLoc) return; try { await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc.toUpperCase(), item_name: itemName, quantity: qty }) }); alert("이동 완료!"); load(); } catch(e) {} }
        async function processAdjust(invId, itemName, currentQty, locId) { const qtyStr = prompt(`실제 전산 수량을 보정합니다.\\n(현재: ${currentQty}박스)`); if(!qtyStr) return; const newQty = parseInt(qtyStr); if(isNaN(newQty) || newQty < 0) return; try { await fetch('/api/adjust', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, new_quantity: newQty }) }); alert("보정 완료!"); load(); } catch(e) {} }
        function highlightFIFO() { const eggs = globalOccupancy.filter(x => x.production_date); if(eggs.length === 0) return alert("산란일 데이터 없음"); eggs.sort((a, b) => new Date(a.production_date) - new Date(b.production_date)); const oldestDate = eggs[0].production_date; alert(`가장 오래된 산란일: ${oldestDate}\\n깜빡입니다!`); eggs.filter(x => x.production_date === oldestDate).map(x => x.location_id).forEach(loc => { let match = loc.match(/([A-Z])-([0-9]+)/) || loc.match(/(FL-[CR]-[0-9]+)/); if(match) { let elId = match[0].startsWith('FL') ? `cell-${match[0]}` : `cell-${match[1]}${parseInt(match[2])}`; let el = document.getElementById(elId); if(el) el.classList.add('highlight-pulse'); } }); }

        load(); showView('dashboard');
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
        res = await client.post(f"{SUPABASE_URL}/rest/v1/products", json={"category": data.category, "item_name": data.item_name, "daily_usage": data.daily_usage, "unit_price": data.unit_price}, headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error", "message": res.text}

@app.patch("/api/products/{old_name}")
async def update_product(old_name: str, data: ProductData):
    async with httpx.AsyncClient() as client:
        res = await client.patch(f"{SUPABASE_URL}/rest/v1/products?item_name=eq.{old_name}", json={"category": data.category, "item_name": data.item_name, "daily_usage": data.daily_usage, "unit_price": data.unit_price}, headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error", "message": res.text}

@app.post("/api/products_batch")
async def products_batch(rows: List[dict]):
    async with httpx.AsyncClient() as client:
        payloads = [{"category": r.get("카테고리", "미분류"), "item_name": r.get("품목명", ""), "daily_usage": int(r.get("일간소모량", 0)), "unit_price": int(r.get("단가(비용)", 0))} for r in rows if r.get("품목명")]
        if payloads:
            headers = HEADERS.copy()
            headers["Prefer"] = "resolution=ignore-duplicates"
            await client.post(f"{SUPABASE_URL}/rest/v1/products", json=payloads, headers=headers)
        return {"status": "success"}

@app.delete("/api/products/{item_name}")
async def delete_product(item_name: str):
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/products?item_name=eq.{item_name}", headers=HEADERS)
        return {"status": "success"}

# 🚨 신규 추가: 품목 마스터 일괄 삭제
@app.delete("/api/products_all")
async def delete_all_products():
    async with httpx.AsyncClient() as client:
        # id가 null이 아닌 모든 행을 삭제 (전체 삭제)
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
        inv_payload = {"location_id": data.location_id, "category": data.category, "item_name": data.item_name, "quantity": data.quantity, "production_date": data.production_date if data.production_date else None, "remarks": data.remarks}
        await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=inv_payload, headers=HEADERS)
        log_payload = inv_payload.copy(); log_payload["action_type"] = "입고"
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=log_payload, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/outbound")
async def outbound_stock(data: OutboundData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json()
        current_qty = inv[0]['quantity']
        if data.quantity >= current_qty: await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        else: await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity}, headers=HEADERS)
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "출고", "item_name": data.item_name, "quantity": data.quantity}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/transfer")
async def transfer_stock(data: TransferData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json()
        item_data = inv[0]
        current_qty = item_data['quantity']
        if data.quantity >= current_qty: await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"location_id": data.to_location}, headers=HEADERS)
        else:
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity}, headers=HEADERS)
            new_row = item_data.copy()
            del new_row['id']; del new_row['created_at']
            new_row['location_id'] = data.to_location; new_row['quantity'] = data.quantity
            await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=new_row, headers=HEADERS)
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.to_location, "action_type": "이동", "item_name": data.item_name, "quantity": data.quantity, "remarks": f"From {data.from_location}"}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/adjust")
async def adjust_stock(data: AdjustData):
    async with httpx.AsyncClient() as client:
        await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": data.new_quantity}, headers=HEADERS)
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "보정", "item_name": data.item_name, "quantity": data.new_quantity, "remarks": "관리자 임의 보정"}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/inbound_batch")
async def inbound_batch(rows: List[dict]):
    async with httpx.AsyncClient() as client:
        payloads = [{"location_id": r.get("렉 위치", ""), "category": r.get("카테고리", "미분류"), "item_name": r.get("품목명", ""), "quantity": int(r.get("수량", 1)), "production_date": r.get("산란일", None) if r.get("산란일") else None, "remarks": r.get("입고처(비고)", "")} for r in rows]
        if payloads: await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=payloads, headers=HEADERS)
        return {"status": "success"}

@app.delete("/api/clear_data")
async def clear_data(target: str):
    async with httpx.AsyncClient() as client:
        if target == 'inventory': await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?location_id=not.is.null", headers=HEADERS)
        elif target == 'history': await client.delete(f"{SUPABASE_URL}/rest/v1/history_log?location_id=not.is.null", headers=HEADERS)
    return {"status": "success"}
