// ==========================================
// [생산관리] - BOM 기반 대체 자재 스왑 및 자동 출고(차감) 로직
// ==========================================
let currentProductionBOM = [];

// 화면이 표시될 때마다 드롭다운을 확실하게 업데이트하는 무적의 코드 (MutationObserver)
const prodObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.classList.contains('flex')) {
            initProductionView();
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const prodView = document.getElementById('view-production');
    if(prodView) {
        prodObserver.observe(prodView, { attributes: true, attributeFilter: ['class'] });
    }
});

function initProductionView() {
    let fpSelect = document.getElementById('prod-finished-item');
    if(!fpSelect) return;

    // BOM 마스터에 등록된 완제품만 중복 제거하여 추출
    let bomFpNames = [...new Set(bomMaster.map(b => b.finished_product))].sort();
    
    if (bomFpNames.length === 0) {
        fpSelect.innerHTML = `<option value="">[품목관리>BOM설정]에서 레시피를 먼저 등록해주세요</option>`;
        return;
    }

    let html = '';
    bomFpNames.forEach(fp => {
        let pInfo = finishedProductMaster.find(p => p.item_name === fp);
        let cat = pInfo ? pInfo.category : '미분류';
        html += `<option value="${fp}">[${cat}] ${fp}</option>`;
    });

    fpSelect.innerHTML = html;
}

function calculateProductionBOM() {
    let fpName = document.getElementById('prod-finished-item').value;
    let qty = parseInt(document.getElementById('prod-qty').value);

    if(!fpName) return alert("생산할 완제품을 선택해주세요.");
    if(isNaN(qty) || qty <= 0) return alert("생산 수량을 정확히 입력해주세요.");

    // 해당 완제품의 BOM 레시피 추출
    let recipe = bomMaster.filter(b => b.finished_product === fpName);
    if(recipe.length === 0) return alert("해당 제품의 BOM 레시피가 존재하지 않습니다.");

    // 생산용 임시 리스트에 담기 (스왑을 위해 target_material 초기화)
    currentProductionBOM = recipe.map(r => ({
        original_material: r.material_product,
        target_material: r.material_product,  // 사용자가 바꿀 수 있는 실제 사용 자재
        required_qty: Math.ceil(r.require_qty * qty) // 필요한 수량 (소수점 올림 처리)
    }));

    renderProductionBOM();
    document.getElementById('btn-execute-production').classList.remove('hidden');
}

function getMaterialOptionsHTML(selectedMaterial) {
    // 모든 자재 목록을 드롭다운 옵션으로 생성 (일반형 ↔ 접착형 스왑 용도)
    let sorted = [...productMaster].sort((a, b) => a.item_name.localeCompare(b.item_name));
    let html = '';
    sorted.forEach(m => {
        let isSel = m.item_name === selectedMaterial ? 'selected' : '';
        html += `<option value="${m.item_name}" ${isSel}>[${m.category || '미분류'}] ${m.item_name}</option>`;
    });
    return html;
}

function updateProductionMaterial(index, newVal) {
    // 사용자가 스왑(변경)한 자재명 업데이트
    currentProductionBOM[index].target_material = newVal;
    renderProductionBOM(); // 재고 상태 다시 체크해서 화면 갱신
}

function renderProductionBOM() {
    const tbody = document.getElementById('prod-bom-list');
    if(!tbody) return;

    let html = '';
    currentProductionBOM.forEach((item, idx) => {
        // 선택된 target_material 의 현재 총 창고 재고 합산
        let currentStock = globalOccupancy.filter(o => o.item_name === item.target_material).reduce((sum, o) => sum + o.quantity, 0);
        
        // 재고 상태 뱃지 (넉넉하면 녹색, 부족하면 빨간색+경고)
        let isEnough = currentStock >= item.required_qty;
        let stockHtml = isEnough 
            ? `<div class="text-emerald-600 font-black text-xs md:text-sm">${currentStock.toLocaleString()} EA <span class="text-[10px] block font-bold text-slate-500">(충분)</span></div>` 
            : `<div class="text-rose-600 font-black text-xs md:text-sm animate-pulse">${currentStock.toLocaleString()} EA <span class="text-[10px] block font-bold text-rose-400">(부족!)</span></div>`;

        // 원본과 다르게 스왑했으면 원본 이름에 취소선 그어서 시각적 피드백
        let originalNameStyle = (item.original_material !== item.target_material) ? 'line-through text-slate-400' : 'text-slate-700';

        html += `
        <tr class="hover:bg-slate-50 transition-colors bg-white">
            <td class="p-3 font-bold text-xs md:text-sm ${originalNameStyle}">${item.original_material}</td>
            <td class="p-3 text-right font-black text-indigo-700 text-sm md:text-base bg-indigo-50/50">${item.required_qty.toLocaleString()} <span class="text-[10px] font-normal text-slate-500">EA</span></td>
            <td class="p-3 text-center">
                <select onchange="updateProductionMaterial(${idx}, this.value)" class="w-full max-w-[200px] border-2 border-slate-300 rounded p-1.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-colors bg-slate-50 hover:bg-white shadow-sm">
                    ${getMaterialOptionsHTML(item.target_material)}
                </select>
            </td>
            <td class="p-3 text-center bg-slate-50/50 border-l border-slate-100">
                ${stockHtml}
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

async function executeProduction() {
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 실적을 등록할 수 없습니다.");
    
    // 1. 재고 부족 검증 및 차감 계획(FIFO) 수립
    let deductionPlan = []; 
    let productionErrors = [];

    for (let req of currentProductionBOM) {
        let needed = req.required_qty;
        
        let availableItems = globalOccupancy.filter(o => o.item_name === req.target_material);
        availableItems.sort((a, b) => {
            let tA = a.production_date ? new Date(a.production_date).getTime() : Infinity;
            let tB = b.production_date ? new Date(b.production_date).getTime() : Infinity;
            return tA - tB;
        });

        let totalAvail = availableItems.reduce((sum, item) => sum + item.quantity, 0);
        
        if (totalAvail < needed) {
            productionErrors.push(`- [${req.target_material}] (필요: ${needed}EA / 현재고: ${totalAvail}EA)`);
            continue;
        }

        for (let item of availableItems) {
            if (needed <= 0) break;
            
            let deductQty = Math.min(item.quantity, needed);
            let dynP = getDynamicPalletCount({item_name: item.item_name, remarks: item.remarks, quantity: deductQty});
            
            deductionPlan.push({
                inventory_id: item.id,
                location_id: item.location_id,
                item_name: item.item_name,
                quantity: deductQty,
                pallet_count: dynP
            });
            needed -= deductQty;
        }
    }

    if (productionErrors.length > 0) {
        return alert("❌ 재고가 부족하여 생산 실적을 등록할 수 없습니다:\n\n" + productionErrors.join("\n"));
    }

    let fpName = document.getElementById('prod-finished-item').value;
    let fpQty = parseInt(document.getElementById('prod-qty').value);

    if(!confirm(`[생산 최종 확인]\n\n완제품 [${fpName}] ${fpQty.toLocaleString()}EA를 생산 등록하시겠습니까?\n(목록에 지정된 자재들이 오래된 재고부터 자동 출고 차감됩니다.)`)) return;

    try {
        let outPromises = deductionPlan.map(plan => 
            fetch('/api/outbound', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(plan) })
        );
        await Promise.all(outPromises);

        let pInfo = finishedProductMaster.find(p => p.item_name === fpName);
        let fpCat = pInfo ? pInfo.category : '미분류';
        let fpPallet = getDynamicPalletCount({item_name: fpName, remarks: "자체생산", quantity: fpQty});
        let today = new Date().toISOString().split('T')[0];

        await fetch('/api/inbound', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ location_id: 'FL-1F-01', category: fpCat, item_name: fpName, quantity: fpQty, pallet_count: fpPallet, production_date: today, remarks: "자체생산" })
        });

        alert("🎉 생산 실적 등록 및 자재 자동 차감이 완벽하게 처리되었습니다!\n\n(생산된 완제품은 렉맵의 '생산 현장(FL-1F-01)'에 적재되었습니다. 이후 렉 이동으로 알맞은 위치에 넣어주세요.)");
        
        currentProductionBOM = [];
        document.getElementById('prod-qty').value = 1;
        document.getElementById('btn-execute-production').classList.add('hidden');
        renderProductionBOM();
        await load(); 

    } catch(e) { alert("서버 통신 중 오류가 발생했습니다."); }
}

// ==========================================
// 💡 [추가됨] 생산 실적 엑셀 일괄 업로드 로직
// ==========================================
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
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 사용할 수 없습니다.");
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    
    reader.onload = async function(ev) {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            
            if(json.length === 0) return alert("데이터가 없습니다.");

            let deductionPlan = [];
            let inboundPlan = [];
            let errors = [];
            let today = new Date().toISOString().split('T')[0];
            let materialNeeds = {}; // 전체 필요 자재 합산용
            
            // 1. 업로드된 모든 행(생산 건)의 필요 자재량을 완벽하게 합산
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
                    materialNeeds[r.material_product] += reqQty; // 표준 BOM 기준으로 자재 합산
                });

                // 완제품 입고 계획 세우기
                let pInfo = finishedProductMaster.find(p => p.item_name === fpName);
                let fpCat = pInfo ? pInfo.category : '미분류';
                let fpPallet = getDynamicPalletCount({item_name: fpName, remarks: "자체생산", quantity: qty});
                
                inboundPlan.push({
                    location_id: 'FL-1F-01',
                    category: fpCat,
                    item_name: fpName,
                    quantity: qty,
                    pallet_count: fpPallet,
                    production_date: prodDate,
                    remarks: "자체생산"
                });
            }

            if(errors.length > 0) return alert("❌ 업로드 실패 (아래 오류를 해결해주세요):\n\n" + errors.join("\n"));

            // 2. 전체 재고 검사 (합산된 자재가 창고에 충분한지 확인)
            for(let mat in materialNeeds) {
                let needed = materialNeeds[mat];
                let availableItems = globalOccupancy.filter(o => o.item_name === mat);
                let totalAvail = availableItems.reduce((sum, item) => sum + item.quantity, 0);

                if(totalAvail < needed) {
                    errors.push(`- [${mat}] (전체 필요: ${needed.toLocaleString()}EA / 창고 재고: ${totalAvail.toLocaleString()}EA)`);
                }
            }

            if(errors.length > 0) return alert("❌ 창고 재고가 부족하여 일괄 생산을 처리할 수 없습니다:\n\n" + errors.join("\n"));

            if(!confirm(`총 ${inboundPlan.length}건의 생산 실적을 일괄 등록하시겠습니까?\n\n(※ 표준 BOM에 지정된 자재들이 창고에서 FIFO 방식으로 자동 출고됩니다.)`)) return;

            // 3. 자재 차감 상세 계획(FIFO) 세우기
            for(let mat in materialNeeds) {
                let needed = materialNeeds[mat];
                let availableItems = globalOccupancy.filter(o => o.item_name === mat);
                
                // 오래된 재고부터 쓰기 위한 정렬
                availableItems.sort((a, b) => {
                    let tA = a.production_date ? new Date(a.production_date).getTime() : Infinity;
                    let tB = b.production_date ? new Date(b.production_date).getTime() : Infinity;
                    return tA - tB;
                });

                for(let item of availableItems) {
                    if(needed <= 0) break;
                    let deductQty = Math.min(item.quantity, needed);
                    let dynP = getDynamicPalletCount({item_name: item.item_name, remarks: item.remarks, quantity: deductQty});
                    
                    deductionPlan.push({
                        inventory_id: item.id,
                        location_id: item.location_id,
                        item_name: item.item_name,
                        quantity: deductQty,
                        pallet_count: dynP
                    });
                    needed -= deductQty;
                }
            }

            // 4. 자재 자동 차감 실행
            let outPromises = deductionPlan.map(plan => 
                fetch('/api/outbound', { 
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(plan) 
                })
            );
            await Promise.all(outPromises);

            // 5. 완제품 입고 실행
            let inPromises = inboundPlan.map(plan => 
                fetch('/api/inbound', {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(plan)
                })
            );
            await Promise.all(inPromises);

            alert("🎉 엑셀 일괄 생산 실적 등록 및 자재 차감이 완벽하게 완료되었습니다!");
            await load(); // 시스템 최신화

        } catch(err) {
            console.error(err);
            alert("업로드 처리 중 오류가 발생했습니다. 엑셀 양식을 확인해주세요.");
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // 다음 업로드를 위해 초기화
}
