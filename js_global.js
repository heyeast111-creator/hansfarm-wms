// ==========================================
// 💡 [패치] 대시보드 업데이트 로직 (새로운 현장 레이아웃 완벽 호환)
// ==========================================
function updateDashboard() {
    if (!document.getElementById('dash-room-percent')) return;

    let roomOcc = 0, coldOcc = 0, floorOcc = 0;
    
    // 1. 현재 재고 렉 차지 갯수 카운트
    globalOccupancy.forEach(item => {
        if (!item.location_id) return;
        if (item.location_id.startsWith('R-')) roomOcc++;
        else if (item.location_id.startsWith('C-')) coldOcc++;
        else if (item.location_id.startsWith('FL-')) floorOcc++;
    });

    // 2. 창고별 총 칸수(Capacity) 계산
    let roomTotal = 0;
    if(typeof layoutRoom !== 'undefined') {
        layoutRoom.forEach(c => { if(!c.gap && !c.aisle) roomTotal += c.cols * 2; }); 
        roomTotal += 20; // 가로 렉(K열) 1,2층 합
    } else { roomTotal = 150; }

    let coldTotal = 0;
    if(typeof layoutCold !== 'undefined') {
        layoutCold.forEach(c => { if(!c.gap && !c.aisle) coldTotal += c.cols * 2; });
        coldTotal += 16; // 가로 렉(I열) 1,2층 합
    } else { coldTotal = 100; }

    // 💡 새로운 현장 레이아웃 총 칸수 합산 로직
    let floorTotal = 0;
    ['FL-1F-R', 'FL-1F-M', 'FL-1F-P', 'FL-2F-M', 'FL-2F-P', 'FL-3F-G'].forEach(area => {
        floorTotal += parseInt(localStorage.getItem(area + '_cols')) || 10;
    });

    // 3. 퍼센트율 계산 (최대 100%)
    let roomPct = roomTotal > 0 ? Math.min(100, Math.round((roomOcc / roomTotal) * 100)) : 0;
    let coldPct = coldTotal > 0 ? Math.min(100, Math.round((coldOcc / coldTotal) * 100)) : 0;
    let floorPct = floorTotal > 0 ? Math.min(100, Math.round((floorOcc / floorTotal) * 100)) : 0;

    // 4. 도넛 차트 및 숫자 UI 업데이트
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

    // 5. (관리자 전용) 재고 자산 가치 및 소모 원가 계산
    if(typeof isAdmin !== 'undefined' && isAdmin) {
        let pnl = document.getElementById('admin-finance-panel');
        if(pnl) pnl.classList.remove('hidden');
        let roomVal = 0, coldVal = 0, floorVal = 0;
        
        globalOccupancy.forEach(item => {
            let pInfo = finishedProductMaster.find(p => p.item_name === item.item_name) || productMaster.find(p => p.item_name === item.item_name);
            let price = pInfo ? (pInfo.unit_price || 0) : 0;
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
                    let pInfo = finishedProductMaster.find(p => p.item_name === h.item_name) || productMaster.find(p => p.item_name === h.item_name);
                    let price = pInfo ? (pInfo.unit_price || 0) : 0;
                    outCost += h.quantity * price;
                }
            }
        });

        let dco = document.getElementById('dash-cost-out'); if(dco) dco.innerText = outCost.toLocaleString() + ' 원';
        let lbl = period === 'daily' ? '일간 기준' : (period === 'weekly' ? '주간 기준' : '월간 기준');
        let dcl = document.getElementById('dash-cost-label'); if(dcl) dcl.innerText = lbl;
    } else {
        let pnl = document.getElementById('admin-finance-panel');
        if(pnl) pnl.classList.add('hidden');
    }
}
