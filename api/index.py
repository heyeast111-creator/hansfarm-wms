import os
import httpx
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel

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

# 데이터 수신용 모델
class InboundData(BaseModel):
    location_id: str
    category: str
    item_name: str
    quantity: int
    production_date: str = None
    remarks: str = ""

class OutboundData(BaseModel):
    inventory_id: str
    location_id: str
    item_name: str
    quantity: int

# --- UI 코드 (디자인 100% 동결, 기능 JS만 추가) ---
HTML_CONTENT = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HANSFARM WMS - PC Version</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #e2e8f0; }
        .rack-cell { transition: all 0.15s; }
        .cell-empty { background-color: #ffffff; border: 1px dashed #cbd5e1; color: #94a3b8; }
        .cell-full { background-color: #4ade80; border: 1px solid #166534; color: #064e3b; font-weight: bold; }
        .cell-active { background-color: #3b82f6; border: 2px solid #1e3a8a; color: #ffffff; font-weight: bold; transform: scale(1.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 10; relative; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #cbd5e1; }
        ::-webkit-scrollbar-thumb { background: #64748b; border-radius: 4px; }
    </style>
</head>
<body class="font-sans h-screen flex overflow-hidden text-slate-800 selection:bg-indigo-200">

    <aside class="w-32 bg-white border-r border-slate-300 flex flex-col items-center py-6 shadow-lg z-20 shrink-0">
        <div class="mb-8 w-full px-4 flex justify-center">
            <img src="/logo.jpg" alt="HANS FARM" class="max-w-full h-auto object-contain drop-shadow-sm">
        </div>
        <div class="flex flex-col space-y-3 w-full px-3">
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">대시보드</button>
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">재고조회</button>
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">검색</button>
            <button onclick="alert('엑셀 가져오기(Import) 기능이 연결될 예정입니다.')" class="w-full py-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-black shadow-inner text-sm relative">가져오기</button>
            <button onclick="alert('엑셀 내보내기(Export) 기능이 연결될 예정입니다.')" class="w-full py-3 rounded-md bg-orange-50 border border-orange-200 text-orange-700 font-black shadow-inner text-sm relative">내보내기</button>
        </div>
    </aside>

    <main class="flex-1 flex flex-col min-w-0 bg-slate-200">
        <header class="h-16 bg-white border-b border-slate-300 flex items-end justify-between px-6 pt-4 shrink-0 shadow-sm z-10">
            <div class="flex space-x-1">
                <button id="tab-room" onclick="switchZone('실온')" class="px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner">실온 (Room)</button>
                <button id="tab-cold" onclick="switchZone('냉장')" class="px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200">냉장 (Cold)</button>
            </div>
            
            <div class="flex items-center space-x-4 pb-2">
                <div id="fifo-btn-container" class="hidden mr-4">
                    <button onclick="highlightFIFO()" class="px-4 py-1.5 bg-rose-100 border border-rose-300 text-rose-700 font-black rounded-md hover:bg-rose-200 text-sm flex items-center shadow-sm transition-all">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        선입선출 추천
                    </button>
                </div>

                <label class="font-bold text-slate-600 text-sm">층 선택</label>
                <select id="floor-select" onchange="renderMap()" class="bg-white border-2 border-slate-300 text-slate-800 font-bold text-sm rounded-md px-4 py-1.5 focus:outline-none focus:border-indigo-500 shadow-sm">
                    <option value="1">1층 (1F)</option>
                    <option value="2">2층 (2F)</option>
                </select>
                <button onclick="load()" class="ml-4 p-1.5 bg-white border border-slate-300 rounded hover:bg-slate-100 text-slate-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                </button>
            </div>
        </header>

        <div class="flex-1 overflow-auto p-6 relative">
            <div class="min-w-max min-h-max bg-white p-10 rounded-xl shadow-xl border border-slate-300 mx-auto w-fit transition-all" id="map-container">
                <div id="vertical-racks" class="flex items-end"></div>
                <div class="h-14 w-full flex items-center justify-center text-slate-400 font-black tracking-[0.5em] bg-yellow-50/50 border-y-2 border-yellow-300 my-4 shadow-inner text-sm">
                    통로 (Aisle)
                </div>
                <div class="flex justify-end pr-[168px]" id="horizontal-rack"></div>
            </div>
        </div>
    </main>

    <aside class="w-80 bg-white border-l border-slate-300 flex flex-col shadow-lg z-20 shrink-0">
        <div class="p-6 border-b border-slate-200 bg-slate-50">
            <h2 class="text-lg font-black text-slate-800 flex items-center">
                <svg class="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                렉 정보
            </h2>
        </div>
        
        <div class="p-6 flex-1 overflow-y-auto" id="info-panel">
            <div class="text-center text-slate-400 py-10 mt-10">
                도면에서 렉을 선택해주세요
            </div>
        </div>
        
        <div class="p-6 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 space-y-2 shrink-0">
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-empty mr-2"></span> = 빈 공간 (Empty)</div>
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-full mr-2"></span> = 적재됨 (Full)</div>
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-active mr-2"></span> = 선택됨 (Active)</div>
        </div>
    </aside>

    <script>
        let globalOccupancy = [];
        let productMaster = [];
        let currentZone = '실온'; 
        let selectedCellId = null;

        const layoutRoom = [
            { id: 'J', cols: 12 }, { aisle: true }, 
            { id: 'I', cols: 10 }, { gap: true }, { id: 'H', cols: 10 }, { aisle: true },
            { id: 'G', cols: 10 }, { gap: true }, { id: 'F', cols: 10 }, { aisle: true },
            { id: 'E', cols: 12 }, { gap: true }, { id: 'D', cols: 12 }, { aisle: true },
            { id: 'C', cols: 12 }, { gap: true }, { id: 'B', cols: 12 }, { aisle: true },
            { id: 'A', cols: 12 }
        ];

        const layoutCold = [
            { id: 'F', cols: 10 }, { aisle: true }, 
            { id: 'E', cols: 12 }, { gap: true }, { id: 'D', cols: 12 }, { aisle: true },
            { id: 'C', cols: 12 }, { gap: true }, { id: 'B', cols: 12 }, { aisle: true },
            { id: 'A', cols: 10 }
        ];

        async function load() {
            try {
                // 재고와 품목 마스터 데이터를 동시에 불러옵니다.
                const [occRes, prodRes] = await Promise.all([
                    fetch('/api/inventory'),
                    fetch('/api/products')
                ]);
                globalOccupancy = await occRes.json();
                productMaster = await prodRes.json();
                
                renderMap();
                if(selectedCellId) clickCell(selectedCellId);
                else clearInfo();
            } catch (e) {
                console.error("데이터 로딩 에러:", e);
            }
        }

        function switchZone(zone) {
            currentZone = zone;
            selectedCellId = null;
            clearInfo();
            
            // FIFO 버튼 제어
            const fifoBtn = document.getElementById('fifo-btn-container');
            if(zone === '냉장') {
                fifoBtn.classList.remove('hidden');
                document.getElementById('tab-cold').className = "px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner";
                document.getElementById('tab-room').className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200";
            } else {
                fifoBtn.classList.add('hidden');
                document.getElementById('tab-room').className = "px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner";
                document.getElementById('tab-cold').className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200";
            }
            renderMap();
        }

        function clearInfo() {
            document.getElementById('info-panel').innerHTML = `
                <div class="text-center text-slate-400 py-10 mt-10">도면에서 렉을 선택해주세요</div>
            `;
        }

        function renderMap() {
            const floor = document.getElementById('floor-select').value;
            const vContainer = document.getElementById('vertical-racks');
            const hContainer = document.getElementById('horizontal-rack');
            const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold;
            let vHtml = '';
            
            activeLayout.forEach(col => {
                if (col.aisle) {
                    vHtml += `<div class="w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1"><span class="text-yellow-600 font-black tracking-widest text-xs" style="writing-mode: vertical-rl;">통로</span></div>`;
                } else if (col.gap) {
                    vHtml += `<div class="w-4"></div>`;
                } else {
                    vHtml += `<div class="flex flex-col w-14 space-y-1 justify-end">`;
                    vHtml += `<div class="text-center font-black text-2xl text-slate-800 pb-2">${col.id}</div>`;
                    
                    for (let r = col.cols; r >= 1; r--) {
                        let dbId = `${col.id}-${r.toString().padStart(2, '0')}`;
                        let displayId = `${col.id}${r}`;
                        let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                        
                        // 해당 렉에 물건이 1개라도 있는지 확인
                        let items = globalOccupancy.filter(x => x.location_id === searchId);
                        let hasItem = items.length > 0;
                        
                        let cellState = hasItem ? 'cell-full' : 'cell-empty';
                        if(selectedCellId === displayId) cellState = 'cell-active';

                        vHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" 
                                    class="h-8 rounded-[3px] flex items-center justify-center text-[10px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">
                                    ${displayId}
                                  </div>`;
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
                let hasItem = items.length > 0;
                
                let cellState = hasItem ? 'cell-full' : 'cell-empty';
                if(selectedCellId === displayId) cellState = 'cell-active';

                hHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" 
                            class="w-14 h-10 rounded-[3px] flex items-center justify-center text-[11px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">
                            ${displayId}
                          </div>`;
            }
            hHtml += `</div>`;
            hContainer.innerHTML = hHtml;
        }

        // 우측 패널 그리기 (입고/출고 폼)
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
            
            // 해당 렉의 물품 리스트
            const items = globalOccupancy.filter(x => x.location_id === searchId);
            
            let panelHtml = `
                <div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div>
                            <div class="text-3xl font-black text-indigo-900">${displayId}</div>
                        </div>
                        <div class="text-right">
                            <span class="inline-block bg-white text-indigo-700 text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floorName}</span>
                        </div>
                    </div>
                </div>
            `;

            // 1. 적재된 물건이 있을 경우 (출고 리스트 뷰 + 추가 입고 버튼)
            if(items.length > 0) {
                panelHtml += `<div class="mb-2 text-xs font-bold text-slate-500 flex justify-between items-end">
                                <span>적재 목록 (${items.length}건)</span>
                              </div>`;
                
                items.forEach(item => {
                    let dateHtml = item.production_date ? `<div class="text-xs text-rose-600 font-bold mt-1">산란일: ${item.production_date}</div>` : '';
                    panelHtml += `
                        <div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3">
                            <div class="flex justify-between items-start mb-2">
                                <div>
                                    <span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span>
                                    <div class="font-black text-sm text-slate-800 mt-1">${item.item_name}</div>
                                </div>
                                <div class="text-right">
                                    <div class="text-sm font-bold text-indigo-600">${item.quantity} 박스</div>
                                </div>
                            </div>
                            ${dateHtml}
                            <button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="w-full mt-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-xs font-bold transition-colors">
                                전량 출고
                            </button>
                        </div>
                    `;
                });
            } else {
                panelHtml += `
                    <div class="text-center text-slate-400 py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-4">
                        <b class="text-emerald-600 inline-block">비어있습니다 (Empty)</b>
                    </div>
                `;
            }

            // 2. 입고 폼 (빈 렉이거나 추가 입고 시)
            // 카테고리 중복 제거 옵션 생성
            const categories = [...new Set(productMaster.map(p => p.category))];
            let catOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');

            panelHtml += `
                <div class="mt-6 pt-6 border-t border-slate-200">
                    <h3 class="text-sm font-black text-slate-700 mb-4 flex items-center">
                        <svg class="w-4 h-4 mr-1 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        신규 입고
                    </h3>
                    <div class="space-y-3">
                        <div class="flex space-x-2">
                            <div class="w-1/3">
                                <label class="block text-[10px] font-bold text-slate-400 mb-1">카테고리</label>
                                <select id="in-cat" onchange="updateProductDropdown()" class="w-full border border-slate-300 rounded p-2 text-xs font-bold">
                                    <option value="">선택</option>
                                    ${catOptions}
                                </select>
                            </div>
                            <div class="w-2/3">
                                <label class="block text-[10px] font-bold text-slate-400 mb-1">품목명</label>
                                <select id="in-item" class="w-full border border-slate-300 rounded p-2 text-xs font-bold">
                                    <option value="">카테고리 먼저 선택</option>
                                </select>
                            </div>
                        </div>
                        <div class="flex space-x-2">
                            <div class="w-1/2">
                                <label class="block text-[10px] font-bold text-slate-400 mb-1">수량</label>
                                <input type="number" id="in-qty" value="1" min="1" class="w-full border border-slate-300 rounded p-2 text-xs font-bold">
                            </div>
                            <div class="w-1/2">
                                <label class="block text-[10px] font-bold text-slate-400 mb-1">산란일/제조일</label>
                                <input type="date" id="in-date" class="w-full border border-slate-300 rounded p-2 text-xs font-bold">
                            </div>
                        </div>
                        <button onclick="processInbound('${searchId}')" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-black shadow-md transition-colors text-sm mt-2">
                            입고 처리
                        </button>
                    </div>
                </div>
            `;
            
            panel.innerHTML = panelHtml;
        }

        // 드롭다운 연동 로직
        function updateProductDropdown() {
            const cat = document.getElementById('in-cat').value;
            const itemSelect = document.getElementById('in-item');
            const filtered = productMaster.filter(p => p.category === cat);
            
            itemSelect.innerHTML = filtered.map(p => `<option value="${p.item_name}">${p.item_name}</option>`).join('');
            if(filtered.length === 0) itemSelect.innerHTML = '<option value="">품목 없음</option>';
        }

        // 📥 입고 처리 API 호출
        async function processInbound(locationId) {
            const cat = document.getElementById('in-cat').value;
            const item = document.getElementById('in-item').value;
            const qty = document.getElementById('in-qty').value;
            const date = document.getElementById('in-date').value;

            if(!cat || !item || !qty) return alert("카테고리, 품목, 수량을 모두 입력하세요.");

            try {
                await fetch('/api/inbound', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        location_id: locationId,
                        category: cat,
                        item_name: item,
                        quantity: parseInt(qty),
                        production_date: date || null
                    })
                });
                alert("입고 완료!");
                load(); // 화면 갱신
            } catch (e) { alert("입고 중 오류 발생!"); }
        }

        // 📤 출고 처리 API 호출
        async function processOutbound(invId, itemName, maxQty, locationId) {
            if(!confirm(`[${itemName}] 전량 출고하시겠습니까?`)) return;

            try {
                await fetch('/api/outbound', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        inventory_id: invId,
                        location_id: locationId,
                        item_name: itemName,
                        quantity: maxQty
                    })
                });
                alert("출고 완료!");
                load();
            } catch (e) { alert("출고 중 오류 발생!"); }
        }

        // 🔔 선입선출 하이라이트 기능 (가장 오래된 산란일 찾기)
        function highlightFIFO() {
            // 산란일이 있는 계란 데이터 필터링
            const eggs = globalOccupancy.filter(x => x.production_date);
            if(eggs.length === 0) return alert("현재 적재된 계란(산란일 데이터)이 없습니다.");

            // 날짜 오름차순(오래된 순) 정렬
            eggs.sort((a, b) => new Date(a.production_date) - new Date(b.production_date));
            const oldestDate = eggs[0].production_date;
            
            // 가장 오래된 날짜를 가진 렉의 위치 찾기
            const targetLocations = eggs.filter(x => x.production_date === oldestDate).map(x => x.location_id);
            
            alert(`가장 오래된 산란일: ${oldestDate}\\n해당 렉을 빨간색으로 깜빡입니다!`);

            // 시각적 피드백 (화면의 해당 셀을 찾아서 애니메이션 적용)
            targetLocations.forEach(loc => {
                // loc 형식(예: A-01-2F)을 셀 ID 형식(예: A1)으로 변환
                const is2F = loc.includes('2F');
                let match = loc.match(/([A-Z])-([0-9]+)/);
                if(match) {
                    let cellDisplayId = `${match[1]}${parseInt(match[2])}`;
                    let el = document.getElementById(`cell-${cellDisplayId}`);
                    // 층이 일치할 때만 깜빡임 (임시방편, 나중엔 층 상관없이 탭 전환 등 고려 가능)
                    if(el) {
                        el.style.border = '3px solid red';
                        el.style.animation = 'pulse 1s infinite';
                    }
                }
            });
            
            // 깜빡임 CSS 동적 추가
            if(!document.getElementById('pulse-css')) {
                const style = document.createElement('style');
                style.id = 'pulse-css';
                style.innerHTML = `@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; background-color: #fecdd3; } 100% { opacity: 1; } }`;
                document.head.appendChild(style);
            }
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
    if os.path.exists(logo_path):
        return FileResponse(logo_path)
    return {"error": "Logo not found."}

# 1. 품목 마스터 가져오기
@app.get("/api/products")
async def get_products():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/products?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

# 2. 전체 재고 가져오기 (새로운 테이블 연동)
@app.get("/api/inventory")
async def get_inventory():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory_v2?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

# 3. 입고 처리 (재고 추가 + 히스토리 기록)
@app.post("/api/inbound")
async def inbound_stock(data: InboundData):
    async with httpx.AsyncClient() as client:
        # 재고 추가
        inv_payload = {
            "location_id": data.location_id,
            "category": data.category,
            "item_name": data.item_name,
            "quantity": data.quantity,
            "production_date": data.production_date if data.production_date else None,
            "remarks": data.remarks
        }
        await client.post(f"{SUPABASE_URL}/rest/v1/inventory_v2", json=inv_payload, headers=HEADERS)
        
        # 히스토리 기록
        log_payload = inv_payload.copy()
        log_payload["action_type"] = "입고"
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=log_payload, headers=HEADERS)
        
        return {"status": "success"}

# 4. 출고 처리 (재고 삭제 + 히스토리 기록)
@app.post("/api/outbound")
async def outbound_stock(data: OutboundData):
    async with httpx.AsyncClient() as client:
        # 재고 삭제 (이번 버전은 전량 출고)
        await client.delete(f"{SUPABASE_URL}/rest/v1/inventory_v2?id=eq.{data.inventory_id}", headers=HEADERS)
        
        # 히스토리 기록
        log_payload = {
            "location_id": data.location_id,
            "action_type": "출고",
            "item_name": data.item_name,
            "quantity": data.quantity
        }
        await client.post(f"{SUPABASE_URL}/rest/v1/history_log", json=log_payload, headers=HEADERS)
        
        return {"status": "success"}
