import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;
const $=id=>document.getElementById(id);
export class PdfViewer {
  constructor(notify,invalidate) {
    this.notify=notify;this.invalidate=invalidate;this.canvas=$('pdf-canvas');this.overlay=$('pdf-overlay');this.pageNumber=1;this.zoom=1;this.points=[];this.pageScale=new Map();this.renderVersion=0;this.loadVersion=0;
    $('pdf-prev').onclick=()=>this.go(-1);$('pdf-next').onclick=()=>this.go(1);
    $('pdf-in').onclick=()=>this.setZoom(1.25);$('pdf-out').onclick=()=>this.setZoom(0.8);
    $('pdf-calibrate').onclick=()=>this.start('calibrate');$('pdf-measure').onclick=()=>this.start('measure');
    this.canvas.onclick=event=>this.click(event);
    $('apply-scale').onclick=()=>this.calibrate();
  }
  async load(file) {
    if(!file)return;
    if(!file.name.toLowerCase().endsWith('.pdf'))throw new Error('กรุณาเลือกไฟล์ .pdf');
    const version=++this.loadVersion;
    $('pdf-status').textContent='กำลังเปิดแบบ…';
    const buffer=new Uint8Array(await file.arrayBuffer());
    if(!new TextDecoder().decode(buffer.subarray(0,1024)).includes('%PDF-'))throw new Error('ไฟล์นี้ไม่มีส่วนหัว PDF ที่ถูกต้อง');
    const assets=new URL('pdfjs/',new URL(import.meta.env.BASE_URL,location.href)).href;
    const task=getDocument({data:buffer,isEvalSupported:false,useSystemFonts:true,cMapUrl:assets+'cmaps/',cMapPacked:true,standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/',iccUrl:assets+'iccs/'});
    task.onPassword=()=>{task.destroy();this.notify('ไฟล์ PDF มีรหัสผ่าน กรุณาใช้ไฟล์ที่ปลดล็อกแล้ว');};
    let doc;
    try {doc=await task.promise;} catch(error) {
      await task.destroy();
      if(version!==this.loadVersion)return;
      throw error;
    }
    if(version!==this.loadVersion){await task.destroy();return;}
    const previous=this.doc, previousRender=this.renderTask;
    this.doc=null;this.renderVersion++;this.rendering=true;
    if(previousRender){previousRender.cancel();try{await previousRender.promise;}catch{}}
    // pdf.js 6 disposes documents through PDFDocumentLoadingTask, not PDFDocumentProxy.
    if(previous)await previous.loadingTask.destroy();
    if(version!==this.loadVersion){await task.destroy();return;}
    this.doc=doc;this.pageScale.clear();this.pageNumber=1;this.zoom=1;this.reset();this.invalidate();
    $('pdf-tools').hidden=false;
    $('pdf-drop').querySelector('strong').textContent=file.name;
    await this.render();
  }
  async render() {
    const version=++this.renderVersion;
    if(this.renderTask){this.renderTask.cancel();try{await this.renderTask.promise;}catch{}}
    this.rendering=true;
    try {
      const page=await this.doc.getPage(this.pageNumber);if(version!==this.renderVersion)return;
      const viewport=page.getViewport({scale:this.zoom});
      this.canvas.width=Math.ceil(viewport.width);this.canvas.height=Math.ceil(viewport.height);
      this.overlay.setAttribute('width',this.canvas.width);this.overlay.setAttribute('height',this.canvas.height);this.overlay.setAttribute('viewBox',`0 0 ${this.canvas.width} ${this.canvas.height}`);
      this.renderTask=page.render({canvasContext:this.canvas.getContext('2d'),viewport});await this.renderTask.promise;
      $('pdf-page-label').textContent=`หน้า ${this.pageNumber} / ${this.doc.numPages}`;$('pdf-zoom').textContent=`${Math.round(this.zoom*100)}%`;
      $('pdf-prev').disabled=this.pageNumber===1;$('pdf-next').disabled=this.pageNumber===this.doc.numPages;
      const ratio=this.pageScale.get(this.pageNumber);
      $('pdf-status').textContent=ratio?`ตั้งสเกลหน้านี้แล้ว · ${ratio.toFixed(5)} เมตรต่อหน่วยแบบ`:'ยังไม่ได้ตั้งสเกลหน้านี้ · คลิกตั้งสเกลแล้วเลือก 2 จุด';
      this.draw();
    } catch(error){if(error.name!=='RenderingCancelledException')this.notify('แสดง PDF ไม่สำเร็จ: '+error.message);}
    finally{if(version===this.renderVersion)this.rendering=false;}
  }
  async go(delta){if(!this.doc||this.rendering)return;this.pageNumber=Math.max(1,Math.min(this.doc.numPages,this.pageNumber+delta));this.reset();this.invalidate();await this.render();}
  async setZoom(factor){if(!this.doc||this.rendering)return;this.zoom=Math.max(0.25,Math.min(4,this.zoom*factor));await this.render();}
  reset(){this.points=[];this.mode=null;this.canvas.classList.remove('measuring');$('calibration').hidden=true;$('pdf-measurement').textContent='';}
  start(mode){if(!this.doc||this.rendering)return;if(mode==='measure'&&!this.pageScale.has(this.pageNumber)){this.notify('ตั้งสเกลของหน้านี้ก่อนวัดระยะ');return;}this.reset();this.mode=mode;this.canvas.classList.add('measuring');$('pdf-status').textContent='คลิก 2 จุดบนแบบ';this.draw();}
  click(event){
    if(!this.mode||this.rendering)return;if(this.points.length===2)this.points=[];
    const rect=this.canvas.getBoundingClientRect();this.points.push([(event.clientX-rect.left)*this.canvas.width/rect.width/this.zoom,(event.clientY-rect.top)*this.canvas.height/rect.height/this.zoom]);this.draw();
    if(this.points.length===2){
      if(this.mode==='calibrate'){$('calibration').hidden=false;$('real-distance').value='';$('real-distance').focus();}
      else $('pdf-measurement').textContent=`ระยะ ${this.distance()*this.pageScale.get(this.pageNumber)>0?(this.distance()*this.pageScale.get(this.pageNumber)).toFixed(3):'0.000'} ม.`;
    }
  }
  distance(){return Math.hypot(this.points[1][0]-this.points[0][0],this.points[1][1]-this.points[0][1]);}
  calibrate(){const real=Number($('real-distance').value);if(this.points.length!==2||this.distance()<0.01||!Number.isFinite(real)||real<=0){this.notify('กรอกระยะจริงมากกว่าศูนย์และเลือก 2 จุดที่ต่างกัน');return;}this.pageScale.set(this.pageNumber,real/this.distance());$('calibration').hidden=true;this.mode=null;this.canvas.classList.remove('measuring');this.invalidate();$('pdf-status').textContent=`ตั้งสเกลแล้ว: ระยะจริง ${real} เมตร`;this.notify('บันทึกสเกลสำหรับหน้านี้แล้ว');}
  draw(){
    this.overlay.replaceChildren();
    const element=(tag,attrs)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);this.overlay.append(node);};
    for(const [x,y]of this.points)element('circle',{cx:x*this.zoom,cy:y*this.zoom,r:5,fill:'#e8893a',stroke:'#fff','stroke-width':2});
    if(this.points.length===2)element('line',{x1:this.points[0][0]*this.zoom,y1:this.points[0][1]*this.zoom,x2:this.points[1][0]*this.zoom,y2:this.points[1][1]*this.zoom,stroke:'#e8893a','stroke-width':2});
  }
  reference(){const ratio=this.pageScale.get(this.pageNumber);if(!ratio)throw new Error('ตั้งสเกลแบบ PDF ก่อนวางใน 3D');if(this.rendering)throw new Error('รอแสดงหน้า PDF ให้เสร็จก่อน');const canvas=document.createElement('canvas');canvas.width=this.canvas.width;canvas.height=this.canvas.height;canvas.getContext('2d').drawImage(this.canvas,0,0);return{canvas,scale:ratio/this.zoom};}
}
