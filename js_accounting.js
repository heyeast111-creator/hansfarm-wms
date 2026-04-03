// ==========================================
// [정산/회계] - 명세서 대조 및 확정 로직
// ==========================================
let currentAccList = []; // 현재 필터링된 화면의 입고 내역 리스트

function toggleAccDateInput() {
    let type = document.getElementById('acc-type').value;
    document.getElementById('acc-date').classList.toggle('hidden', type !== 'date');
    document.getElementById('acc-period-wrapper').classList.toggle('hidden', type !== 'period');
    document.getElementById('acc-month').classList.toggle('hidden', type !== 'month');
    
    // 스타일을 위한 flex 처리
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

// 💡 1. 화면 렌더링 및 모드 전환 (개별 대조 vs 그룹 요약)
function renderAccounting() {
    let type = document.getElementById('acc-type').value;
    let date = document.getElementById('acc-date').value;
    let start = document.getElementById('acc-period-start').value;
    let end = document.getElementById('acc-period-end').value;
    let month = document.getElementById('acc-month').value;
    let supplier = document.getElementById('acc-supplier').value;
    let item = document.getElementById('acc-item').value;
    let group = document.getElementById('acc-group').value;

    // '입고' 내역만 필터링
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

    // 💡 모드 1: 개별 명세서 대조 (수정 및 확정 가능)
    if (group === 'individual') {
        thead.innerHTML = `
            <tr class="text-slate-600 text-xs">
                <th class="p-3 font-black text-center">상태</th>
                <th class="p-3 font-black">일자</th>
                <th class="p-3 font-black">매입처</th>
                <th class="p-3 font-black">품목명</th>
                <th class="p-3 font-black text-right text-indigo-700">수량(EA) ✎</th>
                <th class="p-3 font-black text-right text-indigo-700">단가(원) ✎</th>
                <th class="p-3 font-black text-right text-indigo-700">조정액(원) ✎</th>
                <th class="p-3 font-black text-right text-blue-700">최종합계</th>
                <th class="p-3 font-black text-center text-rose-600 w-32">관리</th>
            </tr>`;

        tbody.innerHTML = filtered.map(h => {
            let hDate = h.production_date || h.created_at.substring(0, 10);
            let sup = h.remarks || '기본입고처';
            let isConfirmed = h.acc_status === '확정';
            
            // 저장된 정산 데이터가 없으면 기본값(history 수량 및 마스터 단가) 사용
            let qty = h.acc_qty !== undefined ? h.acc_qty : h.quantity;
            let price = h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, sup);
            let adj = h.acc_adj || 0;
            let total = (qty * price) + adj;

            let statusBadge = isConfirmed 
                ? `<span class="bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-1 rounded font-black text-[10px] shadow-sm">✅ 확정됨</span>` 
                : `<span class="bg-orange-100 text-orange-600 border border-orange-300 px-2 py-1 rounded font-black text-[10px] shadow-sm animate-pulse">⚠️ 미확정</span>`;
            
            let disabled = isConfirmed 
                ? 'disabled class="w-full bg-slate-100 text-slate-400 rounded p-1.5 text-right font-bold border border-transparent cursor-not-allowed text-xs"' 
                : 'class="w-full border-2 border-indigo-200 rounded p-1.5 text-right font-black text-indigo-700 outline-none focus:border-indigo-500 bg-indigo-50/50 hover:bg-white transition-colors text-xs"';
            
            let actionBtns = isConfirmed 
                ? `<button onclick="cancelAccConfirm('${h.id}')" class="w-full text-slate-400 hover:text-slate-600 font-bold text-[10px] underline">확정 취소 풀기</button>` 
                : `<div class="flex space-x-1 justify-center">
                    <button onclick="confirmAccRow('${h.id}')" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-1.5 rounded text-[10px] font-bold shadow-sm transition-colors">확정</button>
                    <button onclick="deleteAccRow('${h.id}')" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200 py-1.5 rounded text-[10px] font-bold shadow-sm transition-colors">삭제</button>
                   </div>`;

            return `<tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors bg-white ${isConfirmed ? 'opacity-70 bg-slate-50' : ''}">
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-xs font-bold text-slate-600">${hDate}</td>
                <td class="p-3 text-xs font-black text-rose-600">${sup}</td>
                <td class="p-3 text-xs font-black text-slate-800">${h.item_name}</td>
                <td class="p-3 w-24"><input type="number" value="${qty}" onchange="updateAccField('${h.id}', 'acc_qty', this.value)" ${disabled}></td>
                <td class="p-3 w-28"><input type="number" value="${price}" onchange="updateAccField('${h.id}', 'acc_price', this.value)" ${disabled}></td>
                <td class="p-3 w-28"><input type="number" value="${adj}" placeholder="0" onchange="updateAccField('${h.id}', 'acc_adj', this.value)" ${disabled}></td>
                <td class="p-3 text-right font-black text-blue-700 text-sm" id="acc-total-${h.id}">${total.toLocaleString()}</td>
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
                <th class="p-3 font-black text-right">총 확정 합계(원)</th>
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

// 💡 3. 입력 필드 수정 시 실시간 계산 및 가상 저장
async function updateAccField(id, field, value) {
    if(loginMode === 'viewer') return;
    let h = globalHistory.find(x => x.id === id);
    if(!h) return;
    
    h[field] = parseFloat(value) || 0; // 로컬 객체 업데이트
    
    // 해당 줄 합계 재계산
    let qty = h.acc_qty !== undefined ? h.acc_qty : h.quantity;
    let price = h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, h.remarks);
    let adj = h.acc_adj || 0;
    let total = (qty * price) + adj;
    
    let totalEl = document.getElementById(`acc-total-${id}`);
    if(totalEl) totalEl.innerText = total.toLocaleString();

    // 상단 카드 업데이트
    updateAccSummaryCards(currentAccList);

    // [참고] 원래는 여기서 백엔드로 fetch('/api/history_update') 를 쏴야 하지만, 
    // python에 해당 api가 없으므로 화면단에서만 임시 저장되도록 처리합니다.
}

// 💡 4. 개별 행 확정 처리
async function confirmAccRow(id) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    let h = globalHistory.find(x => x.id === id);
    if(h) {
        h.acc_status = '확정';
        // [참고] 백엔드 연동 영역
        renderAccounting();
    }
}

// 💡 5. 확정 취소 처리
async function cancelAccConfirm(id) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    let h = globalHistory.find(x => x.id === id);
    if(h) {
        h.acc_status = '미확정';
        renderAccounting();
    }
}

// 💡 6. 가짜 입고건 개별 삭제
async function deleteAccRow(id) {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    if(!confirm("이 입고 내역을 완전히 삭제하시겠습니까? (렉 재고도 함께 차감됩니다)")) return;
    
    try {
        await fetch(`/api/history/${id}`, { method: 'DELETE' });
        // 로컬 배열에서도 제거하여 즉시 반영
        globalHistory = globalHistory.filter(x => x.id !== id);
        renderAccounting();
        alert("삭제 완료");
    } catch(e) { alert("삭제 실패"); }
}

// 💡 7. 전체 일괄 확정 기능
async function batchConfirmAccounting() {
    if(loginMode === 'viewer') return alert("뷰어 불가");
    
    let unconfirmedCount = currentAccList.filter(h => h.acc_status !== '확정').length;
    if(unconfirmedCount === 0) return alert("현재 조회된 내역 중 미확정 건이 없습니다.");

    if(!confirm(`현재 조회된 목록 중 미확정 건(${unconfirmedCount}건)을 모두 '확정' 처리하시겠습니까?\n(확정 시 금액 수정이 잠깁니다)`)) return;

    currentAccList.forEach(h => {
        if(h.acc_status !== '확정') h.acc_status = '확정';
    });

    renderAccounting();
    alert(`총 ${unconfirmedCount}건 일괄 확정 완료!`);
}

function exportAccountingExcel() {
    if (currentAccList.length === 0) return alert("다운로드할 데이터가 없습니다.");
    
    let wsData = currentAccList.map(h => {
        let sup = h.remarks || '기본입고처';
        let qty = h.acc_qty !== undefined ? h.acc_qty : h.quantity;
        let price = h.acc_price !== undefined ? h.acc_price : getAccDefaultPrice(h.item_name, sup);
        let adj = h.acc_adj || 0;
        let total = (qty * price) + adj;

        return {
            "상태": h.acc_status === '확정' ? '확정' : '미확정',
            "일자": h.production_date || h.created_at.substring(0, 10),
            "매입처": sup,
            "품목명": h.item_name,
            "수량(EA)": qty,
            "단가(원)": price,
            "조정액(원)": adj,
            "공급가액(합계)": total
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws['!cols'] = [{wch: 10}, {wch: 15}, {wch: 20}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 20}];
    XLSX.utils.book_append_sheet(wb, ws, "정산내역");
    
    let today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `한스팜_정산회계_${today}.xlsx`);
}

// ==========================================
// [정산/회계] - 초기화 연동 (다른 곳에서 사용됨)
// ==========================================
// 초기 렌더링용 빈 함수 (필요 시 채움)
