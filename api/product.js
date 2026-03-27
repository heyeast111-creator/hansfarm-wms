function switchProductTab(tab) {
    try {
        ['fp', 'pm', 'bom'].forEach(t => {
            let btn = document.getElementById(`tab-btn-${t}`); let view = document.getElementById(`subview-${t}`); let btns = document.getElementById(`${t}-header-btns`);
            if(btn) btn.className = "whitespace-nowrap text-lg md:text-2xl font-black text-slate-400 hover:text-slate-600 pb-1 px-2 transition-colors";
            if(view) { view.classList.add('hidden'); view.style.display = 'none'; }
            if(btns) { btns.classList.add('hidden'); btns.style.display = 'none'; }
        });

        let activeBtn = document.getElementById(`tab-btn-${tab}`); let activeView = document.getElementById(`subview-${tab}`); let activeBtns = document.getElementById(`${tab}-header-btns`);

        if(activeBtn) {
            activeBtn.className = "whitespace-nowrap text-lg md:text-2xl font-black text-indigo-700 border-b-4 border-indigo-700 pb-1 px-2 transition-colors";
            if(tab === 'bom') { activeBtn.classList.replace('text-indigo-700', 'text-emerald-700'); activeBtn.classList.replace('border-indigo-700', 'border-emerald-700'); }
        }
        if(activeView) { activeView.classList.remove('hidden'); activeView.style.display = (tab === 'fp' || tab === 'pm') ? 'grid' : 'flex'; }
        if(activeBtns) { activeBtns.classList.remove('hidden'); activeBtns.style.display = 'flex'; }

        if(tab === 'fp') renderProductMaster('finished');
        if(tab === 'pm') renderProductMaster('materials');
        if(tab === 'bom') { updateBomDropdowns(); renderBomMaster(); }
    } catch(e) {}
}

function populateProductFilters(targetType) {
    try {
        let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster;
        let prefix = targetType === 'finished' ? 'fp' : 'pm';
        let filterCat = document.getElementById(`${prefix}-filter-cat`); let filterSup = document.getElementById(`${prefix}-filter-sup`);
        if(!filterCat || !filterSup) return;
        
        let curCat = filterCat.value; let curSup = filterSup.value;
        let cats = [...new Set(dataArray.map(p => p.category))].filter(Boolean).sort();
        let sups = [...new Set(dataArray.map(p => p.supplier))].filter(Boolean).sort();

        filterCat.innerHTML = `<option value="ALL">전체 카테고리</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
        filterSup.innerHTML = `<option value="ALL">전체 ${targetType==='finished'?'생산처':'입고처'}</option>` + sups.map(s => `<option value="${s}">${s}</option>`).join('');
        
        if(cats.includes(curCat)) filterCat.value = curCat;
        if(sups.includes(curSup)) filterSup.value = curSup;
    } catch(e){}
}

function renderProductMaster(targetType) { 
    try {
        const prefix = targetType === 'finished' ? 'fp' : 'pm';
        const searchInput = document.getElementById(`${prefix}-search`);
        const filterCatEl = document.getElementById(`${prefix}-filter-cat`);
        const filterSupEl = document.getElementById(`${prefix}-filter-sup`);
        if(!filterCatEl || !filterSupEl) return;
        
        const filterCat = filterCatEl.value; const filterSup = filterSupEl.value; const keyword = searchInput ? searchInput.value.toLowerCase().trim() : '';
        let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster;
        
        let filtered = dataArray.filter(p => {
            let matchCat = filterCat === 'ALL' || p.category === filterCat;
            let matchSup = filterSup === 'ALL' || p.supplier === filterSup;
            let matchKw = !keyword || (p.item_name||"").toLowerCase().includes(keyword);
            return matchCat && matchSup && matchKw;
        });

        const listHtml = filtered.map(p => { 
            let isEditing = (editingProductOriginalName === p.item_name && editingProductOriginalSupplier === p.supplier);
            let rowBg = isEditing ? 'bg-yellow-100 border-2 border-yellow-400' : 'hover:bg-slate-50 border-b border-slate-100';
            let delBtn = isAdmin ? `<button onclick="deleteProduct('${p.item_name}', '${p.supplier}', '${targetType}')" class="text-rose-500 hover:bg-rose-100 px-2 py-1 rounded transition-colors text-xs font-bold">삭제</button>` : ''; 
            let badgeColor = targetType === 'finished' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600';
            
            return `<tr class="transition-colors ${rowBg}">
                <td class="p-2 md:p-3"><span class="text-[10px] ${badgeColor} px-2 py-1 rounded-md font-bold shadow-sm">${p.category}</span></td>
                <td class="p-2 md:p-3 font-black text-slate-800 text-xs md:text-sm">${p.item_name}</td>
                <td class="p-2 md:p-3 font-bold text-rose-600 text-[10px] md:text-xs bg-rose-50 rounded px-2">${p.supplier}</td>
                <td class="p-2 md:p-3 text-right font-black text-indigo-600 text-xs md:text-sm bg-indigo-50 rounded">${p.pallet_ea.toLocaleString()} <span class="text-[10px] font-normal text-slate-500">EA/P</span></td>
                <td class="p-2 md:p-3 text-right text-[10px] text-slate-500 font-bold"><span class="block text-slate-400">일 ${p.daily_usage.toLocaleString()}개</span><span class="block text-slate-700">${p.unit_price.toLocaleString()}원</span></td>
                <td class="p-2 md:p-3 text-center flex justify-center space-x-1 items-center h-full pt-3">
                    <button onclick="editProductSetup('${p.category}', '${p.item_name}', '${p.supplier}', ${p.daily_usage}, ${p.unit_price}, ${p.pallet_ea}, '${targetType}')" class="text-blue-600 bg-blue-50 hover:bg-blue-200 px-2 py-1 rounded shadow-sm transition-colors text-xs font-bold">수정</button>
                    ${delBtn}
                </td>
            </tr>`; 
        }).join(''); 
        
        const tbodyId = targetType === 'finished' ? 'fp-list' : 'pm-list'; 
        const tbody = document.getElementById(tbodyId);
        if(tbody) { 
            if(filtered.length > 0) tbody.innerHTML = listHtml; 
            else tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">검색 결과가 없습니다.</td></tr>`; 
        }
    } catch(e){}
}

function editProductSetup(cat, name, supplier, usage, price, ea, targetType) { 
    editingProductOriginalName = name; editingProductOriginalSupplier = supplier; 
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    document.getElementById(`${prefix}-cat`).value = cat; document.getElementById(`${prefix}-name`).value = name; document.getElementById(`${prefix}-supplier`).value = supplier; document.getElementById(`${prefix}-usage`).value = usage; document.getElementById(`${prefix}-price`).value = price; document.getElementById(`${prefix}-pallet-ea`).value = ea || 1; 
    document.getElementById(`${prefix}-form-title`).innerText = "기존 항목 수정 중 ✏️"; document.getElementById(`${prefix}-submit-btn`).innerText = "✅ 저장하기"; document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-indigo-600', 'bg-emerald-600'); document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-indigo-700', 'hover:bg-emerald-700'); document.getElementById(`${prefix}-cancel-btn`).classList.remove('hidden'); 
    renderProductMaster(targetType); 
}

function cancelEdit(targetType) { 
    editingProductOriginalName = null; editingProductOriginalSupplier = null; 
    const prefix = targetType === 'finished' ? 'fp' : 'pm'; const title = targetType === 'finished' ? '신규 완제품 추가' : '신규 자재 추가';
    document.getElementById(`${prefix}-cat`).value = ''; document.getElementById(`${prefix}-name`).value = ''; document.getElementById(`${prefix}-supplier`).value = ''; document.getElementById(`${prefix}-usage`).value = '0'; document.getElementById(`${prefix}-price`).value = '0'; document.getElementById(`${prefix}-pallet-ea`).value = '1'; 
    document.getElementById(`${prefix}-form-title`).innerText = title; document.getElementById(`${prefix}-submit-btn`).innerText = "등록하기"; document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-emerald-600', 'bg-indigo-600'); document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-emerald-700', 'hover:bg-indigo-700'); document.getElementById(`${prefix}-cancel-btn`).classList.add('hidden'); 
    renderProductMaster(targetType);
}

async function submitProduct(targetType) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    const cat = document.getElementById(`${prefix}-cat`).value.trim(); const name = document.getElementById(`${prefix}-name`).value.trim(); const supplier = document.getElementById(`${prefix}-supplier`).value.trim() || (targetType==='finished'?'자체생산':'기본입고처'); const usage = parseInt(document.getElementById(`${prefix}-usage`).value) || 0; const price = parseInt(document.getElementById(`${prefix}-price`).value) || 0; const ea = parseInt(document.getElementById(`${prefix}-pallet-ea`).value) || 1; 
    if(!cat || !name) return alert("카테고리와 이름은 필수입니다."); 
    const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
    try { 
        if(editingProductOriginalName) { 
            await fetch(`${endpoint}?old_name=${encodeURIComponent(editingProductOriginalName)}&old_supplier=${encodeURIComponent(editingProductOriginalSupplier)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
            alert("수정 완료"); cancelEdit(targetType);
        } else { 
            await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
            alert("등록 완료"); document.getElementById(`${prefix}-name`).value = ''; document.getElementById(`${prefix}-supplier`).value = ''; 
        } 
        await load();
    } catch(e) { alert("서버 통신 실패"); } 
}

async function deleteProduct(name, supplier, targetType) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 삭제할 수 없습니다.");
    if(!confirm(`[${name} - ${supplier}] 항목을 개별 삭제하시겠습니까?`)) return; 
    const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
    try { await fetch(`${endpoint}?item_name=${encodeURIComponent(name)}&supplier=${encodeURIComponent(supplier)}`, { method: 'DELETE' }); await load(); } catch(e) {} 
}

async function deleteAllProducts(targetType) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 삭제할 수 없습니다.");
    const msg = targetType === 'finished' ? "제품" : "자재";
    if(!confirm(`⚠️ 정말 모든 ${msg} 마스터를 일괄 삭제하시겠습니까?`)) return; 
    const pw = prompt("관리자 비밀번호(1234) 입력:"); if(pw !== "1234") return alert("틀렸습니다."); 
    const endpoint = targetType === 'finished' ? '/api/finished_products_all' : '/api/products_all';
    try { await fetch(endpoint, { method: 'DELETE' }); alert("일괄 삭제 완료!"); await load(); } catch(e) { alert("삭제 실패!"); } 
}

function exportProductsExcel(targetType) { 
    try { 
        let wsData = []; let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster; let sheetName = targetType === 'finished' ? "제품마스터" : "자재마스터"; let fileName = targetType === 'finished' ? "한스팜_제품마스터_양식.xlsx" : "한스팜_자재마스터_양식.xlsx";
        if (dataArray.length === 0) { wsData = [{ "카테고리": "", "품목명": "", "입고처(공급사)": "", "일간소모량(EA)": "0", "단가(비용)": "0", "1P기준수량(EA)": "1" }]; } 
        else { wsData = dataArray.map(p => ({ "카테고리": p.category || "미분류", "품목명": p.item_name || "", "입고처(공급사)": p.supplier || "", "일간소모량(EA)": p.daily_usage || 0, "단가(비용)": p.unit_price || 0, "1P기준수량(EA)": p.pallet_ea || 1 })); } 
        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, sheetName); XLSX.writeFile(wb, fileName); 
    } catch (error) { alert("다운로드 중 오류"); } 
}

function importProductsExcel(e, targetType) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); 
    const endpoint = targetType === 'finished' ? '/api/finished_products_batch' : '/api/products_batch';
    const msg = targetType === 'finished' ? "제품" : "자재";
    reader.onload = async function(ev) { 
        try { 
            const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); 
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); 
            if(json.length > 0) { 
                await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); 
                alert(`${msg} 대량 업로드 완료!`); await load();
            } else { alert("업로드할 데이터가 없습니다."); }
        } catch(err) { console.error(err); alert("업로드 처리 중 오류 발생: 엑셀 양식을 다시 확인해주세요."); } 
    }; reader.readAsArrayBuffer(file); e.target.value = ''; 
}

function renderBomMaster() {
    try {
        const tbody = document.getElementById('bom-list');
        if(!tbody) return;
        if(bomMaster.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-slate-400 font-bold">등록된 레시피가 없습니다.</td></tr>`; return; }
        bomMaster.sort((a, b) => a.finished_product.localeCompare(b.finished_product));
        tbody.innerHTML = bomMaster.map(b => {
            let delBtn = isAdmin ? `<button onclick="deleteBom('${b.id}')" class="text-rose-500 hover:bg-rose-100 px-2 py-1 rounded transition-colors text-xs font-bold">삭제</button>` : '';
            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="p-2 border-b border-slate-100 font-black text-emerald-800 text-xs md:text-sm">${b.finished_product}</td>
                <td class="p-2 border-b border-slate-100 text-center text-slate-400">➡️</td>
                <td class="p-2 border-b border-slate-100 font-bold text-indigo-800 text-xs md:text-sm">${b.material_product}</td>
                <td class="p-2 border-b border-slate-100 text-right font-black text-slate-700 text-xs md:text-sm">${b.require_qty} <span class="text-[10px] font-normal text-slate-500">EA</span></td>
                <td class="p-2 border-b border-slate-100 text-center">${delBtn}</td>
            </tr>`;
        }).join('');
    } catch(e){}
}

function exportBomExcel() {
    let wsData = bomMaster.length === 0 ? [{"완제품명": "", "부자재명": "", "소요수량(EA)": ""}] : bomMaster.map(b => ({"완제품명": b.finished_product, "부자재명": b.material_product, "소요수량(EA)": b.require_qty}));
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 25}, {wch: 25}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, "BOM마스터"); XLSX.writeFile(wb, "한스팜_BOM레시피_양식.xlsx");
}

function importBomExcel(e) {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
    reader.onload = async function(ev) {
        try {
            const data = new Uint8Array(ev.target.result); const workbook = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if(json.length > 0) { 
                await fetch('/api/bom_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) }); 
                alert("BOM 대량 업로드 완료!"); await load(); 
            }
        } catch(err) { alert("업로드 처리 중 오류 발생"); }
    }; reader.readAsArrayBuffer(file); e.target.value = '';
}

function updateBomDropdowns() {
    try {
        const fNames = [...new Set(finishedProductMaster.map(p => p.item_name))].filter(Boolean).sort();
        const mNames = [...new Set(productMaster.map(p => p.item_name))].filter(Boolean).sort();
        const fOptions = fNames.length > 0 ? fNames.map(name => `<option value="${name}">${name}</option>`).join('') : `<option value="">[제품 마스터]에 제품을 등록해주세요</option>`;
        const mOptions = mNames.length > 0 ? mNames.map(name => `<option value="${name}">${name}</option>`).join('') : `<option value="">[자재 마스터]에 자재를 등록해주세요</option>`;
        document.getElementById('bom-finished').innerHTML = fOptions; document.getElementById('bom-material').innerHTML = mOptions;
    } catch(e){}
}

async function submitBom() {
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 사용할 수 없습니다.");
    const finished = document.getElementById('bom-finished').value; const material = document.getElementById('bom-material').value; const qty = parseFloat(document.getElementById('bom-qty').value);
    if(!finished || !material || isNaN(qty) || qty <= 0) return alert("입력값을 확인해주세요.");
    if(finished === material) return alert("완제품과 자재가 같을 수 없습니다!");
    try { 
        await fetch('/api/bom', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ finished_product: finished, material_product: material, require_qty: qty }) }); 
        alert("레시피 연결 완료!"); document.getElementById('bom-qty').value = 1; await load();
    } catch(e) { alert("서버 통신 실패"); }
}

async function deleteBom(id) { 
    if(loginMode === 'viewer') return alert("👁️ 뷰어 모드에서는 삭제할 수 없습니다.");
    if(!confirm("이 레시피 연결을 삭제하시겠습니까?")) return; 
    try { await fetch(`/api/bom?id=${id}`, { method: 'DELETE' }); await load(); } catch(e) { alert("삭제 실패"); } 
}
