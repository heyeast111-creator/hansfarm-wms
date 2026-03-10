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

# 🎨 새로 개편된 렉맵 UI (역순 배치, 10/12칸, 2층, 통로 반영 완료)
HTML_CONTENT = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>한스팜 클라우드 WMS</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        /* 모바일에서 스크롤바 예쁘게 숨기기 */
        .custom-scrollbar::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    </style>
</head>
<body class="bg-slate-100 text-slate-900 font-sans">
    <div class="max-w-2xl mx-auto min-h-screen flex flex-col shadow-2xl bg-white">
        <header class="p-5 bg-indigo-700 text-white flex justify-between items-center sticky top-0 z-50 shadow-md">
            <h1 class="font-black text-xl tracking-tight">HANSFARM <span class="text-indigo-300">2.0</span></h1>
            <button onclick="load()" class="bg-indigo-500 hover:bg-indigo-400 px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-inner">새로고침</button>
        </header>

        <main id="rack-container" class="p-4 space-y-2 flex-grow overflow-y-auto bg-slate-50">
            <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
                <p class="text-sm">클라우드 렉맵 로딩 중...</p>
            </div>
        </main>
        
        <footer class="p-4 bg-slate-100 border-t border-slate-200 text-center text-[10px] text-slate-400 font-bold">
            &copy; 2026 Hansfarm WMS Cloud - Designed for Mobile
        </footer>
    </div>

    <div id="modal" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100]">
        <div class="bg-white p-6 rounded-3xl w-full max-w-xs shadow-2xl transform transition-all">
            <h2 id="m-title" class="font-black text-2xl mb-6 text-indigo-700">위치 이동</h2>
            <div class="space-y-4">
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">품목명</label>
                    <input id="m-item" type="text" readonly class="w-full border-0 bg-slate-100 p-4 rounded-2xl text-sm font-bold text-slate-600 outline-none">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">목적지 위치</label>
                    <input id="m-dest" type="text" placeholder="예: D-05" class="w-full border-2 border-indigo-100 focus:border-indigo-500 p-4 rounded-2xl text-sm outline-none transition-all font-bold uppercase">
                </div>
                <div class="grid grid-cols-2 gap-3 pt-4">
                    <button onclick="moveStock()" class="bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-indigo-200 transition-colors">이동 완료</button>
                    <button onclick="closeM()" class="bg-slate-100 hover:bg-slate-200 text-slate-500 py-4 rounded-2xl font-bold text-sm transition-colors">취소</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // 조님께서 요청하신 레이아웃 완벽 반영 (역순 배치, 칸수 구분, 통로)
        const layoutSpec = [
            { racks: ['J'], cols: 12 },
            { aisle: true },
            { racks: ['I', 'H'], cols: 10 },
            { aisle: true },
            { racks: ['G', 'F'], cols: 10 },
            { aisle: true },
            { racks: ['E', 'D'], cols: 12 },
            { aisle: true },
            { racks: ['C', 'B'], cols: 12 },
            { aisle: true },
            { racks: ['A'], cols: 12 },
            { aisle: true, text: '가로 횡단 통로' },
            { racks: ['K'], cols: 12 }
        ];

        let curLoc = null;
        async function load() {
            try {
                // UI를 하드코딩했으므로 재고(occupancy) 정보만 가져오면 됩니다.
                const oRes = await fetch('/api/occupancy');
                const occupancy = await oRes.json();
                render(occupancy);
            } catch (e) {
                console.error(e);
                document.getElementById('rack-container').innerHTML = '<p class="text-red-500 text-center p-10 font-bold bg-red-50 rounded-2xl mt-4 border border-red-200">데이터 로드 실패! Supabase 연결을 확인하세요.</p>';
            }
        }

        function render(occ) {
            const container = document.getElementById('rack-container');
            let html = '';
            
            layoutSpec.forEach(row => {
                if (row.aisle) {
                    let aisleText = row.text ? row.text : '통 로 (AISLE)';
                    html += `<div class="h-10 w-full bg-slate-200/60 flex items-center justify-center my-4 rounded-lg text-xs text-slate-500 font-black tracking-[0.3em] border-y border-slate-300 shadow-inner">${aisleText}</div>`;
                    return;
                }
                
                row.racks.forEach(r => {
                    html += `<div class="mb-5 bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
                        <div class="flex justify-between items-end mb-2 border-b-2 border-indigo-100 pb-1 px-1">
                            <h2 class="text-base font-black text-indigo-800 tracking-tight">${r} ZONE 
                                <span class="text-[10px] text-slate-400 font-normal ml-1 tracking-normal">(${row.cols}칸 x 2층)</span>
                            </h2>
                        </div>
                        <div class="overflow-x-auto pb-3 custom-scrollbar">
                            <div style="display: grid; grid-template-columns: repeat(${row.cols}, minmax(52px, 1fr)); gap: 6px; min-width: max-content;">`;
                    
                    // 각 렉별로 2층 세팅 (총 칸수 = cols * 2)
                    for(let i=1; i<=row.cols * 2; i++) {
                        let cellId = `${r}-${i.toString().padStart(2, '0')}`;
                        // DB에 해당 위치의 재고가 있는지 확인
                        let info = occ.find(x => x.location_id === cellId);
                        
                        let hasItem = !!info;
                        let bgClass = hasItem ? "bg-indigo-50 border-indigo-300 shadow-md scale-[1.02]" : "bg-slate-50 border-slate-200 hover:bg-slate-100";
                        let textClass = hasItem ? "text-indigo-700" : "text-slate-400";
                        let itemName = hasItem ? info.item_name : "";
                        
                        html += `<div onclick="if('${hasItem}'==='true') openM('${cellId}', '${itemName}')" class="h-14 flex flex-col items-center justify-center border rounded-xl cursor-pointer transition-all ${bgClass}">
                            <span class="text-[10px] font-black ${textClass}">${cellId}</span>
                            <span class="text-[9px] font-bold truncate w-full text-center px-1 mt-0.5 text-slate-600">${itemName}</span>
                        </div>`;
                    }
                    
                    html += `</div></div></div>`;
                });
            });
            container.innerHTML = html;
        }

        function openM(id, item) {
            curLoc = id;
            document.getElementById('m-item').value = item;
            document.getElementById('m-dest').value = ''; // 열 때마다 목적지 초기화
            document.getElementById('modal').classList.remove('hidden');
            document.getElementById('m-dest').focus();
        }

        function closeM() { document.getElementById('modal').classList.add('hidden'); }

        async function moveStock() {
            const item = document.getElementById('m-item').value;
            const to_loc = document.getElementById('m-dest').value.trim().toUpperCase();
            if(!to_loc) return alert("목적지를 입력하세요!");

            await fetch('/api/move', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({from_loc: curLoc, to_loc: to_loc, item: item})
            });
            closeM();
            load(); // 닫고 나서 화면 바로 새로고침
        }
        
        // 페이지 열리자마자 데이터 로드
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
