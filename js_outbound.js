// ==========================================
// [출고관리] - 서류 출력 전용 시스템 (재고 차감 X)
// ==========================================

let parsedOutboundData = []; 

// 💡 1. 업체별 엑셀 양식 매핑 룰
const outboundMappings = {
    'LOTTE': {
        name: '롯데 (롯데마트/슈퍼)',
        headerRow: 7,               
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
        headerRow: 1,               // 💡 수정됨: 헤더가 2줄이라 첫 줄은 무시하고 두 번째 줄부터 인식
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
        name: 'GS & CJ-GS (지에스리테일)',
        headerRow: 0,
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
        headerRow: 0,
        colItemName: '상품명',
        colQty: '발주수량',
        colPrice: '단가',
        colDest: '납품처명',
        colDate: '납품예정일',
        parseQty: 'NUMBER_ONLY',
        parseDate: 'STRING_TO_DATE',
        parsePrice: 'NUMBER_ONLY'
    },
    'OURHOME': {
        name: '아워홈',
        headerRow: 0,
        colItemName: '상품명',
        colQty: '현 발주수량',
        colPrice: '구매원가',
        colDest: '배송처명',
        colDate: '공급일자',       
        parseQty: 'ROUND',
        parseDate: 'EXCEL_SERIAL',
        parsePrice: 'NUMBER_ONLY'
    }
};

// 💡 2. 데이터 정제(Cleaning) 함수들
function cleanText(txt) {
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
        if(str.length >= 8) {
            return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}`;
        }
    }
    
    if(str.length === 8 && !str.includes('-')) {
        return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}`; 
    }
    return str; 
}

// 💡 3. 화면 UI 렌더링
function renderOutboundUI() {
    const container = document.getElementById('view-outbound');
    if(!container) return;

    let optionsHtml = Object.keys(outboundMappings).map(key => `<option value="${key}">${outboundMappings[key].name}</option>`).join('');

    container.innerHTML = `
        <div class="w-full max-w-7xl mx-auto space-y-6">
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-2xl font-black text-slate-800">🖨️ 출고 서류 자동 인쇄 시스템</h2>
                <span class="text-sm font-bold text-rose-500 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">※ 현재 모드: 서류 인쇄 전용 (재고 차감 없음)</span>
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
                        🖨️ 점포별 거래명세서 일괄 인쇄
                    </button>
                </div>
                <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table class="w-full text-left min-w-max border-collapse">
                        <thead id="outbound-thead" class="sticky top-0 bg-slate-100 border-b border-slate-200 shadow-sm z-10">
                            <tr class="text-slate-600 text-xs">
                                <th class="p-3 font-black text-center">No.</th>
                                <th class="p-3 font-black">납품일자</th>
                                <th class="p-3 font-black">배송처(점포)</th>
                                <th class="p-3 font-black text-blue-700">품목명 (원문)</th>
                                <th class="p-3 font-black text-right text-rose-600">수량(EA)</th>
                                <th class="p-3 font-black text-right">단가(원)</th>
                            </tr>
                        </thead>
                        <tbody id="outbound-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">발주서를 업로드하시면 점포별로 서류를 출력할 수 있습니다.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// 💡 4. 엑셀 파싱 실행
async function processOutboundExcel() {
    const fileInput = document.getElementById('outbound-file-upload');
    const clientKey = document.getElementById('outbound-client-select').value;
    
    if(!fileInput.files.length) return alert("엑셀 파일을 선택해주세요!");
    
    const file = fileInput.files[0];
    const mapping = outboundMappings[clientKey];
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: ""});
            
            if(rawData.length <= mapping.headerRow) throw new Error("데이터가 없거나 헤더 위치가 잘못되었습니다.");

            const headerRow = rawData[mapping.headerRow].map(h => cleanText(h));
            const idxItem = headerRow.findIndex(h => h.includes(cleanText(mapping.colItemName)));
            const idxQty = headerRow.findIndex(h => h.includes(cleanText(mapping.colQty)));
            const idxPrice = headerRow.findIndex(h => h.includes(cleanText(mapping.colPrice)));
            const idxDest = headerRow.findIndex(h => h.includes(cleanText(mapping.colDest)));
            const idxDate = headerRow.findIndex(h => h.includes(cleanText(mapping.colDate)));

            if(idxItem === -1 || idxQty === -1) throw new Error(`필수 열을 찾을 수 없습니다. (품목명 또는 수량)`);

            parsedOutboundData = [];
            for(let i = mapping.headerRow + 1; i < rawData.length; i++) {
                const row = rawData[i];
                if(!row[idxItem] || String(row[idxItem]).trim() === '') continue;

                // 숫자로 변환된 수량이 0이거나 이상하면 추가하지 않음 (오류 방지)
                let finalQty = parseQuantity(row[idxQty], mapping.parseQty);
                if (finalQty <= 0 || isNaN(finalQty)) continue;

                parsedOutboundData.push({
                    client_name: mapping.name,
                    expected_date: parseExcelDate(idxDate !== -1 ? row[idxDate] : '', mapping.parseDate),
                    destination: idxDest !== -1 ? cleanText(row[idxDest]) : '기본 배송처',
                    original_item_name: cleanText(row[idxItem]),
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

    countSpan.innerText = `${parsedOutboundData.length}건`;
    confirmBtn.classList.remove('hidden');

    tbody.innerHTML = parsedOutboundData.map((item, idx) => `
        <tr class="hover:bg-indigo-50/50 border-b border-slate-100">
            <td class="p-3 text-center text-xs text-slate-400 font-bold">${idx + 1}</td>
            <td class="p-3 text-xs font-bold text-slate-600">${item.expected_date || '-'}</td>
            <td class="p-3 text-xs font-black text-slate-700">${item.destination}</td>
            <td class="p-3 text-xs font-black text-blue-700">${item.original_item_name}</td>
            <td class="p-3 text-right font-black text-rose-600">${item.quantity.toLocaleString()}</td>
            <td class="p-3 text-right font-bold text-slate-500">${item.unit_price.toLocaleString()}</td>
        </tr>
    `).join('');
}

// 💡 5. 핵심: 다중 인쇄 잘림 방지용 Iframe 호출 및 실무형 명세서 HTML 생성
function printDeliveryNotes() {
    if(parsedOutboundData.length === 0) return alert("출력할 데이터가 없습니다.");

    // 1) 배송처(점포)를 기준으로 데이터 묶기
    let printGroups = {};
    parsedOutboundData.forEach(item => {
        let dest = item.destination;
        if(!printGroups[dest]) {
            printGroups[dest] = { date: item.expected_date, items: [], totalAmount: 0 };
        }
        printGroups[dest].items.push(item);
        printGroups[dest].totalAmount += (item.quantity * item.unit_price);
    });

    // 2) A4 사이즈 실무용 거래명세서 HTML 양식 생성
    let htmlContent = '';
    
    for(let dest in printGroups) {
        let data = printGroups[dest];
        let todayStr = new Date().toISOString().split('T')[0];
        let printDate = data.date || todayStr;

        htmlContent += `
        <div class="page-break" style="width: 100%; box-sizing: border-box; background: #fff; color: #000; font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;">
            <h1 style="text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 20px; text-decoration: underline; margin-bottom: 20px;">
                거 래 명 세 서 <span style="font-size:14px; letter-spacing:normal; text-decoration:none;">(공급받는자용)</span>
            </h1>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 13px;">
                <div style="width: 48%;">
                    <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; height: 110px;">
                        <tr>
                            <td rowspan="4" style="width: 30px; text-align: center; border-right: 1px solid #000; font-weight: bold; line-height: 1.5;">공<br>급<br>받<br>는<br>자</td>
                            <td style="width: 70px; text-align: center; border: 1px solid #000; font-weight: bold;">사업장</td>
                            <td colspan="3" style="border: 1px solid #000; padding: 0 10px; font-size: 16px; font-weight: bold;">${dest}</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; border: 1px solid #000; font-weight: bold;">주 소</td>
                            <td colspan="3" style="border: 1px solid #000; padding: 0 10px;"></td>
                        </tr>
                        <tr>
                            <td style="text-align: center; border: 1px solid #000; font-weight: bold;">업 태</td>
                            <td style="border: 1px solid #000; padding: 0 10px; width: 30%;"></td>
                            <td style="width: 50px; text-align: center; border: 1px solid #000; font-weight: bold;">종 목</td>
                            <td style="border: 1px solid #000; padding: 0 10px;"></td>
                        </tr>
                        <tr>
                            <td style="text-align: center; border: 1px solid #000; font-weight: bold;">연락처</td>
                            <td colspan="3" style="border: 1px solid #000; padding: 0 10px;"></td>
                        </tr>
                    </table>
                </div>

                <div style="width: 48%;">
                    <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; height: 110px;">
                        <tr>
                            <td rowspan="4" style="width: 30px; text-align: center; border-right: 1px solid #000; font-weight: bold; line-height: 1.5;">공<br>급<br>자</td>
                            <td style="width: 70px; text-align: center; border: 1px solid #000; font-weight: bold;">등록번호</td>
                            <td colspan="3" style="border: 1px solid #000; padding: 0 10px; text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 2px;">126 - 81 - 70776</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; border: 1px solid #000; font-weight: bold;">상 호</td>
                            <td style="border: 1px solid #000; padding: 0 10px; font-weight: bold;">농업회사법인(주)한스팜</td>
                            <td style="width: 50px; text-align: center; border: 1px solid #000; font-weight: bold;">성 명</td>
                            <td style="border: 1px solid #000; padding: 0 10px; text-align: center; font-weight: bold;">한 스 팜</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; border: 1px solid #000; font-weight: bold;">주 소</td>
                            <td colspan="3" style="border: 1px solid #000; padding: 0 10px;">경기도 여주시 백사면 현방리</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; border: 1px solid #000; font-weight: bold;">업 태</td>
                            <td style="border: 1px solid #000; padding: 0 10px;">제조,도소매</td>
                            <td style="text-align: center; border: 1px solid #000; font-weight: bold;">종 목</td>
                            <td style="border: 1px solid #000; padding: 0 10px;">농산물(계란)</td>
                        </tr>
                    </table>
                </div>
            </div>

            <div style="margin-bottom: 5px; font-size: 14px; font-weight: bold; display: flex; justify-content: space-between;">
                <div>작성일자 : ${printDate}</div>
                <div>합계금액 : <span style="font-size: 18px; border-bottom: 2px solid #000;">₩ ${(data.totalAmount * 1.1).toLocaleString()}</span> (공급가액 + 부가세)</div>
            </div>

            <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 13px; text-align: center;">
                <thead>
                    <tr style="background-color: #f1f5f9;">
                        <th style="border: 1px solid #000; padding: 8px 0; width: 8%;">월/일</th>
                        <th style="border: 1px solid #000; padding: 8px 0; width: 42%;">품 목 명</th>
                        <th style="border: 1px solid #000; padding: 8px 0; width: 10%;">수 량</th>
                        <th style="border: 1px solid #000; padding: 8px 0; width: 12%;">단 가</th>
                        <th style="border: 1px solid #000; padding: 8px 0; width: 14%;">공급가액</th>
                        <th style="border: 1px solid #000; padding: 8px 0; width: 14%;">세 액</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.items.map(item => {
                        let amount = item.quantity * item.unit_price;
                        let tax = Math.round(amount * 0.1);
                        let md = item.expected_date ? item.expected_date.substring(5).replace('-', '/') : '';
                        return `
                        <tr>
                            <td style="border: 1px solid #000; padding: 8px 0;">${md}</td>
                            <td style="border: 1px solid #000; padding: 8px 10px; text-align: left; font-weight: bold;">${item.original_item_name}</td>
                            <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${item.quantity.toLocaleString()}</td>
                            <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${item.unit_price.toLocaleString()}</td>
                            <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${amount.toLocaleString()}</td>
                            <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${tax.toLocaleString()}</td>
                        </tr>
                        `;
                    }).join('')}
                    <tr style="font-weight: bold; background-color: #f1f5f9;">
                        <td colspan="2" style="border: 1px solid #000; padding: 10px 0;">합 계</td>
                        <td style="border: 1px solid #000; padding: 10px 10px; text-align: right;">${data.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()}</td>
                        <td style="border: 1px solid #000; padding: 10px 0;"></td>
                        <td style="border: 1px solid #000; padding: 10px 10px; text-align: right;">${data.totalAmount.toLocaleString()}</td>
                        <td style="border: 1px solid #000; padding: 10px 10px; text-align: right;">${Math.round(data.totalAmount * 0.1).toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="margin-top: 10px; font-size: 12px; text-align: left; border: 1px solid #000; padding: 10px;">
                <strong>비고:</strong> 상기 내용과 같이 납품합니다. 인수자는 물품 확인 후 서명 바랍니다. (인수자 서명: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
            </div>
        </div>
        `;
    }

    // 3) 💡 다중 페이지 절단 방지용 히든 Iframe 인쇄 로직 (메인 화면 CSS의 간섭을 완전히 차단)
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
                    @page { size: A4 portrait; margin: 10mm 15mm; }
                    body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; margin: 0; padding: 0; }
                    .page-break { page-break-after: always; margin-bottom: 20mm; }
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

    // 로딩 후 인쇄 창 띄우고 삭제
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => { document.body.removeChild(iframe); }, 2000);
    }, 500);
}
