// ==========================================
// [출고관리] - 이력 조회 및 엑셀 출력
// ==========================================
function renderOutboundUI() {
    const start = document.getElementById('outbound-start').value;
    const end = document.getElementById('outbound-end').value;
    const tbody = document.getElementById('outbound-history-list');
    if(!tbody) return;

    let history = globalHistory.filter(h => h.action_type === '출고');
    if(start && end) {
        history = history.filter(h => {
            let d = h.created_at.substring(0, 10);
            return d >= start && d <= end;
        });
    }

    if(history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">출고 이력이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = history.map(h => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-3 text-slate-500">${new Date(h.created_at).toLocaleString()}</td>
            <td class="p-3 font-black text-slate-800">${h.item_name}</td>
            <td class="p-3 text-slate-500">${h.category || '미분류'}</td>
            <td class="p-3 text-right font-bold text-rose-600">${h.quantity.toLocaleString()} EA</td>
            <td class="p-3 font-bold text-slate-600">${h.location_id}</td>
            <td class="p-3 text-center"><span class="bg-rose-100 text-rose-700 px-2 py-1 rounded text-[10px] font-bold">출고완료</span></td>
        </tr>
    `).join('');
}

function exportOutboundExcel() {
    const tbody = document.getElementById('outbound-history-list');
    if(!tbody || tbody.innerText.includes('이력이 없습니다')) return alert("조회된 데이터가 없습니다.");
    let wsData = [];
    tbody.querySelectorAll('tr').forEach(tr => {
        let cols = tr.querySelectorAll('td');
        wsData.push({ "출고일시": cols[0].innerText, "품목명": cols[1].innerText, "카테고리": cols[2].innerText, "수량": cols[3].innerText, "출고지": cols[4].innerText });
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "출고이력");
    XLSX.writeFile(wb, `한스팜_출고이력_${new Date().toISOString().split('T')[0]}.xlsx`);
}
