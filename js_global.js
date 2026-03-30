// ==========================================
// 공용 전역 변수 (모든 파일에서 공유됨)
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

// ==========================================
// 시스템 로딩 및 로그인
// ==========================================
function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') {
        loginMode = 'viewer';
        alert("뷰어 모드로 접속되었습니다.\n(모든 기능을 '보기'만 가능합니다)");
    } else if (pw === '00700') {
        loginMode = 'editor';
        alert("일반 사용자 모드로 접속되었습니다.");
    } else {
        alert("비밀번호가 틀렸습니다.");
        return;
    }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');
    load(); 
    showView('dashboard');
}

async function load() {
    try {
        const ts = new Date().getTime(); 
        const [occRes, prodRes, fpRes, histRes, bomRes] = await Promise.all([ 
            fetch('/api/inventory?t=' + ts), fetch('/api/products?t=' + ts), fetch('/api/finished_products?t=' + ts), fetch('/api/history?t=' + ts), fetch('/api/bom?t=' + ts) 
        ]);
        let occData = await occRes.json(); globalOccupancy = Array.isArray(occData) ? occData : [];
        let prodData = await prodRes.json(); productMaster = Array.isArray(prodData) ? prodData : [];
        let fpData = await fpRes.json(); finishedProductMaster = Array.isArray(fpData) ? fpData : [];
        let histData = await histRes.json(); globalHistory = Array.isArray(histData) ? histData : [];
        let bData = await bomRes.json(); bomMaster = Array.isArray(bData) ? bData : [];
        
        let t = new Date(); let yyyy = t.getFullYear(); let mm = String(t.getMonth() + 1).padStart(2, '0'); let dd = String(t.getDate()).padStart(2, '0');
        if(!document.getElementById('acc-date').value) document.getElementById('acc-date').value = `${yyyy}-${mm}-${dd}`;
        if(!document.getElementById('acc-period-start').value) document.getElementById('acc-period-start').value = `${yyyy}-${mm}-01`; 
        if(!document.getElementById('acc-period-end').value) document.getElementById('acc-period-end').value = `${yyyy}-${mm}-${dd}`; 
        if(!document.getElementById('acc-month').value) document.getElementById('acc-month').value = `${yyyy}-${mm}`;

        if(!isAdmin) {
            document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden'));
            let fp = document.getElementById('admin-finance-panel');
            if(fp) fp.classList.add('hidden');
        }
        renderAll(); 
    } catch (e) { console.error("로딩 에러:", e); }
}

function renderAll() {
    try { renderMap(); if(selectedCellId) clickCell(selectedCellId); } catch(e){}
    try { updateDashboard(); } catch(e){}
    try { updateMapSearchCategoryDropdown(); } catch(e){}
    try { updateSummarySupplierDropdown(); } catch(e){}
    try { renderSafetyStock(); } catch(e){}
    try { updateAccFilters('type'); } catch(e){}
    try { populateProductFilters('finished'); renderProductMaster('finished'); } catch(e){}
    try { populateProductFilters('materials'); renderProductMaster('materials'); } catch(e){}
    try { updateBomDropdowns(); renderBomMaster(); } catch(e){}
    try { updateOrderCartDropdowns(); renderOrderList(); renderOrderCart(); } catch(e){}
    try { populateWaitDropdowns(); } catch(e){}
}

function adminLogin() {
    let fp = document.getElementById('admin-finance-panel');
    if(isAdmin) { 
        isAdmin = false; alert("관리자 모드가 해제되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden')); 
        if(fp) fp.classList.add('hidden');
        let viewAcc = document.getElementById('view-accounting');
        if(viewAcc && !viewAcc.classList.contains('hidden')) showView('dashboard'); 
        return; 
    }
    const pw = prompt("관리자 비밀번호를 입력하세요:"); 
    if(pw === "123456789*") { 
        isAdmin = true; alert("관리자 권한이 활성화되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden')); 
        if(fp) fp.classList.remove('hidden');
    } else if (pw !== null) { alert("비밀번호가 틀렸습니다."); }
}

// ==========================================
// 뷰(화면) 전환 로직
// ==========================================
function showView(viewName) {
    movingItem = null;
    ['view-dashboard', 'view-order', 'view-products', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
        let el = document.getElementById(id);
        if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    
    let rs = document.getElementById('right-sidebar');
    if(viewName === 'order' && currentOrderTab === 'inventory') { 
        if(isRightPanelVisible && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } 
    } else {
        if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
    }
    
    let targetView = document.getElementById('view-' + viewName);
    if(targetView) { targetView.classList.remove('hidden'); targetView.classList.add('flex'); }

    document.querySelectorAll('.nav-btn-pc').forEach(btn => {
        btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'bg-rose-50', 'border-rose-200', 'text-rose-600', 'bg-yellow-50', 'border-yellow-300', 'text-yellow-700', 'shadow-inner');
    });
    document.querySelectorAll('.nav-btn-pc.target-' + viewName).forEach(btn => {
        if(viewName === 'accounting') btn.classList.add('bg-yellow-50', 'border-yellow-300', 'text-yellow-700', 'shadow-inner');
        else btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner');
    });

    document.querySelectorAll('.nav-btn-mo').forEach(btn => {
        if(btn.id !== 'admin-btn-mo') {
            btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner');
            btn.classList.add('bg-white');
        }
    });
    document.querySelectorAll('.nav-btn-mo.target-' + viewName).forEach(btn => {
        btn.classList.remove('bg-white');
        btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner');
    });
    
    if(viewName === 'products') { 
        populateProductFilters('finished'); populateProductFilters('materials');
        renderProductMaster('finished'); switchProductTab('fp'); 
    } 
    else if(viewName === 'order') { switchOrderTab(currentOrderTab); } 
    else if(viewName === 'dashboard') updateDashboard(); 
    else if(viewName === 'accounting') updateAccFilters('type'); 
}

function toggleRightPanel() {
    let rs = document.getElementById('right-sidebar');
    if(!rs) return;
    isRightPanelVisible = !isRightPanelVisible;
    if(isRightPanelVisible) {
        rs.classList.remove('hidden'); rs.classList.add('flex');
    } else {
        rs.classList.add('hidden'); rs.classList.remove('flex');
    }
}

function clearInfo() {
    const panel = document.getElementById('info-panel');
    if(panel) panel.innerHTML = `<div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div>`;
}

function closeInfoPanel() { 
    let rs = document.getElementById('right-sidebar');
    if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); isRightPanelVisible = false; }
    selectedCellId = null; movingItem = null; renderMap(); 
}

// 초기 로드 실행
window.onload = function() { document.getElementById('login-screen').style.display = 'flex'; };
