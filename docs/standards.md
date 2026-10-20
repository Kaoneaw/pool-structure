# ทะเบียนมาตรฐานและหลักฐานการตรวจ

วันที่ตรวจ: 20 ตุลาคม 2026 (Asia/Bangkok)

**ยังยืนยันฉบับล่าสุดและสถานะการบังคับใช้ในประเทศไทยไม่ได้** ไม่มีการเติมปี ฉบับ เลขข้อ หรือค่าปัจจัยจากความจำ

| หัวข้อ | ชื่อ / ปี / ฉบับที่ยืนยันได้ | แหล่งทางการที่ต้องตรวจ | ผลตรวจจริง |
|---|---|---|---|
| กฎกระทรวงว่าด้วยการรับน้ำหนัก ความต้านทาน และความคงทนของอาคาร | รอยืนยันชื่อเต็ม ปี ประกาศ และวันมีผล | [ราชกิจจานุเบกษา](https://ratchakitcha.soc.go.th/) | HTTPS proxy ตอบ 403 Forbidden |
| คอนกรีตเสริมเหล็กวิธีกำลัง (วสท.) | รอยืนยันรหัส/ชื่อ/ปี/ฉบับ | [วสท.](https://eit.or.th/) | HTTPS proxy ตอบ 403 Forbidden |
| มยผ. เกี่ยวกับคอนกรีตและอาคารเก็บของเหลว | รอยืนยันมาตรฐานที่ใช้ร่วมกัน | [กรมโยธาธิการและผังเมือง](https://www.dpt.go.th/) | HTTPS proxy ตอบ 403 Forbidden |
| มยผ. แรงแผ่นดินไหว | รอยืนยันรหัส/ปี/พื้นที่และเงื่อนไขบังคับใช้ | [กรมโยธาธิการและผังเมือง](https://www.dpt.go.th/) | HTTPS proxy ตอบ 403 Forbidden |
| ACI 318 | รอยืนยันชื่อเต็ม/ปี/ฉบับล่าสุดและ adoption ในไทย | [ACI catalog](https://www.concrete.org/) | คำขอ catalog ถูก HTTPS proxy ปฏิเสธ 403 |
| ACI 350 | รอยืนยันปี/ฉบับล่าสุด รวมเกณฑ์รอยร้าวและ durability | [ACI catalog](https://www.concrete.org/) | คำขอ catalog ถูก HTTPS proxy ปฏิเสธ 403 |
| โครงสร้าง/ความปลอดภัยสระว่ายน้ำในไทย | รอยืนยันว่ามีข้อกำหนดใดและขอบเขตใด | ราชกิจจานุเบกษา / กรมโยธาธิการฯ / วสท. | ยังไม่มีหลักฐานพอสรุปว่า “ไม่มีมาตรฐาน” |
| IFC ทางการ | README ของ buildingSMART ระบุสายพัฒนา **IFC 4.3.2.x** ไม่ได้ใช้เป็นหลักฐานยืนยัน release ล่าสุด | [README ทางการ ณ commit ที่ตรวจ](https://github.com/buildingSMART/IFC4.3.x-development/blob/7256780bd95fcc5b3653e07b3e8ec2f8389c9f3d/README.md) | อ่านผ่าน HTTPS สำเร็จ; เว็บไซต์ specification ถูก 403; ลิงก์ formal releases ที่ README ชี้คืน repository not found จึงยังยืนยัน formal release ล่าสุดไม่ได้ |

## web-ifc ที่ใช้จริง

ติดตั้ง `web-ifc@0.0.78` จาก [npm registry](https://registry.npmjs.org/web-ifc/0.0.78) โดย npm ตรวจ integrity ตาม lockfile ตรวจ `SchemaNames` ใน `node_modules/web-ifc/web-ifc-api.js` ของแพ็กเกจที่ติดตั้งจริง:

- กลุ่ม IFC2X3 (alias IFC2X_FINAL)
- กลุ่ม IFC4
- กลุ่ม IFC4X3 พร้อม aliases IFC4X1, IFC4X2, IFC4X3_RC1/2/3/4, IFC4X3_ADD1/ADD2, IFC4X2SCGL

แอปรับส่วนหัว IFC2X3, IFC4 และ IFC4X3/ADD/RC ที่ส่งต่อให้ web-ifc ได้ รายชื่อ schema ที่ไลบรารีประกาศรองรับ **ไม่ใช่** การรับประกันว่า geometry ทุกชนิดในทุกไฟล์แสดงได้

การส่งออกเลือก **IFC4** เพื่อให้ทำ round-trip กับตัวอ่านที่ติดตั้งได้ ไม่อ้างว่าเป็นรุ่นล่าสุด: ทดสอบเปิดไฟล์ที่ส่งออก อ่าน 4 IfcWall + 1 IfcSlab, geometry, project/site/building/storey, Qto และวัสดุได้จริง การทดสอบนี้ไม่ใช่การรับรอง IFC ทั้ง schema หรือ MVD จาก buildingSMART

## การตั้งค่าในแอป

ไม่มีค่าเริ่มต้น load factors / φ / minimum steel / allowable crack width / durability factor / seismic coefficient เพราะยังไม่มีหลักฐานยืนยัน ข้อมูลดินและวัสดุเริ่มว่าง ความหนาโครงสร้างเป็นตัวอย่างภาพเท่านั้น ค่าเรขาคณิตและปริมาตรไม่ใช่เกณฑ์มาตรฐานโครงสร้าง

## เครือข่ายที่ร้องขอ

บันทึกเพิ่ม custom allowlist ใน draft: `www.concrete.org`, `www.dpt.go.th`, `ratchakitcha.soc.go.th`, `eit.or.th`, `www.eit.or.th`, `technical.buildingsmart.org`, `ifc43-docs.standards.buildingsmart.org` โดยคง preset package managers เดิม การ save ยืนยัน persistence ของ draft เท่านั้น ไม่ได้พิสูจน์ว่า runtime เปิดเว็บเหล่านี้ได้

ตรวจซ้ำหลังผู้ใช้สั่งทำต่อ: ค่าที่อ่านมีโดเมนเหล่านี้ครบแล้วและไม่มี draft ค้าง แต่ runtime ยังได้ CONNECT 403 แม้ทดสอบนอก shell sandbox ดู [network-diagnosis.md](network-diagnosis.md) ไม่ควรขอให้เพิ่มรายการเดิมซ้ำ
