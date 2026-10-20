import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE, validateProject, quantities, compareResults, csvCell, csv, backup, restore } from '../src/quantities.js';
import { exportIfc, poolParts } from '../src/ifc-export.js';
import example from '../reference/geometry-example.json' with { type: 'json' };
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('ตัวอย่าง 5 × 10 ม. ลึก 1.2–1.8 ม.: ค่าคำนวณมือจากเรขาคณิต',()=>{
  const q=quantities(SAMPLE);near(q.averageDepth,1.5);near(q.outerArea,56.16);
  near(q.wallConcrete,9.24);near(q.slabConcrete,14.04);near(q.concrete,23.28);
  near(q.waterVolume,45);near(q.wallFormwork,92.4);near(q.waterproofArea,45+5*Math.sqrt(100.36));
  for(const [actual,key]of [[q.wallConcrete,'wall_concrete_m3'],[q.slabConcrete,'slab_concrete_m3'],[q.concrete,'total_concrete_m3'],[q.waterVolume,'water_m3'],[q.wallFormwork,'wall_formwork_m2']])near(actual,example.expected[key]);
});
test('สระพื้นราบ / น้ำเต็ม / น้ำหมด',()=>{
  near(quantities({...SAMPLE,deep:1.2}).waterVolume,60);
  near(quantities({...SAMPLE,water:1.8}).waterVolume,75);
  near(quantities({...SAMPLE,water:0}).waterVolume,0);
});
test('น้ำต่ำกว่าพื้นด้านตื้น ต้องรวมเฉพาะส่วนเปียก',()=>{
  const q=quantities({...SAMPLE,water:0.3});near(q.wetLength,5);near(q.waterVolume,3.75);
});
test('ปริมาตรน้ำต่อเนื่องตรงจุดเปลี่ยนความยาวเปียก',()=>{
  near(quantities({...SAMPLE,water:0.6}).waterVolume,15);
  const lo=quantities({...SAMPLE,water:0.6-1e-8}).waterVolume;
  const hi=quantities({...SAMPLE,water:0.6+1e-8}).waterVolume;
  assert.ok(hi>lo&&hi-lo<0.00001);
});
test('ขอบสระไม่ซ้ำกับผนัง',()=>{
  const q=quantities({...SAMPLE,rimWidth:0.3,rimDepth:0.2});
  near(q.rimConcrete,(11*6-10.4*5.4)*0.2);near(q.concrete,23.28+1.968);
});
test('กรณีขอบเขต: ลึกมาก / น้ำใต้ดินสูง / สระว่าง / ผนังบาง ไม่แสดงผลออกแบบปลอม',()=>{
  for(const p of [{...SAMPLE,shallow:15,deep:20,water:20},{...SAMPLE,groundwater:50},{...SAMPLE,water:0},{...SAMPLE,wall:20}]){
    const q=quantities(p);assert.ok(Number.isFinite(q.concrete));assert.ok(q.waterVolume>=0);assert.equal(q.strengthPass,undefined);assert.equal(q.flotationSafetyFactor,undefined);
  }
});
test('ปฏิเสธข้อมูลผิดรูปแบบและค่าที่เป็นอันตรายต่อคำนวณ',()=>{
  for(const change of [{length:0},{width:-1},{wall:NaN},{deep:1},{water:2},{slab:Infinity},{shallow:null},{rimWidth:0.2},{length:'10'},{name:''},{length:0.01,deep:100}])assert.throws(()=>validateProject({...SAMPLE,...change}));
  for(const invalid of [null,[],5])assert.throws(()=>validateProject(invalid));
  assert.throws(()=>quantities({...SAMPLE,soilWeight:-1}));
});
test('backup/restore ตรวจเวอร์ชัน เก็บค่าที่ว่าง และไม่รับคีย์แปลกปลอม',()=>{
  assert.deepEqual(restore(JSON.parse(JSON.stringify(backup(SAMPLE)))),SAMPLE);
  assert.throws(()=>restore({app:'pool-structure',version:2,project:SAMPLE}));
  assert.throws(()=>restore({project:SAMPLE}));
  assert.equal(validateProject({...SAMPLE,extra:'test'}).extra,undefined);
  assert.equal(validateProject({...SAMPLE,soilWeight:''}).soilWeight,null);
});
test('CSV รองรับ comma, quote, newline, ภาษาไทย และป้องกันสูตร spreadsheet',()=>{
  assert.equal(csvCell('a,"b"'),'"a,""b"""');assert.equal(csvCell('=1+1'),'"\'=1+1"');
  assert.equal(csvCell('@SUM(A1)'),'"\'@SUM(A1)"');
  assert.equal(csv([['ไทย','a\nb']]),'\uFEFF"ไทย","a\nb"');
});
test('เปอร์เซ็นต์ความต่าง ไม่หารด้วยศูนย์',()=>{
  near(compareResults(110,100),10);near(compareResults(-90,-100),10);assert.equal(compareResults(1,0),null);assert.throws(()=>compareResults(NaN,10));
});
test('ปริมาตรองค์ประกอบส่งออกเท่ากับปริมาณรวม และจุดทุกจุดเป็นตัวเลข',()=>{
  for(const p of [SAMPLE,{...SAMPLE,rimWidth:0.3,rimDepth:0.2}]){
    near(poolParts(p).reduce((sum,x)=>sum+x.volume,0),quantities(p).concrete);
    for(const part of poolParts(p)){assert.ok(part.volume>0);assert.equal(part.points.length,8);assert.ok(part.points.flat().every(Number.isFinite));}
  }
});
test('IFC4 เก็บชื่อไทยอย่างถูกต้อง มี hierarchy, Pset, Qto, วัสดุ และชนิดองค์ประกอบ',()=>{
  const file=exportIfc({...SAMPLE,name:"สระ 'ตัวอย่าง'"},new Date('2026-01-01T00:00:00Z'));
  assert.match(file,/FILE_SCHEMA\(\('IFC4'\)\)/);assert.match(file,/IFCWALL/);assert.match(file,/IFCSLAB/);assert.match(file,/IFCBUILDINGSTOREY/);assert.match(file,/IFCPROPERTYSET/);assert.match(file,/IFCELEMENTQUANTITY/);assert.match(file,/IFCMATERIAL/);
  assert.match(file,/NOT_VERIFIED/);assert.match(file,/\\X2\\0E2A\\X0\\/);assert.match(file,/''/);assert.match(file,/2026-01-01T00:00:00.000Z/);
});
