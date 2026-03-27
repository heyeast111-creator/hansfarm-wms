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

const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];
const layoutFloor = [ { id: 'FL-C', title: '❄️ 생산 현장 (원재료/냉장)', cols: 20 }, { aisle: true, text: '====================' }, { id: 'FL-R', title: '📦 생산 현장 (부자재/실온)', cols: 20 } ];

function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') {
        loginMode = 'viewer';
        alert("👁️ 뷰어 모드로 접속되었습니다.\n(모든 기능을 '보기'만 가능합니다)");
    } else if (pw === '00700') {
        loginMode = 'editor';
        alert("✅ 일반 사용자 모드로 접속되었습니다.");
    } else {
        alert("❌ 비밀번호가 틀렸습니다.");
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
        globalOccupancy = await occRes.json() || []; 
        productMaster = await prodRes.json() || []; 
        finishedProductMaster = await fpRes.json() || []; 
        globalHistory = await histRes.json() || []; 
        bomMaster = await bomRes.json() || [];
        
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

function clearInfo() {
    const panel = document.getElementById('info-panel');
    if(panel) panel.innerHTML = `<div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div>`;
}

function adminLogin() {
    let fp = document.getElementById('admin-finance-panel');
    if(isAdmin) { 
        isAdmin = false; alert("🔒 관리자 모드가 해제되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden')); 
        if(fp) fp.classList.add('hidden');
        let viewAcc = document.getElementById('view-accounting');
        if(viewAcc && !viewAcc.classList.contains('hidden')) showView('dashboard'); 
        return; 
    }
    const pw = prompt("비밀번호 입력 (1234):"); 
    if(pw === "1234") { 
        isAdmin = true; alert("🔓 관리자 권한이 활성화되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden')); 
        if(fp) fp.classList.remove('hidden');
    } else if (pw !== null) { alert("비밀번호가 틀렸습니다."); }
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
        let el = document.getElementById(id);
        if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    
    let rs = document.getElementById('right-sidebar');
    if(viewName === 'order' && currentOrderTab === 'inventory') { 
        if(window.innerWidth >= 768 && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } 
        else if(rs) { if(selectedCellId) { rs.classList.remove('hidden'); rs.classList.add('flex'); } else { rs.classList.add('hidden'); rs.classList.remove('flex'); } }
    } else if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
    
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

function closeInfoPanel() { 
    let rs = document.getElementById('right-sidebar');
    if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
    selectedCellId = null; movingItem = null; renderMap(); 
}

function toggleMapSearch() { const container = document.getElementById('map-search-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }
function toggleWaitContainer() { const container = document.getElementById('wait-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }

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
    document.getElementById('history-modal-title').innerText = `${locId} 전체 기록`;
    let html = '';
    locHistory.forEach(h => {
        let actionColor = h.action_type === '입고' ? 'text-emerald-600' : (h.action_type === '출고' ? 'text-rose-600' : (h.action_type.includes('삭제') ? 'text-slate-400 line-through' : 'text-blue-600')); 
        let dateStr = h.production_date ? h.production_date : new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); 
        html += `<div class="bg-slate-50 p-3 border border-slate-200 rounded text-[11px] md:text-xs shadow-sm"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${dateStr}</span><br><span class="font-bold text-slate-700 mt-1 block">${h.item_name} <span class="text-slate-400">(${h.quantity}EA / ${h.pallet_count ? h.pallet_count.toFixed(1) : 1}P)</span></span></div>`;
    });
    document.getElementById('history-modal-content').innerHTML = html;
    document.getElementById('history-modal').classList.remove('hidden'); document.getElementById('history-modal').classList.add('flex');
}

function closeHistoryModal() {
    document.getElementById('history-modal').classList.add('hidden'); document.getElementById('history-modal').classList.remove('flex');
}

async function closeInventory() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 불가능합니다.");
    if(!isAdmin) return alert("🔒 관리자 권한이 필요합니다. 좌측 로고를 클릭해 로그인해주세요.");
    if(!confirm("⚠️ [재고마감]\n현재 렉맵에 적재된 모든 품목을 '(기존재고)'로 마감 처리하시겠습니까?\n이후 월간 소요량 파악 및 악성 재고 필터링에 기준이 됩니다.")) return;
    try {
        await fetch('/api/close_inventory', { method: 'POST' });
        alert("✅ 재고 마감 처리 완료!");
        await load();
    } catch(e) { alert("마감 처리 중 오류가 발생했습니다."); }
}

function toggleOrderCart() {
    const el = document.getElementById('order-cart-container');
    if(el.classList.contains('hidden')) {
        el.classList.remove('hidden'); el.classList.add('flex'); updateOrderCartDropdowns();
    } else {
        el.classList.add('hidden'); el.classList.remove('flex');
    }
}

function updateOrderCartDropdowns() {
    try {
        let sups = [...new Set(productMaster.map(p=>p.supplier))].filter(Boolean).sort();
        let supSel = document.getElementById('oc-sup');
        if(supSel) { 
            let cur = supSel.value;
            supSel.innerHTML = '<option value="">1. 발주처 선택</option>' + sups.map(s=>`<option value="${s}">${s}</option>`).join(''); 
            if(sups.includes(cur)) supSel.value = cur;
            updateOrderCartCategoryDropdown(); 
        }
    } catch(e) {}
}

function updateOrderCartCategoryDropdown() {
    try {
        let sup = document.getElementById('oc-sup').value;
        let cats = [...new Set(productMaster.filter(p=>p.supplier===sup).map(p=>p.category))].filter(Boolean).sort();
        let catSel = document.getElementById('oc-cat');
        if(catSel) { 
            let cur = catSel.value;
            catSel.innerHTML = '<option value="">2. 카테고리 선택</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join(''); 
            if(cats.includes(cur)) catSel.value = cur;
            updateOrderCartItemDropdown(); 
        }
    } catch(e) {}
}

function updateOrderCartItemDropdown() {
    try {
        let sup = document.getElementById('oc-sup').value;
        let cat = document.getElementById('oc-cat').value;
        let items = [...new Set(productMaster.filter(p=>p.supplier===sup && p.category===cat).map(p=>p.item_name))].filter(Boolean).sort();
        let itemSel = document.getElementById('oc-item');
        if(itemSel) { 
            let cur = itemSel.value;
            itemSel.innerHTML = '<option value="">3. 품목 선택</option>' + items.map(c=>`<option value="${c}">${c}</option>`).join(''); 
            if(items.includes(cur)) itemSel.value = cur;
        }
    } catch(e) {}
}

function addOrderCartItem() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 발주 기능을 사용할 수 없습니다.");
    let cat = document.getElementById('oc-cat').value; let item = document.getElementById('oc-item').value; let sup = document.getElementById('oc-sup').value; let pal = parseFloat(document.getElementById('oc-pal').value);
    if(!item || !sup || isNaN(pal) || pal <= 0) return alert("품목, 발주처, 파레트 수량을 정확히 선택/입력하세요.");

    let pInfo = productMaster.find(p=>p.item_name===item && p.supplier===sup);
    let eaPerPallet = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1;
    let totalQty = Math.round(pal * eaPerPallet);

    orderCart.push({ category: cat, item_name: item, supplier: sup, pallet_count: pal, quantity: totalQty });
    document.getElementById('oc-pal').value = '';
    renderOrderCart();
}

function removeOrderCartItem(index) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 삭제할 수 없습니다.");
    orderCart.splice(index, 1); renderOrderCart();
}

function renderOrderCart() {
    let tbody = document.getElementById('order-cart-tbody'); if(!tbody) return;
    if(orderCart.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-slate-400 font-bold">장바구니가 비어있습니다.</td></tr>`; return; }
    
    tbody.innerHTML = orderCart.map((item, idx) => {
        let delBtn = loginMode === 'viewer' ? '' : `<button onclick="removeOrderCartItem(${idx})" class="text-rose-500 hover:bg-rose-100 px-2 py-1 rounded font-bold">❌</button>`;
        return `<tr class="border-b border-slate-100">
            <td class="p-2 font-bold text-rose-600">${item.supplier}</td>
            <td class="p-2 font-black text-slate-800">${item.item_name}</td>
            <td class="p-2 text-right font-black text-indigo-600">${item.pallet_count} P <span class="text-[10px] font-normal text-slate-500">(${item.quantity.toLocaleString()}EA)</span></td>
            <td class="p-2 text-center">${delBtn}</td>
        </tr>`;
    }).join('');
}

async function submitOrderCart() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 발주를 확정할 수 없습니다.");
    if(orderCart.length === 0) return alert("장바구니가 비어있습니다.");

    let text = "[한스팜]발주요청서\n안녕하세요.\n아래 품목 발주 요청 드립니다.\n";
    orderCart.forEach((item, index) => { text += `${index + 1}. ${item.item_name} - ${item.pallet_count} 파레트\n`; });
    text += "\n확인 후 납기일정 회신 부탁 드립니다.\n감사합니다.";

    try {
        await fetch('/api/orders_create', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(orderCart) });
        navigator.clipboard.writeText(text).then(async () => {
            alert("✅ 발주가 등록되었으며, 카카오톡 텍스트가 복사되었습니다!\nPC 카톡이나 메신저에 Ctrl+V 로 붙여넣기 하세요.");
            orderCart = []; toggleOrderCart(); await load();
        }).catch(async (e) => {
            alert("✅ 발주가 등록되었습니다. (브라우저 권한으로 텍스트 자동 복사는 실패했습니다)");
            orderCart = []; toggleOrderCart(); await load();
        });
    } catch(e) { alert("발주 에러가 발생했습니다."); }
}

function renderOrderList() {
    let orders = globalHistory.filter(h => h.action_type === '발주중');
    let tbody = document.getElementById('order-list-tbody'); if(!tbody) return;
    if(orders.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">진행 중인 발주 내역이 없습니다.</td></tr>`; return; }

    orders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    tbody.innerHTML = orders.map(o => {
        let actionBtns = '';
        if(loginMode !== 'viewer') {
            actionBtns = `<button onclick="receiveOrder('${o.id}', '${o.item_name}', ${o.quantity}, ${o.pallet_count}, '${o.remarks}', '${o.category || ''}')" class="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1.5 rounded shadow-sm transition-colors text-xs">입고처리</button>
            <button onclick="cancelOrder('${o.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-2 py-1.5 rounded transition-colors text-xs">취소</button>`;
        }
        return `<tr class="hover:bg-slate-50 transition-colors">
            <td class="p-3 text-slate-500 font-bold">${o.created_at.substring(0,10)}</td>
            <td class="p-3 font-black text-rose-600">${o.remarks || '기본'}</td>
            <td class="p-3 font-black text-slate-800">${o.item_name}</td>
            <td class="p-3 text-right font-black text-indigo-600">${o.pallet_count} P <span class="text-[10px] font-normal text-slate-500">(${o.quantity.toLocaleString()}EA)</span></td>
            <td class="p-3 text-center"><span class="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-[10px] font-black animate-pulse">발주 대기중</span></td>
            <td class="p-3 text-center space-x-1">${actionBtns}</td>
        </tr>`;
    }).join('');
}

async function receiveOrder(logId, itemName, qty, pallet, supplier, cat) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 불가능합니다.");
    let emptyW = "";
    for(let i=1; i<=30; i++) { 
        let wId = `W-${i.toString().padStart(2, '0')}`; 
        if(!globalOccupancy.find(o => o.location_id === wId)) { emptyW = wId; break; } 
    }
    if(!emptyW) return alert(`⚠️ 대기장(W-01~W-30)이 꽉 찼습니다! 기존 물건을 렉으로 이동시킨 후 다시 시도해주세요.`);
    if(!confirm(`[${itemName}]을(를) [${emptyW}] 위치로 입고 처리하시겠습니까?`)) return;

    try {
        await fetch(`/api/history/${logId}`, { method: 'DELETE' });
        let payload = { location_id: emptyW, category: cat || '미분류', item_name: itemName, quantity: qty, pallet_count: pallet, production_date: new Date().toISOString().split('T')[0], remarks: supplier };
        await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        alert("입고 완료! 대기장에서 물건을 확인하세요.");
        await load();
    } catch(e) { alert("입고 처리 중 오류가 발생했습니다."); }
}

async function cancelOrder(logId) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 불가능합니다.");
    if(!confirm("이 발주 내역을 정말 취소(삭제)하시겠습니까?")) return;
    try { await fetch(`/api/history/${logId}`, { method: 'DELETE' }); await load(); } catch(e) { alert("취소 실패"); }
}

// 💡 구역별(실온, 냉장, 현장) 대기장 품목 필터링 로직
function getWaitZoneSourceItems() {
    if (currentZone === '실온') return productMaster.filter(p => p.category && !p.category.includes('원란'));
    else if (currentZone === '냉장') return productMaster.filter(p => p.category && p.category.includes('원란'));
    else return [...finishedProductMaster, ...productMaster];
}

function populateWaitDropdowns() {
    try {
        let items = getWaitZoneSourceItems();
        let sups = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
        let ws = document.getElementById('wait-supplier');
        if(ws) { 
            let cur = ws.value;
            ws.innerHTML = `<option value="">1.입고처</option>` + sups.map(s => `<option value="${s}">${s}</option>`).join('');
            if(sups.includes(cur)) ws.value = cur;
            updateWaitCategoryDropdown();
        }
    } catch(e) {}
}

function updateWaitCategoryDropdown() {
    try {
        let ws = document.getElementById('wait-supplier'); if(!ws) return;
        let sup = ws.value; 
        let items = getWaitZoneSourceItems();
        let filtered = sup ? items.filter(p => p.supplier === sup) : items;
        let cats = [...new Set(filtered.map(p => p.category))].filter(Boolean).sort();
        let wc = document.getElementById('wait-cat');
        if(wc) {
            let cur = wc.value;
            wc.innerHTML = `<option value="">2.카테고리</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join(''); 
            if(cats.includes(cur)) wc.value = cur;
            updateWaitItemDropdown();
        }
    } catch(e) {}
}

function updateWaitItemDropdown() {
    try {
        let ws = document.getElementById('wait-supplier'); let wc = document.getElementById('wait-cat'); if(!ws || !wc) return;
        let sup = ws.value; let cat = wc.value; 
        let items = getWaitZoneSourceItems();
        let filtered = items.filter(p => (!sup || p.supplier === sup) && (!cat || p.category === cat));
        let itemNames = [...new Set(filtered.map(p => p.item_name))].filter(Boolean).sort();
        let wi = document.getElementById('wait-item');
        if(wi) {
            let cur = wi.value;
            wi.innerHTML = `<option value="">3.품목명</option>` + itemNames.map(c => `<option value="${c}">${c}</option>`).join('');
            if(itemNames.includes(cur)) wi.value = cur;
        }
    } catch(e) {}
}

async function createWaitingPallets() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 박스를 생성할 수 없습니다.");
    const cat = document.getElementById('wait-cat').value; const item = document.getElementById('wait-item').value; 
    const ws = document.getElementById('wait-supplier'); const supplier = ws ? ws.value || '기본입고처' : '기본입고처';
    let wd = document.getElementById('wait-date'); let date = wd ? wd.value : ''; 
    const qtyInput = document.getElementById('wait-qty').value;
    const palInput = document.getElementById('wait-pal').value;

    if(!cat || !item) return alert("카테고리와 품목을 선택하세요.");
    if(!qtyInput && !palInput) return alert("총수량(EA) 또는 P수량(파레트) 중 하나를 입력하세요.");
    if(!date) { let t = new Date(); date = t.toISOString().split('T')[0]; }
    
    let pInfo = finishedProductMaster.find(p => p.item_name === item && p.supplier === supplier) || productMaster.find(p => p.item_name === item && p.supplier === supplier) || finishedProductMaster.find(p => p.item_name === item) || productMaster.find(p => p.item_name === item);
    let pEa = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1;
    
    let qty = 0;
    if (palInput && parseFloat(palInput) > 0) {
        qty = Math.round(parseFloat(palInput) * pEa);
    } else if (qtyInput && parseInt(qtyInput) > 0) {
        qty = parseInt(qtyInput);
    }

    if(qty <= 0) return alert("수량이 올바르지 않습니다.");

    let remaining = qty; let payloads = []; let waitIndex = 1;
    while(remaining > 0) {
        let chunk = remaining > pEa ? pEa : remaining; let chunkPallet = chunk / pEa; let emptyW = "";
        for(let i=waitIndex; i<=30; i++) { let wId = `W-${i.toString().padStart(2, '0')}`; if(!globalOccupancy.find(o => o.location_id === wId) && !payloads.find(p => p.location_id === wId)) { emptyW = wId; waitIndex = i + 1; break; } }
        if(!emptyW) { alert(`대기 렉이 꽉 찼습니다! (${payloads.length}박스만 생성됨)`); break; }
        payloads.push({ location_id: emptyW, category: cat, item_name: item, quantity: chunk, pallet_count: chunkPallet, production_date: date, remarks: supplier }); remaining -= chunk;
    }
    if(payloads.length > 0) {
        try { 
            let promises = payloads.map(p => fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(p) })); 
            await Promise.all(promises); 
            document.getElementById('wait-qty').value = ''; 
            document.getElementById('wait-pal').value = ''; 
            await load(); 
        } catch(e) { alert("생성 중 오류 발생"); }
    }
}

function selectForMove(invId, itemName, maxQty, currentPallet, fromLoc, supplier) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 렉 이동을 할 수 없습니다.");
    if (movingItem && movingItem.invId === invId) { movingItem = null; renderAll(); return; } 
    movingItem = { invId, itemName, maxQty, currentPallet, fromLoc, supplier };
    renderAll(); 
}

function onCardDragStart(event, invId, itemName, maxQty, currentPallet, fromLoc, supplier) {
    if(loginMode === 'viewer') { event.preventDefault(); return; }
    event.dataTransfer.setData("invId", invId); event.dataTransfer.setData("itemName", itemName); event.dataTransfer.setData("maxQty", maxQty); event.dataTransfer.setData("currentPallet", currentPallet); event.dataTransfer.setData("fromLoc", fromLoc); event.dataTransfer.setData("supplier", supplier || ""); event.dataTransfer.effectAllowed = "move"; event.currentTarget.classList.add('dragging');
}
function onWaitDragStart(event, wId) {
    if(loginMode === 'viewer') { event.preventDefault(); return; }
    let items = globalOccupancy.filter(o => o.location_id === wId); if(items.length === 0) return; let item = items[0];
    event.dataTransfer.setData("invId", item.id); event.dataTransfer.setData("itemName", item.item_name); event.dataTransfer.setData("maxQty", item.quantity); event.dataTransfer.setData("currentPallet", item.pallet_count || 1); event.dataTransfer.setData("fromLoc", wId); event.dataTransfer.setData("supplier", item.remarks || ""); event.dataTransfer.effectAllowed = "move"; event.currentTarget.classList.add('dragging');
}
function onDragEnd(event) { event.currentTarget.classList.remove('dragging'); }
function onDragOver(event) { event.preventDefault(); event.currentTarget.classList.add('border-indigo-500', 'border-4', 'border-dashed'); }
function onDragLeave(event) { event.currentTarget.classList.remove('border-indigo-500', 'border-4', 'border-dashed'); }

async function onDrop(event, displayId, dbBaseId) {
    if(loginMode === 'viewer') return;
    event.preventDefault(); event.currentTarget.classList.remove('border-indigo-500', 'border-4', 'border-dashed');
    let invId = event.dataTransfer.getData("invId"); let itemName = event.dataTransfer.getData("itemName"); let maxQty = parseInt(event.dataTransfer.getData("maxQty")); let fromLoc = event.dataTransfer.getData("fromLoc"); let supplier = event.dataTransfer.getData("supplier");
    if(!invId) return;
    
    let toLoc = dbBaseId;
    if (!toLoc.startsWith('W-') && currentZone !== '현장') {
        let floor = prompt(`[${itemName}]을(를) ${displayId}의 몇 층으로 이동할까요?\n(1 또는 2 입력)`, "1");
        if(floor !== "1" && floor !== "2") return;
        toLoc = floor === "1" ? dbBaseId : `${dbBaseId}-2F`;
    }
    if(fromLoc === toLoc) return;

    let qtyStr = prompt(`이동(또는 합칠) 수량(EA)을 입력하세요.\n(최대 ${maxQty}EA)`, maxQty);
    if(!qtyStr) return; let qty = parseInt(qtyStr);
    if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("수량이 올바르지 않습니다.");

    let movePallet = getDynamicPalletCount({item_name: itemName, remarks: supplier, quantity: qty});
    try { 
        await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc, item_name: itemName, quantity: qty, pallet_count: movePallet }) }); 
        await load(); 
    } catch(e) { alert("서버 통신 오류"); }
}

function renderMap() { 
    try {
        let floorSelect = document.getElementById('floor-select');
        const floor = floorSelect ? floorSelect.value : "1"; 
        const vContainer = document.getElementById('vertical-racks'); 
        const hContainer = document.getElementById('horizontal-rack'); 
        const occMap = {}; const palletMap = {}; globalOccupancy.forEach(item => { occMap[item.location_id] = true; palletMap[item.location_id] = (palletMap[item.location_id] || 0) + getDynamicPalletCount(item); }); 
        
        let waitHtml = '';
        for(let i=1; i<=30; i++) {
            let wId = `W-${i.toString().padStart(2, '0')}`;
            let items = globalOccupancy.filter(o => o.location_id === wId);
            
            let isMovingSource = (movingItem && movingItem.fromLoc === wId);
            let movingClass = isMovingSource ? 'highlight-move' : '';

            if(items.length > 0) {
                let item = items[0]; let totalQty = items.reduce((sum, o) => sum + o.quantity, 0); let totalPallet = items.reduce((sum, o) => sum + getDynamicPalletCount(o), 0); let palStr = totalPallet > 0 ? totalPallet.toFixed(1) : 1;
                let supplierStr = item.remarks && item.remarks !== '기본입고처' ? `<span class="text-[6px] text-slate-500 truncate w-full px-1">${item.remarks}</span>` : '';
                
                let dynP = getDynamicPalletCount(item);
                let dblClickAttr = loginMode === 'viewer' ? '' : `ondblclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, ${dynP}, '${wId}', '${item.remarks||''}')"`;

                waitHtml += `<div id="cell-${wId}" draggable="true" ondragstart="onWaitDragStart(event, '${wId}')" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${wId}', '${wId}')" onclick="clickCell('${wId}', '${wId}')" ${dblClickAttr} class="bg-indigo-100 border-2 border-indigo-400 rounded-lg p-1 flex flex-col items-center justify-center text-center cursor-grab shadow-sm h-16 md:h-20 active:cursor-grabbing hover:scale-105 transition-all overflow-hidden ${movingClass}">${supplierStr}<span class="text-[8px] md:text-[9px] font-black text-indigo-800 truncate w-full px-1">${item.item_name}</span><span class="text-[10px] md:text-xs font-black text-rose-600 mt-0.5">${totalQty.toLocaleString()}</span><span class="text-[7px] md:text-[8px] font-bold text-slate-500">${palStr}P</span></div>`;
            } else {
                waitHtml += `<div id="cell-${wId}" onclick="clickCell('${wId}', '${wId}')" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${wId}', '${wId}')" class="bg-white border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center h-16 md:h-20 text-slate-300 font-black text-xs opacity-50 cursor-pointer ${movingClass}">${i}</div>`;
            }
        }
        let wGrid = document.getElementById('waiting-grid'); if(wGrid) wGrid.innerHTML = waitHtml;

        let vHtml = ''; if(hContainer) hContainer.innerHTML = ''; 
        if(currentZone === '현장') { 
            let aisleText = document.getElementById('aisle-text'); if(aisleText) aisleText.classList.add('hidden'); 
            vHtml += `<div class="w-full min-w-[700px]">`; 
            layoutFloor.forEach(col => { 
                if(col.aisle) { vHtml += `<div class="w-full h-10 bg-yellow-50/50 flex items-center justify-center border-y-2 border-yellow-300 shadow-inner my-6 rounded-lg"><span class="text-yellow-600 font-black tracking-widest text-sm">${col.text}</span></div>`; } 
                else { 
                    let colorClass = col.id === 'FL-C' ? 'text-indigo-800 bg-indigo-50 border-indigo-200' : 'text-orange-800 bg-orange-50 border-orange-200'; 
                    vHtml += `<div class="mb-4 bg-white p-5 rounded-2xl shadow-md border border-slate-200"><div class="text-lg font-black ${colorClass} p-3 rounded-lg border mb-4 shadow-sm inline-block">${col.title}</div><div class="grid grid-cols-10 gap-3">`; 
                    for (let r = 1; r <= col.cols; r++) { 
                        let dbId = `${col.id}-${r.toString().padStart(2, '0')}`; let searchId = dbId; let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === dbId) cellState = 'cell-active'; 
                        let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md z-10 animate-bounce">${pCount.toFixed(1)}P</div>` : ''; 
                        let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : '';
                        let isMovingSource = (movingItem && movingItem.fromLoc === searchId); if(isMovingSource) pulseClass += ' highlight-move';
                        
                        let itemsInCell = globalOccupancy.filter(x => x.location_id === searchId);
                        let dblClickAttr = (itemsInCell.length > 0 && loginMode !== 'viewer') ? `ondblclick="selectForMove('${itemsInCell[0].id}', '${itemsInCell[0].item_name}', ${itemsInCell[0].quantity}, ${pCount}, '${searchId}', '${itemsInCell[0].remarks||''}')"` : '';

                        vHtml += `<div id="cell-${dbId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${dbId}', '${dbId}')" onclick="clickCell('${dbId}', '${searchId}')" ${dblClickAttr} class="h-16 rounded-xl border-2 flex flex-col items-center justify-center text-[11px] font-black cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm hover:scale-105 transition-all">${badge}<span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}번 칸</span></div>`; 
                    } 
                    vHtml += `</div></div>`; 
                } 
            }); vHtml += `</div>`; 
            if(vContainer) vContainer.innerHTML = vHtml; 
            return; 
        } 
        
        let aisleText = document.getElementById('aisle-text'); if(aisleText) { aisleText.classList.remove('hidden'); aisleText.innerText = "통로 (Aisle)"; }
        const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; const prefix = currentZone === '실온' ? 'R-' : 'C-'; 

        activeLayout.forEach(col => { 
            if (col.aisle) { vHtml += `<div class="w-10 md:w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1"><span class="text-yellow-600 font-black tracking-widest text-[10px] md:text-xs" style="writing-mode: vertical-rl;">통로</span></div>`; } 
            else if (col.gap) { vHtml += `<div class="w-2 md:w-4"></div>`; } 
            else { 
                vHtml += `<div class="flex flex-col w-10 md:w-14 space-y-1 justify-end"><div class="text-center font-black text-xl md:text-2xl text-slate-800 pb-2">${col.id}</div>`; 
                for (let r = col.cols; r >= 1; r--) { 
                    let displayId = `${col.id}${r}`; let dbId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                    let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                    let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
                    let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : ''; let crossFloorBadge = '';
                    if(floor === "1" && globalSearchTargets.includes(`${dbId}-2F`)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">2F 타겟</div>`; } else if(floor === "2" && globalSearchTargets.includes(dbId)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">1F 타겟</div>`; }
                    let isMovingSource = (movingItem && movingItem.fromLoc === searchId); if(isMovingSource) pulseClass += ' highlight-move';

                    let itemsInCell = globalOccupancy.filter(x => x.location_id === searchId);
                    let dblClickAttr = (itemsInCell.length > 0 && loginMode !== 'viewer') ? `ondblclick="selectForMove('${itemsInCell[0].id}', '${itemsInCell[0].item_name}', ${itemsInCell[0].quantity}, ${pCount}, '${searchId}', '${itemsInCell[0].remarks||''}')"` : '';

                    vHtml += `<div id="cell-${displayId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${displayId}', '${dbId}')" onclick="clickCell('${displayId}', '${searchId}')" ${dblClickAttr} class="h-8 rounded-[3px] flex items-center justify-center text-[9px] md:text-[10px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
                } 
                vHtml += `</div>`; 
            } 
        }); 
        if(vContainer) vContainer.innerHTML = vHtml; 
        
        let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
        for (let c = hCols; c >= 1; c--) { 
            let displayId = `${hPrefix}${c}`; let dbId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
            let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
            let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full shadow-sm z-10">${pCount.toFixed(1)}P</div>` : ''; 
            let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : ''; let crossFloorBadge = '';
            if(floor === "1" && globalSearchTargets.includes(`${dbId}-2F`)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">2F 타겟</div>`; } else if(floor === "2" && globalSearchTargets.includes(dbId)) { crossFloorBadge = `<div class="absolute -bottom-2 right-[-5px] bg-purple-600 text-white text-[8px] font-black px-1 py-0.5 rounded shadow-lg z-20 animate-bounce border border-purple-800 tracking-tighter">1F 타겟</div>`; }
            let isMovingSource = (movingItem && movingItem.fromLoc === searchId); if(isMovingSource) pulseClass += ' highlight-move';

            let itemsInCell = globalOccupancy.filter(x => x.location_id === searchId);
            let dblClickAttr = (itemsInCell.length > 0 && loginMode !== 'viewer') ? `ondblclick="selectForMove('${itemsInCell[0].id}', '${itemsInCell[0].item_name}', ${itemsInCell[0].quantity}, ${pCount}, '${searchId}', '${itemsInCell[0].remarks||''}')"` : '';

            hHtml += `<div id="cell-${displayId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${displayId}', '${dbId}')" onclick="clickCell('${displayId}', '${searchId}')" ${dblClickAttr} class="w-10 md:w-14 h-10 rounded-[3px] flex items-center justify-center text-[10px] md:text-[11px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
        } 
        hHtml += `</div>`; 
        if(hContainer) hContainer.innerHTML = hHtml; 
    } catch(e) { console.error("Render Map Error:", e); }
}

async function clickCell(displayId, searchId) { 
    try {
        if(!searchId) { 
            if(displayId.startsWith('W-')) { searchId = displayId; }
            else { let floorSel = document.getElementById('floor-select'); const floor = floorSel ? floorSel.value : "1"; const prefix = currentZone === '실온' ? 'R-' : (currentZone === '냉장' ? 'C-' : ''); const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`); searchId = floor === "1" ? baseId : `${baseId}-2F`; }
        } 

        if (movingItem) {
            if (movingItem.fromLoc === searchId) { movingItem = null; renderAll(); return; } 
            let toLoc = searchId;
            if (!toLoc.startsWith('W-') && currentZone !== '현장') {
                let floor = prompt(`📦 [${movingItem.itemName}]을(를) ${displayId}의 몇 층으로 넣을까요?\n(1 또는 2 입력)`, "1");
                if(floor !== "1" && floor !== "2") { movingItem = null; renderAll(); return; }
                const prefix = currentZone === '실온' ? 'R-' : (currentZone === '냉장' ? 'C-' : ''); 
                const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`);
                toLoc = floor === "1" ? baseId : `${baseId}-2F`;
            }
            let qtyStr = prompt(`이동할 수량(EA)을 입력하세요.\n(최대 ${movingItem.maxQty}EA)`, movingItem.maxQty);
            if(!qtyStr) { movingItem = null; renderAll(); return; }
            let qty = parseInt(qtyStr);
            if(isNaN(qty) || qty <= 0 || qty > movingItem.maxQty) { alert("수량이 올바르지 않습니다."); movingItem = null; renderAll(); return; }

            let movePallet = getDynamicPalletCount({item_name: movingItem.itemName, remarks: movingItem.supplier, quantity: qty});
            try { 
                await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: movingItem.invId, from_location: movingItem.fromLoc, to_location: toLoc, item_name: movingItem.itemName, quantity: qty, pallet_count: movePallet }) }); 
                movingItem = null; await load(); 
            } catch(e) { alert("서버 통신 오류"); movingItem = null; renderAll(); }
            return;
        }

        selectedCellId = displayId; 
        renderMap(); 
        let rs = document.getElementById('right-sidebar');
        if(rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); }
        
        const panel = document.getElementById('info-panel'); 
        let floorSel = document.getElementById('floor-select');
        const floorName = searchId.startsWith('W-') ? '입고 대기장' : (currentZone === '현장' ? '생산현장' : (floorSel ? floorSel.options[floorSel.selectedIndex].text : '')); 
        const items = globalOccupancy.filter(x => x.location_id === searchId); let dateLabel = currentZone === '냉장' ? '산란일' : '입고일'; 
        let panelHtml = `<div class="bg-indigo-50 p-3 md:p-4 rounded-lg border border-indigo-200 mb-4"><div class="flex justify-between items-start"><div><div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div><div class="text-2xl md:text-3xl font-black text-indigo-900">${displayId}</div></div><div class="text-right"><span class="inline-block bg-white text-indigo-700 text-[10px] md:text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floorName}</span></div></div></div>`; 
        
        if(items.length > 0) { 
            let msg = loginMode === 'viewer' ? "적재 목록 (조회만 가능)" : "적재 목록 (더블클릭/드래그하여 이동)";
            panelHtml += `<div class="mb-2 text-[10px] md:text-xs font-bold text-slate-500">${msg}</div>`; 
            items.forEach(item => { 
                let dateHtml = item.production_date ? `<div class="text-[10px] md:text-xs text-rose-600 font-bold mt-1">${dateLabel}: ${item.production_date}</div>` : ''; 
                let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks) || productMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks); 
                let dynPallet = getDynamicPalletCount(item); let palletDisplay = dynPallet > 0 ? `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] ml-1 font-black">${dynPallet.toFixed(1)} P</span>` : ''; 
                
                let actionBtns = '';
                if(loginMode !== 'viewer') {
                    let moveBtn = `<button onclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}', '${item.remarks||''}')" class="w-1/2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-1.5 rounded text-[10px] md:text-[11px] font-bold transition-colors">📦 렉으로 이동</button>`;
                    let outBtn = `<button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="w-1/2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-[10px] md:text-[11px] font-bold transition-colors">선택 출고</button>`;
                    let editBtn = `<button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date || ''}', '${searchId}', '${item.remarks || ''}')" class="flex-1 bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200 py-1.5 rounded text-[10px] md:text-[11px] font-bold transition-colors mt-2 w-full">⚙️ 편집/삭제</button>`;
                    actionBtns = `<div class="flex space-x-2 mt-3 border-t pt-2">${outBtn}${moveBtn}</div>${editBtn}`;
                }
                
                let highlightClass = (movingItem && movingItem.invId === item.id) ? 'highlight-move' : '';

                panelHtml += `<div class="bg-white border border-slate-200 rounded-lg p-2 md:p-3 shadow-sm mb-2 md:mb-3 transition-shadow ${highlightClass}"><div class="flex justify-between items-start mb-2"><div><span class="text-[9px] md:text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span><div class="font-black text-xs md:text-sm text-slate-800 mt-1 break-keep">${item.item_name}</div><div class="text-[9px] md:text-[10px] text-slate-400 font-bold text-rose-600">입고처: ${item.remarks||'기본'}</div></div><div class="text-right"><div class="text-sm md:text-base font-bold text-indigo-600">${item.quantity.toLocaleString()} EA ${palletDisplay}</div></div></div>${dateHtml}${actionBtns}</div>`; 
            }); 
        } else { panelHtml += `<div class="text-center text-slate-400 py-4 md:py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-4"><b class="text-emerald-600 inline-block text-sm">비어있습니다</b></div>`; } 
        
        let isWaitZone = searchId.startsWith('W-');
        if (!isWaitZone) {
            let locHistory = globalHistory.filter(h => h.location_id === searchId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); 
            let recentHistory = locHistory.slice(0, 10);
            
            let histHtml = '<div class="mt-6 pt-4 border-t border-slate-200"><div class="flex justify-between items-center mb-3"><h3 class="text-xs md:text-sm font-black text-slate-700">최근 내역 (최대 10건)</h3>';
            if(locHistory.length > 10) {
                histHtml += `<button onclick="showHistoryModal('${searchId}')" class="text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-600 px-2 py-1 rounded font-bold transition-colors">전체보기</button>`;
            }
            histHtml += '</div><div class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">'; 

            if(recentHistory.length > 0) { 
                recentHistory.forEach(h => { 
                    let actionColor = h.action_type === '입고' ? 'text-emerald-600' : (h.action_type === '출고' ? 'text-rose-600' : (h.action_type.includes('삭제') ? 'text-slate-400 line-through' : 'text-blue-600')); 
                    let dateStr = h.production_date ? h.production_date : new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); 
                    histHtml += `<div class="bg-white p-2 border border-slate-200 rounded text-[10px] md:text-xs shadow-sm"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${dateStr}</span><br><span class="font-bold text-slate-700 mt-1 block">${h.item_name} <span class="text-slate-400">(${h.quantity}EA / ${h.pallet_count ? h.pallet_count.toFixed(1) : 1}P)</span></span></div>`; 
                }); 
            } else { histHtml += `<div class="text-[10px] md:text-xs text-slate-400 text-center py-4">기록이 없습니다.</div>`; } 
            histHtml += '</div></div>'; 
            panelHtml += histHtml;
        }

        if(panel) panel.innerHTML = panelHtml; 
    } catch(e) { console.error("Click Cell Error:", e); }
}

async function editInventoryItem(invId, itemName, qty, date, locId, remarks) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    let action = prompt(`[${itemName}] 편집 메뉴\n\n1: 수량 수정 (EA)\n2: 날짜 수정 (YYYY-MM-DD)\n3: 기록 완전 삭제 (오입력 취소)\n\n원하시는 작업 번호를 입력하세요:`);
    if (action === '1') { 
        let newQtyStr = prompt(`새로운 수량(EA)을 입력하세요:\n(현재 수량: ${qty} EA)`, qty); 
        if(newQtyStr) { 
            let newQty = parseInt(newQtyStr); 
            if(newQty > 0) { 
                let newPallet = getDynamicPalletCount({item_name: itemName, remarks: remarks, quantity: newQty}); 
                await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'UPDATE_QTY', new_quantity: newQty, pallet_count: newPallet }) }); 
                alert("수량 수정 완료!"); await load(); 
            } else alert("올바른 수량을 입력하세요."); 
        } 
    } 
    else if (action === '2') { 
        let newDate = prompt(`새로운 날짜를 입력하세요:\n(형식: YYYY-MM-DD)`, date || ''); 
        if(newDate !== null) { 
            await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'UPDATE_DATE', new_date: newDate }) }); 
            alert("날짜 수정 완료!"); await load(); 
        } 
    } 
    else if (action === '3') { 
        if(confirm(`⚠️ 정말 [${itemName}]의 이 재고 기록을 완전히 삭제하시겠습니까?\n(실수로 입고 버튼을 두 번 누른 경우 사용하세요)`)) { 
            await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'DELETE' }) }); 
            alert("재고 삭제 완료!"); await load(); 
        } 
    }
}

async function processOutbound(invId, itemName, maxQty, currentPallet, locId) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 출고할 수 없습니다.");
    const qtyStr = prompt(`[${itemName}] 소진할 수량(EA)을 입력하세요. (최대 ${maxQty}EA)`, maxQty); 
    if(!qtyStr) return; const qty = parseInt(qtyStr); 
    if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량"); 
    const outPallet = getDynamicPalletCount({item_name: itemName, remarks: null, quantity: qty}); 
    try { 
        await fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: qty, pallet_count: outPallet }) }); 
        alert("출고 완료!"); await load(); 
    } catch(e) {} 
}

function switchProductTab(tab) {
    try {
        ['fp', 'pm', 'bom'].forEach(t => {
            let btn = document.getElementById(`tab-btn-${t}`); let view = document.getElementById(`subview-${t}`); let btns = document.getElementById(`${t}-header-btns`);
            if(btn) btn.className = "whitespace-nowrap text-lg md:text-2xl font-black text-slate-400 hover:text-slate-600 pb-1 px-2 transition-colors";
            if(view) { view.classList.add('hidden'); view.style.display = 'none'; }
            if(btns) { btns.classList.add('hidden'); btns.style.display = 'none'; }
        });

        let activeBtn = document.getElementById(`tab-btn-${tab}`); let activeView = document.getElementById(`subview-${tab}`); let activeBtns = document.getElementById(`${tab}-header-btns`);

        if(activeBtn) {
            activeBtn.className = "whitespace-nowrap text-lg md:text-2xl font-black text-indigo-700 border-b-4 border-indigo-700 pb-1 px-2 transition-colors";
            if(tab === 'bom') { activeBtn.classList.replace('text-indigo-700', 'text-emerald-700'); activeBtn.classList.replace('border-indigo-700', 'border-emerald-700'); }
        }
        if(activeView) { activeView.classList.remove('hidden'); activeView.style.display = (tab === 'fp' || tab === 'pm') ? 'grid' : 'flex'; }
        if(activeBtns) { activeBtns.classList.remove('hidden'); activeBtns.style.display = 'flex'; }

        if(tab === 'fp') renderProductMaster('finished');
        if(tab === 'pm') renderProductMaster('materials');
        if(tab === 'bom') { updateBomDropdowns(); renderBomMaster(); }
    } catch(e) {}
}

function populateProductFilters(targetType) {
    try {
        let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster;
        let prefix = targetType === 'finished' ? 'fp' : 'pm';
        let filterCat = document.getElementById(`${prefix}-filter-cat`); let filterSup = document.getElementById(`${prefix}-filter-sup`);
        if(!filterCat || !filterSup) return;
        
        let curCat = filterCat.value; let curSup = filterSup.value;
        let cats = [...new Set(dataArray.map(p => p.category))].filter(Boolean).sort();
        let sups = [...new Set(dataArray.map(p => p.supplier))].filter(Boolean).sort();

        filterCat.innerHTML = `<option value="ALL">전체 카테고리</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
        filterSup.innerHTML = `<option value="ALL">전체 ${targetType==='finished'?'생산처':'입고처'}</option>` + sups.map(s => `<option value="${s}">${s}</option>`).join('');
        
        if(cats.includes(curCat)) filterCat.value = curCat;
        if(sups.includes(curSup)) filterSup.value = curSup;
    } catch(e){}
}

function renderProductMaster(targetType) { 
    try {
        const prefix = targetType === 'finished' ? 'fp' : 'pm';
        const searchInput = document.getElementById(`${prefix}-search`);
        const filterCatEl = document.getElementById(`${prefix}-filter-cat`);
        const filterSupEl = document.getElementById(`${prefix}-filter-sup`);
        if(!filterCatEl || !filterSupEl) return;
        
        const filterCat = filterCatEl.value; const filterSup = filterSupEl.value; const keyword = searchInput ? searchInput.value.toLowerCase().trim() : '';
        let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster;
        
        let filtered = dataArray.filter(p => {
            let matchCat = filterCat === 'ALL' || p.category === filterCat;
            let matchSup = filterSup === 'ALL' || p.supplier === filterSup;
            let matchKw = !keyword || (p.item_name||"").toLowerCase().includes(keyword);
            return matchCat && matchSup && matchKw;
        });

        const listHtml = filtered.map(p => { 
            let isEditing = (editingProductOriginalName === p.item_name && editingProductOriginalSupplier === p.supplier);
            let rowBg = isEditing ? 'bg-yellow-100 border-2 border-yellow-400' : 'hover:bg-slate-50 border-b border-slate-100';
            let delBtn = isAdmin ? `<button onclick="deleteProduct('${p.item_name}', '${p.supplier}', '${targetType}')" class="text-rose-500 hover:bg-rose-100 px-2 py-1 rounded transition-colors text-xs font-bold">삭제</button>` : ''; 
            let badgeColor = targetType === 'finished' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600';
            
            return `<tr class="transition-colors ${rowBg}">
                <td class="p-2 md:p-3"><span class="text-[10px] ${badgeColor} px-2 py-1 rounded-md font-bold shadow-sm">${p.category}</span></td>
                <td class="p-2 md:p-3 font-black text-slate-800 text-xs md:text-sm">${p.item_name}</td>
                <td class="p-2 md:p-3 font-bold text-rose-600 text-[10px] md:text-xs bg-rose-50 rounded px-2">${p.supplier}</td>
                <td class="p-2 md:p-3 text-right font-black text-indigo-600 text-xs md:text-sm bg-indigo-50 rounded">${p.pallet_ea.toLocaleString()} <span class="text-[10px] font-normal text-slate-500">EA/P</span></td>
                <td class="p-2 md:p-3 text-right text-[10px] text-slate-500 font-bold"><span class="block text-slate-400">일 ${p.daily_usage.toLocaleString()}개</span><span class="block text-slate-700">${p.unit_price.toLocaleString()}원</span></td>
                <td class="p-2 md:p-3 text-center flex justify-center space-x-1 items-center h-full pt-3">
                    <button onclick="editProductSetup('${p.category}', '${p.item_name}', '${p.supplier}', ${p.daily_usage}, ${p.unit_price}, ${p.pallet_ea}, '${targetType}')" class="text-blue-600 bg-blue-50 hover:bg-blue-200 px-2 py-1 rounded shadow-sm transition-colors text-xs font-bold">수정</button>
                    ${delBtn}
                </td>
            </tr>`; 
        }).join(''); 
        
        const tbodyId = targetType === 'finished' ? 'fp-list' : 'pm-list'; 
        const tbody = document.getElementById(tbodyId);
        if(tbody) { 
            if(filtered.length > 0) tbody.innerHTML = listHtml; 
            else tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">검색 결과가 없습니다.</td></tr>`; 
        }
    } catch(e){}
}

function editProductSetup(cat, name, supplier, usage, price, ea, targetType) { 
    editingProductOriginalName = name; editingProductOriginalSupplier = supplier; 
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    document.getElementById(`${prefix}-cat`).value = cat; document.getElementById(`${prefix}-name`).value = name; document.getElementById(`${prefix}-supplier`).value = supplier; document.getElementById(`${prefix}-usage`).value = usage; document.getElementById(`${prefix}-price`).value = price; document.getElementById(`${prefix}-pallet-ea`).value = ea || 1; 
    document.getElementById(`${prefix}-form-title`).innerText = "기존 항목 수정 중 ✏️"; document.getElementById(`${prefix}-submit-btn`).innerText = "✅ 저장하기"; document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-indigo-600', 'bg-emerald-600'); document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-indigo-700', 'hover:bg-emerald-700'); document.getElementById(`${prefix}-cancel-btn`).classList.remove('hidden'); 
    renderProductMaster(targetType); 
}

function cancelEdit(targetType) { 
    editingProductOriginalName = null; editingProductOriginalSupplier = null; 
    const prefix = targetType === 'finished' ? 'fp' : 'pm'; const title = targetType === 'finished' ? '신규 완제품 추가' : '신규 자재 추가';
    document.getElementById(`${prefix}-cat`).value = ''; document.getElementById(`${prefix}-name`).value = ''; document.getElementById(`${prefix}-supplier`).value = ''; document.getElementById(`${prefix}-usage`).value = '0'; document.getElementById(`${prefix}-price`).value = '0'; document.getElementById(`${prefix}-pallet-ea`).value = '1'; 
    document.getElementById(`${prefix}-form-title`).innerText = title; document.getElementById(`${prefix}-submit-btn`).innerText = "등록하기"; document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-emerald-600', 'bg-indigo-600'); document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-emerald-700', 'hover:bg-indigo-700'); document.getElementById(`${prefix}-cancel-btn`).classList.add('hidden'); 
    renderProductMaster(targetType);
}

async function submitProduct(targetType) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    const cat = document.getElementById(`${prefix}-cat`).value.trim(); const name = document.getElementById(`${prefix}-name`).value.trim(); const supplier = document.getElementById(`${prefix}-supplier`).value.trim() || (targetType==='finished'?'자체생산':'기본입고처'); const usage = parseInt(document.getElementById(`${prefix}-usage`).value) || 0; const price = parseInt(document.getElementById(`${prefix}-price`).value) || 0; const ea = parseInt(document.getElementById(`${prefix}-pallet-ea`).value) || 1; 
    if(!cat || !name) return alert("카테고리와 이름은 필수입니다."); 
    const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
    try { 
        if(editingProductOriginalName) { 
            await fetch(`${endpoint}?old_name=${encodeURIComponent(editingProductOriginalName)}&old_supplier=${encodeURIComponent(editingProductOriginalSupplier)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
            alert("수정 완료"); cancelEdit(targetType);
        } else { 
            await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
            alert("등록 완료"); document.getElementById(`${prefix}-name`).value = ''; document.getElementById(`${prefix}-supplier`).value = ''; 
        } 
        await load();
    } catch(e) { alert("서버 통신 실패"); } 
}

async function deleteProduct(name, supplier, targetType) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 삭제할 수 없습니다.");
    if(!confirm(`[${name} - ${supplier}] 항목을 개별 삭제하시겠습니까?`)) return; 
    const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
    try { await fetch(`${endpoint}?item_name=${encodeURIComponent(name)}&supplier=${encodeURIComponent(supplier)}`, { method: 'DELETE' }); await load(); } catch(e) {} 
}

async function deleteAllProducts(targetType) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 삭제할 수 없습니다.");
    const msg = targetType === 'finished' ? "제품" : "자재";
    if(!confirm(`⚠️ 정말 모든 ${msg} 마스터를 일괄 삭제하시겠습니까?`)) return; 
    const pw = prompt("관리자 비밀번호(1234) 입력:"); if(pw !== "1234") return alert("틀렸습니다."); 
    const endpoint = targetType === 'finished' ? '/api/finished_products_all' : '/api/products_all';
    try { await fetch(endpoint, { method: 'DELETE' }); alert("일괄 삭제 완료!"); await load(); } catch(e) { alert("삭제 실패!"); } 
}

function exportProductsExcel(targetType) { 
    try { 
        let wsData = []; let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster; let sheetName = targetType === 'finished' ? "제품마스터" : "자재마스터"; let fileName = targetType === 'finished' ? "한스팜_제품마스터_양식.xlsx" : "한스팜_자재마스터_양식.xlsx";
        if (dataArray.length === 0) { wsData = [{ "카테고리": "", "품목명": "", "입고처(공급사)": "", "일간소모량(EA)": "0", "단가(비용)": "0", "1P기준수량(EA)": "1" }]; } 
        else { wsData = dataArray.map(p => ({ "카테고리": p.category || "미분류", "품목명": p.item_name || "", "입고처(공급사)": p.supplier || "", "일간소모량(EA)": p.daily_usage || 0, "단가(비용)": p.unit_price || 0, "1P기준수량(EA)": p.pallet_ea || 1 })); } 
        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, sheetName); XLSX.writeFile(wb, fileName); 
    } catch (error) { alert("다운로드 중 오류"); } 
}

function importProductsExcel(e, targetType) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); 
    const endpoint = targetType === 'finished' ? '/api/finished_products_batch' : '/api/products_batch';
    const msg = targetType === 'finished' ? "제품" : "자재";
    reader.onload = async function(ev) { 
        try { 
            const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); 
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); 
            if(json.length > 0) { 
                await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); 
                alert(`${msg} 대량 업로드 완료!`); await load();
            } else { alert("업로드할 데이터가 없습니다."); }
        } catch(err) { console.error(err); alert("업로드 처리 중 오류 발생: 엑셀 양식을 다시 확인해주세요."); } 
    }; reader.readAsArrayBuffer(file); e.target.value = ''; 
}

function renderBomMaster() {
    try {
        const tbody = document.getElementById('bom-list');
        if(!tbody) return;
        if(bomMaster.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-slate-400 font-bold">등록된 레시피가 없습니다.</td></tr>`; return; }
        bomMaster.sort((a, b) => a.finished_product.localeCompare(b.finished_product));
        tbody.innerHTML = bomMaster.map(b => {
            let delBtn = isAdmin ? `<button onclick="deleteBom('${b.id}')" class="text-rose-500 hover:bg-rose-100 px-2 py-1 rounded transition-colors text-xs font-bold">삭제</button>` : '';
            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="p-2 border-b border-slate-100 font-black text-emerald-800 text-xs md:text-sm">${b.finished_product}</td>
                <td class="p-2 border-b border-slate-100 text-center text-slate-400">➡️</td>
                <td class="p-2 border-b border-slate-100 font-bold text-indigo-800 text-xs md:text-sm">${b.material_product}</td>
                <td class="p-2 border-b border-slate-100 text-right font-black text-slate-700 text-xs md:text-sm">${b.require_qty} <span class="text-[10px] font-normal text-slate-500">EA</span></td>
                <td class="p-2 border-b border-slate-100 text-center">${delBtn}</td>
            </tr>`;
        }).join('');
    } catch(e){}
}

function exportBomExcel() {
    let wsData = bomMaster.length === 0 ? [{"완제품명": "", "부자재명": "", "소요수량(EA)": ""}] : bomMaster.map(b => ({"완제품명": b.finished_product, "부자재명": b.material_product, "소요수량(EA)": b.require_qty}));
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 25}, {wch: 25}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, "BOM마스터"); XLSX.writeFile(wb, "한스팜_BOM레시피_양식.xlsx");
}

function importBomExcel(e) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
    reader.onload = async function(ev) {
        try {
            const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if(json.length > 0) { 
                await fetch('/api/bom_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); 
                alert("BOM 대량 업로드 완료!"); await load(); 
            }
        } catch(err) { alert("업로드 처리 중 오류 발생"); }
    }; reader.readAsArrayBuffer(file); e.target.value = '';
}

function updateBomDropdowns() {
    try {
        const fNames = [...new Set(finishedProductMaster.map(p => p.item_name))].filter(Boolean).sort();
        const mNames = [...new Set(productMaster.map(p => p.item_name))].filter(Boolean).sort();
        const fOptions = fNames.length > 0 ? fNames.map(name => `<option value="${name}">${name}</option>`).join('') : `<option value="">[제품 마스터]에 제품을 등록해주세요</option>`;
        const mOptions = mNames.length > 0 ? mNames.map(name => `<option value="${name}">${name}</option>`).join('') : `<option value="">[자재 마스터]에 자재를 등록해주세요</option>`;
        document.getElementById('bom-finished').innerHTML = fOptions; document.getElementById('bom-material').innerHTML = mOptions;
    } catch(e){}
}

async function submitBom() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 등록할 수 없습니다.");
    const finished = document.getElementById('bom-finished').value; const material = document.getElementById('bom-material').value; const qty = parseFloat(document.getElementById('bom-qty').value);
    if(!finished || !material || isNaN(qty) || qty <= 0) return alert("입력값을 확인해주세요.");
    if(finished === material) return alert("완제품과 자재가 같을 수 없습니다!");
    try { 
        await fetch('/api/bom', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ finished_product: finished, material_product: material, require_qty: qty }) }); 
        alert("레시피 연결 완료!"); document.getElementById('bom-qty').value = 1; await load();
    } catch(e) { alert("서버 통신 실패"); }
}

async function deleteBom(id) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 삭제할 수 없습니다.");
    if(!confirm("이 레시피 연결을 삭제하시겠습니까?")) return; 
    try { await fetch(`/api/bom?id=${id}`, { method: 'DELETE' }); await load(); } catch(e) { alert("삭제 실패"); } 
}

function toggleAccDateInput() {
    let type = document.getElementById('acc-type').value;
    document.getElementById('acc-date').classList.add('hidden');
    document.getElementById('acc-period-wrapper').classList.add('hidden');
    document.getElementById('acc-period-wrapper').classList.remove('flex');
    document.getElementById('acc-month').classList.add('hidden');

    if(type === 'date') { document.getElementById('acc-date').classList.remove('hidden'); } 
    else if(type === 'period') { document.getElementById('acc-period-wrapper').classList.remove('hidden'); document.getElementById('acc-period-wrapper').classList.add('flex'); } 
    else if(type === 'month') { document.getElementById('acc-month').classList.remove('hidden'); }
}

function isAccDateMatch(hDate) {
    let type = document.getElementById('acc-type').value;
    if (type === 'date') {
        let target = document.getElementById('acc-date').value;
        if(!target) return false;
        return hDate === target;
    } else if (type === 'period') {
        let start = document.getElementById('acc-period-start').value;
        let end = document.getElementById('acc-period-end').value;
        if (!start || !end) return false;
        return hDate >= start && hDate <= end;
    } else if (type === 'month') {
        let target = document.getElementById('acc-month').value;
        if(!target) return false;
        return hDate.substring(0, 7) === target;
    }
    return false;
}

function updateAccFilters(changedFilter) {
    try {
        let inboundLog = globalHistory.filter(h => {
            if(h.action_type !== '입고') return false;
            let hDate = h.production_date ? h.production_date : h.created_at.substring(0, 10);
            return isAccDateMatch(hDate);
        });

        let supSelect = document.getElementById('acc-supplier'); 
        let itemSelect = document.getElementById('acc-item');
        let curSup = supSelect.value;
        let curItem = itemSelect.value;

        if (changedFilter === 'date' || changedFilter === 'type') {
            let suppliers = [...new Set(inboundLog.map(h => h.remarks || '기본입고처'))].sort();
            supSelect.innerHTML = `<option value="ALL">전체 매입처</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join('');
            if(suppliers.includes(curSup)) supSelect.value = curSup; else supSelect.value = 'ALL';
            curSup = supSelect.value;
        }

        if (changedFilter === 'date' || changedFilter === 'type' || changedFilter === 'supplier') {
            let itemLog = inboundLog;
            if (curSup !== 'ALL') { itemLog = itemLog.filter(h => (h.remarks || '기본입고처') === curSup); }
            let items = [...new Set(itemLog.map(h => h.item_name))].sort();
            itemSelect.innerHTML = `<option value="ALL">전체 품목</option>` + items.map(s => `<option value="${s}">${s}</option>`).join('');
            if(items.includes(curItem)) itemSelect.value = curItem; else itemSelect.value = 'ALL';
        }
        renderAccounting();
    } catch(e) { console.error("Filter Update Error:", e); }
}

function renderAccounting() { 
    try {
        const selectedSup = document.getElementById('acc-supplier').value;
        const selectedItem = document.getElementById('acc-item').value;
        const groupMode = document.getElementById('acc-group').value;

        let inboundLog = globalHistory.filter(h => h.action_type === '입고');
        let allItems = [...finishedProductMaster, ...productMaster];

        let filtered = inboundLog.filter(h => {
            let hDate = h.production_date ? h.production_date : h.created_at.substring(0, 10);
            let matchDate = isAccDateMatch(hDate);
            let matchSup = selectedSup === 'ALL' || (h.remarks || '기본입고처') === selectedSup;
            let matchItem = selectedItem === 'ALL' || h.item_name === selectedItem;
            return matchDate && matchSup && matchItem;
        });

        let groupedLog = {};
        filtered.forEach(h => {
            let hDate = h.production_date ? h.production_date : h.created_at.substring(0, 10);
            let hSup = h.remarks || '기본입고처';
            let hItem = h.item_name;
            let key = `${hDate}|${hSup}|${hItem}`;
            
            if(!groupedLog[key]) { groupedLog[key] = { date: hDate, supplier: hSup, item_name: hItem, quantity: 0 }; }
            groupedLog[key].quantity += h.quantity;
        });

        let consolidated = Object.values(groupedLog);
        consolidated.sort((a,b) => new Date(b.date) - new Date(a.date));

        let totalSupply = 0, totalTax = 0, totalSum = 0; let html = '';

        if(groupMode === 'list') {
            html = consolidated.map((h, i) => {
                let pInfo = allItems.find(p => String(p.item_name).trim() === String(h.item_name).trim() && String(p.supplier).trim() === String(h.supplier).trim());
                let price = pInfo ? pInfo.unit_price : 0;
                let supply = price * h.quantity; let tax = Math.floor(supply * 0.1); let sum = supply + tax;
                totalSupply += supply; totalTax += tax; totalSum += sum;
                let bgClass = i % 2 === 0 ? 'bg-white' : 'bg-slate-50'; 
                
                return `<tr class="${bgClass} border-b border-slate-200 hover:bg-indigo-50 transition-colors"><td class="p-1.5 md:p-2 text-slate-500 text-[10px] md:text-[11px] whitespace-nowrap">${h.date}</td><td class="p-1.5 md:p-2 font-bold text-slate-700 text-[11px] md:text-xs truncate max-w-[100px]">${h.supplier}</td><td class="p-1.5 md:p-2 font-black text-slate-800 text-[11px] md:text-xs truncate max-w-[120px]">${h.item_name}</td><td class="p-1.5 md:p-2 text-right font-bold text-indigo-600 text-[11px] md:text-xs">${h.quantity.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right text-slate-500 text-[10px] md:text-[11px]">${price.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-black text-slate-700 text-[11px] md:text-xs">${supply.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-bold text-rose-500 text-[10px] md:text-[11px]">${tax.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-black text-blue-700 text-[11px] md:text-xs">${sum.toLocaleString()}</td></tr>`;
            }).join('');
        } else {
            let groupAggr = {};
            consolidated.forEach(h => {
                let key = groupMode === 'supplier' ? h.supplier : h.item_name; let subKey = groupMode === 'supplier' ? h.item_name : h.supplier;
                let pInfo = allItems.find(p => String(p.item_name).trim() === String(h.item_name).trim() && String(p.supplier).trim() === String(h.supplier).trim());
                let price = pInfo ? pInfo.unit_price : 0;
                let supply = price * h.quantity; let tax = Math.floor(supply * 0.1); let sum = supply + tax;

                if(!groupAggr[key]) groupAggr[key] = { totalQty: 0, totalSupply: 0, totalTax: 0, totalSum: 0, details: {} };
                groupAggr[key].totalQty += h.quantity; groupAggr[key].totalSupply += supply; groupAggr[key].totalTax += tax; groupAggr[key].totalSum += sum;
                if(!groupAggr[key].details[subKey]) groupAggr[key].details[subKey] = { qty: 0, supply: 0 };
                groupAggr[key].details[subKey].qty += h.quantity; groupAggr[key].details[subKey].supply += supply;
            });

            for(let key in groupAggr) {
                let g = groupAggr[key]; totalSupply += g.totalSupply; totalTax += g.totalTax; totalSum += g.totalSum;
                html += `<tr class="bg-indigo-100 border-b-2 border-indigo-200"><td colspan="3" class="p-2 font-black text-indigo-900 text-xs md:text-sm">📁 [${key}] 누적 요약</td><td class="p-2 text-right font-black text-indigo-700 text-[11px] md:text-xs">${g.totalQty.toLocaleString()}</td><td class="p-2 text-right">-</td><td class="p-2 text-right font-black text-slate-800 text-[11px] md:text-xs">${g.totalSupply.toLocaleString()}</td><td class="p-2 text-right font-bold text-rose-600 text-[11px] md:text-xs">${g.totalTax.toLocaleString()}</td><td class="p-2 text-right font-black text-blue-800 text-[11px] md:text-xs">${g.totalSum.toLocaleString()}</td></tr>`;
                
                for(let subKey in g.details) {
                    let d = g.details[subKey]; let dTax = Math.floor(d.supply * 0.1); let dSum = d.supply + dTax; let displaySup = groupMode === 'supplier' ? key : subKey; let displayItem = groupMode === 'item' ? key : subKey;
                    html += `<tr class="bg-white border-b border-slate-100 opacity-90"><td class="p-1.5 md:p-2 text-center text-[10px] text-slate-400">↳ 상세항목</td><td class="p-1.5 md:p-2 font-bold text-slate-600 text-[10px] md:text-[11px]">${displaySup}</td><td class="p-1.5 md:p-2 font-bold text-slate-600 text-[10px] md:text-[11px]">${displayItem}</td><td class="p-1.5 md:p-2 text-right font-bold text-indigo-500 text-[10px] md:text-[11px]">${d.qty.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right text-slate-400 text-[9px]">-</td><td class="p-1.5 md:p-2 text-right text-slate-600 text-[10px] md:text-[11px]">${d.supply.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right text-rose-400 text-[10px] md:text-[11px]">${dTax.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-bold text-blue-600 text-[10px] md:text-[11px]">${dSum.toLocaleString()}</td></tr>`;
                }
            }
        }
        document.getElementById('acc-list').innerHTML = html || `<tr><td colspan="8" class="p-10 text-center text-slate-400 font-bold">해당 조건에 내역이 없습니다.</td></tr>`; 
        document.getElementById('acc-supply').innerText = totalSupply.toLocaleString() + ' 원'; document.getElementById('acc-tax').innerText = totalTax.toLocaleString() + ' 원'; document.getElementById('acc-total').innerText = totalSum.toLocaleString() + ' 원'; 
    } catch(e) { console.error(e); }
}

function exportAccountingExcel() {
    try {
        const table = document.getElementById('accounting-table');
        if(!table) return alert("다운로드할 표가 없습니다.");
        const wb = XLSX.utils.table_to_book(table, {sheet: "정산내역"});
        let today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `한스팜_정산회계_${today}.xlsx`);
    } catch (error) { console.error(error); alert("엑셀 다운로드 중 오류가 발생했습니다."); }
}

window.onload = function() { document.getElementById('login-screen').style.display = 'flex'; };
