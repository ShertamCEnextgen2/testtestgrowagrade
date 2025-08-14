// script.js
// ต้องวางไฟล์ `xml` ในโฟลเดอร์เดียวกับไฟล์นี้
// วิธีการทำงาน: โหลด XML -> อ่าน header -> สร้างรายการมหาวิทยาลัย/คณะ -> แสดงช่องกรอกเฉพาะวิชาที่มีน้ำหนัก > 0
// ผลลัพธ์: คำนวณคะแนนรวม (สมมติคะแนน 0-100) แล้วเปรียบเทียบกับค่าสูงสุด/ต่ำสุดจาก XML

const xmlFile = 'grow.xml';

let dataRows = []; // array of objects per row
let headers = [];

const $ = id => document.getElementById(id);

async function init(){
  try{
    const txt = await fetch(xmlFile).then(r => r.text());
    const parser = new DOMParser();
    const xml = parser.parseFromString(txt, 'application/xml');

    // rows are under Workbook/Worksheet/Table/Row
    const rows = Array.from(xml.querySelectorAll('Worksheet Table Row'));
    if(rows.length === 0){
      console.error('ไม่พบข้อมูลใน XML (รูปแบบไม่ถูกต้อง)');
      return;
    }

    // parse header row (first)
    const headerRow = rows[0];
    headers = Array.from(headerRow.querySelectorAll('Cell Data')).map(n => n.textContent.trim());
    // subsequent rows -> values per cell (some cells missing)
    for(let i=1;i<rows.length;i++){
      const cells = rows[i].querySelectorAll('Cell');
      if(cells.length === 0) continue;
      let obj = {};
      for(let c=0;c<headers.length;c++){
        const cell = cells[c];
        let text = '';
        if(cell){
          const dataNode = cell.querySelector('Data');
          if(dataNode) text = dataNode.textContent.trim();
        }
        obj[headers[c] || `col${c}`] = text;
      }
      // require at least University and Faculty
      if(obj['มหาวิทยาลัย'] && obj['คณะ']) dataRows.push(obj);
    }

    populateUniversities();
  }catch(err){
    console.error('โหลด XML ผิดพลาด:', err);
  }
}

function populateUniversities(){
  const uniSet = [...new Set(dataRows.map(r => r['มหาวิทยาลัย']))].sort();
  const uniSel = $('university');
  uniSel.innerHTML = '<option value="">-- เลือกมหาวิทยาลัย --</option>';
  uniSet.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    uniSel.appendChild(opt);
  });

  uniSel.addEventListener('change', onUniversityChange);
  $('faculty').addEventListener('change', onFacultyChange);
  $('calculateBtn').addEventListener('click', calculateScore);
  $('resetBtn').addEventListener('click', resetForm);
}

function onUniversityChange(){
  const uni = this.value;
  const facSel = $('faculty');
  facSel.innerHTML = '<option value="">-- เลือกคณะ/หลักสูตร --</option>';
  if(!uni) return hideCards();

  const faculties = dataRows
    .filter(r => r['มหาวิทยาลัย'] === uni)
    .map(r => r['คณะ'])
    .filter(Boolean);

  const uniqFac = [...new Set(faculties)];
  uniqFac.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f; opt.textContent = f;
    facSel.appendChild(opt);
  });
  $('weightsInfo').textContent = `พบ ${uniqFac.length} คณะใน "${uni}"`;
  hideCards(false);
}

function onFacultyChange(){
  const uni = $('university').value;
  const fac = this.value;
  if(!uni || !fac) return hideCards();
  const row = dataRows.find(r => r['มหาวิทยาลัย'] === uni && r['คณะ'] === fac);
  if(!row) return hideCards();

  // determine weight fields (columns with numeric > 0)
  // Typical headers include TPAT1 TPAT2 ... TGAT TGAT1 ... A-LEVEL ... GPAX สูงสุด ต่ำสุด
  const weightFields = headers.filter(h => {
    if(!row[h]) return false;
    const v = parseFloat(row[h]);
    return !isNaN(v) && v > 0 && h !== 'สูงสุด' && h !== 'ต่ำสุด';
  });

  // Build input fields for weightFields
  const inputsArea = $('inputsArea');
  inputsArea.innerHTML = '';
  weightFields.forEach(h => {
    // skip weird labels like TPAT22 empty etc if header is blank
    const label = h;
    const wrapper = document.createElement('div');
    wrapper.className = 'row small';
    wrapper.innerHTML = `
      <label style="min-width:120px;font-weight:600;font-size:0.9rem">${label}</label>
      <input data-field="${label}" type="number" step="0.01" min="0" max="100" placeholder="0-100" />
      <div style="min-width:64px;text-align:right;color:var(--muted);font-size:0.9rem;padding-left:6px">
        × ${parseFloat(row[label])}
      </div>
    `;
    inputsArea.appendChild(wrapper);
  });

  // GPAX control: if GPAX weight present, prefill gpax input placeholder
  const gpaxWeight = parseFloat(row['GPAX'] || 0);
  const gpax = $('gpaxInput');
  if(gpaxWeight && gpaxWeight > 0){
    $('gpaxInput').parentElement.style.display = 'flex';
    gpax.placeholder = '0-4 หรือ 0-100 (ขึ้นกับที่คุณใช้)';
  } else {
    $('gpaxInput').parentElement.style.display = 'none';
  }

  // Show cards
  $('scoresCard').classList.remove('hidden');
  $('resultCard').classList.add('hidden');

  // display min/max
  const min = row['ต่ำสุด'] || '';
  const max = row['สูงสุด'] || '';
  $('weightsInfo').textContent = `น้ำหนักที่ใช้สำหรับคำนวณ: ${weightFields.join(', ') || 'ไม่มี'} — สูงสุด: ${max} ต่ำสุด: ${min}`;
  // store selectedRow on form (simple)
  $('scoreForm').dataset.selected = JSON.stringify(row);
}

function calculateScore(){
  const row = JSON.parse($('scoreForm').dataset.selected || '{}');
  if(!row['มหาวิทยาลัย']) return alert('เลือกคณะก่อน');

  // collect weights and inputs
  const inputs = Array.from(document.querySelectorAll('#inputsArea input'));
  let total = 0;
  let weightSum = 0;
  inputs.forEach(inp => {
    const field = inp.dataset.field;
    const weight = parseFloat(row[field] || 0);
    const value = parseFloat(inp.value || 0);
    // assume user's value in 0-100 scale; weight is fraction (0-1)
    if(!isNaN(weight) && weight > 0){
      total += weight * value;
      weightSum += weight;
    }
  });

  // GPAX handling: if GPAX weight present, try to scale GPAX to 0-100 if gpax<=4
  const gpaxWeight = parseFloat(row['GPAX'] || 0);
  if(gpaxWeight > 0){
    let g = parseFloat($('gpaxInput').value || 0);
    if(g <= 4){ // assume GPA 0-4 -> convert to percent (4 -> 100)
      g = (g / 4) * 100;
    }
    total += gpaxWeight * g;
    weightSum += gpaxWeight;
  }

  // If weights sum < 1, we keep as-is (result will be out-of-100 scale if weights sum==1)
  const normalized = (weightSum > 0) ? (total / (Math.max(1, weightSum))) : total;
  // But typically weights are fractions summing to 1; we display as number with two decimals
  const score = Math.round(normalized * 100) / 100;

  $('predictedScore').textContent = (score).toLocaleString('en-US',{maximumFractionDigits:2}) + ' / 100';
  // compare with min/max in XML (they are already numbers like 75, 60 etc)
  const min = parseFloat(row['ต่ำสุด'] || 'NaN');
  const max = parseFloat(row['สูงสุด'] || 'NaN');

  if(!isNaN(min) && !isNaN(max)){
    $('minMax').textContent = `${max} (สูงสุด)  /  ${min} (ต่ำสุด)`;
    // update bars: compute percents relative to 100
    const clamp = v => Math.max(0, Math.min(100, v));
    const barMax = clamp(max);
    const barMin = clamp(min);
    const barYour = clamp(score);

    // set widths
    $('barMax').style.left = '0%';
    $('barMax').style.width = `${barMax}%`;
    $('barYour').style.left = `${Math.min(barYour, 99.9)}%`;
    $('barYour').style.width = `2%`;
    $('barMin').style.left = `${Math.min(barMin, 99.9)}%`;
    $('barMin').style.width = `2%`;

    // advice text
    let advice = '';
    if(score >= max) advice = 'คะแนนของคุณสูงกว่า/เท่ากับค่าสูงสุดของปี 68 — เยี่ยม!';
    else if(score >= min) advice = 'คะแนนของคุณอยู่ในช่วงที่เคยติด (ระหว่าง ต่ำสุด-สูงสุด) — มีโอกาส';
    else advice = 'คะแนนของคุณต่ำกว่าช่วงต่ำสุดที่เคยติด — ควรหาวิธีเพิ่มคะแนน/สำรองแผน';
    $('advice').textContent = advice;
  } else {
    $('minMax').textContent = 'ไม่มีข้อมูลสูงสุด/ต่ำสุดสำหรับคณะนี้';
    $('barMax').style.width='0%'; $('barYour').style.width='0%'; $('barMin').style.width='0%';
    $('advice').textContent = '';
  }

  $('resultCard').classList.remove('hidden');
}

function resetForm(){
  document.getElementById('scoreForm').reset();
  $('predictedScore').textContent = '—';
  $('minMax').textContent = '—';
  $('resultCard').classList.add('hidden');
}

function hideCards(clear=true){
  if(clear){
    $('scoresCard').classList.add('hidden');
    $('resultCard').classList.add('hidden');
  } else {
    $('scoresCard').classList.add('hidden');
    $('resultCard').classList.add('hidden');
  }
}

init();
