// ==========================================
// [출고관리] - 서류 출력 전용 시스템 (재고 차감 X)
// ==========================================

let parsedOutboundData = []; 
let currentClientKey = '';

// 💡 1. 업체별 엑셀 양식 매핑 룰
const outboundMappings = {
    'LOTTE': {
        name: '롯데 (롯데마트/슈퍼)',
        colItemName: '상품명',
        colQty: '주문수',
        colPrice: '단가',
        colDest: '점포명',
        colDate: '납품일',
        parseQty: 'NUMBER_ONLY',    
        parseDate: 'STRING_TO_DATE',
        parsePrice: 'NUMBER_ONLY'   
    },
    'CJ-CU': {
        name: 'CJ-CU (BGF로지스)',
        colItemName: '상품명',
        colQty: '총수량',           
        colPrice: '납품원가',
        colDest: '센터명',
        colDate: '납품예정일자',     
        parseQty: 'ROUND',          
        parseDate: 'YYYYMMDD_14',
        parsePrice: 'NUMBER_ONLY'
    },
    'GS': {
        name: 'GS (지에스리테일)',
        colItemName: '상품명',
        colQty: '발주량',         
        colPrice: '발주단가',
        colDest: '배송처',         
        colDate: '납품일자',       
        parseQty: 'ROUND',
        parseDate: 'EXCEL_SERIAL',
        parsePrice: 'NUMBER_ONLY'
    },
    'CJ-GS': {
        name: 'CJ-GS (지에스리테일)',
        colItemName: '상품명',
        colQty: '낱개수량',         
        colPrice: '발주단가',
        colDest: '배송처',         
        colDate: '납품일자',       
        parseQty: 'ROUND',
        parseDate: 'EXCEL_SERIAL',
        parsePrice: 'NUMBER_ONLY'
    },
    'SSG': {
        name: 'SSG (이마트/에브리데이)',
        colItemName: '상품명',
        colQty: '발주수량',
        colPrice: '단가',
        colDest: '납품처명',
        colDate: '납품예정일',
        parseQty: 'NUMBER_ONLY',
        parseDate: 'STRING_TO_DATE',
        parsePrice: 'NUMBER_ONLY'
    }
};

// 💡 2. 데이터 정제 함수들
function cleanText(txt) {
    if(!txt) return '';
    return String(txt).replace(/\s+/g, '').trim(); 
}
function preserveText(txt) {
    if(!txt) return '';
    return String(txt).replace(/\n/g, '').replace(/\r/g, '').trim(); 
}

function parseQuantity(val, rule) {
    if(!val) return 0;
    let str = String(val).replace(/,/g, '');
    if(rule === 'NUMBER_ONLY' || rule === 'ROUND') {
        let num = parseFloat(str.replace(/[^0-9.-]/g, ''));
        return Math.round(num) || 0; 
    }
    return parseInt(str) || 0;
}

function parseExcelDate(val, rule) {
    if(!val) return '';
    let str = String(val).trim();
    
    if(rule === 'EXCEL_SERIAL') {
        let num = parseFloat(str);
        if(!isNaN(num)) {
            let date = new Date(Math.round((num - 25569) * 86400 * 1000));
            return date.toISOString().split('T')[0];
        }
    } 
    else if (rule === 'YYYYMMDD_14') {
        if(str.length >= 8) return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}`;
    }
    
    if(str.length === 8 && !str.includes('-')) {
        return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}`; 
    }
    return str; 
}

function extractEaPerBox(itemName) {
    let match = itemName.match(/(\d+)(구|입|p|ea|\))/i);
    if(match && parseInt(match[1]) > 0) return parseInt(match[1]);
    return 1; 
}

// 💡 3. 화면 UI 렌더링
function renderOutboundUI() {
    const container = document.getElementById('view-outbound');
    if(!container) return;

    let optionsHtml = Object.keys(outboundMappings).map(key => `<option value="${key}">${outboundMappings[key].name}</option>`).join('');

    container.innerHTML = `
        <div class="w-full max-w-7xl mx-auto space-y-6">
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-2xl font-black text-slate-800">🖨️ 고객사별 맞춤 서류 인쇄 시스템</h2>
                <span class="text-sm font-bold text-rose-500 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">※ 현재 모드: 명세서 인쇄 전용</span>
            </div>
            
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div class="flex-1">
                        <label class="block text-xs font-black text-slate-500 mb-2">1. 발주서 양식(고객사) 선택</label>
                        <select id="outbound-client-select" class="w-full p-3 border border-slate-300 rounded-lg font-bold text-slate-700 outline-none transition-all">
                            ${optionsHtml}
                        </select>
                    </div>
                    <div class="flex-1">
                        <label class="block text-xs font-black text-slate-500 mb-2">2. 발주서(Excel/CSV) 업로드</label>
                        <input type="file" id="outbound-file-upload" accept=".xlsx, .xls, .csv" class="w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded-lg">
                    </div>
                    <div class="w-full md:w-auto">
                        <button onclick="processOutboundExcel()" class="w-full bg-slate-700 hover:bg-slate-800 text-white font-black py-3 px-8 rounded-lg shadow-md transition-all">
                            데이터 자동 추출
                        </button>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div class="font-black text-slate-700">📋 정제된 발주 데이터 <span id="outbound-count" class="text-indigo-600 ml-2">0건</span></div>
                    <button onclick="printDeliveryNotes()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-black shadow-md transition-colors hidden animate-pulse" id="outbound-confirm-btn">
                        🖨️ 맞춤형 거래명세서 일괄 인쇄
                    </button>
                </div>
                <div class="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                    <table class="w-full text-left min-w-max border-collapse">
                        <thead id="outbound-thead" class="sticky top-0 bg-slate-100 border-b border-slate-200 shadow-sm z-10">
                            <tr class="text-slate-600 text-xs">
                                <th class="p-3 font-black text-center">No.</th>
                                <th class="p-3 font-black text-center">센터명</th>
                                <th class="p-3 font-black">납품일자</th>
                                <th class="p-3 font-black">배송처(점포)</th>
                                <th class="p-3 font-black text-blue-700">품목명 (원문)</th>
                                <th class="p-3 font-black text-right text-rose-600">수량(EA)</th>
                            </tr>
                        </thead>
                        <tbody id="outbound-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">엑셀을 업로드하면 자동으로 정제됩니다.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// 💡 4. 동적 엑셀 파싱 실행
async function processOutboundExcel() {
    const fileInput = document.getElementById('outbound-file-upload');
    currentClientKey = document.getElementById('outbound-client-select').value;
    
    if(!fileInput.files.length) return alert("엑셀 파일을 선택해주세요!");
    
    const file = fileInput.files[0];
    const mapping = outboundMappings[currentClientKey];
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: ""});
            
            let centerName = '기본물류센터';
            if (currentClientKey === 'LOTTE') {
                for(let r=0; r<10; r++) {
                    if(!rawData[r]) continue;
                    let cIdx = rawData[r].findIndex(cell => String(cell).replace(/\s/g,'') === '점포(센터)');
                    if(cIdx !== -1 && rawData[r+1]) {
                        centerName = String(rawData[r+1][cIdx]).trim();
                        break;
                    }
                }
            }

            let actualHeaderRow = -1;
            let idxItem = -1, idxQty = -1, idxPrice = -1, idxDest = -1, idxDate = -1;

            const targetItemName = cleanText(mapping.colItemName);
            const targetQtyName = cleanText(mapping.colQty);

            // 헤더 자동 탐색
            for(let r = 0; r < Math.min(rawData.length, 20); r++) {
                const row = rawData[r].map(h => cleanText(h));
                let tempIdxItem = row.findIndex(h => h.includes(targetItemName));
                let tempIdxQty = row.findIndex(h => h.includes(targetQtyName));

                if(tempIdxItem !== -1 && tempIdxQty !== -1) {
                    if (currentClientKey === 'CJ-CU' && r === 0) continue; 
                    actualHeaderRow = r;
                    idxItem = tempIdxItem;
                    idxQty = tempIdxQty;
                    idxPrice = row.findIndex(h => h.includes(cleanText(mapping.colPrice)));
                    idxDest = row.findIndex(h => h.includes(cleanText(mapping.colDest)));
                    idxDate = row.findIndex(h => h.includes(cleanText(mapping.colDate)));
                    break;
                }
            }

            if(actualHeaderRow === -1) throw new Error(`[${mapping.colItemName}] 또는 [${mapping.colQty}] 열을 찾을 수 없습니다.`);

            parsedOutboundData = [];
            for(let i = actualHeaderRow + 1; i < rawData.length; i++) {
                const row = rawData[i];
                if(!row[idxItem] || String(row[idxItem]).trim() === '') continue;

                let finalQty = parseQuantity(row[idxQty], mapping.parseQty);
                if (finalQty <= 0 || isNaN(finalQty)) continue;

                let dest = idxDest !== -1 ? preserveText(row[idxDest]) : '기본 배송처';
                
                if(currentClientKey === 'LOTTE') {
                    dest = '롯데쇼핑(주)';
                } else if(currentClientKey === 'CJ-CU' || currentClientKey === 'CJ-GS' || currentClientKey === 'GS') {
                    dest = '씨제이제일제당 주식회사';
                }

                parsedOutboundData.push({
                    client_name: mapping.name,
                    expected_date: parseExcelDate(idxDate !== -1 ? row[idxDate] : '', mapping.parseDate),
                    destination: dest,
                    center_name: centerName, 
                    original_item_name: preserveText(row[idxItem]),
                    quantity: finalQty,
                    unit_price: parseQuantity(idxPrice !== -1 ? row[idxPrice] : 0, mapping.parsePrice)
                });
            }
            renderOutboundPreview();
        } catch(err) {
            alert("❌ 추출 실패!\n" + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// 💡 5. 추출된 데이터 화면 렌더링
function renderOutboundPreview() {
    const tbody = document.getElementById('outbound-tbody');
    const countSpan = document.getElementById('outbound-count');
    const confirmBtn = document.getElementById('outbound-confirm-btn');
    
    if(parsedOutboundData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">추출된 데이터가 없습니다.</td></tr>`;
        countSpan.innerText = `0건`;
        confirmBtn.classList.add('hidden');
        return;
    }

    let merged = {};
    parsedOutboundData.forEach(item => {
        let key = item.destination + '|' + item.expected_date + '|' + item.original_item_name;
        if(!merged[key]) {
            merged[key] = { ...item };
        } else {
            merged[key].quantity += item.quantity;
        }
    });

    let displayData = Object.values(merged);

    countSpan.innerText = `${displayData.length}건 (합산됨)`;
    confirmBtn.classList.remove('hidden');

    tbody.innerHTML = displayData.map((item, idx) => `
        <tr class="hover:bg-indigo-50/50 border-b border-slate-100">
            <td class="p-3 text-center text-xs text-slate-400 font-bold">${idx + 1}</td>
            <td class="p-3 text-center text-xs font-bold text-emerald-600">${item.center_name || '-'}</td>
            <td class="p-3 text-xs font-bold text-slate-600">${item.expected_date || '-'}</td>
            <td class="p-3 text-xs font-black text-slate-700">${item.destination}</td>
            <td class="p-3 text-xs font-black text-blue-700">${item.original_item_name}</td>
            <td class="p-3 text-right font-black text-rose-600">${item.quantity.toLocaleString()}</td>
        </tr>
    `).join('');
}

// 💡 6. 고객사별 맞춤 템플릿 인쇄 엔진
function printDeliveryNotes() {
    if(parsedOutboundData.length === 0) return alert("출력할 데이터가 없습니다.");

    let htmlContent = '';
    let pageOrientation = 'portrait'; // 💡 기본은 세로 방향 출력

    // 데이터 합산
    let printGroups = {};
    parsedOutboundData.forEach(item => {
        let dest = item.destination;
        let dateKey = item.expected_date || new Date().toISOString().split('T')[0];
        let groupKey = dest + "_" + dateKey;
        
        if(!printGroups[groupKey]) {
            printGroups[groupKey] = { dest: dest, date: dateKey, items: {}, totalAmount: 0 };
        }
        
        if(!printGroups[groupKey].items[item.original_item_name]) {
            printGroups[groupKey].items[item.original_item_name] = { ...item, quantity: 0 };
        }
        printGroups[groupKey].items[item.original_item_name].quantity += item.quantity;
    });

    // ==========================================
    // 📝 템플릿 1: 롯데 (가로 방향 크로스탭 양식)
    // ==========================================
    if (currentClientKey === 'LOTTE') {
        pageOrientation = 'landscape'; // 💡 롯데는 무조건 가로(Landscape)로 출력!
        
        let centerGroups = {};
        parsedOutboundData.forEach(item => {
            let center = item.center_name || '물류센터';
            let dateKey = item.expected_date || new Date().toISOString().split('T')[0];
            let groupKey = center + "_" + dateKey;
            
            if(!centerGroups[groupKey]) {
                centerGroups[groupKey] = { center: center, date: dateKey, items: [] };
            }
            centerGroups[groupKey].items.push(item);
        });

        for(let key in centerGroups) {
            let data = centerGroups[key];
            let productNames = [...new Set(data.items.map(i => i.original_item_name))].sort();
            
            let stores = {};
            data.items.forEach(i => {
                if(!stores[i.destination]) {
                    let match = i.destination.match(/\((\d+)\)/);
                    let code = match ? match[1] : '';
                    let name = i.destination.replace(/\(\d+\)/, '').trim();
                    stores[i.destination] = { code: code, name: name, products: {}, total: 0 };
                    productNames.forEach(p => stores[i.destination].products[p] = 0);
                }
                stores[i.destination].products[i.original_item_name] += i.quantity;
                stores[i.destination].total += i.quantity;
            });
            
            let storeKeys = Object.keys(stores).sort((a,b) => stores[a].code.localeCompare(stores[b].code));
            
            let productTotals = {};
            productNames.forEach(p => productTotals[p] = 0);
            let grandTotal = 0;
            data.items.forEach(i => {
                productTotals[i.original_item_name] += i.quantity;
                grandTotal += i.quantity;
            });

            let year = data.date.substring(0,4);
            let month = data.date.substring(5,7);
            let day = data.date.substring(8,10);
            let printDateStr = `${year} 년 ${month} 월 ${day} 일`;

            htmlContent += `
            <div class="page-break" style="width: 100%; box-sizing: border-box; background: #fff; color: #000; font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;">
                <div style="margin-bottom: 20px; position:relative;">
                    <div style="position:absolute; top:0; left:0; font-size:12px; font-weight:bold;">${printDateStr}</div>
                    <div style="position:absolute; top:0; right:0; font-size:12px; font-weight:bold;">등록: 428-81-00702</div>
                    <h1 style="text-align:center; font-size:24px; font-weight:bold; margin-top:10px;">거 래 명 세 서</h1>
                    
                    <div style="display:flex; justify-content:space-between; margin-top:15px; font-size:12px;">
                        <div style="width:40%; padding-top:25px;">
                            <div style="font-size:18px; font-weight:bold;">롯데마트 ${data.center} 귀하</div>
                        </div>
                        <div style="width:50%;">
                            <table style="width:100%; border-collapse:collapse; border:2px solid #000;">
                                <tr>
                                    <td rowspan="3" style="width:20px; text-align:center; border:1px solid #000; font-weight:bold;">공<br>급<br>자</td>
                                    <td style="width:40px; text-align:center; border:1px solid #000;">상호</td>
                                    <td style="border:1px solid #000; padding-left:5px; font-weight:bold;">농업회사법인(주)한스팜</td>
                                    <td style="width:40px; text-align:center; border:1px solid #000;">대표</td>
                                    <td style="border:1px solid #000; padding-left:5px;">한만응</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center; border:1px solid #000;">주소</td>
                                    <td colspan="3" style="border:1px solid #000; padding-left:5px;">경기도 여주시 삼교3길 16-1</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center; border:1px solid #000;">업태</td>
                                    <td style="border:1px solid #000; padding-left:5px;"></td>
                                    <td style="text-align:center; border:1px solid #000;">종목</td>
                                    <td style="border:1px solid #000; padding-left:5px;"></td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 11px; text-align: center;">
                    <thead>
                        <tr style="background-color: #f1f5f9;">
                            <th style="border: 1px solid #000; padding: 6px 2px; width: 40px;">NO</th>
                            <th style="border: 1px solid #000; padding: 6px 4px;">점포명</th>
                            ${productNames.map(p => `<th style="border: 1px solid #000; padding: 6px 2px; word-break: keep-all; line-height:1.2;">${p}</th>`).join('')}
                            <th style="border: 1px solid #000; padding: 6px 2px; width: 50px;">합계</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${storeKeys.map(k => {
                            let s = stores[k];
                            return `
                            <tr>
                                <td style="border: 1px solid #000; padding: 6px 2px;">${s.code}</td>
                                <td style="border: 1px solid #000; padding: 6px 4px; text-align:left;">${s.name}</td>
                                ${productNames.map(p => {
                                    let q = s.products[p];
                                    return `<td style="border: 1px solid #000; padding: 6px 2px; text-align:right;">${q > 0 ? q.toLocaleString() : ''}</td>`;
                                }).join('')}
                                <td style="border: 1px solid #000; padding: 6px 2px; text-align:right; font-weight:bold; background-color:#f8fafc;">${s.total > 0 ? s.total.toLocaleString() : ''}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background-color: #f1f5f9; font-weight:bold;">
                            <td colspan="2" style="border: 1px solid #000; padding: 6px 4px;">합 계</td>
                            ${productNames.map(p => `<td style="border: 1px solid #000; padding: 6px 2px; text-align:right;">${productTotals[p] > 0 ? productTotals[p].toLocaleString() : ''}</td>`).join('')}
                            <td style="border: 1px solid #000; padding: 6px 2px; text-align:right; color:#b91c1c;">${grandTotal > 0 ? grandTotal.toLocaleString() : ''}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            `;
        }
    } 
    // ==========================================
    // 📝 템플릿 2: CJ-CU (세로 방향)
    // ==========================================
    else if (currentClientKey === 'CJ-CU') {
        for(let key in printGroups) {
            let data = printGroups[key];
            let itemsArr = Object.values(data.items);
            
            let sumAmount = 0; let sumTax = 0; let sumQty = 0;
            itemsArr.forEach(i => { let amt = i.quantity * i.unit_price; sumAmount += amt; sumTax += Math.round(amt * 0.1); sumQty += i.quantity; });

            htmlContent += `
            <div class="page-break" style="width: 100%; box-sizing: border-box; background: #fff; color: #000; font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                    <div style="width: 60%;"><h1 style="font-size: 26px; font-weight: bold; letter-spacing: 15px; margin: 0;">거 래 명 세 서 <span style="font-size:12px; letter-spacing:normal;">(공급받는자 보관용)</span></h1></div>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 12px;">
                    <div style="width: 48%;">
                        <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; height: 100px;">
                            <tr>
                                <td rowspan="4" style="width: 25px; text-align: center; border-right: 1px solid #000; font-weight: bold;">공<br>급<br>받<br>는<br>자</td>
                                <td style="width: 60px; text-align: center; border: 1px solid #000; font-weight: bold;">등록번호</td>
                                <td colspan="3" style="border: 1px solid #000; padding: 0 10px; font-size: 14px; font-weight: bold; text-align:center;">104 - 86 - 09535</td>
                            </tr>
                            <tr>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">상 호</td>
                                <td style="border: 1px solid #000; padding: 0 10px; font-weight: bold;">씨제이제일제당 주식회사</td>
                                <td style="width: 40px; text-align: center; border: 1px solid #000; font-weight: bold;">성 명</td>
                                <td style="border: 1px solid #000; padding: 0 10px;">강신호</td>
                            </tr>
                            <tr><td style="text-align: center; border: 1px solid #000; font-weight: bold;">주 소</td><td colspan="3" style="border: 1px solid #000; padding: 0 5px; font-size:10px;">서울특별시 중구 동호로 330 CJ제일제당센터</td></tr>
                            <tr>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">업 태</td><td style="border: 1px solid #000; padding: 0 10px; width: 30%;">도소매</td>
                                <td style="width: 50px; text-align: center; border: 1px solid #000; font-weight: bold;">종 목</td><td style="border: 1px solid #000; padding: 0 10px;">식품첨가물</td>
                            </tr>
                        </table>
                    </div>
                    <div style="width: 48%;">
                        <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; height: 100px;">
                            <tr>
                                <td rowspan="4" style="width: 25px; text-align: center; border-right: 1px solid #000; font-weight: bold;">공<br>급<br>자</td>
                                <td style="width: 60px; text-align: center; border: 1px solid #000; font-weight: bold;">등록번호</td>
                                <td colspan="3" style="border: 1px solid #000; padding: 0 10px; text-align: center; font-size: 14px; font-weight: bold;">126 - 81 - 70776</td>
                            </tr>
                            <tr>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">상 호</td>
                                <td style="border: 1px solid #000; padding: 0 10px; font-weight: bold;">농업회사법인(주)한스팜</td>
                                <td style="width: 40px; text-align: center; border: 1px solid #000; font-weight: bold;">성 명</td>
                                <td style="border: 1px solid #000; padding: 0 10px; text-align: center;">한 스 팜</td>
                            </tr>
                            <tr><td style="text-align: center; border: 1px solid #000; font-weight: bold;">주 소</td><td colspan="3" style="border: 1px solid #000; padding: 0 5px; font-size:11px;">경기도 여주시 백사면 현방리</td></tr>
                            <tr>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">업 태</td><td style="border: 1px solid #000; padding: 0 10px;">제조,도소매</td>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">종 목</td><td style="border: 1px solid #000; padding: 0 5px; font-size:11px;">농산물(계란)</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <div style="margin-bottom: 5px; font-size: 13px; font-weight: bold;">거래일자 : ${data.date.replace(/-/g, ' / ')}</div>

                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 12px; text-align: center;">
                    <thead>
                        <tr style="background-color: #f1f5f9;">
                            <th style="border: 1px solid #000; padding: 6px 0; width: 8%;">월/일</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 34%;">품 목 명</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 8%;">BOX</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 10%;">낱 개</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 10%;">단 가</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 15%;">공급가액</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 15%;">부 가 세</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsArr.map(item => {
                            let amt = item.quantity * item.unit_price; let tx = Math.round(amt * 0.1);
                            let md = item.expected_date ? item.expected_date.substring(5).replace('-', '/') : '';
                            let boxQty = (item.quantity / extractEaPerBox(item.original_item_name)).toFixed(1).replace('.0', '');
                            if(boxQty === "0") boxQty = "";
                            return `<tr>
                                <td style="border: 1px solid #000; padding: 6px 0;">${md}</td>
                                <td style="border: 1px solid #000; padding: 6px 10px; text-align: left; font-weight: bold;">${item.original_item_name}</td>
                                <td style="border: 1px solid #000; padding: 6px 5px; text-align: right;">${boxQty}</td>
                                <td style="border: 1px solid #000; padding: 6px 10px; text-align: right;">${item.quantity.toLocaleString()}</td>
                                <td style="border: 1px solid #000; padding: 6px 10px; text-align: right;">${item.unit_price.toLocaleString()}</td>
                                <td style="border: 1px solid #000; padding: 6px 10px; text-align: right;">${amt.toLocaleString()}</td>
                                <td style="border: 1px solid #000; padding: 6px 10px; text-align: right;">${tx.toLocaleString()}</td>
                            </tr>`;
                        }).join('')}
                        ${Array(Math.max(0, 10 - itemsArr.length)).fill(`<tr><td style="border: 1px solid #000; padding: 6px 0; color:transparent;">-</td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td></tr>`).join('')}
                        <tr style="font-weight: bold; background-color: #f1f5f9;">
                            <td colspan="2" style="border: 1px solid #000; padding: 8px 0;">합 계</td>
                            <td style="border: 1px solid #000;"></td>
                            <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${sumQty.toLocaleString()}</td>
                            <td style="border: 1px solid #000;"></td>
                            <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${sumAmount.toLocaleString()}</td>
                            <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${sumTax.toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            `;
        }
    }
    // ==========================================
    // 📝 템플릿 3: 기타 업체 (GS, SSG 등 세로 방향)
    // ==========================================
    else {
        for(let key in printGroups) {
            let data = printGroups[key];
            let itemsArr = Object.values(data.items);
            let sumAmount = 0; let sumTax = 0; let sumQty = 0;
            itemsArr.forEach(i => { let amt = i.quantity * i.unit_price; sumAmount += amt; sumTax += Math.round(amt * 0.1); sumQty += i.quantity; });

            htmlContent += `
            <div class="page-break" style="width: 100%; box-sizing: border-box; background: #fff; color: #000; font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                    <div style="width: 60%;"><h1 style="font-size: 26px; font-weight: bold; letter-spacing: 15px; margin: 0;">거 래 명 세 ${currentClientKey.includes('GS') ? '표' : '서'}</h1></div>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 12px;">
                    <div style="width: 48%;">
                        <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; height: 100px;">
                            <tr>
                                <td rowspan="4" style="width: 25px; text-align: center; border-right: 1px solid #000; font-weight: bold;">공<br>급<br>받<br>는<br>자</td>
                                <td style="width: 60px; text-align: center; border: 1px solid #000; font-weight: bold;">등록번호</td>
                                <td colspan="3" style="border: 1px solid #000; padding: 0 10px; font-size: 14px; font-weight: bold; text-align:center;">${currentClientKey.includes('GS') ? '104 - 86 - 09535' : ''}</td>
                            </tr>
                            <tr>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">상 호</td>
                                <td style="border: 1px solid #000; padding: 0 10px; font-weight: bold;">${data.dest}</td>
                                <td style="width: 40px; text-align: center; border: 1px solid #000; font-weight: bold;">성 명</td>
                                <td style="border: 1px solid #000; padding: 0 10px;">${currentClientKey.includes('GS') ? '강신호' : ''}</td>
                            </tr>
                            <tr><td style="text-align: center; border: 1px solid #000; font-weight: bold;">주 소</td><td colspan="3" style="border: 1px solid #000; padding: 0 5px; font-size:10px;">${currentClientKey.includes('GS') ? '서울특별시 중구 동호로 330 CJ제일제당센터' : ''}</td></tr>
                            <tr>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">업 태</td><td style="border: 1px solid #000; padding: 0 10px; width: 30%;"></td>
                                <td style="width: 50px; text-align: center; border: 1px solid #000; font-weight: bold;">종 목</td><td style="border: 1px solid #000; padding: 0 10px;"></td>
                            </tr>
                        </table>
                    </div>
                    <div style="width: 48%;">
                        <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; height: 100px;">
                            <tr>
                                <td rowspan="4" style="width: 25px; text-align: center; border-right: 1px solid #000; font-weight: bold;">공<br>급<br>자</td>
                                <td style="width: 60px; text-align: center; border: 1px solid #000; font-weight: bold;">등록번호</td>
                                <td colspan="3" style="border: 1px solid #000; padding: 0 10px; text-align: center; font-size: 14px; font-weight: bold;">126 - 81 - 70776</td>
                            </tr>
                            <tr>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">상 호</td>
                                <td style="border: 1px solid #000; padding: 0 10px; font-weight: bold;">농업회사법인(주)한스팜</td>
                                <td style="width: 40px; text-align: center; border: 1px solid #000; font-weight: bold;">성 명</td>
                                <td style="border: 1px solid #000; padding: 0 10px; text-align: center;">한 스 팜</td>
                            </tr>
                            <tr><td style="text-align: center; border: 1px solid #000; font-weight: bold;">주 소</td><td colspan="3" style="border: 1px solid #000; padding: 0 5px; font-size:11px;">경기도 여주시 백사면 현방리</td></tr>
                            <tr>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">업 태</td><td style="border: 1px solid #000; padding: 0 10px;">제조,도소매</td>
                                <td style="text-align: center; border: 1px solid #000; font-weight: bold;">종 목</td><td style="border: 1px solid #000; padding: 0 5px; font-size:11px;">농산물(계란)</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <div style="margin-bottom: 5px; font-size: 13px; font-weight: bold;">거래일자 : ${data.date.replace(/-/g, ' / ')}</div>

                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 12px; text-align: center;">
                    <thead>
                        <tr style="background-color: #f1f5f9;">
                            <th style="border: 1px solid #000; padding: 6px 0; width: 15%;">상품코드</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 30%;">상 품 명</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 10%;">규 격</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 10%;">단 가</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 8%;">수 량</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 12%;">공급가액</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 10%;">세 액</th>
                            <th style="border: 1px solid #000; padding: 6px 0; width: 15%;">합 계</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsArr.map((item, i) => {
                            let amt = item.quantity * item.unit_price; let tx = Math.round(amt * 0.1);
                            return `<tr>
                                <td style="border: 1px solid #000; padding: 6px 0;"></td>
                                <td style="border: 1px solid #000; padding: 6px 5px; text-align: left; font-weight: bold;">${item.original_item_name}</td>
                                <td style="border: 1px solid #000; padding: 6px 0;"></td>
                                <td style="border: 1px solid #000; padding: 6px 5px; text-align: right;">${item.unit_price.toLocaleString()}</td>
                                <td style="border: 1px solid #000; padding: 6px 5px; text-align: right;">${item.quantity.toLocaleString()}</td>
                                <td style="border: 1px solid #000; padding: 6px 5px; text-align: right;">${amt.toLocaleString()}</td>
                                <td style="border: 1px solid #000; padding: 6px 5px; text-align: right;">${tx.toLocaleString()}</td>
                                <td style="border: 1px solid #000; padding: 6px 5px; text-align: right;">${(amt+tx).toLocaleString()}</td>
                            </tr>`;
                        }).join('')}
                        ${Array(Math.max(0, 10 - itemsArr.length)).fill(`<tr><td style="border: 1px solid #000; padding: 6px 0; color:transparent;">-</td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td><td style="border: 1px solid #000;"></td></tr>`).join('')}
                        <tr style="font-weight: bold; background-color: #f1f5f9;">
                            <td colspan="4" style="border: 1px solid #000; padding: 8px 0;">합 계</td>
                            <td style="border: 1px solid #000; padding: 8px 5px; text-align: right;">${sumQty.toLocaleString()}</td>
                            <td style="border: 1px solid #000; padding: 8px 5px; text-align: right;">${sumAmount.toLocaleString()}</td>
                            <td style="border: 1px solid #000; padding: 8px 5px; text-align: right;">${sumTax.toLocaleString()}</td>
                            <td style="border: 1px solid #000; padding: 8px 5px; text-align: right;">${(sumAmount+sumTax).toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            `;
        }
    }

    // 💡 7. 투명 Iframe 인쇄 로직 (페이지 방향 동적 적용)
    let iframe = document.createElement('iframe');
    iframe.style.visibility = 'hidden';
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    document.body.appendChild(iframe);

    let doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <html>
        <head>
            <style>
                @media print {
                    @page { size: A4 ${pageOrientation}; margin: 10mm; }
                    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
                    .page-break { page-break-after: always; margin-bottom: 20px; }
                    .page-break:last-child { page-break-after: auto; margin-bottom: 0; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                }
            </style>
        </head>
        <body>
            ${htmlContent}
        </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => { document.body.removeChild(iframe); }, 3000);
    }, 1000);
}
