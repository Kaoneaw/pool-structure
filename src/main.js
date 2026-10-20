import './style.css';
import { SAMPLE, WARNING, quantities, validateProject, backup, restore, csv } from './quantities.js';
import { exportIfc } from './ifc-export.js';
import { PoolViewer } from './viewer.js';
import { PdfViewer } from './pdf-viewer.js';
const $=id=>document.getElementById(id);
const nf=new Intl.NumberFormat('th-TH',{maximumFractionDigits:2,minimumFractionDigits:2});
const n=value=>nf.format(value);
const STORE='pool-studio-project-v1';
let project={...SAMPLE},viewer,worker,ifcElements=[],ifcTree=null,selectedIfc,toastTimer;
let ifcLoaded=false,ifcLoading=false,ifcFileName='';
const fields=[
  ['length','ความยาวภายใน','ม.','geometry',0.01],['width','ความกว้างภายใน','ม.','geometry',0.01],
  ['shallow','ความลึกด้านตื้น','ม.','geometry',0.01],['deep','ความลึกด้านลึก','ม.','geometry',0.01],
  ['wall','ความหนาผนัง','มม.','thickness',1],['slab','ความหนาพื้น (แนวดิ่ง)','มม.','thickness',1],
  ['rimWidth','ความกว้างขอบด้านนอก','ม.','thickness',0],['rimDepth','ความหนาขอบ','ม.','thickness',0],
  ['water','น้ำสูงจากพื้นด้านลึก','ม.','water',0],['groundwater','ระดับน้ำใต้ดินจากพื้นด้านลึก','ม.','water',0],
  ['soilWeight','หน่วยน้ำหนักดิน','kN/ม³','engineering',0],['soilK','สัมประสิทธิ์แรงดันดิน K','—','engineering',0],
  ['soilBearing','กำลังแบกทานดินปลอดภัย','kPa','engineering',0],['liveLoad','น้ำหนักบรรทุกจร','kPa','engineering',0],
  ['concrete','กำลังอัดคอนกรีต f′c','MPa','engineering',0],['steel','กำลังครากเหล็ก fy','MPa','engineering',0],
  ['cover','ระยะหุ้มคอนกรีต','มม.','engineering',0],['wallBar','ขนาดเหล็กผนัง','มม.','engineering',0],
  ['wallSpacing','ระยะห่างเหล็กผนัง','มม.','engineering',0],['slabBar','ขนาดเหล็กพื้น','มม.','engineering',0],['slabSpacing','ระยะห่างเหล็กพื้น','มม.','engineering',0],
];
for(const [key,label,unit,group,min]of fields){
  const field=document.createElement('label');field.className='field';field.append(label);
  const wrap=document.createElement('span');wrap.className='input-wrap';
  const input=document.createElement('input');input.name=key;input.type='number';input.min=min;input.step='any';input.inputMode='decimal';input.placeholder='ยังไม่กำหนด';
  if(!['engineering','groundwater'].includes(group)&&key!=='groundwater')input.required=true;
  const suffix=document.createElement('span');suffix.className='input-unit';suffix.textContent=unit;wrap.append(input,suffix);field.append(wrap);$(group+'-fields').append(field);
}
export function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
const escapeHtml=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
try {const saved=localStorage.getItem(STORE);if(saved)project=restore(JSON.parse(saved));if(localStorage.getItem('pool-studio-theme')==='dark')document.body.classList.add('dark');} catch {notify('ข้อมูลที่บันทึกไว้ไม่ถูกต้องหรือเบราว์เซอร์ไม่อนุญาตการจัดเก็บ ใช้ข้อมูลตัวอย่างแทน');}
function fillForm(){for(const [key,value]of Object.entries(project)){const input=$('project-form').elements.namedItem(key);if(input)input.value=value??'';}}
function readForm(){const values={};for(const element of $('project-form').elements){if(!element.name)continue;values[element.name]=element.type==='number'?(element.value===''?null:Number(element.value)):element.value;}return validateProject(values);}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(backup(project)));$('save-state').textContent='บันทึกในเครื่องแล้ว';}catch{$('save-state').textContent='บันทึกไม่ได้';notify('เบราว์เซอร์ไม่อนุญาตบันทึก ใช้สำรองข้อมูล JSON แทน');}}
const quantityRows=q=>[
  ['คอนกรีตพื้นสระ',q.slabConcrete,'ม³'],['คอนกรีตผนัง',q.wallConcrete,'ม³'],['คอนกรีตขอบสระ',q.rimConcrete,'ม³'],['คอนกรีตรวม',q.concrete,'ม³'],
  ['แบบหล่อผนัง 2 ด้าน',q.wallFormwork,'ม²'],['ผิวภายใน / กันซึม',q.waterproofArea,'ม²'],['ปริมาตรน้ำ',q.waterVolume,'ม³'],['น้ำหนักเหล็กเสริม','รอรายละเอียดเหล็ก','กก.'],
];
const checks=[
  ['แรงดันน้ำและดิน / กราฟแรงดัน','รอโมเดลแรงกระทำ'],['โมเมนต์และแรงเฉือนผนัง / พื้น','รอการรองรับและโหลด'],
  ['กำลังรับแรงดัด / แรงเฉือน','รอเกณฑ์มาตรฐาน'],['เหล็กขั้นต่ำ / รอยร้าว / การรั่วซึม','รอเกณฑ์มาตรฐาน'],
  ['แรงยกตัว / เสถียรภาพการลอย','รอกรณีโหลดและ FS'],['กำลังแบกทาน / การทรุดตัว','รอข้อมูลดินและแบบจำลอง'],['แรงแผ่นดินไหว','รอพื้นที่และเกณฑ์'],
];
$('engineering-checks').innerHTML=checks.map(([label,status])=>`<div class="check-row"><span>${label}</span><span>◷ ${status}</span></div>`).join('');
$('warning').textContent=WARNING;
function formulaText(q){return `<p>กำหนด L = ${project.length} ม., W = ${project.width} ม., d₁ = ${project.shallow} ม., d₂ = ${project.deep} ม., t = ${project.wall/1000} ม., s = ${project.slab/1000} ม. ขนาดภายในสระเป็นฐานคำนวณ</p>
  <p>ความลึกเฉลี่ย<code>d̄ = (d₁ + d₂) / 2 = ${n(q.averageDepth)} ม.</code></p>
  <p>คอนกรีตพื้น ความหนาแนวดิ่ง<code>Vพื้น = (L+2t)(W+2t)s = ${n(q.slabConcrete)} ม³</code></p>
  <p>คอนกรีตผนัง ไม่ซ้ำกับพื้น<code>Vผนัง = [(L+2t)(W+2t) − LW]d̄ = ${n(q.wallConcrete)} ม³</code></p>
  <p>ขอบสระวงแหวนด้านนอก ความกว้าง r ความหนา h ไม่ซ้อนผนัง<code>Vขอบ = [(L+2t+2r)(W+2t+2r) − (L+2t)(W+2t)]h</code></p>
  <p>ผิวภายในเต็มสระ รวมผนังและพื้นลาด ไม่จำกัดเฉพาะส่วนเปียก<code>A = 2Ld̄ + W(d₁+d₂) + W√[L²+(d₂−d₁)²]</code></p>
  <p>แบบหล่อเฉพาะผนังทั้ง 2 ด้าน ไม่รวมพื้น ขอบ และพื้นที่รอยต่อ<code>Aแบบ = 2Ld̄ + W(d₁+d₂) + 2(L+2t)d̄ + (W+2t)(d₁+d₂)</code></p>
  <p>ผิวน้ำเป็นแนวราบ H วัดจากพื้นด้านลึก; k = (d₂−d₁)/L, ℓ = min(L,H/k) เมื่อ k=0 ใช้ ℓ=L<code>Vน้ำ = W(Hℓ − kℓ²/2) = ${n(q.waterVolume)} ม³</code></p>
  <p>สูตรเป็นเรขาคณิตและการอินทิเกรตรูปทรง ไม่ใช่การตรวจความปลอดภัยตามมาตรฐาน ไม่เผื่อสูญเสีย ไม่รวมช่องเปิด บันได รอยต่อ เหล็กทาบ และเหล็กยึด</p>`;}
function update(){
  const q=quantities(project);$('header-project').textContent=project.name;
  $('stat-size').textContent=`${project.width} × ${project.length}`;$('stat-depth').textContent=n(q.averageDepth);$('stat-water').textContent=n(q.waterVolume);$('stat-concrete').textContent=n(q.concrete);
  $('quantities-table').innerHTML=`<table class="quantity-table"><thead><tr><th>รายการ</th><th>ปริมาณ</th><th>หน่วย</th></tr></thead><tbody>${quantityRows(q).map(([label,value,unit])=>`<tr class="${label==='คอนกรีตรวม'?'total':''}"><td>${label}</td><td>${typeof value==='number'?n(value):value}</td><td>${unit}</td></tr>`).join('')}</tbody></table>`;
  $('formula-content').innerHTML=formulaText(q);viewer?.build(project);
}
fillForm();
try{viewer=new PoolViewer($('viewer'),selection=>{
  if(typeof selection.id==='number')selectIfc(selection.id);else $('pool-selection').textContent=`เลือก: ${selection.name} · ${selection.type}`;
},distance=>{$('measure3d-result').hidden=false;$('measure3d-result').textContent=`ระยะ ${distance.toFixed(3)} ม. · คลิกใหม่เพื่อเริ่มวัดอีกครั้ง`;});}catch{$('viewer-fallback').hidden=false;notify('เครื่องนี้ไม่รองรับ WebGL: ยังใช้ฟอร์ม PDF และปริมาณได้');}
update();viewer?.fit();
$('project-form').onsubmit=event=>{event.preventDefault();try{const next=readForm();project=next;$('form-error').hidden=true;update();persist();notify('อัปเดตโมเดลและปริมาณแล้ว');}catch(error){$('form-error').textContent=error.message;$('form-error').hidden=false;}};
$('sample').onclick=()=>{project={...SAMPLE};fillForm();update();viewer?.fit();persist();$('form-error').hidden=true;};
for(const tab of document.querySelectorAll('[data-tab]'))tab.onclick=()=>{for(const button of document.querySelectorAll('[data-tab]')){const active=button===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',active);$('panel-'+button.dataset.tab).hidden=!active;}};
$('theme').onclick=()=>{document.body.classList.toggle('dark');try{localStorage.setItem('pool-studio-theme',document.body.classList.contains('dark')?'dark':'light');}catch{}};
for(const mode of ['project','model'])$('mobile-'+mode).onclick=()=>{document.body.dataset.mobile=mode;for(const m of ['project','model'])$('mobile-'+m).classList.toggle('active',m===mode);if(mode==='model')requestAnimationFrame(()=>{viewer?.resize();viewer?.fit();});};
function download(name,contents,type){const url=URL.createObjectURL(new Blob([contents],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function requireCommitted(){try{const pending=readForm();if(JSON.stringify(pending)!==JSON.stringify(project)){notify('มีข้อมูลที่แก้ไขไว้ กรุณากดอัปเดตโมเดลก่อนส่งออก');return false;}return true;}catch(error){notify(error.message);return false;}}
$('backup').onclick=()=>{if(requireCommitted())download('pool-project.json',JSON.stringify(backup(project),null,2),'application/json');};
$('restore').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('ไฟล์ JSON ใหญ่เกิน 1 MB');const next=restore(JSON.parse(await file.text()));project=next;fillForm();update();viewer?.fit();persist();notify('กู้คืนโครงการแล้ว');}catch(error){notify('กู้คืนไม่ได้: '+error.message);}finally{event.target.value='';}};
$('csv').onclick=()=>{if(!requireCommitted())return;download('pool-quantities.csv',csv([['โครงการ',project.name],['สถานะ','ปริมาณรูปทรง ยังไม่ได้ตรวจวิศวกรรม'],['คำเตือน',WARNING],['รายการ','ปริมาณ','หน่วย'],...quantityRows(quantities(project))]),'text/csv;charset=utf-8');};
$('export-ifc').onclick=()=>{if(requireCommitted()){download('pool-model.ifc',exportIfc(project),'application/x-step');notify('ส่งออก IFC4 เฉพาะโมเดลพารามิเตอร์ของสระ ไม่รวมไฟล์ IFC ที่นำเข้า');}};
$('print').onclick=()=>{
  if(!requireCommitted())return;
  const q=quantities(project), date=new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date());
  const inputs=fields.map(([key,label,unit])=>`<tr><td>${label}</td><td>${project[key]===null?'ยังไม่กำหนด':escapeHtml(project[key])}</td><td>${unit}</td></tr>`).join('');
  $('print-report').innerHTML=`<header><p>POOL STUDIO · รายงานปริมาณรูปทรงเบื้องต้น</p><h1>${escapeHtml(project.name)}</h1><p>วันที่ ${date} · มาตรฐานออกแบบ: ยังไม่ยืนยัน / ยังไม่ตรวจความปลอดภัย</p></header><p class="print-warning">${WARNING}</p><h2>ข้อมูลที่ใช้</h2><p>รูปทรง: สี่เหลี่ยมผืนผ้า พื้นลาดตามยาว ผนังตั้งตรง ความหนาพื้นวัดแนวดิ่ง ขอบบนอยู่ระนาบเดียวกัน · พื้นที่/แผ่นดินไหว: ${escapeHtml(project.seismic||'ยังไม่กำหนด')}</p><table><thead><tr><th>ข้อมูล</th><th>ค่า</th><th>หน่วย</th></tr></thead><tbody>${inputs}</tbody></table><h2>ปริมาณงานจากรูปทรง</h2>${$('quantities-table').innerHTML}<h2>สูตรและสมมติฐาน</h2>${formulaText(q)}<h2>สถานะตรวจทางวิศวกรรม</h2><p class="print-pending">รอข้อมูลอ้างอิง ไม่มีผลผ่าน / ไม่ผ่าน</p>${checks.map(([label,status])=>`<p>${label}: ${status}</p>`).join('')}<p>ต้องยืนยันกรณีสระเต็มน้ำ / สระว่างรับดินและน้ำใต้ดิน / ก่อสร้างและทดสอบน้ำ รวมทั้งสมมติฐานการรองรับและเกณฑ์โหลดจากมาตรฐานฉบับที่ใช้</p><p>ยังไม่มีโจทย์ต้นแบบสำหรับเทียบ RCTankC และยังไม่คำนวณน้ำหนักเหล็กเสริม</p><footer>ไฟล์ PDF / IFC ที่นำเข้าเป็นแบบอ้างอิงเท่านั้น · ไม่รวมในรายงานนี้<br>${WARNING}</footer>`;
  window.print();
};
$('compare').onclick=()=>{$('comparison-status').textContent='ยังไม่มีโจทย์ตัวอย่างและผล RCTankC ใน /reference จึงยังเทียบหรือคำนวณ % ความต่างไม่ได้ ไม่ได้รันหรือแกะไฟล์ .exe';};
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{viewer?.fit(button.dataset.view);for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b===button);};
$('fit').onclick=()=>viewer?.fit();
for(const [id,property]of [['transparent','transparent'],['section','clipping'],['color-types','colored'],['measure3d','measure']])$(id).onclick=()=>{
  if(!viewer)return;viewer[property]=!viewer[property];$(id).setAttribute('aria-pressed',viewer[property]);viewer.applyMaterials();
  if(id==='section'){$('section-control').hidden=!viewer.clipping;viewer.sectionAt(Number($('section-position').value)/100);}
  if(id==='measure3d'){viewer.clearMeasurement();$('measure3d-result').hidden=!viewer.measure;$('measure3d-result').textContent='คลิก 2 จุดบนผิวโมเดลเพื่อวัดระยะ';}
};
$('section-position').oninput=event=>viewer?.sectionAt(Number(event.target.value)/100);
function setMode(mode){if(mode==='ifc'&&!ifcLoaded&&!ifcLoading){notify('เปิดไฟล์ IFC ก่อนเปลี่ยนมุมมอง');return;}viewer?.setMode(mode);$('mode-pool').classList.toggle('active',mode==='pool');$('mode-ifc').classList.toggle('active',mode==='ifc');$('model-caption').textContent=mode==='pool'?'สี่เหลี่ยมผืนผ้า · พื้นลาดตามยาว':ifcFileName;$('measure3d-result').hidden=true;viewer?.fit();}
$('mode-pool').onclick=()=>setMode('pool');$('mode-ifc').onclick=()=>setMode('ifc');
const pdf=new PdfViewer(notify,()=>viewer?.hideReference());
async function loadPdf(file){try{await pdf.load(file);}catch(error){notify('เปิด PDF ไม่สำเร็จ: '+error.message);}}
$('pdf-file').onchange=event=>{loadPdf(event.target.files[0]);event.target.value='';};
function bindDrop(id,handler){const node=$(id);node.addEventListener('dragover',event=>{event.preventDefault();node.classList.add('drag-over');});node.addEventListener('dragleave',()=>node.classList.remove('drag-over'));node.addEventListener('drop',event=>{event.preventDefault();node.classList.remove('drag-over');if(event.dataTransfer.files[0])handler(event.dataTransfer.files[0]);});}
bindDrop('pdf-drop',loadPdf);
$('pdf-to-3d').onclick=()=>{try{if(!viewer)throw new Error('WebGL ไม่พร้อม');const {canvas,scale}=pdf.reference(),options={};for(const key of ['x','y','z','rotation','opacity']){const val=Number($('ref-'+key).value);if(!Number.isFinite(val))throw new Error('ตำแหน่งแบบต้องเป็นตัวเลข');options[key]=val;}viewer.setReference(canvas,scale,options);notify('วางแบบ PDF ในฉาก 3D แล้ว');}catch(error){notify(error.message);}};
$('hide-reference').onclick=()=>viewer?.hideReference();
async function loadIfc(file){
  if(!file)return;
  if(!viewer){notify('ต้องเปิดใช้งาน WebGL เพื่อดู IFC');return;}
  if(!file.name.toLowerCase().endsWith('.ifc')){notify('กรุณาเลือกไฟล์ .ifc แบบ STEP');return;}
  if(file.size>200*1024*1024){notify('ไฟล์เกิน 200 MB กรุณาแยกโมเดลเพื่อลดการใช้หน่วยความจำ');return;}
  try {
    const head=await file.slice(0,8192).text();
    if(!head.includes('ISO-10303-21;')||!head.match(/FILE_SCHEMA\s*\(\s*\(\s*'IFC(?:2X3|4|4X3[^']*)'/i))throw new Error('ส่วนหัวหรือสคีมา IFC ไม่รองรับ (รับ IFC2X3, IFC4, IFC4X3 ตาม web-ifc)');
    worker?.terminate();worker=new Worker(new URL('./ifc-worker.js',import.meta.url),{type:'module'});
    viewer.clear(viewer.ifc);ifcElements=[];ifcTree=null;selectedIfc=null;ifcLoaded=false;ifcLoading=true;ifcFileName=file.name;
    $('loading').hidden=false;$('loading-text').textContent='กำลังอ่าน IFC ในเบื้องหลัง…';$('ifc-progress').value=0;$('ifc-content').hidden=true;$('ifc-properties').replaceChildren();
    worker.onmessage=event=>handleIfc(event.data);worker.onerror=()=>failIfc('ตัวอ่าน IFC หยุดทำงาน อาจเกิดจากหน่วยความจำหรือ WebAssembly ไม่รองรับ');
    const buffer=await file.arrayBuffer();const wasm=new URL('wasm/',new URL(import.meta.env.BASE_URL,location.href)).href;
    worker.postMessage({kind:'load',buffer,wasm},[buffer]);
    setMode('ifc');
  } catch(error){notify(error.message);}
}
function failIfc(message){worker?.terminate();worker=null;ifcLoading=false;ifcLoaded=false;$('loading').hidden=true;$('ifc-content').hidden=true;viewer?.clear(viewer.ifc);$('ifc-summary').textContent='ยังไม่มีโมเดล IFC';setMode('pool');notify('เปิด IFC ไม่สำเร็จ: '+message);}
$('cancel-ifc').onclick=()=>failIfc('ยกเลิกการอ่านไฟล์แล้ว');
$('ifc-file').onchange=event=>{loadIfc(event.target.files[0]);event.target.value='';};bindDrop('ifc-drop',loadIfc);
function handleIfc(data){
  if(data.kind==='error'){if(ifcLoading)failIfc(data.message);else notify('อ่านคุณสมบัติไม่สำเร็จ: '+data.message);return;}
  if(data.kind==='meshes'){viewer.addIfc(data.batch);$('ifc-progress').value=data.progress;return;}
  if(data.kind==='loaded'){
    ifcLoading=false;ifcLoaded=true;ifcElements=data.elements;ifcTree=data.tree;$('loading').hidden=true;$('ifc-content').hidden=false;
    $('ifc-summary').textContent=`${ifcFileName} · ${data.schema} · ${data.count} องค์ประกอบ`;
    if(data.count===0)notify('เปิด IFC ได้ แต่ไม่พบเรขาคณิตที่แสดงผลได้');else notify('อ่าน IFC สำเร็จ คลิกองค์ประกอบเพื่อดูข้อมูล');
    renderTypeTree();viewer.fit();return;
  }
  if(data.kind==='properties'&&data.id===selectedIfc)showProperties(data);
}
function selectIfc(id){selectedIfc=id;viewer?.select(id);$('ifc-properties').textContent='กำลังอ่านคุณสมบัติ…';worker?.postMessage({kind:'properties',id});}
function elementButton(item){const b=document.createElement('button');b.className='element-button';b.textContent=`#${item.id??item.expressID} ${item.name??item.Name?.value??item.type}`;b.onclick=()=>selectIfc(item.id??item.expressID);return b;}
function renderTypeTree(){
  const root=$('ifc-tree');root.replaceChildren();const groups=new Map();for(const item of ifcElements){if(!groups.has(item.type))groups.set(item.type,[]);groups.get(item.type).push(item);}
  for(const [type,items]of groups){const details=document.createElement('details');details.className='tree-group';const summary=document.createElement('summary');summary.textContent=`${type} (${items.length})`;details.append(summary);const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.onchange=()=>viewer.toggleType(type,checkbox.checked);label.append(checkbox,'แสดงองค์ประกอบ');details.append(label);let populated=false;details.ontoggle=()=>{if(details.open&&!populated){const visible=items.slice(0,300);details.append(...visible.map(elementButton));if(items.length>300){const more=document.createElement('button');more.className='text-button';more.textContent='แสดงเพิ่มครั้งละ 300';let offset=300;more.onclick=()=>{details.insertBefore(document.createDocumentFragment(),more);for(const item of items.slice(offset,offset+300))details.insertBefore(elementButton(item),more);offset+=300;if(offset>=items.length)more.remove();};details.append(more);}populated=true;}};root.append(details);}
}
function renderSpatial(){
  if(!ifcTree){notify('ไฟล์นี้ไม่มีโครงสร้างพื้นที่ที่อ่านได้ ใช้แผนผังตามชนิด');return;}
  const root=$('ifc-tree');root.replaceChildren();
  function node(data,depth=0){if(depth>25)return document.createTextNode('…');const d=document.createElement('details');d.className='tree-group';const summary=document.createElement('summary');summary.textContent=`${data.type} · ${data.Name?.value??data.expressID}`;d.append(summary);let populated=false;d.ontoggle=()=>{if(d.open&&!populated){d.append(elementButton(data));for(const child of data.children??[])d.append(node(child,depth+1));populated=true;}};return d;}
  root.append(node(ifcTree));
}
$('tree-types').onclick=renderTypeTree;$('tree-storeys').onclick=renderSpatial;
const unbox=value=>value&&typeof value==='object'&&'value'in value?value.value:value;
function showProperties(data){
  const root=$('ifc-properties');root.replaceChildren();
  const heading=document.createElement('strong');heading.textContent=`#${data.id} ${unbox(data.item.Name)||''}`;root.append(heading);
  function display(label,obj,depth=0,parent=root){
    if(depth>7)return;
    if(obj===null||obj===undefined)return;
    const value=unbox(obj);
    if(typeof value!=='object'){
      const row=document.createElement('div');row.className='property-pair';const name=document.createElement('span');name.textContent=label;
      const content=document.createElement('button');content.textContent=String(value);content.title='ตรวจข้อมูลก่อนนำไปใช้';content.onclick=()=>openImport(label,value,data);row.append(name,content);parent.append(row);return;
    }
    const details=document.createElement('details');details.className='property-group';const summary=document.createElement('summary');summary.textContent=label;details.append(summary);parent.append(details);let populated=false;
    details.ontoggle=()=>{if(details.open&&!populated){for(const [key,child]of Object.entries(value))display(key,child,depth+1,details);populated=true;}};
  }
  display('องค์ประกอบ',data.item);display('ชุดคุณสมบัติ / ปริมาณ',data.sets);display('วัสดุ',data.materials);
}
for(const [key,label,unit]of [...fields,['name','ชื่อโครงการ','ข้อความ'],['ifcStorey','ชื่อชั้นจาก IFC','ข้อความ'],['ifcMaterial','ชื่อวัสดุจาก IFC','ข้อความ']]){const option=document.createElement('option');option.value=key;option.textContent=`${label} (${unit})`;$('import-key').append(option);}
function openImport(label,value,data){$('import-source').textContent=`องค์ประกอบ #${data.id}\n${label}: ${value}\nตรวจชนิด หน่วย และความหมายของค่านี้จากไฟล์ก่อนนำเข้า`; $('import-key').value=typeof value==='number'?'length':'ifcMaterial';$('import-value').value=String(value);$('import-dialog').showModal();}
$('apply-import').onclick=()=>{try{const key=$('import-key').value,text=$('import-value').value;const value=['name','ifcStorey','ifcMaterial'].includes(key)?text:Number(text);if(text===''||(typeof value==='number'&&!Number.isFinite(value)))throw new Error('กรอกค่าที่ตรวจสอบชนิดและหน่วยแล้ว');const next=validateProject({...project,[key]:value});project=next;fillForm();update();persist();$('import-dialog').close();notify('นำค่าที่ตรวจสอบแล้วมาใช้ในโครงการ');}catch(error){notify(error.message);}};
