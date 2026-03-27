function toggleAccDateInput() {
    let type = document.getElementById('acc-type').value;
    document.getElementById('acc-date').classList.add('hidden');
    document.getElementById('acc-period-wrapper').classList.add('hidden');
    document.getElementById('acc-period-wrapper').classList.remove('flex');
    document.getElementById('acc-month').classList.add('hidden');

    if(type === 'date') { document.getElementById('acc-date').classList.remove('hidden'); } 
    else if(type === 'period') { document.getElementById('acc-period-wrapper').classList.remove('hidden'); document.getElementById('acc-period-wrapper').classList.add('flex'); } 
    else if(type === 'month') { document.getElementById('acc-month').classList.remove('hidden'); }
}

function isAccDateMatch(hDate) {
    let type = document.getElementById('acc-type').value;
    if (type === 'date') {
        let target = document.getElementById('acc-date').value;
        if(!target) return false;
        return hDate === target;
    } else if (type === 'period') {
        let start = document.getElementById('acc-period-start').value;
        let end = document.getElementById('acc-period-end').value;
        if (!start || !end) return false;
        return hDate >= start && hDate <= end;
    } else if (type === 'month') {
        let target = document.getElementById('acc-month').value;
        if(!target) return false;
        return hDate.substring(0, 7) === target;
    }
    return false;
}

function updateAccFilters(changedFilter) {
    try {
        let inboundLog = globalHistory.filter(h => {
            if(h.action_type !== '입고') return false;
            let hDate = h.production_date ? h.production_date : h.created_at.substring(0, 10);
            return isAccDateMatch(hDate);
        });

        let supSelect = document.getElementById('acc-supplier'); 
        let itemSelect = document.getElementById('acc-item');
        let curSup = supSelect.value;
        let curItem = itemSelect.value;

        if (changedFilter === 'date' || changedFilter === 'type') {
            let suppliers = [...new Set(inboundLog.map(h => h.remarks || '기본입고처'))].sort();
            supSelect.innerHTML = `<option value="ALL">전체 매입처</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join('');
            if(suppliers.includes(curSup)) supSelect.value = curSup; else supSelect.value = 'ALL';
            curSup = supSelect.value;
        }

        if (changedFilter === 'date' || changedFilter === 'type' || changedFilter === 'supplier') {
            let itemLog = inboundLog;
            if (curSup !== 'ALL') { itemLog = itemLog.filter(h => (h.remarks || '기본입고처') === curSup); }
            let items = [...new Set(itemLog.map(h => h.item_name))].sort();
            itemSelect.innerHTML = `<option value="ALL">전체 품목</option>` + items.map(s => `<option value="${s}">${s}</option>`).join('');
            if(items.includes(curItem)) itemSelect.value = curItem; else itemSelect.value = 'ALL';
        }
        renderAccounting();
    } catch(e) { console.error("Filter Update Error:", e); }
}

function renderAccounting() { 
    try {
        const selectedSup = document.getElementById('acc-supplier').value;
        const selectedItem = document.getElementById('acc-item').value;
        const groupMode = document.getElementById('acc-group').value;

        let inboundLog = globalHistory.filter(h => h.action_type === '입고');
        let allItems = [...finishedProductMaster, ...productMaster];

        let filtered = inboundLog.filter(h => {
            let hDate = h.production_date ? h.production_date : h.created_at.substring(0, 10);
            let matchDate = isAccDateMatch(hDate);
            let matchSup = selectedSup === 'ALL' || (h.remarks || '기본입고처') === selectedSup;
            let matchItem = selectedItem === 'ALL' || h.item_name === selectedItem;
            return matchDate && matchSup && matchItem;
        });

        let groupedLog = {};
        filtered.forEach(h => {
            let hDate = h.production_date ? h.production_date : h.created_at.substring(0, 10);
            let hSup = h.remarks || '기본입고처';
            let hItem = h.item_name;
            let key = `${hDate}|${hSup}|${hItem}`;
            
            if(!groupedLog[key]) { groupedLog[key] = { date: hDate, supplier: hSup, item_name: hItem, quantity: 0 }; }
            groupedLog[key].quantity += h.quantity;
        });

        let consolidated = Object.values(groupedLog);
        consolidated.sort((a,b) => new Date(b.date) - new Date(a.date));

        let totalSupply = 0, totalTax = 0, totalSum = 0; let html = '';

        if(groupMode === 'list') {
            html = consolidated.map((h, i) => {
                let pInfo = allItems.find(p => String(p.item_name).trim() === String(h.item_name).trim() && String(p.supplier).trim() === String(h.supplier).trim());
                let price = pInfo ? pInfo.unit_price : 0;
                let supply = price * h.quantity; let tax = Math.floor(supply * 0.1); let sum = supply + tax;
                totalSupply += supply; totalTax += tax; totalSum += sum;
                let bgClass = i % 2 === 0 ? 'bg-white' : 'bg-slate-50'; 
                
                return `<tr class="${bgClass} border-b border-slate-200 hover:bg-indigo-50 transition-colors"><td class="p-1.5 md:p-2 text-slate-500 text-[10px] md:text-[11px] whitespace-nowrap">${h.date}</td><td class="p-1.5 md:p-2 font-bold text-slate-700 text-[11px] md:text-xs truncate max-w-[100px]">${h.supplier}</td><td class="p-1.5 md:p-2 font-black text-slate-800 text-[11px] md:text-xs truncate max-w-[120px]">${h.item_name}</td><td class="p-1.5 md:p-2 text-right font-bold text-indigo-600 text-[11px] md:text-xs">${h.quantity.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right text-slate-500 text-[10px] md:text-[11px]">${price.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-black text-slate-700 text-[11px] md:text-xs">${supply.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-bold text-rose-500 text-[10px] md:text-[11px]">${tax.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-black text-blue-700 text-[11px] md:text-xs">${sum.toLocaleString()}</td></tr>`;
            }).join('');
        } else {
            let groupAggr = {};
            consolidated.forEach(h => {
                let key = groupMode === 'supplier' ? h.supplier : h.item_name; let subKey = groupMode === 'supplier' ? h.item_name : h.supplier;
                let pInfo = allItems.find(p => String(p.item_name).trim() === String(h.item_name).trim() && String(p.supplier).trim() === String(h.supplier).trim());
                let price = pInfo ? pInfo.unit_price : 0;
                let supply = price * h.quantity; let tax = Math.floor(supply * 0.1); let sum = supply + tax;

                if(!groupAggr[key]) groupAggr[key] = { totalQty: 0, totalSupply: 0, totalTax: 0, totalSum: 0, details: {} };
                groupAggr[key].totalQty += h.quantity; groupAggr[key].totalSupply += supply; groupAggr[key].totalTax += tax; groupAggr[key].totalSum += sum;
                if(!groupAggr[key].details[subKey]) groupAggr[key].details[subKey] = { qty: 0, supply: 0 };
                groupAggr[key].details[subKey].qty += h.quantity; groupAggr[key].details[subKey].supply += supply;
            });

            for(let key in groupAggr) {
                let g = groupAggr[key]; totalSupply += g.totalSupply; totalTax += g.totalTax; totalSum += g.totalSum;
                html += `<tr class="bg-indigo-100 border-b-2 border-indigo-200"><td colspan="3" class="p-2 font-black text-indigo-900 text-xs md:text-sm">📁 [${key}] 누적 요약</td><td class="p-2 text-right font-black text-indigo-700 text-[11px] md:text-xs">${g.totalQty.toLocaleString()}</td><td class="p-2 text-right">-</td><td class="p-2 text-right font-black text-slate-800 text-[11px] md:text-xs">${g.totalSupply.toLocaleString()}</td><td class="p-2 text-right font-bold text-rose-600 text-[11px] md:text-xs">${g.totalTax.toLocaleString()}</td><td class="p-2 text-right font-black text-blue-800 text-[11px] md:text-xs">${g.totalSum.toLocaleString()}</td></tr>`;
                
                for(let subKey in g.details) {
                    let d = g.details[subKey]; let dTax = Math.floor(d.supply * 0.1); let dSum = d.supply + dTax; let displaySup = groupMode === 'supplier' ? key : subKey; let displayItem = groupMode === 'item' ? key : subKey;
                    html += `<tr class="bg-white border-b border-slate-100 opacity-90"><td class="p-1.5 md:p-2 text-center text-[10px] text-slate-400">↳ 상세항목</td><td class="p-1.5 md:p-2 font-bold text-slate-600 text-[10px] md:text-[11px]">${displaySup}</td><td class="p-1.5 md:p-2 font-bold text-slate-600 text-[10px] md:text-[11px]">${displayItem}</td><td class="p-1.5 md:p-2 text-right font-bold text-indigo-500 text-[10px] md:text-[11px]">${d.qty.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right text-slate-400 text-[9px]">-</td><td class="p-1.5 md:p-2 text-right text-slate-600 text-[10px] md:text-[11px]">${d.supply.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right text-rose-400 text-[10px] md:text-[11px]">${dTax.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-bold text-blue-600 text-[10px] md:text-[11px]">${dSum.toLocaleString()}</td></tr>`;
                }
            }
        }
        document.getElementById('acc-list').innerHTML = html || `<tr><td colspan="8" class="p-10 text-center text-slate-400 font-bold">해당 조건에 내역이 없습니다.</td></tr>`; 
        document.getElementById('acc-supply').innerText = totalSupply.toLocaleString() + ' 원'; document.getElementById('acc-tax').innerText = totalTax.toLocaleString() + ' 원'; document.getElementById('acc-total').innerText = totalSum.toLocaleString() + ' 원'; 
    } catch(e) { console.error(e); }
}

function exportAccountingExcel() {
    try {
        const table = document.getElementById('accounting-table');
        if(!table) return alert("다운로드할 표가 없습니다.");
        const wb = XLSX.utils.table_to_book(table, {sheet: "정산내역"});
        let today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `한스팜_정산회계_${today}.xlsx`);
    } catch (error) { console.error(error); alert("엑셀 다운로드 중 오류가 발생했습니다."); }
}
