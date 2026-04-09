// ==========================================
// [정산/회계] - 명세서 대조 및 확정 로직 (딜레이 제로 즉시 반영 패치)
// ==========================================
let currentAccList = []; 
let currentAccGroupsByIndex = []; 

// 💡 백그라운드 DB 업데이트 (화면을 멈추지 않고 뒤에서 조용히 실행됨)
async function updateHistoryToDB(historyArray) {
    try {
        fetch('/api/history_update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(historyArray)
        }).then(res => {
            if(!res.ok) console.error("DB 백그라운드 업데이트 실패");
        });
    } catch(e) {
        console.error("DB 업데이트 통신 에러:", e);
    }
}

function toggleAccDateInput() {
    let type = document.getElementById('acc-type').value;
    document.getElementById('acc-date').classList.toggle('hidden', type !== 'date');
    document.getElementById('acc-period-wrapper').classList.toggle('hidden', type !== 'period');
    document.getElementById('acc-month').classList.toggle('hidden', type !== 'month');
    
    if(type === 'period') document.getElementById('acc-period-wrapper').classList.add('flex');
    else document.getElementById('acc-period-wrapper').classList.remove('flex');
}

function updateAccFilters(changedFilter) {
    if (changedFilter === 'type') {
        let type = document.getElementById('acc-type').value;
        let today = new Date().toISOString().split('T')[0];
        if (type === 'date') document.getElementById('acc-date').value = today;
        if (type === 'period') { document.getElementById('acc-period-start').value = today; document.getElementById('acc-period-end').value = today; }
        if (type === 'month') document.getElementById('acc-month').value = today.substring(0, 7);
    }
    renderAccounting();
}

function getAccDefaultPrice(itemName, supplier) {
    let cleanSupplier = (supplier || "기본입고처").replace(/\[기존재고\]/g, '').trim();
    let pInfo = finishedProductMaster.find(p => p.item_name === itemName && p.supplier === cleanSupplier) || 
                productMaster.find(p => p.item_name === itemName && p.supplier === cleanSupplier) ||
                finishedProductMaster.find(p => p.item_name === itemName) || 
                productMaster.find(p => p.item_name === itemName);
    return pInfo ? (pInfo.unit_price || 0) : 0;
}

function renderAccounting() {
    let type = document.getElementById('acc-type').value;
    let date = document.getElementById('acc-date').value;
    let start = document.getElementById('acc-period-start').value;
    let end = document.getElementById('acc-period-end').value;
    let month = document.getElementById('acc-month').value;
    let supplier = document.getElementById('acc-supplier').value;
    let item = document.getElementById('acc-item').value;
    let group = document.getElementById('acc-group').value;

    let filtered = globalHistory.filter(h => h.action_type === '입고');

    if(supplier !== 'ALL') filtered = filtered.filter(h => (h.remarks || '기본입고처') === supplier);
    if(item !== 'ALL') filtered = filtered.filter(h => h.item_name === item);

    filtered = filtered.filter(h => {
        let hDate = h.production_date || h.created_at.substring(0, 10);
        if(type === 'date') return !date || hDate === date;
        if(type === 'period') return (!start || hDate >= start) && (!end || hDate <= end);
        if(type === 'month') return !month || hDate.startsWith(month);
        return true;
    });

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    currentAccList = filtered;

    updateAccSummaryCards(filtered);

    let thead = document.getElementById('acc-thead');
    let tbody = document.getElementById('acc-list');

    if(filtered.length === 0) {
        thead.innerHTML = `<tr><th class="p-4 text-slate-500">조회 결과 없음</th></tr>`;
        tbody.innerHTML = `<tr><td class="text-center p-10 text-slate-400 font-bold">조건에 맞는 내역이 없습니다.</td></tr>`;
        return;
    }

    if (group === 'individual') {
        thead.innerHTML = `
            <tr class="text-slate-600 text-xs">
                <th class="p-3 font-black text-center">상태</th>
                <th class="p-3 font-black">일자</th>
                <th class="p-3 font-black">매입처</th>
                <th class="p-3 font-black">품목명</th>
                <th class="p-3 font-black text-right text-indigo-700">총수량(EA)</th>
                <th class="p-3 font-black text-right text-emerald-700">단가(원)</th>
                <th class="p-3 font-black text-right text-rose-700">조정액(원)</th>
                <th class="p-3 font-black text-right text-blue-700">최종합계</th>
                <th class="p-3 font-black text-center text-slate-500 w-[160px]">관리</th>
            </tr>`;

        let groupedData = {};
        filtered.forEach(h => {
            let hDate = h.production_date || h.created_at.substring(0, 10);
            let sup = h.remarks || '기본입고처';
            let key = `${hDate}|${sup}|${h.item_name}`;

            if(!groupedData[key]) {
                groupedData[key] = {
                    key: key,
                    ids: [], 
                    hDate: hDate,
                    sup: sup,
                    cat: h.category || '',
                    item_name: h.item_name,
                    total_acc_qty: 0,
                    acc_price: h.acc_price !== null && h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, sup),
                    total_adj: 0,
                    isConfirmed: true 
                };
            }
            
            let g = groupedData[key];
            g.ids.push(h.id);
            g.total_acc_qty += (h.acc_qty !== null && h.acc_qty !== undefined ? h.acc_qty : h.quantity);
            g.total_adj += (h.acc_adj || 0);
            if (h.acc_status !== '확정') g.isConfirmed = false;
        });

        currentAccGroupsByIndex = Object.values(groupedData).sort((a,b) => a.key.localeCompare(b.key));

        tbody.innerHTML = currentAccGroupsByIndex.map((g, idx) => {
            let total = (g.total_acc_qty * g.acc_price) + g.total_adj;

            let statusBadge = g.isConfirmed 
                ? `<span class="bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-1 rounded font-black text-[10px] shadow-sm">✅ 확정됨</span>` 
                : `<span class="bg-orange-100 text-orange-600 border border-orange-300 px-2 py-1 rounded font-black text-[10px] shadow-sm animate-pulse">⚠️ 미확정</span>`;
            
            let actionBtns = g.isConfirmed 
                ? `<button onclick="cancelAccGroupConfirm(${idx})" class="w-full text-slate-400 hover:text-slate-600 font-bold text-[10px] underline">확정 취소 풀기</button>` 
                : `<div class="flex space-x-1 justify-center">
                    <button onclick="confirmAccGroup(${idx})" class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 rounded text-[10px] font-bold shadow-sm transition-colors">확정</button>
                    <button onclick="openEditAccModal(${idx})" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-1.5 rounded text-[10px] font-bold shadow-sm transition-colors">수정</button>
                    <button onclick="deleteAccGroup(${idx})" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200 py-1.5 rounded text-[10px] font-bold shadow-sm transition-colors">삭제</button>
                   </div>`;

            return `<tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors bg-white ${g.isConfirmed ? 'opacity-70 bg-slate-50' : ''}">
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-xs font-bold text-slate-600">${g.hDate}</td>
                <td class="p-3 text-xs font-black text-rose-600">${g.sup}</td>
                <td class="p-3 text-xs font-black text-slate-800">${g.item_name} <span class="text-[9px] text-slate-400 ml-1">(${g.ids.length}건 병합)</span></td>
                <td class="p-3 text-right font-black text-indigo-700 text-sm">${g.total_acc_qty.toLocaleString()}</td>
                <td class="p-3 text-right font-black text-emerald-700 text-sm">${g.acc_price.toLocaleString()}</td>
                <td class="p-3 text-right font-black text-rose-700 text-sm">${g.total_adj.toLocaleString()}</td>
                <td class="p-3 text-right font-black text-blue-700 text-sm" id="acc-total-${idx}">${total.toLocaleString()}</td>
                <td class="p-3 text-center align-middle">${actionBtns}</td>
            </tr>`;
        }).join('');
    } 
    else {
        thead.innerHTML = `
            <tr class="text-slate-600 text-xs bg-slate-100">
                <th class="p-3 font-black">그룹 기준</th>
                <th class="p-3 font-black text-right">총 입고 수량(EA)</th>
                <th class="p-3 font-black text-right text-blue-700">총 확정 합계(원)</th>
                <th class="p-3 font-black text-right text-orange-600">미확정 합계(원)</th>
            </tr>`;

        let grouped = {};
        filtered.forEach(h => {
            let hDate = h.production_date || h.created_at.substring(0, 10);
            let sup = h.remarks || '기본입고처';
            let key = "";
            if(group === 'daily_item') key = `[${hDate}] ${sup} - ${h.item_name}`;
            else if(group === 'supplier') key = `${sup}`;
            else if(group === 'item') key = `${h.item_name}`;

            if(!grouped[key]) grouped[key] = { qty: 0, confirmedTotal: 0, unconfirmedTotal: 0 };
            
            let qty = h.acc_qty !== null && h.acc_qty !== undefined ? h.acc_qty : h.quantity;
            let price = h.acc_price !== null && h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, sup);
            let adj = h.acc_adj || 0;
            let total = (qty * price) + adj;

            grouped[key].qty += qty;
            if(h.acc_status === '확정') grouped[key].confirmedTotal += total;
            else grouped[key].unconfirmedTotal += total;
        });

        tbody.innerHTML = Object.keys(grouped).sort().map(k => {
            let g = grouped[k];
            return `<tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors bg-white">
                <td class="p-3 text-xs font-black text-slate-700">${k}</td>
                <td class="p-3 text-right font-bold text-slate-600">${g.qty.toLocaleString()}</td>
                <td class="p-3 text-right font-black text-blue-700">${g.confirmedTotal.toLocaleString()}</td>
                <td class="p-3 text-right font-black text-orange-600">${g.unconfirmedTotal.toLocaleString()}</td>
            </tr>`;
        }).join('');
    }
}

function updateAccSummaryCards(list) {
    let confirmedSupply = 0;
    let unconfirmedTotal = 0;

    list.forEach(h => {
        let qty = h.acc_qty !== null && h.acc_qty !== undefined ? h.acc_qty : h.quantity;
        let price = h.acc_price !== null && h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, h.remarks);
        let adj = h.acc_adj || 0;
        let total = (qty * price) + adj;

        if (h.acc_status === '확정') {
            confirmedSupply += total;
        } else {
            unconfirmedTotal += total;
        }
    });

    let confirmedTax = confirmedSupply * 0.1;
    let confirmedGrandTotal = confirmedSupply + confirmedTax;

    document.getElementById('acc-supply').innerText = confirmedSupply.toLocaleString() + ' 원';
    document.getElementById('acc-tax').innerText = confirmedTax.toLocaleString() + ' 원';
    document.getElementById('acc-total').innerText = confirmedGrandTotal.toLocaleString() + ' 원';
    document.getElementById('acc-unconfirmed').innerText = unconfirmedTotal.toLocaleString() + ' 원';
}

function openEditAccModal(idx) {
    if(loginMode === 'viewer') return;
    
    let group = currentAccGroupsByIndex[idx];
    if(!group) return;

    document.getElementById('edit-acc-idx').value = idx;
    document.getElementById('edit-acc-supplier').innerText = group.sup;

    let cats = [...new Set(productMaster.filter(p=>p.supplier === group.sup).map(p=>p.category))].filter(Boolean).sort();
    let catSel = document.getElementById('edit-acc-cat');
    catSel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    
    if(cats.includes(group.cat)) catSel.value = group.cat;
    else if(cats.length > 0) catSel.value = cats[0];

    updateEditAccCategoryDropdown(group.item_name);

    document.getElementById('edit-acc-qty').value = group.total_acc_qty;
    document.getElementById('edit-acc-date').value = group.hDate;
    document.getElementById('edit-acc-price').value = group.acc_price;
    document.getElementById('edit-acc-adj').value = group.total_adj;

    let modal = document.getElementById('edit-acc-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function updateEditAccCategoryDropdown(selectedItem = null) {
    let sup = document.getElementById('edit-acc-supplier').innerText;
    let cat = document.getElementById('edit-acc-cat').value;
    
    let items = [...new Set(productMaster.filter(p=>p.supplier===sup && p.category===cat).map(p=>p.item_name))].filter(Boolean).sort();
    let itemSel = document.getElementById('edit-acc-item');
    itemSel.innerHTML = items.map(i => `<option value="${i}">${i}</option>`).join('');
    
    if(selectedItem && items.includes(selectedItem)) {
        itemSel.value = selectedItem;
    }
}

function closeEditAccModal() {
    let modal = document.getElementById('edit-acc-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// 💡 1. 딜레이 제거: 원본 데이터를 직접 뜯어고쳐서 0.001초 만에 화면에 반영!
function submitEditAccModal() {
    let idx = document.getElementById('edit-acc-idx').value;
    let group = currentAccGroupsByIndex[idx];
    if(!group) return;

    let newCat = document.getElementById('edit-acc-cat').value;
    let newItem = document.getElementById('edit-acc-item').value;
    let newQty = parseInt(document.getElementById('edit-acc-qty').value) || 0;
    let newDate = document.getElementById('edit-acc-date').value;
    let newPrice = parseFloat(document.getElementById('edit-acc-price').value) || 0;
    let newAdj = parseFloat(document.getElementById('edit-acc-adj').value) || 0;

    if(!newItem || newQty < 0 || !newDate) return alert("입력값을 확인해주세요.");

    let updatePayload = [];

    // 원본 데이터(globalHistory)를 직접 수정!
    group.ids.forEach((id, i) => {
        let h = globalHistory.find(x => x.id === id);
        if(h) {
            h.category = newCat;
            h.item_name = newItem;
            h.production_date = newDate;
            h.acc_price = newPrice;
            
            if(i === 0) {
                h.acc_qty = newQty;
                h.acc_adj = newAdj;
            } else {
                h.acc_qty = 0;
                h.acc_adj = 0;
            }
            updatePayload.push(h);
        }
    });

    closeEditAccModal();
    
    // 💡 화면 딜레이 제로! DB 다녀오기 전에 화면 먼저 즉시 렌더링
    renderAccounting(); 
    
    // 💡 DB는 백그라운드에서 조용히 업데이트 (기다리지 않음)
    updateHistoryToDB(updatePayload); 
}

// 💡 2. 딜레이 제거: 원본 데이터 즉시 확정 변경
function confirmAccGroup(idx) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    let group = currentAccGroupsByIndex[idx];
    let updatePayload = [];
    
    group.ids.forEach(id => {
        let h = globalHistory.find(x => x.id === id); // 원본 참조
        if(h) {
            h.acc_status = '확정';
            if (h.acc_qty === null || h.acc_qty === undefined) h.acc_qty = h.quantity;
            if (h.acc_price === null || h.acc_price === undefined) h.acc_price = getAccDefaultPrice(h.item_name, h.remarks);
            if (h.acc_adj === null || h.acc_adj === undefined) h.acc_adj = 0;
            
            updatePayload.push(h);
        }
    });

    // 💡 0.001초 만에 초록색 확정 뱃지 띄움
    renderAccounting(); 
    
    // 💡 기다림 없이 조용히 DB로 전송
    updateHistoryToDB(updatePayload); 
}

// 💡 3. 딜레이 제거: 원본 데이터 즉시 확정 취소
function cancelAccGroupConfirm(idx) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    let group = currentAccGroupsByIndex[idx];
    let updatePayload = [];
    
    group.ids.forEach(id => {
        let h = globalHistory.find(x => x.id === id); // 원본 참조
        if(h) { 
            h.acc_status = '미확정'; 
            updatePayload.push(h);
        }
    });
    
    // 💡 즉시 화면 원상복구
    renderAccounting(); 
    
    // 💡 기다림 없이 DB 통신
    updateHistoryToDB(updatePayload); 
}

// 💡 4. 딜레이 제거: 화면에서 즉시 삭제
function deleteAccGroup(idx) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    let group = currentAccGroupsByIndex[idx];
    if(!confirm(`해당 내역(총 ${group.ids.length}건 병합됨)을 완전히 삭제하시겠습니까?\n(연결된 렉의 실제 재고도 함께 차감됩니다)`)) return;
    
    // 💡 DB 통신 기다리지 않고 화면에서 먼저 삭제해버림
    globalHistory = globalHistory.filter(x => !group.ids.includes(x.id));
    renderAccounting(); 

    // 💡 DB 삭제 명령 발송
    group.ids.forEach(id => fetch(`/api/history/${id}`, { method: 'DELETE' }));
}

// 💡 5. 딜레이 제거: 일괄 확정 즉시 반영
function batchConfirmAccounting() {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    
    let unconfirmedItems = currentAccList.filter(h => h.acc_status !== '확정');
    if(unconfirmedItems.length === 0) return alert("현재 조회된 내역 중 미확정 건이 없습니다.");

    if(!confirm(`현재 조회된 목록 중 미확정 건(${unconfirmedItems.length}건)을 모두 '확정' 처리하시겠습니까?\n(확정 시 금액 수정이 잠깁니다)`)) return;

    let updatePayload = [];
    unconfirmedItems.forEach(h => {
        h.acc_status = '확정';
        if (h.acc_qty === null || h.acc_qty === undefined) h.acc_qty = h.quantity;
        if (h.acc_price === null || h.acc_price === undefined) h.acc_price = getAccDefaultPrice(h.item_name, h.remarks);
        if (h.acc_adj === null || h.acc_adj === undefined) h.acc_adj = 0;
        
        updatePayload.push(h);
    });

    // 💡 전체 리스트에 0.001초 만에 확정 뱃지 달아버림!
    renderAccounting(); 
    
    // 💡 백그라운드 DB 저장
    updateHistoryToDB(updatePayload); 
}

function exportAccountingExcel() {
    if (currentAccGroupsByIndex.length === 0) return alert("다운로드할 데이터가 없습니다.");
    
    let wsData = currentAccGroupsByIndex.map(g => {
        let total = (g.total_acc_qty * g.acc_price) + g.total_adj;
        return {
            "상태": g.isConfirmed ? '확정' : '미확정',
            "일자": g.hDate,
            "매입처": g.sup,
            "품목명": g.item_name,
            "수량(EA)": g.total_acc_qty,
            "단가(원)": g.acc_price,
            "조정액(원)": g.total_adj,
            "공급가액(합계)": total
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws['!cols'] = [{wch: 10}, {wch: 15}, {wch: 20}, {wch: 35}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 20}];
    XLSX.utils.book_append_sheet(wb, ws, "정산대조내역");
    
    let today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `한스팜_정산회계_명세서대조_${today}.xlsx`);
}
