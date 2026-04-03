// ==========================================
// [정산/회계] - 명세서 대조 및 확정 로직 (병합 처리 적용)
// ==========================================
let currentAccList = []; // 현재 필터링된 전체 내역
let currentAccGroupsByIndex = []; // 💡 동일 일자/업체/품목으로 병합된 리스트

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

// 💡 1. 화면 렌더링 (병합 로직 핵심)
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

    // 💡 모드 1: 개별 명세서 대조 (동일 일자/업체/제품은 1줄로 병합)
    if (group === 'individual') {
        thead.innerHTML = `
            <tr class="text-slate-600 text-xs">
                <th class="p-3 font-black text-center">상태</th>
                <th class="p-3 font-black">일자</th>
                <th class="p-3 font-black">매입처</th>
                <th class="p-3 font-black">품목명</th>
                <th class="p-3 font-black text-right text-indigo-700">총수량(EA) ✎</th>
                <th class="p-3 font-black text-right text-indigo-700">단가(원) ✎</th>
                <th class="p-3 font-black text-right text-indigo-700">조정액(원) ✎</th>
                <th class="p-3 font-black text-right text-blue-700">최종합계</th>
                <th class="p-3 font-black text-center text-rose-600 w-32">관리</th>
            </tr>`;

        // 💡 파레트별 데이터를 한 덩어리로 묶기 (Grouping)
        let groupedData = {};
        filtered.forEach(h => {
            let hDate = h.production_date || h.created_at.substring(0, 10);
            let sup = h.remarks || '기본입고처';
            let key = `${hDate}|${sup}|${h.item_name}`;

            if(!groupedData[key]) {
                groupedData[key] = {
                    key: key,
                    ids: [], // 이 그룹에 속한 실제 DB 기록 ID들
                    hDate: hDate,
                    sup: sup,
                    item_name: h.item_name,
                    total_acc_qty: 0,
                    acc_price: h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, sup),
                    total_adj: 0,
                    isConfirmed: true // 하나라도 미확정이면 false로 바뀜
                };
            }
            
            let g = groupedData[key];
            g.ids.push(h.id);
            g.total_acc_qty += (h.acc_qty !== undefined ? h.acc_qty : h.quantity);
            g.total_adj += (h.acc_adj || 0);
            if (h.acc_status !== '확정') g.isConfirmed = false;
        });

        currentAccGroupsByIndex = Object.values(groupedData).sort((a,b) => a.key.localeCompare(b.key));

        tbody.innerHTML = currentAccGroupsByIndex.map((g, idx) => {
            let total = (g.total_acc_qty * g.acc_price) + g.total_adj;

            let statusBadge = g.isConfirmed 
                ? `<span class="bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-1 rounded font-black text-[10px] shadow-sm">✅ 확정됨</span>` 
                : `<span class="bg-orange-100 text-orange-600 border border-orange-300 px-2 py-1 rounded font-black text-[10px] shadow-sm animate-pulse">⚠️ 미확정</span>`;
            
            let disabled = g.isConfirmed 
                ? 'disabled class="w-full bg-slate-100 text-slate-400 rounded p-1.5 text-right font-bold border border-transparent cursor-not-allowed text-xs"' 
                : 'class="w-full border-2 border-indigo-200 rounded p-1.5 text-right font-black text-indigo-700 outline-none focus:border-indigo-500 bg-indigo-50/50 hover:bg-white transition-colors text-xs"';
            
            let actionBtns = g.isConfirmed 
                ? `<button onclick="cancelAccGroupConfirm(${idx})" class="w-full text-slate-400 hover:text-slate-600 font-bold text-[10px] underline">확정 취소 풀기</button>` 
                : `<div class="flex space-x-1 justify-center">
                    <button onclick="confirmAccGroup(${idx})" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-1.5 rounded text-[10px] font-bold shadow-sm transition-colors">확정</button>
                    <button onclick="deleteAccGroup(${idx})" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200 py-1.5 rounded text-[10px] font-bold shadow-sm transition-colors">삭제</button>
                   </div>`;

            return `<tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors bg-white ${g.isConfirmed ? 'opacity-70 bg-slate-50' : ''}">
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-xs font-bold text-slate-600">${g.hDate}</td>
                <td class="p-3 text-xs font-black text-rose-600">${g.sup}</td>
                <td class="p-3 text-xs font-black text-slate-800">${g.item_name} <span class="text-[9px] text-slate-400 ml-1">(${g.ids.length}건 병합)</span></td>
                <td class="p-3 w-24"><input type="number" value="${g.total_acc_qty}" onchange="updateAccGroupField(${idx}, 'acc_qty', this.value)" ${disabled}></td>
                <td class="p-3 w-28"><input type="number" value="${g.acc_price}" onchange="updateAccGroupField(${idx}, 'acc_price', this.value)" ${disabled}></td>
                <td class="p-3 w-28"><input type="number" value="${g.total_adj}" placeholder="0" onchange="updateAccGroupField(${idx}, 'acc_adj', this.value)" ${disabled}></td>
                <td class="p-3 text-right font-black text-blue-700 text-sm" id="acc-total-${idx}">${total.toLocaleString()}</td>
                <td class="p-3 text-center align-middle">${actionBtns}</td>
            </tr>`;
        }).join('');
    } 
    // 💡 모드 2: 읽기 전용 그룹 요약 모드
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
            
            let qty = h.acc_qty !== undefined ? h.acc_qty : h.quantity;
            let price = h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, sup);
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

// 💡 2. 상단 요약 카드 업데이트 (확정 vs 미확정 분리)
function updateAccSummaryCards(list) {
    let confirmedSupply = 0;
    let unconfirmedTotal = 0;

    list.forEach(h => {
        let qty = h.acc_qty !== undefined ? h.acc_qty : h.quantity;
        let price = h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, h.remarks);
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

// 💡 3. 병합된 필드 수정 시 하위 파레트들에 값 자동 분배 저장
function updateAccGroupField(idx, field, value) {
    if(loginMode === 'viewer') return;
    let group = currentAccGroupsByIndex[idx];
    if(!group) return;
    
    let val = parseFloat(value) || 0;
    
    // 수량이나 조정액은 묶여있는 여러 파레트 중 '첫 번째 데이터'에 몰아서 저장하고 나머지는 0으로 만듦 (합산오류 방지)
    if (field === 'acc_qty') {
        group.ids.forEach((id, i) => {
            let h = globalHistory.find(x => x.id === id);
            if(h) h.acc_qty = (i === 0) ? val : 0;
        });
    } else if (field === 'acc_adj') {
        group.ids.forEach((id, i) => {
            let h = globalHistory.find(x => x.id === id);
            if(h) h.acc_adj = (i === 0) ? val : 0;
        });
    } else if (field === 'acc_price') {
        // 단가는 묶여있는 모든 파레트에 공통으로 똑같이 적용
        group.ids.forEach(id => {
            let h = globalHistory.find(x => x.id === id);
            if(h) h.acc_price = val;
        });
    }
    
    renderAccounting();
}

// 💡 4. 병합된 행 확정 처리 (하위 파레트 모두 확정)
function confirmAccGroup(idx) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    let group = currentAccGroupsByIndex[idx];
    group.ids.forEach(id => {
        let h = globalHistory.find(x => x.id === id);
        if(h) h.acc_status = '확정';
    });
    renderAccounting();
}

// 💡 5. 병합된 행 확정 취소
function cancelAccGroupConfirm(idx) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    let group = currentAccGroupsByIndex[idx];
    group.ids.forEach(id => {
        let h = globalHistory.find(x => x.id === id);
        if(h) h.acc_status = '미확정';
    });
    renderAccounting();
}

// 💡 6. 병합된 그룹 전체 삭제 (잘못 입고된 건)
async function deleteAccGroup(idx) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    let group = currentAccGroupsByIndex[idx];
    if(!confirm(`해당 내역(총 ${group.ids.length}건 병합됨)을 완전히 삭제하시겠습니까?\n(연결된 렉의 실제 재고도 함께 차감됩니다)`)) return;
    
    try {
        let promises = group.ids.map(id => fetch(`/api/history/${id}`, { method: 'DELETE' }));
        await Promise.all(promises);
        
        // 화면 즉시 반영
        globalHistory = globalHistory.filter(x => !group.ids.includes(x.id));
        renderAccounting();
        alert("삭제 완료");
    } catch(e) { alert("삭제 실패"); }
}

// 💡 7. 전체 일괄 확정 기능 (화면에 보이는 미확정 건 모두)
function batchConfirmAccounting() {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    
    let unconfirmedCount = currentAccList.filter(h => h.acc_status !== '확정').length;
    if(unconfirmedCount === 0) return alert("현재 조회된 내역 중 미확정 건이 없습니다.");

    if(!confirm(`현재 조회된 목록 중 미확정 건(${unconfirmedCount}건)을 모두 '확정' 처리하시겠습니까?\n(확정 시 금액 수정이 잠깁니다)`)) return;

    currentAccList.forEach(h => {
        if(h.acc_status !== '확정') h.acc_status = '확정';
    });

    renderAccounting();
    alert(`성공적으로 일괄 확정되었습니다!`);
}

// 💡 8. 엑셀 다운로드 (병합된 화면 그대로 다운로드)
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
