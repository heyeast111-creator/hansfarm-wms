// ==========================================
// [품목관리] - 상단 탭 전환 로직
// ==========================================
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
    } catch(e) { console.error("Product Tab Error:", e); }
}

// ==========================================
// [품목관리] - 제품 및 자재 마스터 (조회, 등록, 수정, 엑셀)
// ==========================================
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
    } catch(e){ console.error("Filter Populate Error:", e); }
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
            let rowBg = isEditing ? 'bg-yellow-100 border-2 border-yellow-400' : 'hover:bg-slate-50 border-b border-slate-100 bg-white';
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
    } catch(e){ console.error("Render Product Error:", e); }
}

function editProductSetup(cat, name, supplier, usage, price, ea, targetType) { 
    editingProductOriginalName = name; editingProductOriginalSupplier = supplier; 
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    document.getElementById(`${prefix}-cat`).value = cat; document.getElementById(`${prefix}-name`).value = name; document.getElementById(`${prefix}-supplier`).value = supplier; document.getElementById(`${prefix}-usage`).value = usage; document.getElementById(`${prefix}-price`).value = price; document.getElementById(`${prefix}-pallet-ea`).value = ea || 1; 
    document.getElementById(`${prefix}-form-title`).innerText = "기존 항목 수정 중"; document.getElementById(`${prefix}-submit-btn`).innerText = "저장하기"; document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-indigo-600', 'bg-emerald-600'); document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-indigo-700', 'hover:bg-emerald-700'); document.getElementById(`${prefix}-cancel-btn`).classList.remove('hidden'); 
    renderProductMaster(targetType); 
}

function cancelEdit(targetType) { 
    editingProductOriginalName = null; editingProductOriginalSupplier = null; 
    const prefix = targetType === 'finished' ? 'fp' : 'pm'; const title = targetType === 'finished' ? '신규 완제품 추가' : '신규 자재 추가';
    document.getElementById(`${prefix}-cat`).value = ''; document.getElementById(`${prefix}-name`).value = ''; document.getElementById(`${prefix}-supplier`).value = ''; document.getElementById(`${prefix}-usage`).value = '0'; document.getElementById(`${prefix}-price`).value = '0'; document.getElementById(`${prefix}-pallet-ea`).value = '1'; 
    document.getElementById(`${prefix}-form-title`).innerText = title; document.getElementById(`${prefix}-submit-btn`).innerText = "등록하기"; document.getElementById(`${prefix}-submit-btn`).classList.replace('bg-emerald-600', 'bg-indigo-600'); document.getElementById(`${prefix}-submit-btn`).classList.replace('hover:bg-emerald-700', 'hover:bg-indigo-700'); document.getElementById(`${prefix}-cancel-btn`).classList.add('hidden'); 
    renderProductMaster(targetType);
}

// 💡 수정됨: 낙관적 UI 업데이트 적용 (클릭 즉시 화면부터 반영)
async function submitProduct(targetType) { 
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 사용할 수 없습니다.");
    const prefix = targetType === 'finished' ? 'fp' : 'pm';
    const cat = document.getElementById(`${prefix}-cat`).value.trim(); 
    const name = document.getElementById(`${prefix}-name`).value.trim(); 
    const supplier = document.getElementById(`${prefix}-supplier`).value.trim() || (targetType==='finished'?'자체생산':'기본입고처'); 
    const usage = parseInt(document.getElementById(`${prefix}-usage`).value) || 0; 
    const price = parseInt(document.getElementById(`${prefix}-price`).value) || 0; 
    const ea = parseInt(document.getElementById(`${prefix}-pallet-ea`).value) || 1; 
    
    if(!cat || !name) return alert("카테고리와 이름은 필수입니다."); 
    const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
    let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster;

    try { 
        if(editingProductOriginalName) { 
            // ⚡ 1. 화면 즉시 반영 (낙관적 업데이트)
            let idx = dataArray.findIndex(p => p.item_name === editingProductOriginalName && p.supplier === editingProductOriginalSupplier);
            if(idx !== -1) {
                dataArray[idx] = { category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea };
            }
            alert("수정 완료"); 
            cancelEdit(targetType); // 렌더링 호출 포함됨
            updateBomDropdowns();

            // ⚡ 2. 백엔드 통신 (비동기)
            await fetch(`${endpoint}?old_name=${encodeURIComponent(editingProductOriginalName)}&old_supplier=${encodeURIComponent(editingProductOriginalSupplier)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
        } else { 
            // ⚡ 1. 화면 즉시 반영 (낙관적 업데이트)
            dataArray.push({ category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea });
            alert("등록 완료"); 
            document.getElementById(`${prefix}-name`).value = ''; 
            document.getElementById(`${prefix}-supplier`).value = ''; 
            populateProductFilters(targetType);
            renderProductMaster(targetType);
            updateBomDropdowns();

            // ⚡ 2. 백엔드 통신 (비동기)
            await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({category: cat, item_name: name, supplier: supplier, daily_usage: usage, unit_price: price, pallet_ea: ea}) }); 
        } 
        // 약간의 딜레이 후 백엔드 데이터와 최종 완벽 동기화
        setTimeout(() => { load(); }, 300);
    } catch(e) { alert("서버 통신 실패"); } 
}

// 💡 수정됨: 삭제 시 낙관적 UI 업데이트 적용
async function deleteProduct(name, supplier, targetType) { 
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 삭제할 수 없습니다.");
    if(!confirm(`[${name} - ${supplier}] 항목을 개별 삭제하시겠습니까?`)) return; 
    
    // ⚡ 1. 화면 즉시 반영
    let dataArray = targetType === 'finished' ? finishedProductMaster : productMaster;
    let idx = dataArray.findIndex(p => p.item_name === name && p.supplier === supplier);
    if(idx !== -1) dataArray.splice(idx, 1);
    
    populateProductFilters(targetType);
    renderProductMaster(targetType);
    updateBomDropdowns();

    const endpoint = targetType === 'finished' ? '/api/finished_products' : '/api/products';
    try { 
        // ⚡ 2. 백엔드 통신
        await fetch(`${endpoint}?item_name=${encodeURIComponent(name)}&supplier=${encodeURIComponent(supplier)}`, { method: 'DELETE' }); 
        setTimeout(() => { load(); }, 300); 
    } catch(e) {} 
}

async function deleteAllProducts(targetType) { 
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 일괄 삭제할 수 없습니다.");
    const msg = targetType === 'finished' ? "제품" : "자재";
    if(!confirm(`정말 모든 ${msg} 마스터를 일괄 삭제하시겠습니까?`)) return; 
    const pw = prompt("관리자 비밀번호를 입력하세요:"); if(pw !== "123456789*") return alert("틀렸습니다."); 
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
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 사용할 수 없습니다.");
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

// ==========================================
// [품목관리] - BOM 레시피 관리 (이름+카테고리 종속 드롭다운 및 기등록 제외)
// ==========================================
function updateBomDropdowns() {
    try {
        // 1. 완제품 카테고리 세팅 (이미 BOM 있는 건 제외하기 위한 준비)
        const existingBOMs = new Set(bomMaster.map(b => b.finished_product));
        const availableFinishedProducts = finishedProductMaster.filter(p => !existingBOMs.has(p.item_name));

        const fCats = [...new Set(availableFinishedProducts.map(p => p.category))].filter(Boolean).sort();
        const fCatOptions = `<option value="ALL">전체 카테고리</option>` + fCats.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        
        const fCatSelect = document.getElementById('bom-finished-cat');
        if(fCatSelect) {
            fCatSelect.innerHTML = fCatOptions;
            updateBomFinishedDropdown(); 
        }

        // 2. 자재 카테고리 세팅 (자재는 제한 없음)
        const mCats = [...new Set(productMaster.map(p => p.category))].filter(Boolean).sort();
        const catOptions = `<option value="ALL">전체 카테고리</option>` + mCats.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        
        const catSelect = document.getElementById('bom-material-cat');
        if(catSelect) {
            catSelect.innerHTML = catOptions;
            updateBomMaterialDropdown(); 
        }
    } catch(e){ console.error(e); }
}

// 1번 항목: 완제품 카테고리에 맞춰 제품 드롭다운 필터링 (기등록 제품 제외)
function updateBomFinishedDropdown() {
    try {
        const cat = document.getElementById('bom-finished-cat').value;
        const existingBOMs = new Set(bomMaster.map(b => b.finished_product));
        
        let filtered = finishedProductMaster.filter(p => !existingBOMs.has(p.item_name));
        if (cat !== 'ALL') filtered = filtered.filter(p => p.category === cat);
        
        let fList = [];
        let fSet = new Set();
        filtered.forEach(p => {
            let key = (p.category || '미분류') + "|" + p.item_name;
            if(!fSet.has(key) && p.item_name) { fSet.add(key); fList.push(p); }
        });
        fList.sort((a, b) => a.item_name.localeCompare(b.item_name));

        const fOptions = fList.length > 0 
            ? fList.map(p => `<option value="${p.item_name}" data-cat="${p.category || '미분류'}">[${p.category || '미분류'}] ${p.item_name}</option>`).join('') 
            : `<option value="">선택 가능한(미등록) 제품이 없습니다</option>`;
        
        let finSelect = document.getElementById('bom-finished');
        if(finSelect) finSelect.innerHTML = fOptions; 
    } catch(e){ console.error(e); }
}

// 3번 항목: 자재 카테고리에 맞춰 자재 드롭다운 필터링
function updateBomMaterialDropdown() {
    try {
        const cat = document.getElementById('bom-material-cat').value;
        let filtered = productMaster;
        
        if (cat !== 'ALL') filtered = productMaster.filter(p => p.category === cat);
        
        let mList = [];
        let mSet = new Set();
        filtered.forEach(p => {
            let key = (p.category || '미분류') + "|" + p.item_name;
            if(!mSet.has(key) && p.item_name) { mSet.add(key); mList.push(p); }
        });
        mList.sort((a, b) => a.item_name.localeCompare(b.item_name));
        
        const mOptions = mList.map(p => `<option value="${p.item_name}" data-cat="${p.category || '미분류'}">[${p.category || '미분류'}] ${p.item_name}</option>`).join('');
        
        const matSelect = document.getElementById('bom-material');
        if(matSelect) matSelect.innerHTML = mOptions || `<option value="">해당 카테고리에 자재가 없습니다</option>`;
    } catch(e){ console.error(e); }
}

function addMaterialToBomCart() {
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 불가능합니다.");
    const matSelect = document.getElementById('bom-material');
    
    if(!matSelect || matSelect.selectedIndex === -1 || !matSelect.value) return alert("자재를 선택해주세요.");
    
    const matOpt = matSelect.options[matSelect.selectedIndex];
    const matName = matOpt.value;
    const matCat = matOpt.getAttribute('data-cat');
    
    if(bomCart.find(b => b.material === matName && b.category === matCat)) {
        return alert("이미 조립 목록에 추가된 자재입니다.");
    }
    
    bomCart.push({ category: matCat, material: matName, qty: 1, type: 'per_item' });
    renderBomCart();
}

function removeMaterialFromBomCart(index) {
    bomCart.splice(index, 1);
    renderBomCart();
}

function updateBomCartQty(index, val) {
    bomCart[index].qty = parseFloat(val) || 0;
}

function updateBomCartType(index, val) {
    bomCart[index].type = val;
}

function renderBomCart() {
    const container = document.getElementById('bom-cart-list');
    if(bomCart.length === 0) {
        container.innerHTML = `<div class="text-center text-slate-400 text-xs py-4 font-bold">위에서 구성품을 추가해주세요</div>`;
        return;
    }
    container.innerHTML = bomCart.map((item, idx) => `
        <div class="flex justify-between items-center bg-white p-2 border border-slate-200 rounded shadow-sm transition-all hover:border-emerald-300">
            <span class="text-[11px] md:text-xs font-black text-slate-700 truncate w-4/12" title="[${item.category}] ${item.material}">[${item.category}] ${item.material}</span>
            <div class="flex items-center space-x-1 w-8/12 justify-end">
                <input type="number" step="0.1" value="${item.qty}" onchange="updateBomCartQty(${idx}, this.value)" class="w-14 border-2 border-emerald-200 rounded p-1 text-[11px] md:text-xs text-right font-black outline-none focus:border-emerald-500 text-emerald-700">
                <select onchange="updateBomCartType(${idx}, this.value)" class="border border-slate-300 rounded p-1 text-[10px] md:text-[11px] font-bold bg-slate-50 outline-none text-slate-600">
                    <option value="per_item" ${item.type === 'per_item' ? 'selected' : ''}>개 소모 (기본)</option>
                    <option value="per_box" ${item.type === 'per_box' ? 'selected' : ''}>개 묶음포장 (1개 소모)</option>
                </select>
                <button onclick="removeMaterialFromBomCart(${idx})" class="text-rose-500 hover:bg-rose-100 px-1.5 py-0.5 rounded font-black text-xs ml-1">X</button>
            </div>
        </div>
    `).join('');
}

async function submitBomCart() {
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 불가능합니다.");
    const finSelect = document.getElementById('bom-finished');
    if(!finSelect || finSelect.selectedIndex === -1) return alert("기준 완제품을 선택해주세요.");

    const finOpt = finSelect.options[finSelect.selectedIndex];
    const finName = finOpt.value;
    const finCat = finOpt.getAttribute('data-cat');
    
    if(!finName) return alert("기준 완제품을 선택해주세요.");
    if(bomCart.length === 0) return alert("레시피 구성품을 하나 이상 추가해주세요.");

    for(let i=0; i<bomCart.length; i++) {
        if(bomCart[i].qty <= 0) return alert(`[${bomCart[i].material}]의 수량을 0보다 크게 입력하세요.`);
        
        if(finName === bomCart[i].material && finCat === bomCart[i].category) {
            return alert("완제품과 완벽히 동일한(이름과 카테고리가 같은) 자재를 구성품으로 넣을 수 없습니다!");
        }
    }

    try {
        // ⚡ 낙관적 업데이트를 위해 UI에 즉시 추가할 임시 데이터
        let tempId = 'temp-' + Date.now();
        bomCart.forEach(item => {
            let finalQty = item.type === 'per_box' ? 1 / item.qty : item.qty;
            finalQty = Math.round(finalQty * 10000) / 10000;
            bomMaster.push({ id: tempId, finished_product: finName, material_product: item.material, require_qty: finalQty });
        });
        
        renderBomMaster();
        updateBomDropdowns();
        bomCart = []; 
        renderBomCart();

        let promises = bomCart.map(item => {
            let finalQty = item.type === 'per_box' ? 1 / item.qty : item.qty;
            finalQty = Math.round(finalQty * 10000) / 10000;
            return fetch('/api/bom', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ finished_product: finName, material_product: item.material, require_qty: finalQty }) });
        });
        
        await Promise.all(promises); 
        alert("레시피 일괄 등록 완료!");
        setTimeout(() => { load(); }, 300); 

    } catch(e) { alert("서버 통신 실패"); }
}

function toggleBomRow(fpName) {
    expandedBomRows[fpName] = !expandedBomRows[fpName];
    renderBomMaster();
}

function renderBomMaster() {
    try {
        const tbody = document.getElementById('bom-list');
        if(!tbody) return;
        if(bomMaster.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-slate-400 font-bold">등록된 레시피가 없습니다.</td></tr>`; return; }

        bomMaster.sort((a, b) => a.finished_product.localeCompare(b.finished_product));

        let grouped = {};
        bomMaster.forEach(b => {
            if(!grouped[b.finished_product]) grouped[b.finished_product] = [];
            grouped[b.finished_product].push(b);
        });

        let html = '';
        Object.keys(grouped).sort().forEach(fp => {
            let items = grouped[fp];
            let isOpen = expandedBomRows[fp];

            html += `
            <tr class="hover:bg-indigo-50 transition-colors cursor-pointer border-b border-slate-300 bg-slate-100" onclick="toggleBomRow('${fp}')">
                <td colspan="4" class="p-3 font-black text-emerald-800 text-sm shadow-sm">
                    <div class="flex justify-between items-center">
                        <span>📦 ${fp} <span class="text-[11px] font-bold text-slate-500 ml-2 bg-white px-2 py-0.5 rounded border border-slate-200">총 ${items.length}개 자재</span></span>
                        <span class="text-xs text-slate-500 bg-white px-2 py-1 rounded-full shadow-inner border border-slate-200">${isOpen ? '접기 🔼' : '펼치기 🔽'}</span>
                    </div>
                </td>
            </tr>`;

            if(isOpen) {
                items.forEach(b => {
                    let delBtn = isAdmin ? `<button onclick="deleteBom('${b.id}')" class="text-rose-500 hover:bg-rose-100 px-2 py-1 rounded transition-colors text-[10px] font-black shadow-sm border border-rose-200 bg-white">삭제</button>` : '';
                    html += `
                    <tr class="hover:bg-slate-50 transition-colors bg-white">
                        <td class="p-3 pl-8 text-slate-400 font-black border-b border-slate-100">↳</td>
                        <td class="p-3 font-bold text-indigo-800 text-xs md:text-sm border-b border-slate-100">${b.material_product}</td>
                        <td class="p-3 text-right font-black text-slate-700 text-xs md:text-sm border-b border-slate-100">${b.require_qty} <span class="text-[10px] font-normal text-slate-500">EA</span></td>
                        <td class="p-3 text-center border-b border-slate-100">${delBtn}</td>
                    </tr>`;
                });
            }
        });

        tbody.innerHTML = html;
    } catch(e){ console.error("Render BOM Error:", e); }
}

async function deleteBom(id) { 
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 삭제할 수 없습니다.");
    if(!confirm("이 레시피 연결을 삭제하시겠습니까?")) return; 
    
    // ⚡ 낙관적 UI
    let idx = bomMaster.findIndex(b => String(b.id) === String(id));
    if(idx !== -1) bomMaster.splice(idx, 1);
    renderBomMaster();
    updateBomDropdowns();

    try { 
        await fetch(`/api/bom?id=${id}`, { method: 'DELETE' }); 
        setTimeout(() => { load(); }, 300); 
    } catch(e) {} 
}

// 💡 엑셀 업로드 관련
function exportBomExcel() {
    let wsData = bomMaster.length === 0 ? [{"완제품명": "", "부자재명": "", "소요수량(EA)": ""}] : bomMaster.map(b => ({"완제품명": b.finished_product, "부자재명": b.material_product, "소요수량(EA)": b.require_qty}));
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData); ws['!cols'] = [{wch: 25}, {wch: 25}, {wch: 15}]; XLSX.utils.book_append_sheet(wb, ws, "BOM마스터"); XLSX.writeFile(wb, "한스팜_BOM레시피_양식.xlsx");
}

function importBomExcel(e) {
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 사용할 수 없습니다.");
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
