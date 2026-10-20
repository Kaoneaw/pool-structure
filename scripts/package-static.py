"""Bundle the built static site; verify every archived file before returning."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "artifacts" / "pool-studio-static.zip"
REQUIRED = {"index.html", "wasm/web-ifc.wasm", "third-party-notices.txt", ".nojekyll"}


def verify(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or not REQUIRED.issubset(names):
            raise ValueError("แพ็กมีชื่อไฟล์ซ้ำหรือขาดไฟล์ที่จำเป็น")
        for name in names:
            p = PurePosixPath(name)
            if p.is_absolute() or ".." in p.parts or "\\" in name:
                raise ValueError("แพ็กมีเส้นทางไฟล์ไม่ถูกต้อง")
            if p.suffix.lower() == ".exe":
                raise ValueError("ไม่รวมไฟล์โปรแกรมต้นแบบในแพ็กเว็บไซต์")
        if archive.testzip() is not None:
            raise ValueError("CRC ของไฟล์ในแพ็กไม่ถูกต้อง")
        manifest = json.loads(archive.read("manifest.json"))
        if set(names) != set(manifest["files"]) | {"manifest.json"}:
            raise ValueError("รายการไฟล์ใน manifest ไม่ตรงกับแพ็ก")
        for name, expected in manifest["files"].items():
            if hashlib.sha256(archive.read(name)).hexdigest() != expected:
                raise ValueError(f"SHA-256 ไม่ตรง: {name}")
        if not archive.read("wasm/web-ifc.wasm").startswith(b"\x00asm"):
            raise ValueError("ไฟล์ตัวอ่าน IFC ไม่ใช่ WebAssembly")
        for required_type in ("pdf.worker", "ifc-worker", ".woff2"):
            if not any(required_type in name for name in names):
                raise ValueError(f"แพ็กขาดไฟล์: {required_type}")
        print(f"ตรวจแพ็กผ่าน: {len(names)} ไฟล์ พร้อม CRC และ SHA-256 ครบทุกรายการ")


def package():
    dist = ROOT / "dist"
    if not (dist / "index.html").is_file():
        raise ValueError("ต้องรัน npm run build ก่อนสร้างแพ็ก")
    entries = {}
    for path in sorted(dist.rglob("*")):
        if path.is_symlink():
            raise ValueError("ไม่รวม symlink ในแพ็ก static")
        if path.is_file():
            entries[path.relative_to(dist).as_posix()] = path.read_bytes()
    entries[".nojekyll"] = b""
    for path in sorted((ROOT / "docs").glob("*.md")):
        entries["docs/" + path.name] = path.read_bytes()
    entries["วิธีใช้งาน.txt"] = """Pool Studio — เว็บ static รุ่นเบื้องต้น

แตกไฟล์ทั้งหมดไว้ด้วยกัน ไม่ย้ายเฉพาะ index.html
โฟลเดอร์ assets, wasm, pdfjs และ licenses ต้องอยู่ในตำแหน่งเดิม

ใช้งานบน GitHub Pages:
อัปโหลดเนื้อหาแพ็กทั้งหมดไปยัง branch สำหรับเว็บไซต์ เช่น gh-pages
ตั้ง Settings > Pages > Source เป็น Deploy from a branch
เลือก branch ที่อัปโหลด และโฟลเดอร์ / (root)
หากใช้ workflow GitHub Actions ใน source repository ให้ใช้วิธีใน README ของ source แทน

ทดลองในเครื่อง:
เมื่อมี Python 3 ให้เปิด terminal ในโฟลเดอร์ที่แตกไฟล์แล้วรัน python3 -m http.server 8000
เข้าชมผ่าน HTTP ที่พอร์ต 8000 ของเครื่องนั้น ห้ามเปิดไฟล์ด้วย file:// โดยตรง
HTTP server ทำหน้าที่เสิร์ฟไฟล์เท่านั้น ไม่มีการประมวลผลแอปบนเซิร์ฟเวอร์

ขอบเขต:
ใช้ดู PDF/IFC โมเดลสระ และถอดปริมาณรูปทรง ยังไม่มีผลตรวจความปลอดภัยตามมาตรฐาน
ค่าตัวอย่างความหนาผนัง/พื้นใช้แสดงรูปทรง ไม่ใช่ขนาดที่ออกแบบรับรอง
ไฟล์ PDF/IFC ประมวลผลในเบราว์เซอร์ ไม่เก็บถาวร
ยังไม่มีผลต้นแบบ RCTankC ให้เทียบ และไม่มีไฟล์ .exe รวมในแพ็ก
การสร้างแพ็กไม่ได้เผยแพร่เว็บไปยัง GitHub หรือบริการอื่น

ผลลัพธ์เป็นการประเมินเบื้องต้นเพื่อช่วยออกแบบ ไม่ใช่การคำนวณออกแบบสำหรับยื่นขออนุญาต
ต้องให้วิศวกรโยธาที่มีใบอนุญาตตรวจสอบและรับรองก่อนใช้งานจริง

อ่านสถานะมาตรฐานและข้อจำกัดเพิ่มเติมใน docs/
manifest.json บันทึก SHA-256 ของไฟล์ทั้งหมดสำหรับตรวจความครบถ้วน
""".encode("utf-8")
    manifest = {
        "app": "pool-structure",
        "version": json.loads((ROOT / "package.json").read_text())["version"],
        "engineering_status": "not_verified",
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()},
    }
    entries["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    ARCHIVE.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    verify(ARCHIVE)
    digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
    ARCHIVE.with_suffix(".zip.sha256").write_text(f"{digest}  {ARCHIVE.name}\n", encoding="utf-8")
    print(f"สร้าง {ARCHIVE} ({ARCHIVE.stat().st_size:,} ไบต์)")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        verify(Path(sys.argv[2]) if len(sys.argv) > 2 else ARCHIVE)
    else:
        package()
