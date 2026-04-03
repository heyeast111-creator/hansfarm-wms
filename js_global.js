// ==========================================
// [글로벌 변수 및 기초 설정]
// ==========================================
let globalOccupancy = [];
let globalHistory = [];
let productMaster = [];
let finishedProductMaster = [];
let bomMaster = [];
let orderCart = [];
let bomCart = [];

let currentZone = '실온';
let selectedCellId = null;
let movingItem = null;
let currentOrderTab = 'inventory';
let globalSearchTargets = [];
let isRightPanelVisible = false;
let isAdmin = false;
let loginMode = null; // 'admin' or 'viewer'

let editingProductOriginalName = null;
let editingProductOriginalSupplier = null;
let expandedBomRows = {};

// 💡 실온 / 냉장 창고 레이아웃 정의 (칸수 설정)
const layoutRoom = [
    { id: 'A', cols: 10 }, { id: 'B', cols: 10 }, { id: 'C', cols: 10 }, { aisle: true },
    { id: 'D', cols: 10 }, { gap: true }, { id: 'E', cols: 10 }, { aisle: true },
    { id: 'F', cols: 12 }, { id: 'G', cols: 12 }, { id: 'H', cols: 12 }, { id: 'I', cols: 12 }
];

const layoutCold = [
    { id: 'A', cols: 8 }, { id: 'B', cols: 8 }, { id: 'C', cols: 8 }, { aisle: true },
    { id: 'D', cols: 8 }, { gap: true }, { id: 'E', cols: 8 }, { aisle: true },
    { id: 'F', cols: 8 }, { id: 'G', cols: 8 }, { id: 'H', cols: 8 }
];

// ==========================================
// [로그인 및 화면 네비게이션] (💡 00700 및 0000 모두 허용)
// ==========================================
function siteLogin() {
    let pw = document.getElementById('site-pw').value;
    if(pw === "00700" || pw === "0000") { // 뷰어 모드 (00700 허용)
        loginMode = 'viewer'; isAdmin = false;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        let accTab = document.querySelector('.target-accounting');
        if(accTab) accTab.classList.add('hidden'); // 뷰어는 정산/회계 숨김
        showView('order'); // 로그인 직후 재고/발주 화면 띄우기
        load();
    } else if(pw === "123456789*") { // 관리자 모드
        loginMode = 'admin'; isAdmin = true;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        let accTab = document.querySelector('.target-accounting');
        if(accTab) accTab.classList.remove('hidden'); // 관리자는 노출
        showView('order'); // 로그인 직후 재고/발주 화면 띄우기
        load();
    } else {
        alert("비밀번호가 틀렸습니다.");
    }
}

function adminLogin() {
    if(isAdmin) return;
    let pw = prompt("관리자 비밀번호를 입력하세요:");
    if(pw === "123456789*") {
        loginMode = 'admin'; isAdmin = true;
        let accTab = document.querySelector('.target-accounting');
        if(accTab) accTab.classList.remove('hidden');
        alert("관리자 모드로 전환되었습니다.");
        load();
    } else if(pw !== null) {
        alert("비밀번호가 틀렸습니다.");
    }
}

function showView(viewId) {
    ['dashboard', 'order', 'production', 'outbound', 'products', 'accounting'].forEach(v => {
        let el = document.getElementById('view-' + v);
        if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
        document.querySelectorAll('.target-' + v).forEach(btn => {
            btn.classList.remove('bg-indigo-50', 'text-indigo-700', 'shadow-inner', 'border-indigo-200');
            btn.classList.add('text-slate-600', 'bg-white');
        });
    });
    
    let target = document.getElementById('view-' + viewId);
    if(target) { target.classList.remove('hidden'); target.classList.add('flex'); }
    
    document.querySelectorAll('.target-' + viewId).forEach(btn => {
        btn.classList.add('bg-indigo-50', 'text-indigo-700', 'shadow-inner', 'border-indigo-200');
        btn.classList.remove('text-slate-600', 'bg-white');
    });
    
    if(viewId === 'dashboard') { if(typeof updateDashboard === 'function') updateDashboard(); }
    if(viewId === 'order') { 
        if(typeof switchOrderTab === 'function') switchOrderTab(currentOrderTab); 
        if(typeof switchZone === 'function') switchZone(currentZone); 
    }
    if(viewId === 'accounting') { 
        if(typeof toggleAccDateInput === 'function') toggleAccDateInput(); 
        if(typeof updateAccFilters === 'function') updateAccFilters('type'); 
    }
}

function toggleRightPanel() {
    let rs = document.getElementById('right-sidebar');
    if(!rs) return;
    if(rs.classList.contains('hidden')) { 
        rs.classList.remove('hidden'); rs.classList.add('flex'); isRightPanelVisible = true; 
    } else { 
        rs.classList.add('hidden'); rs.classList.remove('flex'); isRightPanelVisible = false; 
    }
}

function closeInfoPanel() {
    let rs = document.getElementById('right-sidebar');
    if(rs) { rs.classList.add('hidden'); rs.classList.remove('flex'); isRightPanelVisible = false; }
    selectedCellId = null; 
    if(typeof renderMap === 'function') renderMap();
}

function closeHistoryModal() {
    let m = document.getElementById('history-modal');
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}

// ==========================================
// [데이터 로드 (DB 통신)] (💡 렉맵 증발 및 데이터 로딩 문제 완벽 해결)
// ==========================================
async function load() {
    try {
        const fetchSafe = async (url) => {
            try {
                let res = await fetch(url);
                let data = await res.json();
                return Array.isArray(data) ? data : []; // 배열이 아니면 무조건 빈 배열 반환해서 에러 방어
            } catch(e) { return []; }
        };

        // 데이터 개별 호출로 안정성 극대화
        globalOccupancy = await fetchSafe('/api/occupancy');
        globalHistory = await fetchSafe('/api/history');
        productMaster = await fetchSafe('/api/products');
        finishedProductMaster = await fetchSafe('/api/finished_products');
        bomMaster = await fetchSafe('/api/bom');

        // UI 렌더링 동기화
        if (typeof renderMap === 'function') renderMap();
        if (typeof populateWaitDropdowns === 'function') populateWaitDropdowns();
        if (typeof updateDashboard === 'function') updateDashboard();
        if (typeof renderSafetyStock === 'function') renderSafetyStock();
        if (typeof updateSummarySupplierDropdown === 'function') updateSummarySupplierDropdown();
        if (typeof renderOrderList === 'function') renderOrderList();
        if (typeof renderAccounting === 'function') renderAccounting();
        if (typeof renderProductMaster === 'function') {
            renderProductMaster('finished');
            renderProductMaster('materials');
        }
        
    } catch(e) {
        console.error("데이터 로드 실패:", e);
    }
}

// ==========================================
// [기본 엑셀 입출력 기능]
// ==========================================
function exportPhysicalCountExcel() {
    let wsData = [["위치", "품목명", "전산수량(EA)", "실사수량(EA)", "차이", "비고(입고처)"]];
    globalOccupancy.forEach(o => {
        wsData.push([o.location_id, o.item_name, o.quantity, "", "", o.remarks || ""]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch: 15}, {wch: 30}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 20}];
    XLSX.utils.book_append_sheet(wb, ws, "재고실사");
    XLSX.writeFile(wb, `한스팜_재고실사_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportAllHistoryExcel() {
    let wsData = [["일시", "유형", "위치", "카테고리", "품목명", "수량", "입고처/비고"]];
    globalHistory.forEach(h => {
        wsData.push([h.created_at, h.action_type, h.location_id, h.category || "", h.item_name, h.quantity, h.remarks || ""]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch: 20}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 30}, {wch: 10}, {wch: 20}];
    XLSX.utils.book_append_sheet(wb, ws, "전체히스토리");
    XLSX.writeFile(wb, `한스팜_히스토리_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function importExcel(e) {
    if(loginMode === 'viewer') return alert("뷰어 모드에서는 불가능합니다.");
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(ev) {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if(json.length > 0) {
                await fetch('/api/inbound_batch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(json) });
                alert("엑셀 입고 완료!"); await load();
            }
        } catch(err) { alert("엑셀 업로드 중 오류가 발생했습니다."); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
}

// ==========================================
// 💡 [대시보드 패치] 에러 방어 및 완벽 호환 모드 (0% 해결)
// ==========================================
function updateDashboard() {
    try {
        if (!document.getElementById('dash-room-percent')) return;

        let roomOcc = 0, coldOcc = 0, floorOcc = 0;
        
        // 💡 window. 삭제하여 충돌 에러 완전 방지
        globalOccupancy.forEach(item => {
            if (!item || !item.location_id) return;
            if (item.location_id.startsWith('R-')) roomOcc++;
            else if (item.location_id.startsWith('C-')) coldOcc++;
            else if (item.location_id.startsWith('FL-')) floorOcc++;
        });

        let roomTotal = 0;
        if(typeof layoutRoom !== 'undefined') {
            layoutRoom.forEach(c => { if(!c.gap && !c.aisle) roomTotal += c.cols * 2; }); 
            roomTotal += 20; 
        } else { roomTotal = 150; }

        let coldTotal = 0;
        if(typeof layoutCold !== 'undefined') {
            layoutCold.forEach(c => { if(!c.gap && !c.aisle) coldTotal += c.cols * 2; });
            coldTotal += 16; 
        } else { coldTotal = 100; }

        let floorTotal = 0;
        ['FL-1F-R', 'FL-1F-M', 'FL-1F-P', 'FL-2F-M', 'FL-2F-P', 'FL-3F-G'].forEach(area => {
            floorTotal += parseInt(localStorage.getItem(area + '_cols')) || 10;
        });

        let roomPct = roomTotal > 0 ? Math.min(100, Math.round((roomOcc / roomTotal) * 100)) : 0;
        let coldPct = coldTotal > 0 ? Math.min(100, Math.round((coldOcc / coldTotal) * 100)) : 0;
        let floorPct = floorTotal > 0 ? Math.min(100, Math.round((floorOcc / floorTotal) * 100)) : 0;

        document.getElementById('dash-room-percent').innerText = roomPct + '%';
        document.getElementById('dash-room-total').innerText = roomTotal.toLocaleString() + ' 렉';
        document.getElementById('dash-room-occ').innerText = roomOcc.toLocaleString() + ' 렉';
        document.getElementById('dash-room-empty').innerText = Math.max(0, roomTotal - roomOcc).toLocaleString() + ' 렉';
        document.getElementById('dash-room-donut').style.background = `conic-gradient(#f97316 ${roomPct}%, #e2e8f0 0%)`;

        document.getElementById('dash-cold-percent').innerText = coldPct + '%';
        document.getElementById('dash-cold-total').innerText = coldTotal.toLocaleString() + ' 렉';
        document.getElementById('dash-cold-occ').innerText = coldOcc.toLocaleString() + ' 렉';
        document.getElementById('dash-cold-empty').innerText = Math.max(0, coldTotal - coldOcc).toLocaleString() + ' 렉';
        document.getElementById('dash-cold-donut').style.background = `conic-gradient(#6366f1 ${coldPct}%, #e2e8f0 0%)`;

        document.getElementById('dash-floor-percent').innerText = floorPct + '%';
        document.getElementById('dash-floor-total').innerText = floorTotal.toLocaleString() + ' 렉';
        document.getElementById('dash-floor-occ').innerText = floorOcc.toLocaleString() + ' 렉';
        document.getElementById('dash-floor-empty').innerText = Math.max(0, floorTotal - floorOcc).toLocaleString() + ' 렉';
        document.getElementById('dash-floor-donut').style.background = `conic-gradient(#10b981 ${floorPct}%, #e2e8f0 0%)`;

        if(typeof isAdmin !== 'undefined' && isAdmin) {
            let pnl = document.getElementById('admin-finance-panel');
            if(pnl) pnl.classList.remove('hidden');
            let roomVal = 0, coldVal = 0, floorVal = 0;
            
            globalOccupancy.forEach(item => {
                let price = 0;
                if(typeof finishedProductMaster !== 'undefined' && typeof productMaster !== 'undefined') {
                    let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
                    price = pInfo ? (pInfo.unit_price || 0) : 0;
                }
                let val = item.quantity * price;

                if (item.location_id.startsWith('R-')) roomVal += val;
                else if (item.location_id.startsWith('C-')) coldVal += val;
                else if (item.location_id.startsWith('FL-')) floorVal += val;
            });

            let dr = document.getElementById('dash-val-room'); if(dr) dr.innerText = roomVal.toLocaleString() + ' 원';
            let dc = document.getElementById('dash-val-cold'); if(dc) dc.innerText = coldVal.toLocaleString() + ' 원';
            let df = document.getElementById('dash-val-floor'); if(df) df.innerText = floorVal.toLocaleString() + ' 원';
            let dt = document.getElementById('dash-val-total'); if(dt) dt.innerText = (roomVal + coldVal + floorVal).toLocaleString() + ' 원';

            let period = document.getElementById('dash-period') ? document.getElementById('dash-period').value : 'daily';
            let outCost = 0;
            let now = new Date();
            
            globalHistory.forEach(h => {
                if(h.action_type === '출고') {
                    let hDate = new Date(h.created_at);
                    let diffDays = (now - hDate) / (1000 * 60 * 60 * 24);
                    let include = false;

                    if(period === 'daily' && diffDays <= 1) include = true;
                    else if(period === 'weekly' && diffDays <= 7) include = true;
                    else if(period === 'monthly' && diffDays <= 30) include = true;

                    if(include) {
                        let price = 0;
                        if(typeof finishedProductMaster !== 'undefined' && typeof productMaster !== 'undefined') {
                            let pInfo = finishedProductMaster.find(p => p.item_name === h.item_name) || productMaster.find(p => p.item_name === h.item_name);
                            price = pInfo ? (pInfo.unit_price || 0) : 0;
                        }
                        outCost += h.quantity * price;
                    }
                }
            });

            let dco = document.getElementById('dash-cost-out'); if(dco) dco.innerText = outCost.toLocaleString() + ' 원';
            let lbl = period === 'daily' ? '일간 기준' : (period === 'weekly' ? '주간 기준' : '월간 기준');
            let dcl = document.getElementById('dash-cost-label'); if(dcl) dcl.innerText = lbl;
        }
    } catch (error) {
        console.error("대시보드 렌더링 에러 방어:", error);
    }
}
