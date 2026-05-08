// ==========================================
// 전역 변수 (Global Variables) - 전체 유지
// ==========================================
let globalOccupancy = []; 
let productMaster = []; 
let finishedProductMaster = []; 
let globalHistory = []; 
let bomMaster = []; 
let globalSearchTargets = []; 
let currentZone = '실온'; 
let selectedCellId = null; 
let isAdmin = false;
let loginMode = 'guest';

let currentOrderTab = 'inventory';
let editingProductOriginalName = null;
let editingProductOriginalSupplier = null;
let orderCart = []; 
let movingItem = null;
let bomCart = [];
let expandedBomRows = {}; 
let isRightPanelVisible = false; 

// 💡 렉맵 렌더링 핵심 뼈대 (J-A 역순 유지)
const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];

// ==========================================
// 로그인 및 5000줄 완벽 로딩 (제한 해제)
// ==========================================
function siteLogin() {
    const pw = document.getElementById('site-pw').value;
    if (pw === '0000') { loginMode = 'viewer'; alert("뷰어 모드로 접속되었습니다."); } 
    else if (pw === '11111') { loginMode = 'editor'; alert("일반 사용자 모드로 접속되었습니다."); } 
    else { alert("비밀번호가 틀렸습니다."); return; }
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');
    load(); 
    showView('dashboard');
}

async function load() {
    try {
        const ts = new Date().getTime(); 
        const SUPABASE_URL = "https://sxdldhjmatzzyfufavrm.supabase.co";
        const SUPABASE_KEY = "sb_publishable_gIXjo5pyqbDO55wgJq1Yxg_RbCEYEYu";

        const [occRes, prodRes, fpRes, bomRes, histRes] = await Promise.all([ 
            fetch('/api/inventory?t=' + ts), 
            fetch('/api/products?t=' + ts), 
            fetch('/api/finished_products?t=' + ts), 
            fetch('/api/bom?t=' + ts),
            fetch(`${SUPABASE_URL}/rest/v1/history_log?select=*&order=created_at.desc&limit=5000`, { 
                headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } 
            })
        ]);
        
        globalOccupancy = await occRes.json() || [];
        productMaster = await prodRes.json() || [];
        finishedProductMaster = await fpRes.json() || [];
        bomMaster = await bomRes.json() || [];
        globalHistory = await histRes.json() || [];
        
        renderAll(); 
    } catch (e) { 
        console.error("데이터 로드 실패:", e); 
        alert("데이터를 불러오지 못했습니다. 파이썬 서버가 켜져 있는지 확인해주세요.");
    }
}

function renderAll() {
    try { if(typeof renderMap === 'function') renderMap(); if(selectedCellId && typeof clickCell === 'function') clickCell(selectedCellId); } catch(e){}
    try { updateDashboard(); } catch(e){}
    try { if(typeof updateMapSearchCategoryDropdown === 'function') updateMapSearchCategoryDropdown(); } catch(e){}
    try { if(typeof updateSummarySupplierDropdown === 'function') updateSummarySupplierDropdown(); } catch(e){}
    try { if(typeof renderSafetyStock === 'function') renderSafetyStock(); } catch(e){}
    try { if(typeof renderAccounting === 'function') renderAccounting(); } catch(e){} 
    try { if(typeof populateWaitDropdowns === 'function') populateWaitDropdowns(); } catch(e){}
    try { if(typeof renderDailyInventory === 'function') renderDailyInventory(); } catch(e){}
}

// ==========================================
// 🚨 관리자 권한 모달창 투명도(opacity) 버그 100% 해결
// ==========================================
function adminLogin() {
    if(isAdmin) { 
        isAdmin = false; 
        alert("관리자 모드가 해제되었습니다."); 
        document.querySelectorAll('.target-accounting').forEach(el => el.classList.add('hidden'));
        let pnl = document.getElementById('admin-finance-panel'); 
        if(pnl) pnl.classList.add('hidden');
        showView('dashboard'); 
        return; 
    }
    
    let modal = document.getElementById('admin-pw-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // 💡 [핵심 패치] 투명도(opacity-0)에 갇힌 하얀 박스를 강제로 구출하여 보이게 만듦
        let innerBox = modal.querySelector('div');
        if(innerBox) {
            innerBox.classList.remove('opacity-0');
            innerBox.classList.add('opacity-100');
        }

        let pwInput = document.getElementById('admin-pw-input');
        if(pwInput) { pwInput.value = ''; pwInput.focus(); }
    } else {
        const pw = prompt("관리자 비밀번호를 입력하세요:"); 
        if(pw === "123456789*") grantAdmin(); 
        else if (pw !== null) alert("비밀번호가 틀렸습니다.");
    }
}

function closeAdminModal() {
    let modal = document.getElementById('admin-pw-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function submitAdminPassword() {
    let pwInput = document.getElementById('admin-pw-input');
    if(pwInput && pwInput.value === "123456789*") {
        grantAdmin();
        closeAdminModal();
    } else {
        alert("비밀번호가 틀렸습니다.");
    }
}

function grantAdmin() {
    isAdmin = true; 
    alert("관리자 권한이 활성화되었습니다."); 
    document.querySelectorAll('.target-accounting').forEach(el => el.classList.remove('hidden'));
    load(); 
}

// ==========================================
// 💡 메뉴 전환 및 [메뉴 색깔 스위치 (Active Class)] 완벽 복구
// ==========================================
function showView(viewName) {
    movingItem = null;
    
    // 1단계: 모든 화면 숨기기
    ['view-dashboard', 'view-order', 'view-products', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
        let el = document.getElementById(id); 
        if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    
    // 2단계: 우측 패널 제어
    let rs = document.getElementById('right-sidebar');
    if(viewName === 'order' && currentOrderTab === 'inventory') { 
        if(isRightPanelVisible && rs) { rs.classList.remove('hidden'); rs.classList.add('flex'); } 
    } else { 
        if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); } 
    }
    
    // 3단계: 선택한 화면 켜기
    let targetView = document.getElementById('view-' + viewName);
    if(targetView) { targetView.classList.remove('hidden'); targetView.classList.add('flex'); }

    // 4단계: PC 메뉴바 색깔 제어 (Active Class 처리 - 지금 보는 메뉴만 진하게!)
    document.querySelectorAll('.nav-btn-pc').forEach(btn => {
        btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'font-black', 'shadow-inner');
        btn.classList.add('border-slate-200', 'text-slate-600', 'font-bold');
    });
    const activeBtn = document.querySelector('.nav-btn-pc.target-' + viewName);
    if(activeBtn) {
        activeBtn.classList.remove('border-slate-200', 'text-slate-600', 'font-bold');
        activeBtn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-700', 'font-black', 'shadow-inner');
    }

    // 5단계: 모바일 메뉴바 색깔 제어 (Active Class 처리)
    document.querySelectorAll('.nav-btn-mo').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'border-indigo-300', 'bg-indigo-50');
        btn.classList.add('text-slate-600', 'border-slate-200', 'bg-white');
    });
    const activeMoBtn = document.querySelector('.nav-btn-mo.target-' + viewName);
    if(activeMoBtn) {
        activeMoBtn.classList.remove('text-slate-600', 'border-slate-200', 'bg-white');
        activeMoBtn.classList.add('text-indigo-600', 'border-indigo-300', 'bg-indigo-50');
    }

    // 6단계: 화면별 추가 렌더링 호출
    if(viewName === 'products') { if(typeof renderProductMaster === 'function') { renderProductMaster('finished'); switchProductTab('fp'); } } 
    else if(viewName === 'order') { if(typeof switchOrderTab === 'function') switchOrderTab(currentOrderTab); } 
    else if(viewName === 'dashboard') updateDashboard(); 
    else if(viewName === 'accounting') { 
        if(!isAdmin) { alert("관리자 권한이 필요합니다."); showView('dashboard'); return; }
        if(typeof renderAccounting === 'function') renderAccounting(); 
    } 
    else if(viewName === 'outbound') { if(typeof renderOutboundUI === 'function') renderOutboundUI(); } 
}

// ==========================================
// 대시보드 계산 로직 (관리자 금액 계산 유지)
// ==========================================
function updateDashboard() {
    try {
        if (!document.getElementById('dash-room-percent')) return;
        let roomOcc = 0, coldOcc = 0, floorOcc = 0;
        globalOccupancy.forEach(item => {
            if (!item || !item.location_id) return;
            if (item.location_id.startsWith('R-')) roomOcc++;
            else if (item.location_id.startsWith('C-')) coldOcc++;
            else if (item.location_id.startsWith('FL-')) floorOcc++;
        });

        let roomTotal = 0; layoutRoom.forEach(c => { if(!c.gap && !c.aisle) roomTotal += c.cols * 2; }); roomTotal += 20; 
        let coldTotal = 0; layoutCold.forEach(c => { if(!c.gap && !c.aisle) coldTotal += c.cols * 2; }); coldTotal += 16; 
        let floorTotal = 0; ['FL-1F-R', 'FL-1F-M', 'FL-1F-P', 'FL-2F-M', 'FL-2F-P', 'FL-3F-G'].forEach(area => { floorTotal += parseInt(localStorage.getItem(area + '_cols')) || 10; });

        let roomPct = Math.round((roomOcc / roomTotal) * 100) || 0;
        let coldPct = Math.round((coldOcc / coldTotal) * 100) || 0;
        let floorPct = Math.round((floorOcc / floorTotal) * 100) || 0;

        document.getElementById('dash-room-percent').innerText = roomPct + '%';
        document.getElementById('dash-room-donut').style.background = `conic-gradient(#f97316 ${roomPct}%, #e2e8f0 0%)`;
        let drTotal = document.getElementById('dash-room-total'); if(drTotal) drTotal.innerText = roomTotal;
        let drOcc = document.getElementById('dash-room-occ'); if(drOcc) drOcc.innerText = roomOcc;
        let drEmp = document.getElementById('dash-room-empty'); if(drEmp) drEmp.innerText = Math.max(0, roomTotal - roomOcc);

        document.getElementById('dash-cold-percent').innerText = coldPct + '%';
        document.getElementById('dash-cold-donut').style.background = `conic-gradient(#6366f1 ${coldPct}%, #e2e8f0 0%)`;
        let dcTotal = document.getElementById('dash-cold-total'); if(dcTotal) dcTotal.innerText = coldTotal;
        let dcOcc = document.getElementById('dash-cold-occ'); if(dcOcc) dcOcc.innerText = coldOcc;
        let dcEmp = document.getElementById('dash-cold-empty'); if(dcEmp) dcEmp.innerText = Math.max(0, coldTotal - coldOcc);

        document.getElementById('dash-floor-percent').innerText = floorPct + '%';
        document.getElementById('dash-floor-donut').style.background = `conic-gradient(#10b981 ${floorPct}%, #e2e8f0 0%)`;
        let dfTotal = document.getElementById('dash-floor-total'); if(dfTotal) dfTotal.innerText = floorTotal;
        let dfOcc = document.getElementById('dash-floor-occ'); if(dfOcc) dfOcc.innerText = floorOcc;
        let dfEmp = document.getElementById('dash-floor-empty'); if(dfEmp) dfEmp.innerText = Math.max(0, floorTotal - floorOcc);

        // 💡 대시보드 원래 비용 계산 (화면상단 콤보박스에 종속)
        let costOut = 0; let costIn = 0;
        let period = document.getElementById('dash-period')?.value || 'daily';
        let now = new Date(); let startDate = new Date();
        
        if (period === 'daily') startDate.setDate(now.getDate() - 1);
        else if (period === 'weekly') startDate.setDate(now.getDate() - 7);
        else if (period === 'monthly') startDate.setMonth(now.getMonth() - 1);
        
        globalHistory.forEach(h => {
            let hDate = new Date(h.created_at);
            if (hDate >= startDate) {
                let pInfo = productMaster.find(p => p.item_name === h.item_name) || finishedProductMaster.find(p => p.item_name === h.item_name);
                let price = pInfo ? (pInfo.unit_price || 0) : 0;
                let amount = h.quantity * price;
                if (h.action_type === '출고') costOut += amount;
                if (h.action_type === '입고') costIn += amount;
            }
        });

        let dtOut = document.getElementById('dash-cost-out'); if(dtOut) dtOut.innerText = costOut.toLocaleString() + ' 원';
        
        let label = "일간 기준";
        if(period === 'weekly') label = "주간 기준";
        if(period === 'monthly') label = "월간 기준";
        let dtLabel = document.getElementById('dash-cost-label'); if(dtLabel) dtLabel.innerText = label;

        if(isAdmin) {
            let pnl = document.getElementById('admin-finance-panel'); if(pnl) pnl.classList.remove('hidden');
            let totalAssetValue = 0;
            globalOccupancy.forEach(item => {
                let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
                totalAssetValue += (item.quantity * (pInfo ? (pInfo.unit_price || 0) : 0));
            });
            let dt = document.getElementById('dash-val-total'); if(dt) dt.innerText = totalAssetValue.toLocaleString() + ' 원';
            
            // 전역 변수로 자산가치만 저장 (비용은 팝업에서 따로 계산)
            window.currentAssetValue = totalAssetValue;
        } else {
            let pnl = document.getElementById('admin-finance-panel'); if(pnl) pnl.classList.add('hidden');
        }
    } catch (e) { console.error(e); }
}

// ==========================================
// 💡 [수정] 주간 보고서 생성 로직 (독립 달력 및 체크박스 완벽 적용)
// ==========================================
function generateWeeklyReport(isUpdate = false) {
    let startInput = document.getElementById('report-start-date');
    let endInput = document.getElementById('report-end-date');

    // 1. 처음 열었을 때는 최근 7일로 달력 세팅
    if(!isUpdate) {
        let today = new Date();
        let lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        
        startInput.value = lastWeek.toISOString().split('T')[0];
        endInput.value = today.toISOString().split('T')[0];
    }
    
    let startDateStr = startInput.value;
    let endDateStr = endInput.value;

    if(!startDateStr || !endDateStr) return;
    if(startDateStr > endDateStr) return alert("시작일이 종료일보다 늦을 수 없습니다.");

    // 2. 비용 데이터 (달력 기간 기준으로 독립적으로 완벽하게 재계산)
    let costOut = 0; let costIn = 0;
    globalHistory.forEach(h => {
        // 날짜 비교를 위해 YYYY-MM-DD 형식으로 통일
        let hDateStr = new Date(h.created_at).toISOString().split('T')[0];
        
        if (hDateStr >= startDateStr && hDateStr <= endDateStr) {
            let pInfo = productMaster.find(p => p.item_name === h.item_name) || finishedProductMaster.find(p => p.item_name === h.item_name);
            let price = pInfo ? (pInfo.unit_price || 0) : 0;
            let amount = h.quantity * price;
            
            if (h.action_type === '출고') costOut += amount;
            if (h.action_type === '입고') costIn += amount;
        }
    });

    if(!window.currentAssetValue) updateDashboard(); 
    
    document.getElementById('report-total-asset').innerText = (window.currentAssetValue || 0).toLocaleString() + ' 원';
    document.getElementById('report-in-cost').innerText = costIn.toLocaleString() + ' 원';
    document.getElementById('report-out-cost').innerText = costOut.toLocaleString() + ' 원';

    // 3. 창고 가동률 막대그래프 동기화
    let roomPct = document.getElementById('dash-room-percent').innerText || '0%';
    let coldPct = document.getElementById('dash-cold-percent').innerText || '0%';
    
    document.getElementById('report-room-pct').innerText = roomPct;
    document.getElementById('report-room-bar').style.width = roomPct;
    
    document.getElementById('report-cold-pct').innerText = coldPct;
    document.getElementById('report-cold-bar').style.width = coldPct;

    // 4. 안전재고 미달 품목 (목표 파레트 기준) & [재고 0개 제외] 필터 연동
    let materialProducts = productMaster.filter(p => p.category && !p.category.includes('원란'));
    let aggregatedItems = {};
    materialProducts.forEach(p => { 
        aggregatedItems[p.item_name] = { item_name: p.item_name, total_pallet: 0 }; 
    });

    globalOccupancy.forEach(item => { 
        if(aggregatedItems[item.item_name]) { 
            let pInfo = productMaster.find(p => p.item_name === item.item_name);
            let pEa = pInfo && pInfo.pallet_ea > 0 ? pInfo.pallet_ea : 1;
            aggregatedItems[item.item_name].total_pallet += (item.quantity / pEa); 
        } 
    });
    
    let targetPallets = document.getElementById('safe-pallet-target') ? parseFloat(document.getElementById('safe-pallet-target').value) : 5;
    let hideZero = document.getElementById('report-hide-zero').checked; // 체크박스 상태 확인
    
    let riskList = Object.values(aggregatedItems)
        .filter(i => {
            if (hideZero && i.total_pallet === 0) return false; // 재고 0개 제외 옵션 켜지면 0은 컷
            return i.total_pallet < targetPallets;
        })
        .sort((a,b) => a.total_pallet - b.total_pallet);
    
    let riskHtml = '';
    if(riskList.length === 0) {
        riskHtml = `<tr><td colspan="4" class="py-4 text-center text-slate-400">🚨 현재 조건에 미달된 품목이 없어 안전합니다!</td></tr>`;
    } else {
        riskList.forEach(item => {
            riskHtml += `
                <tr>
                    <td class="py-2">${item.item_name}</td>
                    <td class="py-2 text-right text-rose-600">${item.total_pallet.toFixed(1)} P</td>
                    <td class="py-2 text-right text-slate-400">${targetPallets} P</td>
                    <td class="py-2 text-center"><span class="bg-rose-100 text-rose-700 px-2 py-1 rounded text-xs">긴급 발주 요망</span></td>
                </tr>
            `;
        });
    }
    document.getElementById('report-risk-list').innerHTML = riskHtml;

    // 5. 달력 기간 내 많이 나간(출고) 품목 Top 3 추출
    let outCount = {};
    globalHistory.forEach(h => {
        let hDateStr = new Date(h.created_at).toISOString().split('T')[0];
        if(h.action_type === '출고' && hDateStr >= startDateStr && hDateStr <= endDateStr) {
            outCount[h.item_name] = (outCount[h.item_name] || 0) + h.quantity;
        }
    });
    
    let topItems = Object.entries(outCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
        
    let topHtml = '';
    let medals = ['🥇', '🥈', '🥉'];
    if(topItems.length === 0) {
        topHtml = `<div class="text-center text-slate-400 py-2">조회 기간 내 출고 내역이 없습니다.</div>`;
    } else {
        topItems.forEach((item, idx) => {
            topHtml += `
                <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200">
                    <span class="font-black text-slate-700">${medals[idx]} ${item[0]}</span>
                    <span class="font-bold text-indigo-600">${item[1].toLocaleString()} EA 출고</span>
                </div>
            `;
        });
    }
    document.getElementById('report-top-items').innerHTML = topHtml;

    // 6. 모달 띄우기
    if(!isUpdate) {
        let modal = document.getElementById('weekly-report-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeWeeklyReport() {
    let modal = document.getElementById('weekly-report-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ==========================================
// 위치 아이디 계산 및 엑셀 다운로드 로직 완벽 복구
// ==========================================
function getAllLocationIds() {
    let ids = [];
    for(let i=1; i<=30; i++) ids.push(`W-${i.toString().padStart(2, '0')}`);
    layoutRoom.forEach(col => { if(!col.aisle && !col.gap) { for(let r=1; r<=col.cols; r++) { let base = `R-${col.id}-${r.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); } } });
    for(let c=1; c<=10; c++) { let base = `R-K-${c.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); }
    layoutCold.forEach(col => { if(!col.aisle && !col.gap) { for(let r=1; r<=col.cols; r++) { let base = `C-${col.id}-${r.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); } } });
    for(let c=1; c<=8; c++) { let base = `C-I-${c.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); }
    ['FL-1F-R', 'FL-1F-M', 'FL-1F-P', 'FL-2F-M', 'FL-2F-P', 'FL-3F-G'].forEach(area => { let cols = parseInt(localStorage.getItem(area + '_cols')) || 10; for(let r=1; r<=cols; r++) ids.push(`${area}-${r.toString().padStart(2, '0')}`); });
    return ids;
}

function exportPhysicalCountExcel() {
    try {
        const allLocs = getAllLocationIds();
        const occMap = {};
        globalOccupancy.forEach(item => { if(!occMap[item.location_id]) occMap[item.location_id] = []; occMap[item.location_id].push(item); });
        
        let wsData = allLocs.map(locId => {
            const items = occMap[locId];
            if (items && items.length > 0) {
                return items.map(item => ({ "위치": locId, "카테고리": item.category || "", "품목명": item.item_name || "", "입고처": item.remarks || "기본입고처", "전산수량(EA)": item.quantity, "실사수량(EA)": "", "차이": "", "비고": "" }));
            }
            return { "위치": locId, "카테고리": "-", "품목명": "[비어있음]", "입고처": "-", "전산수량(EA)": 0, "실사수량(EA)": "", "차이": "", "비고": "" };
        }).flat();

        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(wsData);
        ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 20}];
        XLSX.utils.book_append_sheet(wb, ws, "재고실사양식(전체)"); 
        XLSX.writeFile(wb, `한스팜_전체렉실사양식_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) { alert("엑셀 추출 오류가 발생했습니다."); }
}

function exportAllHistoryExcel() {
    try {
        let sorted = [...globalHistory].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        let wsData = sorted.map(h => ({ "일시": new Date(h.created_at).toLocaleString(), "위치": h.location_id, "작업": h.action_type, "카테고리": h.category, "품목명": h.item_name, "수량(EA)": h.quantity, "비고": h.remarks }));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "히스토리"); 
        XLSX.writeFile(wb, `한스팜_히스토리_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch(e) { alert("오류 발생"); }
}

// ==========================================
// 우측 패널 및 모달 제어
// ==========================================
function showHistoryModal(locId) {
    let locHistory = globalHistory.filter(h => h.location_id === locId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);
    let titleEl = document.getElementById('history-modal-title'); if(titleEl) titleEl.innerText = `${locId} 전체 기록`;
    let html = '';
    locHistory.forEach(h => {
        let actionColor = h.action_type === '입고' ? 'text-emerald-600' : (h.action_type === '출고' ? 'text-rose-600' : 'text-blue-600'); 
        html += `<div class="bg-slate-50 p-3 border rounded shadow-sm text-xs"><span class="font-bold ${actionColor}">[${h.action_type}]</span> <span class="text-slate-500">${new Date(h.created_at).toLocaleString()}</span><br><span class="font-bold text-slate-700 block mt-1">${h.item_name} (${h.quantity}EA)</span></div>`;
    });
    let contentEl = document.getElementById('history-modal-content'); if(contentEl) contentEl.innerHTML = html || '<div class="text-center text-slate-400">기록 없음</div>';
    let modalEl = document.getElementById('history-modal'); if(modalEl) { modalEl.classList.remove('hidden'); modalEl.classList.add('flex'); }
}

function closeHistoryModal() { 
    let modalEl = document.getElementById('history-modal'); 
    if(modalEl) { modalEl.classList.add('hidden'); modalEl.classList.remove('flex'); } 
}

function toggleRightPanel() { 
    let rs = document.getElementById('right-sidebar'); if(!rs) return; 
    isRightPanelVisible = !isRightPanelVisible; 
    if(isRightPanelVisible) { rs.classList.remove('hidden'); rs.classList.add('flex'); } 
    else { rs.classList.add('hidden'); rs.classList.remove('flex'); } 
}

function closeInfoPanel() { 
    let rs = document.getElementById('right-sidebar'); 
    if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); isRightPanelVisible = false; } 
    selectedCellId = null; 
    movingItem = null; 
    renderMap(); 
}

// ==========================================
// 🌐 다국어(i18n) 지원 로직 (한국어 / 영어)
// ==========================================
let currentLang = 'ko';

const langDict = {
    'ko': {
        'nav_dashboard': '대시보드', 'nav_order': '재고/발주', 'nav_prod': '생산관리', 'nav_outbound': '출고관리', 'nav_items': '품목관리',
        'tab_map': '렉맵', 'tab_search': '재고조회', 'tab_history': '발주조회', 'tab_daily': '📅 일자별 재고', 'tab_safety': '안전재고설정',
        'zone_room': '실온 (Room)', 'zone_cold': '냉장 (Cold)', 'zone_floor': '생산 현장',
        'btn_panel': '우측 패널 켬/끔', 'btn_wait': '대기장', 'btn_scan': '스캔창', 'btn_hist_excel': '히스토리 엑셀', 'btn_close_inv': '재고마감',
        'lbl_aisle': '통로 (Aisle)',
        'btn_floor_out': '현장 반출', 'btn_move': '렉 이동', 'btn_final_out': '최종 출고', 'btn_split': '분할',
        'lbl_supplier': '입고처', 'lbl_empty': '비어있음'
    },
    'en': {
        'nav_dashboard': 'Dashboard', 'nav_order': 'Inventory', 'nav_prod': 'Production', 'nav_outbound': 'Outbound', 'nav_items': 'Products',
        'tab_map': 'Rack Map', 'tab_search': 'Search', 'tab_history': 'Orders', 'tab_daily': '📅 Daily Stock', 'tab_safety': 'Safety Stock',
        'zone_room': 'Room Temp', 'zone_cold': 'Cold Storage', 'zone_floor': 'Prod. Site',
        'btn_panel': 'Toggle Panel', 'btn_wait': 'Waiting Area', 'btn_scan': 'Scan Tool', 'btn_hist_excel': 'History Excel', 'btn_close_inv': 'Close Inv.',
        'lbl_aisle': 'Aisle',
        'btn_floor_out': 'To Floor', 'btn_move': 'Move Rack', 'btn_final_out': 'Final Outbound', 'btn_split': 'Split',
        'lbl_supplier': 'Supplier', 'lbl_empty': 'Empty'
    }
};

function t(key) {
    return (langDict[currentLang] && langDict[currentLang][key]) ? langDict[currentLang][key] : key;
}

function toggleLanguage() {
    currentLang = currentLang === 'ko' ? 'en' : 'ko';
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if(langDict[currentLang] && langDict[currentLang][key]) {
            el.innerText = langDict[currentLang][key];
        }
    });

    const btn = document.getElementById('lang-toggle-btn');
    if(btn) {
        btn.innerText = currentLang === 'ko' ? '🌐 EN' : '🌐 KO';
    }

    if(typeof renderMap === 'function') renderMap();
    if(selectedCellId && typeof clickCell === 'function') {
        const cellEl = document.getElementById('cell-' + selectedCellId);
        clickCell(cellEl ? cellEl.innerText : selectedCellId, selectedCellId);
    }
}
