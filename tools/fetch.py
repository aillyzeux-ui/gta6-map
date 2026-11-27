"""从 GTAVIMap 下载离线版需要的资源到 docs/ 目录。

用法:
  python tools/fetch.py data     # 标记数据、英文语言包、图标、截图
  python tools/fetch.py tiles    # 白天底图 z8-15（约 2.2 万张，可断点续传）

已下载的文件会跳过，所以中断后重新运行即可继续。
"""
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SITE = "https://jeanropke.github.io/GTAVIMap"
CDN = "https://map-tiles.b-cdn.net"
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"          # 原始数据（不发布）
OUT = ROOT / "docs"         # 发布目录（GitHub Pages）
UA = {"User-Agent": "Mozilla/5.0 (offline-map-builder)"}
MIN_Z, MAX_Z = 8, 15


def get(url, dest, retries=3):
    """下载到 dest。返回 'ok' / 'skip' / 'missing'。"""
    if dest.exists() and dest.stat().st_size > 0:
        return "skip"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                body = r.read()
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(body)
            tmp.replace(dest)
            return "ok"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return "missing"
            time.sleep(1 + attempt * 2)
        except Exception:
            time.sleep(1 + attempt * 2)
    return "fail"


def fetch_data():
    get(f"{SITE}/data/datasets.json", RAW / "datasets.json")
    datasets = json.loads((RAW / "datasets.json").read_text(encoding="utf-8"))["datasets"]
    for d in datasets:
        print(d["path"], get(f"{SITE}/{d['path']}", RAW / d["path"]))
    for f in ["locales/en.json", "data/marker-icons.json", "data/gtavi/regions.json"]:
        # 语言包和图标清单经常更新，每次都重新下载
        p = RAW / f
        if p.exists():
            p.unlink()
        print(f, get(f"{SITE}/{f}", p))

    icons, shots = set(json.loads((RAW / "data/marker-icons.json").read_text(encoding="utf-8"))), set()
    for d in datasets:
        for cat in json.loads((RAW / d["path"]).read_text(encoding="utf-8")):
            icons.add(cat.get("icon") or "districts")
            for m in cat["markers"]:
                if isinstance(m.get("icon"), str):
                    icons.add(m["icon"])
                if m.get("screenshot"):
                    shots.add(m["screenshot"])
    jobs = [(f"{SITE}/images/icons/{i}.png", OUT / "icons" / f"{i}.png") for i in sorted(icons)]
    jobs += [(f"{CDN}/{s}", OUT / s) for s in sorted(shots)]
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda j: get(*j), jobs))
    print(f"图标 {len(icons)} 个，截图 {len(shots)} 张：", {k: res.count(k) for k in set(res)})


def tile_jobs():
    for z in range(MIN_Z, MAX_Z + 1):
        n = 2 ** (z - 8)
        base = 127 * n
        for x in range(base, base + n):
            for y in range(base, base + n):
                rel = f"tiles/day/{z}/{x}_{y}.jpg"
                yield f"{CDN}/assets/gtavi/day/{z}/{x}_{y}.jpg", OUT / rel


def fetch_tiles():
    jobs = list(tile_jobs())
    missing_log = RAW / "missing-tiles.txt"
    known_missing = set(missing_log.read_text().split()) if missing_log.exists() else set()
    jobs = [j for j in jobs if str(j[1].relative_to(OUT)).replace("\\", "/") not in known_missing]
    total, done, stats = len(jobs), 0, {}
    t0 = time.time()
    with ThreadPoolExecutor(8) as ex, open(missing_log, "a") as ml:
        for (url, dest), r in zip(jobs, ex.map(lambda j: get(*j), jobs)):
            done += 1
            stats[r] = stats.get(r, 0) + 1
            if r == "missing":
                ml.write(str(dest.relative_to(OUT)).replace("\\", "/") + "\n")
            if done % 1000 == 0 or done == total:
                print(f"{done}/{total} {stats} {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    {"data": fetch_data, "tiles": fetch_tiles}[sys.argv[1]]()
