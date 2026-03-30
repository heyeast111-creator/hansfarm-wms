// ==========================================
// [재고/발주] - 상단 탭 및 구역 전환 로직
// ==========================================
window.floorFilterMap = window.floorFilterMap || { 'FL-1F': true, 'FL-2F': true, 'FL-3F': true };
window.areaFilterMap = window.areaFilterMap || { 'R': true, 'M': true, 'P': true, 'G': true };

function toggleFloorFilter(fId) { window.floorFilterMap[fId] = !window.floorFilterMap[fId]; renderMap(); }
function toggleAreaFilter(aKey) { window.areaFilterMap[aKey] = !window.areaFilterMap[aKey]; renderMap(); }

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
            if(isRightPanelVisible && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); }
            renderMap();
        } else { 
            if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); } 
        }

        if(tab === 'search') updateSummarySupplierDropdown();
        if(tab === 'safety') renderSafetyStock();
        if(tab === 'history') { updateOrderCartDropdowns(); renderOrderList(); }
    } catch(e) {}
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
    if(window.innerWidth < 768 && rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); isRightPanelVisible = false; }
    updateZoneTabs(); renderMap(); populateWaitDropdowns();
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

function changeFloorCols(areaId, delta) {
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 수정할 수 없습니다.");
    let currentCols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;
    let newCols = currentCols + delta;

    if(newCols < 1) return alert("최소 1칸 이상이어야 합니다.");
    if(newCols > 100) return alert("최대 100칸까지 생성 가능합니다.");

    if(delta < 0) {
        let targetId = `${areaId}-${currentCols.toString().padStart(2, '0')}`;
        let hasItem = globalOccupancy.some(item => item.location_id === targetId);
        if(hasItem) return alert(`해당 구역의 마지막 칸(${targetId})에 재고가 남아있어 줄일 수 없습니다.`);
    }

    localStorage.setItem(areaId + '_cols', newCols);
    renderMap();
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
            let pulseClass = (movingItem && movingItem.fromLoc === wId) ? 'highlight-move' : '';

            if(items.length > 0) {
                let item = items[0]; let totalQty = items.reduce((sum, o) => sum + o.quantity, 0); let totalPallet = items.reduce((sum, o) => sum + getDynamicPalletCount(o), 0);
                waitHtml += `<div id="cell-${wId}" draggable="true" ondragstart="onWaitDragStart(event, '${wId}')" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${wId}', '${wId}')" onclick="clickCell('${wId}', '${wId}')" class="bg-indigo-100 border-2 border-indigo-400 rounded-lg p-1 flex flex-col items-center justify-center text-center cursor-grab shadow-sm h-16 md:h-20 hover:scale-105 transition-all overflow-hidden ${pulseClass}"><span class="text-[8px] font-black text-indigo-800 truncate w-full px-1">${item.item_name}</span><span class="text-[10px] font-black text-rose-600 mt-0.5">${totalQty.toLocaleString()}</span><span class="text-[7px] font-bold text-slate-500">${totalPallet.toFixed(1)}P</span></div>`;
            } else {
                waitHtml += `<div id="cell-${wId}" onclick="clickCell('${wId}', '${wId}')" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${wId}', '${wId}')" class="bg-white border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center h-16 md:h-20 text-slate-300 font-black text-xs opacity-50 cursor-pointer ${pulseClass}">${i}</div>`;
            }
        }
        let wGrid = document.getElementById('waiting-grid'); if(wGrid) wGrid.innerHTML = waitHtml;

        let vHtml = ''; if(hContainer) hContainer.innerHTML = ''; 
        
        // 💡 생산 현장 렌더링 (층별/구역별 토글 추가)
        if(currentZone === '현장') { 
            let aisleText = document.getElementById('aisle-text'); if(aisleText) aisleText.classList.add('hidden'); 
            
            vHtml += `
            <div class="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-center">
                <div class="flex items-center space-x-2 md:space-x-4 border-r pr-4 border-slate-300">
                    <span class="text-xs md:text-sm font-black text-slate-500">층별 토글:</span>
                    <label class="cursor-pointer text-xs md:text-sm font-bold flex items-center"><input type="checkbox" ${window.floorFilterMap['FL-1F']?'checked':''} onchange="toggleFloorFilter('FL-1F')" class="mr-1">1층</label>
                    <label class="cursor-pointer text-xs md:text-sm font-bold flex items-center"><input type="checkbox" ${window.floorFilterMap['FL-2F']?'checked':''} onchange="toggleFloorFilter('FL-2F')" class="mr-1">2층</label>
                    <label class="cursor-pointer text-xs md:text-sm font-bold flex items-center"><input type="checkbox" ${window.floorFilterMap['FL-3F']?'checked':''} onchange="toggleFloorFilter('FL-3F')" class="mr-1">3층</label>
                </div>
                <div class="flex items-center space-x-2 md:space-x-4">
                    <span class="text-xs md:text-sm font-black text-slate-500">창고 토글:</span>
                    <label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-orange-600"><input type="checkbox" ${window.areaFilterMap['R']?'checked':''} onchange="toggleAreaFilter('R')" class="mr-1">원란</label>
                    <label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-blue-600"><input type="checkbox" ${window.areaFilterMap['M']?'checked':''} onchange="toggleAreaFilter('M')" class="mr-1">자재</label>
                    <label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-emerald-600"><input type="checkbox" ${window.areaFilterMap['P']?'checked':''} onchange="toggleAreaFilter('P')" class="mr-1">제품</label>
                    <label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-slate-600"><input type="checkbox" ${window.areaFilterMap['G']?'checked':''} onchange="toggleAreaFilter('G')" class="mr-1">일반(3층)</label>
                </div>
            </div>`;

            const prodSiteConfig = [
                { id: 'FL-1F', name: '🏢 생산현장 1층', areas: [
                    { key: 'R', title: '🥚 원란창고', color: 'orange', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-800' },
                    { key: 'M', title: '📦 자재창고', color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-800' },
                    { key: 'P', title: '✨ 제품창고', color: 'emerald', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', textColor: 'text-emerald-800' }
                ]},
                { id: 'FL-2F', name: '🏢 생산현장 2층', areas: [
                    { key: 'M', title: '📦 자재창고', color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-800' },
                    { key: 'P', title: '✨ 제품창고', color: 'emerald', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', textColor: 'text-emerald-800' }
                ]},
                { id: 'FL-3F', name: '🏢 생산현장 3층', areas: [
                    { key: 'G', title: '🏭 일반창고(공용)', color: 'slate', bgColor: 'bg-slate-50', borderColor: 'border-slate-200', textColor: 'text-slate-800' }
                ]}
            ];

            vHtml += `<div class="w-full min-w-[800px] flex flex-col space-y-10">`; 
            prodSiteConfig.forEach(floorInfo => { 
                if(!window.floorFilterMap[floorInfo.id]) return; // 층 숨김 처리

                vHtml += `<div class="bg-white p-6 rounded-3xl shadow-lg border border-slate-300">
                    <div class="text-xl font-black text-slate-800 mb-6 flex items-center"><span class="bg-slate-800 text-white px-3 py-1 rounded-lg mr-3 text-sm">${floorInfo.id}</span> ${floorInfo.name}</div>
                    <div class="flex flex-col space-y-6">`;
                
                floorInfo.areas.forEach(area => {
                    if(!window.areaFilterMap[area.key]) return; // 창고 숨김 처리

                    let areaId = `${floorInfo.id}-${area.key}`;
                    let cols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;

                    vHtml += `<div class="${area.bgColor} p-4 rounded-2xl border ${area.borderColor} shadow-sm">
                        <div class="flex justify-between items-center mb-4 pb-2 border-b ${area.borderColor}">
                            <div class="text-sm font-black ${area.textColor}">${area.title}</div>
                            <div class="flex items-center space-x-2">
                                <button onclick="changeFloorCols('${areaId}', -1)" class="bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 font-bold px-2 py-1 rounded text-[10px]">-</button>
                                <span class="font-black text-slate-700 text-xs">${cols} 칸</span>
                                <button onclick="changeFloorCols('${areaId}', 1)" class="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 font-bold px-2 py-1 rounded text-[10px]">+</button>
                            </div>
                        </div>
                        <div class="grid grid-cols-5 md:grid-cols-10 gap-2">`;
                    
                    for (let r = 1; r <= cols; r++) { 
                        let dbId = `${areaId}-${r.toString().padStart(2, '0')}`; 
                        let hasItem = occMap[dbId]; 
                        let cellState = hasItem ? 'cell-full' : 'cell-empty'; 
                        if(selectedCellId === dbId) cellState = 'cell-active'; 
                        
                        let pCount = palletMap[dbId] || 0; 
                        let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black px-1 py-0.5 rounded-full z-10">${pCount.toFixed(1)}P</div>` : ''; 
                        let isTarget = globalSearchTargets.includes(dbId); let pulseClass = isTarget ? 'highlight-pulse' : '';
                        if(movingItem && movingItem.fromLoc === dbId) pulseClass += ' highlight-move';
                        
                        vHtml += `<div id="cell-${dbId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${dbId}', '${dbId}')" onclick="clickCell('${dbId}', '${dbId}')" class="h-14 rounded-lg border-2 flex flex-col items-center justify-center text-[10px] font-black cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm hover:scale-105 transition-all">${badge}<span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}</span></div>`; 
                    } 
                    vHtml += `</div></div>`;
                });
                vHtml += `</div></div>`; 
            }); 
            vHtml += `</div>`; 
            if(vContainer) vContainer.innerHTML = vHtml; 
            return; 
        } 
        
        // --- 실온/냉장 렌더링 ---
        let aisleText = document.getElementById('aisle-text'); if(aisleText) { aisleText.classList.remove('hidden'); aisleText.innerText = "통로 (Aisle)"; }
        const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; const prefix = currentZone === '실온' ? 'R-' : 'C-'; 

        activeLayout.forEach(col => { 
            if (col.aisle) { vHtml += `<div class="w-10 md:w-14 h-[420px] bg-yellow-50/50 flex flex-col items-center justify-center border-x-2 border-yellow-300 shadow-inner rounded-sm mx-1"><span class="text-yellow-600 font-black tracking-widest text-[10px]" style="writing-mode: vertical-rl;">통로</span></div>`; } 
            else if (col.gap) { vHtml += `<div class="w-2 md:w-4"></div>`; } 
            else { 
                vHtml += `<div class="flex flex-col w-10 md:w-14 space-y-1 justify-end"><div class="text-center font-black text-xl text-slate-800 pb-2">${col.id}</div>`; 
                for (let r = col.cols; r >= 1; r--) { 
                    let displayId = `${col.id}${r}`; let dbId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
                    let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
                    let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full z-10">${pCount.toFixed(1)}P</div>` : ''; 
                    let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : '';
                    if(movingItem && movingItem.fromLoc === searchId) pulseClass += ' highlight-move';
                    vHtml += `<div id="cell-${displayId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${displayId}', '${dbId}')" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[9px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${displayId}</div>`; 
                } 
                vHtml += `</div>`; 
            } 
        }); 
        if(vContainer) vContainer.innerHTML = vHtml; 
        
        let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
        for (let c = hCols; c >= 1; c--) { 
            let displayId = `${hPrefix}${c}`; let dbId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; 
            let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; 
            let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full z-10">${pCount.toFixed(1)}P</div>` : ''; 
            let isTarget = globalSearchTargets.includes(searchId); let pulseClass = isTarget ? 'highlight-pulse' : '';
            if(movingItem && movingItem.fromLoc === searchId) pulseClass += ' highlight-move';
            hHtml += `<div id="cell-${displayId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${displayId}', '${dbId}')" onclick="clickCell('${displayId}', '${searchId}')" class="h-10 md:w-14 rounded-[3px] flex items-center justify-center text-[10px] font-bold cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm">${badge}${displayId}</div>`; 
        } 
        hHtml += `</div>`; if(hContainer) hContainer.innerHTML = hHtml; 
    } catch(e) { console.error(e); }
}

async function clickCell(displayId, searchId) { 
    try {
        if(!searchId) { 
            if(displayId.startsWith('W-') || displayId.startsWith('FL-')) { searchId = displayId; }
            else { let floorSel = document.getElementById('floor-select'); const floor = floorSel ? floorSel.value : "1"; const prefix = currentZone === '실온' ? 'R-' : 'C-'; const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`); searchId = floor === "1" ? baseId : `${baseId}-2F`; }
        } 

        if (movingItem) {
            if (movingItem.fromLoc === searchId) { cancelMove(); return; } 
            let toLoc = searchId;
            let qtyStr = prompt(`이동할 수량(EA)을 입력하세요.\n(최대 ${movingItem.maxQty}EA)`, movingItem.maxQty);
            if(!qtyStr) { cancelMove(); return; }
            let qty = parseInt(qtyStr);
            if(isNaN(qty) || qty <= 0 || qty > movingItem.maxQty) { alert("수량이 올바르지 않습니다."); cancelMove(); return; }

            let movePallet = getDynamicPalletCount({item_name: movingItem.itemName, remarks: movingItem.supplier, quantity: qty});
            try { 
                await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: movingItem.invId, from_location: movingItem.fromLoc, to_location: toLoc, item_name: movingItem.itemName, quantity: qty, pallet_count: movePallet }) }); 
                movingItem = null; await load(); 
            } catch(e) { alert("서버 통신 오류"); cancelMove(); }
            return;
        }

        selectedCellId = displayId; 
        renderMap(); 
        let rs = document.getElementById('right-sidebar');
        if(rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); isRightPanelVisible = true; }
        
        const panel = document.getElementById('info-panel'); 
        const floorName = searchId.startsWith('W-') ? '입고 대기장' : (currentZone === '현장' ? '생산현장' : '적재 구역'); 
        const items = globalOccupancy.filter(x => x.location_id === searchId); let dateLabel = currentZone === '냉장' ? '산란일' : '입고일'; 
        let panelHtml = `<div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4"><div class="flex justify-between items-start"><div><div class="text-[10px] text-indigo-500 font-bold mb-1">선택 위치</div><div class="text-2xl font-black text-indigo-900">${displayId}</div></div><div class="text-right"><span class="inline-block bg-white text-indigo-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm">${floorName}</span></div></div></div>`; 
        
        if(items.length > 0) { 
            panelHtml += `<div class="mb-2 text-[10px] font-bold text-slate-500">적재 목록 (더블클릭 이동)</div>`; 
            items.forEach(item => { 
                let dateHtml = item.production_date ? `<div class="text-[10px] text-rose-600 font-bold mt-1">${dateLabel}: ${item.production_date}</div>` : ''; 
                let dynPallet = getDynamicPalletCount(item);
                let actionBtns = (loginMode !== 'viewer') ? `<div class="flex space-x-2 mt-3 border-t pt-2"><button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="w-1/2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-[10px] font-bold">선택 출고</button><button onclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}', '${item.remarks||''}')" class="w-1/2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-1.5 rounded text-[10px] font-bold">렉 이동</button></div><button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date || ''}', '${searchId}', '${item.remarks || ''}')" class="bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200 py-1.5 rounded text-[10px] font-bold mt-2 w-full">편집/삭제</button>` : '';
                panelHtml += `<div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3"><div class="flex justify-between items-start"><div><span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span><div class="font-black text-xs text-slate-800 mt-1">${item.item_name}</div><div class="text-[9px] font-bold text-rose-600">입고처: ${item.remarks||'기본'}</div></div><div class="text-right"><div class="text-sm font-bold text-indigo-600">${item.quantity.toLocaleString()} EA</div><div class="text-[9px] text-slate-400 font-black">${dynPallet.toFixed(1)} P</div></div></div>${dateHtml}${actionBtns}</div>`; 
            }); 
        } else { panelHtml += `<div class="text-center text-slate-400 py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300">비어있음</div>`; } 
        
        if (!searchId.startsWith('W-')) {
            let locHistory = globalHistory.filter(h => h.location_id === searchId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
            panelHtml += `<div class="mt-6 pt-4 border-t border-slate-200"><h3 class="text-xs font-black text-slate-700 mb-3">최근 내역</h3><div class="space-y-2">`;
            if(locHistory.length > 0) { locHistory.forEach(h => { let actionColor = h.action_type === '입고' ? 'text-emerald-600' : 'text-rose-600'; panelHtml += `<div class="bg-white p-2 border border-slate-200 rounded text-[10px] shadow-sm"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${h.production_date || '일시미상'}</span><br><span class="font-bold text-slate-700">${h.item_name} (${h.quantity}EA)</span></div>`; }); } else { panelHtml += `<div class="text-[10px] text-slate-400 text-center py-4">기록 없음</div>`; }
            panelHtml += `</div></div>`;
        }
        if(panel) panel.innerHTML = panelHtml; 
    } catch(e) { console.error(e); }
}

function selectForMove(invId, itemName, maxQty, currentPallet, fromLoc, supplier) {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    movingItem = { invId, itemName, maxQty, currentPallet, fromLoc, supplier }; renderMap();
    const panel = document.getElementById('info-panel');
    if(panel) panel.innerHTML = `<div class="bg-indigo-50 border-2 border-indigo-400 border-dashed p-6 rounded-xl text-center shadow-inner mt-4"><div class="text-4xl animate-bounce mb-4 text-indigo-500 font-black">이동</div><div class="text-lg font-black text-indigo-800 mb-2">이동 모드 활성화</div><div class="text-sm font-bold text-slate-600 mb-6"><span class="text-rose-600">${itemName}</span><br>도착지 렉을 클릭하세요.</div><button onclick="cancelMove()" class="bg-slate-600 text-white font-bold py-2 px-6 rounded-lg w-full">취소</button></div>`;
}

function cancelMove() { movingItem = null; renderMap(); if (selectedCellId) { let temp = selectedCellId; selectedCellId = null; clickCell(temp); } }

function onWaitDragStart(event, wId) {
    if(loginMode === 'viewer') { event.preventDefault(); return; }
    let items = globalOccupancy.filter(o => o.location_id === wId); if(items.length === 0) return; let item = items[0];
    event.dataTransfer.setData("invId", item.id); event.dataTransfer.setData("itemName", item.item_name); event.dataTransfer.setData("maxQty", item.quantity); event.dataTransfer.setData("fromLoc", wId); event.dataTransfer.setData("supplier", item.remarks || "");
}
function onDragOver(event) { event.preventDefault(); event.currentTarget.classList.add('border-indigo-500', 'border-4', 'border-dashed'); }
function onDragLeave(event) { event.currentTarget.classList.remove('border-indigo-500', 'border-4', 'border-dashed'); }
async function onDrop(event, displayId, dbBaseId) {
    if(loginMode === 'viewer') return; event.preventDefault(); event.currentTarget.classList.remove('border-indigo-500', 'border-4', 'border-dashed');
    let invId = event.dataTransfer.getData("invId"); let itemName = event.dataTransfer.getData("itemName"); let maxQty = parseInt(event.dataTransfer.getData("maxQty")); let fromLoc = event.dataTransfer.getData("fromLoc"); let supplier = event.dataTransfer.getData("supplier");
    if(!invId) return;
    let qtyStr = prompt(`이동 수량(EA) (최대 ${maxQty})`, maxQty); if(!qtyStr) return; let qty = parseInt(qtyStr);
    let movePallet = getDynamicPalletCount({item_name: itemName, remarks: supplier, quantity: qty});
    try { await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: dbBaseId, item_name: itemName, quantity: qty, pallet_count: movePallet }) }); await load(); } catch(e) {}
}

async function processOutbound(invId, itemName, maxQty, currentPallet, locId) { 
    if(loginMode === 'viewer') return alert("불가");
    const qtyStr = prompt(`[${itemName}] 출고 수량 (최대 ${maxQty}EA)`, maxQty); if(!qtyStr) return; const qty = parseInt(qtyStr);
    const outPallet = getDynamicPalletCount({item_name: itemName, remarks: null, quantity: qty}); 
    try { await fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: qty, pallet_count: outPallet }) }); alert("출고 완료"); await load(); } catch(e) {} 
}

function renderSafetyStock() { 
    const mode = document.getElementById('safe-mode') ? document.getElementById('safe-mode').value : 'pallet';
    const thead = document.getElementById('safety-thead');
    const tbody = document.getElementById('safety-list');
    let materialProducts = productMaster.filter(p => p.category && !p.category.includes('원란'));
    let aggregatedItems = {};
    materialProducts.forEach(p => { let key = p.item_name; if (!aggregatedItems[key]) { aggregatedItems[key] = { category: p.category || '미분류', item_name: p.item_name, suppliers: new Set(), total_qty: 0, total_pallet: 0, daily_usage: p.daily_usage || 0 }; } if (p.supplier) aggregatedItems[key].suppliers.add(p.supplier); if(p.daily_usage > aggregatedItems[key].daily_usage) aggregatedItems[key].daily_usage = p.daily_usage; });
    globalOccupancy.forEach(item => { let key = item.item_name; if(aggregatedItems[key]) { aggregatedItems[key].total_qty += (parseInt(item.quantity) || 0); aggregatedItems[key].total_pallet += getDynamicPalletCount(item); if (item.remarks && item.remarks !== '기본입고처') { aggregatedItems[key].suppliers.add(item.remarks); } } });
    let monitoredList = Object.values(aggregatedItems); let html = '';
    if (mode === 'pallet') {
        thead.innerHTML = `<tr><th class="p-3 font-black">카테고리</th><th class="p-3 font-black">품목명 (입고처)</th><th class="p-3 font-black text-right">재고 (EA)</th><th class="p-3 font-black text-right">파레트 (P)</th><th class="p-3 font-black text-center">상태</th></tr>`;
        const targetPallets = parseFloat(document.getElementById('safe-pallet-target').value) || 5; 
        monitoredList = monitoredList.filter(i => i.total_pallet < targetPallets).sort((a,b) => a.total_pallet - b.total_pallet);
        monitoredList.forEach(p => { html += `<tr class="bg-white border-b"><td class="p-3 text-xs">${p.category}</td><td class="p-3 font-black text-xs">${p.item_name}</td><td class="p-3 text-right font-bold text-indigo-600">${p.total_qty.toLocaleString()}</td><td class="p-3 text-right font-black text-rose-600">${p.total_pallet.toFixed(1)}P</td><td class="p-3 text-center"><button onclick="generateKakaoText('${p.item_name}')" class="bg-yellow-400 text-[10px] px-2 py-1 rounded font-black">발주복사</button></td></tr>`; });
    } else {
        thead.innerHTML = `<tr><th class="p-3 font-black">카테고리</th><th class="p-3 font-black">품목명</th><th class="p-3 font-black text-right">재고</th><th class="p-3 font-black text-right">소모량</th><th class="p-3 font-black text-center">버팀일수</th></tr>`;
        const targetDays = parseInt(document.getElementById('safe-days-target').value) || 7;
        monitoredList = monitoredList.filter(i => i.daily_usage > 0).sort((a,b) => (a.total_qty/a.daily_usage) - (b.total_qty/b.daily_usage));
        monitoredList.forEach(p => { let days = p.total_qty / p.daily_usage; html += `<tr class="bg-white border-b"><td class="p-3 text-xs">${p.category}</td><td class="p-3 font-black text-xs">${p.item_name}</td><td class="p-3 text-right font-bold">${p.total_qty.toLocaleString()}</td><td class="p-3 text-right text-slate-500">${p.daily_usage}</td><td class="p-3 text-center font-black ${days<targetDays?'text-rose-600':'text-blue-600'}">${days.toFixed(1)}일</td></tr>`; });
    }
    tbody.innerHTML = html || `<tr><td colspan="5" class="p-10 text-center text-slate-400">내역 없음</td></tr>`;
}

function generateKakaoText(itemName) { const supplier = prompt(`[${itemName}] 발주처:`); if(!supplier) return; const moq = prompt(`수량:`, "1000"); const text = `[발주요청] 한스팜입니다. ${itemName} ${moq}EA 발주 부탁드립니다.`; navigator.clipboard.writeText(text).then(() => alert("복사완료")); }
function toggleSafeMode() { const mode = document.getElementById('safe-mode').value; document.getElementById('target-pallet-container').classList.toggle('hidden', mode!=='pallet'); document.getElementById('target-days-container').classList.toggle('hidden', mode==='pallet'); renderSafetyStock(); }

function populateWaitDropdowns() { /* ... */ }
function updateWaitCategoryDropdown() { /* ... */ }
function updateWaitItemDropdown() { /* ... */ }
async function createWaitingPallets() { /* ... */ }
function updateSummarySupplierDropdown() { /* ... */ }
function updateSummaryCategoryDropdown() { /* ... */ }
function updateSummaryItemDropdown() { /* ... */ }
function calculateSummary() { /* ... */ }
function findItemLocationFromSummary() { /* ... */ }
function updateOrderCartDropdowns() { /* ... */ }
function updateOrderCartCategoryDropdown() { /* ... */ }
function updateOrderCartItemDropdown() { /* ... */ }
function addOrderCartItem() { /* ... */ }
function renderOrderCart() { /* ... */ }
async function submitOrderCart() { /* ... */ }
function renderOrderList() { /* ... */ }
async function receiveOrder() { /* ... */ }
async function cancelOrder() { /* ... */ }
