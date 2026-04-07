// ==========================================
// 전역 변수 (오직 이 파일에서만 단 한 번 선언)
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

// ==========================================
// 시스템 로딩 및 로그인
// ==========================================
function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') {
        loginMode = 'viewer';
        alert("뷰어 모드로 접속되었습니다.\n(모든 기능을 '보기'만 가능합니다)");
    } else if (pw === '11111') {
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
    try { if(typeof renderAccounting === 'function') renderAccounting(); } catch(e){} // 💡 날짜 튕김 버그(updateAccFilters) 삭제!
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
    let modal = document.getElementById('admin-pw-modal');
    let input = document.getElementById('admin-pw-input');
    if(modal && input) {
        input.value = '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => input.focus(), 100); 
    } else {
        const pw = prompt("관리자 비밀번호를 입력하세요:"); 
        if(pw === "123456789*") { 
            isAdmin = true; alert("관리자 권한이 활성화되었습니다."); 
            document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden')); 
            if(fp) fp.classList.remove('hidden');
        } else if (pw !== null) { alert("비밀번호가 틀렸습니다."); }
    }
}

function closeAdminModal() {
    let modal = document.getElementById('admin-pw-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function submitAdminPassword() {
    let input = document.getElementById('admin-pw-input');
    if(!input) return;
    let pw = input.value;
    let fp = document.getElementById('admin-finance-panel');
    
    if(pw === "123456789*") { 
        isAdmin = true; 
        alert("관리자 권한이 활성화되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden')); 
        if(fp) fp.classList.remove('hidden');
        closeAdminModal();
        load();
    } else { 
        alert("비밀번호가 틀렸습니다."); 
        input.value = '';
        input.focus();
    }
}

// ==========================================
// 공통 UI / 헬퍼 기능
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
    else if(viewName === 'accounting') { if(typeof renderAccounting === 'function') renderAccounting(); } // 💡 날짜 초기화 방지
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

function getDynamicPalletCount(itemObj) {
    if(!itemObj) return 0;
    let itemName = itemObj.item_name || ""; let supplier = itemObj.remarks || "기본입고처"; let quantity = itemObj.quantity || 0;
    let targetSup = String(supplier).trim();
    let pInfo = finishedProductMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim() && String(p.supplier||"").trim() === targetSup) || productMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim() && String(p.supplier||"").trim() === targetSup) || finishedProductMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim()) || productMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim());
    if (pInfo && pInfo.pallet_ea > 0) return quantity / pInfo.pallet_ea;
    return itemObj.pallet_count || 1;
}

function showHistoryModal(locId) {
    let locHistory = globalHistory.filter(h => h.location_id === locId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    let titleEl = document.getElementById('history-modal-title');
    if(titleEl) titleEl.innerText = `${locId} 전체 기록`;
    let html = '';
    locHistory.forEach(h => {
        let actionColor = h.action_type === '입고' ? 'text-emerald-600' : (h.action_type === '출고' ? 'text-rose-600' : (h.action_type.includes('삭제') ? 'text-slate-400 line-through' : 'text-blue-600')); 
        let dateStr = h.production_date ? h.production_date : new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); 
        html += `<div class="bg-slate-50 p-3 border border-slate-200 rounded text-[11px] md:text-xs shadow-sm"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${dateStr}</span><br><span class="font-bold text-slate-700 mt-1 block">${h.item_name} <span class="text-slate-400">(${h.quantity}EA / ${h.pallet_count ? h.pallet_count.toFixed(1) : 1}P)</span></span></div>`;
    });
    let contentEl = document.getElementById('history-modal-content');
    if(contentEl) contentEl.innerHTML = html;
    let modalEl = document.getElementById('history-modal');
    if(modalEl) { modalEl.classList.remove('hidden'); modalEl.classList.add('flex'); }
}

function closeHistoryModal() {
    let modalEl = document.getElementById('history-modal');
    if(modalEl) { modalEl.classList.add('hidden'); modalEl.classList.remove('flex'); }
}

function exportPhysicalCountExcel() {
    try {
        let wsData = [];
        if (globalOccupancy.length === 0) { wsData = [{"위치": "", "카테고리": "", "품목명": "", "입고처": "", "전산수량(EA)": "", "실사수량(EA)": "", "차이": "", "비고": ""}]; } 
        else {
            let sortedData = [...globalOccupancy].sort((a, b) => a.location_id.localeCompare(b.location_id));
            wsData = sortedData.map(item => ({ "위치": item.location_id, "카테고리": item.category || "", "품목명": item.item_name || "", "입고처": item.remarks || "기본입고처", "전산수량(EA)": item.quantity, "실사수량(EA)": "", "차이": "", "비고": "" }));
        }
        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData);
        ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 20}];
        XLSX.utils.book_append_sheet(wb, ws, "재고실사양식");
        let today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `한스팜_재고실사양식_${today}.xlsx`);
    } catch (error) { alert("양식 다운로드 중 오류가 발생했습니다."); }
}

function exportAllHistoryExcel() {
    try {
        if (globalHistory.length === 0) return alert("출력할 히스토리 데이터가 없습니다.");
        let sorted = [...globalHistory].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        let wsData = sorted.map(h => {
            let dateStr = new Date(h.created_at).toLocaleString('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'});
            return { "처리 일시": dateStr, "입고일/산란일": h.production_date || "", "렉 위치": h.location_id || "", "작업 구분": h.action_type || "", "카테고리": h.category || "", "품목명": h.item_name || "", "수량(EA)": h.quantity || 0, "파레트(P)": h.pallet_count || 0, "비고/입고처": h.remarks || "" };
        });
        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); 
        ws['!cols'] = [{wch: 22}, {wch: 15}, {wch: 15}, {wch: 12}, {wch: 15}, {wch: 25}, {wch: 10}, {wch: 10}, {wch: 20}]; 
        XLSX.utils.book_append_sheet(wb, ws, "전체렉히스토리"); 
        let today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `한스팜_전체렉히스토리_${today}.xlsx`);
    } catch(e) { alert("엑셀 다운로드 중 오류가 발생했습니다."); }
}

window.onload = function() { 
    let loginScreen = document.getElementById('login-screen');
    if(loginScreen) loginScreen.style.display = 'flex'; 
};

// ==========================================
// 대시보드 로직 
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

        let roomTotal = 0;
        if(typeof layoutRoom !== 'undefined') {
            layoutRoom.forEach(c => { if(!c.gap && !c.aisle) roomTotal += c.cols * 2; }); 
            roomTotal += 20; 
        } else { roomTotal = 150; }

        let coldTotal = 0;
        if(typeof layoutCold !== 'undefined') {
            layoutCold.forEach(c => { if(!c.gap && !c.aisle) coldTotal += c.cols * 2; });
            coldTotal += 16; 
        } else { coldTotal = 100; }

        let floorTotal = 0;
        ['FL-1F-R', 'FL-1F-M', 'FL-1F-P', 'FL-2F-M', 'FL-2F-P', 'FL-3F-G'].forEach(area => {
            floorTotal += parseInt(localStorage.getItem(area + '_cols')) || 10;
        });

        let roomPct = roomTotal > 0 ? Math.min(100, Math.round((roomOcc / roomTotal) * 100)) : 0;
        let coldPct = coldTotal > 0 ? Math.min(100, Math.round((coldOcc / coldTotal) * 100)) : 0;
        let floorPct = floorTotal > 0 ? Math.min(100, Math.round((floorOcc / floorTotal) * 100)) : 0;

        document.getElementById('dash-room-percent').innerText = roomPct + '%';
        document.getElementById('dash-room-total').innerText = roomTotal.toLocaleString() + ' 렉';
        document.getElementById('dash-room-occ').innerText = roomOcc.toLocaleString() + ' 렉';
        document.getElementById('dash-room-empty').innerText = Math.max(0, roomTotal - roomOcc).toLocaleString() + ' 렉';
        document.getElementById('dash-room-donut').style.background = `conic-gradient(#f97316 ${roomPct}%, #e2e8f0 0%)`;

        document.getElementById('dash-cold-percent').innerText = coldPct + '%';
        document.getElementById('dash-cold-total').innerText = coldTotal.toLocaleString() + ' 렉';
        document.getElementById('dash-cold-occ').innerText = coldOcc.toLocaleString() + ' 렉';
        document.getElementById('dash-cold-empty').innerText = Math.max(0, coldTotal - coldOcc).toLocaleString() + ' 렉';
        document.getElementById('dash-cold-donut').style.background = `conic-gradient(#6366f1 ${coldPct}%, #e2e8f0 0%)`;

        document.getElementById('dash-floor-percent').innerText = floorPct + '%';
        document.getElementById('dash-floor-total').innerText = floorTotal.toLocaleString() + ' 렉';
        document.getElementById('dash-floor-occ').innerText = floorOcc.toLocaleString() + ' 렉';
        document.getElementById('dash-floor-empty').innerText = Math.max(0, floorTotal - floorOcc).toLocaleString() + ' 렉';
        document.getElementById('dash-floor-donut').style.background = `conic-gradient(#10b981 ${floorPct}%, #e2e8f0 0%)`;

        if(isAdmin) {
            let pnl = document.getElementById('admin-finance-panel');
            if(pnl) pnl.classList.remove('hidden');
            let roomVal = 0, coldVal = 0, floorVal = 0;
            
            globalOccupancy.forEach(item => {
                let price = 0;
                let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
                price = pInfo ? (pInfo.unit_price || 0) : 0;
                let val = item.quantity * price;

                if (item.location_id.startsWith('R-')) roomVal += val;
                else if (item.location_id.startsWith('C-')) coldVal += val;
                else if (item.location_id.startsWith('FL-')) floorVal += val;
            });

            let dr = document.getElementById('dash-val-room'); if(dr) dr.innerText = roomVal.toLocaleString() + ' 원';
            let dc = document.getElementById('dash-val-cold'); if(dc) dc.innerText = coldVal.toLocaleString() + ' 원';
            let df = document.getElementById('dash-val-floor'); if(df) df.innerText = floorVal.toLocaleString() + ' 원';
            let dt = document.getElementById('dash-val-total'); if(dt) dt.innerText = (roomVal + coldVal + floorVal).toLocaleString() + ' 원';

            let periodSelect = document.getElementById('dash-period');
            let period = periodSelect ? periodSelect.value : 'daily';
            let outCost = 0;
            let now = new Date();
            
            globalHistory.forEach(h => {
                if(h.action_type === '출고') {
                    let hDate = new Date(h.created_at);
                    let diffDays = (now - hDate) / (1000 * 60 * 60 * 24);
                    let include = false;

                    if(period === 'daily' && diffDays <= 1) include = true;
                    else if(period === 'weekly' && diffDays <= 7) include = true;
                    else if(period === 'monthly' && diffDays <= 30) include = true;

                    if(include) {
                        let price = 0;
                        let pInfo = finishedProductMaster.find(p => p.item_name === h.item_name) || productMaster.find(p => p.item_name === h.item_name);
                        price = pInfo ? (pInfo.unit_price || 0) : 0;
                        outCost += h.quantity * price;
                    }
                }
            });

            let dco = document.getElementById('dash-cost-out'); if(dco) dco.innerText = outCost.toLocaleString() + ' 원';
            let lbl = period === 'daily' ? '일간 기준' : (period === 'weekly' ? '주간 기준' : '월간 기준');
            let dcl = document.getElementById('dash-cost-label'); if(dcl) dcl.innerText = lbl;
        }
    } catch (error) {
        console.error("대시보드 에러 방어:", error);
    }
}
