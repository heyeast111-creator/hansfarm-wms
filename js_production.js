// ==========================================
// [생산관리] - 장바구니 기반 생산 및 실시간 현장 재고 차감
// ==========================================
let currentProductionBOM = []; 
let productionCart = [];       

const prodObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.classList.contains('flex')) {
            initProductionView();
            renderProductionCart();
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const prodView = document.getElementById('view-production');
    if(prodView) prodObserver.observe(prodView, { attributes: true, attributeFilter: ['class'] });
});

function initProductionView() {
    let fpSelect = document.getElementById('prod-finished-item');
    if(!fpSelect) return;
    let bomFpNames = [...new Set(bomMaster.map(b => b.finished_product))].sort();
    if (bomFpNames.length === 0) {
        fpSelect.innerHTML = `<option value="">BOM을 먼저 등록해주세요</option>`;
        return;
    }
    let html = '';
    bomFpNames.forEach(fp => {
        let pInfo = finishedProductMaster.find(p => p.item_name === fp);
        html += `<option value="${fp}">[${pInfo ? pInfo.category : '미분류'}] ${fp}</option>`;
    });
    fpSelect.innerHTML = html;
}

// 💡 [버그 수정] 버튼 누르는 순간 무조건 최신 DB 다시 끌고 옴
async function calculateProductionBOM() {
    await load(); // ⭐ 무조건 최신 데이터 강제 동기화
    
    let fpName = document.getElementById('prod-finished-item').value;
    let qty = parseInt(document.getElementById('prod-qty').value);
    if(!fpName || isNaN(qty) || qty <= 0) return alert("품목과 수량을 확인하세요.");

    let recipe = bomMaster.filter(b => b.finished_product === fpName);
    if(recipe.length === 0) return alert("BOM 레시피가 없습니다.");

    currentProductionBOM = recipe.map(r => ({
        original_material: r.material_product,
        target_material: r.material_product,
        required_qty: Math.ceil(r.require_qty * qty)
    }));

    renderProductionBOM();
    document.getElementById('btn-add-to-prod-cart').classList.remove('hidden');
}

function renderProductionBOM() {
    const tbody = document.getElementById('prod-bom-list');
    let html = '';
    currentProductionBOM.forEach((item, idx) => {
        // 💡 정확한 문자열 공백 제거 매칭
        let floorStock = globalOccupancy
            .filter(o => String(o.item_name).trim() === String(item.target_material).trim() && String(o.location_id).startsWith('FL-'))
            .reduce((sum, o) => sum + parseInt(o.quantity || 0), 0);
            
        let isEnough = floorStock >= item.required_qty;
        let stockHtml = isEnough 
            ? `<span class="text-emerald-600 font-bold">${floorStock.toLocaleString()}</span>` 
            : `<span class="text-rose-600 font-black animate-pulse">${floorStock.toLocaleString()} (부족)</span>`;

        html += `<tr>
            <td class="p-2 font-bold">${item.original_material}</td>
            <td class="p-2 text-right font-black text-indigo-600">${item.required_qty.toLocaleString()}</td>
            <td class="p-2 text-center">
                <select onchange="updateProductionMaterial(${idx}, this.value)" class="text-xs border rounded p-1 bg-slate-50 w-full max-w-[200px]">
                    ${getMaterialOptionsHTML(item.target_material)}
                </select>
            </td>
            <td class="p-2 text-center text-xs bg-slate-50">${stockHtml}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function getMaterialOptionsHTML(selectedMaterial) {
    return productMaster.map(m => `<option value="${m.item_name}" ${m.item_name === selectedMaterial ? 'selected' : ''}>[${m.category}] ${m.item_name}</option>`).join('');
}

function updateProductionMaterial(index, newVal) {
    currentProductionBOM[index].target_material = newVal;
    renderProductionBOM();
}

function addToProductionCart() {
    let fpName = document.getElementById('prod-finished-item').value;
    let qty = parseInt(document.getElementById('prod-qty').value);
    
    productionCart.push({
        finished_product: fpName,
        quantity: qty,
        materials: JSON.parse(JSON.stringify(currentProductionBOM))
    });

    currentProductionBOM = [];
    document.getElementById('prod-bom-list').innerHTML = `<tr><td colspan="4" class="p-10 text-center text-slate-400 font-bold">장바구니에 추가되었습니다. 다음 품목을 선택하세요.</td></tr>`;
    document.getElementById('btn-add-to-prod-cart').classList.add('hidden');
    renderProductionCart();
}

function removeFromProductionCart(index) {
    productionCart.splice(index, 1);
    renderProductionCart();
}

function renderProductionCart() {
    const tbody = document.getElementById('prod-cart-list');
    const executeBtn = document.getElementById('btn-execute-batch-production');
    
    if(productionCart.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-slate-400 font-bold">장바구니가 비어있습니다. 위에서 품목을 추가하세요.</td></tr>`;
        executeBtn.classList.add('hidden');
        return;
    }

    tbody.innerHTML = productionCart.map((item, idx) => {
        let matSummary = item.materials.map(m => `${m.target_material}(${m.required_qty})`).join(', ');
        return `<tr class="bg-white hover:bg-slate-50 border-b">
            <td class="p-3 font-black text-slate-800">${item.finished_product}</td>
            <td class="p-3 text-right font-black text-emerald-600">${item.quantity.toLocaleString()} EA</td>
            <td class="p-3 text-xs text-slate-500 truncate max-w-xs">${matSummary}</td>
            <td class="p-3 text-center"><button onclick="removeFromProductionCart(${idx})" class="text-rose-500 font-bold hover:underline">삭제</button></td>
        </tr>`;
    }).join('');
    
    executeBtn.classList.remove('hidden');
}

// 💡 일괄 생산 실행 및 "실시간" 현장 재고 차감
async function executeBatchProduction() {
    if(loginMode === 'viewer') return;

    await load(); // ⭐ 실행 전 최신 데이터 강제 동기화

    let totalMaterialNeeds = {};
    productionCart.forEach(order => {
        order.materials.forEach(mat => {
            if(!totalMaterialNeeds[mat.target_material]) totalMaterialNeeds[mat.target_material] = 0;
            totalMaterialNeeds[mat.target_material] += mat.required_qty;
        });
    });

    let errors = [];
    for(let matName in totalMaterialNeeds) {
        let floorStock = globalOccupancy
            .filter(o => String(o.item_name).trim() === String(matName).trim() && String(o.location_id).startsWith('FL-'))
            .reduce((sum, o) => sum + parseInt(o.quantity || 0), 0);
            
        if(floorStock < totalMaterialNeeds[matName]) {
            errors.push(`- ${matName} (합산필요: ${totalMaterialNeeds[matName].toLocaleString()}EA, 최신 현장재고: ${floorStock.toLocaleString()}EA)`);
        }
    }

    if(errors.length > 0) return alert("❌ [실시간 검증] 현장 재고가 부족합니다!\n누군가 재고를 이미 소진했거나 현장으로 이동되지 않았습니다.\n\n" + errors.join("\n"));

    if(!confirm(`총 ${productionCart.length}건의 생산 실적을 일괄 등록하시겠습니까?\n모든 자재는 최신 현장(FL-) 재고에서 차감됩니다.`)) return;

    try {
        for(let matName in totalMaterialNeeds) {
            let needed = totalMaterialNeeds[matName];
            let avail = globalOccupancy.filter(o => String(o.item_name).trim() === String(matName).trim() && String(o.location_id).startsWith('FL-'));
            avail.sort((a,b) => (a.production_date || '') > (b.production_date || '') ? 1 : -1);

            for(let item of avail) {
                if(needed <= 0) break;
                let deduct = Math.min(item.quantity, needed);
                let dynP = getDynamicPalletCount({item_name: item.item_name, quantity: deduct});
                await fetch('/api/outbound', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ inventory_id: item.id, location_id: item.location_id, item_name: item.item_name, quantity: deduct, pallet_count: dynP })
                });
                needed -= deduct;
            }
        }

        let today = new Date().toISOString().split('T')[0];
        for(let order of productionCart) {
            let pInfo = finishedProductMaster.find(p => p.item_name === order.finished_product);
            let dynP = getDynamicPalletCount({item_name: order.finished_product, quantity: order.quantity});
            await fetch('/api/inbound', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ location_id: 'FL-1F-P-01', category: pInfo ? pInfo.category : '미분류', item_name: order.finished_product, quantity: order.quantity, pallet_count: dynP, production_date: today, remarks: "자체생산" })
            });
        }

        alert("🎉 모든 생산 실적 등록과 자재 차감이 완료되었습니다!");
        productionCart = [];
        renderProductionCart();
        await load();

    } catch(e) { alert("서버 통신 에러가 발생했습니다."); }
}

function exportProductionExcel() {
    let wsData = [{"생산일자(YYYY-MM-DD)": "", "완제품명": "", "생산수량(EA)": ""}];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws['!cols'] = [{wch: 25}, {wch: 30}, {wch: 15}];
    XLSX.utils.book_append_sheet(wb, ws, "생산실적양식");
    let today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `한스팜_생산실적_업로드양식_${today}.xlsx`);
}

async function importProductionExcel(e) {
    if(loginMode === 'viewer') return alert("뷰어 모드 불가");
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    
    reader.onload = async function(ev) {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if(json.length === 0) return alert("데이터가 없습니다.");

            await load(); // ⭐ 엑셀 업로드 시에도 무조건 최신 데이터 강제 동기화

            let deductionPlan = [];
            let inboundPlan = [];
            let errors = [];
            let today = new Date().toISOString().split('T')[0];
            let materialNeeds = {}; 
            
            for(let i=0; i<json.length; i++) {
                let row = json[i];
                let fpName = row["완제품명"];
                let qty = parseInt(row["생산수량(EA)"]);
                let prodDate = row["생산일자(YYYY-MM-DD)"] || today;

                if(!fpName || isNaN(qty) || qty <= 0) continue;

                let recipe = bomMaster.filter(b => b.finished_product === fpName);
                if(recipe.length === 0) {
                    errors.push(`[${fpName}] 의 BOM 레시피가 등록되어 있지 않습니다.`);
                    continue;
                }

                recipe.forEach(r => {
                    let reqQty = Math.ceil(r.require_qty * qty);
                    if(!materialNeeds[r.material_product]) materialNeeds[r.material_product] = 0;
                    materialNeeds[r.material_product] += reqQty;
                });

                let pInfo = finishedProductMaster.find(p => p.item_name === fpName);
                inboundPlan.push({
                    location_id: 'FL-1F-P-01',
                    category: pInfo ? pInfo.category : '미분류',
                    item_name: fpName,
                    quantity: qty,
                    pallet_count: getDynamicPalletCount({item_name: fpName, remarks: "자체생산", quantity: qty}),
                    production_date: prodDate,
                    remarks: "자체생산"
                });
            }

            for(let mat in materialNeeds) {
                let needed = materialNeeds[mat];
                let availableItems = globalOccupancy.filter(o => String(o.item_name).trim() === String(mat).trim() && String(o.location_id).startsWith('FL-'));
                let totalAvail = availableItems.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);

                if(totalAvail < needed) {
                    errors.push(`- [${mat}] (전체 필요: ${needed.toLocaleString()}EA / 현장 재고: ${totalAvail.toLocaleString()}EA)`);
                }
            }

            if(errors.length > 0) return alert("❌ 현장(생산구역) 재고가 부족합니다!\n\n" + errors.join("\n"));

            if(!confirm(`총 ${inboundPlan.length}건의 실적을 일괄 등록하시겠습니까?`)) return;

            for(let mat in materialNeeds) {
                let needed = materialNeeds[mat];
                let availableItems = globalOccupancy.filter(o => String(o.item_name).trim() === String(mat).trim() && String(o.location_id).startsWith('FL-'));
                availableItems.sort((a, b) => (a.production_date || '') > (b.production_date || '') ? 1 : -1);

                for(let item of availableItems) {
                    if(needed <= 0) break;
                    let deductQty = Math.min(item.quantity, needed);
                    deductionPlan.push({
                        inventory_id: item.id,
                        location_id: item.location_id,
                        item_name: item.item_name,
                        quantity: deductQty,
                        pallet_count: getDynamicPalletCount({item_name: item.item_name, remarks: item.remarks, quantity: deductQty})
                    });
                    needed -= deductQty;
                }
            }

            let outPromises = deductionPlan.map(plan => fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(plan) }));
            await Promise.all(outPromises);

            let inPromises = inboundPlan.map(plan => fetch('/api/inbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(plan) }));
            await Promise.all(inPromises);

            alert("🎉 엑셀 일괄 생산 실적 등록 및 자재 차감이 완료되었습니다!");
            await load(); 

        } catch(err) { alert("업로드 처리 중 오류가 발생했습니다."); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; 
}
