// ==========================================
// [출고관리] - 스마트 엑셀 파서 & 매핑 엔진
// ==========================================

let parsedOutboundData = []; // 엑셀에서 추출한 정제된 출고 데이터 목록

// 💡 1. 업체별 엑셀 양식 매핑 룰 (Supabase DB에 들어갈 내용의 축소판)
const outboundMappings = {
    'LOTTE': {
        name: '롯데 (롯데마트/슈퍼)',
        headerRow: 7,               // 8번째 줄이 헤더 (0부터 시작하므로 7)
        colItemName: '상품명',
        colQty: '주문수',
        colPrice: '단가',
        colDest: '점포명',
        colDate: '납품일',
        parseQty: 'NUMBER_ONLY',    // "260 (EA)" -> 260
        parseDate: 'STRING_TO_DATE',// "2026-04-10"
        parsePrice: 'NUMBER_ONLY'   // "7,000" -> 7000
    },
    'CJ-CU': {
        name: 'CJ-CU (BGF로지스)',
        headerRow: 0,               // 보통 1~2번째 줄
        colItemName: '상품명',
        colQty: '총수량',           // "3332.0"
        colPrice: '납품원가',
        colDest: '센터명',
        colDate: '납품예정일자',     // "20260411110000"
        parseQty: 'ROUND',          // 3332.0 -> 3332
        parseDate: 'YYYYMMDD_14',
        parsePrice: 'NUMBER_ONLY'
    },
    'GS': {
        name: 'GS & CJ-GS (지에스리테일)',
        headerRow: 0,
        colItemName: '상품명',
        colQty: '낱개수량',         // 또는 발주량
        colPrice: '발주단가',
        colDest: '배송처',         // 또는 납품처
        colDate: '납품일자',       // 46121.0 (시리얼)
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
        colDate: '공급일자',       // 46121.0
        parseQty: 'ROUND',
        parseDate: 'EXCEL_SERIAL',
        parsePrice: 'NUMBER_ONLY'
    }
};

// 💡 2. 마법의 데이터 정제 함수들
function cleanText(txt) {
    if(!txt) return '';
    return String(txt).replace(/\n/g, '').replace(/\r/g, '').trim();
}

function parseQuantity(val, rule) {
    if(!val) return 0;
    let str = String(val).replace(/,/g, '');
    if(rule === 'NUMBER_ONLY' || rule === 'ROUND') {
        let num = parseFloat(str.replace(/[^0-9.-]/g, ''));
        return Math.round(num) || 0; // 소수점 날리고 정수화
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
    
    // 기본 날짜 포맷 (YYYY-MM-DD 등)
    if(str.length === 8 && !str.includes('-')) {
        return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}`; // 20260420 -> 2026-04-20
    }
    return str; 
}

// 💡 3. 화면 UI 렌더링 (출고관리 탭을 눌렀을 때 실행될 함수)
function renderOutboundUI() {
    const container = document.getElementById('view-outbound');
    if(!container) return;

    let optionsHtml = Object.keys(outboundMappings).map(key => `<option value="${key}">${outboundMappings[key].name}</option>`).join('');

    container.innerHTML = `
        <div class="w-full max-w-7xl mx-auto space-y-6">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div class="flex-1">
                        <label class="block text-xs font-black text-slate-500 mb-2">1. 발주서 양식(업체) 선택</label>
                        <select id="outbound-client-select" class="w-full p-3 border border-slate-300 rounded-lg font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer">
                            ${optionsHtml}
                        </select>
                    </div>
                    <div class="flex-1">
                        <label class="block text-xs font-black text-slate-500 mb-2">2. 엑셀/CSV 파일 업로드</label>
                        <input type="file" id="outbound-file-upload" accept=".xlsx, .xls, .csv" class="w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded-lg">
                    </div>
                    <div class="w-full md:w-auto">
                        <button onclick="processOutboundExcel()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-8 rounded-lg shadow-md transition-all flex items-center justify-center space-x-2">
                            <span>데이터 추출 시작</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div class="font-black text-slate-700">📋 추출된 발주 데이터 미리보기 <span id="outbound-count" class="text-indigo-600 ml-2">0건</span></div>
                    <button onclick="confirmOutboundData()" class="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded text-xs font-black shadow-sm transition-colors hidden" id="outbound-confirm-btn">
                        이대로 출고/서류 생성하기
                    </button>
                </div>
                <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
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
                            <tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">엑셀 파일을 업로드하면 이곳에 정제된 데이터가 표시됩니다.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// 💡 4. 엑셀 파일 읽기 및 매핑 엔진 실행
async function processOutboundExcel() {
    const fileInput = document.getElementById('outbound-file-upload');
    const clientKey = document.getElementById('outbound-client-select').value;
    
    if(!fileInput.files.length) return alert("업로드할 엑셀/CSV 파일을 선택해주세요!");
    
    const file = fileInput.files[0];
    const mapping = outboundMappings[clientKey];
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // 헤더 위치를 무시하고 무조건 2차원 배열(Array of Arrays) 형태로 전체를 가져옴 (가장 안전함)
            const rawData = XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: ""});
            
            if(rawData.length <= mapping.headerRow) throw new Error("데이터가 너무 적거나 헤더 위치가 잘못되었습니다.");

            // 1. 진짜 제목(Header) 줄 찾기
            const headerRow = rawData[mapping.headerRow].map(h => cleanText(h));
            
            // 2. 제목 줄에서 우리가 필요한 컬럼이 몇 번째(Index)에 있는지 찾기
            const idxItem = headerRow.findIndex(h => h.includes(cleanText(mapping.colItemName)));
            const idxQty = headerRow.findIndex(h => h.includes(cleanText(mapping.colQty)));
            const idxPrice = headerRow.findIndex(h => h.includes(cleanText(mapping.colPrice)));
            const idxDest = headerRow.findIndex(h => h.includes(cleanText(mapping.colDest)));
            const idxDate = headerRow.findIndex(h => h.includes(cleanText(mapping.colDate)));

            if(idxItem === -1 || idxQty === -1) {
                throw new Error(`엑셀에서 필수 컬럼을 찾을 수 없습니다.\n찾는 이름: [${mapping.colItemName}], [${mapping.colQty}]\n(엑셀 양식이 변경되었는지 확인해주세요.)`);
            }

            parsedOutboundData = [];
            
            // 3. 헤더 다음 줄부터 끝까지 돌면서 알맹이만 뽑아내기
            for(let i = mapping.headerRow + 1; i < rawData.length; i++) {
                const row = rawData[i];
                
                // 품목명이 없으면 빈 줄이나 합계 줄이므로 스킵
                if(!row[idxItem] || String(row[idxItem]).trim() === '') continue;

                // 정제 엔진 가동!
                let rawDate = idxDate !== -1 ? row[idxDate] : '';
                let rawQty = row[idxQty];
                let rawPrice = idxPrice !== -1 ? row[idxPrice] : 0;

                let itemObj = {
                    client_name: mapping.name,
                    expected_date: parseExcelDate(rawDate, mapping.parseDate),
                    destination: idxDest !== -1 ? cleanText(row[idxDest]) : '',
                    original_item_name: cleanText(row[idxItem]),
                    quantity: parseQuantity(rawQty, mapping.parseQty),
                    unit_price: parseQuantity(rawPrice, mapping.parsePrice) // 단가도 숫자만 추출
                };
                
                parsedOutboundData.push(itemObj);
            }

            renderOutboundPreview();
            
        } catch(err) {
            console.error(err);
            alert("❌ 데이터 추출 실패!\n\n" + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// 💡 5. 추출된 데이터 화면에 예쁘게 표출
function renderOutboundPreview() {
    const tbody = document.getElementById('outbound-tbody');
    const countSpan = document.getElementById('outbound-count');
    const confirmBtn = document.getElementById('outbound-confirm-btn');
    
    if(!tbody) return;

    if(parsedOutboundData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 font-bold">추출된 데이터가 없습니다. 양식을 확인해주세요.</td></tr>`;
        countSpan.innerText = `0건`;
        confirmBtn.classList.add('hidden');
        return;
    }

    countSpan.innerText = `${parsedOutboundData.length}건`;
    confirmBtn.classList.remove('hidden');

    tbody.innerHTML = parsedOutboundData.map((item, idx) => `
        <tr class="hover:bg-indigo-50/50 transition-colors border-b border-slate-100">
            <td class="p-3 text-center text-xs text-slate-400 font-bold">${idx + 1}</td>
            <td class="p-3 text-xs font-bold text-slate-600">${item.expected_date || '<span class="text-orange-500">일자없음</span>'}</td>
            <td class="p-3 text-xs font-black text-slate-700">${item.destination}</td>
            <td class="p-3 text-xs font-black text-blue-700">${item.original_item_name}</td>
            <td class="p-3 text-right font-black text-rose-600 text-sm">${item.quantity.toLocaleString()}</td>
            <td class="p-3 text-right font-bold text-slate-500">${item.unit_price.toLocaleString()}</td>
        </tr>
    `).join('');
}

function confirmOutboundData() {
    alert(`🎉 성공적으로 ${parsedOutboundData.length}건의 데이터를 인식했습니다!\n\n다음 단계에서는 이 '원문 품목명'을 '한스팜 표준 품명'으로 변환하고, 템플릿(거래명세서 등)에 얹어 인쇄하는 로직이 들어갑니다.`);
}
