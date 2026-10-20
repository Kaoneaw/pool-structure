import { test, expect } from '@playwright/test';
import { SAMPLE } from '../../src/quantities.js';
import { exportIfc } from '../../src/ifc-export.js';
import { readFile } from 'node:fs/promises';

function pdfFixture() {
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 35 >>\nstream\n0 0 0 RG 50 50 300 300 re S\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << >> /Contents 6 0 R >>',
    '<< /Length 35 >>\nstream\n0 0 0 RG 70 70 200 200 re S\nendstream',
  ];
  let text='%PDF-1.4\n';const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(text);text+=`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return {name:'แบบทดสอบ.pdf',mimeType:'application/pdf',buffer:Buffer.from(text)};
}

test('เปิดเว็บ โมเดลจริง แก้ขนาด บันทึกในเครื่อง และโหมดมืด',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#viewer canvas')).toBeVisible();await expect(page.locator('#viewer-fallback')).toBeHidden();
  await expect(page.locator('#stat-concrete')).toHaveText('23.28');
  await page.locator('[name="length"]').fill('12');await page.getByRole('button',{name:/อัปเดตโมเดลและปริมาณ/}).click();
  await expect(page.locator('#stat-size')).toHaveText('5 × 12');
  await page.reload();await expect(page.locator('[name="length"]')).toHaveValue('12');
  await page.locator('#theme').click();await expect(page.locator('body')).toHaveClass('dark');
  await page.reload();await expect(page.locator('body')).toHaveClass('dark');expect(errors).toEqual([]);
});

test('ข้อมูลผิดไม่เปลี่ยนโมเดล และไม่ส่งออกข้อมูลที่ยังไม่อัปเดต',async({page})=>{
  await page.goto('/');await page.locator('[name="deep"]').fill('0.5');await page.locator('.update-button').click();
  await expect(page.locator('#form-error')).toContainText('ความลึกด้านลึก');await expect(page.locator('#stat-depth')).toHaveText('1.50');
  await page.locator('[name="deep"]').fill('2');await page.locator('#export-ifc').click();await expect(page.locator('#toast')).toContainText('กดอัปเดตโมเดล');
});

test('IFC4 ผ่าน worker แสดง geometry, tree, Qto, วัสดุ และนำค่าที่เลือกมาใช้',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#ifc-file').setInputFiles({name:'pool.ifc',mimeType:'application/x-step',buffer:Buffer.from(exportIfc(SAMPLE))});
  await expect(page.locator('#ifc-summary')).toContainText('IFC4 · 5 องค์ประกอบ');await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#ifc-tree summary').filter({hasText:'IFCWALL'}).click();
  await page.locator('#ifc-tree .element-button').first().click();
  await expect(page.locator('#ifc-properties')).toContainText('ชุดคุณสมบัติ / ปริมาณ');
  await page.locator('#ifc-properties summary').filter({hasText:'ชุดคุณสมบัติ / ปริมาณ'}).click();
  await page.locator('#ifc-properties summary').filter({hasText:/^0$/}).click();
  await expect(page.locator('#ifc-properties')).toContainText('Qto_WallBaseQuantities');
  await page.locator('#ifc-properties summary').filter({hasText:'วัสดุ'}).click();
  await page.locator('#ifc-properties details').filter({has:page.locator(':scope > summary', {hasText:/^0$/})}).last().locator(':scope > summary').click();
  await expect(page.locator('#ifc-properties')).toContainText('Concrete');
  await page.getByRole('button',{name:'Concrete',exact:true}).first().click();
  await expect(page.locator('#import-dialog')).toBeVisible();await page.locator('#import-key').selectOption('concrete');await page.locator('#import-value').fill('28');await page.locator('#apply-import').click();
  await expect(page.locator('[name="concrete"]')).toHaveValue('28');
  await page.locator('#tree-storeys').click();await expect(page.locator('#ifc-tree')).toContainText('IFCPROJECT');
  await page.locator('#transparent').click();await expect(page.locator('#transparent')).toHaveAttribute('aria-pressed','true');
  await page.locator('#section').click();await expect(page.locator('#section-control')).toBeVisible();expect(errors).toEqual([]);
});

test('PDF 2 หน้า ตั้งสเกล วัด ซูม วางใน 3D และแต่ละหน้ามีสเกลแยกกัน',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('[data-tab="pdf"]').click();await page.locator('#pdf-file').setInputFiles(pdfFixture());
  await expect(page.locator('#pdf-page-label')).toHaveText('หน้า 1 / 2');
  await page.locator('#pdf-calibrate').click();await page.locator('#pdf-canvas').click({position:{x:60,y:60}});await page.locator('#pdf-canvas').click({position:{x:160,y:60}});
  await page.locator('#real-distance').fill('5');await page.locator('#apply-scale').click();
  await page.locator('#pdf-measure').click();await page.locator('#pdf-canvas').click({position:{x:60,y:100}});await page.locator('#pdf-canvas').click({position:{x:160,y:100}});await expect(page.locator('#pdf-measurement')).toContainText('5.000 ม.');
  await page.locator('#pdf-in').click();await expect(page.locator('#pdf-zoom')).toHaveText('125%');
  await page.locator('.reference-settings summary').first().click();await page.locator('#pdf-to-3d').click();await expect(page.locator('#toast')).toContainText('วางแบบ PDF');
  await page.locator('#pdf-next').click();await expect(page.locator('#pdf-page-label')).toHaveText('หน้า 2 / 2');await expect(page.locator('#pdf-status')).toContainText('ยังไม่ได้ตั้งสเกล');
  await page.locator('#pdf-prev').click();await expect(page.locator('#pdf-status')).toContainText('ตั้งสเกลหน้านี้แล้ว');expect(errors).toEqual([]);
});

test('ส่งออก CSV, JSON, IFC และรายงานมีคำเตือนและสถานะไม่ตรวจวิศวกรรม',async({page})=>{
  await page.goto('/');await page.locator('[data-tab="results"]').click();
  await expect(page.locator('#engineering-checks')).toContainText('รอเกณฑ์มาตรฐาน');
  for(const [button,name,content]of [['#backup','pool-project.json','pool-structure'],['#csv','pool-quantities.csv','คอนกรีตรวม'],['#export-ifc','pool-model.ifc',"FILE_SCHEMA(('IFC4'))"]]){
    const downloadPromise=page.waitForEvent('download');await page.locator(button).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe(name);const text=await readFile(await download.path(),'utf8');expect(text).toContain(content);
  }
  await page.evaluate(()=>window.print=()=>{});await page.locator('#print').click();
  await expect(page.locator('#print-report')).toContainText('ต้องให้วิศวกรโยธาที่มีใบอนุญาต');await expect(page.locator('#print-report')).toContainText('ยังไม่ตรวจความปลอดภัย');
  await page.emulateMedia({media:'print'});await expect(page.locator('#print-report')).toBeVisible();await expect(page.locator('.header')).toBeHidden();
});

test('เปลี่ยนไฟล์ PDF ต้องล้างค่าวัด สเกล และช่องตั้งสเกลของไฟล์เก่า',async({page})=>{
  await page.goto('/');await page.locator('[data-tab="pdf"]').click();await page.locator('#pdf-file').setInputFiles(pdfFixture());
  await expect(page.locator('#pdf-page-label')).toHaveText('หน้า 1 / 2');
  await page.locator('#pdf-calibrate').click();await page.locator('#pdf-canvas').click({position:{x:60,y:60}});await page.locator('#pdf-canvas').click({position:{x:160,y:60}});
  await page.locator('#real-distance').fill('5');await page.locator('#apply-scale').click();
  await page.locator('#pdf-measure').click();await page.locator('#pdf-canvas').click({position:{x:60,y:100}});await page.locator('#pdf-canvas').click({position:{x:160,y:100}});
  await expect(page.locator('#pdf-measurement')).toContainText('5.000');
  await page.locator('#pdf-file').setInputFiles({...pdfFixture(),name:'แบบใหม่.pdf'});
  await expect(page.locator('#pdf-drop strong')).toHaveText('แบบใหม่.pdf');
  await expect(page.locator('#pdf-status')).toContainText('ยังไม่ได้ตั้งสเกล');
  await expect(page.locator('#pdf-measurement')).toBeEmpty();
  await page.locator('#pdf-measure').click();await expect(page.locator('#toast')).toContainText('ตั้งสเกลของหน้านี้ก่อน');
  await page.locator('#pdf-calibrate').click();await page.locator('#pdf-canvas').click({position:{x:70,y:70}});await page.locator('#pdf-canvas').click({position:{x:170,y:70}});
  await expect(page.locator('#calibration')).toBeVisible();
  await page.locator('#pdf-file').setInputFiles({...pdfFixture(),name:'แบบถัดไป.pdf'});
  await expect(page.locator('#pdf-drop strong')).toHaveText('แบบถัดไป.pdf');
  await expect(page.locator('#calibration')).toBeHidden();
});

test('กู้คืน JSON ปฏิเสธเวอร์ชันผิด ไม่มีการแทรก HTML จากชื่อโครงการ',async({page})=>{
  await page.goto('/');await page.locator('#restore').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('{"version":9}')});await expect(page.locator('#toast')).toContainText('กู้คืนไม่ได้');
  const project={...SAMPLE,name:'<img src=x onerror=alert(1)>'};await page.locator('#restore').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'pool-structure',version:1,project}))});await expect(page.locator('#header-project')).toHaveText(project.name);expect(await page.locator('#header-project img').count()).toBe(0);
});

test('ไฟล์ IFC ผิดแจ้งภาษาไทย และคำสั่งแสดงโมเดลยังใช้งานได้',async({page})=>{
  await page.goto('/');await page.locator('#ifc-file').setInputFiles({name:'bad.ifc',mimeType:'text/plain',buffer:Buffer.from('broken')});await expect(page.locator('#toast')).toContainText('ส่วนหัวหรือสคีมา IFC ไม่รองรับ');await expect(page.locator('#loading')).toBeHidden();
  await page.locator('[data-view="top"]').click();await expect(page.locator('[data-view="top"]')).toHaveClass('active');
});

test('มือถือไม่มีการล้นแนวนอน ใช้ฟอร์ม/แท็บและโมเดลได้',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#mobile-model').click();await expect(page.locator('#viewer canvas')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#mobile-project').click();await page.locator('[data-tab="results"]').click();await expect(page.locator('#quantities-table')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('ไม่ส่งไฟล์หรือเรียกบริการภายนอกระหว่างดู IFC/PDF',async({page})=>{
  const external=[],uploads=[];page.on('request',request=>{const url=request.url();if(url.startsWith('http')&&!url.startsWith('http://127.0.0.1:4173/'))external.push(url);if(request.method()!=='GET')uploads.push(request.method());});
  await page.goto('/');await page.locator('#ifc-file').setInputFiles({name:'pool.ifc',mimeType:'text/plain',buffer:Buffer.from(exportIfc(SAMPLE))});await expect(page.locator('#ifc-summary')).toContainText('5 องค์ประกอบ');
  await page.locator('[data-tab="pdf"]').click();await page.locator('#pdf-file').setInputFiles(pdfFixture());await expect(page.locator('#pdf-page-label')).toHaveText('หน้า 1 / 2');expect(external).toEqual([]);expect(uploads).toEqual([]);
});
