// ==========================================
// [재고/발주] - 상단 탭 및 구역 전환 로직
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
    if(tab === 'history') { updateOrderCartDropdowns(); initOrderSortUI(); renderOrderList(); }
    if(tab === 'safety') renderSafetyStock();
}

function switchZone(zone) { globalSearchTargets = []; currentZone = zone; selectedCellId = null; movingItem = null; updateZoneTabs(); renderMap(); populateWaitDropdowns(); }
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
        const vContainer = document.getElementById('vertical-racks'); const hContainer = document.getElementById('horizontal-rack'); 
        if(!vContainer) return;
        vContainer.classList.add('flex-nowrap'); if(hContainer) hContainer.classList.add('flex-nowrap');

        const occMap = {}; const palletMap = {}; globalOccupancy.forEach(item => { occMap[item.location_id] = true; palletMap[item.location_id] = (palletMap[item.location_id] || 0) + getDynamicPalletCount(item); }); 

        let vHtml = ''; 
        if(currentZone === '현장') { 
            const prodSiteConfig = [{ id: 'FL-1F', name: '현장 1층', areas: [{ key: 'R', title: '원란' }, { key: 'M', title: '자재' }, { key: 'P', title: '제품' }]}, { id: 'FL-2F', name: '현장 2층', areas: [{ key: 'M', title: '자재' }, { key: 'P', title: '제품' }]}, { id: 'FL-3F', name: '현장 3층', areas: [{ key: 'G', title: '일반' }]}];
            prodSiteConfig.forEach(floorInfo => { 
                vHtml += `<div class="bg-white p-4 rounded-xl mb-4 border w-full font-black text-sm">${floorInfo.name}<div class="flex flex-col space-y-2 mt-2">`;
                floorInfo.areas.forEach(area => {
                    let areaId = `${floorInfo.id}-${area.key}`; let cols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;
                    vHtml += `<div class="p-2 border rounded bg-slate-50"><div class="text-[10px] mb-1">${area.title}</div><div class="grid grid-cols-10 gap-1">`;
                    for (let r = 1; r <= cols; r++) { 
                        let dbId = `${areaId}-${r.toString().padStart(2, '0')}`; let state = occMap[dbId] ? 'cell-full' : 'cell-empty';
                        if(selectedCellId === dbId) state = 'cell-active';
                        vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}', '${dbId}')" class="h-8 shrink-0 rounded border text-[10px] flex items-center justify-center cursor-pointer rack-cell ${state}">${r}</div>`;
                    }
                    vHtml += `</div></div>`;
                });
                vHtml += `</div></div>`;
            });
            vContainer.innerHTML = vHtml; hContainer.innerHTML = ''; return;
        }

        const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; const prefix = currentZone === '실온' ? 'R-' : 'C-'; 
        activeLayout.forEach(col => { 
            if (col.aisle) { vHtml += `<div class="w-10 md:w-14 shrink-0 h-[400px] bg-yellow-50/50 border-x-2 border-yellow-200 mx-1 flex items-center justify-center"><span class="text-[10px] font-black text-yellow-600" style="writing-mode:vertical-rl">통로</span></div>`; } 
            else if (col.gap) { vHtml += `<div class="w-2 md:w-4 shrink-0"></div>`; } 
            else { 
                vHtml += `<div class="flex flex-col w-12 shrink-0 space-y-1 justify-end"><div class="text-center font-black text-sm">${col.id}</div>`; 
                for (let r = col.cols; r >= 1; r--) { 
                    let baseId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`; let searchId = floor === "1" ? baseId : `${baseId}-2F`; 
                    let state = occMap[searchId] ? 'cell-full' : 'cell-empty'; if(selectedCellId === searchId) state = 'cell-active';
                    let pBadge = (palletMap[searchId] > 1.1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] px-1 rounded-full z-10">${palletMap[searchId].toFixed(1)}P</div>` : '';
                    vHtml += `<div id="cell-${searchId}" onclick="clickCell('${col.id}${r}', '${searchId}')" class="h-8 shrink-0 rounded border text-[9px] flex items-center justify-center cursor-pointer rack-cell ${state}">${pBadge}${col.id}${r}</div>`; 
                } 
                vHtml += `</div>`; 
            } 
        }); 
        vContainer.innerHTML = vHtml; 
        
        let hHtml = `<div class="flex space-x-1 flex-nowrap">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
        for (let c = hCols; c >= 1; c--) { 
            let baseId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? baseId : `${baseId}-2F`; 
            let state = occMap[searchId] ? 'cell-full' : 'cell-empty'; if(selectedCellId === searchId) state = 'cell-active';
            hHtml += `<div id="cell-${searchId}" onclick="clickCell('${hPrefix}${c}', '${searchId}')" class="h-10 w-12 shrink-0 rounded border text-[10px] flex items-center justify-center cursor-pointer rack-cell ${state}">${hPrefix}${c}</div>`; 
        } 
        hContainer.innerHTML = hHtml + `</div>`;
    } catch(e) { console.error(e); }
}

// 💡 우측 패널 버튼 및 기능 복구
async function clickCell(displayId, searchId) { 
    selectedCellId = searchId; renderMap();
    let rs = document.getElementById('right-sidebar'); if(rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); isRightPanelVisible = true; }
    const panel = document.getElementById('info-panel'); 
    const items = globalOccupancy.filter(x => x.location_id === searchId); 
    
    let html = `<div class="bg-indigo-50 p-4 rounded-lg mb-4 font-black text-xl text-indigo-900">${displayId}</div>`; 
    if(items.length > 0) { 
        items.forEach(item => { 
            let dynP = getDynamicPalletCount(item);
            html += `
            <div class="bg-white border-2 border-slate-200 rounded-xl p-4 shadow-sm mb-4">
                <div class="font-black text-sm text-slate-800 mb-1">${item.item_name}</div>
                <div class="text-right text-indigo-600 font-black text-lg">${item.quantity.toLocaleString()} EA</div>
                <div class="text-[10px] text-rose-500 font-bold mb-3">입고처: ${item.remarks || '기본'} / 일자: ${item.production_date || '-'}</div>
                <div class="grid grid-cols-2 gap-2 border-t pt-3">
                    <button onclick="dispatchToFloor('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}', '${item.remarks||''}')" class="bg-emerald-50 text-emerald-700 py-2 rounded text-[10px] font-bold border border-emerald-200">현장 반출</button>
                    <button onclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, 0, '${searchId}', '${item.remarks||''}')" class="bg-blue-50 text-blue-700 py-2 rounded text-[10px] font-bold border border-blue-200">렉 이동</button>
                    <button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, 0, '${searchId}')" class="bg-rose-50 text-rose-700 py-2 rounded text-[10px] font-bold border border-rose-200">최종 출고</button>
                    <button onclick="splitPallet('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="bg-orange-50 text-orange-700 py-2 rounded text-[10px] font-bold border border-orange-200">분할</button>
                </div>
                <button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date}', '${searchId}')" class="w-full mt-2 bg-slate-100 text-slate-600 py-2 rounded text-[10px] font-bold">수정/삭제</button>
            </div>`; 
        }); 
    } else { html += `<div class="text-center py-20 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50 font-bold">비어있음</div>`; } 
    panel.innerHTML = html;
}

// 💡 발주/안전재고/서치 로직 복구
function updateSummarySupplierDropdown() {
    let items = [...finishedProductMaster, ...productMaster]; let suppliers = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
    const supSelect = document.getElementById('summary-supplier'); if (supSelect) { supSelect.innerHTML = `<option value="ALL">전체 입고처</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join(''); updateSummaryCategoryDropdown(); }
}
function updateSummaryCategoryDropdown() {
    let items = [...finishedProductMaster, ...productMaster]; const sup = document.getElementById('summary-supplier')?.value || 'ALL'; if (sup !== 'ALL') items = items.filter(p => p.supplier === sup);
    let categories = [...new Set(items.map(p => p.category))].filter(Boolean).sort(); const catSelect = document.getElementById('summary-category'); if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체 카테고리</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateSummaryItemDropdown(); }
}
function updateSummaryItemDropdown() {
    let items = [...finishedProductMaster, ...productMaster]; const sup = document.getElementById('summary-supplier')?.value || 'ALL'; const cat = document.getElementById('summary-category')?.value || 'ALL';
    if (sup !== 'ALL') items = items.filter(p => p.supplier === sup); if (cat !== 'ALL') items = items.filter(p => p.category === cat);
    const uniqueItems = [...new Set(items.map(p => p.item_name))].filter(Boolean).sort(); const itemSelect = document.getElementById('summary-item'); if(itemSelect) itemSelect.innerHTML = `<option value="">품목을 선택하세요</option>` + uniqueItems.map(name => `<option value="${name}">${name}</option>`).join(''); calculateSummary();
}
function calculateSummary() {
    const itemName = document.getElementById('summary-item')?.value; const supplier = document.getElementById('summary-supplier')?.value;
    let breakdown = {}; let totalQty = 0; if(itemName) { globalOccupancy.forEach(item => { let cleanSup = String(item.remarks || "기본입고처").replace(/\[기존재고\]/g, '').trim(); if(item.item_name === itemName && (supplier === 'ALL' || cleanSup === supplier)) { if(!breakdown[cleanSup]) breakdown[cleanSup] = 0; breakdown[cleanSup] += item.quantity; totalQty += item.quantity; } }); }
    document.getElementById('summary-result').innerText = totalQty.toLocaleString() + ' EA';
}

// 💡 엑셀 실사 덮어쓰기 (전면 개편 완벽판)
async function importExcel(event) {
    if(loginMode === 'viewer') return; const file = event.target.files[0]; if (!file) return;
    try {
        const data = await file.arrayBuffer(); const workbook = XLSX.read(data);
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval:""});
        if (jsonData.length === 0) return alert("데이터 없음");
        if(!confirm("실사수량이 입력된 렉은 기존 데이터를 삭제하고 덮어씁니다. 진행할까요?")) return;

        let deletes = []; let inserts = []; let count = 0;
        for (let row of jsonData) {
            let loc = String(row["위치"]||"").trim(); let sQty = String(row["실사수량(EA)"]||"").trim();
            if(!loc || sQty === "") continue;
            let nQty = parseInt(sQty.replace(/,/g,'')); let itemName = String(row["품목명"]||"").trim();
            if(itemName === "[비어있음]") itemName = "";

            globalOccupancy.filter(o => o.location_id === loc).forEach(e => deletes.push({ invId: e.id, locId: loc, itemName: e.item_name }));
            if(nQty > 0 && itemName !== "") {
                inserts.push({ location_id: loc, category: String(row["카테고리"]||"기타"), item_name: itemName, quantity: nQty, pallet_count: nQty/180, production_date: new Date().toISOString().split('T')[0], remarks: String(row["입고처"]||"실사입고") });
            }
            count++;
        }
        for(let d of deletes) await fetch('/api/inventory_edit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ inventory_id: d.invId, action:'DELETE' }) });
        for(let ins of inserts) await fetch('/api/inbound', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(ins) });
        alert(`${count}건 실사 완료!`); load();
    } catch (e) { alert("오류"); }
}

// 💡 발주 리스트 렌더링 (유실 복구)
function renderOrderList() {
    let orders = globalHistory.filter(h => h.action_type === '발주중');
    let tbody = document.getElementById('order-list-tbody'); if(!tbody) return;
    if(orders.length === 0) return tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-slate-400">내역 없음</td></tr>`;
    tbody.innerHTML = orders.map(o => `<tr><td class="p-3 text-slate-500">${String(o.created_at).substring(0,10)}</td><td class="p-3 font-bold text-blue-600">${o.production_date||'미정'}</td><td class="p-3 font-black text-rose-600">${o.remarks}</td><td class="p-3 font-black">${o.item_name}</td><td class="p-3 text-right text-indigo-600">${o.quantity.toLocaleString()}EA</td><td class="p-3 text-center"><span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold">발주중</span></td><td class="p-3 text-center"><button onclick="receiveOrder('${o.id}', '${o.item_name}', ${o.quantity}, ${o.pallet_count}, '${o.remarks}', '${o.category}')" class="bg-emerald-500 text-white px-2 py-1 rounded text-xs">도착</button></td></tr>`).join('');
}
