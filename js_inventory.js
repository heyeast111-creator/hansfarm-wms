// ==========================================
// [재고/발주] - 렉맵 및 우측 패널 기능 완전체
// ==========================================

function switchOrderTab(tab) {
    currentOrderTab = tab;
    ['inventory', 'search', 'history', 'safety', 'daily'].forEach(t => {
        let btn = document.getElementById('order-tab-' + t); let view = document.getElementById('subview-' + t);
        if(btn) btn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-slate-400 hover:text-slate-600 border-b-4 border-transparent transition-colors";
        if(view) view.classList.add('hidden');
    });
    let activeBtn = document.getElementById('order-tab-' + tab); let activeView = document.getElementById('subview-' + tab);
    if(activeBtn) activeBtn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-indigo-700 border-b-4 border-indigo-700 transition-colors";
    if(activeView) activeView.classList.remove('hidden');
    
    if(tab === 'inventory') renderMap();
    if(tab === 'daily') renderDailyInventory();
    if(tab === 'search') updateSummarySupplierDropdown();
}

function switchZone(zone) { currentZone = zone; selectedCellId = null; renderMap(); updateZoneTabs(); populateWaitDropdowns(); }
function updateZoneTabs() {
    ['tab-room', 'tab-cold', 'tab-floor'].forEach(id => {
        let el = document.getElementById(id);
        if(el) el.className = "whitespace-nowrap px-4 py-2 bg-slate-100 border text-slate-500 font-bold rounded-lg text-sm";
    });
    let activeId = currentZone === '실온' ? 'tab-room' : (currentZone === '냉장' ? 'tab-cold' : 'tab-floor');
    let activeEl = document.getElementById(activeId);
    if(activeEl) activeEl.className = `whitespace-nowrap px-4 py-2 ${currentZone==='실온'?'bg-orange-500':(currentZone==='냉장'?'bg-indigo-600':'bg-emerald-500')} text-white font-bold rounded-lg text-sm`;
}

// 💡 렉맵 렌더링 (데이터 연결 복구)
function renderMap() {
    try {
        const floor = document.getElementById('floor-select')?.value || "1";
        const vContainer = document.getElementById('vertical-racks');
        const hContainer = document.getElementById('horizontal-rack');
        if(!vContainer) return;

        const occMap = {}; globalOccupancy.forEach(item => { occMap[item.location_id] = true; });

        let vHtml = '';
        if(currentZone === '현장') {
            const prodSiteConfig = [{ id: 'FL-1F', name: '현장 1층', areas: [{ key: 'R', title: '원란' }, { key: 'M', title: '자재' }, { key: 'P', title: '제품' }]}, { id: 'FL-2F', name: '현장 2층', areas: [{ key: 'M', title: '자재' }, { key: 'P', title: '제품' }]}, { id: 'FL-3F', name: '현장 3층', areas: [{ key: 'G', title: '일반' }]}];
            prodSiteConfig.forEach(floorInfo => {
                vHtml += `<div class="bg-white p-4 rounded-xl mb-4 border w-full font-black text-sm">${floorInfo.name}<div class="flex flex-col space-y-2 mt-2">`;
                floorInfo.areas.forEach(area => {
                    let areaId = `${floorInfo.id}-${area.key}`; let cols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;
                    vHtml += `<div class="p-2 border rounded bg-slate-50"><div class="text-[10px] mb-1">${area.title}</div><div class="grid grid-cols-10 gap-1">`;
                    for (let r = 1; r <= cols; r++) {
                        let dbId = `${areaId}-${r.toString().padStart(2, '0')}`;
                        let state = occMap[dbId] ? 'cell-full' : 'cell-empty';
                        if(selectedCellId === dbId) state = 'cell-active';
                        vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}')" class="h-8 rounded border text-[10px] flex items-center justify-center cursor-pointer rack-cell ${state}">${r}</div>`;
                    }
                    vHtml += `</div></div>`;
                });
                vHtml += `</div></div>`;
            });
            vContainer.innerHTML = vHtml; hContainer.innerHTML = ''; return;
        }

        const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold;
        const prefix = currentZone === '실온' ? 'R-' : 'C-';
        activeLayout.forEach(col => {
            if (col.aisle) vHtml += `<div class="w-10 h-[400px] bg-yellow-50/50 border-x-2 border-yellow-200 mx-1 flex items-center justify-center"><span class="text-[10px] font-black text-yellow-600" style="writing-mode:vertical-rl">통로</span></div>`;
            else if (col.gap) vHtml += `<div class="w-2"></div>`;
            else {
                vHtml += `<div class="flex flex-col w-12 space-y-1 justify-end"><div class="text-center font-black text-sm">${col.id}</div>`;
                for (let r = col.cols; r >= 1; r--) {
                    let baseId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`;
                    let searchId = (floor === "1") ? baseId : `${baseId}-2F`;
                    let state = occMap[searchId] ? 'cell-full' : 'cell-empty';
                    if(selectedCellId === searchId) state = 'cell-active';
                    vHtml += `<div id="cell-${searchId}" onclick="clickCell('${searchId}')" class="h-8 rounded border text-[9px] flex items-center justify-center cursor-pointer rack-cell ${state}">${col.id}${r}</div>`;
                }
                vHtml += `</div>`;
            }
        });
        vContainer.innerHTML = vHtml;

        let hHtml = `<div class="flex space-x-1">`;
        let hPrefix = currentZone === '실온' ? 'K' : 'I';
        let hCols = currentZone === '실온' ? 10 : 8;
        for (let c = hCols; c >= 1; c--) {
            let baseId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`;
            let searchId = (floor === "1") ? baseId : `${baseId}-2F`;
            let state = occMap[searchId] ? 'cell-full' : 'cell-empty';
            if(selectedCellId === searchId) state = 'cell-active';
            hHtml += `<div id="cell-${searchId}" onclick="clickCell('${searchId}')" class="h-10 w-12 rounded border text-[10px] flex items-center justify-center cursor-pointer rack-cell ${state}">${hPrefix}${c}</div>`;
        }
        hContainer.innerHTML = hHtml + `</div>`;
    } catch(e){ console.error(e); }
}

// 💡 우측 패널 기능 버튼 완벽 복구
async function clickCell(searchId) {
    selectedCellId = searchId; renderMap();
    document.getElementById('right-sidebar').classList.remove('hidden');
    document.getElementById('right-sidebar').classList.add('flex');
    const panel = document.getElementById('info-panel');
    const items = globalOccupancy.filter(x => x.location_id === searchId);

    let html = `<div class="bg-indigo-50 p-4 rounded-lg mb-4 font-black text-xl text-indigo-900">${searchId}</div>`;
    if(items.length > 0) {
        items.forEach(item => {
            html += `
            <div class="bg-white border-2 border-slate-200 rounded-xl p-4 shadow-sm mb-4">
                <div class="font-black text-sm text-slate-800 mb-1">${item.item_name}</div>
                <div class="text-right text-indigo-600 font-black text-lg">${item.quantity.toLocaleString()} EA</div>
                <div class="text-[10px] text-rose-500 font-bold mb-3">입고처: ${item.remarks || '기본'}</div>
                <div class="grid grid-cols-2 gap-2 border-t pt-3">
                    <button onclick="dispatchToFloor('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="bg-emerald-50 text-emerald-700 py-2 rounded text-[10px] font-bold border border-emerald-200">현장 반출</button>
                    <button onclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="bg-blue-50 text-blue-700 py-2 rounded text-[10px] font-bold border border-blue-200">렉 이동</button>
                    <button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="bg-rose-50 text-rose-700 py-2 rounded text-[10px] font-bold border border-rose-200">최종 출고</button>
                    <button onclick="splitPallet('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="bg-orange-50 text-orange-700 py-2 rounded text-[10px] font-bold border border-orange-200">파레트 분할</button>
                </div>
                <button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date}', '${searchId}')" class="w-full mt-2 bg-slate-100 text-slate-600 py-2 rounded text-[10px] font-bold">수정/삭제</button>
            </div>`;
        });
    } else { html += `<div class="text-center py-20 text-slate-400 font-bold border-2 border-dashed rounded-xl">비어있음</div>`; }
    panel.innerHTML = html;
}

// 💡 엑셀 실사 덮어쓰기 무적 로직
async function importExcel(event) {
    const file = event.target.files[0]; if(!file) return;
    const data = await file.arrayBuffer(); const workbook = XLSX.read(data);
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval:""});
    if(!confirm("⚠️ 실사수량이 입력된 렉은 기존 데이터를 삭제하고 덮어씁니다. 진행할까요?")) return;
    let count = 0;
    for(let row of jsonData) {
        let loc = String(row["위치"]||"").trim(); let sQty = String(row["실사수량(EA)"]||"").trim();
        if(!loc || sQty === "") continue;
        let newQty = parseInt(sQty.replace(/,/g,'')); let itemName = String(row["품목명"]||"").trim();
        let existings = globalOccupancy.filter(o => o.location_id === loc);
        for(let e of existings) await fetch('/api/inventory_edit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ inventory_id: e.id, action:'DELETE' }) });
        if(newQty > 0 && itemName !== "[비어있음]" && itemName !== "") {
            await fetch('/api/inbound', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ location_id: loc, item_name: itemName, quantity: newQty, pallet_count: newQty/180, category: String(row["카테고리"]||"기타"), remarks: String(row["입고처"]||"실사입고") }) });
        }
        count++;
    }
    alert(`${count}개 렉 실사 반영 완료!`); load();
}

// 💡 기타 기능 함수들 (이동, 출고 등)
function selectForMove(invId, itemName, maxQty, fromLoc) { movingItem = { invId, itemName, maxQty, fromLoc }; renderMap(); alert("이동할 목적지 렉을 클릭하세요."); }
function getDynamicPalletCount(item) { let pInfo = [...productMaster, ...finishedProductMaster].find(p => p.item_name === item.item_name); return pInfo?.pallet_ea ? item.quantity / pInfo.pallet_ea : item.quantity / 180; }
function toggleWaitManualInput() { let sel = document.getElementById('wait-item'); let man = document.getElementById('wait-item-manual'); if(sel.value==='DIRECT_INPUT'){ sel.classList.add('hidden'); man.classList.remove('hidden'); man.focus(); } }
function toggleWaitContainer() { document.getElementById('wait-container').classList.toggle('hidden'); }
function toggleMapSearch() { document.getElementById('map-search-container').classList.toggle('hidden'); }

// 💡 일자별 재고 조회
function renderDailyInventory() {
    let target = document.getElementById('daily-target-date').value; if(!target) return;
    let stock = {};
    globalHistory.forEach(h => {
        if(new Date(h.created_at).toISOString().split('T')[0] <= target) {
            let key = h.item_name; if(!stock[key]) stock[key] = { cat: h.category||"기타", qty: 0 };
            if(h.action_type==='입고') stock[key].qty += h.quantity; else if(h.action_type==='출고') stock[key].qty -= h.quantity;
        }
    });
    let html = Object.keys(stock).filter(k => stock[k].qty !== 0).map(k => `<tr><td class="p-3">${stock[k].cat}</td><td class="p-3 font-bold">${k}</td><td class="p-3 text-right font-black text-indigo-600">${stock[k].qty.toLocaleString()} EA</td></tr>`).join('');
    document.getElementById('daily-inventory-list').innerHTML = html || '<tr><td colspan="3" class="p-10 text-center text-slate-400">내역 없음</td></tr>';
}
