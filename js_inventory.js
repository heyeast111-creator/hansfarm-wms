// ==========================================
// [재고/발주] - 상단 탭 및 구역 전환 로직
// ==========================================
window.floorFilterMap = window.floorFilterMap || { 'FL-1F': true, 'FL-2F': true, 'FL-3F': true };
window.areaFilterMap = window.areaFilterMap || { 'R': true, 'M': true, 'P': true, 'G': true };

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
    if(tab === 'search') updateSummarySupplierDropdown();
    if(tab === 'daily') renderDailyInventory();
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

// ==========================================
// 💡 재고 렌더링 핵심 로직 (재보수 완료)
// ==========================================
function renderMap() { 
    try {
        const floor = document.getElementById('floor-select')?.value || "1"; 
        const vContainer = document.getElementById('vertical-racks'); const hContainer = document.getElementById('horizontal-rack'); 
        
        // 렉 ID별로 재고가 있는지 맵핑
        const occMap = {}; globalOccupancy.forEach(item => { occMap[item.location_id] = true; }); 

        let vHtml = ''; 
        if(currentZone === '현장') { 
            const prodSiteConfig = [{ id: 'FL-1F', name: '현장 1층', areas: [{ key: 'R', title: '원란' }, { key: 'M', title: '자재' }, { key: 'P', title: '제품' }]}, { id: 'FL-2F', name: '현장 2층', areas: [{ key: 'M', title: '자재' }, { key: 'P', title: '제품' }]}, { id: 'FL-3F', name: '현장 3층', areas: [{ key: 'G', title: '일반' }]}];
            prodSiteConfig.forEach(floorInfo => { 
                vHtml += `<div class="bg-white p-4 rounded-xl mb-4 border w-full font-black text-sm">${floorInfo.name}<div class="flex flex-col space-y-2 mt-2">`;
                floorInfo.areas.forEach(area => {
                    let areaId = `${floorInfo.id}-${area.key}`; let cols = parseInt(localStorage.getItem(areaId + '_cols')) || 10;
                    vHtml += `<div class="p-2 border rounded bg-slate-50"><div class="text-[10px] mb-1">${area.title} (${cols}칸)</div><div class="grid grid-cols-10 gap-1">`;
                    for (let r = 1; r <= cols; r++) { 
                        let dbId = `${areaId}-${r.toString().padStart(2, '0')}`; 
                        let state = occMap[dbId] ? 'cell-full' : 'cell-empty';
                        vHtml += `<div id="cell-${dbId}" onclick="clickCell('${dbId}')" class="h-8 rounded border text-[10px] flex items-center justify-center cursor-pointer rack-cell ${state}">${r}</div>`;
                    }
                    vHtml += `</div></div>`;
                });
                vHtml += `</div></div>`;
            });
            vContainer.innerHTML = vHtml; hContainer.innerHTML = ''; return;
        }

        const activeLayout = currentZone === '실온' ? layoutRoom : layoutCold; const prefix = currentZone === '실온' ? 'R-' : 'C-'; 
        activeLayout.forEach(col => { 
            if (col.aisle) { vHtml += `<div class="w-10 h-[400px] bg-yellow-50/50 border-x-2 border-yellow-200 mx-1 flex items-center justify-center"><span class="text-[10px] font-black text-yellow-600" style="writing-mode:vertical-rl">통로</span></div>`; } 
            else if (col.gap) { vHtml += `<div class="w-2"></div>`; } 
            else { 
                vHtml += `<div class="flex flex-col w-12 space-y-1 justify-end"><div class="text-center font-black text-sm">${col.id}</div>`; 
                for (let r = col.cols; r >= 1; r--) { 
                    let baseId = `${prefix}${col.id}-${r.toString().padStart(2, '0')}`;
                    let searchId = floor === "1" ? baseId : `${baseId}-2F`; 
                    let state = occMap[searchId] ? 'cell-full' : 'cell-empty';
                    vHtml += `<div id="cell-${searchId}" onclick="clickCell('${searchId}')" class="h-8 rounded border text-[9px] flex items-center justify-center cursor-pointer rack-cell ${state}">${col.id}${r}</div>`; 
                } 
                vHtml += `</div>`; 
            } 
        }); 
        vContainer.innerHTML = vHtml; 
        
        let hHtml = `<div class="flex space-x-1">`; let hPrefix = currentZone === '실온' ? 'K' : 'I'; let hCols = currentZone === '실온' ? 10 : 8; 
        for (let c = hCols; c >= 1; c--) { 
            let baseId = `${prefix}${hPrefix}-${c.toString().padStart(2, '0')}`; let searchId = floor === "1" ? baseId : `${baseId}-2F`; 
            let state = occMap[searchId] ? 'cell-full' : 'cell-empty';
            hHtml += `<div id="cell-${searchId}" onclick="clickCell('${searchId}')" class="h-10 w-12 rounded border text-[10px] flex items-center justify-center cursor-pointer rack-cell ${state}">${hPrefix}${c}</div>`; 
        } 
        hContainer.innerHTML = hHtml + `</div>`;
    } catch(e) { console.error(e); }
}

async function clickCell(searchId) { 
    selectedCellId = searchId;
    let rs = document.getElementById('right-sidebar'); if(rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); }
    const panel = document.getElementById('info-panel'); 
    const items = globalOccupancy.filter(x => x.location_id === searchId); 
    let html = `<div class="bg-indigo-50 p-4 rounded-lg mb-4 font-black text-xl text-indigo-900">${searchId}</div>`; 
    if(items.length > 0) { 
        items.forEach(item => { 
            html += `<div class="bg-white border p-3 rounded-lg shadow-sm mb-3"><div class="font-black text-xs">${item.item_name}</div><div class="text-right text-indigo-600 font-bold">${item.quantity.toLocaleString()} EA</div>
            <div class="flex space-x-1 mt-2"><button onclick="editInventoryItem('${item.id}')" class="flex-1 bg-slate-100 text-[10px] py-1 rounded">수정/삭제</button></div></div>`; 
        }); 
    } else { html += `<div class="text-center py-10 text-slate-400 border-dashed border rounded">비어있음</div>`; } 
    panel.innerHTML = html;
}

// ==========================================
// 💡 대기장 다각적 활용 (기타 등록 / 직접 입력)
// ==========================================
function toggleWaitManualInput() {
    const sel = document.getElementById('wait-item');
    const manual = document.getElementById('wait-item-manual');
    if(sel.value === 'DIRECT_INPUT') { sel.classList.add('hidden'); manual.classList.remove('hidden'); manual.focus(); }
}

function getWaitZoneSourceItems() { return currentZone === '실온' ? productMaster.filter(p => !p.category?.includes('원란')) : productMaster; }

function populateWaitDropdowns() {
    let items = getWaitZoneSourceItems(); 
    let sups = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
    if(!sups.includes('현장반납')) sups.unshift('현장반납');
    if(!sups.includes('기타(미등록)')) sups.push('기타(미등록)');
    const ws = document.getElementById('wait-supplier'); if(!ws) return;
    ws.innerHTML = `<option value="">1.입고처</option>` + sups.map(s=>`<option value="${s}">${s}</option>`).join('');
    updateWaitCategoryDropdown();
}

function updateWaitCategoryDropdown() {
    let ws = document.getElementById('wait-supplier'); let sup = ws?.value;
    let items = getWaitZoneSourceItems();
    let filtered = (sup && sup!=='현장반납' && sup!=='기타(미등록)') ? items.filter(p=>p.supplier===sup) : items;
    let cats = [...new Set(filtered.map(p=>p.category))].filter(Boolean).sort();
    if(!cats.includes('기타')) cats.push('기타');
    const wc = document.getElementById('wait-cat'); if(!wc) return;
    wc.innerHTML = `<option value="">2.분류</option>` + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
    updateWaitItemDropdown();
}

function updateWaitItemDropdown() {
    let sup = document.getElementById('wait-supplier')?.value;
    let cat = document.getElementById('wait-cat')?.value;
    let items = getWaitZoneSourceItems();
    let filtered = items.filter(p=>(!sup || sup.includes('기타') || sup==='현장반납' || p.supplier===sup) && (!cat || p.category===cat));
    let names = [...new Set(filtered.map(p=>p.item_name))].filter(Boolean).sort();
    const wi = document.getElementById('wait-item'); if(!wi) return;
    wi.innerHTML = `<option value="">3.품목명</option>` + names.map(n=>`<option value="${n}">${n}</option>`).join('') + `<option value="DIRECT_INPUT" class="text-orange-600 font-bold">+ 직접입력(기타)</option>`;
    wi.classList.remove('hidden'); document.getElementById('wait-item-manual').classList.add('hidden');
}

async function createWaitingPallets() {
    const selItem = document.getElementById('wait-item').value;
    const manualItem = document.getElementById('wait-item-manual').value.trim();
    let item = (selItem === 'DIRECT_INPUT') ? manualItem : selItem;
    if(!item) return alert("품목명 입력");
    const qty = parseInt(document.getElementById('wait-qty').value);
    if(isNaN(qty) || qty <= 0) return alert("수량 입력");
    const sup = document.getElementById('wait-supplier').value || "기본입고처";
    const cat = document.getElementById('wait-cat').value || "기타";
    const date = document.getElementById('wait-date').value || new Date().toISOString().split('T')[0];

    // 대기장 빈자리 찾기
    let emptyW = "";
    for(let i=1; i<=30; i++){
        let wId = `W-${i.toString().padStart(2,'0')}`;
        if(!globalOccupancy.find(o => o.location_id === wId)) { emptyW = wId; break; }
    }
    if(!emptyW) return alert("대기장 꽉 참");

    const payload = { location_id: emptyW, category: cat, item_name: item, quantity: qty, pallet_count: qty/180, production_date: date, remarks: sup };
    await fetch('/api/inbound', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    await load();
}

// ==========================================
// 💡 일자별 재고 추적 (유지)
// ==========================================
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

// 실사 엑셀 덮어쓰기 (무적 버전)
async function importExcel(event) {
    const file = event.target.files[0]; if(!file) return;
    const data = await file.arrayBuffer(); const workbook = XLSX.read(data);
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval:""});
    let count = 0;
    for(let row of jsonData) {
        let loc = String(row["위치"]||"").trim(); let sQty = String(row["실사수량(EA)"]||"").trim();
        if(!loc || sQty === "") continue;
        let newQty = parseInt(sQty); let itemName = String(row["품목명"]||"").trim();
        // 덮어쓰기 로직: 기존 데이터 삭제 후 새로 삽입
        let existings = globalOccupancy.filter(o => o.location_id === loc);
        for(let e of existings) await fetch('/api/inventory_edit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ inventory_id: e.id, action:'DELETE' }) });
        if(newQty > 0 && itemName !== "[비어있음]") {
            await fetch('/api/inbound', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ location_id: loc, item_name: itemName, quantity: newQty, pallet_count: newQty/180, category: String(row["카테고리"]||"기타"), remarks: String(row["입고처"]||"실사입고") }) });
        }
        count++;
    }
    alert(`${count}개 렉 실사 반영 완료!`); await load();
}
