import os
import httpx
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

# 🔑 조님의 실시간 데이터베이스 정보
SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co"
SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# --- 데이터 모델 세팅 (보정 기능 추가) ---
class InboundData(BaseModel):
    location_id: str
    category: str
    item_name: str
    quantity: int
    production_date: Optional[str] = None
    remarks: Optional[str] = ""

class OutboundData(BaseModel):
    inventory_id: str
    location_id: str
    item_name: str
    quantity: int

class ProductData(BaseModel):
    category: str
    item_name: str

class TransferData(BaseModel):
    inventory_id: str
    from_location: str
    to_location: str
    item_name: str
    quantity: int

class AdjustData(BaseModel):
    inventory_id: str
    location_id: str
    item_name: str
    new_quantity: int

# --- HTML/JS 프론트엔드 ---
HTML_CONTENT = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HANSFARM WMS - PC Version</title>
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
    </style>
</head>
<body class="font-sans h-screen flex overflow-hidden text-slate-800 selection:bg-indigo-200">

    <input type="file" id="excel-upload" accept=".xlsx, .xls, .csv" class="hidden" onchange="importExcel(event)">

    <aside class="w-36 bg-white border-r border-slate-300 flex flex-col items-center py-6 shadow-lg z-20 shrink-0">
        <div class="mb-8 w-full px-4 flex justify-center"><img src="/logo.jpg" alt="HANS FARM" class="max-w-full h-auto object-contain drop-shadow-sm"></div>
        <div class="flex flex-col space-y-2 w-full px-3">
            <button onclick="showView('dashboard')" class="nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">대시보드</button>
            <button onclick="showView('inventory')" id="nav-inv" class="nav-btn w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all">재고조회</button>
            <button onclick="showView('search')" class="nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">검색</button>
            <button onclick="showView('products')" class="nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all">품목관리</button>
            <div class="my-2 border-b border-slate-200 w-full"></div>
            <button onclick="document.getElementById('excel-upload').click()" class="w-full py-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-black shadow-inner text-sm transition-all hover:bg-emerald-100">가져오기(IN)</button>
            <button onclick="exportExcel()" class="w-full py-3 rounded-md bg-orange-50 border border-orange-200 text-orange-700 font-black shadow-inner text-sm transition-all hover:bg-orange-100">내보내기(OUT)</button>
        </div>
    </aside>

    <main class="flex-1 bg-slate-200 relative overflow-hidden flex flex-col">
        
        <div id="view-inventory" class="flex flex-col h-full w-full absolute inset-0 transition-opacity duration-300">
            <header class="h-16 bg-white border-b border-slate-300 flex items-end justify-between px-6 pt-4 shrink-0 shadow-sm z-10">
                <div class="flex space-x-1">
                    <button id="tab-room" onclick="switchZone('실온')" class="px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner">실온 (Room)</button>
                    <button id="tab-cold" onclick="switchZone('냉장')" class="px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200">냉장 (Cold)</button>
                </div>
                <div class="flex items-center space-x-4 pb-2">
                    <div id="fifo-btn-container" class="hidden mr-4">
                        <button onclick="highlightFIFO()" class="px-4 py-1.5 bg-rose-100 border border-rose-300 text-rose-700 font-black rounded-md hover:bg-rose-200 text-sm flex items-center shadow-sm">
                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            선입선출 추천
                        </button>
                    </div>
                    <label class="font-bold text-slate-600 text-sm">층 선택</label>
                    <select id="floor-select" onchange="renderMap()" class="bg-white border-2 border-slate-300 text-slate-800 font-bold text-sm rounded-md px-4 py-1.5 shadow-sm"><option value="1">1층 (1F)</option><option value="2">2층 (2F)</option></select>
                    <button onclick="load()" class="ml-4 p-1.5 bg-white border border-slate-300 rounded hover:bg-slate-100"><svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                </div>
            </header>
            <div class="flex-1 overflow-auto p-6 relative">
                <div class="min-w-max min-h-max bg-white p-10 rounded-xl shadow-xl border border-slate-300 mx-auto w-fit transition-all" id="map-container">
                    <div id="vertical-racks" class="flex items-end"></div>
                    <div class="h-14 w-full flex items-center justify-center text-slate-400 font-black tracking-[0.5em] bg-yellow-50/50 border-y-2 border-yellow-300 my-4 shadow-inner text-sm">통로 (Aisle)</div>
                    <div class="flex justify-end pr-[168px]" id="horizontal-rack"></div>
                </div>
            </div>
        </div>

        <div id="view-dashboard" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <div class="flex justify-between items-center mb-8">
                <h1 class="text-3xl font-black text-slate-800">📊 한스팜 물류 대시보드</h1>
                <select id="dash-period" onchange="updateDashboard()" class="border-2 border-indigo-200 rounded-lg p-2 font-bold text-indigo-700 bg-white outline-none">
                    <option value="daily">일간 (Daily)</option>
                    <option value="weekly">주간 (Weekly)</option>
                    <option value="monthly">월간 (Monthly)</option>
                </select>
            </div>
            <div class="grid grid-cols-3 gap-6">
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-emerald-500"><div class="text-slate-500 font-bold text-sm mb-1">전체 창고 적재율</div><div class="text-4xl font-black text-emerald-600" id="dash-cap">0%</div></div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-blue-500"><div class="text-slate-500 font-bold text-sm mb-1">기간 내 입고량 (IN)</div><div class="text-4xl font-black text-blue-600" id="dash-in">0 박스</div></div>
                <div class="bg-white p-6 rounded-2xl shadow-md border-l-4 border-rose-500"><div class="text-slate-500 font-bold text-sm mb-1">기간 내 출고량 (OUT)</div><div class="text-4xl font-black text-rose-600" id="dash-out">0 박스</div></div>
            </div>
        </div>

        <div id="view-search" class="hidden flex-col items-center justify-center h-full w-full absolute inset-0 p-8 z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-8">🔍 산란일 기반 스마트 스캔</h1>
            <div class="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl text-center">
                <div class="flex space-x-4 mb-6">
                    <div class="w-2/3 text-left">
                        <label class="block text-xs font-bold text-slate-500 mb-1">품목명 (예: 특란 30구)</label>
                        <input type="text" id="search-keyword" placeholder="찾으실 품목명을 정확히 입력하세요" class="w-full text-lg p-3 border-2 border-indigo-200 rounded-xl font-bold text-indigo-800 outline-none focus:border-indigo-500 transition-colors">
                    </div>
                    <div class="w-1/3 text-left">
                        <label class="block text-xs font-bold text-slate-500 mb-1">필요 파레트 수 (칸)</label>
                        <input type="number" id="search-count" value="1" min="1" class="w-full text-lg p-3 border-2 border-indigo-200 rounded-xl font-bold text-indigo-800 outline-none focus:border-indigo-500 transition-colors">
                    </div>
                </div>
                <button onclick="executeSearch()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg py-4 px-12 rounded-xl shadow-lg transition-all w-full">산란일 빠른 순으로 렉 찾기</button>
            </div>
        </div>

        <div id="view-products" class="hidden flex-col h-full w-full absolute inset-0 p-8 overflow-auto z-10 bg-slate-100">
            <h1 class="text-3xl font-black text-slate-800 mb-8">🗂️ 품목 마스터 DB 관리</h1>
            <div class="grid grid-cols-3 gap-8">
                <div class="col-span-1 bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-fit">
                    <h2 class="font-black text-lg text-indigo-700 mb-4 border-b pb-2">신규 품목 추가</h2>
                    <label class="block text-xs font-bold text-slate-500 mb-1">카테고리</label><input type="text" id="pm-cat" class="w-full border border-slate-300 rounded p-3 mb-4 font-bold text-sm">
                    <label class="block text-xs font-bold text-slate-500 mb-1">품목명</label><input type="text" id="pm-name" class="w-full border border-slate-300 rounded p-3 mb-6 font-bold text-sm">
                    <button onclick="addProduct()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-md transition-colors">DB에 등록하기</button>
                </div>
                <div class="col-span-2 bg-white p-6 rounded-2xl shadow-md border border-slate-200">
                    <h2 class="font-black text-lg text-slate-700 mb-4 border-b pb-2">등록된 품목 리스트</h2>
                    <div id="pm-list" class="grid grid-cols-2 gap-3 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2"></div>
                </div>
            </div>
        </div>
    </main>

    <aside id="right-sidebar" class="w-80 bg-white border-l border-slate-300 flex flex-col shadow-lg z-20 shrink-0 transition-all">
        <div class="p-6 border-b border-slate-200 bg-slate-50">
            <h2 class="text-lg font-black text-slate-800 flex items-center">
                <svg class="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                렉 정보
            </h2>
        </div>
        <div class="p-6 flex-1 overflow-y-auto" id="info-panel">
            <div class="text-center text-slate-400 py-10 mt-10">도면에서 렉을 선택해주세요</div>
        </div>
        <div class="p-6 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 space-y-2 shrink-0">
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-empty mr-2"></span> = 빈 공간 (Empty)</div>
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-full mr-2"></span> = 적재됨 (Full)</div>
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-active mr-2"></span> = 선택됨 (Active)</div>
        </div>
    </aside>

    <script>
        let globalOccupancy = []; let productMaster = []; let globalHistory = []; let currentZone = '실온'; let selectedCellId = null;
        const layoutRoom = [ { id: 'J', cols: 12 }, { aisle: true }, { id: 'I', cols: 10 }, { gap: true }, { id: 'H', cols: 10 }, { aisle: true }, { id: 'G', cols: 10 }, { gap: true }, { id: 'F', cols: 10 }, { aisle: true }, { id: 'E', cols: 12 }, { gap: true }, { id: 'D', cols: 12 }, { aisle: true }, { id: 'C', cols: 12 }, { gap: true }, { id: 'B', cols: 12 }, { aisle: true }, { id: 'A', cols: 12 } ];
        const layoutCold = [ { id: 'F', cols: 10 }, { aisle: true }, { id: 'E', cols: 12 }, { gap: true }, { id: 'D', cols: 12 }, { aisle: true }, { id: 'C', cols: 12 }, { gap: true }, { id: 'B', cols: 12 }, { aisle: true }, { id: 'A', cols: 10 } ];

        async function load() {
            try {
                const [occRes, prodRes, histRes] = await Promise.all([ fetch('/api/inventory'), fetch('/api/products'), fetch('/api/history') ]);
                globalOccupancy = await occRes.json(); productMaster = await prodRes.json(); globalHistory = await histRes.json();
                renderMap(); renderProductMaster(); updateDashboard();
                if(selectedCellId) clickCell(selectedCellId); else clearInfo();
            } catch (e) { console.error("데이터 로딩 에러:", e); }
        }

        function showView(viewName) {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.className = "nav-btn w-full py-3 rounded-md border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm transition-all");
            event.currentTarget.className = "nav-btn w-full py-3 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black shadow-inner text-sm transition-all";
            ['view-inventory', 'view-dashboard', 'view-search', 'view-products'].forEach(id => { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); });
            document.getElementById('right-sidebar').classList.add('hidden');
            document.getElementById('view-' + viewName).classList.remove('hidden'); document.getElementById('view-' + viewName).classList.add('flex');
            if(viewName === 'inventory') { document.getElementById('right-sidebar').classList.remove('hidden'); renderMap(); }
            else if(viewName === 'products') { renderProductMaster(); }
            else if(viewName === 'dashboard') { updateDashboard(); }
        }

        function renderProductMaster() {
            document.getElementById('pm-list').innerHTML = productMaster.map(p => `<div class="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200"><div><span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded mr-1">${p.category}</span><span class="font-bold text-sm text-slate-800">${p.item_name}</span></div><button onclick="deleteProduct('${p.item_name}')" class="text-rose-500 hover:bg-rose-100 p-1.5 rounded transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div>`).join('');
        }

        async function addProduct() {
            const cat = document.getElementById('pm-cat').value.trim(); const name = document.getElementById('pm-name').value.trim();
            if(!cat || !name) return alert("카테고리와 품목명을 입력하세요.");
            try { const res = await fetch('/api/products', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name}) }); const data = await res.json();
                if(data.status === 'success') { alert("등록 성공!"); document.getElementById('pm-cat').value = ''; document.getElementById('pm-name').value = ''; load(); } else alert("오류: " + data.message);
            } catch(e) { alert("서버 통신 실패"); }
        }

        async function deleteProduct(name) {
            if(!confirm(`[${name}] 품목을 완전히 삭제하시겠습니까?`)) return;
            try { await fetch(`/api/products/${name}`, { method: 'DELETE' }); load(); } catch(e) { alert("삭제 실패"); }
        }

        function updateDashboard() {
            const period = document.getElementById('dash-period').value;
            let startDate = new Date();
            if(period === 'daily') startDate.setDate(startDate.getDate() - 1);
            else if(period === 'weekly') startDate.setDate(startDate.getDate() - 7);
            else if(period === 'monthly') startDate.setMonth(startDate.getMonth() - 1);
            let inQty = 0, outQty = 0;
            globalHistory.forEach(log => { if(new Date(log.created_at) >= startDate) { if(log.action_type === '입고') inQty += log.quantity; if(log.action_type === '출고') outQty += log.quantity; } });
            document.getElementById('dash-in').innerText = inQty + ' 박스'; document.getElementById('dash-out').innerText = outQty + ' 박스';
            document.getElementById('dash-cap').innerText = Math.round((globalOccupancy.length / 396) * 100) + '%';
        }

        // 🔍 산란일 기반 스마트 스캔 기능
        function executeSearch() {
            const keyword = document.getElementById('search-keyword').value.trim();
            const countStr = document.getElementById('search-count').value;
            const count = parseInt(countStr);

            if(!keyword || isNaN(count) || count < 1) return alert("품목명과 필요 파레트 수를 정확히 입력하세요.");
            
            // 산란일 데이터가 있는 해당 품목만 필터링
            let matches = globalOccupancy.filter(x => x.item_name.includes(keyword) && x.production_date);
            if(matches.length === 0) return alert("해당 품목의 산란일 데이터가 창고에 없습니다.");

            // 산란일 오름차순(가장 오래된 날짜가 위로) 정렬
            matches.sort((a, b) => new Date(a.production_date) - new Date(b.production_date));
            
            // 필요한 파레트 수만큼만 자르기
            let targets = matches.slice(0, count);

            document.getElementById('nav-inv').click();
            alert(`가장 오래된 산란일을 가진 렉 ${targets.length}개를 찾았습니다!\\n(맵에서 붉은색 깜빡임을 확인하세요)`);
            document.querySelectorAll('.highlight-pulse').forEach(el => el.classList.remove('highlight-pulse'));

            targets.forEach(item => {
                let match = item.location_id.match(/([A-Z])-([0-9]+)/);
                if(match) { let el = document.getElementById(`cell-${match[1]}${parseInt(match[2])}`); if(el) el.classList.add('highlight-pulse'); }
            });
        }

        function switchZone(zone) {
            currentZone = zone; selectedCellId = null; clearInfo();
            const fifoBtn = document.getElementById('fifo-btn-container');
            if(zone === '냉장') { fifoBtn.classList.remove('hidden'); document.getElementById('tab-cold').className = "px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner"; document.getElementById('tab-room').className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200"; }
            else { fifoBtn.classList.add('hidden'); document.getElementById('tab-room').className = "px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner"; document.getElementById('tab-cold').className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200"; }
            renderMap();
        }

        function renderMap() {
            const floor = document.getElementById('floor-select').value;
            const vContainer = document.getElementById('vertical-racks');
            const hContainer = document.getElementById('horizontal-rack');
            const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold;
            let vHtml = '';
            
            activeLayout.forEach(col => {
                if (col.aisle) { vHtml += `<div class="w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1"><span class="text-yellow-600 font-black tracking-widest text-xs" style="writing-mode: vertical-rl;">통로</span></div>`; }
                else if (col.gap) { vHtml += `<div class="w-4"></div>`; }
                else {
                    vHtml += `<div class="flex flex-col w-14 space-y-1 justify-end"><div class="text-center font-black text-2xl text-slate-800 pb-2">${col.id}</div>`;
                    for (let r = col.cols; r >= 1; r--) {
                        let dbId = `${col.id}-${r.toString().padStart(2, '0')}`;
                        let displayId = `${col.id}${r}`;
                        let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                        let items = globalOccupancy.filter(x => x.location_id === searchId);
                        let cellState = items.length > 0 ? 'cell-full' : 'cell-empty';
                        if(selectedCellId === displayId) cellState = 'cell-active';
                        vHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[10px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">${displayId}</div>`;
                    }
                    vHtml += `</div>`;
                }
            });
            vContainer.innerHTML = vHtml;

            let hHtml = `<div class="flex space-x-1">`;
            let hPrefix = currentZone === '실온' ? 'K' : 'I';
            let hCols = currentZone === '실온' ? 10 : 8;

            for (let c = hCols; c >= 1; c--) {
                let displayId = `${hPrefix}${c}`;
                let dbId = `${hPrefix}-${c.toString().padStart(2, '0')}`;
                let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                let items = globalOccupancy.filter(x => x.location_id === searchId);
                let cellState = items.length > 0 ? 'cell-full' : 'cell-empty';
                if(selectedCellId === displayId) cellState = 'cell-active';
                hHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="w-14 h-10 rounded-[3px] flex items-center justify-center text-[11px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">${displayId}</div>`;
            }
            hHtml += `</div>`;
            hContainer.innerHTML = hHtml;
        }

        async function clickCell(displayId, searchId) {
            selectedCellId = displayId;
            if(!searchId) {
                const floor = document.getElementById('floor-select').value;
                const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${p1}-${p2.padStart(2, '0')}`);
                searchId = floor === "1" ? baseId : `${baseId}-2F`;
            }
            renderMap(); 
            const panel = document.getElementById('info-panel');
            const floorName = document.getElementById('floor-select').options[document.getElementById('floor-select').selectedIndex].text;
            const items = globalOccupancy.filter(x => x.location_id === searchId);
            
            let panelHtml = `<div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4"><div class="flex justify-between items-start"><div><div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div><div class="text-3xl font-black text-indigo-900">${displayId}</div></div><div class="text-right"><span class="inline-block bg-white text-indigo-700 text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floorName}</span></div></div></div>`;

            if(items.length > 0) {
                panelHtml += `<div class="mb-2 text-xs font-bold text-slate-500">적재 목록 (${items.length}건)</div>`;
                items.forEach(item => {
                    let dateHtml = item.production_date ? `<div class="text-xs text-rose-600 font-bold mt-1">산란일: ${item.production_date}</div>` : '';
                    panelHtml += `
                        <div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3">
                            <div class="flex justify-between items-start mb-2">
                                <div><span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span>
                                <div class="font-black text-sm text-slate-800 mt-1">${item.item_name} <button onclick="processAdjust('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="text-[9px] text-slate-400 font-normal underline hover:text-indigo-600 ml-1">보정</button></div></div>
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
                        <div class="flex space-x-2">
                            <div class="w-1/3"><label class="block text-[10px] font-bold text-slate-400 mb-1">카테고리</label><select id="in-cat" onchange="updateProductDropdown()" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">선택</option>${catOptions}</select></div>
                            <div class="w-2/3"><label class="block text-[10px] font-bold text-slate-400 mb-1">품목명</label><select id="in-item" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"><option value="">카테고리 선택</option></select></div>
                        </div>
                        <div class="flex space-x-2">
                            <div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">수량</label><input type="number" id="in-qty" value="1" min="1" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"></div>
                            <div class="w-1/2"><label class="block text-[10px] font-bold text-slate-400 mb-1">산란일</label><input type="date" id="in-date" class="w-full border border-slate-300 rounded p-1.5 text-xs font-bold"></div>
                        </div>
                        <button onclick="processInbound('${searchId}')" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-black shadow-md transition-colors text-sm mt-1">입고 처리</button>
                    </div>
                </div>`;
            
            // 📝 히스토리 패널 부활!
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

        function updateProductDropdown() {
            const cat = document.getElementById('in-cat').value;
            const filtered = productMaster.filter(p => p.category === cat);
            document.getElementById('in-item').innerHTML = filtered.map(p => `<option value="${p.item_name}">${p.item_name}</option>`).join('');
        }

        async function processInbound(locId) {
            const cat = document.getElementById('in-cat').value; const item = document.getElementById('in-item').value; const qty = document.getElementById('in-qty').value; const date = document.getElementById('in-date').value;
            if(!cat || !item || !qty) return alert("필수값을 입력하세요.");
            try { const res = await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ location_id: locId, category: cat, item_name: item, quantity: parseInt(qty), production_date: date || null }) }); const data = await res.json();
                if(data.status === 'success') { alert("입고 완료!"); load(); } else alert("오류: " + data.message);
            } catch(e) { alert("서버 통신 에러!"); }
        }

        // 📦 부분 출고 기능 추가
        async function processOutbound(invId, itemName, maxQty, locId) {
            const qtyStr = prompt(`[${itemName}] 출고할 수량을 입력하세요. (최대 ${maxQty}박스)`, maxQty);
            if(!qtyStr) return; const qty = parseInt(qtyStr);
            if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량입니다.");
            try { const res = await fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: qty }) }); const data = await res.json();
                if(data.status === 'success') { alert("출고 완료!"); load(); } else { alert("출고 에러: " + data.message); }
            } catch(e) { alert("통신 에러!"); }
        }

        // 📦 부분 이동 기능 추가
        async function processTransfer(invId, itemName, maxQty, fromLoc) {
            const qtyStr = prompt(`[${itemName}] 이동시킬 수량을 입력하세요. (최대 ${maxQty}박스)`, maxQty);
            if(!qtyStr) return; const qty = parseInt(qtyStr);
            if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량입니다.");

            const toLoc = prompt(`[${itemName}] ${qty}박스를 이동할 목적지 렉을 입력하세요\\n(입력 예시: B-02-1F)`);
            if(!toLoc) return;
            try { const res = await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc.toUpperCase(), item_name: itemName, quantity: qty }) }); const data = await res.json();
                if(data.status === 'success') { alert("이동 완료!"); load(); } else { alert("이동 에러: " + data.message); }
            } catch(e) { alert("통신 에러!"); }
        }

        // 🛠️ 관리자 수량 보정 기능 추가
        async function processAdjust(invId, itemName, currentQty, locId) {
            const qtyStr = prompt(`[${itemName}] 실제 창고에 있는 정확한 수량을 입력하세요.\\n(현재 전산 수량: ${currentQty}박스)`);
            if(!qtyStr) return; const newQty = parseInt(qtyStr);
            if(isNaN(newQty) || newQty < 0) return alert("잘못된 수량입니다.");
            try { const res = await fetch('/api/adjust', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, new_quantity: newQty }) }); const data = await res.json();
                if(data.status === 'success') { alert("수량 보정 완료!"); load(); } else alert("보정 에러!");
            } catch(e) { alert("통신 에러!"); }
        }

        function highlightFIFO() {
            const eggs = globalOccupancy.filter(x => x.production_date);
            if(eggs.length === 0) return alert("적재된 산란일 데이터가 없습니다.");
            eggs.sort((a, b) => new Date(a.production_date) - new Date(b.production_date));
            const oldestDate = eggs[0].production_date;
            alert(`가장 오래된 산란일: ${oldestDate}\\n해당 렉을 빨간색으로 깜빡입니다!`);
            eggs.filter(x => x.production_date === oldestDate).map(x => x.location_id).forEach(loc => {
                let match = loc.match(/([A-Z])-([0-9]+)/);
                if(match) { let el = document.getElementById(`cell-${match[1]}${parseInt(match[2])}`); if(el) el.classList.add('highlight-pulse'); }
            });
        }
        
        function exportExcel() {
            if(globalOccupancy.length === 0) return alert("데이터가 없습니다.");
            const wsData = globalOccupancy.map(item => ({ "렉 위치": item.location_id, "카테고리": item.category, "품목명": item.item_name, "수량": item.quantity, "산란일": item.production_date || "" }));
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "재고"); XLSX.writeFile(wb, "재고현황.xlsx");
        }
        function importExcel(e) {
            const file = e.target.files[0]; if(!file) return;
            const reader = new FileReader();
            reader.onload = async function(ev) {
                const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'});
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                if(json.length > 0) { await fetch('/api/inbound_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); alert("업로드 완료!"); load(); }
            };
            reader.readAsArrayBuffer(file);
        }

        load();
    </script>
</body>
</html>
"""

@app.get("/")
async def serve_ui():
    return HTMLResponse(content=HTML_CONTENT)

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
        res = await client.post(f"{SUPABASE_URL}/rest/v1/products", json={"category": data.category, "item_name": data.item_name}, headers=HEADERS)
        if res.status_code in [200, 201, 204]: return {"status": "success"}
        return {"status": "error", "message": res.text}

@app.delete("/api/products/{item_name}")
async def delete_product(item_name: str):
    async with httpx.AsyncClient() as client:
        await client.delete(f"{SUPABASE_URL}/rest/v1/products?item_name=eq.{item_name}", headers=HEADERS)
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
        res1 = await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=inv_payload, headers=HEADERS)
        if res1.status_code not in [200, 201, 204]: return {"status": "error", "message": f"재고 DB 에러: {res1.text}"}

        log_payload = {"location_id": data.location_id, "action_type": "입고", "item_name": data.item_name, "quantity": data.quantity, "production_date": data.production_date if data.production_date else None, "remarks": data.remarks}
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=log_payload, headers=HEADERS)
        return {"status": "success"}

# 📦 부분 출고 파이썬 로직
@app.post("/api/outbound")
async def outbound_stock(data: OutboundData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json()
        if not inv: return {"status": "error", "message": "재고를 찾을 수 없습니다."}
        
        current_qty = inv[0]['quantity']
        if data.quantity >= current_qty: # 전량 출고
            await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        else: # 부분 출고 (수량 차감)
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity}, headers=HEADERS)

        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "출고", "item_name": data.item_name, "quantity": data.quantity}, headers=HEADERS)
        return {"status": "success"}

# 📦 부분 이동 파이썬 로직
@app.post("/api/transfer")
async def transfer_stock(data: TransferData):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        inv = r.json()
        if not inv: return {"status": "error", "message": "재고를 찾을 수 없습니다."}
        
        item_data = inv[0]
        current_qty = item_data['quantity']

        if data.quantity >= current_qty: # 전량 이동
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"location_id": data.to_location}, headers=HEADERS)
        else: # 부분 이동 (기존 렉 수량 차감 후 새 렉에 생성)
            await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": current_qty - data.quantity}, headers=HEADERS)
            new_row = item_data.copy()
            del new_row['id']; del new_row['created_at']
            new_row['location_id'] = data.to_location
            new_row['quantity'] = data.quantity
            await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=new_row, headers=HEADERS)

        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.to_location, "action_type": "이동", "item_name": data.item_name, "quantity": data.quantity, "remarks": f"From {data.from_location}"}, headers=HEADERS)
        return {"status": "success"}

# 🛠️ 수량 보정 파이썬 로직
@app.post("/api/adjust")
async def adjust_stock(data: AdjustData):
    async with httpx.AsyncClient() as client:
        await client.patch(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", json={"quantity": data.new_quantity}, headers=HEADERS)
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json={"location_id": data.location_id, "action_type": "보정", "item_name": data.item_name, "quantity": data.new_quantity, "remarks": "관리자 임의 보정"}, headers=HEADERS)
        return {"status": "success"}

@app.post("/api/inbound_batch")
async def inbound_batch(rows: List[dict]):
    async with httpx.AsyncClient() as client:
        payloads = [{"location_id": r.get("렉 위치", ""), "category": r.get("카테고리", "미분류"), "item_name": r.get("품목명", ""), "quantity": int(r.get("수량", 1)), "production_date": r.get("산란일", None) if r.get("산란일") else None} for r in rows]
        if payloads: await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=payloads, headers=HEADERS)
        return {"status": "success"}
