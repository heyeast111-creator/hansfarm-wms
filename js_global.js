// ==========================================
// 전역 변수 (Global Variables)
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

const layoutRoom = [ { id: 'J', cols: 10 }, { aisle: true }, { id: 'I', cols: 12 }, { gap: true }, { id: 'H', cols: 12 }, { aisle: true }, { id: 'G', cols: 12 }, { gap: true }, { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 10 } ];
const layoutCold = [ { id: 'F', cols: 12 }, { aisle: true }, { id: 'E', cols: 10 }, { gap: true }, { id: 'D', cols: 10 }, { aisle: true }, { id: 'C', cols: 10 }, { gap: true }, { id: 'B', cols: 10 }, { aisle: true }, { id: 'A', cols: 12 } ];

// ==========================================
// 로그인 및 초기 로딩 (5000줄 제한 해제 버전)
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
            fetch('/api/inventory?t=' + ts), fetch('/api/products?t=' + ts), fetch('/api/finished_products?t=' + ts), fetch('/api/bom?t=' + ts),
            fetch(`${SUPABASE_URL}/rest/v1/history_log?select=*&order=created_at.desc&limit=5000`, { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } })
        ]);
        
        globalOccupancy = await occRes.json();
        productMaster = await prodRes.json();
        finishedProductMaster = await fpRes.json();
        bomMaster = await bomRes.json();
        globalHistory = await histRes.json();
        
        renderAll(); 
    } catch (e) { console.error("로딩 에러:", e); }
}

function renderAll() {
    try { if(typeof renderMap === 'function') renderMap(); } catch(e){}
    try { updateDashboard(); } catch(e){}
    try { if(typeof renderAccounting === 'function') renderAccounting(); } catch(e){} 
}

// ==========================================
// 관리자 및 뷰 네비게이션
// ==========================================
function adminLogin() {
    if(isAdmin) { isAdmin = false; alert("관리자 모드가 해제되었습니다."); updateDashboard(); return; }
    const pw = prompt("관리자 비밀번호를 입력하세요:"); 
    if(pw === "123456789*") { isAdmin = true; alert("관리자 권한이 활성화되었습니다."); load(); } 
    else if (pw !== null) { alert("비밀번호가 틀렸습니다."); }
}

function showView(viewName) {
    ['view-dashboard', 'view-order', 'view-products', 'view-accounting', 'view-production', 'view-outbound'].forEach(id => { 
        let el = document.getElementById(id); if(el) el.classList.add('hidden');
    });
    let targetView = document.getElementById('view-' + viewName);
    if(targetView) { targetView.classList.remove('hidden'); targetView.classList.add('flex'); }
    if(viewName === 'dashboard') updateDashboard(); 
}

// ==========================================
// 📊 [핵심 업데이트] 재고실사양식 (비어있는 렉 포함)
// ==========================================
function getAllLocationIds() {
    let ids = [];
    // 1. 입고 대기장 (W-01 ~ W-30)
    for(let i=1; i<=30; i++) ids.push(`W-${i.toString().padStart(2, '0')}`);
    // 2. 실온창고 (R-)
    layoutRoom.forEach(col => { if(!col.aisle && !col.gap) { for(let r=1; r<=col.cols; r++) { let base = `R-${col.id}-${r.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); } } });
    for(let c=1; c<=10; c++) { let base = `R-K-${c.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); }
    // 3. 냉장창고 (C-)
    layoutCold.forEach(col => { if(!col.aisle && !col.gap) { for(let r=1; r<=col.cols; r++) { let base = `C-${col.id}-${r.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); } } });
    for(let c=1; c<=8; c++) { let base = `C-I-${c.toString().padStart(2, '0')}`; ids.push(base); ids.push(base + "-2F"); }
    // 4. 생산현장 (FL-)
    const prodAreas = ['FL-1F-R', 'FL-1F-M', 'FL-1F-P', 'FL-2F-M', 'FL-2F-P', 'FL-3F-G'];
    prodAreas.forEach(area => { let cols = parseInt(localStorage.getItem(area + '_cols')) || 10; for(let r=1; r<=cols; r++) ids.push(`${area}-${r.toString().padStart(2, '0')}`); });
    return ids;
}

function exportPhysicalCountExcel() {
    try {
        const allLocs = getAllLocationIds();
        const occMap = {};
        globalOccupancy.forEach(item => {
            if(!occMap[item.location_id]) occMap[item.location_id] = [];
            occMap[item.location_id].push(item);
        });

        let wsData = [];
        allLocs.forEach(locId => {
            const items = occMap[locId];
            if (items && items.length > 0) {
                items.forEach(item => {
                    wsData.push({ "위치": locId, "카테고리": item.category || "", "품목명": item.item_name || "", "입고처": item.remarks || "기본입고처", "전산수량(EA)": item.quantity, "실사수량(EA)": "", "차이": "", "비고": "" });
                });
            } else {
                // 💡 비어있는 렉 정보 추가
                wsData.push({ "위치": locId, "카테고리": "-", "품목명": "[비어있음]", "입고처": "-", "전산수량(EA)": 0, "실사수량(EA)": "", "차이": "", "비고": "" });
            }
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(wsData);
        ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 20}];
        XLSX.utils.book_append_sheet(wb, ws, "재고실사양식(전체)");
        XLSX.writeFile(wb, `한스팜_전체렉실사양식_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) { alert("실사양식 추출 중 오류가 발생했습니다."); }
}

// ==========================================
// 대시보드 및 주간 보고서 (기존 로직 유지)
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

        let roomPct = Math.round((roomOcc / roomTotal) * 100);
        let coldPct = Math.round((coldOcc / coldTotal) * 100);
        let floorPct = Math.round((floorOcc / floorTotal) * 100);

        document.getElementById('dash-room-percent').innerText = roomPct + '%';
        document.getElementById('dash-room-donut').style.background = `conic-gradient(#f97316 ${roomPct}%, #e2e8f0 0%)`;
        document.getElementById('dash-cold-percent').innerText = coldPct + '%';
        document.getElementById('dash-cold-donut').style.background = `conic-gradient(#6366f1 ${coldPct}%, #e2e8f0 0%)`;
        document.getElementById('dash-floor-percent').innerText = floorPct + '%';
        document.getElementById('dash-floor-donut').style.background = `conic-gradient(#10b981 ${floorPct}%, #e2e8f0 0%)`;

        if(isAdmin) {
            let totalAssetValue = 0;
            globalOccupancy.forEach(item => {
                let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
                totalAssetValue += (item.quantity * (pInfo ? (pInfo.unit_price || 0) : 0));
            });
            let dt = document.getElementById('dash-val-total'); if(dt) dt.innerText = totalAssetValue.toLocaleString() + ' 원';
        }
    } catch (e) {}
}

function openWeeklyReportModal(start, end) {
    let modal = document.getElementById('weekly-report-modal');
    if(!modal) {
        modal = document.createElement('div');
        modal.id = 'weekly-report-modal';
        modal.className = 'hidden fixed inset-0 bg-slate-900 bg-opacity-70 items-center justify-center z-[300] p-4';
        document.body.appendChild(modal);
    }

    let today = new Date();
    let defaultStart = new Date(); defaultStart.setDate(today.getDate() - 7);
    let startDate = start ? new Date(start) : defaultStart;
    let endDate = end ? new Date(end) : today;
    
    let totalPurchase = 0;
    let supplierMap = {};
    globalHistory.forEach(h => {
        let hDate = new Date(h.created_at);
        if(h.action_type === '입고' && hDate >= startDate && hDate <= endDate) {
            let qty = h.acc_qty !== undefined && h.acc_qty !== null ? h.acc_qty : h.quantity;
            let sup = String(h.remarks || "기본입고처").replace(/\[기존재고\]/g, '').trim();
            let pInfo = finishedProductMaster.find(p => p.item_name === h.item_name) || productMaster.find(p => p.item_name === h.item_name);
            let amount = qty * (h.acc_price || (pInfo ? pInfo.unit_price : 0));
            totalPurchase += amount;
            if(!supplierMap[sup]) supplierMap[sup] = 0; supplierMap[sup] += amount;
        }
    });

    let topSupHtml = Object.entries(supplierMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map((s, idx) => {
        let pct = totalPurchase > 0 ? Math.round((s[1] / totalPurchase) * 100) : 0;
        return `<div class="flex justify-between py-1 border-b last:border-0"><span class="text-sm font-bold">${idx+1}. ${s[0]}</span><span class="text-sm font-black">${s[1].toLocaleString()}원 (${pct}%)</span></div>`;
    }).join('') || '<div class="text-center py-4 text-slate-400">내역 없음</div>';

    let roomOcc = 0, coldOcc = 0, floorOcc = 0, totalAsset = 0;
    let stagnantHtml = '', stagnantCount = 0;
    let threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(today.getMonth() - 3);

    globalOccupancy.forEach(item => {
        if (item.location_id.startsWith('R-')) roomOcc++; else if (item.location_id.startsWith('C-')) coldOcc++; else if (item.location_id.startsWith('FL-')) floorOcc++;
        let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
        totalAsset += (item.quantity * (pInfo ? pInfo.unit_price : 0));
        if(item.production_date && new Date(item.production_date) < threeMonthsAgo) {
            stagnantCount++;
            if(stagnantCount <= 5) stagnantHtml += `<div class="flex justify-between text-xs py-1 border-b last:border-0"><span class="font-bold text-slate-500">${item.location_id}</span><span class="truncate px-2 flex-1">${item.item_name}</span><span class="font-black text-rose-600">${item.quantity}EA</span></div>`;
        }
    });

    let roomPct = Math.round((roomOcc / 170) * 100); let coldPct = Math.round((coldOcc / 116) * 100); let floorPct = Math.round((floorOcc / 60) * 100);

    modal.innerHTML = `
        <div class="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-[popup_0.2s_ease-out_forwards]">
            <div class="bg-slate-800 p-5 flex justify-between items-center text-white"><h2 class="text-xl font-black">📊 경영 요약 보고서</h2><button onclick="document.getElementById('weekly-report-modal').classList.add('hidden');" class="text-slate-400 hover:text-white"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke-width="2"></path></svg></button></div>
            <div class="p-5 bg-slate-100 border-b flex items-center gap-3"><input type="date" id="wr-start" value="${startDate.toISOString().split('T')[0]}" class="border rounded px-2 py-1 text-xs font-bold shadow-sm"><span class="text-slate-400">~</span><input type="date" id="wr-end" value="${endDate.toISOString().split('T')[0]}" class="border rounded px-2 py-1 text-xs font-bold shadow-sm"><button onclick="openWeeklyReportModal(document.getElementById('wr-start').value, document.getElementById('wr-end').value)" class="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-black shadow-md">조회</button></div>
            <div class="p-6 overflow-y-auto space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-white p-5 rounded-2xl border-l-4 border-l-blue-500 shadow-sm"><span class="text-xs font-black text-blue-500 block mb-1">매입액 (공급가)</span><span class="text-2xl font-black text-slate-800">${totalPurchase.toLocaleString()}원</span><div class="mt-4"><span class="text-[10px] font-black text-slate-400 block border-b mb-2">TOP 3</span>${topSupHtml}</div></div>
                    <div class="bg-white p-5 rounded-2xl border-l-4 border-l-emerald-500 shadow-sm"><span class="text-xs font-black text-emerald-500 block mb-1">재고 자산 가치</span><span class="text-2xl font-black text-slate-800">${totalAsset.toLocaleString()}원</span>
                        <div class="mt-4 space-y-2 text-[10px] font-bold text-slate-600">
                            <div>실온 가용 <span class="text-orange-600">${100-roomPct}%</span> (점유 ${roomPct}%)</div>
                            <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div class="bg-orange-500 h-full" style="width:${roomPct}%"></div></div>
                            <div>저온 가용 <span class="text-indigo-600">${100-coldPct}%</span> (점유 ${coldPct}%)</div>
                            <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div class="bg-indigo-500 h-full" style="width:${coldPct}%"></div></div>
                        </div>
                    </div>
                </div>
                <div class="bg-rose-50 p-5 rounded-2xl border border-rose-100 shadow-sm"><h3 class="text-sm font-black text-rose-700 mb-3">🚨 장기 체화 재고 (3개월 경과)</h3><div class="bg-white rounded-xl p-2 border border-rose-100">${stagnantHtml || '<p class="text-xs text-center py-4 text-slate-400">없음</p>'}</div></div>
            </div>
        </div>
    `;
    modal.classList.remove('hidden'); modal.classList.add('flex');
}
