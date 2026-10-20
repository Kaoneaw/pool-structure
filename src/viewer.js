import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { poolParts, FACES } from './ifc-export.js';

export class PoolViewer {
  constructor(container,onSelect,onMeasure) {
    this.container=container;this.onSelect=onSelect;this.onMeasure=onMeasure;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#edf2ef');
    this.camera=new THREE.PerspectiveCamera(42,1,0.01,100000);
    this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.localClippingEnabled=true;
    container.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x7d8c85,2.5));
    const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(7,16,10);this.scene.add(light);
    this.grid=new THREE.GridHelper(50,50,0xbacbc2,0xdce5df);this.grid.position.y=-2.5;this.scene.add(this.grid);
    this.pool=new THREE.Group();this.ifc=new THREE.Group();this.scene.add(this.pool,this.ifc);
    this.markers=new THREE.Group();this.scene.add(this.markers);
    this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.section=new THREE.Plane(new THREE.Vector3(-1,0,0),0);
    this.transparent=false;this.clipping=false;this.colored=false;
    this.active='pool';this.measure=false;this.measurePoints=[];
    this.renderer.domElement.addEventListener('pointerdown',event=>{this.down=[event.clientX,event.clientY];});
    this.renderer.domElement.addEventListener('pointerup',event=>this.pick(event));
    new ResizeObserver(()=>this.resize()).observe(container);
    this.resize();this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);});
  }
  resize() {
    const {width,height}=this.container.getBoundingClientRect();
    if(width<1||height<1)return;
    this.camera.aspect=width/Math.max(height,1);this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);
  }
  clear(group) {
    group.traverse(o=>{o.geometry?.dispose();if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{m.map?.dispose();m.dispose();});});
    group.clear();
  }
  build(project) {
    this.clear(this.pool);
    for(const [index,part] of poolParts(project).entries()) {
      const positions=[];
      for(const face of FACES) for(const i of [face[0],face[1],face[2],face[0],face[2],face[3]]) {
        const [x,y,z]=part.points[i];positions.push(x,z,-y);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
      const material=new THREE.MeshStandardMaterial({color:part.type==='IFCWALL'?0xc9d0c8:0xe2dccc,roughness:0.85,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,material);mesh.userData={id:`pool-${index}`,name:part.name,type:part.type,original:material.color.clone()};this.pool.add(mesh);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x728478,transparent:true,opacity:0.4}));mesh.add(edges);
    }
    const slope=(project.deep-project.shallow)/project.length;
    const wet=slope===0?project.length:Math.min(project.length,project.water/slope);
    if(project.water>0&&wet>0) {
      const geometry=new THREE.PlaneGeometry(wet,project.width);
      geometry.rotateX(-Math.PI/2);geometry.translate(project.length-wet/2,-project.deep+project.water,-project.width/2);
      const water=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x259da8,transparent:true,opacity:0.48,side:THREE.DoubleSide,roughness:0.2}));
      water.userData.water=true;this.pool.add(water);
    }
    this.setMode(this.active);this.applyMaterials();
  }
  setMode(mode) {
    this.active=mode;this.pool.visible=mode==='pool';this.ifc.visible=mode==='ifc';
    this.clearMeasurement();
  }
  fit(view='iso') {
    const group=this.active==='pool'?this.pool:this.ifc;
    const box=new THREE.Box3().setFromObject(group);
    if(box.isEmpty()) return;
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const distance=Math.max(size.length(),1)*1.5/Math.min(1,Math.max(0.2,this.camera.aspect));
    const dirs={iso:[1,0.85,1],top:[0,1,0.001],front:[0,0,1],side:[1,0,0]};
    this.camera.up.set(0,1,0);this.camera.position.copy(center).add(new THREE.Vector3(...dirs[view]).normalize().multiplyScalar(distance));
    this.controls.target.copy(center);this.camera.near=Math.max(distance/10000,0.001);this.camera.far=distance*100;
    this.camera.updateProjectionMatrix();this.controls.update();
    this.grid.position.y=box.min.y-0.05;
    this.section.constant=center.x;
  }
  addIfc(batch) {
    for(const item of batch) {
      const geometry=new THREE.BufferGeometry();
      const vertices=new Float32Array(item.vertices.length/2),normals=new Float32Array(item.vertices.length/2);
      for(let i=0,j=0;i<item.vertices.length;i+=6,j+=3){vertices.set(item.vertices.subarray(i,i+3),j);normals.set(item.vertices.subarray(i+3,i+6),j);}
      geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setIndex(new THREE.BufferAttribute(item.indices,1));
      const color=new THREE.Color().setRGB(...item.color.slice(0,3));
      const material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:0.75});
      const mesh=new THREE.Mesh(geometry,material);mesh.applyMatrix4(new THREE.Matrix4().fromArray(item.matrix));
      mesh.userData={id:item.id,name:item.name,type:item.type,original:color.clone(),baseOpacity:item.color[3]};this.ifc.add(mesh);
    }
    this.applyMaterials();
  }
  applyMaterials() {
    for(const group of [this.pool,this.ifc]) group.traverse(mesh=>{
      if(!mesh.isMesh || mesh.userData.water) return;
      const m=mesh.material;
      if(this.colored) {
        let hash=0;for(const c of mesh.userData.type) hash=(hash*31+c.charCodeAt(0))|0;
        m.color.setHSL((Math.abs(hash)%360)/360,0.35,0.62);
      } else m.color.copy(mesh.userData.original);
      m.opacity=this.transparent?0.28:mesh.userData.baseOpacity??1;m.transparent=m.opacity<1;
      m.clippingPlanes=this.clipping?[this.section]:[];m.needsUpdate=true;
      for(const child of mesh.children) if(child.material)child.material.clippingPlanes=m.clippingPlanes;
      m.emissive.set(mesh.userData.id===this.selected?0x176d56:0x000000);
    });
  }
  sectionAt(fraction) {
    const box=new THREE.Box3().setFromObject(this.active==='pool'?this.pool:this.ifc);
    this.section.constant=box.min.x+(box.max.x-box.min.x)*fraction;this.applyMaterials();
  }
  toggleType(type,visible) { for(const mesh of this.ifc.children) if(mesh.userData.type===type) mesh.visible=visible; }
  select(id) {this.selected=id;this.applyMaterials();}
  pick(event) {
    if(!this.down||Math.hypot(event.clientX-this.down[0],event.clientY-this.down[1])>5)return;
    const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    this.ray.setFromCamera(this.pointer,this.camera);
    const hit=this.ray.intersectObjects((this.active==='pool'?this.pool:this.ifc).children,false).find(h=>h.object.visible&&(!this.clipping||this.section.distanceToPoint(h.point)>=0));
    if(!hit)return;
    if(this.measure) {
      if(this.measurePoints.length===2)this.clearMeasurement();
      this.measurePoints.push(hit.point.clone());
      const marker=new THREE.Mesh(new THREE.SphereGeometry(0.04),new THREE.MeshBasicMaterial({color:0xe77d32}));marker.position.copy(hit.point);this.markers.add(marker);
      if(this.measurePoints.length===2){
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.measurePoints),new THREE.LineBasicMaterial({color:0xe77d32,depthTest:false}));this.markers.add(line);
        this.onMeasure(this.measurePoints[0].distanceTo(this.measurePoints[1]));
      }
    } else {this.select(hit.object.userData.id);this.onSelect(hit.object.userData);}
  }
  clearMeasurement(){this.measurePoints=[];this.clear(this.markers);}
  setReference(canvas,scale,options) {
    if(this.reference){this.scene.remove(this.reference);this.reference.geometry.dispose();this.reference.material.map.dispose();this.reference.material.dispose();}
    const texture=new THREE.CanvasTexture(canvas);
    const geometry=new THREE.PlaneGeometry(canvas.width*scale,canvas.height*scale);geometry.rotateX(-Math.PI/2);
    this.reference=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:options.opacity,side:THREE.DoubleSide,depthWrite:false}));
    this.reference.position.set(options.x,options.y,options.z);this.reference.rotation.y=options.rotation*Math.PI/180;
    this.scene.add(this.reference);
  }
  hideReference(){if(this.reference)this.reference.visible=false;}
}
