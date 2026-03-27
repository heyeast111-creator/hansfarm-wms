let globalOccupancy = []; 
let productMaster = []; 
let finishedProductMaster = []; 
let globalHistory = []; 
let bomMaster = []; 
let globalSearchTargets = []; 
let currentZone = '실온'; 
let selectedCellId = null; 
let isAdmin = false;

let currentOrderTab = 'inventory';
let editingProductOriginalName = null;
let editingProductOriginalSupplier = null;
let orderCart = []; // 💡 발주 장바구니 데이터

const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];
const layoutFloor = [ { id: 'FL-C', title: '❄️ 생산 현장 (원재료/냉장)', cols: 20 }, { aisle: true, text: '====================' }, { id: 'FL-R', title: '📦 생산 현장 (부자재/실온)', cols: 20 } ];

async function load() {
    try {
        const ts = new Date().getTime();
        const [occRes, prodRes, fpRes, histRes, bomRes] = await Promise.all([ 
            fetch('/api/inventory?t=' + ts), fetch('/api/products?t=' + ts), fetch('/api/finished_products?t=' + ts), fetch('/api/history?t=' + ts), fetch('/api/bom?t=' + ts) 
        ]);
        globalOccupancy = await occRes.json() || []; productMaster = await prodRes.json() || []; finishedProductMaster = await fpRes.json() || []; globalHistory = await histRes.json() || []; bomMaster = await bomRes.json() || [];
        
        updateMapSearchCategoryDropdown(); populateWaitDropdowns(); 
        
        let t = new Date();
        let yyyy = t.getFullYear(); let mm = String(t.getMonth() + 1).padStart(2, '0'); let dd = String(t.getDate()).padStart(2, '0');
        if(!document.getElementById('acc-date').value) document.getElementById('acc-date').value = `${yyyy}-${mm}-${dd}`;
        if(!document.getElementById('acc-period-start').value) document.getElementById('acc-period-start').value = `${yyyy}-${mm}-01`; 
        if(!document.getElementById('acc-period-end').value) document.getElementById('acc-period-end').value = `${yyyy}-${mm}-${dd}`; 
        if(!document.getElementById('acc-month').value) document.getElementById('acc-month').value = `${yyyy}-${mm}`;

        let activeView = 'dashboard';
        ['order', 'dashboard', 'products', 'accounting'].forEach(v => {
            let el = document.getElementById('view-' + v);
            if(el && !el.classList.contains('hidden')) activeView = v;
        });

        if(activeView === 'order') { 
            if(currentOrderTab === 'inventory') { renderMap(); if(selectedCellId) await clickCell(selectedCellId); else closeInfoPanel(); }
            else if(currentOrderTab === 'search') updateSummarySupplierDropdown();
            else if(currentOrderTab === 'safety') renderSafetyStock();
            else if(currentOrderTab === 'history') { updateOrderCartDropdowns(); renderOrderList(); }
        }
        else if(activeView === 'dashboard') updateDashboard();
        else if(activeView === 'products') { populateProductFilters('finished'); populateProductFilters('materials'); renderProductMaster('finished'); renderProductMaster('materials'); }
        else if(activeView === 'accounting') updateAccFilters('type');

    } catch (e) { console.error("로딩 에러:", e); }
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
    } catch(e) { console.error(e); }
}

function switchZone(zone) { 
    globalSearchTargets = []; currentZone = zone; selectedCellId = null; 
    let rs = document.getElementById('right-sidebar');
    if(window.innerWidth < 768 && rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
    updateZoneTabs(); renderMap(); 
}

function switchOrderTab(tab) {
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
}

function showView(viewName) {
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

    document.querySelectorAll('.nav-btn-pc').forEach(btn => { btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'bg-rose-50', 'border-rose-200', 'text-rose-600', 'bg-yellow-50', 'border-yellow-300', 'text-yellow-700', 'shadow-inner'); });
    document.querySelectorAll('.nav-btn-pc.target-' + viewName).forEach(btn => {
        if(viewName === 'accounting') btn.classList.add('bg-yellow-50', 'border-yellow-300', 'text-yellow-700', 'shadow-inner');
        else btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner');
    });

    document.querySelectorAll('.nav-btn-mo').forEach(btn => { btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner'); btn.classList.add('bg-white'); });
    document.querySelectorAll('.nav-btn-mo.target-' + viewName).forEach(btn => { btn.classList.remove('bg-white'); btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner'); });
    
    if(viewName === 'products') { populateProductFilters('finished'); populateProductFilters('materials'); renderProductMaster('finished'); switchProductTab('fp'); } 
    else if(viewName === 'order') { switchOrderTab(currentOrderTab); } 
    else if(viewName === 'dashboard') updateDashboard(); 
    else if(viewName === 'accounting') updateAccFilters('type'); 
}

function closeInfoPanel() { 
    let rs = document.getElementById('right-sidebar');
    if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
    selectedCellId = null; renderMap(); 
}

function toggleMapSearch() { const container = document.getElementById('map-search-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }
function toggleWaitContainer() { const container = document.getElementById('wait-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }

// 💡 [새 기능] 발주 장바구니 토글 및 연동 로직
function toggleOrderCart() {
    const el = document.getElementById('order-cart-container');
    if(el.classList.contains('hidden')) {
        el.classList.remove('hidden'); el.classList.add('flex'); updateOrderCartDropdowns();
    } else {
        el.classList.add('hidden'); el.classList.remove('flex');
    }
}

function updateOrderCartDropdowns() {
    let allItems = [...productMaster, ...finishedProductMaster];
    let cats = [...new Set(allItems.map(p=>p.category))].filter(Boolean).sort();
    let catSel = document.getElementById('oc-cat');
    if(catSel) { catSel.innerHTML = '<option value="">카테고리</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join(''); updateOrderCartItemDropdown(); }
}

function updateOrderCartItemDropdown() {
    let cat = document.getElementById('oc-cat').value;
    let allItems = [...productMaster, ...finishedProductMaster];
    let items = [...new Set(allItems.filter(p=>p.category===cat).map(p=>p.item_name))].filter(Boolean).sort();
    let itemSel = document.getElementById('oc-item');
    if(itemSel) { itemSel.innerHTML = '<option value="">품목 선택</option>' + items.map(c=>`<option value="${c}">${c}</option>`).join(''); updateOrderCartSupplierDropdown(); }
}

function updateOrderCartSupplierDropdown() {
    let cat = document.getElementById('oc-cat').value;
    let item = document.getElementById('oc-item').value;
    let allItems = [...productMaster, ...finishedProductMaster];
    let sups = [...new Set(allItems.filter(p=>p.category===cat && p.item_name===item).map(p=>p.supplier))].filter(Boolean).sort();
    let supSel = document.getElementById('oc-sup');
    if(supSel) { supSel.innerHTML = '<option value="">발주처(공급사)</option>' + sups.map(c=>`<option value="${c}">${c}</option>`).join(''); }
}

function addOrderCartItem() {
    let cat = document.getElementById('oc-cat').value;
    let item = document.getElementById('oc-item').value;
    let sup = document.getElementById('oc-sup').value;
    let pal = parseFloat(document.getElementById('oc-pal').value);

    if(!item || !sup || isNaN(pal) || pal <= 0) return alert("품목, 발주처, 파레트 수량을 정확히 선택/입력하세요.");

    let pInfo = productMaster.find(p=>p.item_name===item && p.supplier===sup) || finishedProductMaster.find(p=>p.item_name===item && p.supplier===sup);
    let eaPerPallet = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1;
    let totalQty = Math.round(pal * eaPerPallet);

    orderCart.push({ category: cat, item_name: item, supplier: sup, pallet_count: pal, quantity: totalQty });
    document.getElementById('oc-pal').value = '';
    renderOrderCart();
}

function removeOrderCartItem(index) {
    orderCart.splice(index, 1);
    renderOrderCart();
}

function renderOrderCart() {
    let tbody = document.getElementById('order-cart-tbody');
    if(orderCart.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-slate-400 font-bold">장바구니가 비어있습니다.</td></tr>`; return; }
    
    tbody.innerHTML = orderCart.map((item, idx) => {
        return `<tr class="border-b border-slate-100">
            <td class="p-1 font-bold text-rose-600">${item.supplier}</td>
            <td class="p-1 font-black text-slate-800">${item.item_name}</td>
            <td class="p-1 text-right font-black text-indigo-600">${item.pallet_count} P <span class="text-[10px] font-normal text-slate-500">(${item.quantity}EA)</span></td>
            <td class="p-1 text-center"><button onclick="removeOrderCartItem(${idx})" class="text-rose-500 hover:bg-rose-100 px-2 rounded">❌</button></td>
        </tr>`;
    }).join('');
}

// 💡 [새 기능] 발주 확정 (DB 저장) 및 카카오톡 텍스트 자동 완성/복사
async function submitOrderCart() {
    if(orderCart.length === 0) return alert("장바구니가 비어있습니다.");

    let text = "[한스팜]발주요청서\n안녕하세요.\n아래 품목 발주 요청 드립니다.\n";
    orderCart.forEach((item, index) => {
        text += `${index + 1}. ${item.item_name} - ${item.pallet_count} 파레트\n`;
    });
    text += "\n확인 후 납기일정 회신 부탁 드립니다.\n감사합니다.";

    try {
        await fetch('/api/orders_create', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(orderCart) });
        navigator.clipboard.writeText(text).then(async () => {
            alert("✅ 발주가 등록되었으며, 카카오톡 텍스트가 복사되었습니다!\nPC 카톡이나 메신저에 Ctrl+V 로 붙여넣기 하세요.");
            orderCart = []; renderOrderCart(); toggleOrderCart(); await load();
        });
    } catch(e) { alert("발주 에러가 발생했습니다."); }
}

// 💡 [새 기능] 발주 진행 리스트 및 입고처리
function renderOrderList() {
    let orders = globalHistory.filter(h => h.action_type === '발주중');
    let tbody = document.getElementById('order-list-tbody');
    if(orders.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">진행 중인 발주 내역이 없습니다.</td></tr>`; return; }

    orders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    tbody.innerHTML = orders.map(o => {
        return `<tr class="hover:bg-slate-50 transition-colors">
            <td class="p-3 text-slate-500 font-bold">${o.created_at.substring(0,10)}</td>
            <td class="p-3 font-black text-rose-600">${o.remarks || '기본'}</td>
            <td class="p-3 font-black text-slate-800">${o.item_name}</td>
            <td class="p-3 text-right font-black text-indigo-600">${o.pallet_count} P <span class="text-[10px] font-normal text-slate-500">(${o.quantity.toLocaleString()}EA)</span></td>
            <td class="p-3 text-center"><span class="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-[10px] font-black animate-pulse">발주 대기중</span></td>
            <td class="p-3 text-center space-x-1">
                <button onclick="receiveOrder('${o.id}', '${o.item_name}', ${o.quantity}, ${o.pallet_count}, '${o.remarks}', '${o.category || ''}')" class="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1.5 rounded shadow-sm transition-colors text-xs">입고처리</button>
                <button onclick="cancelOrder('${o.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-2 py-1.5 rounded transition-colors text-xs">취소</button>
            </td>
        </tr>`;
    }).join('');
}

// 💡 발주건 도착 시 -> 즉시 가상 렉(W-XX)으로 자동 입고
async function receiveOrder(logId, itemName, qty, pallet, supplier, cat) {
    let emptyW = "";
    for(let i=1; i<=30; i++) { 
        let wId = `W-${i.toString().padStart(2, '0')}`; 
        if(!globalOccupancy.find(o => o.location_id === wId)) { emptyW = wId; break; } 
    }
    if(!emptyW) return alert(`⚠️ 대기장(W-01~W-30)이 꽉 찼습니다! 기존 물건을 렉으로 이동시킨 후 다시 시도해주세요.`);

    if(!confirm(`[${itemName}]을(를) [${emptyW}] 위치로 입고 처리하시겠습니까?`)) return;

    try {
        // 1. 발주 로그 삭제
        await fetch(`/api/history/${logId}`, { method: 'DELETE' });
        // 2. 가상 렉으로 입고 (이 과정에서 '입고' 로그 자동 생성됨)
        let payload = { location_id: emptyW, category: cat || '미분류', item_name: itemName, quantity: qty, pallet_count: pallet, production_date: new Date().toISOString().split('T')[0], remarks: supplier };
        await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        
        alert("입고 완료! 대기장에서 물건을 확인하세요.");
        await load();
    } catch(e) { alert("입고 처리 중 오류가 발생했습니다."); }
}

async function cancelOrder(logId) {
    if(!confirm("이 발주 내역을 정말 취소(삭제)하시겠습니까?")) return;
    try { await fetch(`/api/history/${logId}`, { method: 'DELETE' }); await load(); } catch(e) { alert("취소 실패"); }
}

function getDynamicPalletCount(itemObj) {
    if(!itemObj) return 0;
    let itemName = itemObj.item_name || ""; let supplier = itemObj.remarks || "기본입고처"; let quantity = itemObj.quantity || 0;
    let targetSup = String(supplier).trim();
    let pInfo = finishedProductMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim() && String(p.supplier||"").trim() === targetSup) || productMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim() && String(p.supplier||"").trim() === targetSup) || finishedProductMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim()) || productMaster.find(p => String(p.item_name||"").trim() === String(itemName).trim());
    if (pInfo && pInfo.pallet_ea > 0) return quantity / pInfo.pallet_ea;
    return itemObj.pallet_count || 1;
}

function onCardDragStart(event, invId, itemName, maxQty, currentPallet, fromLoc, supplier) {
    event.dataTransfer.setData("invId", invId); event.dataTransfer.setData("itemName", itemName); event.dataTransfer.setData("maxQty", maxQty); event.dataTransfer.setData("currentPallet", currentPallet); event.dataTransfer.setData("fromLoc", fromLoc); event.dataTransfer.setData("supplier", supplier || ""); event.dataTransfer.effectAllowed = "move"; event.currentTarget.classList.add('dragging');
}
function onWaitDragStart(event, wId) {
    let items = globalOccupancy.filter(o => o.location_id === wId); if(items.length === 0) return; let item = items[0];
    event.dataTransfer.setData("invId", item.id); event.dataTransfer.setData("itemName", item.item_name); event.dataTransfer.setData("maxQty", item.quantity); event.dataTransfer.setData("currentPallet", item.pallet_count || 1); event.dataTransfer.setData("fromLoc", wId); event.dataTransfer.setData("supplier", item.remarks || ""); event.dataTransfer.effectAllowed = "move"; event.currentTarget.classList.add('dragging');
}
function onDragEnd(event) { event.currentTarget.classList.remove('dragging'); }
function onDragOver(event) { event.preventDefault(); event.currentTarget.classList.add('border-indigo-500', 'border-4', 'border-dashed'); }
function onDragLeave(event) { event.currentTarget.classList.remove('border-indigo-500', 'border-4', 'border-dashed'); }

async function onDrop(event, displayId, dbBaseId) {
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
            if(items.length > 0) {
                let item = items[0]; let totalQty = items.reduce((sum, o) => sum + o.quantity, 0); let totalPallet = items.reduce((sum, o) => sum + getDynamicPalletCount(o), 0); let palStr = totalPallet > 0 ? totalPallet.toFixed(1) : 1;
                let supplierStr = item.remarks && item.remarks !== '기본입고처' ? `<span class="text-[6px] text-slate-500 truncate w-full px-1">${item.remarks}</span>` : '';
                waitHtml += `<div id="cell-${wId}" draggable="true" ondragstart="onWaitDragStart(event, '${wId}')" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${wId}', '${wId}')" onclick="clickCell('${wId}', '${wId}')" class="bg-indigo-100 border-2 border-indigo-400 rounded-lg p-1 flex flex-col items-center justify-center text-center cursor-grab shadow-sm h-16 md:h-20 active:cursor-grabbing hover:scale-105 transition-all overflow-hidden">${supplierStr}<span class="text-[8px] md:text-[9px] font-black text-indigo-800 truncate w-full px-1">${item.item_name}</span><span class="text-[10px] md:text-xs font-black text-rose-600 mt-0.5">${totalQty.toLocaleString()}</span><span class="text-[7px] md:text-[8px] font-bold text-slate-500">${palStr}P</span></div>`;
            } else {
                waitHtml += `<div id="cell-${wId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${wId}', '${wId}')" class="bg-white border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center h-16 md:h-20 text-slate-300 font-black text-xs opacity-50">${i}</div>`;
            }
        }
        let wGrid = document.getElementById('waiting-grid');
        if(wGrid) wGrid.innerHTML = waitHtml;

        let vHtml = ''; if(hContainer) hContainer.innerHTML = ''; 
        if(currentZone === '현장') { 
            let aisleText = document.getElementById('aisle-text');
            if(aisleText) aisleText.classList.add('hidden'); 
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
                        vHtml += `<div id="cell-${dbId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${dbId}', '${dbId}')" onclick="clickCell('${dbId}', '${searchId}')" class="h-16 rounded-xl border-2 flex flex-col items-center justify-center text-[11px] font-black cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm hover:scale-105 transition-all">${badge}<span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}번 칸</span></div>`; 
                    } 
                    vHtml += `</div></div>`; 
                } 
            }); vHtml += `</div>`; 
            if(vContainer) vContainer.innerHTML = vHtml; 
            return; 
        } 
        
        let aisleText = document.getElementById('aisle-text');
        if(aisleText) { aisleText.classList.remove('hidden'); aisleText.innerText = "통로 (Aisle)"; }
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
                    vHtml += `<div id="cell-${displayId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${displayId}', '${dbId}')" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[9px] md:text-[10px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
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
            hHtml += `<div id="cell-${displayId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${displayId}', '${dbId}')" onclick="clickCell('${displayId}', '${searchId}')" class="w-10 md:w-14 h-10 rounded-[3px] flex items-center justify-center text-[10px] md:text-[11px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${crossFloorBadge}${displayId}</div>`; 
        } 
        hHtml += `</div>`; 
        if(hContainer) hContainer.innerHTML = hHtml; 
    } catch(e) { console.error("Render Map Error:", e); }
}

async function clickCell(displayId, searchId) { 
    try {
        selectedCellId = displayId; 
        if(!searchId) { 
            if(displayId.startsWith('W-')) { searchId = displayId; }
            else { let floorSel = document.getElementById('floor-select'); const floor = floorSel ? floorSel.value : "1"; const prefix = currentZone === '실온' ? 'R-' : (currentZone === '냉장' ? 'C-' : ''); const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`); searchId = floor === "1" ? baseId : `${baseId}-2F`; }
        } 
        renderMap(); 
        let rs = document.getElementById('right-sidebar');
        if(rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); }
        
        const panel = document.getElementById('info-panel'); 
        let floorSel = document.getElementById('floor-select');
        const floorName = searchId.startsWith('W-') ? '입고 대기장' : (currentZone === '현장' ? '생산현장' : (floorSel ? floorSel.options[floorSel.selectedIndex].text : '')); 
        const items = globalOccupancy.filter(x => x.location_id === searchId); let dateLabel = currentZone === '냉장' ? '산란일' : '입고일'; 
        let panelHtml = `<div class="bg-indigo-50 p-3 md:p-4 rounded-lg border border-indigo-200 mb-4"><div class="flex justify-between items-start"><div><div class="text-[10px] text-indigo-500 font-bold mb-1">선택된 위치</div><div class="text-2xl md:text-3xl font-black text-indigo-900">${displayId}</div></div><div class="text-right"><span class="inline-block bg-white text-indigo-700 text-[10px] md:text-xs font-bold px-2 py-1 rounded shadow-sm border border-indigo-100">${floorName}</span></div></div></div>`; 
        if(items.length > 0) { 
            panelHtml += `<div class="mb-2 text-[10px] md:text-xs font-bold text-slate-500">적재 목록 (드래그하여 이동 가능)</div>`; 
            items.forEach(item => { 
                let dateHtml = item.production_date ? `<div class="text-[10px] md:text-xs text-rose-600 font-bold mt-1">${dateLabel}: ${item.production_date}</div>` : ''; 
                let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks) || productMaster.find(p => p.item_name === item.item_name && p.supplier === item.remarks); 
                let cost = pInfo ? (pInfo.unit_price * item.quantity).toLocaleString() : '0'; 
                let dynPallet = getDynamicPalletCount(item); let palletDisplay = dynPallet > 0 ? `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] ml-1 font-black">${dynPallet.toFixed(1)} P</span>` : ''; 
                let editBtn = `<button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date || ''}', '${searchId}', '${item.remarks || ''}')" class="flex-1 bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200 py-1.5 rounded text-[10px] md:text-[11px] font-bold transition-colors mt-2 w-full">⚙️ 편집/삭제</button>`;
                
                panelHtml += `<div draggable="true" ondragstart="onCardDragStart(event, '${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}', '${item.remarks||''}')" ondragend="onDragEnd(event)" class="bg-white border border-slate-200 rounded-lg p-2 md:p-3 shadow-sm mb-2 md:mb-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"><div class="flex justify-between items-start mb-2"><div><span class="text-[9px] md:text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span><div class="font-black text-xs md:text-sm text-slate-800 mt-1 break-keep">${item.item_name}</div><div class="text-[9px] md:text-[10px] text-slate-400 font-bold text-rose-600">입고처: ${item.remarks||'기본'}</div></div><div class="text-right"><div class="text-sm md:text-base font-bold text-indigo-600">${item.quantity.toLocaleString()} EA ${palletDisplay}</div></div></div>${dateHtml}<div class="flex space-x-2 mt-3 border-t pt-2"><button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-[10px] md:text-[11px] font-bold transition-colors">선택 출고</button></div>${editBtn}</div>`; 
            }); 
        } else { panelHtml += `<div class="text-center text-slate-400 py-4 md:py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-4"><b class="text-emerald-600 inline-block text-sm">비어있습니다</b></div>`; } 
        
        let locHistory = globalHistory.filter(h => h.location_id === searchId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5); 
        let histHtml = '<div class="mt-6 pt-4 border-t border-slate-200"><h3 class="text-xs md:text-sm font-black text-slate-700 mb-3 flex items-center">최근 내역 (최대 5건)</h3><div class="space-y-2">'; 
        if(locHistory.length > 0) { 
            locHistory.forEach(h => { 
                let actionColor = h.action_type === '입고' ? 'text-emerald-600' : (h.action_type === '출고' ? 'text-rose-600' : (h.action_type.includes('삭제') ? 'text-slate-400 line-through' : 'text-blue-600')); 
                let dateStr = h.production_date ? h.production_date : new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); 
                histHtml += `<div class="bg-white p-2 border border-slate-200 rounded text-[10px] md:text-xs shadow-sm"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${dateStr}</span><br><span class="font-bold text-slate-700">${h.item_name} <span class="text-slate-400">(${h.quantity}EA / ${h.pallet_count ? h.pallet_count.toFixed(1) : 1}P)</span></span></div>`; 
            }); 
        } else { histHtml += `<div class="text-[10px] md:text-xs text-slate-400 text-center py-4">기록이 없습니다.</div>`; } 
        histHtml += '</div></div>'; panelHtml += histHtml;

        if(panel) panel.innerHTML = panelHtml; 
    } catch(e) { console.error("Click Cell Error:", e); }
}

async function editInventoryItem(invId, itemName, qty, date, locId, remarks) {
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
    const qtyStr = prompt(`[${itemName}] 소진할 수량(EA)을 입력하세요. (최대 ${maxQty}EA)`, maxQty); 
    if(!qtyStr) return; const qty = parseInt(qtyStr); 
    if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("잘못된 수량"); 
    const outPallet = getDynamicPalletCount({item_name: itemName, remarks: null, quantity: qty}); 
    try { 
        const res = await fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: qty, pallet_count: outPallet }) }); 
        const result = await res.json(); 
        if(result.status === 'success') { alert("출고 완료!"); await load(); } 
        else { alert(`출고 실패: ${result.message}`); } 
    } catch(e) {} 
}

function updateDashboard() { 
    try {
        let dashPeriod = document.getElementById('dash-period');
        if(!dashPeriod) return;
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
        
        let dashZoneSel = document.getElementById('dash-zone-select');
        const dashZone = dashZoneSel ? dashZoneSel.value : 'ALL'; 
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
        
    } catch(e) { console.error("Dashboard Render Error:", e); }
}

function updateMapSearchCategoryDropdown() {
    let sourceItems = [];
    if (currentZone === '실온') sourceItems = productMaster.filter(p => p.category && !p.category.includes('원란'));
    else if (currentZone === '냉장') sourceItems = productMaster.filter(p => p.category && p.category.includes('원란'));
    else if (currentZone === '현장') sourceItems = finishedProductMaster;
    const categories = [...new Set(sourceItems.map(p => p.category))].filter(Boolean).sort();
    const catSelect = document.getElementById('map-search-category');
    if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateMapSearchItemDropdown(); }
}

function updateMapSearchItemDropdown() {
    let sourceItems = [];
    if (currentZone === '실온') sourceItems = productMaster.filter(p => p.category && !p.category.includes('원란'));
    else if (currentZone === '냉장') sourceItems = productMaster.filter(p => p.category && p.category.includes('원란'));
    else if (currentZone === '현장') sourceItems = finishedProductMaster;
    const catSelect = document.getElementById('map-search-category'); 
    if (catSelect && catSelect.value !== 'ALL') sourceItems = sourceItems.filter(p => p.category === catSelect.value); 
    const uniqueItems = [...new Set(sourceItems.map(p => p.item_name))].filter(Boolean).sort();
    const datalist = document.getElementById('map-search-item-list');
    if(datalist) { datalist.innerHTML = uniqueItems.map(name => `<option value="${name}">`).join(''); }
    let searchKw = document.getElementById('map-search-keyword');
    if(searchKw) searchKw.value = '';
}

function getSummarySourceItems() {
    const typeSelect = document.getElementById('summary-type');
    if(!typeSelect) return [];
    const type = typeSelect.value;
    if (type === 'FINISHED') return finishedProductMaster;
    if (type === 'MATERIAL') return productMaster.filter(p => p.category && !p.category.includes('원란'));
    if (type === 'RAW') return productMaster.filter(p => p.category && p.category.includes('원란'));
    return [...finishedProductMaster, ...productMaster];
}

function updateSummarySupplierDropdown() {
    let items = getSummarySourceItems(); let suppliers = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
    const supSelect = document.getElementById('summary-supplier');
    if (supSelect) { supSelect.innerHTML = `<option value="ALL">전체 입고처</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join(''); updateSummaryCategoryDropdown(); }
}

function updateSummaryCategoryDropdown() {
    let items = getSummarySourceItems(); const supSelect = document.getElementById('summary-supplier'); const supplier = supSelect ? supSelect.value : 'ALL';
    if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
    let categories = [...new Set(items.map(p => p.category))].filter(Boolean).sort();
    const catSelect = document.getElementById('summary-category');
    if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체 카테고리</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateSummaryItemDropdown(); }
}

function updateSummaryItemDropdown() {
    let items = getSummarySourceItems(); const supSelect = document.getElementById('summary-supplier'); const catSelect = document.getElementById('summary-category');
    const supplier = supSelect ? supSelect.value : 'ALL'; const cat = catSelect ? catSelect.value : 'ALL';
    if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
    if (cat !== 'ALL') items = items.filter(p => p.category === cat);
    const uniqueItems = [...new Set(items.map(p => p.item_name))].filter(Boolean).sort();
    const itemSelect = document.getElementById('summary-item');
    if(itemSelect) { itemSelect.innerHTML = `<option value="">품목을 선택하세요</option>` + uniqueItems.map(name => `<option value="${name}">${name}</option>`).join(''); }
    calculateSummary();
}

function calculateSummary() {
    const itemSelect = document.getElementById('summary-item');
    if(!itemSelect) return;
    const itemName = itemSelect.value; const supplier = document.getElementById('summary-supplier').value;
    let breakdown = {}; let totalQty = 0; let totalPallet = 0;
    if(itemName) {
        globalOccupancy.forEach(item => {
            let itemSupplier = item.remarks || "기본입고처";
            if(item.item_name === itemName) {
                if (supplier === 'ALL' || itemSupplier === supplier) {
                    if(!breakdown[itemSupplier]) breakdown[itemSupplier] = { qty: 0, pallet: 0 };
                    let dynP = getDynamicPalletCount(item);
                    breakdown[itemSupplier].qty += item.quantity; breakdown[itemSupplier].pallet += dynP;
                    totalQty += item.quantity; totalPallet += dynP;
                }
            }
        });
    }
    document.getElementById('summary-result').innerHTML = `${totalQty.toLocaleString()} <span class="text-xl md:text-2xl text-indigo-400 font-bold">EA</span>`;
    document.getElementById('summary-pallet').innerText = `${totalPallet.toFixed(1)} P (부피 합산)`;
    
    let breakdownHtml = ''; let supKeys = Object.keys(breakdown);
    if(supKeys.length > 0) {
        breakdownHtml = '<div class="space-y-2 mt-4">';
        supKeys.forEach(sup => { breakdownHtml += `<div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm md:text-base"><span class="font-bold text-slate-700 text-left w-1/3 truncate" title="${sup}">${sup}</span><span class="font-black text-indigo-600 w-1/3 text-right">${breakdown[sup].qty.toLocaleString()} EA</span><span class="font-bold text-rose-500 w-1/3 text-right">${breakdown[sup].pallet.toFixed(1)} P</span></div>`; });
        breakdownHtml += '</div>';
    }
    document.getElementById('summary-breakdown').innerHTML = breakdownHtml;
}

function findItemLocationFromSummary() {
    const itemName = document.getElementById('summary-item').value; const supplier = document.getElementById('summary-supplier').value;
    if(!itemName) return alert("먼저 위치를 확인할 품목을 선택해주세요.");
    let targets = globalOccupancy.filter(item => { let itemSupplier = item.remarks || "기본입고처"; if(item.item_name === itemName) { if (supplier === 'ALL' || itemSupplier === supplier) return true; } return false; });
    if(targets.length === 0) return alert("현재 창고에 해당 품목의 재고가 없습니다.");
    globalSearchTargets = targets.map(t => t.location_id);
    let firstLoc = globalSearchTargets[0];
    if (firstLoc.startsWith('FL-')) { currentZone = '현장'; } else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
    showView('order'); switchOrderTab('inventory');
    let zoneMap = {'실온':'실온(Room)', '냉장':'냉장(Cold)', '현장':'현장(Floor)'}; let foundZones = new Set();
    globalSearchTargets.forEach(loc => { if(loc.startsWith('FL-')) foundZones.add('현장'); else if(loc.startsWith('C-')) foundZones.add('냉장'); else foundZones.add('실온'); });
    alert(`[${itemName}] 위치 추적 완료!\n(발견 구역: ${Array.from(foundZones).map(z => zoneMap[z]).join(', ')})`); 
}

function executeMapSearch() { 
    const catSelect = document.getElementById('map-search-category').value; const keyword = document.getElementById('map-search-keyword').value.trim().toLowerCase(); const countStr = document.getElementById('map-search-count').value; const count = parseInt(countStr); 
    if(catSelect === 'ALL' && !keyword) return alert("카테고리를 선택하거나 검색할 단어를 입력해주세요."); 
    let matches = globalOccupancy; if(catSelect !== 'ALL') matches = matches.filter(x => x.category === catSelect); if(keyword) matches = matches.filter(x => x.item_name.toLowerCase().includes(keyword));
    if(matches.length === 0) return alert("조건에 맞는 품목이 현재 구역에 없습니다."); 
    matches.sort((a, b) => { let tA = a.production_date ? new Date(a.production_date).getTime() : Infinity; let tB = b.production_date ? new Date(b.production_date).getTime() : Infinity; return tA - tB; }); 
    let targets = matches.slice(0, count); globalSearchTargets = targets.map(t => t.location_id);
    let firstLoc = globalSearchTargets[0];
    if (firstLoc.startsWith('FL-')) { currentZone = '현장'; } else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
    updateZoneTabs(); renderMap(); 
}

function highlightFIFO() { 
    const eggs = globalOccupancy.filter(x => x.production_date && x.location_id.startsWith('C-')); 
    if(eggs.length === 0) return alert("냉장 창고에 산란일 데이터 없음"); 
    eggs.sort((a, b) => new Date(a.production_date) - new Date(b.production_date)); 
    const oldestDate = eggs[0].production_date; 
    let targets = eggs.filter(x => x.production_date === oldestDate);
    globalSearchTargets = targets.map(t => t.location_id);
    let firstLoc = globalSearchTargets[0];
    currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1";
    updateZoneTabs(); renderMap(); alert(`가장 오래된 산란일: ${oldestDate}\n해당 위치를 깜빡이로 표시합니다.`); 
}

function populateProductFilters(targetType) {
    let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster;
    let prefix = targetType === 'finished' ? 'fp' : 'pm';
    
    let filterCat = document.getElementById(`${prefix}-filter-cat`);
    let filterSup = document.getElementById(`${prefix}-filter-sup`);
    
    if(!filterCat || !filterSup) return;
    
    let curCat = filterCat.value;
    let curSup = filterSup.value;

    let cats = [...new Set(dataArray.map(p => p.category))].filter(Boolean).sort();
    let sups = [...new Set(dataArray.map(p => p.supplier))].filter(Boolean).sort();

    filterCat.innerHTML = `<option value="ALL">전체 카테고리</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    filterSup.innerHTML = `<option value="ALL">전체 ${targetType==='finished'?'생산처':'입고처'}</option>` + sups.map(s => `<option value="${s}">${s}</option>`).join('');
    
    if(cats.includes(curCat)) filterCat.value = curCat;
    if(sups.includes(curSup)) filterSup.value = curSup;
}

function renderProductMaster(targetType) { 
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    const searchInput = document.getElementById(`${prefix}-search`);
    const filterCatEl = document.getElementById(`${prefix}-filter-cat`);
    const filterSupEl = document.getElementById(`${prefix}-filter-sup`);
    
    if(!filterCatEl || !filterSupEl) return;
    
    const filterCat = filterCatEl.value;
    const filterSup = filterSupEl.value;
    const keyword = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
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
        
        let delBtn = isAdmin ? `<button onclick="deleteProduct('${p.item_name}', '${p.supplier}', '${targetType}')" class="text-rose-500 hover:bg-rose-100 p-1.5 rounded transition-colors" title="삭제">❌</button>` : ''; 
        let badgeColor = targetType === 'finished' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600';
        
        return `<tr class="transition-colors ${rowBg}">
            <td class="p-2 md:p-3"><span class="text-[10px] ${badgeColor} px-2 py-1 rounded-md font-bold shadow-sm">${p.category}</span></td>
            <td class="p-2 md:p-3 font-black text-slate-800 text-xs md:text-sm">${p.item_name}</td>
            <td class="p-2 md:p-3 font-bold text-rose-600 text-[10px] md:text-xs bg-rose-50 rounded px-2">${p.supplier}</td>
            <td class="p-2 md:p-3 text-right font-black text-indigo-600 text-xs md:text-sm bg-indigo-50 rounded">${p.pallet_ea.toLocaleString()} <span class="text-[10px] font-normal text-slate-500">EA/P</span></td>
            <td class="p-2 md:p-3 text-right text-[10px] text-slate-500 font-bold"><span class="block text-slate-400">일 ${p.daily_usage.toLocaleString()}개</span><span class="block text-slate-700">${p.unit_price.toLocaleString()}원</span></td>
            <td class="p-2 md:p-3 text-center flex justify-center space-x-1 items-center h-full pt-3">
                <button onclick="editProductSetup('${p.category}', '${p.item_name}', '${p.supplier}', ${p.daily_usage}, ${p.unit_price}, ${p.pallet_ea}, '${targetType}')" class="text-blue-600 bg-blue-50 hover:bg-blue-200 px-2 py-1 rounded shadow-sm transition-colors text-xs font-bold" title="수정">수정</button>
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
}

function editProductSetup(cat, name, supplier, usage, price, ea, targetType) { 
    editingProductOriginalName = name; editingProductOriginalSupplier = supplier; 
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    document.getElementById(`${prefix}-cat`).value = cat; 
    document.getElementById(`${prefix}-name`).value = name; 
    document.getElementById(`${prefix}-supplier`).value = supplier; 
    document.getElementById(`${prefix}-usage`).value = usage; 
    document.getElementById(`${prefix}-price`).value = price; 
    document.getElementById(`${prefix}-pallet-ea`).value = ea || 1; 
    document.getElementById(`${prefix}-form-title`).innerText = "기존 항목 수정 중 ✏️"; 
    document.getElementById(`${prefix}-submit-btn`).innerText = "✅ 저장하기"; 
    document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-indigo-600', 'bg-emerald-600'); 
    document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-indigo-700', 'hover:bg-emerald-700'); 
    document.getElementById(`${prefix}-cancel-btn`).classList.remove('hidden'); 
    renderProductMaster(targetType); 
}

function cancelEdit(targetType) { 
    editingProductOriginalName = null; editingProductOriginalSupplier = null; 
    const prefix = targetType === 'finished' ? 'fp' : 'pm'; const title = targetType === 'finished' ? '신규 완제품 추가' : '신규 자재 추가';
    document.getElementById(`${prefix}-cat`).value = ''; 
    document.getElementById(`${prefix}-name`).value = ''; 
    document.getElementById(`${prefix}-supplier`).value = ''; 
    document.getElementById(`${prefix}-usage`).value = '0'; 
    document.getElementById(`${prefix}-price`).value = '0'; 
    document.getElementById(`${prefix}-pallet-ea`).value = '1'; 
    document.getElementById(`${prefix}-form-title`).innerText = title; 
    document.getElementById(`${prefix}-submit-btn`).innerText = "등록하기"; 
    document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-emerald-600', 'bg-indigo-600'); 
    document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-emerald-700', 'hover:bg-indigo-700'); 
    document.getElementById(`${prefix}-cancel-btn`).classList.add('hidden'); 
    renderProductMaster(targetType);
}

async function submitProduct(targetType) { 
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    const cat = document.getElementById(`${prefix}-cat`).value.trim(); const name = document.getElementById(`${prefix}-name`).value.trim(); const supplier = document.getElementById(`${prefix}-supplier`).value.trim() || (targetType==='finished'?'자체생산':'기본입고처'); const usage = parseInt(document.getElementById(`${prefix}-usage`).value) || 0; const price = parseInt(document.getElementById(`${prefix}-price`).value) || 0; const ea = parseInt(document.getElementById(`${prefix}-pallet-ea`).value) || 1; 
    if(!cat || !name) return alert("카테고리와 이름은 필수입니다."); 
    const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
    try { 
        if(editingProductOriginalName) { 
            const res = await fetch(`${endpoint}?old_name=${encodeURIComponent(editingProductOriginalName)}&old_supplier=${encodeURIComponent(editingProductOriginalSupplier)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
            const result = await res.json();
            if(result.status === 'success') { alert("수정 완료"); cancelEdit(targetType); } else { alert(`수정 실패: ${result.message}`); }
        } else { 
            const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
            const result = await res.json();
            if(result.status === 'success') { alert("등록 완료"); document.getElementById(`${prefix}-name`).value = ''; document.getElementById(`${prefix}-supplier`).value = ''; } else { alert(`등록 실패: ${result.message}`); }
        } 
        await load(); 
    } catch(e) { alert("서버 통신 실패"); } 
}

async function deleteProduct(name, supplier, targetType) { 
    if(!confirm(`[${name} - ${supplier}] 항목을 개별 삭제하시겠습니까?`)) return; 
    const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
    try { await fetch(`${endpoint}?item_name=${encodeURIComponent(name)}&supplier=${encodeURIComponent(supplier)}`, { method: 'DELETE' }); await load(); } catch(e) {} 
}

async function deleteAllProducts(targetType) { 
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
    const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); 
    const endpoint = targetType === 'finished' ? '/api/finished_products_batch' : '/api/products_batch';
    const msg = targetType === 'finished' ? "제품" : "자재";
    reader.onload = async function(ev) { 
        try { 
            const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); 
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); 
            if(json.length > 0) { 
                const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); 
                const result = await res.json();
                if(result.status === 'success') { alert(`${msg} 대량 업로드 완료!`); await load(); } 
                else { alert(`업로드 실패: 중복된 데이터가 있거나 양식이 맞지 않습니다. (${result.message})`); }
            } else { alert("업로드할 데이터가 없습니다."); }
        } catch(err) { console.error(err); alert("업로드 처리 중 오류 발생: 엑셀 양식을 다시 확인해주세요."); } 
    }; reader.readAsArrayBuffer(file); e.target.value = ''; 
}

function exportBomExcel() {
    let wsData = bomMaster.length === 0 ? [{"완제품명": "", "부자재명": "", "소요수량(EA)": ""}] : bomMaster.map(b => ({"완제품명": b.finished_product, "부자재명": b.material_product, "소요수량(EA)": b.require_qty}));
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 25}, {wch: 25}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, "BOM마스터"); XLSX.writeFile(wb, "한스팜_BOM레시피_양식.xlsx");
}

function importBomExcel(e) {
    const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
    reader.onload = async function(ev) {
        try {
            const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if(json.length > 0) { 
                const res = await fetch('/api/bom_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); 
                const result = await res.json();
                if(result.status === 'success') { alert("BOM 대량 업로드 완료!"); await load(); } 
                else { alert(`업로드 실패: ${result.message}`); }
            }
        } catch(err) { alert("업로드 처리 중 오류 발생"); }
    }; reader.readAsArrayBuffer(file); e.target.value = '';
}

function updateBomDropdowns() {
    const fNames = [...new Set(finishedProductMaster.map(p => p.item_name))].filter(Boolean).sort();
    const mNames = [...new Set(productMaster.map(p => p.item_name))].filter(Boolean).sort();
    const fOptions = fNames.length > 0 ? fNames.map(name => `<option value="${name}">${name}</option>`).join('') : `<option value="">[제품 마스터]에 제품을 등록해주세요</option>`;
    const mOptions = mNames.length > 0 ? mNames.map(name => `<option value="${name}">${name}</option>`).join('') : `<option value="">[자재 마스터]에 자재를 등록해주세요</option>`;
    document.getElementById('bom-finished').innerHTML = fOptions; document.getElementById('bom-material').innerHTML = mOptions;
}

function renderBomMaster() {
    const tbody = document.getElementById('bom-list');
    if(bomMaster.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-slate-400 font-bold">등록된 레시피가 없습니다.</td></tr>`; return; }
    bomMaster.sort((a, b) => a.finished_product.localeCompare(b.finished_product));
    tbody.innerHTML = bomMaster.map(b => {
        let delBtn = isAdmin ? `<button onclick="deleteBom('${b.id}')" class="text-rose-500 hover:bg-rose-100 p-1.5 rounded transition-colors" title="삭제">❌</button>` : '';
        return `<tr class="hover:bg-slate-50 transition-colors"><td class="p-2 border-b border-slate-100 font-black text-emerald-800 text-xs md:text-sm">${b.finished_product}</td><td class="p-2 border-b border-slate-100 text-center text-slate-400">➡️</td><td class="p-2 border-b border-slate-100 font-bold text-indigo-800 text-xs md:text-sm">${b.material_product}</td><td class="p-2 border-b border-slate-100 text-right font-black text-slate-700 text-xs md:text-sm">${b.require_qty} <span class="text-[10px] font-normal text-slate-500">EA</span></td><td class="p-2 border-b border-slate-100 text-center">${delBtn}</td></tr>`;
    }).join('');
}

async function submitBom() {
    const finished = document.getElementById('bom-finished').value; const material = document.getElementById('bom-material').value; const qty = parseFloat(document.getElementById('bom-qty').value);
    if(!finished || !material || isNaN(qty) || qty <= 0) return alert("입력값을 확인해주세요.");
    if(finished === material) return alert("완제품과 자재가 같을 수 없습니다!");
    try { 
        const res = await fetch('/api/bom', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ finished_product: finished, material_product: material, require_qty: qty }) }); 
        const result = await res.json();
        if(result.status === 'success') { alert("레시피 연결 완료!"); document.getElementById('bom-qty').value = 1; await load(); }
        else { alert(`등록 실패: ${result.message}`); }
    } catch(e) { alert("서버 통신 실패"); }
}

async function deleteBom(id) { if(!confirm("이 레시피 연결을 삭제하시겠습니까?")) return; try { await fetch(`/api/bom?id=${id}`, { method: 'DELETE' }); await load(); } catch(e) { alert("삭제 실패"); } }

// 💡 [정산회계] 조회 필터 연동 및 테이블 출력 로직
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
    } catch (error) { alert("엑셀 다운로드 중 오류가 발생했습니다."); }
}

window.onload = function() { load(); showView('dashboard'); };
