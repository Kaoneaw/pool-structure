import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('public/wasm', { recursive: true });
await copyFile('node_modules/web-ifc/web-ifc.wasm', 'public/wasm/web-ifc.wasm');
for(const folder of ['cmaps','standard_fonts','wasm','iccs']) {
  await cp(`node_modules/pdfjs-dist/${folder}`,`public/pdfjs/${folder}`,{recursive:true});
}
await cp('node_modules/web-ifc/LICENSE.md','public/wasm/LICENSE-web-ifc.md');
await mkdir('public/licenses',{recursive:true});
for(const [file,target]of [['three/LICENSE','three.txt'],['pdfjs-dist/LICENSE','pdfjs.txt'],['@fontsource/noto-sans-thai/LICENSE','noto-sans-thai.txt']]) {
  await copyFile(`node_modules/${file}`,`public/licenses/${target}`);
}
