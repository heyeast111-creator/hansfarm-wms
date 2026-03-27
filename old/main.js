let globalOccupancy = []; let productMaster = []; let finishedProductMaster = []; let globalHistory = []; let bomMaster = []; let globalSearchTargets = []; let currentZone = '실온'; let selectedCellId = null; let isAdmin = false; let loginMode = 'guest'; let currentOrderTab = 'inventory'; let editingProductOriginalName = null; let editingProductOriginalSupplier = null; let orderCart = []; let movingItem = null;
const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];
const layoutFloor = [ { id: 'FL-C', title: '❄️ 생산 현장 (원재료/냉장)', cols: 20 }, { aisle: true, text: '====================' }, { id: 'FL-R', title: '📦 생산 현장 (부자재/실온)', cols: 20 } ];

function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') { loginMode = 'viewer'; alert("👁️ 뷰어 모드로 접속되었습니다.\n(보기만 가능)"); } 
    else if (pw === '00700') { loginMode = 'editor'; alert("✅ 일반 사용자 모드로 접속되었습니다."); } 
    else { alert("❌ 비밀번호가 틀렸습니다."); return; }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden'); document.getElementById('main-app').classList.add('flex');
    load(); showView('dashboard');
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
            let fp = document.getElementById('admin-finance-panel'); if(fp) fp.classList.add('hidden');
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

function clearInfo() {
    const panel = document.getElementById('info-panel');
    if(panel) panel.innerHTML = `<div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div>`;
}

function adminLogin() {
    let fp = document.getElementById('admin-finance-panel');
    if(isAdmin) { 
        isAdmin = false; alert("🔒 관리자 모드 해제됨."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden')); 
        if(fp) fp.classList.add('hidden');
        let viewAcc = document.getElementById('view-accounting'); if(viewAcc && !viewAcc.classList.contains('hidden')) showView('dashboard'); 
        return; 
    }
    const pw = prompt("비밀번호 입력 (1234):"); 
    if(pw === "1234") { 
        isAdmin = true; alert("🔓 관리자 모드 활성화됨."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden')); 
        if(fp) fp.classList.remove('hidden');
    } else if (pw !== null) { alert("비밀번호가 틀렸습니다."); }
}

function updateZoneTabs() {
    try {
        ['tab-room', 'tab-cold', 'tab-floor'].forEach(id => {
            let el = document.getElementById(id);
            if(el) el.className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-slate-100 border-x border-t border-slate-300 text-slate-500 font-bold rounded-t-lg hover:bg-slate-200 text-sm md:text-base";
        });
        let activeEl = null;
        if(currentZone === '실온') activeEl = document.getElementById('tab-room');
        else if(currentZone === '냉장') activeEl = document.getElementById('tab-cold');
        else if(currentZone === '현장') activeEl = document.getElementById('tab-floor');

        if(activeEl) {
            if(currentZone === '실온') activeEl.className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-orange-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base";
            else if(currentZone === '냉장') activeEl.className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-indigo-600 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base";
            else if(currentZone === '현장') activeEl.className = "whitespace-nowrap px-4 md:px-8 py-2 md:py-2.5 bg-emerald-500 text-white font-bold rounded-t-lg shadow-inner text-sm md:text-base";
        }

        let fifoBtn = document.getElementById('fifo-btn-container'); let floorSel = document.getElementById('floor-select');
        if(currentZone === '현장') {
            if(fifoBtn) fifoBtn.classList.add('hidden'); if(floorSel) floorSel.classList.add('hidden');
        } else {
            if(currentZone === '냉장') { if(fifoBtn) fifoBtn.classList.remove('hidden'); } else { if(fifoBtn) fifoBtn.classList.add('hidden'); }
            if(floorSel) floorSel.classList.remove('hidden');
        }
        updateMapSearchCategoryDropdown();
    } catch(e) {}
}

function switchZone(zone) { 
    globalSearchTargets = []; currentZone = zone; selectedCellId = null; movingItem = null;
    let rs = document.getElementById('right-sidebar');
    if(window.innerWidth < 768 && rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
    updateZoneTabs(); renderMap(); populateWaitDropdowns();
}

function switchOrderTab(tab) {
    try {
        currentOrderTab = tab;
        ['inventory', 'search', 'history', 'safety'].forEach(t => {
            let btn = document.getElementById('order-tab-' + t); let view = document.getElementById('subview-' + t);
            if(btn) btn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-slate-400 hover:text-slate-600 border-b-4 border-transparent transition-colors";
            if(view) { view.classList.add('hidden'); view.classList.remove('flex'); }
        });

        let activeBtn = document.getElementById('order-tab-' + tab); let activeView = document.getElementById('subview-' + tab);
        if(activeBtn) activeBtn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-indigo-700 border-b-4 border-indigo-700 transition-colors";
        if(activeView) { activeView.classList.remove('hidden'); activeView.classList.add('flex'); }

        let rs = document.getElementById('right-sidebar');
        if(tab === 'inventory') {
            if(window.innerWidth >= 768 && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); }
            else if(rs) { if(selectedCellId) { rs.classList.remove('hidden'); rs.classList.add('flex'); } else { rs.classList.add('hidden'); rs.classList.remove('flex'); } }
            renderMap();
        } else { if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); } }

        if(tab === 'search') updateSummarySupplierDropdown();
        if(tab === 'safety') renderSafetyStock();
        if(tab === 'history') { updateOrderCartDropdowns(); renderOrderList(); }
    } catch(e) {}
}

function showView(viewName) {
    movingItem = null;
    ['view-dashboard', 'view-order', 'view-products', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
        let el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    
    let rs = document.getElementById('right-sidebar');
    if(viewName === 'order' && currentOrderTab === 'inventory') { 
        if(window.innerWidth >= 768 && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } 
        else if(rs) { if(selectedCellId) { rs.classList.remove('hidden'); rs.classList.add('flex'); } else { rs.classList.add('hidden'); rs.classList.remove('flex'); } }
    } else if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
    
    let targetView = document.getElementById('view-' + viewName);
    if(targetView) { targetView.classList.remove('hidden'); targetView.classList.add('flex'); }

    document.querySelectorAll('.nav-btn-pc').forEach(btn => { btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'bg-rose-50', 'border-rose-200', 'text-rose-600', 'bg-yellow-50', 'border-yellow-300', 'text-yellow-700', 'shadow-inner'); });
    document.querySelectorAll('.nav-btn-pc.target-' + viewName).forEach(btn => {
        if(viewName === 'accounting') btn.classList.add('bg-yellow-50', 'border-yellow-300', 'text-yellow-700', 'shadow-inner');
        else btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner');
    });

    document.querySelectorAll('.nav-btn-mo').forEach(btn => {
        if(btn.id !== 'admin-btn-mo') { btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner'); btn.classList.add('bg-white'); }
    });
    document.querySelectorAll('.nav-btn-mo.target-' + viewName).forEach(btn => { btn.classList.remove('bg-white'); btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner'); });
    
    if(viewName === 'products') { switchProductTab('fp'); } 
    else if(viewName === 'order') { switchOrderTab(currentOrderTab); } 
    else if(viewName === 'dashboard') updateDashboard(); 
    else if(viewName === 'accounting') updateAccFilters('type'); 
}

function updateDashboard() { 
    try {
        let dashPeriod = document.getElementById('dash-period'); if(!dashPeriod) return;
        const period = dashPeriod.value; let startDate = new Date(); 
        if(period === 'daily') startDate.setDate(startDate.getDate() - 1); 
        else if(period === 'weekly') startDate.setDate(startDate.getDate() - 7); 
        else if(period === 'monthly') startDate.setMonth(startDate.getMonth() - 1); 
        
        let inPallets = 0, outPallets = 0, productionCost = 0; let allItems = [...finishedProductMaster, ...productMaster];
        globalHistory.forEach(log => { 
            let logDate = new Date(log.production_date ? log.production_date : log.created_at);
            if(logDate >= startDate) { 
                if(log.action_type === '입고') inPallets += (log.pallet_count || 1); 
                if(log.action_type === '출고') { 
                    outPallets += (log.pallet_count || 1); 
                    let pInfo = allItems.find(p => String(p.item_name||"").trim() === String(log.item_name||"").trim()); 
                    if(pInfo) productionCost += (pInfo.unit_price * log.quantity); 
                } 
            } 
        }); 
        
        let dashIn = document.getElementById('dash-in'); if(dashIn) dashIn.innerText = inPallets.toFixed(1) + ' P'; 
        let dashOut = document.getElementById('dash-out'); if(dashOut) dashOut.innerText = outPallets.toFixed(1) + ' P'; 
        let dashCostOut = document.getElementById('dash-cost-out'); if(dashCostOut) dashCostOut.innerText = productionCost.toLocaleString() + ' 원'; 
        
        let totalRoom = 0, occRoom = 0, totalCold = 0, occCold = 0; let valRoom = 0, valCold = 0; 
        globalOccupancy.forEach(item => { 
            let dynP = getDynamicPalletCount(item); 
            let pInfo = allItems.find(prod => String(prod.item_name||"").trim() === String(item.item_name||"").trim() && String(prod.supplier||"").trim() === String(item.remarks||"").trim()); 
            let val = pInfo ? pInfo.unit_price * item.quantity : 0; 
            if(item.location_id.startsWith('R-')) { occRoom += dynP; valRoom += val; } 
            else if(item.location_id.startsWith('C-')) { occCold += dynP; valCold += val; } 
            else if(!item.location_id.startsWith('W-')) { valRoom += val; } 
        }); 
        
        layoutRoom.forEach(col => { if(col.cols) totalRoom += col.cols * 2; }); totalRoom += 20; 
        layoutCold.forEach(col => { if(col.cols) totalCold += col.cols * 2; }); totalCold += 16; 
        let totalAll = totalRoom + totalCold; let occAll = occRoom + occCold; 
        
        let dashZoneSel = document.getElementById('dash-zone-select'); const dashZone = dashZoneSel ? dashZoneSel.value : 'ALL'; 
        let finalOcc = occAll, finalTotal = totalAll; 
        if(dashZone === 'ROOM') { finalOcc = occRoom; finalTotal = totalRoom; } 
        else if(dashZone === 'COLD') { finalOcc = occCold; finalTotal = totalCold; }
        
        let capRate = finalTotal > 0 ? Math.round((finalOcc / finalTotal) * 100) : 0; 
        let dashCapPer = document.getElementById('dash-cap-percent'); if(dashCapPer) dashCapPer.innerText = capRate + '%'; 
        let dashCapText = document.getElementById('dash-cap-text'); if(dashCapText) dashCapText.innerText = `${finalOcc.toFixed(1)} / ${finalTotal} 파레트`; 
        let color = capRate > 100 ? '#e11d48' : '#10b981'; 
        let dashDonut = document.getElementById('dash-donut'); if(dashDonut) dashDonut.style.background = `conic-gradient(${color} 0% ${Math.min(capRate, 100)}%, #e2e8f0 ${Math.min(capRate, 100)}% 100%)`; 
        
        let elRoomTotal = document.getElementById('dash-room-total'); if(elRoomTotal) elRoomTotal.innerText = totalRoom; 
        let elRoomOcc = document.getElementById('dash-room-occ'); if(elRoomOcc) elRoomOcc.innerText = occRoom.toFixed(1); 
        let elRoomEmpty = document.getElementById('dash-room-empty'); if(elRoomEmpty) elRoomEmpty.innerText = Math.max(0, totalRoom - Math.floor(occRoom)); 
        let elRoomPer = document.getElementById('dash-room-percent'); if(elRoomPer) elRoomPer.innerText = totalRoom > 0 ? Math.round((occRoom/totalRoom)*100) + '%' : '0%'; 
        
        let elColdTotal = document.getElementById('dash-cold-total'); if(elColdTotal) elColdTotal.innerText = totalCold; 
        let elColdOcc = document.getElementById('dash-cold-occ'); if(elColdOcc) elColdOcc.innerText = occCold.toFixed(1); 
        let elColdEmpty = document.getElementById('dash-cold-empty'); if(elColdEmpty) elColdEmpty.innerText = Math.max(0, totalCold - Math.floor(occCold)); 
        let elColdPer = document.getElementById('dash-cold-percent'); if(elColdPer) elColdPer.innerText = totalCold > 0 ? Math.round((occCold/totalCold)*100) + '%' : '0%'; 
        
        let vRoom = document.getElementById('dash-val-room'); if(vRoom) vRoom.innerText = valRoom.toLocaleString() + ' 원'; 
        let vCold = document.getElementById('dash-val-cold'); if(vCold) vCold.innerText = valCold.toLocaleString() + ' 원'; 
        let vTotal = document.getElementById('dash-val-total'); if(vTotal) vTotal.innerText = (valRoom + valCold).toLocaleString() + ' 원'; 
    } catch(e) {} 
}

window.onload = function() { document.getElementById('login-screen').style.display = 'flex'; };
