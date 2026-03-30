// ==========================================
// [생산관리] - BOM 기반 대체 자재 스왑 및 자동 출고(차감) 로직
// ==========================================
let currentProductionBOM = [];

// 좌측 메뉴나 하단 네비게이션에서 '생산관리' 탭을 누르면 드롭다운 업데이트
document.addEventListener('click', function(e) {
    if(e.target.closest('.target-production')) {
        setTimeout(initProductionView, 100); 
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
        
        // 렉맵에서 해당 자재를 모두 긁어옴
        let availableItems = globalOccupancy.filter(o => o.item_name === req.target_material);
        
        // 산란일/입고일이 오래된 순서(FIFO)로 정렬
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

        // 오래된 렉부터 순차적으로 차감 수량 배분
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
        // 2. 자재 일괄 자동 출고(차감) 처리
        let outPromises = deductionPlan.map(plan => 
            fetch('/api/outbound', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(plan) 
            })
        );
        await Promise.all(outPromises);

        // 3. 완제품 입고 처리 (생산현장 1층 1번칸 FL-1F-01 로 임시 적재)
        let pInfo = finishedProductMaster.find(p => p.item_name === fpName);
        let fpCat = pInfo ? pInfo.category : '미분류';
        let fpPallet = getDynamicPalletCount({item_name: fpName, remarks: "자체생산", quantity: fpQty});
        let today = new Date().toISOString().split('T')[0];

        await fetch('/api/inbound', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                location_id: 'FL-1F-01', // 생산현장 입고
                category: fpCat,
                item_name: fpName,
                quantity: fpQty,
                pallet_count: fpPallet,
                production_date: today,
                remarks: "자체생산"
            })
        });

        alert("🎉 생산 실적 등록 및 자재 자동 차감이 완벽하게 처리되었습니다!\n\n(생산된 완제품은 렉맵의 '생산 현장(FL-1F-01)'에 적재되었습니다. 이후 렉 이동으로 알맞은 위치에 넣어주세요.)");
        
        // 화면 초기화
        currentProductionBOM = [];
        document.getElementById('prod-qty').value = 1;
        document.getElementById('btn-execute-production').classList.add('hidden');
        renderProductionBOM();
        
        // 전체 데이터 다시 로드
        await load(); 

    } catch(e) {
        alert("서버 통신 중 오류가 발생했습니다. (일부만 차감되었을 수 있으니 히스토리를 확인하세요)");
    }
}
