import { validateProject, quantities } from './quantities.js';

export function poolParts(input) {
  const p = validateProject(input), t = p.wall/1000, s = p.slab/1000;
  const depth = x => p.shallow + (p.deep-p.shallow)*x/p.length;
  const part = (name, type, x0,x1,y0,y1, top, bottom) => ({ name, type,
    points: [[x0,y0,bottom(x0)],[x1,y0,bottom(x1)],[x1,y1,bottom(x1)],[x0,y1,bottom(x0)],
      [x0,y0,top(x0)],[x1,y0,top(x1)],[x1,y1,top(x1)],[x0,y1,top(x0)]],
    volume: (x1-x0)*(y1-y0)*((top(x0)-bottom(x0))+(top(x1)-bottom(x1)))/2,
  });
  const parts = [
    part('พื้นสระ','IFCSLAB',-t,p.length+t,-t,p.width+t,x=>-depth(x),x=>-depth(x)-s),
    part('ผนังด้านยาว 1','IFCWALL',-t,p.length+t,-t,0,()=>0,x=>-depth(x)),
    part('ผนังด้านยาว 2','IFCWALL',-t,p.length+t,p.width,p.width+t,()=>0,x=>-depth(x)),
    part('ผนังด้านตื้น','IFCWALL',-t,0,0,p.width,()=>0,x=>-depth(x)),
    part('ผนังด้านลึก','IFCWALL',p.length,p.length+t,0,p.width,()=>0,x=>-depth(x)),
  ];
  if(p.rimWidth > 0) {
    const r=p.rimWidth,d=p.rimDepth;
    parts.push(part('ขอบสระ 1','IFCSLAB',-t-r,p.length+t+r,-t-r,-t,()=>0,()=>-d),
      part('ขอบสระ 2','IFCSLAB',-t-r,p.length+t+r,p.width+t,p.width+t+r,()=>0,()=>-d),
      part('ขอบสระ 3','IFCSLAB',-t-r,-t,-t,p.width+t,()=>0,()=>-d),
      part('ขอบสระ 4','IFCSLAB',p.length+t,p.length+t+r,-t,p.width+t,()=>0,()=>-d));
  }
  return parts;
}
export const FACES = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
function ifcString(text) {
  const escaped = Array.from(String(text)).map(char => {
    if(char.charCodeAt(0)>126 || char.charCodeAt(0)<32) {
      return '\\X2\\'+Array.from({length:char.length},(_,i)=>char.charCodeAt(i).toString(16).toUpperCase().padStart(4,'0')).join('')+'\\X0\\';
    }
    return char === "'" ? "''" : char === '\\' ? '\\\\' : char;
  }).join('');
  return "'" + escaped + "'";
}
function guid() {
  const chars='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  const bytes = crypto.getRandomValues(new Uint8Array(22));
  return Array.from(bytes,(n,i)=>chars[n%(i===0?4:64)]).join('');
}
export function exportIfc(input, date = new Date()) {
  const p=validateProject(input), q=quantities(p), lines=[];
  const add = value => { lines.push(`#${lines.length+1}=${value};`); return `#${lines.length}`; };
  const refs = ids => `(${ids.join(',')})`;
  const root = name => `${ifcString(guid())},$,${ifcString(name)},$`;
  const point=values=>add(`IFCCARTESIANPOINT((${values.map(v=>Number(v).toFixed(9)).join(',')}))`);
  const origin=point([0,0,0]);
  const axis=add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
  const placement=add(`IFCLOCALPLACEMENT($,${axis})`);
  const context=add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-6,${axis},$)`);
  const metre=add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const sqm=add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const m3=add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const units=add(`IFCUNITASSIGNMENT((${metre},${sqm},${m3}))`);
  const project=add(`IFCPROJECT(${root(p.name)},$,$,$,(${context}),${units})`);
  const site=add(`IFCSITE(${root('พื้นที่โครงการ')},$,${placement},$,$,.ELEMENT.,$,$,$,$,$)`);
  const building=add(`IFCBUILDING(${root('สระว่ายน้ำ')},$,${placement},$,$,.ELEMENT.,$,$,$)`);
  const storey=add(`IFCBUILDINGSTOREY(${root('ระดับขอบสระ')},$,${placement},$,$,.ELEMENT.,0.)`);
  for(const [parent,child] of [[project,site],[site,building],[building,storey]]) add(`IFCRELAGGREGATES(${root('โครงสร้างโครงการ')},${parent},(${child}))`);
  const material=add("IFCMATERIAL('Concrete',$,'Concrete')"), elements=[];
  for(const part of poolParts(p)) {
    const pts=part.points.map(point);
    const faces=FACES.map(indices=> {
      const loop=add(`IFCPOLYLOOP(${refs(indices.map(i=>pts[i]))})`);
      const bound=add(`IFCFACEOUTERBOUND(${loop},.T.)`);
      return add(`IFCFACE((${bound}))`);
    });
    const shell=add(`IFCCLOSEDSHELL(${refs(faces)})`);
    const brep=add(`IFCFACETEDBREP(${shell})`);
    const shape=add(`IFCSHAPEREPRESENTATION(${context},'Body','Brep',(${brep}))`);
    const product=add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shape}))`);
    const element=add(`${part.type}(${root(part.name)},$,${placement},${product},$,${part.type==='IFCSLAB'?'.BASESLAB.':'.SOLIDWALL.'})`);
    elements.push(element);
    const volume=add(`IFCQUANTITYVOLUME('NetVolume',$,$,${part.volume.toFixed(9)},$)`);
    const qto=add(`IFCELEMENTQUANTITY(${root(part.type==='IFCSLAB'?'Qto_SlabBaseQuantities':'Qto_WallBaseQuantities')},$ ,(${volume}))`);
    add(`IFCRELDEFINESBYPROPERTIES(${root('ปริมาณรูปทรง')},(${element}),${qto})`);
  }
  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${root('องค์ประกอบสระ')},${refs(elements)},${storey})`);
  add(`IFCRELASSOCIATESMATERIAL(${root('วัสดุ')},${refs(elements)},${material})`);
  const values=[['EngineeringStatus','IFCLABEL',ifcString('NOT_VERIFIED')],['InteriorLength','IFCLENGTHMEASURE',p.length],['InteriorWidth','IFCLENGTHMEASURE',p.width],['ConcreteVolume','IFCVOLUMEMEASURE',q.concrete]];
  const props=values.map(([name,type,value])=>add(`IFCPROPERTYSINGLEVALUE(${ifcString(name)},$,${type}(${value}),$)`));
  const pset=add(`IFCPROPERTYSET(${root('Pool_Preliminary')},${refs(props)})`);
  add(`IFCRELDEFINESBYPROPERTIES(${root('ข้อมูลเบื้องต้น')},(${building}),${pset})`);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Preliminary pool geometry; engineering not verified'),'2;1');\nFILE_NAME(${ifcString(p.name+'.ifc')},'${date.toISOString()}',('Pool Structure'),(''),'Pool Structure','Pool Structure','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
