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

function closeHistoryModal() { document.getElementById('history-modal').classList.add('hidden'); document.getElementById('history-modal').classList.remove('flex'); }

async function closeInventory() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 불가능합니다.");
    if(!isAdmin) return alert("🔒 관리자 권한이 필요합니다. 좌측 로고를 클릭해 로그인해주세요.");
    if(!confirm("⚠️ [재고마감]\n현재 렉맵에 적재된 모든 품목을 '(기존재고)'로 마감 처리하시겠습니까?\n이후 월간 소요량 파악 및 악성 재고 필터링에 기준이 됩니다.")) return;
    try { await fetch('/api/close_inventory', { method: 'POST' }); alert("✅ 재고 마감 처리 완료!"); await load(); } catch(e) { alert("마감 처리 중 오류가 발생했습니다."); }
}

function toggleMapSearch() { const container = document.getElementById('map-search-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }
function toggleWaitContainer() { const container = document.getElementById('wait-container'); if(container.classList.contains('hidden')) { container.classList.remove('hidden'); container.classList.add('flex'); } else { container.classList.add('hidden'); container.classList.remove('flex'); } }

function toggleOrderCart() {
    const el = document.getElementById('order-cart-container');
    if(el.classList.contains('hidden')) { el.classList.remove('hidden'); el.classList.add('flex'); updateOrderCartDropdowns(); } 
    else { el.classList.add('hidden'); el.classList.remove('flex'); }
}

function updateOrderCartDropdowns() {
    try {
        let sups = [...new Set(productMaster.map(p=>p.supplier))].filter(Boolean).sort();
        let supSel = document.getElementById('oc-sup');
        if(supSel) { 
            let cur = supSel.value; supSel.innerHTML = '<option value="">1. 발주처 선택</option>' + sups.map(s=>`<option value="${s}">${s}</option>`).join(''); 
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
            let cur = catSel.value; catSel.innerHTML = '<option value="">2. 카테고리 선택</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join(''); 
            if(cats.includes(cur)) catSel.value = cur;
            updateOrderCartItemDropdown(); 
        }
    } catch(e) {}
}

function updateOrderCartItemDropdown() {
    try {
        let sup = document.getElementById('oc-sup').value; let cat = document.getElementById('oc-cat').value;
        let items = [...new Set(productMaster.filter(p=>p.supplier===sup && p.category===cat).map(p=>p.item_name))].filter(Boolean).sort();
        let itemSel = document.getElementById('oc-item');
        if(itemSel) { 
            let cur = itemSel.value; itemSel.innerHTML = '<option value="">3. 품목 선택</option>' + items.map(c=>`<option value="${c}">${c}</option>`).join(''); 
            if(items.includes(cur)) itemSel.value = cur;
        }
    } catch(e) {}
}

function addOrderCartItem() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    let cat = document.getElementById('oc-cat').value; let item = document.getElementById('oc-item').value; let sup = document.getElementById('oc-sup').value; let pal = parseFloat(document.getElementById('oc-pal').value);
    if(!item || !sup || isNaN(pal) || pal <= 0) return alert("품목, 발주처, 파레트 수량을 정확히 선택/입력하세요.");

    let pInfo = productMaster.find(p=>p.item_name===item && p.supplier===sup);
    let eaPerPallet = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1; let totalQty = Math.round(pal * eaPerPallet);

    orderCart.push({ category: cat, item_name: item, supplier: sup, pallet_count: pal, quantity: totalQty });
    document.getElementById('oc-pal').value = ''; renderOrderCart();
}

function removeOrderCartItem(index) { if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 삭제할 수 없습니다."); orderCart.splice(index, 1); renderOrderCart(); }

function renderOrderCart() {
    let tbody = document.getElementById('order-cart-tbody'); if(!tbody) return;
    if(orderCart.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-slate-400 font-bold">장바구니가 비어있습니다.</td></tr>`; return; }
    
    tbody.innerHTML = orderCart.map((item, idx) => {
        let delBtn = loginMode === 'viewer' ? '' : `<button onclick="removeOrderCartItem(${idx})" class="text-rose-500 hover:bg-rose-100 px-2 py-1 rounded font-bold">❌</button>`;
        return `<tr class="border-b border-slate-100"><td class="p-2 font-bold text-rose-600">${item.supplier}</td><td class="p-2 font-black text-slate-800">${item.item_name}</td><td class="p-2 text-right font-black text-indigo-600">${item.pallet_count} P <span class="text-[10px] font-normal text-slate-500">(${item.quantity.toLocaleString()}EA)</span></td><td class="p-2 text-center">${delBtn}</td></tr>`;
    }).join('');
}

async function submitOrderCart() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
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
            alert("✅ 발주가 등록되었습니다. (브라우저 권한으로 텍스트 자동 복사는 실패했습니다)"); orderCart = []; toggleOrderCart(); await load();
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
        if(loginMode !== 'viewer') { actionBtns = `<button onclick="receiveOrder('${o.id}', '${o.item_name}', ${o.quantity}, ${o.pallet_count}, '${o.remarks}', '${o.category || ''}')" class="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1.5 rounded shadow-sm transition-colors text-xs">입고처리</button> <button onclick="cancelOrder('${o.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-2 py-1.5 rounded transition-colors text-xs">취소</button>`; }
        return `<tr class="hover:bg-slate-50 transition-colors"><td class="p-3 text-slate-500 font-bold">${o.created_at.substring(0,10)}</td><td class="p-3 font-black text-rose-600">${o.remarks || '기본'}</td><td class="p-3 font-black text-slate-800">${o.item_name}</td><td class="p-3 text-right font-black text-indigo-600">${o.pallet_count} P <span class="text-[10px] font-normal text-slate-500">(${o.quantity.toLocaleString()}EA)</span></td><td class="p-3 text-center"><span class="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-[10px] font-black animate-pulse">발주 대기중</span></td><td class="p-3 text-center space-x-1">${actionBtns}</td></tr>`;
    }).join('');
}

async function receiveOrder(logId, itemName, qty, pallet, supplier, cat) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 불가능합니다.");
    let emptyW = ""; for(let i=1; i<=30; i++) { let wId = `W-${i.toString().padStart(2, '0')}`; if(!globalOccupancy.find(o => o.location_id === wId)) { emptyW = wId; break; } }
    if(!emptyW) return alert(`⚠️ 대기장(W-01~W-30)이 꽉 찼습니다! 기존 물건을 렉으로 이동시킨 후 다시 시도해주세요.`);
    if(!confirm(`[${itemName}]을(를) [${emptyW}] 위치로 입고 처리하시겠습니까?`)) return;

    try {
        await fetch(`/api/history/${logId}`, { method: 'DELETE' });
        let payload = { location_id: emptyW, category: cat || '미분류', item_name: itemName, quantity: qty, pallet_count: pallet, production_date: new Date().toISOString().split('T')[0], remarks: supplier };
        await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        alert("입고 완료! 대기장에서 물건을 확인하세요."); await load();
    } catch(e) { alert("입고 처리 중 오류가 발생했습니다."); }
}

async function cancelOrder(logId) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 불가능합니다.");
    if(!confirm("이 발주 내역을 정말 취소(삭제)하시겠습니까?")) return;
    try { await fetch(`/api/history/${logId}`, { method: 'DELETE' }); await load(); } catch(e) { alert("취소 실패"); }
}

function getWaitZoneSourceItems() {
    if (currentZone === '실온') return productMaster.filter(p => p.category && !p.category.includes('원란'));
    else if (currentZone === '냉장') return productMaster.filter(p => p.category && p.category.includes('원란'));
    else return [...finishedProductMaster, ...productMaster];
}

function populateWaitDropdowns() {
    try {
        let items = getWaitZoneSourceItems(); let sups = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
        let ws = document.getElementById('wait-supplier');
        if(ws) { let cur = ws.value; ws.innerHTML = `<option value="">1.입고처</option>` + sups.map(s => `<option value="${s}">${s}</option>`).join(''); if(sups.includes(cur)) ws.value = cur; updateWaitCategoryDropdown(); }
    } catch(e) {}
}

function updateWaitCategoryDropdown() {
    try {
        let ws = document.getElementById('wait-supplier'); if(!ws) return;
        let sup = ws.value; let items = getWaitZoneSourceItems();
        let filtered = sup ? items.filter(p => p.supplier === sup) : items;
        let cats = [...new Set(filtered.map(p => p.category))].filter(Boolean).sort();
        let wc = document.getElementById('wait-cat');
        if(wc) { let cur = wc.value; wc.innerHTML = `<option value="">2.카테고리</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join(''); if(cats.includes(cur)) wc.value = cur; updateWaitItemDropdown(); }
    } catch(e) {}
}

function updateWaitItemDropdown() {
    try {
        let ws = document.getElementById('wait-supplier'); let wc = document.getElementById('wait-cat'); if(!ws || !wc) return;
        let sup = ws.value; let cat = wc.value; let items = getWaitZoneSourceItems();
        let filtered = items.filter(p => (!sup || p.supplier === sup) && (!cat || p.category === cat));
        let itemNames = [...new Set(filtered.map(p => p.item_name))].filter(Boolean).sort();
        let wi = document.getElementById('wait-item');
        if(wi) { let cur = wi.value; wi.innerHTML = `<option value="">3.품목명</option>` + itemNames.map(c => `<option value="${c}">${c}</option>`).join(''); if(itemNames.includes(cur)) wi.value = cur; }
    } catch(e) {}
}

async function createWaitingPallets() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 박스를 생성할 수 없습니다.");
    const cat = document.getElementById('wait-cat').value; const item = document.getElementById('wait-item').value; 
    const ws = document.getElementById('wait-supplier'); const supplier = ws ? ws.value || '기본입고처' : '기본입고처';
    let wd = document.getElementById('wait-date'); let date = wd ? wd.value : ''; 
    const qtyInput = document.getElementById('wait-qty').value; const palInput = document.getElementById('wait-pal').value;

    if(!cat || !item) return alert("카테고리와 품목을 선택하세요.");
    if(!qtyInput && !palInput) return alert("총수량(EA) 또는 P수량(파레트) 중 하나를 입력하세요.");
    if(!date) { let t = new Date(); date = t.toISOString().split('T')[0]; }
    
    let pInfo = finishedProductMaster.find(p => p.item_name === item && p.supplier === supplier) || productMaster.find(p => p.item_name === item && p.supplier === supplier) || finishedProductMaster.find(p => p.item_name === item) || productMaster.find(p => p.item_name === item);
    let pEa = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1;
    
    let qty = 0;
    if (palInput && parseFloat(palInput) > 0) { qty = Math.round(parseFloat(palInput) * pEa); } else if (qtyInput && parseInt(qtyInput) > 0) { qty = parseInt(qtyInput); }
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
            await Promise.all(promises); document.getElementById('wait-qty').value = ''; document.getElementById('wait-pal').value = ''; await load(); 
        } catch(e) { alert("생성 중 오류 발생"); }
    }
}

function selectForMove(invId, itemName, maxQty, currentPallet, fromLoc, supplier) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 렉 이동을 할 수 없습니다.");
    if (movingItem && movingItem.invId === invId) { movingItem = null; renderAll(); return; } 
    movingItem = { invId, itemName, maxQty, currentPallet, fromLoc, supplier }; renderAll(); 
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
                let dblClickAttr = loginMode === 'viewer' ? '' : `ondblclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${wId}', '${item.remarks||''}')"`;

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

function updateMapSearchCategoryDropdown() {
    try {
        let sourceItems = [];
        if (currentZone === '실온') sourceItems = productMaster.filter(p => p.category && !p.category.includes('원란'));
        else if (currentZone === '냉장') sourceItems = productMaster.filter(p => p.category && p.category.includes('원란'));
        else if (currentZone === '현장') sourceItems = finishedProductMaster;
        const categories = [...new Set(sourceItems.map(p => p.category))].filter(Boolean).sort();
        const catSelect = document.getElementById('map-search-category');
        if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateMapSearchItemDropdown(); }
    } catch(e){}
}

function updateMapSearchItemDropdown() {
    try {
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
    } catch(e){}
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
    try {
        let items = getSummarySourceItems(); let suppliers = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
        const supSelect = document.getElementById('summary-supplier');
        if (supSelect) { supSelect.innerHTML = `<option value="ALL">전체 입고처</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join(''); updateSummaryCategoryDropdown(); }
    } catch(e){}
}

function updateSummaryCategoryDropdown() {
    try {
        let items = getSummarySourceItems(); const supSelect = document.getElementById('summary-supplier'); const supplier = supSelect ? supSelect.value : 'ALL';
        if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
        let categories = [...new Set(items.map(p => p.category))].filter(Boolean).sort();
        const catSelect = document.getElementById('summary-category');
        if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체 카테고리</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateSummaryItemDropdown(); }
    } catch(e){}
}

function updateSummaryItemDropdown() {
    try {
        let items = getSummarySourceItems(); const supSelect = document.getElementById('summary-supplier'); const catSelect = document.getElementById('summary-category');
        const supplier = supSelect ? supSelect.value : 'ALL'; const cat = catSelect ? catSelect.value : 'ALL';
        if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
        if (cat !== 'ALL') items = items.filter(p => p.category === cat);
        const uniqueItems = [...new Set(items.map(p => p.item_name))].filter(Boolean).sort();
        const itemSelect = document.getElementById('summary-item');
        if(itemSelect) { itemSelect.innerHTML = `<option value="">품목을 선택하세요</option>` + uniqueItems.map(name => `<option value="${name}">${name}</option>`).join(''); }
        calculateSummary();
    } catch(e){}
}

function calculateSummary() {
    try {
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
    } catch(e){}
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
