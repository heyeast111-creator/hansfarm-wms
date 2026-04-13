// ==========================================
// [정산/회계] 명세서 대조 및 확정 로직 (단가 실시간 갱신 완벽 패치판)
// ==========================================

let unconfirmedData = []; 
let confirmedData = [];
let accTableData = []; 
let splitTargetItem = null;

function toggleAccDateInput() {
    const type = document.getElementById('acc-type')?.value || 'date';
    const dateInput = document.getElementById('acc-date');
    const periodWrapper = document.getElementById('acc-period-wrapper');
    const monthInput = document.getElementById('acc-month');

    if(dateInput) dateInput.classList.add('hidden');
    if(periodWrapper) { periodWrapper.classList.remove('flex'); periodWrapper.classList.add('hidden'); }
    if(monthInput) monthInput.classList.add('hidden');

    if(type === 'date' && dateInput) dateInput.classList.remove('hidden');
    else if(type === 'period' && periodWrapper) { periodWrapper.classList.remove('hidden'); periodWrapper.classList.add('flex'); }
    else if(type === 'month' && monthInput) monthInput.classList.remove('hidden');
}

function populateAccDropdowns() {
    const supSelect = document.getElementById('acc-supplier');
    const itemSelect = document.getElementById('acc-item');
    if(!supSelect || !itemSelect) return;

    const currentSup = supSelect.value || 'ALL';
    const currentItem = itemSelect.value || 'ALL';

    let suppliers = new Set();
    let items = new Set();

    globalHistory.forEach(h => {
        if(h.action_type === '입고') {
            let sup = (h.remarks || "기본입고처").replace('[기존재고]', '').trim();
            let itm = (h.item_name || "").trim();
            if(sup) suppliers.add(sup);
            if(currentSup === 'ALL' || currentSup === sup) { if(itm) items.add(itm); }
        }
    });

    let supHtml = '<option value="ALL">전체 매입처</option>' + Array.from(suppliers).sort().map(s => `<option value="${s}">${s}</option>`).join('');
    if (supSelect.innerHTML !== supHtml) { supSelect.innerHTML = supHtml; supSelect.value = Array.from(suppliers).includes(currentSup) ? currentSup : 'ALL'; }

    let itemHtml = '<option value="ALL">전체 품목</option>' + Array.from(items).sort().map(i => `<option value="${i}">${i}</option>`).join('');
    if (itemSelect.innerHTML !== itemHtml) { itemSelect.innerHTML = itemHtml; itemSelect.value = Array.from(items).includes(currentItem) ? currentItem : 'ALL'; }
}

window.updateAccFilters = function(type) {
    if(type === 'supplier') populateAccDropdowns(); 
    renderAccounting();
};

async function emergencyResetAccQty() {
    if(!confirm("🚨 경고: 화면에서 사라지거나 꼬여버린 데이터를 [최초 입고된 정상 상태]로 100% 강제 초기화합니다. 진행하시겠습니까?")) return;
    try {
        let targetHistory = globalHistory.filter(h => h.action_type === '입고' && (h.acc_qty !== null || h.acc_status === '확정'));
        let payload = targetHistory.map(h => ({ id: h.id, acc_qty: null, acc_status: '미확정' }));
        if(payload.length === 0) return alert("복구할 데이터가 없습니다.");

        for(let i=0; i<payload.length; i+=100) {
            let chunk = payload.slice(i, i+100);
            await fetch('/api/history_update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(chunk) });
        }
        await load();
        alert("✅ 복구 완료! 사라졌던 항목들이 모두 돌아왔습니다.");
    } catch(e) { alert("복구 중 에러 발생: " + e.message); }
}

window.renderAccounting = async function() {
    try {
        let headerDiv = document.querySelector('#view-accounting .flex.space-x-2');
        if(headerDiv && !document.getElementById('emergency-reset-btn')) {
            let btn = document.createElement('button');
            btn.id = 'emergency-reset-btn';
            btn.className = 'bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md text-sm transition-colors whitespace-nowrap';
            btn.innerText = '🚨 수량 오류 초기화';
            btn.onclick = emergencyResetAccQty;
            headerDiv.prepend(btn);
        }
        if(headerDiv && !document.getElementById('direct-input-btn')) {
            let btn = document.createElement('button');
            btn.id = 'direct-input-btn';
            btn.className = 'bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md text-sm transition-colors whitespace-nowrap';
            btn.innerText = '📝 명세서 수기 입력';
            btn.onclick = openDirectInputModal;
            headerDiv.prepend(btn);
        }

        const supSelect = document.getElementById('acc-supplier');
        if (supSelect && supSelect.options.length <= 1) populateAccDropdowns();

        const type = document.getElementById('acc-type')?.value || 'date';
        const dateVal = document.getElementById('acc-date')?.value;
        const startVal = document.getElementById('acc-period-start')?.value;
        const endVal = document.getElementById('acc-period-end')?.value;
        const monthVal = document.getElementById('acc-month')?.value;
        const supFilter = document.getElementById('acc-supplier')?.value || 'ALL';
        const itemFilter = document.getElementById('acc-item')?.value || 'ALL';
        const groupMode = document.getElementById('acc-group')?.value || 'individual';
        
        let targetHistory = globalHistory.filter(h => h.action_type === '입고' && !(h.remarks && String(h.remarks).includes('[기존재고]')));

        targetHistory = targetHistory.filter(h => {
            let hDate = h.production_date || (h.created_at ? h.created_at.substring(0, 10) : '');
            if(type === 'date' && dateVal) return hDate === dateVal;
            if(type === 'period' && startVal && endVal) return hDate >= startVal && hDate <= endVal;
            if(type === 'month' && monthVal) return hDate.startsWith(monthVal);
            return true;
        });

        if(supFilter !== 'ALL') { targetHistory = targetHistory.filter(h => (h.remarks || "기본입고처").replace('[기존재고]', '').trim() === supFilter); }
        if(itemFilter !== 'ALL') { targetHistory = targetHistory.filter(h => h.item_name === itemFilter); }

        unconfirmedData = []; confirmedData = []; accTableData = [];

        if (groupMode === 'individual') {
            let merged = {};
            targetHistory.forEach(h => {
                let current_qty = h.acc_qty !== undefined && h.acc_qty !== null ? h.acc_qty : h.quantity;
                if (current_qty <= 0) return; 

                let sup = (h.remarks || "기본입고처").replace('[기존재고]', '').trim();
                let pDate = h.production_date || (h.created_at ? h.created_at.substring(0, 10) : '');
                let key = pDate + '|' + sup + '|' + h.item_name + '|' + (h.acc_status || '미확정');
                
                if(!merged[key]) {
                    merged[key] = {
                        ids: [h.id], date: pDate, supplier: sup, item_name: h.item_name,
                        original_qty: h.quantity, qty: current_qty,
                        price: h.acc_price || getUnitPrice(h.item_name, 'materials', sup), 
                        adj: h.acc_adj || 0, status: h.acc_status || '미확정', location_id: h.location_id
                    };
                } else {
                    merged[key].ids.push(h.id);
                    merged[key].original_qty += h.quantity;
                    merged[key].qty += current_qty; 
                    merged[key].adj += (h.acc_adj || 0); 
                }
            });

            accTableData = Object.values(merged);
            accTableData.forEach(m => { if(m.status === '확정') confirmedData.push(m); else unconfirmedData.push(m); });
            renderIndividualTable();

        } else if (groupMode === 'daily_item') {
            let summary = {};
            targetHistory.forEach(h => {
                let current_qty = h.acc_qty !== undefined && h.acc_qty !== null ? h.acc_qty : h.quantity;
                if (current_qty <= 0) return;

                let pDate = h.production_date || h.created_at.substring(0, 10);
                let key = pDate + '|' + h.item_name;
                if(!summary[key]) summary[key] = { date: pDate, item_name: h.item_name, qty: 0, amount: 0 };
                
                let price = h.acc_price || getUnitPrice(h.item_name, 'materials', (h.remarks || "").replace('[기존재고]', '').trim());
                summary[key].qty += current_qty;
                summary[key].amount += (current_qty * price) + (h.acc_adj || 0);
            });
            accTableData = Object.values(summary).sort((a,b) => a.date.localeCompare(b.date));
            renderSummaryTable('일자', '품목명', '수량', '합계금액', accTableData);

        } else if (groupMode === 'supplier') {
            let summary = {};
            targetHistory.forEach(h => {
                let current_qty = h.acc_qty !== undefined && h.acc_qty !== null ? h.acc_qty : h.quantity;
                if (current_qty <= 0) return;

                let sup = (h.remarks || "기본입고처").replace('[기존재고]', '').trim();
                if(!summary[sup]) summary[sup] = { name: sup, qty: 0, amount: 0 };
                let price = h.acc_price || getUnitPrice(h.item_name, 'materials', sup);
                summary[sup].qty += current_qty;
                summary[sup].amount += (current_qty * price) + (h.acc_adj || 0);
            });
            accTableData = Object.values(summary).sort((a,b) => b.amount - a.amount);
            renderSummaryTable('매입처', '총 입고수량', '총 매입액(부가세별도)', null, accTableData);

        } else if (groupMode === 'item') {
            let summary = {};
            targetHistory.forEach(h => {
                let current_qty = h.acc_qty !== undefined && h.acc_qty !== null ? h.acc_qty : h.quantity;
                if (current_qty <= 0) return;

                if(!summary[h.item_name]) summary[h.item_name] = { name: h.item_name, qty: 0, amount: 0 };
                let sup = (h.remarks || "").replace('[기존재고]', '').trim();
                let price = h.acc_price || getUnitPrice(h.item_name, 'materials', sup);
                summary[h.item_name].qty += current_qty;
                summary[h.item_name].amount += (current_qty * price) + (h.acc_adj || 0);
            });
            accTableData = Object.values(summary).sort((a,b) => b.amount - a.amount);
            renderSummaryTable('품목명', '총 입고수량', '총 매입액(부가세별도)', null, accTableData);
        }

        updateAccountingSummary();
    } catch (e) { console.error("정산 렌더링 에러:", e); }
};

function getUnitPrice(itemName, type, supplier) {
    let list = type === 'finished' ? finishedProductMaster : productMaster;
    let found = list.find(p => p.item_name === itemName && (p.supplier === supplier || !p.supplier));
    return found ? found.unit_price : 0;
}

function updateAccountingSummary() {
    let supTotal = 0; let unconfTotal = 0;
    confirmedData.forEach(item => { supTotal += (item.qty * item.price) + item.adj; });
    unconfirmedData.forEach(item => { unconfTotal += (item.qty * item.price) + item.adj; });

    let tax = Math.round(supTotal * 0.1);
    document.getElementById('acc-supply').innerText = supTotal.toLocaleString() + ' 원';
    document.getElementById('acc-tax').innerText = tax.toLocaleString() + ' 원';
    document.getElementById('acc-total').innerText = (supTotal + tax).toLocaleString() + ' 원';
    document.getElementById('acc-unconfirmed').innerText = unconfTotal.toLocaleString() + ' 원';
}

function renderIndividualTable() {
    const thead = document.getElementById('acc-thead');
    const tbody = document.getElementById('acc-list');
    
    thead.innerHTML = `
        <tr class="text-slate-500 text-[10px] md:text-xs">
            <th class="p-3 md:p-4 font-black">상태</th><th class="p-3 md:p-4 font-black">일자</th><th class="p-3 md:p-4 font-black">매입처</th>
            <th class="p-3 md:p-4 font-black">품목명</th><th class="p-3 md:p-4 font-black text-right text-indigo-600">총수량(EA)</th>
            <th class="p-3 md:p-4 font-black text-right text-emerald-600">단가(원)</th><th class="p-3 md:p-4 font-black text-right text-rose-500">조정액(원)</th>
            <th class="p-3 md:p-4 font-black text-right text-blue-700">최종합계</th><th class="p-3 md:p-4 font-black text-center">관리</th>
        </tr>
    `;

    if(accTableData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-slate-400 font-bold">해당 기간의 데이터가 없습니다.</td></tr>`;
        return;
    }

    let html = '';
    let sortedData = [...accTableData].sort((a, b) => {
        if(a.status === '미확정' && b.status === '확정') return -1;
        if(a.status === '확정' && b.status === '미확정') return 1;
        return b.date.localeCompare(a.date);
    });

    sortedData.forEach((item, idx) => {
        let isConf = item.status === '확정';
        let statusBadge = isConf ? `<span class="bg-emerald-50 text-emerald-600 px-2 py-1 rounded border border-emerald-200 text-[10px] font-black">✅ 확정됨</span>` : `<span class="bg-orange-50 text-orange-600 px-2 py-1 rounded border border-orange-200 text-[10px] font-black">⚠️ 미확정</span>`;
        let total = (item.qty * item.price) + item.adj;
        let mergeInfo = item.ids.length > 1 ? `<span class="text-[9px] text-slate-400 ml-1">(${item.ids.length}건 병합)</span>` : '';
        let manualBadge = item.location_id === '[명세서수기입력]' ? `<span class="text-[9px] text-teal-600 bg-teal-50 border border-teal-200 px-1 rounded ml-1">수기입력</span>` : '';

        let actionBtns = isConf 
            ? `<button onclick="cancelConfirmAccounting(${idx})" class="text-[10px] font-bold text-slate-400 hover:text-rose-500 underline">확정 취소 풀기</button>`
            : `<div class="flex flex-col space-y-1 items-center"><button onclick="confirmSingleAccounting(${idx})" class="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-3 py-1.5 rounded font-black shadow-sm w-full">확정</button><div class="flex space-x-1 w-full"><button onclick="openEditAccModal(${idx})" class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-600 text-[10px] px-2 py-1 rounded font-bold">수정</button><button onclick="openSplitAccModal(${idx})" class="flex-1 bg-purple-100 hover:bg-purple-200 text-purple-700 text-[10px] px-2 py-1 rounded font-bold">분할</button></div></div>`;

        html += `
            <tr class="border-b border-slate-100 ${isConf ? 'bg-slate-50 opacity-80' : 'hover:bg-indigo-50/30 transition-colors'}">
                <td class="p-3 md:p-4 text-center">${statusBadge}</td><td class="p-3 md:p-4 text-[11px] md:text-sm font-bold text-slate-600">${item.date}</td>
                <td class="p-3 md:p-4 text-[11px] md:text-sm font-black text-rose-500">${item.supplier}</td><td class="p-3 md:p-4 text-[11px] md:text-sm font-bold text-slate-700">${item.item_name} ${mergeInfo} ${manualBadge}</td>
                <td class="p-3 md:p-4 text-right text-[11px] md:text-sm font-black text-indigo-600">${item.qty.toLocaleString()}</td>
                <td class="p-3 md:p-4 text-right text-[11px] md:text-sm font-bold text-emerald-600">${item.price.toLocaleString()}</td>
                <td class="p-3 md:p-4 text-right text-[11px] md:text-sm font-bold ${item.adj !== 0 ? 'text-rose-600' : 'text-slate-400'}">${item.adj.toLocaleString()}</td>
                <td class="p-3 md:p-4 text-right text-xs md:text-base font-black text-blue-700">${total.toLocaleString()}</td><td class="p-3 md:p-4 text-center align-middle w-24">${actionBtns}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function renderSummaryTable(col1, col2, col3, col4, data) {
    const tbody = document.getElementById('acc-list');
    document.getElementById('acc-thead').innerHTML = `<tr class="text-slate-500 text-xs md:text-sm bg-slate-100"><th class="p-3 md:p-4 font-black">${col1}</th><th class="p-3 md:p-4 font-black">${col2}</th><th class="p-3 md:p-4 font-black text-right">${col3}</th>${col4 ? `<th class="p-3 md:p-4 font-black text-right">${col4}</th>` : ''}</tr>`;

    if(data.length === 0) return tbody.innerHTML = `<tr><td colspan="${col4 ? 4 : 3}" class="p-10 text-center text-slate-400 font-bold">데이터가 없습니다.</td></tr>`;

    tbody.innerHTML = data.map(item => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="p-3 md:p-4 text-sm font-bold text-slate-700">${item.date || item.name}</td><td class="p-3 md:p-4 text-sm font-bold text-slate-600">${item.item_name || item.qty.toLocaleString() + ' EA'}</td>
            <td class="p-3 md:p-4 text-right text-sm font-black text-slate-800">${item.item_name ? item.qty.toLocaleString() + ' EA' : item.amount.toLocaleString() + ' 원'}</td>
            ${col4 ? `<td class="p-3 md:p-4 text-right font-black text-blue-700">${item.amount.toLocaleString()} 원</td>` : ''}
        </tr>`).join('');
}

// 💡 [핵심 패치] 수기 입력 창 열 때 무조건 DB에서 최신 단가 데이터를 강제 동기화함!
window.openDirectInputModal = async function() {
    // 0.1초 만에 백그라운드에서 최신 품목 정보 긁어오기
    try {
        const ts = new Date().getTime();
        const [prodRes, fpRes] = await Promise.all([fetch('/api/products?t='+ts), fetch('/api/finished_products?t='+ts)]);
        productMaster = await prodRes.json();
        finishedProductMaster = await fpRes.json();
    } catch(e) {} // 에러나도 기존 데이터로 진행

    let modal = document.getElementById('direct-input-modal');
    if(!modal) {
        modal = document.createElement('div');
        modal.id = 'direct-input-modal';
        modal.className = 'hidden fixed inset-0 bg-slate-800 bg-opacity-60 items-center justify-center z-[260]';
        document.body.appendChild(modal);
    }

    let today = new Date().toISOString().split('T')[0];
    let suppliers = new Set();
    finishedProductMaster.forEach(p => { if(p.supplier) suppliers.add(p.supplier); });
    productMaster.forEach(p => { if(p.supplier) suppliers.add(p.supplier); });
    let supOptions = Array.from(suppliers).map(s => `<option value="${s}">${s}</option>`).join('');

    modal.innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-2xl flex flex-col w-[400px] transform transition-all animate-[popup_0.2s_ease-out_forwards]">
            <h2 class="text-xl font-black text-teal-800 mb-4 border-b pb-2">📝 명세서 수기 입력</h2>
            <div class="mb-3"><label class="block text-xs font-bold text-slate-500 mb-1">명세서 입고 일자</label><input type="date" id="di-date" value="${today}" class="w-full border-2 border-slate-300 rounded p-2 text-sm font-bold outline-none focus:border-teal-500"></div>
            <div class="mb-3"><label class="block text-xs font-bold text-slate-500 mb-1">매입처</label><select id="di-supplier" onchange="updateDiCategoryDropdown()" class="w-full border-2 border-slate-300 rounded p-2 text-sm font-bold outline-none focus:border-teal-500"><option value="">-- 매입처 선택 --</option>${supOptions}</select></div>
            <div class="mb-3"><label class="block text-xs font-bold text-slate-500 mb-1">카테고리</label><select id="di-cat" onchange="updateDiItemDropdown()" class="w-full border-2 border-slate-300 rounded p-2 text-sm font-bold outline-none focus:border-teal-500"></select></div>
            <div class="mb-3"><label class="block text-xs font-bold text-slate-500 mb-1">품목명</label><select id="di-item" onchange="updateDiPrice()" class="w-full border-2 border-slate-300 rounded p-2 text-sm font-bold outline-none focus:border-teal-500"></select></div>
            <div class="flex space-x-3 mb-6">
                <div class="w-1/2"><label class="block text-xs font-bold text-slate-500 mb-1">수량 (EA)</label><input type="number" id="di-qty" placeholder="수량 입력" class="w-full border-2 border-slate-300 rounded p-2 text-sm font-black text-indigo-700 outline-none focus:border-teal-500"></div>
                <div class="w-1/2"><label class="block text-xs font-bold text-slate-500 mb-1">단가 (원)</label><input type="number" id="di-price" placeholder="단가" class="w-full border-2 border-slate-300 rounded p-2 text-sm font-black text-emerald-700 outline-none focus:border-teal-500"></div>
            </div>
            <div class="flex space-x-3"><button onclick="closeDirectInputModal()" class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition-colors">취소</button><button onclick="submitDirectInput()" class="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-black py-3 rounded-xl shadow-md transition-colors">장부에 입력</button></div>
        </div>
    `;
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

window.updateDiCategoryDropdown = function() {
    let sup = document.getElementById('di-supplier').value; let categories = new Set();
    finishedProductMaster.forEach(p => { if(!sup || p.supplier === sup) categories.add(p.category); });
    productMaster.forEach(p => { if(!sup || p.supplier === sup) categories.add(p.category); });
    document.getElementById('di-cat').innerHTML = Array.from(categories).map(c => `<option value="${c}">${c}</option>`).join('');
    updateDiItemDropdown();
}

window.updateDiItemDropdown = function() {
    let sup = document.getElementById('di-supplier').value; let cat = document.getElementById('di-cat').value; let items = [];
    finishedProductMaster.forEach(p => { if((!sup || p.supplier === sup) && p.category === cat) items.push(p); });
    productMaster.forEach(p => { if((!sup || p.supplier === sup) && p.category === cat) items.push(p); });
    document.getElementById('di-item').innerHTML = items.map(i => `<option value="${i.item_name}">${i.item_name}</option>`).join('');
    updateDiPrice();
}

window.updateDiPrice = function() {
    let sup = document.getElementById('di-supplier').value; let itemName = document.getElementById('di-item').value;
    let found = finishedProductMaster.find(p => p.item_name === itemName && p.supplier === sup) || productMaster.find(p => p.item_name === itemName && p.supplier === sup);
    if(found) document.getElementById('di-price').value = found.unit_price || 0;
}

function closeDirectInputModal() { let modal = document.getElementById('direct-input-modal'); if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } }

async function submitDirectInput() {
    const date = document.getElementById('di-date').value;
    const supplier = document.getElementById('di-supplier').value;
    const item_name = document.getElementById('di-item').value;
    const qty = parseInt(document.getElementById('di-qty').value) || 0;
    const price = parseInt(document.getElementById('di-price').value) || 0;

    if(!date || !supplier || !item_name || qty <= 0) return alert("입력값을 확인해주세요.");

    try {
        let newPayload = {
            location_id: "[명세서수기입력]", action_type: "입고", item_name: item_name, quantity: qty, acc_qty: qty, acc_price: price,
            acc_status: '미확정', pallet_count: 1, remarks: supplier, payment_status: "미지급", production_date: date, created_at: `${date}T00:00:00Z` 
        };
        const res = await fetch(`https://sxdldhjmatzzyfufavrm.supabase.co/rest/v1/history_log`, {
            method: 'POST', headers: { "apikey": "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu", "Authorization": `Bearer sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu`, "Content-Type": "application/json", "Prefer": "return=representation" },
            body: JSON.stringify([newPayload])
        });
        if(!res.ok) throw new Error("수기 입력 데이터 생성 실패");
        
        closeDirectInputModal();
        await load(); // 완료될 때까지 백그라운드 갱신
        alert("✅ 장부에 수기 입력이 실시간으로 완료되었습니다!"); 
    } catch (e) { alert("오류 발생: " + e.message); }
}

function updateEditAccCategoryDropdown(selectedCategory) {
    const type = document.getElementById('acc-type').value; let set = new Set();
    if (type === 'FINISHED') finishedProductMaster.forEach(p => set.add(p.category)); else if (type === 'MATERIAL') productMaster.forEach(p => set.add(p.category)); else { finishedProductMaster.forEach(p => set.add(p.category)); productMaster.forEach(p => set.add(p.category)); }
    const catSelect = document.getElementById('edit-acc-cat');
    catSelect.innerHTML = Array.from(set).map(c => `<option value="${c}">${c}</option>`).join('');
    if(selectedCategory) catSelect.value = selectedCategory;
}

function updateEditAccItemDropdown(category, selectedItem) {
    const type = document.getElementById('acc-type').value; let list = [];
    if (type === 'FINISHED') list = finishedProductMaster.filter(p => p.category === category); else if (type === 'MATERIAL') list = productMaster.filter(p => p.category === category); else { list = finishedProductMaster.filter(p => p.category === category).concat(productMaster.filter(p => p.category === category)); }
    const itemSelect = document.getElementById('edit-acc-item');
    let optionsHtml = list.map(p => `<option value="${p.item_name}">${p.item_name}</option>`);
    if (selectedItem && !list.find(p => p.item_name === selectedItem)) optionsHtml.unshift(`<option value="${selectedItem}">${selectedItem}</option>`);
    itemSelect.innerHTML = optionsHtml.join('');
    if(selectedItem) itemSelect.value = selectedItem;
}

function openEditAccModal(idx) {
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    let item = sortedData[idx]; if(!item) return;

    document.getElementById('edit-acc-idx').value = idx; document.getElementById('edit-acc-supplier').innerText = item.supplier; document.getElementById('edit-acc-date').value = item.date;
    document.getElementById('edit-acc-qty').value = item.qty; document.getElementById('edit-acc-price').value = item.price; document.getElementById('edit-acc-adj').value = item.adj || 0;

    let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
    updateEditAccCategoryDropdown(pInfo ? pInfo.category : null);
    updateEditAccItemDropdown(document.getElementById('edit-acc-cat').value, item.item_name);

    let modal = document.getElementById('edit-acc-modal'); modal.classList.remove('hidden'); modal.classList.add('flex');
}

function closeEditAccModal() { let modal = document.getElementById('edit-acc-modal'); modal.classList.add('hidden'); modal.classList.remove('flex'); }

async function submitEditAccModal() {
    const idx = document.getElementById('edit-acc-idx').value;
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    let item = sortedData[idx]; if(!item) return;

    let inputQty = parseInt(String(document.getElementById('edit-acc-qty').value).replace(/,/g, ''));
    if(isNaN(inputQty) || inputQty <= 0) return alert("수량을 1개 이상 정확히 입력해주세요.");

    try {
        let updatePayload = item.ids.map(id => ({
            id: id, production_date: document.getElementById('edit-acc-date').value, item_name: document.getElementById('edit-acc-item').value, 
            acc_qty: Math.floor(inputQty / item.ids.length), acc_price: parseInt(document.getElementById('edit-acc-price').value) || 0, acc_adj: Math.floor((parseInt(document.getElementById('edit-acc-adj').value) || 0) / item.ids.length)
        }));

        const res = await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        if((await res.json()).status === 'success') { closeEditAccModal(); await load(); alert("✅ 수정 내용이 실시간으로 적용되었습니다."); } else { alert("수정 실패"); }
    } catch (e) { alert("오류 발생: " + e.message); }
}

function openSplitAccModal(idx) {
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    splitTargetItem = sortedData[idx]; if(!splitTargetItem) return;

    let modal = document.getElementById('split-acc-modal');
    if(!modal) { modal = document.createElement('div'); modal.id = 'split-acc-modal'; modal.className = 'hidden fixed inset-0 bg-slate-800 bg-opacity-60 items-center justify-center z-[260]'; document.body.appendChild(modal); }

    modal.innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-2xl flex flex-col w-[400px] transform transition-all animate-[popup_0.2s_ease-out_forwards]">
            <h2 class="text-xl font-black text-purple-800 mb-4 border-b pb-2">✂️ 항목 분할 (나누기)</h2>
            <div class="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm"><div class="text-slate-500 font-bold mb-1">원본 품목명: <span class="text-slate-800 font-black">${splitTargetItem.item_name}</span></div><div class="text-slate-500 font-bold">현재 총 수량: <span class="text-indigo-600 font-black">${splitTargetItem.qty.toLocaleString()}</span> EA</div></div>
            <div class="mb-4"><label class="block text-xs font-bold text-slate-500 mb-1">분할해 낼 수량 (새로운 행으로 분리)</label><div class="flex items-center space-x-2"><input type="number" id="split-out-qty" onkeyup="calcSplitRemain()" onchange="calcSplitRemain()" max="${splitTargetItem.qty - 1}" min="1" placeholder="예: 50" class="w-full border-2 border-purple-300 rounded p-2.5 text-sm font-black text-purple-700 outline-none"><span class="font-bold text-slate-500 text-sm">EA</span></div><div class="mt-2 text-xs font-bold text-rose-500 hidden" id="split-error-msg">수량은 1부터 ${splitTargetItem.qty - 1} 사이여야 합니다.</div></div>
            <div class="mb-6"><label class="block text-xs font-bold text-slate-500 mb-1">분할 후 원본 행에 남을 수량</label><div class="w-full border border-slate-200 bg-slate-100 rounded p-2.5 text-sm font-black text-slate-500" id="split-remain-qty">${splitTargetItem.qty}</div></div>
            <div class="flex space-x-3"><button onclick="closeSplitAccModal()" class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition-colors">취소</button><button onclick="executeSplitAcc()" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-black py-3 rounded-xl shadow-md transition-colors">이대로 분할하기</button></div>
        </div>
    `;
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

function closeSplitAccModal() { let modal = document.getElementById('split-acc-modal'); if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } splitTargetItem = null; }

window.calcSplitRemain = function() {
    if(!splitTargetItem) return;
    let outQty = parseInt(document.getElementById('split-out-qty').value) || 0; let currentQty = splitTargetItem.qty;
    if(outQty <= 0 || outQty >= currentQty) { document.getElementById('split-out-qty').classList.add('border-rose-500'); document.getElementById('split-error-msg').classList.remove('hidden'); document.getElementById('split-remain-qty').innerText = '-'; } 
    else { document.getElementById('split-out-qty').classList.remove('border-rose-500'); document.getElementById('split-error-msg').classList.add('hidden'); document.getElementById('split-remain-qty').innerText = (currentQty - outQty).toLocaleString(); }
}

async function executeSplitAcc() {
    if(!splitTargetItem) return;
    let outQty = parseInt(document.getElementById('split-out-qty').value) || 0;
    if(outQty <= 0 || outQty >= splitTargetItem.qty) return alert("분할 수량이 올바르지 않습니다.");

    try {
        let remainToDeduct = outQty; let updatePayload = [];
        let targetRows = splitTargetItem.ids.map(id => globalHistory.find(h => h.id === id)).filter(Boolean);
        let originLog = null;

        for(let row of targetRows) {
            if(!originLog) originLog = row; 
            let currentQty = row.acc_qty !== undefined && row.acc_qty !== null ? row.acc_qty : row.quantity;
            if (remainToDeduct <= 0) continue;
            if (currentQty <= remainToDeduct) { updatePayload.push({ id: row.id, acc_qty: 0 }); remainToDeduct -= currentQty; } 
            else { updatePayload.push({ id: row.id, acc_qty: currentQty - remainToDeduct }); remainToDeduct = 0; }
        }
        if(updatePayload.length > 0) await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });

        let newPayload = { location_id: originLog.location_id, action_type: originLog.action_type, item_name: originLog.item_name, quantity: outQty, acc_qty: outQty, acc_price: splitTargetItem.price, acc_status: '미확정', pallet_count: originLog.pallet_count, remarks: originLog.remarks, payment_status: originLog.payment_status, production_date: originLog.production_date, created_at: originLog.created_at };
        const res = await fetch(`https://sxdldhjmatzzyfufavrm.supabase.co/rest/v1/history_log`, { method: 'POST', headers: { "apikey": "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu", "Authorization": `Bearer sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu`, "Content-Type": "application/json", "Prefer": "return=representation" }, body: JSON.stringify([newPayload]) });
        if(!res.ok) throw new Error("새로운 행 분할 생성 실패");

        closeSplitAccModal(); await load(); alert("✅ 분할이 완료되었습니다."); 
    } catch (e) { alert("분할 중 오류 발생: " + e.message); }
}

async function confirmSingleAccounting(idx) {
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    let item = sortedData[idx]; if(!item) return;
    try {
        let updatePayload = item.ids.map(id => ({ id: id, acc_status: '확정', acc_price: item.price }));
        await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        await load();
    } catch (e) { alert("확정 오류: " + e.message); }
}

async function cancelConfirmAccounting(idx) {
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    let item = sortedData[idx]; if(!item) return;
    try {
        let updatePayload = item.ids.map(id => ({ id: id, acc_status: '미확정' }));
        await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        await load();
    } catch (e) { alert("확정 취소 오류: " + e.message); }
}

async function batchConfirmAccounting() {
    if(unconfirmedData.length === 0) return alert("현재 조회된 조건에서 확정할 미확정 항목이 없습니다.");
    if(!confirm(`조회된 ${unconfirmedData.length}건의 항목을 일괄 확정하시겠습니까?`)) return;
    try {
        let updatePayload = [];
        unconfirmedData.forEach(item => { item.ids.forEach(id => { updatePayload.push({ id: id, acc_status: '확정', acc_price: item.price }); }); });
        let res = await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        if((await res.json()).status === 'success') { await load(); alert("✅ 일괄 확정 완료!"); } else { alert("일괄 확정 실패"); }
    } catch (e) { alert("일괄 확정 중 오류: " + e.message); }
}

function exportAccountingExcel() {
    if (accTableData.length === 0) return alert("다운로드할 데이터가 없습니다.");
    const groupMode = document.getElementById('acc-group').value; let wsData = [];
    if (groupMode === 'individual') {
        let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
        wsData = sortedData.map(item => ({ "상태": item.status, "일자": item.date, "매입처": item.supplier, "품목명": item.item_name, "총수량(EA)": item.qty, "단가(원)": item.price, "조정액(원)": item.adj || 0, "공급가액(원)": (item.qty * item.price) + (item.adj || 0), "비고": item.ids.length > 1 ? `${item.ids.length}건 병합` : "" }));
    } else {
        wsData = accTableData.map(item => ({ "구분1": item.date || item.name, "구분2": item.item_name || item.qty + ' EA', "총수량/건수": item.qty || "-", "총 매입액(원)": item.amount }));
    }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "정산내역");
    XLSX.writeFile(wb, `한스팜_정산내역_${new Date().toISOString().split('T')[0]}.xlsx`);
}
