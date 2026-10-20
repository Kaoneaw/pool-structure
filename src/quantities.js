export const WARNING = 'ผลลัพธ์เป็นการประเมินเบื้องต้นเพื่อช่วยออกแบบ ไม่ใช่การคำนวณออกแบบสำหรับยื่นขออนุญาต ต้องให้วิศวกรโยธาที่มีใบอนุญาตตรวจสอบและรับรองก่อนใช้งานจริง';
export const SAMPLE = Object.freeze({
  name: 'สระว่ายน้ำ · บ้านริมสวน', length: 10, width: 5, shallow: 1.2, deep: 1.8,
  wall: 200, slab: 250, rimWidth: 0, rimDepth: 0, water: 1.2,
  groundwater: null, soilWeight: null, soilK: null, soilBearing: null,
  liveLoad: null, seismic: '', concrete: null, steel: null, cover: null,
  wallBar: null, wallSpacing: null, slabBar: null, slabSpacing: null, ifcStorey: '', ifcMaterial: '',
});
const geometryKeys = ['length', 'width', 'shallow', 'deep', 'wall', 'slab', 'rimWidth', 'rimDepth', 'water'];
const positive = new Set(['length', 'width', 'shallow', 'deep', 'wall', 'slab']);
const optionalNumeric = ['groundwater','soilWeight','soilK','soilBearing','liveLoad','concrete','steel','cover','wallBar','wallSpacing','slabBar','slabSpacing'];
export function validateProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('รูปแบบข้อมูลโครงการไม่ถูกต้อง');
  const p = { ...SAMPLE };
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new Error('กรอกชื่อโครงการไม่เกิน 120 ตัวอักษร');
  p.name = input.name.trim();
  for (const key of geometryKeys) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive.has(key) && value === 0)) throw new Error(`ค่ารูปทรงไม่ถูกต้อง: ${key}`);
    if (value > 10000) throw new Error('ขนาดเกินขอบเขตเครื่องมือ (10,000 ต่อหน่วยที่แสดง)');
    p[key] = value;
  }
  if (p.deep < p.shallow) throw new Error('ความลึกด้านลึกต้องไม่น้อยกว่าด้านตื้น');
  if (p.shallow - (p.deep-p.shallow)*(p.wall/1000)/p.length <= 0) throw new Error('แนวลาดส่วนที่ต่อถึงผิวนอกตัดขอบบน: ตรวจความลึก ความยาว และความหนาผนัง');
  if (p.water > p.deep) throw new Error('ระดับน้ำต้องไม่สูงเกินความลึกด้านลึก');
  if ((p.rimWidth === 0) !== (p.rimDepth === 0)) throw new Error('ขอบสระต้องกำหนดทั้งความกว้างและความหนา หรือเป็นศูนย์ทั้งคู่');
  for (const key of optionalNumeric) {
    const value = input[key];
    if (value == null || value === '') p[key] = null;
    else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw new Error(`ค่าข้อมูลวิศวกรรมไม่ถูกต้อง: ${key}`);
    else p[key] = value;
  }
  p.seismic = typeof input.seismic === 'string' ? input.seismic.slice(0, 160) : '';
  for(const key of ['ifcStorey','ifcMaterial']) p[key] = typeof input[key] === 'string' ? input[key].slice(0,160) : '';
  return p;
}
// Rectangular interior, linear longitudinal slope; vertical walls.
// Slab thickness is VERTICAL, wall/slab interface is excluded from wall quantity.
export function quantities(input) {
  const p = validateProject(input), L = p.length, W = p.width, t = p.wall / 1000, s = p.slab / 1000;
  const averageDepth = (p.shallow + p.deep) / 2;
  const outerArea = (L + 2*t) * (W + 2*t);
  const wallArea = 2 * L * averageDepth + W * (p.shallow + p.deep);
  const slopedFloor = W * Math.hypot(L, p.deep - p.shallow);
  const wallConcrete = (outerArea - L * W) * averageDepth;
  const slabConcrete = outerArea * s;
  const rimConcrete = ((L+2*t+2*p.rimWidth)*(W+2*t+2*p.rimWidth)-outerArea)*p.rimDepth;
  // Level measured upwards from the deep-end floor. Integrate max(0, H - slope*x).
  const slope = (p.deep - p.shallow)/L;
  const wetLength = slope === 0 ? L : Math.min(L, p.water/slope);
  const waterVolume = W * (p.water*wetLength - slope*wetLength*wetLength/2);
  const externalWallArea = 2 * (L + 2*t) * averageDepth + (W+2*t)*(p.shallow+p.deep);
  return { averageDepth, outerArea, wallConcrete, slabConcrete, rimConcrete,
    concrete: wallConcrete+slabConcrete+rimConcrete, waterVolume,
    waterproofArea: wallArea + slopedFloor,
    wallFormwork: wallArea + externalWallArea,
    slopedFloor, wetLength,
  };
}
export function compareResults(actual, expected) {
  if (![actual,expected].every(Number.isFinite)) throw new Error('ผลเปรียบเทียบต้องเป็นตัวเลข');
  return expected === 0 ? null : 100 * (actual - expected) / Math.abs(expected);
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
export function csv(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
export function backup(project) { return { app: 'pool-structure', version: 1, project: validateProject(project) }; }
export function restore(data) {
  if (data?.app !== 'pool-structure' || data.version !== 1) throw new Error('ไฟล์สำรองหรือเวอร์ชันไม่รองรับ');
  return validateProject(data.project);
}
