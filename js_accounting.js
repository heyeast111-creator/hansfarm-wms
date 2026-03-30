// ==========================================
// [대시보드] - 통계 및 차트 업데이트
// ==========================================
function updateDashboard() { 
    try {
        let dashPeriod = document.getElementById('dash-period');
        const period = dashPeriod ? dashPeriod.value : 'daily'; 
        
        let dashCostLabel = document.getElementById('dash-cost-label');
        if(dashCostLabel) {
            if(period === 'daily') dashCostLabel.innerText = "일간 기준";
            else if(period === 'weekly') dashCostLabel.innerText = "주간 기준";
            else if(period === 'monthly') dashCostLabel.innerText = "월간 기준";
        }

        let startDate = new Date(); 
        startDate.setHours(0,0,0,0);
        if(period === 'daily') startDate.setDate(startDate.getDate() - 1); 
        else if(period === 'weekly') startDate.setDate(startDate.getDate() - 7); 
        else if(period === 'monthly') startDate.setMonth(startDate.getMonth() - 1); 
        
        let productionCost = 0; 
        let allItems = [...finishedProductMaster, ...productMaster];
        
        globalHistory.forEach(log => { 
            if (!log) return;
            if (log.action_type === '삭제(취소)') return;
            
            let logDateStr = log.production_date || log.created_at;
            if (!logDateStr) return;
            let logDate = new Date(logDateStr);
            
            if(logDate >= startDate) { 
                let qty = parseInt(log.quantity) || 0;
                if(log.action_type === '출고') { 
                    let pInfo = allItems.find(p => String(p.item_name||"").trim() === String(log.item_name||"").trim() && String(p.supplier||"").trim() === String(log.remarks||"").trim()); 
                    if(!pInfo) pInfo = allItems.find(p => String(p.item_name||"").trim() === String(log.item_name||"").trim());
                    if(pInfo) productionCost += ((parseFloat(pInfo.unit_price) || 0) * qty); 
                } 
            } 
        }); 
        
        let dashCostOut = document.getElementById('dash-cost-out'); 
        if(dashCostOut) dashCostOut.innerText = productionCost.toLocaleString() + ' 원'; 
        
        let totalRoom = 0, occRoom = 0, valRoom = 0; 
        let totalCold = 0, occCold = 0, valCold = 0;
        let totalFloor = 0, occFloor = 0, valFloor = 0;
        
        globalOccupancy.forEach(item => { 
            if (!item) return;
            let dynP = getDynamicPalletCount(item); 
            let pInfo = allItems.find(prod => String(prod.item_name||"").trim() === String(item.item_name||"").trim() && String(prod.supplier||"").trim() === String(item.remarks||"").trim()); 
            if(!pInfo) pInfo = allItems.find(prod => String(prod.item_name||"").trim() === String(item.item_name||"").trim()); 
            
            let val = pInfo ? (parseFloat(pInfo.unit_price) || 0) * (parseInt(item.quantity) || 0) : 0; 
            let loc = String(item.location_id || "");
            
            if(loc.startsWith('R-') || loc.startsWith('K')) { occRoom += dynP; valRoom += val; } 
            else if(loc.startsWith('C-') || loc.startsWith('I')) { occCold += dynP; valCold += val; } 
            else if(loc.startsWith('FL-')) { occFloor += dynP; valFloor += val; }
        }); 
        
        layoutRoom.forEach(col => { if(col.cols) totalRoom += col.cols * 2; }); totalRoom += 20; 
        layoutCold.forEach(col => { if(col.cols) totalCold += col.cols * 2; }); totalCold += 16; 
        
        let f1Cols = parseInt(localStorage.getItem('FL-1F_cols')) || 20;
        let f2Cols = parseInt(localStorage.getItem('FL-2F_cols')) || 20;
        let f3Cols = parseInt(localStorage.getItem('FL-3F_cols')) || 20;
        totalFloor = f1Cols + f2Cols + f3Cols;

        let roomCapRate = totalRoom > 0 ? Math.round((occRoom / totalRoom) * 100) : 0;
        let dRoom = document.getElementById('dash-room-donut');
        if(dRoom) dRoom.style.background = `conic-gradient(${roomCapRate > 100 ? '#ea580c' : '#f97316'} 0% ${Math.min(roomCapRate, 100)}%, #e2e8f0 ${Math.min(roomCapRate, 100)}% 100%)`;
        let pRoom = document.getElementById('dash-room-percent'); if(pRoom) pRoom.innerText = roomCapRate + '%';
        let tRoom = document.getElementById('dash-room-total'); if(tRoom) tRoom.innerText = totalRoom;
        let oRoom = document.getElementById('dash-room-occ'); if(oRoom) oRoom.innerText = occRoom.toFixed(1);
        let eRoom = document.getElementById('dash-room-empty'); if(eRoom) eRoom.innerText = Math.max(0, totalRoom - Math.floor(occRoom));

        let coldCapRate = totalCold > 0 ? Math.round((occCold / totalCold) * 100) : 0;
        let dCold = document.getElementById('dash-cold-donut');
        if(dCold) dCold.style.background = `conic-gradient(${coldCapRate > 100 ? '#4f46e5' : '#6366f1'} 0% ${Math.min(coldCapRate, 100)}%, #e2e8f0 ${Math.min(coldCapRate, 100)}% 100%)`;
        let pCold = document.getElementById('dash-cold-percent'); if(pCold) pCold.innerText = coldCapRate + '%';
        let tCold = document.getElementById('dash-cold-total'); if(tCold) tCold.innerText = totalCold;
        let oCold = document.getElementById('dash-cold-occ'); if(oCold) oCold.innerText = occCold.toFixed(1);
        let eCold = document.getElementById('dash-cold-empty'); if(eCold) eCold.innerText = Math.max(0, totalCold - Math.floor(occCold));

        let floorCapRate = totalFloor > 0 ? Math.round((occFloor / totalFloor) * 100) : 0;
        let dFloor = document.getElementById('dash-floor-donut');
        if(dFloor) dFloor.style.background = `conic-gradient(${floorCapRate > 100 ? '#059669' : '#10b981'} 0% ${Math.min(floorCapRate, 100)}%, #e2e8f0 ${Math.min(floorCapRate, 100)}% 100%)`;
        let pFloor = document.getElementById('dash-floor-percent'); if(pFloor) pFloor.innerText = floorCapRate + '%';
        let tFloor = document.getElementById('dash-floor-total'); if(tFloor) tFloor.innerText = totalFloor;
        let oFloor = document.getElementById('dash-floor-occ'); if(oFloor) oFloor.innerText = occFloor.toFixed(1);
        let eFloor = document.getElementById('dash-floor-empty'); if(eFloor) eFloor.innerText = Math.max(0, totalFloor - Math.floor(occFloor));
        
        let vRoomVal = document.getElementById('dash-val-room'); if(vRoomVal) vRoomVal.innerText = valRoom.toLocaleString() + ' 원'; 
        let vColdVal = document.getElementById('dash-val-cold'); if(vColdVal) vColdVal.innerText = valCold.toLocaleString() + ' 원'; 
        let vFloorVal = document.getElementById('dash-val-floor'); if(vFloorVal) vFloorVal.innerText = valFloor.toLocaleString() + ' 원'; 
        let vTotal = document.getElementById('dash-val-total'); if(vTotal) vTotal.innerText = (valRoom + valCold + valFloor).toLocaleString() + ' 원'; 
    } catch(e) { console.error("Dashboard Error:", e); }
}

// ==========================================
// [정산/회계] - 필터, 삭제, 렌더링, 엑셀 로직
// ==========================================
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

async function deleteAccountingRecord(idsStr, itemName) {
    if(!isAdmin) return alert("관리자 권한이 필요합니다.");
    const pw = prompt(`[${itemName}] 정산 내역 삭제\n보안을 위해 관리자 비밀번호를 다시 입력하세요:`);
    if(pw !== "123456789*") return alert("비밀번호가 틀렸습니다.");
    if(!confirm(`해당 입고/정산 내역을 정말 삭제하시겠습니까?\n(해당 일자에 묶인 동일 품목 전체가 삭제되며, 복구할 수 없습니다)`)) return;

    try {
        let ids = idsStr.split(',');
        let promises = ids.map(id => fetch(`/api/history/${id}`, { method: 'DELETE' }));
        await Promise.all(promises);
        alert("정산 내역 삭제 완료!");
        await load();
    } catch(e) {
        alert("삭제 중 오류가 발생했습니다.");
    }
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

        let totalSupply = 0, totalTax = 0, totalSum = 0; let html = '';

        if(groupMode === 'daily_item') {
            let dailyGroups = {};
            filtered.forEach(h => {
                let hDate = h.production_date ? h.production_date : h.created_at.substring(0, 10);
                let hSup = h.remarks || '기본입고처';
                let key = `${hDate}|${hSup}|${h.item_name}`;

                if (!dailyGroups[key]) {
                    dailyGroups[key] = {
                        date: hDate,
                        supplier: hSup,
                        item_name: h.item_name,
                        quantity: 0,
                        ids: [] // 여러 건일 경우 모두 담음
                    };
                }
                dailyGroups[key].quantity += h.quantity;
                dailyGroups[key].ids.push(h.id);
            });

            let consolidated = Object.values(dailyGroups);
            consolidated.sort((a,b) => new Date(b.date) - new Date(a.date));

            let currentDate = '';
            consolidated.forEach((h, i) => {
                let pInfo = allItems.find(p => String(p.item_name||'').trim() === String(h.item_name||'').trim() && String(p.supplier||'').trim() === String(h.supplier||'').trim()) || allItems.find(p => String(p.item_name||'').trim() === String(h.item_name||'').trim());
                
                let price = pInfo ? (parseFloat(pInfo.unit_price) || 0) : 0;
                let supply = price * h.quantity; let tax = Math.floor(supply * 0.1); let sum = supply + tax;
                totalSupply += supply; totalTax += tax; totalSum += sum;
                
                if (currentDate !== h.date) {
                    html += `<tr class="bg-slate-200 border-y-2 border-slate-300"><td colspan="9" class="p-2 font-black text-slate-800 text-xs md:text-sm">일자: ${h.date}</td></tr>`;
                    currentDate = h.date;
                }
                
                let idsStr = h.ids.join(',');
                let delBtn = isAdmin ? `<button onclick="deleteAccountingRecord('${idsStr}', '${h.item_name}')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-2 py-1 rounded text-[10px] font-bold transition-colors">삭제</button>` : '';

                html += `<tr class="bg-white border-b border-slate-100 hover:bg-indigo-50 transition-colors">
                    <td class="p-1.5 md:p-2 text-slate-400 text-[10px] text-center">-</td>
                    <td class="p-1.5 md:p-2 font-bold text-slate-700 text-[11px] md:text-xs truncate max-w-[100px]">${h.supplier}</td>
                    <td class="p-1.5 md:p-2 font-black text-slate-800 text-[11px] md:text-xs truncate max-w-[120px]">${h.item_name}</td>
                    <td class="p-1.5 md:p-2 text-right font-bold text-indigo-600 text-[11px] md:text-xs">${h.quantity.toLocaleString()}</td>
                    <td class="p-1.5 md:p-2 text-right text-slate-500 text-[10px] md:text-[11px]">${price.toLocaleString()}</td>
                    <td class="p-1.5 md:p-2 text-right font-black text-slate-700 text-[11px] md:text-xs">${supply.toLocaleString()}</td>
                    <td class="p-1.5 md:p-2 text-right font-bold text-rose-500 text-[10px] md:text-[11px]">${tax.toLocaleString()}</td>
                    <td class="p-1.5 md:p-2 text-right font-black text-blue-700 text-[11px] md:text-xs">${sum.toLocaleString()}</td>
                    <td class="p-1.5 md:p-2 text-center">${delBtn}</td>
                </tr>`;
            });
        } else {
            let groupAggr = {};
            filtered.forEach(h => {
                let hDate = h.production_date ? h.production_date : h.created_at.substring(0, 10);
                let hSup = h.remarks || '기본입고처';
                let key = groupMode === 'supplier' ? hSup : h.item_name; 
                let subKey = groupMode === 'supplier' ? h.item_name : hSup;
                
                let pInfo = allItems.find(p => String(p.item_name||'').trim() === String(h.item_name||'').trim() && String(p.supplier||'').trim() === String(hSup).trim());
                if(!pInfo) pInfo = allItems.find(p => String(p.item_name||'').trim() === String(h.item_name||'').trim());
                
                let price = pInfo ? (parseFloat(pInfo.unit_price) || 0) : 0;
                let supply = price * h.quantity; let tax = Math.floor(supply * 0.1); let sum = supply + tax;

                if(!groupAggr[key]) groupAggr[key] = { totalQty: 0, totalSupply: 0, totalTax: 0, totalSum: 0, details: {} };
                groupAggr[key].totalQty += h.quantity; groupAggr[key].totalSupply += supply; groupAggr[key].totalTax += tax; groupAggr[key].totalSum += sum;
                if(!groupAggr[key].details[subKey]) groupAggr[key].details[subKey] = { qty: 0, supply: 0 };
                groupAggr[key].details[subKey].qty += h.quantity; groupAggr[key].details[subKey].supply += supply;
            });

            for(let key in groupAggr) {
                let g = groupAggr[key]; totalSupply += g.totalSupply; totalTax += g.totalTax; totalSum += g.totalSum;
                html += `<tr class="bg-indigo-100 border-b-2 border-indigo-200"><td colspan="3" class="p-2 font-black text-indigo-900 text-xs md:text-sm">[${key}] 누적 요약</td><td class="p-2 text-right font-black text-indigo-700 text-[11px] md:text-xs">${g.totalQty.toLocaleString()}</td><td class="p-2 text-right">-</td><td class="p-2 text-right font-black text-slate-800 text-[11px] md:text-xs">${g.totalSupply.toLocaleString()}</td><td class="p-2 text-right font-bold text-rose-600 text-[11px] md:text-xs">${g.totalTax.toLocaleString()}</td><td class="p-2 text-right font-black text-blue-800 text-[11px] md:text-xs">${g.totalSum.toLocaleString()}</td><td class="p-2"></td></tr>`;
                
                for(let subKey in g.details) {
                    let d = g.details[subKey]; let dTax = Math.floor(d.supply * 0.1); let dSum = d.supply + dTax; let displaySup = groupMode === 'supplier' ? key : subKey; let displayItem = groupMode === 'item' ? key : subKey;
                    html += `<tr class="bg-white border-b border-slate-100 opacity-90"><td class="p-1.5 md:p-2 text-center text-[10px] text-slate-400">상세항목</td><td class="p-1.5 md:p-2 font-bold text-slate-600 text-[10px] md:text-[11px]">${displaySup}</td><td class="p-1.5 md:p-2 font-bold text-slate-600 text-[10px] md:text-[11px]">${displayItem}</td><td class="p-1.5 md:p-2 text-right font-bold text-indigo-500 text-[10px] md:text-[11px]">${d.qty.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right text-slate-400 text-[9px]">-</td><td class="p-1.5 md:p-2 text-right text-slate-600 text-[10px] md:text-[11px]">${d.supply.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right text-rose-400 text-[10px] md:text-[11px]">${dTax.toLocaleString()}</td><td class="p-1.5 md:p-2 text-right font-bold text-blue-600 text-[10px] md:text-[11px]">${dSum.toLocaleString()}</td><td class="p-1.5 md:p-2"></td></tr>`;
                }
            }
        }
        document.getElementById('acc-list').innerHTML = html || `<tr><td colspan="9" class="p-10 text-center text-slate-400 font-bold">해당 조건에 내역이 없습니다.</td></tr>`; 
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
