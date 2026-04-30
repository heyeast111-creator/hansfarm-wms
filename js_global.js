// ==========================================
// 전역 변수 (Global Variables) - 절대 삭제 금지
// ==========================================
let globalOccupancy = []; 
let productMaster = []; 
let finishedProductMaster = []; 
let globalHistory = []; 
let bomMaster = []; 
let globalSearchTargets = []; 
let currentZone = '실온'; 
let selectedCellId = null; 
let isAdmin = false;
let loginMode = 'guest';

let currentOrderTab = 'inventory';
let editingProductOriginalName = null;
let editingProductOriginalSupplier = null;
let orderCart = []; 
let movingItem = null;
let bomCart = [];
let expandedBomRows = {}; 
let isRightPanelVisible = false; 

const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];

function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') { loginMode = 'viewer'; alert("뷰어 모드로 접속되었습니다."); } 
    else if (pw === '00700') { loginMode = 'editor'; alert("일반 사용자 모드로 접속되었습니다."); } 
    else { alert("비밀번호가 틀렸습니다."); return; }
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');
    load(); 
    showView('dashboard'); // 로그인 시 대시보드 먼저 보여주며 색깔도 켬
}

async function load() {
    try {
        const ts = new Date().getTime(); 
        const SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co";
        const SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu";

        const [occRes, prodRes, fpRes, bomRes, histRes] = await Promise.all([ 
            fetch('/api/inventory?t=' + ts), 
            fetch('/api/products?t=' + ts), 
            fetch('/api/finished_products?t=' + ts), 
            fetch('/api/bom?t=' + ts),
            fetch(`${SUPABASE_URL}/rest/v1/history_log?select=*&order=created_at.desc&limit=5000`, { 
                headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } 
            })
        ]);
        
        globalOccupancy = await occRes.json() || [];
        productMaster = await prodRes.json() || [];
        finishedProductMaster = await fpRes.json() || [];
        bomMaster = await bomRes.json() || [];
        globalHistory = await histRes.json() || [];
        
        renderAll(); 
    } catch (e) { 
        console.error("로딩 에러:", e); 
        alert("데이터를 불러오지 못했습니다. 파이썬 서버가 실행 중인지 확인해주세요.");
    }
}

function renderAll() {
    try { if(typeof renderMap === 'function') renderMap(); if(selectedCellId && typeof clickCell === 'function') clickCell(selectedCellId); } catch(e){}
    try { updateDashboard(); } catch(e){}
    try { if(typeof updateMapSearchCategoryDropdown === 'function') updateMapSearchCategoryDropdown(); } catch(e){}
    try { if(typeof updateSummarySupplierDropdown === 'function') updateSummarySupplierDropdown(); } catch(e){}
    try { if(typeof renderSafetyStock === 'function') renderSafetyStock(); } catch(e){}
    try { if(typeof renderAccounting === 'function') renderAccounting(); } catch(e){} 
    try { if(typeof populateWaitDropdowns === 'function') populateWaitDropdowns(); } catch(e){}
    try { if(typeof renderDailyInventory === 'function') renderDailyInventory(); } catch(e){}
}

function adminLogin() {
    if(isAdmin) { 
        isAdmin = false; 
        alert("관리자 모드가 해제되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden'));
        let pnl = document.getElementById('admin-finance-panel'); 
        if(pnl) pnl.classList.add('hidden');
        showView('dashboard'); 
        return; 
    }
    
    let modal = document.getElementById('admin-pw-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        let pwInput = document.getElementById('admin-pw-input');
        if(pwInput) { pwInput.value = ''; pwInput.focus(); }
    } else {
        const pw = prompt("관리자 비밀번호를 입력하세요:"); 
        if(pw === "123456789*") grantAdmin(); 
        else if (pw !== null) alert("비밀번호가 틀렸습니다.");
    }
}

function closeAdminModal() {
    let modal = document.getElementById('admin-pw-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function submitAdminPassword() {
    let pwInput = document.getElementById('admin-pw-input');
    if(pwInput && pwInput.value === "123456789*") {
        grantAdmin();
        closeAdminModal();
    } else {
        alert("비밀번호가 틀렸습니다.");
    }
}

function grantAdmin() {
    isAdmin = true; 
    alert("관리자 권한이 활성화되었습니다."); 
    document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden'));
    load(); 
}

// ==========================================
// 🛠️ [긴급 수리] 선택된 메뉴만 색깔 진하게 켜기 (showView 함수 업데이트)
// ==========================================
function showView(viewName) {
    movingItem = null;
    
    // 1단계: 모든 화면 콘텐츠 숨기기
    ['view-dashboard', 'view-order', 'view-products', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
        let el = document.getElementById(id); 
        if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    
    // 2단계: 우측 패널 제어
    let rs = document.getElementById('right-sidebar');
    if(viewName === 'order' && currentOrderTab === 'inventory') { 
        if(isRightPanelVisible && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } 
    } else { 
        if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); } 
    }
    
    // 3단계: Target 화면 콘텐츠 켜기
    let targetView = document.getElementById('view-' + viewName);
    if(targetView) { targetView.classList.remove('hidden'); targetView.classList.add('flex'); }

    // 4단계: [이게 핵심!] 왼쪽 메뉴바의 모든 버튼에서 'Active 색깔(하얗고 진한)' 끄기
    const normalClasses = "flex items-center gap-3.5 px-4 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition";
    const activeClasses = "flex items-center gap-3.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-slate-800 shadow-md";
    
    // 모든 메뉴 버튼 탐색
    document.querySelectorAll('#sidebar-menu a').forEach(btn => {
        if(btn.id !== 'admin-mode-toggle' && btn.id !== 'site-logo-btn') {
            btn.className = normalClasses; // 일단 모두 흐리게 초기화
        }
    });

    // 5단계: 내가 지금 클릭한 메뉴(viewName)에 해당하는 버튼만 'Active 색깔'로 켜기
    const btnMap = {
        'dashboard': 'menu-btn-dashboard',
        'order': 'menu-btn-order',
        'products': 'menu-btn-products',
        'production': 'menu-btn-production',
        'outbound': 'menu-btn-outbound',
        'accounting': 'menu-btn-accounting'
    };
    
    let activeBtnId = btnMap[viewName];
    if(activeBtnId) {
        let activeBtn = document.getElementById(activeBtnId);
        if(activeBtn) activeBtn.className = activeClasses; // 지금 보고 있는 것만 하얗게!
    }

    // 6단계: 화면별 추가 로딩 로직
    if(viewName === 'products') { if(typeof renderProductMaster === 'function') { renderProductMaster('finished'); switchProductTab('fp'); } } 
    else if(viewName === 'order') { if(typeof switchOrderTab === 'function') switchOrderTab(currentOrderTab); } 
    else if(viewName === 'dashboard') updateDashboard(); 
    else if(viewName === 'accounting') { 
        if(!isAdmin) { alert("관리자 권한이 필요합니다."); showView('dashboard'); return; }
        if(typeof renderAccounting === 'function') renderAccounting(); 
    } 
    else if(viewName === 'outbound') { if(typeof renderOutboundUI === 'function') renderOutboundUI(); } 
}
// ==========================================

function updateDashboard() {
    try {
        if (!document.getElementById('dash-room-percent')) return;
        let roomOcc = 0, coldOcc = 0, floorOcc = 0;
        globalOccupancy.forEach(item => {
            if (!item || !item.location_id) return;
            if (item.location_id.startsWith('R-')) roomOcc++;
            else if (item.location_id.startsWith('C-')) coldOcc++;
            else if (item.location_id.startsWith('FL-')) floorOcc++;
        });

        let roomTotal = 0; layoutRoom.forEach(c => { if(!c.gap && !c.aisle) roomTotal += c.cols * 2; }); roomTotal += 20; 
        let coldTotal = 0; layoutCold.forEach(c => { if(!c.gap && !c.aisle) coldTotal += c.cols * 2; }); coldTotal += 16; 
        let floorTotal = 0; ['FL-1F-R', 'FL-1F-M', 'FL-1F-P', 'FL-2F-M', 'FL-2F-P', 'FL-3F-G'].forEach(area => { floorTotal += parseInt(localStorage.getItem(area + '_cols')) || 10; });

        let roomPct = Math.round((roomOcc / roomTotal) * 100) || 0;
        let coldPct = Math.round((coldOcc / coldTotal) * 100) || 0;
        let floorPct = Math.round((floorOcc / floorTotal) * 100) || 0;

        document.getElementById('dash-room-percent').innerText = roomPct + '%';
        document.getElementById('dash-room-donut').style.background = `conic-gradient(#f97316 ${roomPct}%, #e2e8f0 0%)`;
        let drTotal = document.getElementById('dash-room-total'); if(drTotal) drTotal.innerText = roomTotal;
        let drOcc = document.getElementById('dash-room-occ'); if(drOcc) drOcc.innerText = roomOcc;
        let drEmp = document.getElementById('dash-room-empty'); if(drEmp) drEmp.innerText = Math.max(0, roomTotal - roomOcc);

        document.getElementById('dash-cold-percent').innerText = coldPct + '%';
        document.getElementById('dash-cold-donut').style.background = `conic-gradient(#6366f1 ${coldPct}%, #e2e8f0 0%)`;
        let dcTotal = document.getElementById('dash-cold-total'); if(dcTotal) dcTotal.innerText = coldTotal;
        let dcOcc = document.getElementById('dash-cold-occ'); if(dcOcc) dcOcc.innerText = coldOcc;
        let dcEmp = document.getElementById('dash-cold-empty'); if(dcEmp) dcEmp.innerText = Math.max(0, coldTotal - coldOcc);

        document.getElementById('dash-floor-percent').innerText = floorPct + '%';
        document.getElementById('dash-floor-donut').style.background = `conic-gradient(#10b981 ${floorPct}%, #e2e8f0 0%)`;
        let dfTotal = document.getElementById('dash-floor-total'); if(dfTotal) dfTotal.innerText = floorTotal;
        let dfOcc = document.getElementById('dash-floor-occ'); if(dfOcc) dfOcc.innerText = floorOcc;
        let dfEmp = document.getElementById('dash-floor-empty'); if(dfEmp) dfEmp.innerText = Math.max(0, floorTotal - floorOcc);

        if(isAdmin) {
            let pnl = document.getElementById('admin-finance-panel'); if(pnl) pnl.classList.remove('hidden');
            let totalAssetValue = 0;
            globalOccupancy.forEach(item => {
                let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
                totalAssetValue += (item.quantity * (pInfo ? (pInfo.unit_price || 0) : 0));
            });
            let dt = document.getElementById('dash-val-total'); if(dt) dt.innerText = totalAssetValue.toLocaleString() + ' 원';
        } else {
            let pnl = document.getElementById('admin-finance-panel'); if(pnl) pnl.classList.add('hidden');
        }
    } catch (e) { console.error(e); }
}

function getAllLocationIds() {
    let ids = [];
    for(let i=1; i<=30; i++) ids.push(`W-${i.toString().padStart(2, '0')}`);
    layoutRoom.forEach(col => { if(!col.aisle && !col.gap) { for(let r=1; r<=col.cols; r++) { let base = `R-${col.id}-${r.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); } } });
    for(let c=1; c<=10; c++) { let base = `R-K-${c.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); }
    layoutCold.forEach(col => { if(!col.aisle && !col.gap) { for(let r=1; r<=col.cols; r++) { let base = `C-${col.id}-${r.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); } } });
    for(let c=1; c<=8; c++) { let base = `C-I-${c.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); }
    ['FL-1F-R', 'FL-1F-M', 'FL-1F-P', 'FL-2F-M', 'FL-2F-P', 'FL-3F-G'].forEach(area => { let cols = parseInt(localStorage.getItem(area + '_cols')) || 10; for(let r=1; r<=cols; r++) ids.push(`${area}-${r.toString().padStart(2, '0')}`); });
    return ids;
}

function exportPhysicalCountExcel() {
    try {
        const allLocs = getAllLocationIds();
        const occMap = {};
        globalOccupancy.forEach(item => { if(!occMap[item.location_id]) occMap[item.location_id] = []; occMap[item.location_id].push(item); });
        
        let wsData = allLocs.map(locId => {
            const items = occMap[locId];
            if (items && items.length > 0) {
                return items.map(item => ({ "위치": locId, "카테고리": item.category || "", "품목명": item.item_name || "", "입고처": item.remarks || "기본입고처", "전산수량(EA)": item.quantity, "실사수량(EA)": "", "차이": "", "비고": "" }));
            }
            return { "위치": locId, "카테고리": "-", "품목명": "[비어있음]", "입고처": "-", "전산수량(EA)": 0, "실사수량(EA)": "", "차이": "", "비고": "" };
        }).flat();

        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData);
        ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 10},[2026/04/30 09:23:45]

조(Jo)님, 네! 말씀하신 문제 완벽하게 해결했습니다. 올려주신 사진 보니까 진짜 대시보드만 하얗게 켜져 있고 다른 건 흐려서 오해하기 딱 좋았네요.

방금 `js_global.js`의 `showView` 함수에 **왼쪽 메뉴바 색깔 스위치(Active Class)** 로직을 완벽하게 추가해서 Vercel에 배포해 두었습니다. 이제 재고실사나 다른 메뉴를 클릭하시면, **지금 조님이 보고 계신 그 메뉴만 하얗고 진하게 색깔이 들어오고 나머지는 흐려질 것입니다.**

현재 완벽하게 동작 중인 실사 동기화 기능 등은 절대 건드리지 않았으니 안심하시고 새로고침(F5) 하신 뒤 메뉴를 마구 클릭해 주십시오!
