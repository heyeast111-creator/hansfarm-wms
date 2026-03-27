let globalOccupancy = []; let productMaster = []; let finishedProductMaster = []; let globalHistory = []; let bomMaster = []; let globalSearchTargets = []; let currentZone = '실온'; let selectedCellId = null; let isAdmin = false; let loginMode = 'guest'; let currentOrderTab = 'inventory'; let editingProductOriginalName = null; let editingProductOriginalSupplier = null; let orderCart = []; let movingItem = null;
const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];
const layoutFloor = [ { id: 'FL-C', title: '❄️ 생산 현장 (원재료/냉장)', cols: 20 }, { aisle: true, text: '====================' }, { id: 'FL-R', title: '📦 생산 현장 (부자재/실온)', cols: 20 } ];

function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') { loginMode = 'viewer'; alert("👁️ 뷰어 모드로 접속되었습니다.\n(모든 기능을 '보기'만 가능합니다)"); } 
    else if (pw === '00700') { loginMode = 'editor'; alert("✅ 일반 사용자 모드로 접속되었습니다."); } 
    else { alert("❌ 비밀번호가 틀렸습니다."); return; }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden'); document.getElementById('main-app').classList.add('flex');
    load(); showView('dashboard');
}

async function load() {
    try {
        const ts = new Date().getTime(); 
        const [occRes, prodRes, fpRes, histRes, bomRes] = await Promise.all([ 
            fetch('/api/inventory?t=' + ts), fetch('/api/products?t=' + ts), fetch('/api/finished_products?t=' + ts), fetch('/api/history?t=' + ts), fetch('/api/bom?t=' + ts) 
        ]);
        globalOccupancy = await occRes.json() || []; productMaster = await prodRes.json() || []; finishedProductMaster = await fpRes.json() || []; globalHistory = await histRes.json() || []; bomMaster = await bomRes.json() || [];
        
        let t = new Date(); let yyyy = t.getFullYear(); let mm = String(t.getMonth() + 1).padStart(2, '0'); let dd = String(t.getDate()).padStart(2, '0');
        if(!document.getElementById('acc-date').value) document.getElementById('acc-date').value = `${yyyy}-${mm}-${dd}`;
        if(!document.getElementById('acc-period-start').value) document.getElementById('acc-period-start').value = `${yyyy}-${mm}-01`; 
        if(!document.getElementById('acc-period-end').value) document.getElementById('acc-period-end').value = `${yyyy}-${mm}-${dd}`; 
        if(!document.getElementById('acc-month').value) document.getElementById('acc-month').value = `${yyyy}-${mm}`;

        if(!isAdmin) {
            document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden'));
            let fp = document.getElementById('admin-finance-panel'); if(fp) fp.classList.add('hidden');
        }
        renderAll(); 
    } catch (e) { console.error("로딩 에러:", e); }
}

function renderAll() {
    try { renderMap(); if(selectedCellId) clickCell(selectedCellId); } catch(e){}
    try { updateDashboard(); } catch(e){}
    try { updateMapSearchCategoryDropdown(); } catch(e){}
    try { updateSummarySupplierDropdown(); } catch(e){}
    try { renderSafetyStock(); } catch(e){}
    try { updateAccFilters('type'); } catch(e){}
    try { populateProductFilters('finished'); renderProductMaster('finished'); } catch(e){}
    try { populateProductFilters('materials'); renderProductMaster('materials'); } catch(e){}
    try { updateBomDropdowns(); renderBomMaster(); } catch(e){}
    try { updateOrderCartDropdowns(); renderOrderList(); renderOrderCart(); } catch(e){}
    try { populateWaitDropdowns(); } catch(e){}
}

function clearInfo() {
    const panel = document.getElementById('info-panel');
    if(panel) panel.innerHTML = `<div class="text-center text-slate-400 py-10 mt-10">도면에서 위치를 선택해주세요</div>`;
}

function adminLogin() {
    let fp = document.getElementById('admin-finance-panel');
    if(isAdmin) { 
        isAdmin = false; alert("🔒 관리자 모드가 해제되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden')); 
        if(fp) fp.classList.add('hidden');
        let viewAcc = document.getElementById('view-accounting'); if(viewAcc && !viewAcc.classList.contains('hidden')) showView('dashboard'); 
        return; 
    }
    const pw = prompt("비밀번호 입력 (1234):"); 
    if(pw === "1234") { 
        isAdmin = true; alert("🔓 관리자 권한이 활성화되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden')); 
        if(fp) fp.classList.remove('hidden');
    } else if (pw !== null) { alert("비밀번호가 틀렸습니다."); }
}

function showView(viewName) {
    movingItem = null;
    ['view-dashboard', 'view-order', 'view-products', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
        let el = document.getElementById(id); if(el) el.style.display = 'none'; 
    });
    
    let rs = document.getElementById('right-sidebar');
    if(viewName === 'order' && currentOrderTab === 'inventory') { 
        if(window.innerWidth >= 768 && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } 
        else if(rs) { if(selectedCellId) { rs.classList.remove('hidden'); rs.classList.add('flex'); } else { rs.classList.add('hidden'); rs.classList.remove('flex'); } }
    } else if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); }
    
    let targetView = document.getElementById('view-' + viewName);
    if(targetView) { targetView.style.display = 'flex'; }

    document.querySelectorAll('.nav-btn-pc').forEach(btn => { btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'bg-rose-50', 'border-rose-200', 'text-rose-600', 'bg-yellow-50', 'border-yellow-300', 'text-yellow-700', 'shadow-inner'); });
    document.querySelectorAll('.nav-btn-pc.target-' + viewName).forEach(btn => {
        if(viewName === 'accounting') btn.classList.add('bg-yellow-50', 'border-yellow-300', 'text-yellow-700', 'shadow-inner');
        else btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner');
    });

    document.querySelectorAll('.nav-btn-mo').forEach(btn => {
        if(btn.id !== 'admin-btn-mo') { btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner'); btn.classList.add('bg-white'); }
    });
    document.querySelectorAll('.nav-btn-mo.target-' + viewName).forEach(btn => { btn.classList.remove('bg-white'); btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'shadow-inner'); });
    
    if(viewName === 'products') { switchProductTab('fp'); } 
    else if(viewName === 'order') { switchOrderTab(currentOrderTab); } 
    else if(viewName === 'dashboard') updateDashboard(); 
    else if(viewName === 'accounting') updateAccFilters('type'); 
}

function updateDashboard() { 
    try {
        let dashPeriod = document.getElementById('dash-period'); if(!dashPeriod) return;
        const period = dashPeriod.value; let startDate = new Date(); 
        if(period === 'daily') startDate.setDate(startDate.getDate() - 1); 
        else if(period === 'weekly') startDate.setDate(startDate.getDate() - 7); 
        else if(period === 'monthly') startDate.setMonth(startDate.getMonth() - 1); 
        
        let inPallets = 0, outPallets = 0, productionCost = 0; let allItems = [...finishedProductMaster, ...productMaster];
        globalHistory.forEach(log => { 
            let logDate = new Date(log.production_date ? log.production_date : log.created_at);
            if(logDate >= startDate) { 
                if(log.action_type === '입고') inPallets += (log.pallet_count || 1); 
                if(log.action_type === '출고') { 
                    outPallets += (log.pallet_count || 1); 
                    let pInfo = allItems.find(p => String(p.item_name||"").trim() === String(log.item_name||"").trim()); 
                    if(pInfo) productionCost += (pInfo.unit_price * log.quantity); 
                } 
            } 
        }); 
        
        let dashIn = document.getElementById('dash-in'); if(dashIn) dashIn.innerText = inPallets.toFixed(1) + ' P'; 
        let dashOut = document.getElementById('dash-out'); if(dashOut) dashOut.innerText = outPallets.toFixed(1) + ' P'; 
        let dashCostOut = document.getElementById('dash-cost-out'); if(dashCostOut) dashCostOut.innerText = productionCost.toLocaleString() + ' 원'; 
        
        let totalRoom = 0, occRoom = 0, totalCold = 0, occCold = 0; let valRoom = 0, valCold = 0; 
        globalOccupancy.forEach(item => { 
            let dynP = getDynamicPalletCount(item); 
            let pInfo = allItems.find(prod => String(prod.item_name||"").trim() === String(item.item_name||"").trim() && String(prod.supplier||"").trim() === String(item.remarks||"").trim()); 
            let val = pInfo ? pInfo.unit_price * item.quantity : 0; 
            if(item.location_id.startsWith('R-')) { occRoom += dynP; valRoom += val; } 
            else if(item.location_id.startsWith('C-')) { occCold += dynP; valCold += val; } 
            else if(!item.location_id.startsWith('W-')) { valRoom += val; } 
        }); 
        
        layoutRoom.forEach(col => { if(col.cols) totalRoom += col.cols * 2; }); totalRoom += 20; 
        layoutCold.forEach(col => { if(col.cols) totalCold += col.cols * 2; }); totalCold += 16; 
        let totalAll = totalRoom + totalCold; let occAll = occRoom + occCold; 
        
        let dashZoneSel = document.getElementById('dash-zone-select'); const dashZone = dashZoneSel ? dashZoneSel.value : 'ALL'; 
        let finalOcc = occAll, finalTotal = totalAll; 
        if(dashZone === 'ROOM') { finalOcc = occRoom; finalTotal = totalRoom; } 
        else if(dashZone === 'COLD') { finalOcc = occCold; finalTotal = totalCold; }
        
        let capRate = finalTotal > 0 ? Math.round((finalOcc / finalTotal) * 100) : 0; 
        let dashCapPer = document.getElementById('dash-cap-percent'); if(dashCapPer) dashCapPer.innerText = capRate + '%'; 
        let dashCapText = document.getElementById('dash-cap-text'); if(dashCapText) dashCapText.innerText = `${finalOcc.toFixed(1)} / ${finalTotal} 파레트`; 
        let color = capRate > 100 ? '#e11d48' : '#10b981'; 
        let dashDonut = document.getElementById('dash-donut'); if(dashDonut) dashDonut.style.background = `conic-gradient(${color} 0% ${Math.min(capRate, 100)}%, #e2e8f0 ${Math.min(capRate, 100)}% 100%)`; 
        
        let elRoomTotal = document.getElementById('dash-room-total'); if(elRoomTotal) elRoomTotal.innerText = totalRoom; 
        let elRoomOcc = document.getElementById('dash-room-occ'); if(elRoomOcc) elRoomOcc.innerText = occRoom.toFixed(1); 
        let elRoomEmpty = document.getElementById('dash-room-empty'); if(elRoomEmpty) elRoomEmpty.innerText = Math.max(0, totalRoom - Math.floor(occRoom)); 
        let elRoomPer = document.getElementById('dash-room-percent'); if(elRoomPer) elRoomPer.innerText = totalRoom > 0 ? Math.round((occRoom/totalRoom)*100) + '%' : '0%'; 
        
        let elColdTotal = document.getElementById('dash-cold-total'); if(elColdTotal) elColdTotal.innerText = totalCold; 
        let elColdOcc = document.getElementById('dash-cold-occ'); if(elColdOcc) elColdOcc.innerText = occCold.toFixed(1); 
        let elColdEmpty = document.getElementById('dash-cold-empty'); if(elColdEmpty) elColdEmpty.innerText = Math.max(0, totalCold - Math.floor(occCold)); 
        let elColdPer = document.getElementById('dash-cold-percent'); if(elColdPer) elColdPer.innerText = totalCold > 0 ? Math.round((occCold/totalCold)*100) + '%' : '0%'; 
        
        let vRoom = document.getElementById('dash-val-room'); if(vRoom) vRoom.innerText = valRoom.toLocaleString() + ' 원'; 
        let vCold = document.getElementById('dash-val-cold'); if(vCold) vCold.innerText = valCold.toLocaleString() + ' 원'; 
        let vTotal = document.getElementById('dash-val-total'); if(vTotal) vTotal.innerText = (valRoom + valCold).toLocaleString() + ' 원'; 
    } catch(e) {} 
}

function getSummarySourceItems() {
    const typeSelect = document.getElementById('summary-type'); if(!typeSelect) return [];
    const type = typeSelect.value;
    if (type === 'FINISHED') return finishedProductMaster;
    if (type === 'MATERIAL') return productMaster.filter(p => p.category && !p.category.includes('원란'));
    if (type === 'RAW') return productMaster.filter(p => p.category && p.category.includes('원란'));
    return [...finishedProductMaster, ...productMaster];
}
function updateSummarySupplierDropdown() {
    try {
        let items = getSummarySourceItems(); let suppliers = [...new Set(items.map(p => p.supplier))].filter(Boolean).sort();
        const supSelect = document.getElementById('summary-supplier');
        if (supSelect) { supSelect.innerHTML = `<option value="ALL">전체 입고처</option>` + suppliers.map(s => `<option value="${s}">${s}</option>`).join(''); updateSummaryCategoryDropdown(); }
    } catch(e){}
}
function updateSummaryCategoryDropdown() {
    try {
        let items = getSummarySourceItems(); const supSelect = document.getElementById('summary-supplier'); const supplier = supSelect ? supSelect.value : 'ALL';
        if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
        let categories = [...new Set(items.map(p => p.category))].filter(Boolean).sort();
        const catSelect = document.getElementById('summary-category');
        if (catSelect) { catSelect.innerHTML = `<option value="ALL">전체 카테고리</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join(''); updateSummaryItemDropdown(); }
    } catch(e){}
}
function updateSummaryItemDropdown() {
    try {
        let items = getSummarySourceItems(); const supSelect = document.getElementById('summary-supplier'); const catSelect = document.getElementById('summary-category');
        const supplier = supSelect ? supSelect.value : 'ALL'; const cat = catSelect ? catSelect.value : 'ALL';
        if (supplier !== 'ALL') items = items.filter(p => p.supplier === supplier);
        if (cat !== 'ALL') items = items.filter(p => p.category === cat);
        const uniqueItems = [...new Set(items.map(p => p.item_name))].filter(Boolean).sort();
        const itemSelect = document.getElementById('summary-item');
        if(itemSelect) { itemSelect.innerHTML = `<option value="">품목을 선택하세요</option>` + uniqueItems.map(name => `<option value="${name}">${name}</option>`).join(''); }
        calculateSummary();
    } catch(e){}
}
function calculateSummary() {
    try {
        const itemSelect = document.getElementById('summary-item'); if(!itemSelect) return;
        const itemName = itemSelect.value; const supplier = document.getElementById('summary-supplier').value;
        let breakdown = {}; let totalQty = 0; let totalPallet = 0;
        if(itemName) {
            globalOccupancy.forEach(item => {
                let itemSupplier = item.remarks || "기본입고처";
                if(item.item_name === itemName) {
                    if (supplier === 'ALL' || itemSupplier === supplier) {
                        if(!breakdown[itemSupplier]) breakdown[itemSupplier] = { qty: 0, pallet: 0 };
                        let dynP = getDynamicPalletCount(item);
                        breakdown[itemSupplier].qty += item.quantity; breakdown[itemSupplier].pallet += dynP;
                        totalQty += item.quantity; totalPallet += dynP;
                    }
                }
            });
        }
        document.getElementById('summary-result').innerHTML = `${totalQty.toLocaleString()} <span class="text-xl md:text-2xl text-indigo-400 font-bold">EA</span>`;
        document.getElementById('summary-pallet').innerText = `${totalPallet.toFixed(1)} P (부피 합산)`;
        let breakdownHtml = ''; let supKeys = Object.keys(breakdown);
        if(supKeys.length > 0) {
            breakdownHtml = '<div class="space-y-2 mt-4">';
            supKeys.forEach(sup => { breakdownHtml += `<div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm md:text-base"><span class="font-bold text-slate-700 text-left w-1/3 truncate" title="${sup}">${sup}</span><span class="font-black text-indigo-600 w-1/3 text-right">${breakdown[sup].qty.toLocaleString()} EA</span><span class="font-bold text-rose-500 w-1/3 text-right">${breakdown[sup].pallet.toFixed(1)} P</span></div>`; });
            breakdownHtml += '</div>';
        }
        document.getElementById('summary-breakdown').innerHTML = breakdownHtml;
    } catch(e){}
}
function findItemLocationFromSummary() {
    const itemName = document.getElementById('summary-item').value; const supplier = document.getElementById('summary-supplier').value;
    if(!itemName) return alert("먼저 위치를 확인할 품목을 선택해주세요.");
    let targets = globalOccupancy.filter(item => { let itemSupplier = item.remarks || "기본입고처"; if(item.item_name === itemName) { if (supplier === 'ALL' || itemSupplier === supplier) return true; } return false; });
    if(targets.length === 0) return alert("현재 창고에 해당 품목의 재고가 없습니다.");
    globalSearchTargets = targets.map(t => t.location_id);
    let firstLoc = globalSearchTargets[0];
    if (firstLoc.startsWith('FL-')) { currentZone = '현장'; } else if (firstLoc.startsWith('C-')) { currentZone = '냉장'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; } else { currentZone = '실온'; document.getElementById('floor-select').value = firstLoc.endsWith('-2F') ? "2" : "1"; }
    showView('order'); switchOrderTab('inventory');
    let zoneMap = {'실온':'실온(Room)', '냉장':'냉장(Cold)', '현장':'현장(Floor)'}; let foundZones = new Set();
    globalSearchTargets.forEach(loc => { if(loc.startsWith('FL-')) foundZones.add('현장'); else if(loc.startsWith('C-')) foundZones.add('냉장'); else foundZones.add('실온'); });
    alert(`[${itemName}] 위치 추적 완료!\n(발견 구역: ${Array.from(foundZones).map(z => zoneMap[z]).join(', ')})`); 
}

window.onload = function() { document.getElementById('login-screen').style.display = 'flex'; };
