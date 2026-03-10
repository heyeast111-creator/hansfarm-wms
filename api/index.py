import httpx
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
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

class InventoryMove(BaseModel):
    from_loc: str
    to_loc: str
    item: str

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
        .cell-empty { background-color: #4ade80; border: 1px solid #166534; color: #064e3b; }
        .cell-full { background-color: #ffffff; border: 1px solid #94a3b8; color: #334155; }
        .cell-active { background-color: #3b82f6; border: 2px solid #1e3a8a; color: #ffffff; font-weight: bold; transform: scale(1.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 10; relative; }
        
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #cbd5e1; }
        ::-webkit-scrollbar-thumb { background: #64748b; border-radius: 4px; }
    </style>
</head>
<body class="font-sans h-screen flex overflow-hidden text-slate-800 selection:bg-indigo-200">

    <aside class="w-28 bg-white border-r border-slate-300 flex flex-col items-center py-6 shadow-lg z-20 shrink-0">
        <div class="font-black text-indigo-700 text-lg mb-8 tracking-tighter leading-tight text-center">HANS<br>FARM</div>
        <div class="flex flex-col space-y-3 w-full px-3">
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">대시보드</button>
            <button class="w-full py-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-black shadow-inner text-sm relative">가져오기</button>
            <button class="w-full py-3 rounded-md bg-orange-50 border border-orange-200 text-orange-700 font-black shadow-inner text-sm relative">내보내기</button>
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">재고조회</button>
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">검색</button>
        </div>
    </aside>

    <main class="flex-1 flex flex-col min-w-0 bg-slate-200">
        
        <header class="h-16 bg-white border-b border-slate-300 flex items-end justify-between px-6 pt-4 shrink-0 shadow-sm z-10">
            <div class="flex space-x-1">
                <button id="tab-room" onclick="switchZone('실온')" class="px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner">실온 (Room)</button>
                <button id="tab-cold" onclick="switchZone('냉장')" class="px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200">냉장 (Cold)</button>
            </div>
            
            <div class="flex items-center space-x-4 pb-2">
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
        
        <div class="p-6 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 space-y-2">
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-empty mr-2"></span> = 빈 공간 (Empty)</div>
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-full mr-2"></span> = 적재됨 (Full)</div>
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-active mr-2"></span> = 선택됨 (Active)</div>
        </div>
    </aside>

    <script>
        let globalOccupancy = [];
        let currentZone = '실온'; // 기본값 실온
        let selectedCellId = null;

        // 🏠 [실온 탭 레이아웃] : J~A (F,G,H,I는 10칸) + 가로 K(10)
        const layoutRoom = [
            { id: 'J', cols: 12 }, { aisle: true }, 
            { id: 'I', cols: 10 }, { gap: true }, { id: 'H', cols: 10 }, { aisle: true },
            { id: 'G', cols: 10 }, { gap: true }, { id: 'F', cols: 10 }, { aisle: true },
            { id: 'E', cols: 12 }, { gap: true }, { id: 'D', cols: 12 }, { aisle: true },
            { id: 'C', cols: 12 }, { gap: true }, { id: 'B', cols: 12 }, { aisle: true },
            { id: 'A', cols: 12 }
        ];

        // ❄️ [냉장 탭 레이아웃] : F~A (A,F는 10칸, B,C,D,E는 12칸) + 가로 I(8)
        const layoutCold = [
            { id: 'F', cols: 10 }, { aisle: true }, 
            { id: 'E', cols: 12 }, { gap: true }, { id: 'D', cols: 12 }, { aisle: true },
            { id: 'C', cols: 12 }, { gap: true }, { id: 'B', cols: 12 }, { aisle: true },
            { id: 'A', cols: 10 }
        ];

        async function load() {
            try {
                const res = await fetch('/api/occupancy');
                globalOccupancy = await res.json();
                renderMap();
                clearInfo();
            } catch (e) {
                console.error(e);
            }
        }

        function switchZone(zone) {
            currentZone = zone;
            selectedCellId = null; // 탭 바꿀 때 선택 해제
            clearInfo();
            
            if(zone === '실온') {
                document.getElementById('tab-room').className = "px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner";
                document.getElementById('tab-cold').className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200";
            } else {
                document.getElementById('tab-cold').className = "px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner";
                document.getElementById('tab-room').className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200";
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
            
            // 1. 세로 렉 렌더링
            activeLayout.forEach(col => {
                if (col.aisle) {
                    vHtml += `<div class="w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1">
                                <span class="text-yellow-600 font-black tracking-widest text-xs" style="writing-mode: vertical-rl;">통로</span>
                              </div>`;
                } else if (col.gap) {
                    vHtml += `<div class="w-4"></div>`;
                } else {
                    vHtml += `<div class="flex flex-col w-14 space-y-1 justify-end">`;
                    vHtml += `<div class="text-center font-black text-2xl text-slate-800 pb-2">${col.id}</div>`;
                    
                    for (let r = col.cols; r >= 1; r--) {
                        let dbId = `${col.id}-${r.toString().padStart(2, '0')}`;
                        let displayId = `${col.id}${r}`;
                        let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                        
                        let info = globalOccupancy.find(x => x.location_id === searchId || x.location_id === dbId);
                        let hasItem = !!info;
                        let cellState = hasItem ? 'cell-full' : 'cell-empty';
                        if(selectedCellId === displayId) cellState = 'cell-active';

                        let itemData = hasItem ? encodeURIComponent(JSON.stringify(info)) : '';

                        vHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${itemData}')" 
                                    class="h-8 rounded-[3px] flex items-center justify-center text-[10px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">
                                    ${displayId}
                                  </div>`;
                    }
                    vHtml += `</div>`;
                }
            });
            vContainer.innerHTML = vHtml;

            // 2. 가로 렉 렌더링
            let hHtml = `<div class="flex space-x-1">`;
            let hPrefix = currentZone === '실온' ? 'K' : 'I';
            let hCols = currentZone === '실온' ? 10 : 8;

            for (let c = hCols; c >= 1; c--) {
                let displayId = `${hPrefix}${c}`;
                let dbId = `${hPrefix}-${c.toString().padStart(2, '0')}`;
                let info = globalOccupancy.find(x => x.location_id === dbId);
                
                let hasItem = !!info;
                let cellState = hasItem ? 'cell-full' : 'cell-empty';
                if(selectedCellId === displayId) cellState = 'cell-active';
                let itemData = hasItem ? encodeURIComponent(JSON.stringify(info)) : '';

                hHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${itemData}')" 
                            class="w-14 h-10 rounded-[3px] flex items-center justify-center text-[11px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">
                            ${displayId}
                          </div>`;
            }
            hHtml += `</div>`;
            hContainer.innerHTML = hHtml;
        }

        function clickCell(displayId, itemDataStr) {
            selectedCellId = displayId;
            renderMap(); 

            const panel = document.getElementById('info-panel');
            const floor = document.getElementById('floor-select').options[document.getElementById('floor-select').selectedIndex].text;
            
            // 상단 공통 타이틀 영역
            let panelHtml = `
                <div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-6">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div>
                            <div class="text-3xl font-black text-indigo-900">${displayId}</div>
                        </div>
                        <div class="text-right">
                            <span class="inline-block bg-white text-indigo-700 text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floor}</span>
                        </div>
                    </div>
                </div>
            `;

            if(!itemDataStr) {
                panelHtml += `
                    <div class="text-center text-slate-400 py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-6">
                        현재 이 위치는<br><b class="text-emerald-600 mt-2 inline-block">비어있습니다 (Empty)</b>
                    </div>
                `;
            } else {
                const info = JSON.parse(decodeURIComponent(itemDataStr));
                panelHtml += `
                    <div class="space-y-4 mb-6">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">제품명</label>
                            <div class="bg-white border border-slate-200 rounded-md p-3 text-sm font-black text-slate-800 shadow-sm truncate">
                                ${info.item_name || '미등록 제품'}
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">수량</label>
                                <div class="bg-white border border-slate-200 rounded-md p-3 text-sm font-bold text-slate-700 shadow-sm">
                                    ${info.quantity || '1'} 박스
                                </div>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">비고</label>
                                <div class="bg-white border border-slate-200 rounded-md p-3 text-sm font-bold text-slate-700 shadow-sm truncate">
                                    ${info.remarks || '-'}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">히스토리</label>
                            <div class="bg-white border border-slate-200 rounded-md p-3 text-xs text-slate-600 leading-relaxed shadow-sm h-24 overflow-y-auto custom-scrollbar">
                                <span class="text-emerald-600 font-bold">[입고]</span> 2026-03-10<br>
                                <span class="text-slate-400">담당자: 시스템</span><br>
                                <span class="text-slate-400">ID: ${info.location_id}</span>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 하단 입고/출고 액션 버튼 (정보 패널 내부)
            panelHtml += `
                <div class="flex space-x-2 pt-4 border-t border-slate-200 mt-auto">
                    <button class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-black shadow-md transition-colors text-sm">입고 처리</button>
                    <button class="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-lg font-black shadow-md transition-colors text-sm ${!itemDataStr ? 'opacity-50 cursor-not-allowed' : ''}">출고 처리</button>
                </div>
            `;

            panel.innerHTML = panelHtml;
        }

        load();
    </script>
</body>
</html>
"""

@app.get("/")
async def serve_ui():
    return HTMLResponse(content=HTML_CONTENT)

@app.get("/api/occupancy")
async def get_occupancy():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/inventory?select=*", headers=HEADERS)
        return r.json() if r.status_code == 200 else []

@app.post("/api/move")
async def move_stock(data: InventoryMove):
    async with httpx.AsyncClient() as client:
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/inventory?location_id=eq.{data.from_loc}&item_name=eq.{data.item}",
            json={"location_id": data.to_loc},
            headers=HEADERS
        )
        return {"status": "success"}
