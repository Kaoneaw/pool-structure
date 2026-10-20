import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IfcAPI, IFCWALL, IFCSLAB, IFCBUILDINGSTOREY } from 'web-ifc';
import { SAMPLE } from '../src/quantities.js';
import { exportIfc } from '../src/ifc-export.js';
test('web-ifc 0.0.78 เปิดไฟล์ IFC4 ที่ส่งออก อ่าน mesh, Pset/Qto และวัสดุได้จริง',async()=>{
  const api=new IfcAPI();await api.Init();
  const model=api.OpenModel(new TextEncoder().encode(exportIfc(SAMPLE)));
  assert.ok(model>=0);assert.equal(api.GetModelSchema(model),'IFC4');
  assert.equal(api.GetLineIDsWithType(model,IFCWALL).size(),4);assert.equal(api.GetLineIDsWithType(model,IFCSLAB).size(),1);assert.equal(api.GetLineIDsWithType(model,IFCBUILDINGSTOREY).size(),1);
  let meshCount=0,vertexCount=0;
  api.StreamAllMeshes(model,mesh=>{meshCount++;for(let i=0;i<mesh.geometries.size();i++){const g=api.GetGeometry(model,mesh.geometries.get(i).geometryExpressID);vertexCount+=g.GetVertexDataSize();g.delete();}});
  assert.equal(meshCount,5);assert.ok(vertexCount>0);
  const wall=api.GetLineIDsWithType(model,IFCWALL).get(0), props=await api.properties.getPropertySets(model,wall,true), mats=await api.properties.getMaterialsProperties(model,wall,true);
  assert.equal(props[0].Name.value,'Qto_WallBaseQuantities');assert.ok(props[0].Quantities[0].VolumeValue.value>0);assert.equal(mats[0].Name.value,'Concrete');
  const tree=await api.properties.getSpatialStructure(model,true);assert.equal(tree.type,'IFCPROJECT');
  assert.equal(tree.children[0].children[0].children[0].children.length,5);
  api.CloseModel(model);
});
