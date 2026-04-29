// ==========================================
// 전역 변수 (Global Variables)
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
let orderCart = []; 
let movingItem = null;
let isRightPanelVisible = false; 

const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];

// ==========================================
// 초기 로딩 (가장 확실한 로딩 로직 복구)
// ==========================================
function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') loginMode = 'viewer';
    else if (pw === '11111') loginMode = 'editor';
    else { alert("비밀번호 틀림"); return; }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');
    load(); showView('dashboard');
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
            fetch(`${SUPABASE_URL}/rest/v1/history_log?select=*&order=created_at.desc&limit=5000`, { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } })
        ]);
        
        globalOccupancy = await occRes.json() || [];
        productMaster = await prodRes.json() || [];
        finishedProductMaster = await fpRes.json() || [];
        bomMaster = await bomRes.json() || [];
        globalHistory = await histRes.json() || [];
        
        renderAll(); 
    } catch (e) { console.error("데이터 로드 실패:", e); }
}

function renderAll() {
    try { if(typeof renderMap === 'function') renderMap(); if(selectedCellId && typeof clickCell === 'function') clickCell(selectedCellId); } catch(e){}
    try { updateDashboard(); } catch(e){}
    try { if(typeof updateSummarySupplierDropdown === 'function') updateSummarySupplierDropdown(); } catch(e){}
    try { if(typeof renderSafetyStock === 'function') renderSafetyStock(); } catch(e){}
    try { if(typeof renderAccounting === 'function') renderAccounting(); } catch(e){} 
    try { if(typeof populateWaitDropdowns === 'function') populateWaitDropdowns(); } catch(e){}
}

function adminLogin() {
    if(isAdmin) { isAdmin = false; alert("관리자 해제"); return; }
    const pw = prompt("관리자 비번:"); 
    if(pw === "123456789*") { isAdmin = true; alert("관리자 활성화"); load(); } 
}

function showView(viewName) {
    movingItem = null;
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
        if (!document.getElementById('dash-room-percent')) return;
        let roomOcc = 0, coldOcc = 0, floorOcc = 0;
        globalOccupancy.forEach(item => {
            if (!item || !item.location_id) return;
            if (item.location_id.startsWith('R-')) roomOcc++;
            else if (item.location_id.startsWith('C-')) coldOcc++;
            else if (item.location_id.startsWith('FL-')) floorOcc++;
        });

        let roomTotal = 170, coldTotal = 116, floorTotal = 60;
        let roomPct = Math.round((roomOcc / roomTotal) * 100) || 0;
        let coldPct = Math.round((coldOcc / coldTotal) * 100) || 0;
        let floorPct = Math.round((floorOcc / floorTotal) * 100) || 0;

        document.getElementById('dash-room-percent').innerText = roomPct + '%';
        document.getElementById('dash-room-donut').style.background = `conic-gradient(#f97316 ${roomPct}%, #e2e8f0 0%)`;
        document.getElementById('dash-room-total').innerText = roomTotal;
        document.getElementById('dash-room-occ').innerText = roomOcc;
        document.getElementById('dash-room-empty').innerText = (roomTotal - roomOcc);

        document.getElementById('dash-cold-percent').innerText = coldPct + '%';
        document.getElementById('dash-cold-donut').style.background = `conic-gradient(#6366f1 ${coldPct}%, #e2e8f0 0%)`;
        document.getElementById('dash-cold-total').innerText = coldTotal;
        document.getElementById('dash-cold-occ').innerText = coldOcc;
        document.getElementById('dash-cold-empty').innerText = (coldTotal - coldOcc);

        document.getElementById('dash-floor-percent').innerText = floorPct + '%';
        document.getElementById('dash-floor-donut').style.background = `conic-gradient(#10b981 ${floorPct}%, #e2e8f0 0%)`;
        document.getElementById('dash-floor-total').innerText = floorTotal;
        document.getElementById('dash-floor-occ').innerText = floorOcc;
        document.getElementById('dash-floor-empty').innerText = (floorTotal - floorOcc);

        if(isAdmin) {
            let totalAssetValue = 0;
            globalOccupancy.forEach(item => {
                let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
                totalAssetValue += (item.quantity * (pInfo ? (pInfo.unit_price || 0) : 0));
            });
            let dt = document.getElementById('dash-val-total'); if(dt) dt.innerText = totalAssetValue.toLocaleString() + ' 원';
        }
    } catch (e) { console.error(e); }
}

function exportPhysicalCountExcel() {
    try {
        let ids = [];
        for(let i=1; i<=30; i++) ids.push(`W-${i.toString().padStart(2, '0')}`);
        layoutRoom.forEach(col => { if(!col.aisle && !col.gap) { for(let r=1; r<=col.cols; r++) { let base = `R-${col.id}-${r.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); } } });
        for(let c=1; c<=10; c++) { let base = `R-K-${c.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); }
        layoutCold.forEach(col => { if(!col.aisle && !col.gap) { for(let r=1; r<=col.cols; r++) { let base = `C-${col.id}-${r.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); } } });
        for(let c=1; c<=8; c++) { let base = `C-I-${c.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); }

        const occMap = {}; globalOccupancy.forEach(item => { if(!occMap[item.location_id]) occMap[item.location_id] = []; occMap[item.location_id].push(item); });
        let wsData = ids.map(locId => {
            const items = occMap[locId];
            if (items && items.length > 0) { return items.map(item => ({ "위치": locId, "카테고리": item.category, "품목명": item.item_name, "전산수량(EA)": item.quantity, "실사수량(EA)": "" })); }
            return { "위치": locId, "품목명": "[비어있음]", "전산수량(EA)": 0, "실사수량(EA)": "" };
        }).flat();
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "실사양식");
        XLSX.writeFile(wb, `재고실사_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) { alert("오류"); }
}

function exportAllHistoryExcel() {
    try {
        let wsData = globalHistory.map(h => ({ "일시": new Date(h.created_at).toLocaleString(), "위치": h.location_id, "작업": h.action_type, "품목명": h.item_name, "수량": h.quantity }));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "히스토리"); 
        XLSX.writeFile(wb, `히스토리_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch(e) { alert("오류"); }
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
