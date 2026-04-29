// ==========================================
// [재고/발주] - 상단 탭 및 구역 전환 로직
// ==========================================
window.floorFilterMap = window.floorFilterMap || { 'FL-1F': true, 'FL-2F': true, 'FL-3F': true };
window.areaFilterMap = window.areaFilterMap || { 'R': true, 'M': true, 'P': true, 'G': true };
window.isMapFilterOpen = window.isMapFilterOpen || false; 

function toggleMapFilters() { window.isMapFilterOpen = !window.isMapFilterOpen; renderMap(); }
function toggleFloorFilter(fId) { window.floorFilterMap[fId] = !window.floorFilterMap[fId]; renderMap(); }
function toggleAreaFilter(aKey) { window.areaFilterMap[aKey] = !window.areaFilterMap[aKey]; renderMap(); }

// 💡 일자별 재고 탭 UI 자동 생성기 (유지)
function initDailyInventoryUI() {
    if(document.getElementById('order-tab-daily')) return;
    const tabContainer = document.querySelector('#view-order .bg-white.border-b.flex');
    if(tabContainer) {
        const btn = document.createElement('button');
        btn.id = 'order-tab-daily';
        btn.onclick = () => switchOrderTab('daily');
        btn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-slate-400 hover:text-slate-600 border-b-4 border-transparent transition-colors";
        btn.innerText = "📅 일자별 재고";
        tabContainer.appendChild(btn);
    }
    const viewContainer = document.querySelector('#view-order .flex-1.relative');
    if(viewContainer) {
        const subview = document.createElement('div');
        subview.id = 'subview-daily';
        subview.className = 'hidden flex-col h-full w-full absolute inset-0 p-4 md:p-8 bg-slate-100 overflow-auto';
        let today = new Date().toISOString().split('T')[0];
        subview.innerHTML = `
            <div class="bg-white p-6 rounded-2xl shadow-md border border-slate-200 flex flex-col h-full min-h-[400px]">
                <div class="flex justify-between items-center mb-4 border-b pb-2 shrink-0"><h2 class="text-xl md:text-2xl font-black text-slate-800">📅 타임머신: 일자별 재고 현황</h2></div>
                <div class="flex flex-col md:flex-row items-start md:items-center space-y-2 md:space-y-0 md:space-x-3 mb-4 shrink-0">
                    <div class="flex items-center space-x-2 w-full md:w-auto"><span class="text-sm font-bold text-slate-500 whitespace-nowrap">조회 일자:</span><input type="date" id="daily-target-date" value="${today}" onchange="renderDailyInventory()" class="border-2 border-indigo-300 rounded-lg p-2 text-sm font-black text-indigo-700 outline-none w-full md:w-auto"></div>
                    <div class="flex space-x-2 w-full md:w-auto"><button onclick="renderDailyInventory()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition-colors text-sm">조회</button><button onclick="exportDailyInventoryExcel()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors text-sm whitespace-nowrap">엑셀 다운로드</button></div>
                </div>
                <div class="overflow-y-auto flex-1 custom-scrollbar border border-slate-200 rounded-lg bg-slate-50"><table class="w-full text-left border-collapse text-sm bg-white"><thead class="sticky top-0 bg-slate-100 z-10 border-b-2 border-slate-200 text-slate-600 shadow-sm"><tr><th class="p-3 w-1/4 font-black">카테고리</th><th class="p-3 w-1/2 font-black">품목명</th><th class="p-3 w-1/4 text-right font-black text-indigo-700">총 수량 (EA)</th></tr></thead><tbody id="daily-inventory-list" class="divide-y divide-slate-100"></tbody></table></div>
            </div>`;
        viewContainer.appendChild(subview);
    }
}

function switchOrderTab(tab) {
    try {
        initDailyInventoryUI();
        currentOrderTab = tab;
        ['inventory', 'search', 'history', 'safety', 'daily'].forEach(t => {
            let btn = document.getElementById('order-tab-' + t); let view = document.getElementById('subview-' + t);
            if(btn) btn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-slate-400 hover:text-slate-600 border-b-4 border-transparent transition-colors";
            if(view) { view.classList.add('hidden'); view.classList.remove('flex'); }
        });
        let activeBtn = document.getElementById('order-tab-' + tab); let activeView = document.getElementById('subview-' + tab);
        if(activeBtn) activeBtn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-indigo-700 border-b-4 border-indigo-700 transition-colors";
        if(activeView) { activeView.classList.remove('hidden'); activeView.classList.add('flex'); }
        let rs = document.getElementById('right-sidebar');
        if(tab === 'inventory') { if(isRightPanelVisible && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } renderMap(); } 
        else { if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); } }
        if(tab === 'search') updateSummarySupplierDropdown();
        if(tab === 'safety') renderSafetyStock();
        if(tab === 'history') { updateOrderCartDropdowns(); if(typeof initOrderSortUI === 'function') initOrderSortUI(); renderOrderList(); }
        if(tab === 'daily') { renderDailyInventory(); }
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
        if(currentZone === '현장') { if(fifoBtn) fifoBtn.classList.add('hidden'); if(floorSel) floorSel.classList.add('hidden'); } 
        else { if(currentZone === '냉장') { if(fifoBtn) fifoBtn.classList.remove('hidden'); } else { if(fifoBtn) fifoBtn.classList.add('hidden'); } if(floorSel) floorSel.classList.remove('hidden'); }
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
// 💡 [추가 1&2] 대기장 다각적 활용 (기타 등록 / 현장 반납)
// ==========================================
function toggleWaitManualInput() {
    const sel = document.getElementById('wait-item');
    const manualInput = document.getElementById('wait-item-manual');
    if (sel.value === 'DIRECT_INPUT') {
        sel.classList.add('hidden');
        manualInput.classList.remove('hidden');
        manualInput.focus();
    } else {
        sel.classList.remove('hidden');
        manualInput.classList.add('hidden');
    }
}

function populateWaitDropdowns() {
    let items = getWaitZoneSourceItems(); 
    let sups = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
    // 💡 현장 반납 및 기타 업체 추가
    if (!sups.includes('현장반납')) sups.unshift('현장반납');
    if (!sups.includes('기타(미등록)')) sups.push('기타(미등록)');
    
    let ws = document.getElementById('wait-supplier'); 
    if(ws) { 
        let cur = ws.value; 
        ws.innerHTML = `<option value="">1.입고/반납처</option>` + sups.map(s => `<option value="${s}">${s}</option>`).join(''); 
        if(sups.includes(cur)) ws.value = cur; 
        updateWaitCategoryDropdown(); 
    }
}

function updateWaitCategoryDropdown() {
    let ws = document.getElementById('wait-supplier'); if(!ws) return; 
    let sup = ws.value; 
    let items = getWaitZoneSourceItems(); 
    let filtered = (sup && sup !== '현장반납' && sup !== '기타(미등록)') ? items.filter(p => p.supplier === sup) : items;
    let cats = [...new Set(filtered.map(p => p.category))].filter(Boolean).sort();
    
    // 💡 기타 카테고리 추가
    if (!cats.includes('기타')) cats.push('기타');
    
    let wc = document.getElementById('wait-cat');
    if(wc) { 
        let cur = wc.value; 
        wc.innerHTML = `<option value="">2.분류(카테고리)</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join(''); 
        if(cats.includes(cur)) wc.value = cur; 
        updateWaitItemDropdown(); 
    }
}

function updateWaitItemDropdown() {
    let sup = document.getElementById('wait-supplier')?.value; 
    let cat = document.getElementById('wait-cat')?.value; 
    let items = getWaitZoneSourceItems();
    let filtered = items.filter(p => (!sup || sup.includes('기타') || sup === '현장반납' || p.supplier === sup) && (!cat || p.category === cat));
    let names = [...new Set(filtered.map(p => p.item_name))].filter(Boolean).sort(); 
    
    let wi = document.getElementById('wait-item');
    if(wi) {
        wi.innerHTML = `<option value="">3.품목 선택</option>` 
                     + names.map(c => `<option value="${c}">${c}</option>`).join('')
                     + `<option value="DIRECT_INPUT" class="text-orange-600 font-bold">➕ 직접 입력(기타/반납)</option>`;
        wi.classList.remove('hidden');
        document.getElementById('wait-item-manual').classList.add('hidden');
    }
}

async function createWaitingPallets() {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    
    const cat = document.getElementById('wait-cat').value || '기타';
    const selItem = document.getElementById('wait-item').value;
    const manualItem = document.getElementById('wait-item-manual').value.trim();
    
    // 💡 직접 입력값 또는 선택값 결정
    let item = (selItem === 'DIRECT_INPUT') ? manualItem : selItem;
    const supplier = document.getElementById('wait-supplier')?.value || '기본입고처';
    let date = document.getElementById('wait-date')?.value || new Date().toISOString().split('T')[0];
    const qtyInput = document.getElementById('wait-qty').value; 
    const palInput = document.getElementById('wait-pal').value;

    if(!item) return alert("품목을 선택하거나 직접 입력해주세요.");
    if(!qtyInput && !palInput) return alert("수량 입력 요망");
    
    let pInfo = finishedProductMaster.find(p => p.item_name === item) || productMaster.find(p => p.item_name === item);
    let pEa = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 180; // 기본 180EA (계란판 기준)
    
    let qty = (palInput && parseFloat(palInput) > 0) ? Math.round(parseFloat(palInput) * pEa) : parseInt(qtyInput);
    if(qty <= 0) return alert("수량 오류");

    let remaining = qty; let payloads = []; let waitIndex = 1;
    while(remaining > 0) {
        let chunk = remaining > pEa ? pEa : remaining; 
        let emptyW = "";
        for(let i=waitIndex; i<=30; i++) { 
            let wId = `W-${i.toString().padStart(2, '0')}`; 
            if(!globalOccupancy.find(o => o.location_id === wId) && !payloads.find(p => p.location_id === wId)) { 
                emptyW = wId; waitIndex = i + 1; break; 
            } 
        }
        if(!emptyW) { alert(`대기 렉 부족! (${payloads.length}박스만 생성)`); break; }
        payloads.push({ location_id: emptyW, category: cat, item_name: item, quantity: chunk, pallet_count: chunk / pEa, production_date: date, remarks: supplier }); 
        remaining -= chunk;
    }
    
    if(payloads.length > 0) { 
        try { 
            await Promise.all(payloads.map(p => fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(p) }))); 
            document.getElementById('wait-qty').value = ''; 
            document.getElementById('wait-pal').value = ''; 
            document.getElementById('wait-item-manual').value = '';
            toggleWaitManualInput(); // 입력창 초기화
            await load(); 
        } catch(e){} 
    }
}

// ==========================================
// [재고/발주] - 일자별 재고 (유지)
// ==========================================
function renderDailyInventory() {
    let targetDate = document.getElementById('daily-target-date').value;
    if(!targetDate) return;
    let dailyStock = {};
    globalHistory.forEach(h => {
        let hDate = new Date(h.created_at).toISOString().split('T')[0];
        if (hDate <= targetDate) {
            let itemName = String(h.item_name || "미상").trim();
            let cat = String(h.category || "미분류").trim();
            let qty = parseInt(h.quantity) || 0;
            if(!dailyStock[itemName]) dailyStock[itemName] = { category: cat, item_name: itemName, qty: 0 };
            if (h.action_type === '입고') dailyStock[itemName].qty += qty;
            else if (h.action_type === '출고') dailyStock[itemName].qty -= qty;
        }
    });
    let stockList = Object.values(dailyStock).filter(item => item.qty !== 0).sort((a,b) => a.category.localeCompare(b.category) || a.item_name.localeCompare(b.item_name));
    let tbody = document.getElementById('daily-inventory-list');
    if(!tbody) return;
    if(stockList.length === 0) { tbody.innerHTML = `<tr><td colspan="3" class="p-10 text-center text-slate-400 font-bold">해당 일자의 재고 기록이 없습니다.</td></tr>`; return; }
    tbody.innerHTML = stockList.map(item => `<tr class="hover:bg-indigo-50/50 transition-colors"><td class="p-3 text-xs text-slate-500 font-bold border-r border-slate-100">${item.category}</td><td class="p-3 text-sm font-black text-slate-800 border-r border-slate-100">${item.item_name}</td><td class="p-3 text-right text-sm font-black text-indigo-600">${item.qty.toLocaleString()} <span class="text-xs text-indigo-400">EA</span></td></tr>`).join('');
}

function exportDailyInventoryExcel() {
    let targetDate = document.getElementById('daily-target-date').value;
    let tbody = document.getElementById('daily-inventory-list');
    if(!tbody || tbody.innerText.includes('기록이 없습니다')) return alert("다운로드할 데이터가 없습니다.");
    let wsData = [];
    tbody.querySelectorAll('tr').forEach(tr => {
        let cols = tr.querySelectorAll('td');
        if(cols.length === 3) wsData.push({ "기준일자": targetDate, "카테고리": cols[0].innerText.trim(), "품목명": cols[1].innerText.trim(), "총 수량(EA)": parseInt(cols[2].innerText.replace(/[^0-9-]/g, '')) || 0 });
    });
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 30}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, `재고현황_${targetDate}`); XLSX.writeFile(wb, `한스팜_일자별재고_${targetDate}.xlsx`);
}

// ==========================================
// [재고/발주] - 공용 헬퍼 및 맵 렌더링 (유지)
// ==========================================
function getDynamicPalletCount(itemObj) {
    if(!itemObj) return 0;
    let itemName = String(itemObj.item_name || "").trim(); 
    let supplier = String(itemObj.remarks || "기본입고처").trim(); 
    let cleanSupplier = supplier.replace(/\[기존재고\]/g, '').trim();
    let quantity = parseInt(itemObj.quantity) || 0;
    let allItems = [...finishedProductMaster, ...productMaster];
    let pInfo = allItems.find(p => String(p.item_name||"").trim() === itemName && String(p.supplier||"").trim() === cleanSupplier) || allItems.find(p => String(p.item_name||"").trim() === itemName);
    if (pInfo && parseInt(pInfo.pallet_ea) > 0) return quantity / parseInt(pInfo.pallet_ea);
    return parseFloat(itemObj.pallet_count) || 1;
}

function changeFloorCols(areaId, delta) {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    let currentCols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;
    let newCols = currentCols + delta;
    if(newCols < 1) return alert("최소 1칸"); if(newCols > 100) return alert("최대 100칸");
    if(delta < 0) { let targetId = `${areaId}-${currentCols.toString().padStart(2, '0')}`; if(globalOccupancy.some(item => item.location_id === targetId)) return alert(`재고 있음`); }
    localStorage.setItem(areaId + '_cols', newCols); renderMap();
}

function renderMap() { 
    try {
        let floorSelect = document.getElementById('floor-select'); const floor = floorSelect ? floorSelect.value : "1"; 
        const mapContainer = document.getElementById('map-container'); const mapScroller = document.getElementById('map-scroller'); 
        const vContainer = document.getElementById('vertical-racks'); const hContainer = document.getElementById('horizontal-rack'); 
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
            vHtml += `<div class="w-full max-w-4xl relative z-40 mb-8 mx-auto"><button onclick="toggleMapFilters()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-3 md:py-4 px-6 rounded-xl shadow-lg transition-all flex justify-between items-center text-sm md:text-base border-b-4 border-slate-950 relative z-50"><span class="flex items-center space-x-2"><span>⚙️</span> <span>현장 창고 보기 설정 (클릭)</span></span><span class="text-xl leading-none transition-transform duration-200" style="transform: ${window.isMapFilterOpen ? 'rotate(180deg)' : 'rotate(0deg)'}">▼</span></button><div class="${window.isMapFilterOpen ? 'flex' : 'hidden'} absolute top-full left-0 right-0 w-full bg-white p-5 rounded-b-2xl shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3)] border-x-2 border-b-2 border-slate-800 flex-col md:flex-row gap-6 items-start md:items-center mt-[-10px] pt-8 z-40 mx-auto"><div class="flex items-center space-x-4 md:border-r border-slate-300 pr-6"><span class="text-xs md:text-sm font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">🏢 층별</span><label class="cursor-pointer text-xs md:text-sm font-bold flex items-center hover:text-indigo-600 transition-colors"><input type="checkbox" ${window.floorFilterMap['FL-1F']?'checked':''} onchange="toggleFloorFilter('FL-1F')" class="mr-1.5 w-4 h-4">1층</label><label class="cursor-pointer text-xs md:text-sm font-bold flex items-center hover:text-indigo-600 transition-colors"><input type="checkbox" ${window.floorFilterMap['FL-2F']?'checked':''} onchange="toggleFloorFilter('FL-2F')" class="mr-1.5 w-4 h-4">2층</label><label class="cursor-pointer text-xs md:text-sm font-bold flex items-center hover:text-indigo-600 transition-colors"><input type="checkbox" ${window.floorFilterMap['FL-3F']?'checked':''} onchange="toggleFloorFilter('FL-3F')" class="mr-1.5 w-4 h-4">3층</label></div><div class="flex flex-wrap items-center gap-4"><span class="text-xs md:text-sm font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">📦 창고</span><label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-orange-600 hover:text-orange-700 transition-colors"><input type="checkbox" ${window.areaFilterMap['R']?'checked':''} onchange="toggleAreaFilter('R')" class="mr-1.5 w-4 h-4 accent-orange-600">원란</label><label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-blue-600 hover:text-blue-700 transition-colors"><input type="checkbox" ${window.areaFilterMap['M']?'checked':''} onchange="toggleAreaFilter('M')" class="mr-1.5 w-4 h-4 accent-blue-600">자재</label><label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-emerald-600 hover:text-emerald-700 transition-colors"><input type="checkbox" ${window.areaFilterMap['P']?'checked':''} onchange="toggleAreaFilter('P')" class="mr-1.5 w-4 h-4 accent-emerald-600">제품</label><label class="cursor-pointer text-xs md:text-sm font-black flex items-center text-slate-600 hover:text-slate-800 transition-colors"><input type="checkbox" ${window.areaFilterMap['G']?'checked':''} onchange="toggleAreaFilter('G')" class="mr-1.5 w-4 h-4 accent-slate-600">일반(3층)</label></div></div></div>`;
            const prodSiteConfig = [{ id: 'FL-1F', name: '현장 1층', areas: [{ key: 'R', title: '원란', bgColor: 'bg-orange-50' }, { key: 'M', title: '자재', bgColor: 'bg-blue-50' }, { key: 'P', title: '제품', bgColor: 'bg-emerald-50' }]}, { id: 'FL-2F', name: '현장 2층', areas: [{ key: 'M', title: '자재', bgColor: 'bg-blue-50' }, { key: 'P', title: '제품', bgColor: 'bg-emerald-50' }]}, { id: 'FL-3F', name: '현장 3층', areas: [{ key: 'G', title: '일반', bgColor: 'bg-slate-50' }]}];
            vHtml += `<div class="w-full max-w-5xl flex flex-col space-y-6 mx-auto pb-20">`; 
            prodSiteConfig.forEach(floorInfo => { if(!window.floorFilterMap[floorInfo.id]) return; vHtml += `<div class="bg-white p-4 rounded-2xl border w-full"><div class="text-sm font-black mb-4">${floorInfo.name}</div><div class="flex flex-col space-y-4">`; floorInfo.areas.forEach(area => { if(!window.areaFilterMap[area.key]) return; let areaId = `${floorInfo.id}-${area.key}`; let cols = parseInt(localStorage.getItem(areaId + '_cols')) || 10; vHtml += `<div class="${area.bgColor} p-3 rounded-xl border w-full"><div class="flex justify-between mb-3 text-xs font-black"><div>${area.title}</div><div><button onclick="changeFloorCols('${areaId}', -1)" class="bg-white px-2 py-0.5 rounded border">-</button> ${cols}칸 <button onclick="changeFloorCols('${areaId}', 1)" class="bg-white px-2 py-0.5 rounded border">+</button></div></div><div class="grid grid-cols-[repeat(auto-fill,minmax(42px,1fr))] gap-1.5">`; for (let r = 1; r <= cols; r++) { let dbId = `${areaId}-${r.toString().padStart(2, '0')}`; let cellState = occMap[dbId] ? 'cell-full' : 'cell-empty'; if(selectedCellId === dbId) cellState = 'cell-active'; let pCount = palletMap[dbId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black px-1 rounded-full z-10 scale-90">${pCount.toFixed(1)}P</div>` : ''; vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}', '${dbId}')" class="h-10 rounded border flex flex-col items-center justify-center text-[9px] font-black cursor-pointer rack-cell ${cellState} shadow-sm hover:scale-105 transition-all">${badge}<span>${r}</span></div>`; } vHtml += `</div></div>`; }); vHtml += `</div></div>`; }); vHtml += `</div>`; if(vContainer) vContainer.innerHTML = vHtml; return; 
        } 
        let aisleText = document.getElementById('aisle-text'); if(aisleText) { aisleText.classList.remove('hidden'); aisleText.innerText = "통로 (Aisle)"; }
        const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; const prefix = currentZone === '실온' ? 'R-' : 'C-'; 
        activeLayout.forEach(col => { if (col.aisle) { vHtml += `<div class="w-10 h-[420px] bg-yellow-50/50 flex items-center justify-center border-x-2 border-yellow-300 mx-1"><span class="text-yellow-600 font-black text-[10px]" style="writing-mode: vertical-rl;">통로</span></div>`; } else if (col.gap) { vHtml += `<div class="w-2"></div>`; } else { vHtml += `<div class="flex flex-col w-10 md:w-14 space-y-1 justify-end"><div class="text-center font-black text-xl text-slate-800 pb-2">${col.id}</div>`; for (let r = col.cols; r >= 1; r--) { let displayId = `${col.id}${r}`; let dbId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; let hasItem = occMap[searchId]; let cellState = hasItem ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full z-10">${pCount.toFixed(1)}P</div>` : ''; vHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="h-8 rounded-[3px] flex items-center justify-center text-[9px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">${badge}${displayId}</div>`; } vHtml += `</div>`; } }); 
        if(vContainer) vContainer.innerHTML = vHtml; 
        let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
        for (let c = hCols; c >= 1; c--) { let displayId = `${hPrefix}${c}`; let dbId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? dbId : `${dbId}-2F`; let cellState = occMap[searchId] ? 'cell-full' : 'cell-empty'; if(selectedCellId === displayId) cellState = 'cell-active'; let pCount = palletMap[searchId] || 0; let badge = (pCount > 1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full z-10">${pCount.toFixed(1)}P</div>` : ''; hHtml += `<div id="cell-${displayId}" onclick="clickCell('${displayId}', '${searchId}')" class="h-10 md:w-14 rounded-[3px] flex items-center justify-center text-[10px] font-bold cursor-pointer rack-cell ${cellState} shadow-sm">${badge}${displayId}</div>`; } 
        hHtml += `</div>`; if(hContainer) hContainer.innerHTML = hHtml; 
    } catch(e) { console.error(e); }
}

async function clickCell(displayId, searchId) { 
    try {
        if(!searchId) { if(displayId.startsWith('W-') || displayId.startsWith('FL-')) { searchId = displayId; } else { let floorSel = document.getElementById('floor-select'); const floor = floorSel ? floorSel.value : "1"; const prefix = currentZone === '실온' ? 'R-' : 'C-'; const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`); searchId = floor === "1" ? baseId : `${baseId}-2F`; } } 
        if (movingItem) {
            if (movingItem.fromLoc === searchId) { cancelMove(); return; } 
            let toLoc = searchId;
            if (!toLoc.startsWith('W-') && !toLoc.startsWith('FL-')) { let fl = prompt(`몇 층으로? (1 또는 2)`, "1"); if(fl !== "1" && fl !== "2") { cancelMove(); return; } const prefix = currentZone === '실온' ? 'R-' : 'C-'; const baseId = displayId.replace(/([A-Z])([0-9]+)/, (m, p1, p2) => `${prefix}${p1}-${p2.padStart(2, '0')}`); toLoc = fl === "1" ? baseId : `${baseId}-2F`; }
            let qtyStr = prompt(`수량? (최대 ${movingItem.maxQty})`, movingItem.maxQty); if(!qtyStr) { cancelMove(); return; } let qty = parseInt(qtyStr);
            let movePallet = getDynamicPalletCount({item_name: movingItem.itemName, remarks: movingItem.supplier, quantity: qty});
            await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: movingItem.invId, from_location: movingItem.fromLoc, to_location: toLoc, item_name: movingItem.itemName, quantity: qty, pallet_count: movePallet }) }); 
            movingItem = null; await load(); return;
        }
        selectedCellId = displayId; renderMap(); 
        if (currentOrderTab === 'inventory') { let rs = document.getElementById('right-sidebar'); if(rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); isRightPanelVisible = true; } }
        const panel = document.getElementById('info-panel'); const items = globalOccupancy.filter(x => x.location_id === searchId); 
        let panelHtml = `<div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4"><div class="text-2xl font-black text-indigo-900">${displayId}</div></div>`; 
        if(items.length > 0) { 
            items.forEach(item => { 
                let actionBtns = (loginMode !== 'viewer') ? `<div class="flex space-x-2 mt-3 border-t pt-2"><button onclick="dispatchToFloor('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}', '${item.remarks||''}')" class="flex-1 bg-emerald-50 text-emerald-700 py-1.5 rounded text-[10px] font-bold shadow-sm">현장 반출</button><button onclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, 0, '${searchId}', '${item.remarks||''}')" class="flex-1 bg-blue-50 text-blue-700 py-1.5 rounded text-[10px] font-bold shadow-sm">렉 이동</button></div>` : '';
                panelHtml += `<div class="bg-white border p-3 rounded-lg shadow-sm mb-3"><div class="font-black text-xs text-slate-800">${item.item_name}</div><div class="text-[9px] text-rose-600 font-bold">입고처: ${item.remarks||'기본'}</div><div class="text-right text-sm font-bold text-indigo-600">${item.quantity.toLocaleString()} EA</div>${actionBtns}</div>`; 
            }); 
        } else { panelHtml += `<div class="text-center text-slate-400 py-6 bg-slate-50 border-dashed border rounded-lg">비어있음</div>`; } 
        if(panel) panel.innerHTML = panelHtml; 
    } catch(e) { console.error(e); }
}

function selectForMove(invId, itemName, maxQty, currentPallet, fromLoc, supplier) { if(loginMode === 'viewer') return; movingItem = { invId, itemName, maxQty, fromLoc, supplier }; renderMap(); const p = document.getElementById('info-panel'); if(p) p.innerHTML = `<div class="bg-indigo-50 border-2 border-dashed p-6 rounded-xl text-center"><div class="text-lg font-black text-indigo-800 mb-6">이동 모드: ${itemName}</div><button onclick="cancelMove()" class="bg-slate-600 text-white font-bold py-2 px-6 rounded-lg w-full">취소</button></div>`; }
function cancelMove() { movingItem = null; renderMap(); }

// 💡 [핵심] 재고 실사 덮어쓰기 로직 (유지)
async function importExcel(event) {
    if(loginMode === 'viewer') { alert("뷰어 모드 불가"); event.target.value = ''; return; }
    const file = event.target.files[0]; if (!file) return;
    try {
        const data = await file.arrayBuffer(); const workbook = XLSX.read(data); const sheetName = workbook.SheetNames[0]; const worksheet = workbook.Sheets[sheetName]; const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        if (jsonData.length === 0) return alert("데이터 없음");
        let deletePayloads = []; let insertPayloads = []; let processCount = 0;
        for (let row of jsonData) {
            let keys = Object.keys(row);
            let keyPhysicalQty = keys.find(k => k.includes("실사")); if(!keyPhysicalQty) continue; 
            let physicalQtyStr = String(row[keyPhysicalQty]).trim(); if(physicalQtyStr === "") continue; 
            let newQty = parseInt(physicalQtyStr.replace(/,/g, '')); if(isNaN(newQty) || newQty < 0) continue;
            let keyLoc = keys.find(k => k === "위치" || k.includes("렉")); let loc = keyLoc ? String(row[keyLoc]).trim() : ""; if(!loc) continue;
            globalOccupancy.filter(o => o.location_id === loc).forEach(item => deletePayloads.push({ invId: item.id, locId: loc, itemName: item.item_name }));
            if (newQty > 0) {
                let keyName = keys.find(k => k.includes("품목") || k.includes("상품")); let itemName = keyName ? String(row[keyName]).trim() : ""; if(itemName === "[비어있음]" || !itemName) continue;
                let keyCat = keys.find(k => k.includes("카테고리")); let cat = keyCat ? String(row[keyCat]).trim() : "기타";
                let keySup = keys.find(k => k.includes("입고처") || k.includes("비고")); let remarks = keySup ? String(row[keySup]).trim() : "기본입고처";
                insertPayloads.push({ id: 'temp_' + Date.now() + Math.random(), location_id: loc, category: cat, item_name: itemName, quantity: newQty, pallet_count: newQty / 180, production_date: new Date().toISOString().split('T')[0], remarks: remarks });
            }
            processCount++;
        }
        if (processCount === 0) return alert("변동 없음");
        if (!confirm(`${processCount}건 실사 덮어쓰기 진행할까요?`)) return;
        let locsToClear = [...new Set(deletePayloads.map(d => d.locId))];
        globalOccupancy = globalOccupancy.filter(o => !locsToClear.includes(o.location_id));
        insertPayloads.forEach(ins => globalOccupancy.push(ins));
        renderMap();
        (async () => {
            for(let d of deletePayloads) await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: d.invId, location_id: d.locId, item_name: d.itemName, action: 'DELETE' }) });
            for(let ins of insertPayloads) await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(ins) });
            load();
        })();
    } catch (e) { alert("오류: " + e.message); }
}

async function dispatchToFloor(invId, itemName, maxQty, fromLoc, supplier) {
    if(loginMode === 'viewer') return;
    const floorStr = prompt(`[${itemName}] 현장 반출층 (1,2,3)`, "1"); if(!floorStr) return;
    const qtyStr = prompt(`반출 수량 (최대 ${maxQty})`, maxQty); if(!qtyStr) return;
    const qty = parseInt(qtyStr);
    let targetPrefix = floorStr === "1" ? 'FL-1F-M-' : (floorStr === "2" ? 'FL-2F-M-' : 'FL-3F-G-');
    let toLoc = targetPrefix + '01';
    await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: toLoc, item_name: itemName, quantity: qty, pallet_count: qty/180 }) });
    alert("반출 완료"); await load();
}
