// ==========================================
// [재고/발주] - 상단 탭 및 구역 전환 로직
// ==========================================
window.floorFilterMap = window.floorFilterMap || { 'FL-1F': true, 'FL-2F': true, 'FL-3F': true };
window.areaFilterMap = window.areaFilterMap || { 'R': true, 'M': true, 'P': true, 'G': true };

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
                <div class="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-3 mb-4 shrink-0">
                    <span class="text-sm font-bold text-slate-500 whitespace-nowrap">조회 일자:</span>
                    <input type="date" id="daily-target-date" value="${today}" onchange="renderDailyInventory()" class="border-2 border-indigo-300 rounded-lg p-2 text-sm font-black text-indigo-700 outline-none w-full md:w-auto">
                    <div class="flex space-x-2 w-full md:w-auto">
                        <button onclick="renderDailyInventory()" class="flex-1 bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg shadow-md text-sm">조회</button>
                        <button onclick="exportDailyInventoryExcel()" class="flex-1 bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg shadow-md text-sm whitespace-nowrap">엑셀 다운로드</button>
                    </div>
                </div>
                <div class="overflow-y-auto flex-1 border border-slate-200 rounded-lg bg-slate-50">
                    <table class="w-full text-left border-collapse text-sm bg-white">
                        <thead class="sticky top-0 bg-slate-100 z-10 border-b-2 border-slate-200 text-slate-600 shadow-sm"><tr><th class="p-3 w-1/4 font-black">카테고리</th><th class="p-3 w-1/2 font-black">품목명</th><th class="p-3 w-1/4 text-right font-black text-indigo-700">총 수량 (EA)</th></tr></thead>
                        <tbody id="daily-inventory-list" class="divide-y divide-slate-100"></tbody>
                    </table>
                </div>
            </div>`;
        viewContainer.appendChild(subview);
    }
}

function switchOrderTab(tab) {
    initDailyInventoryUI();
    currentOrderTab = tab;
    ['inventory', 'search', 'history', 'safety', 'daily'].forEach(t => {
        let btn = document.getElementById('order-tab-' + t); let view = document.getElementById('subview-' + t);
        if(btn) btn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-slate-400 hover:text-slate-600 border-b-4 border-transparent transition-colors";
        if(view) view.classList.add('hidden');
    });
    let activeBtn = document.getElementById('order-tab-' + tab); let activeView = document.getElementById('subview-' + tab);
    if(activeBtn) activeBtn.className = "whitespace-nowrap px-4 md:px-6 py-3 font-black text-indigo-700 border-b-4 border-indigo-700 transition-colors";
    if(activeView) activeView.classList.remove('hidden');
    
    let rs = document.getElementById('right-sidebar');
    if(tab === 'inventory') { if(isRightPanelVisible && rs) rs.classList.remove('hidden'); renderMap(); } 
    else { if(rs) rs.classList.add('hidden'); }
}

function switchZone(zone) { currentZone = zone; selectedCellId = null; updateZoneTabs(); renderMap(); populateWaitDropdowns(); }
function updateZoneTabs() {
    ['tab-room', 'tab-cold', 'tab-floor'].forEach(id => {
        let el = document.getElementById(id);
        if(el) el.className = "whitespace-nowrap px-4 py-2 bg-slate-100 border text-slate-500 font-bold rounded-lg text-sm";
    });
    let activeId = currentZone === '실온' ? 'tab-room' : (currentZone === '냉장' ? 'tab-cold' : 'tab-floor');
    let activeEl = document.getElementById(activeId);
    if(activeEl) activeEl.className = `whitespace-nowrap px-4 py-2 ${currentZone==='실온'?'bg-orange-500':(currentZone==='냉장'?'bg-indigo-600':'bg-emerald-500')} text-white font-bold rounded-lg text-sm`;
}

function toggleWaitManualInput() {
    const sel = document.getElementById('wait-item');
    const manual = document.getElementById('wait-item-manual');
    if(sel.value === 'DIRECT_INPUT') { sel.classList.add('hidden'); manual.classList.remove('hidden'); manual.focus(); }
}

function toggleWaitContainer() { const el = document.getElementById('wait-container'); el.classList.toggle('hidden'); }
function toggleMapSearch() { const el = document.getElementById('map-search-container'); el.classList.toggle('hidden'); }

// ==========================================
// 💡 [핵심] 렉맵 렌더링 (재고 유실 완벽 복구)
// ==========================================
function renderMap() { 
    try {
        const floor = document.getElementById('floor-select')?.value || "1"; 
        const vContainer = document.getElementById('vertical-racks'); const hContainer = document.getElementById('horizontal-rack'); 
        
        // 💡 렉 ID별로 재고 개수와 파레트 정보를 맵핑
        const occMap = {}; const palletMap = {}; 
        globalOccupancy.forEach(item => { 
            occMap[item.location_id] = true; 
            let pCount = getDynamicPalletCount(item);
            palletMap[item.location_id] = (palletMap[item.location_id] || 0) + pCount;
        }); 

        let vHtml = ''; 
        if(currentZone === '현장') { 
            const prodSiteConfig = [{ id: 'FL-1F', name: '현장 1층', areas: [{ key: 'R', title: '원란' }, { key: 'M', title: '자재' }, { key: 'P', title: '제품' }]}, { id: 'FL-2F', name: '현장 2층', areas: [{ key: 'M', title: '자재' }, { key: 'P', title: '제품' }]}, { id: 'FL-3F', name: '현장 3층', areas: [{ key: 'G', title: '일반' }]}];
            prodSiteConfig.forEach(floorInfo => { 
                vHtml += `<div class="bg-white p-4 rounded-xl mb-4 border w-full font-black text-sm">${floorInfo.id} - ${floorInfo.name}<div class="flex flex-col space-y-2 mt-2">`;
                floorInfo.areas.forEach(area => {
                    let areaId = `${floorInfo.id}-${area.key}`; let cols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;
                    vHtml += `<div class="p-2 border rounded bg-slate-50"><div class="text-[10px] mb-1 font-bold text-slate-500">${area.title} (${cols}칸)</div><div class="grid grid-cols-10 gap-1">`;
                    for (let r = 1; r <= cols; r++) { 
                        let dbId = `${areaId}-${r.toString().padStart(2, '0')}`; 
                        let state = occMap[dbId] ? 'cell-full' : 'cell-empty';
                        if(selectedCellId === dbId) state = 'cell-active';
                        let pBadge = (palletMap[dbId] > 1.1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] px-1 rounded-full z-10">${palletMap[dbId].toFixed(1)}P</div>` : '';
                        vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}')" class="h-8 rounded border text-[10px] flex items-center justify-center cursor-pointer rack-cell ${state}">${pBadge}${r}</div>`;
                    }
                    vHtml += `</div></div>`;
                });
                vHtml += `</div></div>`;
            });
            vContainer.innerHTML = vHtml; hContainer.innerHTML = ''; return;
        }

        const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; const prefix = currentZone === '실온' ? 'R-' : 'C-'; 
        activeLayout.forEach(col => { 
            if (col.aisle) { vHtml += `<div class="w-10 h-[420px] bg-yellow-50/50 border-x-2 border-yellow-200 mx-1 flex items-center justify-center"><span class="text-[10px] font-black text-yellow-600" style="writing-mode:vertical-rl">통로</span></div>`; } 
            else if (col.gap) { vHtml += `<div class="w-2"></div>`; } 
            else { 
                vHtml += `<div class="flex flex-col w-12 space-y-1 justify-end"><div class="text-center font-black text-sm">${col.id}</div>`; 
                for (let r = col.cols; r >= 1; r--) { 
                    let baseId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`;
                    let searchId = floor === "1" ? baseId : `${baseId}-2F`; 
                    let state = occMap[searchId] ? 'cell-full' : 'cell-empty';
                    if(selectedCellId === searchId) state = 'cell-active';
                    let pBadge = (palletMap[searchId] > 1.1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] px-1 rounded-full z-10">${palletMap[searchId].toFixed(1)}P</div>` : '';
                    vHtml += `<div id="cell-${searchId}" onclick="clickCell('${searchId}')" class="h-8 rounded border text-[9px] flex items-center justify-center cursor-pointer rack-cell ${state}">${pBadge}${col.id}${r}</div>`; 
                } 
                vHtml += `</div>`; 
            } 
        }); 
        vContainer.innerHTML = vHtml; 
        
        let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
        for (let c = hCols; c >= 1; c--) { 
            let baseId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? baseId : `${baseId}-2F`; 
            let state = occMap[searchId] ? 'cell-full' : 'cell-empty';
            if(selectedCellId === searchId) state = 'cell-active';
            let pBadge = (palletMap[searchId] > 1.1) ? `<div class="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] px-1 rounded-full z-10">${palletMap[searchId].toFixed(1)}P</div>` : '';
            hHtml += `<div id="cell-${searchId}" onclick="clickCell('${searchId}')" class="h-10 w-12 rounded border text-[10px] flex items-center justify-center cursor-pointer rack-cell ${state}">${pBadge}${hPrefix}${c}</div>`; 
        } 
        hContainer.innerHTML = hHtml + `</div>`;
    } catch(e) { console.error(e); }
}

// ==========================================
// 💡 [핵심] 우측 패널 상세 정보 & 버튼 복구
// ==========================================
async function clickCell(searchId) { 
    selectedCellId = searchId; renderMap();
    let rs = document.getElementById('right-sidebar'); 
    if(rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); isRightPanelVisible = true; }
    
    const panel = document.getElementById('info-panel'); 
    const items = globalOccupancy.filter(x => x.location_id === searchId); 
    
    let panelHtml = `<div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4 flex justify-between items-center"><div class="text-2xl font-black text-indigo-900">${searchId}</div><button onclick="showHistoryModal('${searchId}')" class="text-[10px] bg-white border border-indigo-200 px-2 py-1 rounded font-bold text-indigo-600 shadow-sm">기록보기</button></div>`; 
    
    if(items.length > 0) { 
        items.forEach(item => { 
            let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
            let dynP = getDynamicPalletCount(item);
            
            panelHtml += `
            <div class="bg-white border-2 border-slate-200 rounded-xl p-4 shadow-sm mb-4">
                <div class="flex justify-between items-start mb-2">
                    <div><span class="bg-slate-100 text-slate-500 text-[9px] px-1.5 py-0.5 rounded font-bold">${item.category || '미분류'}</span><div class="font-black text-sm text-slate-800 mt-1">${item.item_name}</div></div>
                    <div class="text-right"><div class="text-lg font-black text-indigo-600">${item.quantity.toLocaleString()} EA</div><div class="text-[10px] font-bold text-slate-400">${dynP.toFixed(1)} P</div></div>
                </div>
                <div class="text-[10px] text-rose-600 font-bold mb-3">입고처: ${item.remarks || '기본'} / 날짜: ${item.production_date || '-'}</div>
                
                <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button onclick="dispatchToFloor('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}', '${item.remarks||''}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 py-2 rounded text-[10px] font-bold shadow-sm">현장 반출</button>
                    <button onclick="selectForMove('${item.id}', '${item.item_name}', ${item.quantity}, 0, '${searchId}', '${item.remarks||''}')" class="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-2 rounded text-[10px] font-bold shadow-sm">렉 이동</button>
                    <button onclick="processOutbound('${item.id}', '${item.item_name}', ${item.quantity}, 0, '${searchId}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-2 rounded text-[10px] font-bold shadow-sm">최종 출고</button>
                    <button onclick="splitPallet('${item.id}', '${item.item_name}', ${item.quantity}, '${searchId}')" class="bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 py-2 rounded text-[10px] font-bold shadow-sm">분할</button>
                </div>
                <button onclick="editInventoryItem('${item.id}', '${item.item_name}', ${item.quantity}, '${item.production_date}', '${searchId}')" class="w-full mt-2 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded text-[10px] font-bold border border-slate-200">수정/삭제</button>
            </div>`; 
        }); 

        // 최근 기록 5개 표시
        let locHist = globalHistory.filter(h => h.location_id === searchId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,5);
        if(locHist.length > 0) {
            panelHtml += `<div class="mt-6 pt-4 border-t-2 border-slate-200"><h3 class="text-xs font-black text-slate-500 mb-3">최근 작업 이력</h3><div class="space-y-2">`;
            locHist.forEach(h => {
                let color = h.action_type === '입고' ? 'text-emerald-600' : 'text-rose-600';
                panelHtml += `<div class="text-[10px] bg-slate-50 p-2 rounded border border-slate-100"><span class="font-black ${color}">[${h.action_type}]</span> <span class="text-slate-400 ml-1">${new Date(h.created_at).toLocaleString('ko-KR', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}</span><br><span class="font-bold text-slate-700">${h.item_name} (${h.quantity}EA)</span></div>`;
            });
            panelHtml += `</div></div>`;
        }
    } else { panelHtml += `<div class="text-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 font-bold">비어있는 렉입니다</div>`; } 
    panel.innerHTML = panelHtml;
}

// ==========================================
// 💡 대기장 & 기타 입고 로직 (강화됨)
// ==========================================
function populateWaitDropdowns() {
    let items = productMaster; 
    let sups = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
    if(!sups.includes('현장반납')) sups.unshift('현장반납');
    if(!sups.includes('기타(미등록)')) sups.push('기타(미등록)');
    const ws = document.getElementById('wait-supplier'); if(!ws) return;
    ws.innerHTML = `<option value="">1.입고/반납처</option>` + sups.map(s=>`<option value="${s}">${s}</option>`).join('');
    updateWaitCategoryDropdown();
}

function updateWaitCategoryDropdown() {
    let ws = document.getElementById('wait-supplier'); let sup = ws?.value;
    let filtered = (sup && sup!=='현장반납' && sup!=='기타(미등록)') ? productMaster.filter(p=>p.supplier===sup) : productMaster;
    let cats = [...new Set(filtered.map(p=>p.category))].filter(Boolean).sort();
    if(!cats.includes('기타')) cats.push('기타');
    const wc = document.getElementById('wait-cat'); if(!wc) return;
    wc.innerHTML = `<option value="">2.분류</option>` + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
    updateWaitItemDropdown();
}

function updateWaitItemDropdown() {
    let sup = document.getElementById('wait-supplier')?.value;
    let cat = document.getElementById('wait-cat')?.value;
    let filtered = productMaster.filter(p=>(!sup || sup.includes('기타') || sup==='현장반납' || p.supplier===sup) && (!cat || p.category===cat));
    let names = [...new Set(filtered.map(p=>p.item_name))].filter(Boolean).sort();
    const wi = document.getElementById('wait-item'); if(!wi) return;
    wi.innerHTML = `<option value="">3.품목명</option>` + names.map(n=>`<option value="${n}">${n}</option>`).join('') + `<option value="DIRECT_INPUT" class="text-orange-600 font-bold">+ 직접입력(기타)</option>`;
    wi.classList.remove('hidden'); document.getElementById('wait-item-manual').classList.add('hidden');
}

async function createWaitingPallets() {
    const selItem = document.getElementById('wait-item').value;
    const manualItem = document.getElementById('wait-item-manual').value.trim();
    let item = (selItem === 'DIRECT_INPUT') ? manualItem : selItem;
    if(!item) return alert("품목명을 선택하거나 입력하세요.");
    const qty = parseInt(document.getElementById('wait-qty').value);
    if(isNaN(qty) || qty <= 0) return alert("수량을 입력하세요.");
    const sup = document.getElementById('wait-supplier').value || "기본입고처";
    const cat = document.getElementById('wait-cat').value || "기타";
    const date = document.getElementById('wait-date').value || new Date().toISOString().split('T')[0];

    let emptyW = "";
    for(let i=1; i<=30; i++){
        let wId = `W-${i.toString().padStart(2,'0')}`;
        if(!globalOccupancy.find(o => o.location_id === wId)) { emptyW = wId; break; }
    }
    if(!emptyW) return alert("대기장에 빈 자리가 없습니다!");

    const payload = { location_id: emptyW, category: cat, item_name: item, quantity: qty, pallet_count: qty/180, production_date: date, remarks: sup };
    await fetch('/api/inbound', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    alert("대기장 입고 완료"); await load();
}

// ==========================================
// 💡 입출고 & 엑셀 실사 (덮어쓰기 무적 버전)
// ==========================================
async function importExcel(event) {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    const file = event.target.files[0]; if(!file) return;
    const data = await file.arrayBuffer(); const workbook = XLSX.read(data);
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval:""});
    
    if(!confirm("⚠️ 실사수량이 입력된 렉은 기존 데이터가 싹 지워지고 덮어씌워집니다. 진행할까요?")) return;

    let count = 0;
    for(let row of jsonData) {
        let loc = String(row["위치"]||"").trim(); 
        let sQty = String(row["실사수량(EA)"]||"").trim();
        if(!loc || sQty === "") continue;

        let newQty = parseInt(sQty.replace(/,/g,'')); 
        let itemName = String(row["품목명"]||"").trim();
        
        // 해당 위치의 기존 데이터 싹 삭제 (진짜 덮어쓰기)
        let existings = globalOccupancy.filter(o => o.location_id === loc);
        for(let e of existings) await fetch('/api/inventory_edit', { method:'POST', headers:{'Content-Type': 'application/json'}, body:JSON.stringify({ inventory_id: e.id, action:'DELETE' }) });
        
        // 새 수량이 0보다 크면 새로 삽입
        if(newQty > 0 && itemName !== "[비어있음]" && itemName !== "") {
            await fetch('/api/inbound', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ location_id: loc, item_name: itemName, quantity: newQty, pallet_count: newQty/180, category: String(row["카테고리"]||"기타"), remarks: String(row["입고처"]||"실사입고") }) });
        }
        count++;
    }
    alert(`🎉 ${count}개 렉의 실사 데이터가 완벽히 덮어쓰기 되었습니다!`); await load();
}

async function processOutbound(invId, itemName, maxQty, p, locId) {
    if(loginMode === 'viewer') return;
    const q = prompt(`[${itemName}] 출고 수량 (최대 ${maxQty})`, maxQty); if(!q) return;
    await fetch('/api/outbound', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ inventory_id: invId, location_id: locId, item_name: itemName, quantity: parseInt(q), pallet_count: parseInt(q)/180 }) });
    alert("출고 완료"); await load();
}

async function dispatchToFloor(invId, itemName, maxQty, fromLoc, supplier) {
    if(loginMode === 'viewer') return;
    const fl = prompt(`[${itemName}] 반출 현장층 (1,2,3)`, "1"); if(!fl) return;
    const q = prompt(`반출 수량 (최대 ${maxQty})`, maxQty); if(!q) return;
    let targetPrefix = fl === "1" ? 'FL-1F-M-' : (fl === "2" ? 'FL-2F-M-' : 'FL-3F-G-');
    await fetch('/api/transfer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ inventory_id: invId, from_location: fromLoc, to_location: targetPrefix+'01', item_name: itemName, quantity: parseInt(q), pallet_count: parseInt(q)/180 }) });
    alert("현장 반출 완료 (01번 렉 자동배정)"); await load();
}

function selectForMove(invId, itemName, maxQty, p, fromLoc, supplier) { 
    if(loginMode === 'viewer') return; 
    movingItem = { invId, itemName, maxQty, fromLoc, supplier }; 
    renderMap(); 
    document.getElementById('info-panel').innerHTML = `<div class="bg-indigo-50 border-2 border-dashed p-6 rounded-xl text-center shadow-inner"><div class="text-4xl animate-bounce mb-4 text-indigo-500">📍</div><div class="text-lg font-black text-indigo-800 mb-2">이동 모드 활성화</div><div class="text-sm font-bold text-slate-500 mb-6">[${itemName}]<br>도착할 렉을 클릭하세요</div><button onclick="cancelMove()" class="bg-slate-600 text-white font-bold py-2 px-6 rounded-lg w-full shadow-md">취소</button></div>`;
}

function cancelMove() { movingItem = null; renderMap(); }

async function editInventoryItem(id, name, q, d, loc) {
    if(loginMode === 'viewer') return;
    const action = prompt(`[${name}] 수정\n1. 수량변경\n2. 날짜변경\n3. 삭제`);
    if(action === '1') {
        const nq = prompt("새 수량:", q); if(!nq) return;
        await fetch('/api/inventory_edit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ inventory_id:id, action:'UPDATE_QTY', new_quantity:parseInt(nq), pallet_count:parseInt(nq)/180 }) });
    } else if(action === '2') {
        const nd = prompt("새 날짜(YYYY-MM-DD):", d); if(!nd) return;
        await fetch('/api/inventory_edit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ inventory_id:id, action:'UPDATE_DATE', new_date:nd }) });
    } else if(action === '3') {
        if(confirm("정말 삭제할까요?")) await fetch('/api/inventory_edit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ inventory_id:id, action:'DELETE' }) });
    }
    await load();
}

// 💡 일자별 재고 조회 (복구)
function renderDailyInventory() {
    let target = document.getElementById('daily-target-date').value; if(!target) return;
    let stock = {};
    globalHistory.forEach(h => {
        if(new Date(h.created_at).toISOString().split('T')[0] <= target) {
            let k = h.item_name; if(!stock[k]) stock[k] = { cat: h.category||"기타", qty: 0 };
            if(h.action_type==='입고') stock[k].qty += h.quantity; else if(h.action_type==='출고') stock[k].qty -= h.quantity;
        }
    });
    let html = Object.keys(stock).filter(k => stock[k].qty !== 0).map(k => `<tr class="hover:bg-indigo-50/50"><td class="p-3 text-xs text-slate-500">${stock[k].cat}</td><td class="p-3 font-black text-slate-800">${k}</td><td class="p-3 text-right font-black text-indigo-600">${stock[k].qty.toLocaleString()} EA</td></tr>`).join('');
    document.getElementById('daily-inventory-list').innerHTML = html || '<tr><td colspan="3" class="p-10 text-center text-slate-400">내역 없음</td></tr>';
}
