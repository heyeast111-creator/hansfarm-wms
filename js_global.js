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

// 💡 렉맵 렌더링의 핵심 뼈대 (J-A 역순 유지)
const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];

// ==========================================
// 초기 로딩 (보안 에러 원천 차단 - 100% 안전한 로딩)
// ==========================================
function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') { loginMode = 'viewer'; alert("뷰어 모드로 접속되었습니다."); } 
    else if (pw === '11111') { loginMode = 'editor'; alert("일반 사용자 모드로 접속되었습니다."); } 
    else { alert("비밀번호가 틀렸습니다."); return; }
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');
    load(); 
    showView('dashboard');
}

async function load() {
    try {
        const ts = new Date().getTime(); 
        
        // 🚨 [핵심 수정] 에러를 유발하던 외부 직통 링크 삭제! 파이썬 서버 API만 사용하여 튕김 원천 차단
        const [occRes, prodRes, fpRes, bomRes, histRes] = await Promise.all([ 
            fetch('/api/inventory?t=' + ts), 
            fetch('/api/products?t=' + ts), 
            fetch('/api/finished_products?t=' + ts), 
            fetch('/api/bom?t=' + ts),
            fetch('/api/history?t=' + ts) // <- 파이썬 정식 API로 변경!
        ]);
        
        let occData = await occRes.json(); globalOccupancy = Array.isArray(occData) ? occData : [];
        let prodData = await prodRes.json(); productMaster = Array.isArray(prodData) ? prodData : [];
        let fpData = await fpRes.json(); finishedProductMaster = Array.isArray(fpData) ? fpData : [];
        let bData = await bomRes.json(); bomMaster = Array.isArray(bData) ? bData : [];
        let histData = await histRes.json(); globalHistory = Array.isArray(histData) ? histData : [];
        
        renderAll(); 
    } catch (e) { 
        console.error("데이터 로드 실패:", e); 
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
    if(isAdmin) { isAdmin = false; alert("관리자 모드가 해제되었습니다."); updateDashboard(); return; }
    const pw = prompt("관리자 비밀번호를 입력하세요:"); 
    if(pw === "123456789*") { isAdmin = true; alert("관리자 권한이 활성화되었습니다."); load(); } 
    else if (pw !== null) { alert("비밀번호가 틀렸습니다."); }
}

function showView(viewName) {
    movingItem = null;
    ['view-dashboard', 'view-order', 'view-products', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
        let el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    
    let rs = document.getElementById('right-sidebar');
    if(viewName === 'order' && currentOrderTab === 'inventory') { if(isRightPanelVisible && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } } 
    else { if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); } }
    
    let targetView = document.getElementById('view-' + viewName);
    if(targetView) { targetView.classList.remove('hidden'); targetView.classList.add('flex'); }

    if(viewName === 'products') { if(typeof renderProductMaster === 'function') { renderProductMaster('finished'); switchProductTab('fp'); } } 
    else if(viewName === 'order') { if(typeof switchOrderTab === 'function') switchOrderTab(currentOrderTab); } 
    else if(viewName === 'dashboard') updateDashboard(); 
    else if(viewName === 'accounting') { if(typeof renderAccounting === 'function') renderAccounting(); } 
    else if(viewName === 'outbound') { if(typeof renderOutboundUI === 'function') renderOutboundUI(); } 
}

// ==========================================
// 대시보드 및 데이터 엑셀 출력 (유지)
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
        }
    } catch (e) { console.error("대시보드 에러:", e); }
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
        ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 20}];
        XLSX.utils.book_append_sheet(wb, ws, "재고실사양식(전체)"); 
        XLSX.writeFile(wb, `한스팜_전체렉실사양식_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) { alert("엑셀 추출 오류가 발생했습니다."); }
}

function exportAllHistoryExcel() {
    try {
        if(globalHistory.length === 0) return alert("데이터가 없습니다.");
        let sorted = [...globalHistory].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        let wsData = sorted.map(h => ({ "일시": new Date(h.created_at).toLocaleString(), "위치": h.location_id, "작업": h.action_type, "카테고리": h.category, "품목명": h.item_name, "수량(EA)": h.quantity, "비고": h.remarks }));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "히스토리"); 
        XLSX.writeFile(wb, `한스팜_히스토리_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch(e) { alert("오류 발생"); }
}

function showHistoryModal(locId) {
    let locHistory = globalHistory.filter(h => h.location_id === locId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);
    let titleEl = document.getElementById('history-modal-title'); if(titleEl) titleEl.innerText = `${locId} 전체 기록`;
    let html = '';
    locHistory.forEach(h => {
        let actionColor = h.action_type === '입고' ? 'text-emerald-600' : (h.action_type === '출고' ? 'text-rose-600' : 'text-blue-600'); 
        html += `<div class="bg-slate-50 p-3 border rounded shadow-sm text-xs"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${new Date(h.created_at).toLocaleString()}</span><br><span class="font-bold text-slate-700 block mt-1">${h.item_name} (${h.quantity}EA)</span></div>`;
    });
    let contentEl = document.getElementById('history-modal-content'); if(contentEl) contentEl.innerHTML = html || '<div class="text-center text-slate-400">기록 없음</div>';
    let modalEl = document.getElementById('history-modal'); if(modalEl) { modalEl.classList.remove('hidden'); modalEl.classList.add('flex'); }
}

function closeHistoryModal() { let modalEl = document.getElementById('history-modal'); if(modalEl) { modalEl.classList.add('hidden'); modalEl.classList.remove('flex'); } }
function toggleRightPanel() { let rs = document.getElementById('right-sidebar'); if(!rs) return; isRightPanelVisible = !isRightPanelVisible; if(isRightPanelVisible) { rs.classList.remove('hidden'); rs.classList.add('flex'); } else { rs.classList.add('hidden'); rs.classList.remove('flex'); } }
function closeInfoPanel() { let rs = document.getElementById('right-sidebar'); if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); isRightPanelVisible = false; } selectedCellId = null; movingItem = null; renderMap(); }
