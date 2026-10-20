import { IfcAPI } from 'web-ifc';
let api, model;
let queue = Promise.resolve();
const value = x => x?.value ?? x ?? '';
self.onmessage = event => {
  queue = queue.then(() => handle(event.data)).catch(error => self.postMessage({ kind:'error', request:event.data.request, message:error.message }));
};
async function handle(data) {
  if(data.kind==='load') {
    api = new IfcAPI();
    api.SetWasmPath(data.wasm, true);
    await api.Init();
    model=api.OpenModel(new Uint8Array(data.buffer), { COORDINATE_TO_ORIGIN:true });
    if(model < 0) throw new Error('อ่าน IFC ไม่สำเร็จ กรุณาตรวจรูปแบบไฟล์และสคีมา');
    const schema=api.GetModelSchema(model);
    if(!schema) throw new Error('ไม่พบสคีมา IFC ที่รองรับ');
    let batch=[],transfer=[],count=0;
    const elements=[];
    api.StreamAllMeshes(model,(mesh,index,total) => {
      const line=api.GetLine(model,mesh.expressID);
      const meta={ id:mesh.expressID,name:String(value(line.Name)||`#${mesh.expressID}`),type:api.GetNameFromTypeCode(line.type) };
      elements.push(meta);
      for(let i=0;i<mesh.geometries.size();i++) {
        const placed=mesh.geometries.get(i), geometry=api.GetGeometry(model,placed.geometryExpressID);
        const vertices=api.GetVertexArray(geometry.GetVertexData(),geometry.GetVertexDataSize()).slice();
        const indices=api.GetIndexArray(geometry.GetIndexData(),geometry.GetIndexDataSize()).slice();
        batch.push({...meta,vertices,indices,matrix:placed.flatTransformation,color:[placed.color.x,placed.color.y,placed.color.z,placed.color.w]});
        transfer.push(vertices.buffer,indices.buffer);
        geometry.delete();
      }
      count++;
      if(batch.length>=24) { self.postMessage({kind:'meshes',batch,progress:Math.round((index+1)/Math.max(1,total)*90)},transfer); batch=[];transfer=[]; }
    });
    if(batch.length) self.postMessage({kind:'meshes',batch,progress:92},transfer);
    let tree=null;
    try {tree=await api.properties.getSpatialStructure(model,true);} catch { /* Type grouping remains available. */ }
    self.postMessage({kind:'loaded',schema,count,elements,tree});
  }
  if(data.kind==='properties') {
    if(model===undefined) throw new Error('ยังไม่ได้เปิดโมเดล');
    const [item,sets,materials]=await Promise.all([
      api.properties.getItemProperties(model,data.id,false),
      api.properties.getPropertySets(model,data.id,true),
      api.properties.getMaterialsProperties(model,data.id,true),
    ]);
    self.postMessage({kind:'properties',id:data.id,item,sets,materials});
  }
}
