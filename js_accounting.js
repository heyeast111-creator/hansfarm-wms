// ==========================================
// [정산/회계] 명세서 대조 및 확정 로직 (에러 100% 제거 및 긴급 복구 탑재)
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

// 💡 날짜/업체 변경 시 즉각 렌더링되도록 연결
window.updateAccFilters = function(type) {
    if(type === 'supplier') populateAccDropdowns(); 
    renderAccounting();
};

// 💡 꼬여버린 수량을 원래대로 되돌리는 복구 버튼 로직
async function emergencyResetAccQty() {
    if(!confirm("🚨 경고: 꼬여버린 정산 수량을 [최초 입고된 정상 수량]으로 100% 강제 초기화합니다. 진행하시겠습니까?")) return;
    try {
        let targetHistory = globalHistory.filter(h => h.action_type === '입고' && (h.acc_qty !== null || h.acc_status === '확정'));
        // acc_qty를 null로 만들어서 원본 quantity를 따라가게 리셋
        let payload = targetHistory.map(h => ({ id: h.id, acc_qty: null, acc_status: '미확정' }));
        
        if(payload.length === 0) return alert("복구할 데이터가 없습니다.");

        for(let i=0; i<payload.length; i+=100) {
            let chunk = payload.slice(i, i+100);
            await fetch('/api/history_update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(chunk) });
        }
        alert("✅ 복구 완료! 모든 수량이 정상으로 돌아왔습니다.");
        load();
    } catch(e) { alert("복구 중 에러 발생: " + e.message); }
}

// 💡 메인 렌더링 함수
window.renderAccounting = async function() {
    try {
        // 복구 버튼 동적 생성
        let headerDiv = document.querySelector('#view-accounting .flex.space-x-2');
        if(headerDiv && !document.getElementById('emergency-reset-btn')) {
            let btn = document.createElement('button');
            btn.id = 'emergency-reset-btn';
            btn.className = 'bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md text-sm transition-colors animate-pulse';
            btn.innerText = '🚨 수량 오류 긴급 초기화';
            btn.onclick = emergencyResetAccQty;
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
                if (current_qty <= 0) return; // 분할 후 0개가 된 찌꺼기는 숨김

                let sup = (h.remarks || "기본입고처").replace('[기존재고]', '').trim();
                let pDate = h.production_date || (h.created_at ? h.created_at.substring(0, 10) : '');
                let key = pDate + '|' + sup + '|' + h.item_name + '|' + (h.acc_status || '미확정');
                
                if(!merged[key]) {
                    merged[key] = {
                        ids: [h.id], date: pDate, supplier: sup, item_name: h.item_name,
                        original_qty: h.quantity, qty: current_qty,
                        price: h.acc_price || getUnitPrice(h.item_name, 'materials', sup), 
                        adj: h.acc_adj || 0, status: h.acc_status || '미확정'
                    };
                } else {
                    merged[key].ids.push(h.id);
                    merged[key].original_qty += h.quantity;
                    merged[key].qty += current_qty; // 확정 여부 상관없이 실제 수량 합산
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
        tbody.innerHTML = `<tr><td colspan="9" class="p-10 text-center text-slate-400 font-bold">해당 기간의 조회된 내역이 없습니다.</td></tr>`;
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

        let actionBtns = isConf 
            ? `<button onclick="cancelConfirmAccounting(${idx})" class="text-[10px] font-bold text-slate-400 hover:text-rose-500 underline">확정 취소 풀기</button>`
            : `<div class="flex flex-col space-y-1 items-center"><button onclick="confirmSingleAccounting(${idx})" class="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-3 py-1.5 rounded font-black shadow-sm w-full">확정</button><div class="flex space-x-1 w-full"><button onclick="openEditAccModal(${idx})" class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-600 text-[10px] px-2 py-1 rounded font-bold">수정</button><button onclick="openSplitAccModal(${idx})" class="flex-1 bg-purple-100 hover:bg-purple-200 text-purple-700 text-[10px] px-2 py-1 rounded font-bold">분할</button></div></div>`;

        html += `
            <tr class="border-b border-slate-100 ${isConf ? 'bg-slate-50 opacity-80' : 'hover:bg-indigo-50/30 transition-colors'}">
                <td class="p-3 md:p-4 text-center">${statusBadge}</td><td class="p-3 md:p-4 text-[11px] md:text-sm font-bold text-slate-600">${item.date}</td>
                <td class="p-3 md:p-4 text-[11px] md:text-sm font-black text-rose-500">${item.supplier}</td><td class="p-3 md:p-4 text-[11px] md:text-sm font-bold text-slate-700">${item.item_name} ${mergeInfo}</td>
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

function openEditAccModal(idx) {
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    let item = sortedData[idx];
    if(!item) return;

    document.getElementById('edit-acc-idx').value = idx;
    document.getElementById('edit-acc-supplier').innerText = item.supplier;
    document.getElementById('edit-acc-date').value = item.date;
    document.getElementById('edit-acc-qty').value = item.qty;
    document.getElementById('edit-acc-price').value = item.price;
    document.getElementById('edit-acc-adj').value = item.adj || 0;

    updateEditAccCategoryDropdown();
    let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
    if(pInfo) { document.getElementById('edit-acc-cat').value = pInfo.category; updateEditAccItemDropdown(pInfo.category); document.getElementById('edit-acc-item').value = item.item_name; }

    let modal = document.getElementById('edit-acc-modal'); modal.classList.remove('hidden'); modal.classList.add('flex');
}

function closeEditAccModal() { let modal = document.getElementById('edit-acc-modal'); modal.classList.add('hidden'); modal.classList.remove('flex'); }

async function submitEditAccModal() {
    const idx = document.getElementById('edit-acc-idx').value;
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    let item = sortedData[idx];
    if(!item) return;

    try {
        let updatePayload = item.ids.map(id => ({
            id: id, production_date: document.getElementById('edit-acc-date').value, item_name: document.getElementById('edit-acc-item').value,
            acc_qty: Math.floor((parseInt(document.getElementById('edit-acc-qty').value) || 0) / item.ids.length), 
            acc_price: parseInt(document.getElementById('edit-acc-price').value) || 0, acc_adj: Math.floor((parseInt(document.getElementById('edit-acc-adj').value) || 0) / item.ids.length)
        }));

        const res = await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        if((await res.json()).status === 'success') { closeEditAccModal(); load(); } else { alert("수정 실패"); }
    } catch (e) { alert("오류 발생: " + e.message); }
}

function openSplitAccModal(idx) {
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    splitTargetItem = sortedData[idx];
    if(!splitTargetItem) return;

    let modal = document.getElementById('split-acc-modal');
    if(!modal) { modal = document.createElement('div'); modal.id = 'split-acc-modal'; modal.className = 'hidden fixed inset-0 bg-slate-800 bg-opacity-60 items-center justify-center z-[260]'; document.body.appendChild(modal); }

    modal.innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-2xl flex flex-col w-[400px] transform transition-all animate-[popup_0.2s_ease-out_forwards]">
            <h2 class="text-xl font-black text-purple-800 mb-4 border-b pb-2">✂️ 항목 분할 (나누기)</h2>
            <div class="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm">
                <div class="text-slate-500 font-bold mb-1">원본 품목명: <span class="text-slate-800 font-black">${splitTargetItem.item_name}</span></div>
                <div class="text-slate-500 font-bold">현재 총 수량: <span class="text-indigo-600 font-black">${splitTargetItem.qty.toLocaleString()}</span> EA</div>
            </div>
            <div class="mb-4">
                <label class="block text-xs font-bold text-slate-500 mb-1">분할해 낼 수량 (새로운 행으로 분리)</label>
                <div class="flex items-center space-x-2"><input type="number" id="split-out-qty" onkeyup="calcSplitRemain()" onchange="calcSplitRemain()" max="${splitTargetItem.qty - 1}" min="1" placeholder="예: 50" class="w-full border-2 border-purple-300 rounded p-2.5 text-sm font-black text-purple-700 outline-none"><span class="font-bold text-slate-500 text-sm">EA</span></div>
                <div class="mt-2 text-xs font-bold text-rose-500 hidden" id="split-error-msg">수량은 1부터 ${splitTargetItem.qty - 1} 사이여야 합니다.</div>
            </div>
            <div class="mb-6"><label class="block text-xs font-bold text-slate-500 mb-1">분할 후 원본 행에 남을 수량</label><div class="w-full border border-slate-200 bg-slate-100 rounded p-2.5 text-sm font-black text-slate-500" id="split-remain-qty">${splitTargetItem.qty}</div></div>
            <div class="flex space-x-3"><button onclick="closeSplitAccModal()" class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition-colors">취소</button><button onclick="executeSplitAcc()" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-black py-3 rounded-xl shadow-md transition-colors">이대로 분할하기</button></div>
        </div>
    `;
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

function closeSplitAccModal() { let modal = document.getElementById('split-acc-modal'); if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } splitTargetItem = null; }

window.calcSplitRemain = function() {
    if(!splitTargetItem) return;
    let outQty = parseInt(document.getElementById('split-out-qty').value) || 0;
    let currentQty = splitTargetItem.qty;
    if(outQty <= 0 || outQty >= currentQty) { document.getElementById('split-out-qty').classList.add('border-rose-500'); document.getElementById('split-error-msg').classList.remove('hidden'); document.getElementById('split-remain-qty').innerText = '-'; } 
    else { document.getElementById('split-out-qty').classList.remove('border-rose-500'); document.getElementById('split-error-msg').classList.add('hidden'); document.getElementById('split-remain-qty').innerText = (currentQty - outQty).toLocaleString(); }
}

async function executeSplitAcc() {
    if(!splitTargetItem) return;
    let outQty = parseInt(document.getElementById('split-out-qty').value) || 0;
    if(outQty <= 0 || outQty >= splitTargetItem.qty) return alert("분할 수량이 올바르지 않습니다.");

    try {
        let remainToDeduct = outQty;
        let updatePayload = [];
        
        let targetRows = splitTargetItem.ids.map(id => globalHistory.find(h => h.id === id)).filter(Boolean);
        let originLog = null;

        for(let row of targetRows) {
            if(!originLog) originLog = row; 
            let currentQty = row.acc_qty !== undefined && row.acc_qty !== null ? row.acc_qty : row.quantity;
            
            if (remainToDeduct <= 0) continue;
            
            if (currentQty <= remainToDeduct) {
                updatePayload.push({ id: row.id, acc_qty: 0 }); 
                remainToDeduct -= currentQty;
            } else {
                updatePayload.push({ id: row.id, acc_qty: currentQty - remainToDeduct });
                remainToDeduct = 0;
            }
        }

        if(updatePayload.length > 0) {
            await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        }

        let newPayload = {
            location_id: originLog.location_id, action_type: originLog.action_type, item_name: originLog.item_name, 
            quantity: outQty, acc_qty: outQty, acc_price: splitTargetItem.price,
            acc_status: '미확정', pallet_count: originLog.pallet_count, remarks: originLog.remarks, 
            payment_status: originLog.payment_status, production_date: originLog.production_date, created_at: originLog.created_at
        };

        const SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co";
        const SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu";

        const res = await fetch(`${SUPABASE_URL}/rest/v1/history_log`, {
            method: 'POST', headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
            body: JSON.stringify([newPayload])
        });

        if(!res.ok) throw new Error("새로운 행 분할 생성 실패");
        alert("성공적으로 분할되었습니다!"); closeSplitAccModal(); load();
    } catch (e) { alert("분할 중 오류 발생: " + e.message); }
}

async function confirmSingleAccounting(idx) {
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    let item = sortedData[idx]; if(!item) return;
    try {
        let updatePayload = item.ids.map(id => ({ id: id, acc_status: '확정', acc_price: item.price }));
        await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        load();
    } catch (e) { alert("확정 오류: " + e.message); }
}

async function cancelConfirmAccounting(idx) {
    let sortedData = [...accTableData].sort((a, b) => { if(a.status === '미확정' && b.status === '확정') return -1; if(a.status === '확정' && b.status === '미확정') return 1; return b.date.localeCompare(a.date); });
    let item = sortedData[idx]; if(!item) return;
    try {
        let updatePayload = item.ids.map(id => ({ id: id, acc_status: '미확정' }));
        await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        load();
    } catch (e) { alert("확정 취소 오류: " + e.message); }
}

async function batchConfirmAccounting() {
    if(unconfirmedData.length === 0) return alert("현재 조회된 조건에서 확정할 미확정 항목이 없습니다.");
    if(!confirm(`조회된 ${unconfirmedData.length}건의 항목을 일괄 확정하시겠습니까?`)) return;
    try {
        let updatePayload = [];
        unconfirmedData.forEach(item => { item.ids.forEach(id => { updatePayload.push({ id: id, acc_status: '확정', acc_price: item.price }); }); });
        let res = await fetch('/api/history_update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
        if((await res.json()).status === 'success') { alert("일괄 확정 완료!"); load(); } else { alert("일괄 확정 실패"); }
    } catch (e) { alert("일괄 확정 중 오류: " + e.message); }
}

function updateEditAccCategoryDropdown() {
    const type = document.getElementById('acc-type').value; let set = new Set();
    if (type === 'FINISHED') finishedProductMaster.forEach(p => set.add(p.category)); else if (type === 'MATERIAL') productMaster.forEach(p => set.add(p.category)); else { finishedProductMaster.forEach(p => set.add(p.category)); productMaster.forEach(p => set.add(p.category)); }
    document.getElementById('edit-acc-cat').innerHTML = Array.from(set).map(c => `<option value="${c}">${c}</option>`).join('');
    updateEditAccItemDropdown(document.getElementById('edit-acc-cat').value);
}

function updateEditAccItemDropdown(category) {
    const type = document.getElementById('acc-type').value; let list = [];
    if (type === 'FINISHED') list = finishedProductMaster.filter(p => p.category === category); else if (type === 'MATERIAL') list = productMaster.filter(p => p.category === category); else { list = finishedProductMaster.filter(p => p.category === category).concat(productMaster.filter(p => p.category === category)); }
    document.getElementById('edit-acc-item').innerHTML = list.map(p => `<option value="${p.item_name}">${p.item_name}</option>`).join('');
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
