// ==========================================
// [재고/발주] - 상단 탭 및 구역 전환 로직
// ==========================================
window.floorFilterMap = window.floorFilterMap || { 'FL-1F': true, 'FL-2F': true, 'FL-3F': true };
window.areaFilterMap = window.areaFilterMap || { 'R': true, 'M': true, 'P': true, 'G': true };
window.isMapFilterOpen = window.isMapFilterOpen || false; 

function toggleMapFilters() { window.isMapFilterOpen = !window.isMapFilterOpen; renderMap(); }
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
        
        if(tab === 'history') { 
            updateOrderCartDropdowns(); 
            if(typeof initOrderSortUI === 'function') initOrderSortUI(); 
            renderOrderList(); 
        }
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

// ==========================================
// [재고/발주] - 공용 헬퍼 및 맵 렌더링
// ==========================================
function getDynamicPalletCount(itemObj) {
    if(!itemObj) return 0;
    let itemName = String(itemObj.item_name || "").trim(); 
    let supplier = String(itemObj.remarks || "기본입고처").trim(); 
    let cleanSupplier = supplier.replace(/\[기존재고\]/g, '').trim();
    let quantity = parseInt(itemObj.quantity) || 0;
    
    let allItems = [...finishedProductMaster, ...productMaster];
    let pInfo = allItems.find(p => String(p.item_name||"").trim() === itemName && String(p.supplier||"").trim() === cleanSupplier) || 
                allItems.find(p => String(p.item_name||"").trim() === itemName);
    
    if (pInfo && parseInt(pInfo.pallet_ea) > 0) return quantity / parseInt(pInfo.pallet_ea);
    return parseFloat(itemObj.pallet_count) || 1;
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
        const mapContainer = document.getElementById('map-container'); 
        const mapScroller = document.getElementById('map-scroller'); 
        const vContainer = document.getElementById('vertical-racks'); 
        const hContainer = document.getElementById('horizontal-rack'); 
        
        const occMap = {}; const palletMap = {}; globalOccupancy.forEach(item => { occMap[item.location_id] = true; palletMap[item.location_id] = (palletMap[item.location_id] || 0) + getDynamicPalletCount(item); }); 
        
        if(currentZone === '현장') {
            if(mapContainer) { mapContainer.classList.remove('w-fit', 'min-w-max', 'p-4', 'md:p-10', 'bg-white', 'border', 'shadow-xl'); mapContainer.classList.add('w-full', 'p-0', 'bg-transparent', 'border-none', 'shadow-none'); }
            if(mapScroller) { mapScroller.classList.remove('p-2', 'md:p-10'); mapScroller.classList.add('p-0'); }
            if(vContainer) { vContainer.classList.remove('items-end'); vContainer.classList.add('flex-col', 'items-center', 'w-full'); }
        } else {
            if(mapContainer) { mapContainer.classList.remove('w-full', 'p-0', 'bg-transparent', 'border-none', 'shadow-none'); mapContainer.classList.add('w-fit', 'min-w-max', 'p-4', 'md:p-10', 'bg-white', 'border', 'shadow-xl'); }
            if(mapScroller) { mapScroller.classList.remove('p-0'); mapScroller.classList.add('p-2', 'md:p-10'); }
            if(vContainer) { vContainer.classList.remove('flex-col', 'items-center', 'w-full'); vContainer.classList.add('items-end'); }
        }

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
        
        if(currentZone === '현장') { 
            let aisleText = document.getElementById('aisle-text'); if(aisleText) aisleText.classList.add('hidden'); 
            
            vHtml += `
            <div class="w-full max-w-4xl relative z-40 mb-8 mx-auto">
                <button onclick="toggleMapFilters()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-3 md:py-4 px-6 rounded-xl shadow-lg transition-all flex justify-between items-center text-sm md:text-base border-b-4 border-slate-950 relative z-50">
                    <span class="flex items-center space-x-2"><span>⚙️</span> <span>현장 창고 보기 설정 (클릭)</span></span>
                    <span class="text-xl leading-none transition-transform duration-200" style="transform: ${window.isMapFilterOpen ? 'rotate(180deg)' : 'rotate(0deg)'}">▼</span>
                </button>
                
                <div class="${window.isMapFilterOpen ? 'flex' : 'hidden'} absolute top-full left-0 right-0 w-full bg-white p-5 rounded-b-2xl shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3)] border-x-2 border-b-2 border-slate-800 flex-col md:flex-row gap-6 items-start md:items-center mt-[-10px] pt-8 z-40 mx-auto">
                    <div class="flex items-center space-x-4 md:border-r border-slate-300 pr-6">
                        <span class="text-xs md:text-sm font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">🏢 층별</span>
                        <label class="cursor-pointer text-xs md:text-sm font-bold flex items-center hover:text-indigo-600 transition-colors"><input type="checkbox" ${window.floorFilterMap['FL-1F']?'checked':''} onchange="toggleFloorFilter('FL-1F')" class="mr-1.5 w-4 h-4">1층</label>
                        <label class="cursor-pointer text-xs md:text-sm font-bold flex items-center hover:text-indigo-600 transition-colors"><input type="checkbox" ${window.floorFilterMap['FL-2F']?'checked':''} onchange="toggleFloorFilter('FL-2F')" class="mr-1.5 w-4 h-4">2층</label>
                        <label class="cursor-pointer text-xs md:text-sm font-bold flex items-center hover:text-indigo-600 transition-colors"><input type="checkbox" ${window.floorFilterMap['FL-3F']?'checked':''} onchange="toggleFloorFilter('FL-3F')" class="mr-1.5 w-4 h-4">3층</label>
                    </div>
                    <div class="flex flex-wrap items-center gap-4">
                        <span class="text-xs md:text-sm font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">📦 창고</span>
                        <label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-orange-600 hover:text-orange-700 transition-colors"><input type="checkbox" ${window.areaFilterMap['R']?'checked':''} onchange="toggleAreaFilter('R')" class="mr-1.5 w-4 h-4 accent-orange-600">원란</label>
                        <label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-blue-600 hover:text-blue-700 transition-colors"><input type="checkbox" ${window.areaFilterMap['M']?'checked':''} onchange="toggleAreaFilter('M')" class="mr-1.5 w-4 h-4 accent-blue-600">자재</label>
                        <label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-emerald-600 hover:text-emerald-700 transition-colors"><input type="checkbox" ${window.areaFilterMap['P']?'checked':''} onchange="toggleAreaFilter('P')" class="mr-1.5 w-4 h-4 accent-emerald-600">제품</label>
                        <label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-slate-600 hover:text-slate-800 transition-colors"><input type="checkbox" ${window.areaFilterMap['G']?'checked':''} onchange="toggleAreaFilter('G')" class="mr-1.5 w-4 h-4 accent-slate-600">일반(3층)</label>
                    </div>
                </div>
            </div>`;

            const newPatterns = ['FL-1F-R-', 'FL-1F-M-', 'FL-1F-P-', 'FL-2F-M-', 'FL-2F-P-', 'FL-3F-G-'];
            let oldGhostItems = globalOccupancy.filter(o => {
                if (!String(o.location_id).startsWith('FL-')) return false;
                return !newPatterns.some(pat => String(o.location_id).startsWith(pat));
            });
            
            if (oldGhostItems.length > 0) {
                let oldIds = [...new Set(oldGhostItems.map(o => o.location_id))].sort();
                vHtml += `<div class="mb-8 bg-rose-100 p-6 rounded-2xl shadow-xl border-4 border-rose-500 w-full max-w-5xl mx-auto relative z-10">
                    <div class="text-lg md:text-xl font-black text-rose-800 mb-2 flex items-center animate-pulse">🚨 경고: [이전 맵 구형 재고]가 감지되었습니다! (이것 때문에 BOM 재고가 있다고 뜹니다)</div>
                    <div class="text-sm font-bold text-rose-600 mb-4 bg-white p-2 rounded inline-block shadow-sm">해결법: 아래 빨간 박스를 클릭한 뒤, 우측 패널에서 [편집/삭제] ➔ [3번(완전삭제)] 를 눌러서 비워주세요!</div>
                    <div class="flex flex-wrap gap-3">`;
                oldIds.forEach(searchId => {
                    let pCount = palletMap[searchId] || 0; 
                    let badge = (pCount > 1) ? `<div class="absolute -top-2 -right-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md z-10">${pCount.toFixed(1)}P</div>` : ''; 
                    vHtml += `<div id="cell-${searchId}" onclick="clickCell('${searchId}', '${searchId}')" class="h-12 w-24 rounded-lg border-2 border-rose-400 bg-white flex items-center justify-center text-[10px] font-black cursor-pointer rack-cell shadow-sm hover:scale-105 transition-all relative cell-full">${badge}<span class="text-rose-700">${searchId}</span></div>`;
                });
                vHtml += `</div></div>`;
            }

            const prodSiteConfig = [
                { id: 'FL-1F', name: '생산현장 1층', areas: [
                    { key: 'R', title: '🥚 원란창고', color: 'orange', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-800' },
                    { key: 'M', title: '📦 자재창고', color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-800' },
                    { key: 'P', title: '✨ 제품창고', color: 'emerald', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', textColor: 'text-emerald-800' }
                ]},
                { id: 'FL-2F', name: '생산현장 2층', areas: [
                    { key: 'M', title: '📦 자재창고', color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-800' },
                    { key: 'P', title: '✨ 제품창고', color: 'emerald', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', textColor: 'text-emerald-800' }
                ]},
                { id: 'FL-3F', name: '생산현장 3층', areas: [
                    { key: 'G', title: '🏭 일반창고(공용)', color: 'slate', bgColor: 'bg-slate-50', borderColor: 'border-slate-200', textColor: 'text-slate-800' }
                ]}
            ];

            vHtml += `<div class="w-full max-w-5xl flex flex-col space-y-6 mx-auto relative z-0 pb-20">`; 
            prodSiteConfig.forEach(floorInfo => { 
                if(!window.floorFilterMap[floorInfo.id]) return;

                vHtml += `<div class="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-300 w-full">
                    <div class="text-sm md:text-base font-black text-slate-800 mb-4 flex items-center"><span class="bg-slate-800 text-white px-2 py-0.5 rounded mr-2 text-xs">${floorInfo.id}</span> ${floorInfo.name}</div>
                    <div class="flex flex-col space-y-4">`;
                
                floorInfo.areas.forEach(area => {
                    if(!window.areaFilterMap[area.key]) return;

                    let areaId = `${floorInfo.id}-${area.key}`;
                    let cols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;

                    vHtml += `<div class="${area.bgColor} p-3 md:p-4 rounded-xl border ${area.borderColor} shadow-sm w-full">
                        <div class="flex justify-between items-center mb-3 pb-2 border-b ${area.borderColor}">
                            <div class="text-xs md:text-sm font-black ${area.textColor}">${area.title}</div>
                            <div class="flex items-center space-x-1">
                                <button onclick="changeFloorCols('${areaId}', -1)" class="bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 font-bold px-2 py-0.5 rounded text-[10px] shadow-sm">-</button>
                                <span class="font-black text-slate-700 text-[10px] md:text-xs px-1">${cols} 칸</span>
                                <button onclick="changeFloorCols('${areaId}', 1)" class="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 font-bold px-2 py-0.5 rounded text-[10px] shadow-sm">+</button>
                            </div>
                        </div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(42px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-1.5 md:gap-2">`;
                    
                    for (let r = 1; r <= cols; r++) { 
                        let dbId = `${areaId}-${r.toString().padStart(2, '0')}`; 
                        let hasItem = occMap[dbId]; 
                        let cellState = hasItem ? 'cell-full' : 'cell-empty'; 
                        if(selectedCellId === dbId) cellState = 'cell-active'; 
                        
                        let pCount = palletMap[dbId] || 0; 
                        let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black px-1 rounded-full z-10 scale-90">${pCount.toFixed(1)}P</div>` : ''; 
                        let isTarget = globalSearchTargets.includes(dbId); let pulseClass = isTarget ? 'highlight-pulse' : '';
                        if(movingItem && movingItem.fromLoc === dbId) pulseClass += ' highlight-move';
                        
                        vHtml += `<div id="cell-${dbId}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${dbId}', '${dbId}')" onclick="clickCell('${dbId}', '${dbId}')" class="h-10 md:h-12 rounded border flex flex-col items-center justify-center text-[9px] font-black cursor-pointer rack-cell ${cellState} ${pulseClass} shadow-sm hover:scale-105 transition-all">${badge}<span class="${hasItem?'text-slate-700':'text-slate-400'}">${r}</span></div>`; 
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
            
            if (!toLoc.startsWith('W-') && !toLoc.startsWith('FL-')) {
                let floor = prompt(`[${movingItem.itemName}]을(를) ${displayId}의 몇 층으로 넣을까요?\n(1 또는 2 입력)`, "1");
                if(floor !== "1" && floor !== "2") { cancelMove(); return; }
                const prefix = currentZone === '실온' ? 'R-' : (currentZone === '냉장' ? 'C-' : ''); 
                const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`);
                toLoc = floor === "1" ? baseId : `${baseId}-2F`;
            }

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
                
                let actionBtns = (loginMode !== 'viewer') ? `
                <div class="flex space-x-2 mt-3 border-t pt-2">
                    <button onclick="dispatchToFloor('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}', '${item.remarks||''}')" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 py-1.5 rounded text-[10px] font-bold shadow-sm">현장 반출</button>
                    <button onclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}', '${item.remarks||''}')" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-1.5 rounded text-[10px] font-bold shadow-sm">렉 이동</button>
                </div>
                <div class="flex space-x-2 mt-2">
                    <button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, ${dynPallet}, '${searchId}')" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1.5 rounded text-[10px] font-bold shadow-sm">최종 출고</button>
                    <button onclick="splitPallet('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}', '${item.remarks || ''}', '${item.production_date || ''}', '${item.category || ''}')" class="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 py-1.5 rounded text-[10px] font-bold shadow-sm">파레트 분할</button>
                    <button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date || ''}', '${searchId}', '${item.remarks || ''}')" class="flex-1 bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200 py-1.5 rounded text-[10px] font-bold shadow-sm">편집/삭제</button>
                </div>` : '';

                panelHtml += `<div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3"><div class="flex justify-between items-start"><div><span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${item.category}</span><div class="font-black text-xs text-slate-800 mt-1">${item.item_name}</div><div class="text-[9px] font-bold text-rose-600">입고처: ${item.remarks||'기본'}</div></div><div class="text-right"><div class="text-sm font-bold text-indigo-600">${item.quantity.toLocaleString()} EA</div><div class="text-[9px] text-slate-400 font-black">${dynPallet.toFixed(1)} P</div></div></div>${dateHtml}${actionBtns}</div>`; 
            }); 
        } else { panelHtml += `<div class="text-center text-slate-400 py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300">비어있음</div>`; } 
        
        if (!searchId.startsWith('W-')) {
            let locHistory = globalHistory.filter(h => h.action_type === '입고' && h.location_id === searchId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
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

    let toLoc = dbBaseId;
    if (!toLoc.startsWith('W-') && !toLoc.startsWith('FL-')) {
        let floor = prompt(`[${itemName}]을(를) ${displayId}의 몇 층으로 이동할까요?\n(1 또는 2 입력)`, "1");
        if(floor !== "1" && floor !== "2") return;
        toLoc = floor === "1" ? dbBaseId : `${dbBaseId}-2F`;
    }

    if(fromLoc === toLoc) return;

    let qtyStr = prompt(`이동 수량(EA) (최대 ${maxQty})`, maxQty); if(!qtyStr) return; let qty = parseInt(qtyStr);
    let movePallet = getDynamicPalletCount({item_name: itemName, remarks: supplier, quantity: qty});
    try { await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc, item_name: itemName, quantity: qty, pallet_count: movePallet }) }); await load(); } catch(e) {}
}

async function dispatchToFloor(invId, itemName, maxQty, fromLoc, supplier) {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    
    const floorStr = prompt(`[${itemName}] 현장 반출\n몇 층으로 반출하시겠습니까?\n(1, 2, 3 중 하나를 입력하세요)`, "1");
    if(!floorStr) return;
    if(!["1", "2", "3"].includes(floorStr)) return alert("1, 2, 3 중에서 정확히 입력해주세요.");

    const qtyStr = prompt(`[${itemName}]\n선택한 ${floorStr}층으로 반출할 수량 (최대 ${maxQty}EA)`, maxQty);
    if(!qtyStr) return;
    const qty = parseInt(qtyStr);
    if(isNaN(qty) || qty <= 0 || qty > maxQty) return alert("수량 오류");

    let pInfo = productMaster.find(p => p.item_name === itemName && p.supplier === supplier) || finishedProductMaster.find(p => p.item_name === itemName);
    let cat = pInfo ? (pInfo.category || '') : '';
    let isFinished = finishedProductMaster.find(p => p.item_name === itemName);
    
    let targetPrefix = '';
    if (floorStr === "1") {
        if (cat.includes('원란')) targetPrefix = 'FL-1F-R-';
        else if (isFinished) targetPrefix = 'FL-1F-P-';
        else targetPrefix = 'FL-1F-M-';
    } else if (floorStr === "2") {
        if (isFinished) targetPrefix = 'FL-2F-P-';
        else targetPrefix = 'FL-2F-M-';
    } else if (floorStr === "3") {
        targetPrefix = 'FL-3F-G-';
    }

    let toLoc = targetPrefix + '01';
    let areaId = targetPrefix.slice(0, -1);
    let maxCols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;
    
    for(let i=1; i<=maxCols; i++) {
        let checkId = `${targetPrefix}${i.toString().padStart(2, '0')}`;
        let existing = globalOccupancy.filter(o => o.location_id === checkId);
        if(existing.length === 0 || (existing[0].item_name === itemName && (existing[0].remarks || '기본입고처') === (supplier || '기본입고처'))) {
            toLoc = checkId;
            break;
        }
    }

    let movePallet = getDynamicPalletCount({item_name: itemName, remarks: supplier, quantity: qty});
    try {
        await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc, item_name: itemName, quantity: qty, pallet_count: movePallet }) });
        alert(`${floorStr}층 현장 반출 완료!\n(자동 지정 위치: ${toLoc})`);
        await load();
    } catch(e) { alert("서버 통신 오류"); }
}

async function processOutbound(invId, itemName, maxQty, currentPallet, locId) { 
    if(loginMode === 'viewer') return alert("불가");
    const qtyStr = prompt(`[${itemName}] 출고 수량 (최대 ${maxQty}EA)`, maxQty); if(!qtyStr) return; const qty = parseInt(qtyStr);
    const outPallet = getDynamicPalletCount({item_name: itemName, remarks: null, quantity: qty}); 
    try { await fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: qty, pallet_count: outPallet }) }); alert("출고 완료"); await load(); } catch(e) {} 
}

async function splitPallet(invId, itemName, currentQty, locId, remarks, prodDate, cat) {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    let splitQtyStr = prompt(`[${itemName}]\n현재 총 수량: ${currentQty.toLocaleString()} EA\n\n현재 위치에서 따로 분리해 낼(쪼갤) 수량을 입력하세요:`);
    if(!splitQtyStr) return;
    let splitQty = parseInt(splitQtyStr);
    if(isNaN(splitQty) || splitQty <= 0 || splitQty >= currentQty) return alert(`분할 수량은 1부터 ${currentQty - 1} 사이의 숫자여야 합니다.`);
    let remainQty = currentQty - splitQty;
    let remainPallet = getDynamicPalletCount({item_name: itemName, remarks: remarks, quantity: remainQty});
    let splitPalletCount = getDynamicPalletCount({item_name: itemName, remarks: remarks, quantity: splitQty});
    if(!confirm(`✅ 분할 확인\n- 기존 파레트 남는 수량: ${remainQty.toLocaleString()} EA\n- 새로 분리되는 수량: ${splitQty.toLocaleString()} EA\n\n같은 위치(${locId})에 두 개의 덩어리로 나뉩니다. 진행할까요?`)) return;
    try {
        await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'UPDATE_QTY', new_quantity: remainQty, pallet_count: remainPallet }) });
        await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ location_id: locId, category: cat || '미분류', item_name: itemName, quantity: splitQty, pallet_count: splitPalletCount, production_date: prodDate || new Date().toISOString().split('T')[0], remarks: remarks }) });
        alert("파레트가 성공적으로 분할되었습니다!"); await load();
    } catch(e) { alert("서버 통신 중 오류가 발생했습니다."); }
}

async function editInventoryItem(invId, itemName, qty, date, locId, remarks) {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    let action = prompt(`[${itemName}] 편집\n1: 수량 수정\n2: 날짜 수정\n3: 완전 삭제(취소)`);
    if (action === '1') { 
        let newQty = prompt(`새 수량:`, qty); 
        if(newQty && parseInt(newQty) > 0) { 
            let newPallet = getDynamicPalletCount({item_name: itemName, remarks: remarks, quantity: parseInt(newQty)}); 
            await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'UPDATE_QTY', new_quantity: parseInt(newQty), pallet_count: newPallet }) }); await load(); 
        } 
    } 
    else if (action === '2') { 
        let newDate = prompt(`새 날짜(YYYY-MM-DD):`, date || ''); 
        if(newDate !== null) { await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'UPDATE_DATE', new_date: newDate }) }); await load(); } 
    } 
    else if (action === '3') { 
        if(confirm(`정말 삭제하시겠습니까?`)) { 
            let targetHistories = globalHistory.filter(h => h.action_type === '입고' && h.location_id === locId && h.item_name === itemName && (h.remarks || '') === (remarks || ''));
            targetHistories.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            if(targetHistories.length > 0) await fetch(`/api/history/${targetHistories[0].id}`, { method: 'DELETE' });
            await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, action: 'DELETE' }) }); await load(); 
        } 
    }
}

async function closeInventory() {
    if(!isAdmin) return alert("관리자 권한 필요");
    if(confirm("재고마감 처리하시겠습니까?")) { try { await fetch('/api/close_inventory', { method: 'POST' }); alert("마감 완료"); await load(); } catch(e){} }
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
    if(datalist) datalist.innerHTML = uniqueItems.map(name => `<option value="${name}">`).join('');
}
function executeMapSearch() { 
    const catSelect = document.getElementById('map-search-category').value; const keyword = document.getElementById('map-search-keyword').value.trim().toLowerCase(); const count = parseInt(document.getElementById('map-search-count').value) || 1; 
    let matches = globalOccupancy; if(catSelect !== 'ALL') matches = matches.filter(x => x.category === catSelect); if(keyword) matches = matches.filter(x => x.item_name.toLowerCase().includes(keyword));
    if(matches.length === 0) return alert("조건에 맞는 품목이 현재 구역에 없습니다."); 
    matches.sort((a, b) => (new Date(a.production_date||0).getTime()) - (new Date(b.production_date||0).getTime())); 
    let targets = matches.slice(0, count); globalSearchTargets = targets.map(t => t.location_id);
    let firstLoc = globalSearchTargets[0];
    if (firstLoc.startsWith('FL-')) currentZone = '현장'; else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
    updateZoneTabs(); renderMap(); 
}
function highlightFIFO() { 
    const eggs = globalOccupancy.filter(x => x.production_date && x.location_id.startsWith('C-')); 
    if(eggs.length === 0) return alert("냉장 창고에 산란일 데이터 없음"); 
    eggs.sort((a, b) => new Date(a.production_date) - new Date(b.production_date)); 
    const oldestDate = eggs[0].production_date; 
    globalSearchTargets = eggs.filter(x => x.production_date === oldestDate).map(t => t.location_id);
    let firstLoc = globalSearchTargets[0];
    currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1";
    updateZoneTabs(); renderMap(); alert(`가장 오래된 산란일: ${oldestDate}`); 
}
function clearSearchTargets() { globalSearchTargets = []; renderMap(); }

function getSummarySourceItems() {
    const typeSelect = document.getElementById('summary-type'); if(!typeSelect) return [];
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
    let items = getSummarySourceItems(); const sup = document.getElementById('summary-supplier')?.value || 'ALL';
    if (sup !== 'ALL') items = items.filter(p => p.supplier === sup);
    let categories = [...new Set(items.map(p => p.category))].filter(Boolean).sort();
    const catSelect = document.getElementById('summary-category');
    if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체 카테고리</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateSummaryItemDropdown(); }
}
function updateSummaryItemDropdown() {
    let items = getSummarySourceItems(); const sup = document.getElementById('summary-supplier')?.value || 'ALL'; const cat = document.getElementById('summary-category')?.value || 'ALL';
    if (sup !== 'ALL') items = items.filter(p => p.supplier === sup); if (cat !== 'ALL') items = items.filter(p => p.category === cat);
    const uniqueItems = [...new Set(items.map(p => p.item_name))].filter(Boolean).sort();
    const itemSelect = document.getElementById('summary-item');
    if(itemSelect) itemSelect.innerHTML = `<option value="">품목을 선택하세요</option>` + uniqueItems.map(name => `<option value="${name}">${name}</option>`).join('');
    calculateSummary();
}
function calculateSummary() {
    const itemName = document.getElementById('summary-item')?.value; const supplier = document.getElementById('summary-supplier')?.value;
    let breakdown = {}; let totalQty = 0; let totalPallet = 0;
    if(itemName) {
        globalOccupancy.forEach(item => {
            let cleanItemSup = String(item.remarks || "기본입고처").replace(/\[기존재고\]/g, '').trim(); 
            if(item.item_name === itemName && (supplier === 'ALL' || cleanItemSup === supplier)) {
                if(!breakdown[cleanItemSup]) breakdown[cleanItemSup] = { qty: 0, pallet: 0 };
                let dynP = getDynamicPalletCount(item);
                breakdown[cleanItemSup].qty += item.quantity; breakdown[cleanItemSup].pallet += dynP;
                totalQty += item.quantity; totalPallet += dynP;
            }
        });
    }
    document.getElementById('summary-result').innerHTML = `${totalQty.toLocaleString()} <span class="text-xl text-indigo-400">EA</span>`;
    document.getElementById('summary-pallet').innerText = `${totalPallet.toFixed(1)} P`;
    let breakdownHtml = '<div class="space-y-2 mt-4">';
    Object.keys(breakdown).forEach(sup => { breakdownHtml += `<div class="flex justify-between items-center bg-white p-3 rounded border border-slate-200"><span class="font-bold w-1/3 truncate">${sup}</span><span class="font-black text-indigo-600 w-1/3 text-right">${breakdown[sup].qty.toLocaleString()} EA</span><span class="font-bold text-rose-500 w-1/3 text-right">${breakdown[sup].pallet.toFixed(1)} P</span></div>`; });
    document.getElementById('summary-breakdown').innerHTML = Object.keys(breakdown).length > 0 ? breakdownHtml + '</div>' : '';
}
function findItemLocationFromSummary() {
    const itemName = document.getElementById('summary-item').value; const supplier = document.getElementById('summary-supplier').value;
    if(!itemName) return alert("품목을 선택하세요.");
    let targets = globalOccupancy.filter(item => {
        let cleanSup = String(item.remarks || "기본입고처").replace(/\[기존재고\]/g, '').trim();
        return item.item_name === itemName && (supplier === 'ALL' || cleanSup === supplier);
    });
    if(targets.length === 0) return alert("재고가 없습니다.");
    globalSearchTargets = targets.map(t => t.location_id);
    let firstLoc = globalSearchTargets[0];
    if (firstLoc.startsWith('FL-')) currentZone = '현장'; else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
    showView('order'); switchOrderTab('inventory'); alert(`위치 추적 완료!`); 
}

function getWaitZoneSourceItems() { return currentZone === '실온' ? productMaster.filter(p => p.category && !p.category.includes('원란')) : (currentZone === '냉장' ? productMaster.filter(p => p.category && p.category.includes('원란')) : [...finishedProductMaster, ...productMaster]); }
function populateWaitDropdowns() {
    let items = getWaitZoneSourceItems(); let sups = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
    let ws = document.getElementById('wait-supplier'); if(ws) { let cur = ws.value; ws.innerHTML = `<option value="">1.입고처</option>` + sups.map(s => `<option value="${s}">${s}</option>`).join(''); if(sups.includes(cur)) ws.value = cur; updateWaitCategoryDropdown(); }
}
function updateWaitCategoryDropdown() {
    let ws = document.getElementById('wait-supplier'); if(!ws) return; let sup = ws.value; let items = getWaitZoneSourceItems(); let filtered = sup ? items.filter(p => p.supplier === sup) : items;
    let cats = [...new Set(filtered.map(p => p.category))].filter(Boolean).sort(); let wc = document.getElementById('wait-cat');
    if(wc) { let cur = wc.value; wc.innerHTML = `<option value="">2.카테고리</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join(''); if(cats.includes(cur)) wc.value = cur; updateWaitItemDropdown(); }
}
function updateWaitItemDropdown() {
    let sup = document.getElementById('wait-supplier')?.value; let cat = document.getElementById('wait-cat')?.value; let items = getWaitZoneSourceItems();
    let filtered = items.filter(p => (!sup || p.supplier === sup) && (!cat || p.category === cat));
    let names = [...new Set(filtered.map(p => p.item_name))].filter(Boolean).sort(); let wi = document.getElementById('wait-item');
    if(wi) wi.innerHTML = `<option value="">3.품목명</option>` + names.map(c => `<option value="${c}">${c}</option>`).join('');
}
async function createWaitingPallets() {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    const cat = document.getElementById('wait-cat').value; const item = document.getElementById('wait-item').value; const supplier = document.getElementById('wait-supplier')?.value || '기본입고처';
    let date = document.getElementById('wait-date')?.value || new Date().toISOString().split('T')[0];
    const qtyInput = document.getElementById('wait-qty').value; const palInput = document.getElementById('wait-pal').value;
    if(!cat || !item) return alert("카테고리/품목 선택 요망"); if(!qtyInput && !palInput) return alert("수량 입력 요망");
    
    let pInfo = finishedProductMaster.find(p => p.item_name === item && p.supplier === supplier) || productMaster.find(p => p.item_name === item && p.supplier === supplier);
    let pEa = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1;
    let qty = (palInput && parseFloat(palInput) > 0) ? Math.round(parseFloat(palInput) * pEa) : parseInt(qtyInput);
    if(qty <= 0) return alert("수량 오류");

    let remaining = qty; let payloads = []; let waitIndex = 1;
    while(remaining > 0) {
        let chunk = remaining > pEa ? pEa : remaining; let emptyW = "";
        for(let i=waitIndex; i<=30; i++) { let wId = `W-${i.toString().padStart(2, '0')}`; if(!globalOccupancy.find(o => o.location_id === wId) && !payloads.find(p => p.location_id === wId)) { emptyW = wId; waitIndex = i + 1; break; } }
        if(!emptyW) { alert(`대기 렉 부족! (${payloads.length}박스만 생성)`); break; }
        payloads.push({ location_id: emptyW, category: cat, item_name: item, quantity: chunk, pallet_count: chunk / pEa, production_date: date, remarks: supplier }); remaining -= chunk;
    }
    if(payloads.length > 0) { try { await Promise.all(payloads.map(p => fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(p) }))); document.getElementById('wait-qty').value = ''; document.getElementById('wait-pal').value = ''; await load(); } catch(e){} }
}

function toggleOrderCart() {
    const el = document.getElementById('order-cart-container');
    if(el.classList.contains('hidden')) { 
        el.classList.remove('hidden'); el.classList.add('flex'); 
        updateOrderCartDropdowns(); 
        let ocDate = document.getElementById('oc-date');
        if(ocDate && !ocDate.value) {
            let tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
            ocDate.value = tmr.toISOString().split('T')[0];
        }
    } 
    else { el.classList.add('hidden'); el.classList.remove('flex'); }
}
function updateOrderCartDropdowns() {
    let sups = [...new Set(productMaster.map(p=>p.supplier))].filter(Boolean).sort(); let supSel = document.getElementById('oc-sup');
    if(supSel) { let cur = supSel.value; supSel.innerHTML = '<option value="">1. 발주처 선택</option>' + sups.map(s=>`<option value="${s}">${s}</option>`).join(''); if(sups.includes(cur)) supSel.value = cur; updateOrderCartCategoryDropdown(); }
}
function updateOrderCartCategoryDropdown() {
    let sup = document.getElementById('oc-sup').value; let cats = [...new Set(productMaster.filter(p=>p.supplier===sup).map(p=>p.category))].filter(Boolean).sort(); let catSel = document.getElementById('oc-cat');
    if(catSel) { let cur = catSel.value; catSel.innerHTML = '<option value="">2. 카테고리</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join(''); if(cats.includes(cur)) catSel.value = cur; updateOrderCartItemDropdown(); }
}
function updateOrderCartItemDropdown() {
    let sup = document.getElementById('oc-sup').value; let cat = document.getElementById('oc-cat').value; let items = [...new Set(productMaster.filter(p=>p.supplier===sup && p.category===cat).map(p=>p.item_name))].filter(Boolean).sort(); let itemSel = document.getElementById('oc-item');
    if(itemSel) itemSel.innerHTML = '<option value="">3. 품목 선택</option>' + items.map(c=>`<option value="${c}">${c}</option>`).join('');
}
function addOrderCartItem() {
    if(loginMode === 'viewer') return; 
    let cat = document.getElementById('oc-cat').value; 
    let item = document.getElementById('oc-item').value; 
    let sup = document.getElementById('oc-sup').value; 
    let pal = parseFloat(document.getElementById('oc-pal').value);
    let expDate = document.getElementById('oc-date') ? document.getElementById('oc-date').value : '';
    
    if(!item || !sup || isNaN(pal) || pal <= 0) return alert("입력 확인");
    if(!expDate) {
        let tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
        expDate = tmr.toISOString().split('T')[0];
    }

    let pInfo = productMaster.find(p=>p.item_name===item && p.supplier===sup); 
    let totalQty = Math.round(pal * (pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1));
    
    orderCart.push({ category: cat, item_name: item, supplier: sup, pallet_count: pal, quantity: totalQty, expected_date: expDate }); 
    document.getElementById('oc-pal').value = ''; 
    renderOrderCart();
}
function removeOrderCartItem(index) { orderCart.splice(index, 1); renderOrderCart(); }

function renderOrderCart() {
    let tbody = document.getElementById('order-cart-tbody'); if(!tbody) return;
    if(orderCart.length === 0) return tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-slate-400">비어있음</td></tr>`;
    tbody.innerHTML = orderCart.map((item, idx) => `<tr><td class="p-2 font-bold text-blue-600">${item.expected_date.substring(5)}</td><td class="p-2">${item.supplier}</td><td class="p-2 font-black">${item.item_name}</td><td class="p-2 text-right">${item.pallet_count}P</td><td class="p-2 text-center"><button onclick="removeOrderCartItem(${idx})" class="text-rose-500 font-bold">삭제</button></td></tr>`).join('');
}

async function submitOrderCart() {
    if(loginMode === 'viewer') return; if(orderCart.length === 0) return;
    
    let text = "[한스팜]발주요청서\n"; 
    orderCart.forEach((item, i) => { 
        item.production_date = item.expected_date; 
        text += `${i + 1}. ${item.item_name} - ${item.pallet_count} 파레트\n`; 
    });

    let tempOrders = orderCart.map(item => ({
        id: 'temp_' + Date.now() + Math.random(),
        action_type: '발주중',
        created_at: new Date().toISOString(),
        production_date: item.expected_date,
        remarks: item.supplier,
        item_name: item.item_name,
        quantity: item.quantity,
        pallet_count: item.pallet_count,
        category: item.category
    }));
    
    globalHistory = [...tempOrders, ...globalHistory];
    renderOrderList();

    try { 
        let res = await fetch('/api/orders_create', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(orderCart) 
        }); 
        
        let data = await res.json();
        if (data.status !== 'success') {
            throw new Error(data.message || "알 수 없는 서버 에러");
        }

        try {
            await navigator.clipboard.writeText(text);
            alert("발주 등록 및 카카오톡 텍스트 복사 완료!"); 
        } catch(err) {
            alert("발주가 성공적으로 등록되었습니다!\n(※ 브라우저 보안 정책으로 텍스트 자동 복사는 차단되었습니다. 직접 입력해주세요.)");
        }

        orderCart = []; 
        toggleOrderCart(); 
        await load(); 
        
    } catch(e) {
        globalHistory = globalHistory.filter(h => !h.id.toString().startsWith('temp_'));
        renderOrderList();
        alert("❌ 발주 데이터 저장 실패!\n원인: " + e.message);
    }
}

// 💡 1. [신규 패치] 발주 목록 정렬 UI 안전하게 그리기
function initOrderSortUI() {
    try {
        const container = document.getElementById('subview-history');
        if(!container) return;
        if(document.getElementById('order-sort-select')) return;

        let sortHtml = `
            <div class="flex justify-end items-center bg-slate-50 p-2 border-b border-slate-200">
                <span class="text-xs font-bold text-slate-500 mr-2">보기 방식:</span>
                <select id="order-sort-select" onchange="renderOrderList()" class="border-2 border-slate-300 rounded px-3 py-1.5 text-sm font-black text-indigo-700 outline-none focus:border-indigo-500 cursor-pointer shadow-sm">
                    <option value="expected_asc" selected>📅 입고예정일 빠른 순 (기본)</option>
                    <option value="created_desc">🆕 최근 등록 발주 순</option>
                    <option value="name_asc">📝 품목명 가나다순</option>
                    <option value="qty_desc">📦 발주 수량 많은 순</option>
                </select>
            </div>
        `;
        
        const tableEl = container.querySelector('table');
        if(tableEl && tableEl.parentElement) {
            tableEl.parentElement.insertAdjacentHTML('beforebegin', sortHtml);
        } else {
            container.insertAdjacentHTML('afterbegin', sortHtml);
        }
    } catch(e) {
        console.error("UI 생성 에러 방어: ", e);
    }
}

// 💡 2. [완벽 에러 차단] 빈 날짜나 특수문자가 있어도 절대 뻗지 않는 렌더링
function renderOrderList() {
    try {
        let orders = globalHistory.filter(h => h.action_type === '발주중');
        let sortType = document.getElementById('order-sort-select')?.value || 'expected_asc';

        // 정렬 에러 100% 방어
        orders.sort((a, b) => {
            if(sortType === 'expected_asc') {
                let dateA = String(a.production_date || '9999-12-31'); 
                let dateB = String(b.production_date || '9999-12-31');
                return dateA.localeCompare(dateB);
            } 
            else if (sortType === 'created_desc') { 
                return new Date(b.created_at || 0) - new Date(a.created_at || 0); 
            }
            else if (sortType === 'name_asc') { 
                return String(a.item_name || '').localeCompare(String(b.item_name || '')); 
            }
            else if (sortType === 'qty_desc') { 
                return (Number(b.quantity) || 0) - (Number(a.quantity) || 0); 
            }
        });

        let tbody = document.getElementById('order-list-tbody'); if(!tbody) return;
        if(orders.length === 0) return tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-slate-400">진행 중인 발주 내역이 없습니다.</td></tr>`;
        
        tbody.innerHTML = orders.map(o => {
            let expDate = o.production_date || '미정';
            let crDate = String(o.created_at || '').substring(0, 10);
            
            // 특수문자 따옴표(')로 인한 버튼 고장 방지
            let safeItemName = String(o.item_name || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
            let safeRemarks = String(o.remarks || '기본').replace(/'/g, "\\'").replace(/"/g, "&quot;");
            let safeCat = String(o.category || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
            
            let qty = Number(o.quantity) || 0;
            let pal = Number(o.pallet_count) || 0;

            let actionBtns = loginMode !== 'viewer' ?
                `<div class="flex justify-center space-x-1">
                    <button onclick="receiveOrder('${o.id}', '${safeItemName}', ${qty}, ${pal}, '${safeRemarks}', '${safeCat}')" class="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded text-xs font-bold transition-colors shadow-sm">도착</button>
                    <button onclick="openEditOrderModal('${o.id}')" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold transition-colors shadow-sm">수정</button>
                    <button onclick="cancelOrder('${o.id}')" class="bg-slate-200 hover:bg-slate-300 text-slate-600 px-2 py-1 rounded text-xs font-bold transition-colors shadow-sm">취소</button>
                </div>` : '';
            return `<tr><td class="p-3 text-slate-500">${crDate}</td><td class="p-3 font-bold text-blue-600">${expDate}</td><td class="p-3 font-black text-rose-600">${safeRemarks}</td><td class="p-3 font-black">${safeItemName}</td><td class="p-3 text-right text-indigo-600">${qty.toLocaleString()}EA (${pal.toFixed(1)}P)</td><td class="p-3 text-center"><span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold shadow-sm">발주중</span></td><td class="p-3 text-center align-middle w-36">${actionBtns}</td></tr>`;
        }).join('');
    } catch(e) {
        console.error("렌더링 에러 방어 완료: ", e);
    }
}

function openEditOrderModal(logId) {
    if(loginMode === 'viewer') return;
    let order = globalHistory.find(h => h.id === logId);
    if(!order) return;

    document.getElementById('edit-order-id').value = logId;
    let sup = order.remarks || '기본입고처';
    document.getElementById('edit-order-supplier').value = sup;
    document.getElementById('edit-order-supplier-text').innerText = sup;

    let cats = [...new Set(productMaster.filter(p=>p.supplier===sup).map(p=>p.category))].filter(Boolean).sort();
    let catSel = document.getElementById('edit-order-cat');
    catSel.innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join('');
    
    if(cats.includes(order.category)) {
        catSel.value = order.category;
    } else if (cats.length > 0) {
        catSel.value = cats[0]; 
    }

    updateEditOrderCategoryDropdown(order.item_name);

    document.getElementById('edit-order-qty').value = order.quantity;
    document.getElementById('edit-order-date').value = order.production_date || new Date().toISOString().split('T')[0];

    let modal = document.getElementById('edit-order-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function updateEditOrderCategoryDropdown(selectedItem = null) {
    let sup = document.getElementById('edit-order-supplier').value;
    let cat = document.getElementById('edit-order-cat').value;
    
    let items = [...new Set(productMaster.filter(p=>p.supplier===sup && p.category===cat).map(p=>p.item_name))].filter(Boolean).sort();
    let itemSel = document.getElementById('edit-order-item');
    itemSel.innerHTML = items.map(i=>`<option value="${i}">${i}</option>`).join('');
    
    if(selectedItem && items.includes(selectedItem)) {
        itemSel.value = selectedItem;
    }
}

function closeEditOrderModal() {
    let modal = document.getElementById('edit-order-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function submitEditOrder() {
    let logId = document.getElementById('edit-order-id').value;
    let sup = document.getElementById('edit-order-supplier').value;
    let cat = document.getElementById('edit-order-cat').value;
    let newItem = document.getElementById('edit-order-item').value;
    let newQty = parseInt(document.getElementById('edit-order-qty').value);
    let newDate = document.getElementById('edit-order-date').value;

    if(!newItem || isNaN(newQty) || newQty <= 0 || !newDate) return alert("입력값을 확인해주세요.");

    let pInfo = finishedProductMaster.find(p => p.item_name === newItem && p.supplier === sup) || productMaster.find(p => p.item_name === newItem && p.supplier === sup);
    let pEa = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1;
    let newPallet = newQty / pEa;

    if(!confirm(`✅ [발주 내역 수정 확인]\n\n- 품목명: ${newItem}\n- 총 수량: ${newQty.toLocaleString()} EA (${newPallet.toFixed(1)} P)\n- 도착 예정일: ${newDate}\n\n위 내용으로 수정하시겠습니까?`)) return;

    try {
        await fetch(`/api/history/${logId}`, { method: 'DELETE' }); 
        
        let updateData = [{
            category: cat,
            item_name: newItem,
            supplier: sup,
            pallet_count: newPallet,
            quantity: newQty,
            production_date: newDate
        }];
        
        await fetch('/api/orders_create', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(updateData) }); 
        alert("발주 내역이 성공적으로 수정되었습니다.");
        closeEditOrderModal();
        await load();
    } catch(e) {
        alert("수정 중 오류가 발생했습니다.");
    }
}

async function receiveOrder(logId, itemName, qty, pallet, supplier, cat) {
    if(loginMode === 'viewer') return; 
    
    let today = new Date().toISOString().split('T')[0];
    let receiveDate = prompt(`[${itemName}] 입고 처리\n실제 도착(입고)일을 입력하세요 (YYYY-MM-DD):`, today);
    if (receiveDate === null) return;
    if (receiveDate.trim() === '') receiveDate = today;

    let pInfo = finishedProductMaster.find(p => p.item_name === itemName && p.supplier === supplier) || productMaster.find(p => p.item_name === itemName && p.supplier === supplier); 
    let defaultPEa = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1; 
    let defaultPallets = qty / defaultPEa;

    let useDefault = confirm(`📦 입고 대기장 박스화 설정\n\n현재 품목관리 마스터 기준:\n- 총 입고 수량: ${qty.toLocaleString()} EA\n- 1P(박스)당 기준: ${defaultPEa.toLocaleString()} EA\n- 예상 박스 개수: ${defaultPallets.toFixed(1)} P\n\n이 기준대로 대기장에 자동 분할할까요?\n\n[확인]: 예 (마스터 기준 적용)\n[취소]: 아니오 (1박스당 수량 직접 입력)`);

    let pEa = defaultPEa;

    if (!useDefault) {
        let manualEa = prompt(`1박스당 포장될 낱개 수량(EA)을 직접 입력하세요:\n(총 ${qty.toLocaleString()}EA를 몇 개씩 쪼갤지 입력)`, defaultPEa);
        if(manualEa === null) return;
        pEa = parseInt(manualEa);
        if(isNaN(pEa) || pEa <= 0) return alert("올바른 수량을 입력해주세요. 입고가 취소됩니다.");
    }

    let remaining = qty; 
    let payloads = []; 
    let waitIndex = 1;
    
    while(remaining > 0) { 
        let chunk = remaining > pEa ? pEa : remaining; 
        let emptyW = ""; 
        for(let i=waitIndex; i<=30; i++) { 
            let wId = `W-${i.toString().padStart(2, '0')}`; 
            if(!globalOccupancy.find(o => o.location_id === wId) && !payloads.find(p => p.location_id === wId)) { emptyW = wId; waitIndex = i + 1; break; } 
        } 
        if(!emptyW) { 
            if(payloads.length === 0) return alert(`❌ 대기장(W-01~W-30)이 꽉 찼습니다! 빈 공간을 확보해주세요.`); 
            else { alert(`대기장이 부족하여 전체 중 일부(${payloads.length}박스)만 먼저 입고 처리됩니다.`); break; } 
        } 
        payloads.push({ location_id: emptyW, category: cat || '미분류', item_name: itemName, quantity: chunk, pallet_count: chunk / pEa, production_date: receiveDate, remarks: supplier }); 
        remaining -= chunk; 
    }
    
    if(payloads.length === 0) return; 
    
    if(!confirm(`총 ${payloads.length} 파레트(박스)로 분할되어 대기장으로 입고됩니다.\n진행하시겠습니까?`)) return;
    
    try { 
        await fetch(`/api/history/${logId}`, { method: 'DELETE' }); 
        await Promise.all(payloads.map(p => fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(p) }))); 
        alert("대기장 입고 완료!"); 
        await load(); 
    } catch(e) {
        alert("입고 처리 중 통신 오류가 발생했습니다.");
    }
}

async function cancelOrder(logId) { if(loginMode === 'viewer') return; if(!confirm("발주 내역을 완전히 취소하시겠습니까?")) return; try { await fetch(`/api/history/${logId}`, { method: 'DELETE' }); await load(); } catch(e) {} }

function renderSafetyStock() { 
    const mode = document.getElementById('safe-mode') ? document.getElementById('safe-mode').value : 'pallet';
    const thead = document.getElementById('safety-thead'); const tbody = document.getElementById('safety-list');
    let materialProducts = productMaster.filter(p => p.category && !p.category.includes('원란'));
    let aggregatedItems = {};
    
    materialProducts.forEach(p => { 
        let key = p.item_name; 
        if (!aggregatedItems[key]) aggregatedItems[key] = { category: p.category || '미분류', item_name: p.item_name, suppliers: new Set(), total_qty: 0, total_pallet: 0, daily_usage: p.daily_usage || 0 }; 
        if (p.supplier) aggregatedItems[key].suppliers.add(p.supplier); 
        if(p.daily_usage > aggregatedItems[key].daily_usage) aggregatedItems[key].daily_usage = p.daily_usage; 
    });

    globalOccupancy.forEach(item => { 
        let key = item.item_name; 
        if(aggregatedItems[key]) { 
            aggregatedItems[key].total_qty += (parseInt(item.quantity) || 0); 
            aggregatedItems[key].total_pallet += getDynamicPalletCount(item); 
            let cleanSup = String(item.remarks || "기본입고처").replace(/\[기존재고\]/g, '').trim();
            if (cleanSup && cleanSup !== '기본입고처') aggregatedItems[key].suppliers.add(cleanSup); 
        } 
    });
    
    let monitoredList = Object.values(aggregatedItems); let html = '';
    
    let supSelect = document.getElementById('safe-filter-sup'); let catSelect = document.getElementById('safe-filter-cat');
    let curSup = supSelect ? supSelect.value : 'ALL'; let curCat = catSelect ? catSelect.value : 'ALL';
    if(supSelect && supSelect.options.length <= 1) { supSelect.innerHTML = `<option value="ALL">전체 입고처</option>` + [...new Set(materialProducts.map(p=>p.supplier))].filter(Boolean).sort().map(s=>`<option value="${s}">${s}</option>`).join(''); supSelect.value = curSup; }
    if(catSelect && catSelect.options.length <= 1) { catSelect.innerHTML = `<option value="ALL">전체 카테고리</option>` + [...new Set(materialProducts.map(p=>p.category))].filter(Boolean).sort().map(c=>`<option value="${c}">${c}</option>`).join(''); catSelect.value = curCat; }
    monitoredList = monitoredList.filter(i => (curSup === 'ALL' || i.suppliers.has(curSup)) && (curCat === 'ALL' || i.category === curCat));

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
