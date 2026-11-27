"""生成发布所需的派生文件：
  docs/data/map.json           标记数据（调用 compile.py）
  docs/data/offline-pack.json  离线包文件清单（底图 + 截图）
  docs/sw.js                   Service Worker（带版本号和预缓存清单）

用法: python tools/build.py
"""
import hashlib
import json
from pathlib import Path

import compile as compile_data

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "docs"


def rel(p):
    return p.relative_to(SITE).as_posix()


BUNDLE_SIZE = 4 * 1024 * 1024


def pack_order(p):
    """截图在前；底图按缩放级别，再按 quadkey（Z 序）排列，同一区域的底图落在同一个包里。"""
    r = rel(p)
    if not r.startswith("tiles/"):
        return (0, 0, r)
    _, _, z, name = r.split("/")
    x, y = (int(v) for v in name.split(".")[0].split("_"))
    qk = 0
    for bit in range(int(z), -1, -1):
        qk = (qk << 2) | (((y >> bit) & 1) << 1) | ((x >> bit) & 1)
    return (1, int(z), qk)


def write_bundles(files):
    """把小文件拼接成约 4 MB 的包，手机下载几十次即可，而不是两万多次。
    每个包记录 [路径, 偏移, 长度]；包名含内容哈希，内容不变则文件名不变。"""
    out_dir = SITE / "pack"
    out_dir.mkdir(exist_ok=True)
    bundles, cur, size = [], [], 0
    for p in files:
        cur.append(p)
        size += p.stat().st_size
        if size >= BUNDLE_SIZE:
            bundles.append(cur)
            cur, size = [], 0
    if cur:
        bundles.append(cur)

    meta, keep = [], set()
    for group in bundles:
        data, entries = bytearray(), []
        for p in group:
            b = p.read_bytes()
            entries.append([rel(p), len(data), len(b)])
            data += b
        name = f"pack/{hashlib.sha256(data).hexdigest()[:16]}.bin"
        keep.add(name)
        target = SITE / name
        if not target.exists():
            target.write_bytes(data)
        meta.append({"file": name, "bytes": len(data), "entries": entries})
    for old in out_dir.glob("*.bin"):  # 删除不再使用的旧包
        if rel(old) not in keep:
            old.unlink()
    return meta


def main():
    compile_data.main()

    pack = sorted((p for d in ("media", "tiles") for p in (SITE / d).rglob("*")
                   if p.is_file() and not p.name.endswith(".part")), key=pack_order)
    pack_bytes = sum(p.stat().st_size for p in pack)
    bundles = write_bundles(pack)
    (SITE / "data" / "offline-pack.json").write_text(
        json.dumps({"count": len(pack), "bytes": pack_bytes, "bundles": bundles},
                   separators=(",", ":")),
        encoding="utf-8")
    print(f"离线包：{len(pack)} 个文件，{pack_bytes / 1048576:.0f} MB，合并为 {len(bundles)} 个包")

    shell = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
             "data/map.json", "data/offline-pack.json"]
    for d in ("vendor", "icons", "app-icons"):
        shell += sorted(rel(p) for p in (SITE / d).glob("*") if p.is_file() and p.suffix in (".js", ".css", ".png"))
    missing = [s for s in shell if s != "./" and not (SITE / s).exists()]
    if missing:
        raise SystemExit(f"缺少文件：{missing}")

    h = hashlib.sha256()
    for s in shell:
        if s != "./":
            h.update((SITE / s).read_bytes())
    version = h.hexdigest()[:12]
    sw = (ROOT / "tools" / "sw.template.js").read_text(encoding="utf-8")
    sw = sw.replace("'__BUILD__'", json.dumps(version)).replace("__SHELL__", json.dumps(shell))
    (SITE / "sw.js").write_text(sw, encoding="utf-8")
    print(f"sw.js 版本 {version}，预缓存 {len(shell)} 个文件")


if __name__ == "__main__":
    main()
