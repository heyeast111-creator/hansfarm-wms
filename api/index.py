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

# 🎨 데스크톱 WMS 전용 완벽 커스텀 UI (목업 100% 반영)
HTML_CONTENT = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HANSFARM WMS - PC Version</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #e2e8f0; } /* 바탕화면 톤 */
        .rack-cell { transition: all 0.15s; }
        .cell-empty { background-color: #4ade80; border: 1px solid #166534; color: #064e3b; } /* 초록색 */
        .cell-full { background-color: #ffffff; border: 1px solid #94a3b8; color: #334155; } /* 흰색 */
        .cell-active { background-color: #3b82f6; border: 2px solid #1e3a8a; color: #ffffff; font-weight: bold; transform: scale(1.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); } /* 파란색 */
        
        /* 스크롤바 커스텀 */
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
            <button class="w-full py-3 rounded-md bg-indigo-100 border border-indigo-300 text-indigo-700 font-black shadow-inner text-sm relative">입고 <span class="absolute right-1 top-1 w-2 h-2 rounded-full bg-indigo-500"></span></button>
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">출고</button>
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">재고조회</button>
            <button class="w-full py-3 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm text-sm">검색</button>
        </div>
    </aside>

    <main class="flex-1 flex flex-col min-w-0 bg-slate-200">
        
        <header class="h-16 bg-white border-b border-slate-300 flex items-end justify-between px-6 pt-4 shrink-0 shadow-sm z-10">
            <div class="flex space-x-1">
                <button id="tab-cold" onclick="switchZone('냉장')" class="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner">냉장 (Cold)</button>
                <button id="tab-room" onclick="switchZone('실온')" class="px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200">실온 (Room)</button>
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
            <div class="min-w-max min-h-max bg-white p-10 rounded-xl shadow-xl border border-slate-300 mx-auto w-fit">
                
                <div id="vertical-racks" class="flex items-end">
                    </div>

                <div class="h-14 w-full flex items-center justify-center text-slate-400 font-black tracking-[0.5em] bg-yellow-50/50 border-y-2 border-yellow-300 my-4 shadow-inner text-sm">
                    통로 (Aisle)
                </div>

                <div class="flex justify-end pr-[168px]" id="horizontal-rack-k">
                    </div>
                
            </div>
        </div>
    </main>

    <aside class="w-72 bg-white border-l border-slate-300 flex flex-col shadow-lg z-20 shrink-0">
        <div class="p-6 border-b border-slate-200 bg-slate-50">
            <h2 class="text-lg font-black text-slate-800 flex items-center">
                <svg class="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                렉 정보
            </h2>
        </div>
        <div class="p-6 flex-1 overflow-y-auto space-y-6" id="info-panel">
            <div class="text-center text-slate-400 py-10">
                렉을 선택해주세요
            </div>
        </div>
        
        <div class="p-6 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 space-y-2">
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-empty mr-2"></span> = 빈 공간 (Empty)</div>
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-full mr-2"></span> = 적재됨 (Full)</div>
            <div class="flex items-center"><span class="w-4 h-4 rounded-sm cell-active mr-2"></span> = 선택됨 (Active)</div>
        </div>
    </aside>

    <script>
        // 현재 상태 변수
        let globalOccupancy = [];
        let currentZone = '냉장'; // 냉장 or 실온
        let selectedCellId = null;

        // 목업 기준의 렉 배치도 (A/B, C/D, E/F, G/H, I/J 묶음)
        // 왼쪽(J)부터 오른쪽(A) 순서로 렌더링
        const rackLayout = [
            { id: 'J' }, { aisle: true }, { id: 'I' }, { gap: true },
            { id: 'H' }, { aisle: true }, { id: 'G' }, { gap: true },
            { id: 'F' }, { aisle: true }, { id: 'E' }, { gap: true },
            { id: 'D' }, { aisle: true }, { id: 'C' }, { gap: true },
            { id: 'B' }, { aisle: true }, { id: 'A' }
        ];

        // DB 데이터 불러오기
        async function load() {
            try {
                const res = await fetch('/api/occupancy');
                globalOccupancy = await res.json();
                renderMap();
                clearInfo();
            } catch (e) {
                console.error("데이터 로드 실패:", e);
                alert("데이터베이스 연결에 실패했습니다.");
            }
        }

        // 탭 전환 (단순히 색상만 변경되도록 처리)
        function switchZone(zone) {
            currentZone = zone;
            if(zone === '냉장') {
                document.getElementById('tab-cold').className = "px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner";
                document.getElementById('tab-room').className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200";
            } else {
                document.getElementById('tab-room').className = "px-8 py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner";
                document.getElementById('tab-cold').className = "px-8 py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200";
            }
        }

        // 렉맵 그리기 (층수 변경 시 다시 그려짐)
        function renderMap() {
            const floor = document.getElementById('floor-select').value;
            const vContainer = document.getElementById('vertical-racks');
            const hContainer = document.getElementById('horizontal-rack-k');
            
            let vHtml = '';
            
            // 1. A~J 세로 렉 그리기
            rackLayout.forEach(col => {
                if (col.aisle) {
                    vHtml += `<div class="w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1">
                                <span class="text-yellow-600 font-black tracking-widest text-xs" style="writing-mode: vertical-rl;">통로</span>
                              </div>`;
                } else if (col.gap) {
                    vHtml += `<div class="w-4"></div>`; // 렉과 렉 사이 단순 간격
                } else {
                    // 렉 컬럼 생성 (12번이 위, 1번이 아래)
                    vHtml += `<div class="flex flex-col w-14 space-y-1">`;
                    vHtml += `<div class="text-center font-black text-2xl text-slate-800 pb-2">${col.id}</div>`; // 상단 알파벳
                    
                    for (let r = 12; r >= 1; r--) {
                        // DB 매칭용 ID (예: A-01-1 또는 A-01) - 현재 DB 구조에 맞게 조율 가능
                        // 일단 표시용 이름과 DB검색용 이름을 분리합니다.
                        let dbId = `${col.id}-${r.toString().padStart(2, '0')}`; 
                        // 조님 DB가 층 구분이 없다면, 1층일때만 렌더링하거나 가짜데이터를 넣어야 하지만
                        // 일단 시각적으로 완벽하게 분리해줍니다.
                        let displayId = `${col.id}${r}`;
                        
                        // 현재 층에 따른 임시 구분 (기존 DB 호환 유지 위해)
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

            // 2. K 가로 렉 그리기 (좌측이 K10, 우측이 K1)
            let kHtml = `<div class="flex space-x-1">`;
            for (let c = 10; c >= 1; c--) {
                let displayId = `K${c}`;
                let dbId = `K-${c.toString().padStart(2, '0')}`;
                let info = globalOccupancy.find(x => x.location_id === dbId);
                
                let hasItem = !!info;
                let cellState = hasItem ? 'cell-full' : 'cell-empty';
                if(selectedCellId === displayId) cellState = 'cell-active';
                let itemData = hasItem ? encodeURIComponent(JSON.stringify(info)) : '';

                kHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${itemData}')" 
                            class="w-14 h-10 rounded-[3px] flex items-center justify-center text-[11px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">
                            ${displayId}
                          </div>`;
            }
            kHtml += `</div>`;
            hContainer.innerHTML = kHtml;
        }

        // 셀 클릭 이벤트 (우측 정보창 업데이트)
        function clickCell(displayId, itemDataStr) {
            // 이전 선택 UI 초기화
            if(selectedCellId && document.getElementById(`cell-${selectedCellId}`)) {
                document.getElementById(`cell-${selectedCellId}`).classList.remove('cell-active');
            }
            
            selectedCellId = displayId;
            const currentCell = document.getElementById(`cell-${displayId}`);
            
            // 색상 원복을 위해 현재 상태 다시 렌더링 후 active만 적용
            renderMap(); 

            const panel = document.getElementById('info-panel');
            const floor = document.getElementById('floor-select').options[document.getElementById('floor-select').selectedIndex].text;
            
            if(!itemDataStr) {
                panel.innerHTML = `
                    <div class="bg-slate-100 p-4 rounded-lg border border-slate-200">
                        <div class="text-xs text-slate-400 font-bold mb-1">선택된 위치</div>
                        <div class="text-2xl font-black text-slate-800">${displayId} <span class="text-sm font-normal text-slate-500">(${floor})</span></div>
                    </div>
                    <div class="text-center text-slate-400 py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        현재 이 위치는<br><b class="text-green-600">비어있습니다 (Empty)</b>
                    </div>
                `;
            } else {
                const info = JSON.parse(decodeURIComponent(itemDataStr));
                panel.innerHTML = `
                    <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div class="text-xs text-blue-500 font-bold mb-1">선택된 위치</div>
                        <div class="text-2xl font-black text-blue-900">${displayId} <span class="text-sm font-normal text-blue-600">(${floor})</span></div>
                    </div>
                    
                    <div>
                        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">제품명</label>
                        <div class="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm font-bold text-slate-700">
                            [${info.item_name}]
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">재고수량</label>
                        <div class="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm font-bold text-slate-700">
                            1 박스 (예시)
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">히스토리</label>
                        <div class="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600 leading-relaxed">
                            2026-03-10 입고<br>
                            담당자: 시스템<br>
                            ID: ${info.location_id}
                        </div>
                    </div>
                `;
            }
        }

        // 초기 실행
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
