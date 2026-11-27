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


def main():
    compile_data.main()

    pack = sorted(p for d in ("tiles", "media") for p in (SITE / d).rglob("*")
                  if p.is_file() and not p.name.endswith(".part"))
    pack_bytes = sum(p.stat().st_size for p in pack)
    (SITE / "data" / "offline-pack.json").write_text(
        json.dumps({"files": [rel(p) for p in pack], "bytes": pack_bytes}, separators=(",", ":")),
        encoding="utf-8")
    print(f"离线包：{len(pack)} 个文件，{pack_bytes / 1048576:.0f} MB")

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
