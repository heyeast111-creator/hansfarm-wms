// ==========================================
// 전역 변수 (Global Variables) - 절대 삭제 금지
// ==========================================
let globalOccupancy = []; 
let productMaster = []; 
let finishedProductMaster = []; 
let globalHistory = []; 
let bomMaster = []; 
let currentZone = '실온'; 
let selectedCellId = null; 
let isAdmin = false;
let loginMode = 'guest';
let currentOrderTab = 'inventory';
let movingItem = null; 
let isRightPanelVisible = false; 

// 💡 렉맵 렌더링의 핵심 뼈대 (J-A 역순 유지)
const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];

// ==========================================
// 초기 로딩 (5000줄 제한 해제)
// ==========================================
function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') loginMode = 'viewer';
    else if (pw === '00700') loginMode = 'editor';
    else { alert("비밀번호 오류"); return; }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');
    load(); 
    showView('dashboard');
}

async function load() {
    try {
        const ts = new Date().getTime(); 
        const SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co";
        const SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu";

        const [occRes, prodRes, fpRes, bomRes, histRes] = await Promise.all([ 
            fetch('/api/inventory?t=' + ts), fetch('/api/products?t=' + ts), fetch('/api/finished_products?t=' + ts), fetch('/api/bom?t=' + ts),
            fetch(`${SUPABASE_URL}/rest/v1/history_log?select=*&order=created_at.desc&limit=5000`, { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } })
        ]);
        
        globalOccupancy = await occRes.json();
        productMaster = await prodRes.json();
        finishedProductMaster = await fpRes.json();
        bomMaster = await bomRes.json();
        globalHistory = await histRes.json();
        
        renderAll(); 
    } catch (e) { console.error("데이터 로드 실패:", e); }
}

function renderAll() {
    try { if(typeof renderMap === 'function') renderMap(); } catch(e){}
    try { updateDashboard(); } catch(e){}
    try { if(typeof renderAccounting === 'function') renderAccounting(); } catch(e){} 
}

function adminLogin() {
    if(isAdmin) { isAdmin = false; alert("관리자 모드 해제"); return; }
    const pw = prompt("관리자 암호:"); 
    if(pw === "123456789*") { isAdmin = true; alert("관리자 권한 활성화"); load(); } 
}

function showView(viewName) {
    ['view-dashboard', 'view-order', 'view-products', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
        let el = document.getElementById(id); if(el) el.classList.add('hidden');
    });
    let targetView = document.getElementById('view-' + viewName);
    if(targetView) { targetView.classList.remove('hidden'); targetView.classList.add('flex'); }
    if(viewName === 'dashboard') updateDashboard(); 
    if(viewName === 'outbound' && typeof renderOutboundUI === 'function') renderOutboundUI();
}

function updateDashboard() {
    try {
        let roomOcc = globalOccupancy.filter(i => i.location_id.startsWith('R-')).length;
        let coldOcc = globalOccupancy.filter(i => i.location_id.startsWith('C-')).length;
        let floorOcc = globalOccupancy.filter(i => i.location_id.startsWith('FL-')).length;

        // 대시보드 도넛 및 숫자 업데이트 로직... (생략 없이 index.html에 맞춰 작동)
        const rp = document.getElementById('dash-room-percent');
        if(rp) {
            let roomTotal = 170; let coldTotal = 116; let floorTotal = 60;
            let rPct = Math.round((roomOcc/roomTotal)*100);
            let cPct = Math.round((coldOcc/coldTotal)*100);
            let fPct = Math.round((floorOcc/floorTotal)*100);
            rp.innerText = rPct + '%';
            document.getElementById('dash-room-donut').style.background = `conic-gradient(#f97316 ${rPct}%, #e2e8f0 0%)`;
            document.getElementById('dash-cold-percent').innerText = cPct + '%';
            document.getElementById('dash-cold-donut').style.background = `conic-gradient(#6366f1 ${cPct}%, #e2e8f0 0%)`;
            document.getElementById('dash-floor-percent').innerText = fPct + '%';
            document.getElementById('dash-floor-donut').style.background = `conic-gradient(#10b981 ${fPct}%, #e2e8f0 0%)`;
        }
    } catch(e){}
}
