"""把 raw/ 里的原站数据和中文翻译编译成 docs/data/map.json。

名称、提示、描述的取法与原站一致（见 GTAVIMap 的 getFullMarkerName /
getMarkerLocationHint / getLocalizedDescription），先查中文，再回退英文。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
ZH_DIR = ROOT.parent / "gtavimap-zh"
OUT = ROOT / "docs" / "data" / "map.json"

# 游戏坐标 -> 地图经纬度（原站 O5()：以 z8 瓦片 127,127 为原点的墨卡托换算）
import math

ORIGIN, LEFT, TOP, SIZE, BASE_N = (127, 127), -15872, 13312, 24576, 2 ** 8


def to_lnglat(x, y):
    r = (ORIGIN[0] + (x - LEFT) / SIZE) / BASE_N
    i = (ORIGIN[1] + (TOP - y) / SIZE) / BASE_N
    lng = r * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * i))))
    return round(lng, 6), round(lat, 6)

# 菜单分区：(标题, [分组...])；native_vehicle_* 统一归入“特殊载具”
SECTIONS = [
    ("地点", ["points_of_interest", "robberies", "vehicles", "locations", "style", "food_drink"]),
    ("收集品", ["waink_locations", "exploration", "collectible_cards"]),
    ("活动", ["sports", "activities", "stunts", "racing", "illegal_operations"]),
    ("彩蛋", ["easter_eggs"]),
    ("特殊载具", None),
]
GROUP_NAME_OVERRIDE = {"locations": "商店", "vehicles": "交通与服务", "activities": "支线活动"}


def load_i18n():
    en = json.loads((RAW / "locales" / "en.json").read_text(encoding="utf-8"))
    zh = {}
    for name, prefix in [("zh-ui.json", "ui."), ("zh-categories.json", "base."), ("zh-markers.json", "base.")]:
        p = ZH_DIR / name
        if p.exists():
            zh.update({prefix + k: v for k, v in json.loads(p.read_text(encoding="utf-8")).items()})
    return {**en, **zh}


def main():
    T = load_i18n()
    t = lambda k: T.get(k) or None  # noqa: E731

    datasets = json.loads((RAW / "datasets.json").read_text(encoding="utf-8"))["datasets"]
    strings, sidx = [], {}

    def s(v):
        """字符串表去重，返回下标；空串返回 -1。"""
        if not v:
            return -1
        if v not in sidx:
            sidx[v] = len(strings)
            strings.append(v)
        return sidx[v]

    groups, cats, total = {}, [], 0
    for d in datasets:
        for c in json.loads((RAW / d["path"]).read_text(encoding="utf-8")):
            ckey = c.get("i18nKey", c["key"])
            cat_name = t(f"base.{ckey}.name") or c["key"]
            cat_desc_key = c.get("markerDescriptionI18nKey")
            rows = []
            for m in c["markers"]:
                if m.get("hidden"):
                    continue
                mkey, mi18n = m["key"], m.get("i18nKey", m["key"])
                name = t(f"base.{mi18n}.name") or t(f"base.{ckey}.marker_name") or cat_name
                collectible = m.get("collectible", c.get("collectible", False))
                hint = t(f"base.{mkey}.hint") if collectible else None
                dk = m.get("descriptionI18nKey") or cat_desc_key
                if dk:
                    dkey = f"base.{dk}.desc"
                elif t(f"base.{mkey}.desc"):
                    dkey = f"base.{mkey}.desc"
                else:
                    dkey = f"base.{mi18n}.desc"
                if m.get("screenshot") and dkey == "base.native_card_fixture.desc":
                    desc = None
                else:
                    desc = t(dkey) or " ".join(filter(None, [t(f"base.{ckey}.desc"), t(f"base.{mi18n}.detail")]))
                pos = m.get("mapAnchor") or m
                lng, lat = to_lnglat(pos["x"], pos["y"])
                rows.append([lng, lat, s(name), s(hint), s(desc), s(m.get("screenshot")), mkey])
            if not rows and not c.get("showWhenEmpty"):
                continue
            total += len(rows)
            g = c["group"]
            groups.setdefault(g, [])
            groups[g].append(len(cats))
            cats.append({
                "key": c["key"], "name": cat_name, "group": g,
                "icon": c.get("icon") or "districts", "scale": c.get("scale", 0.5),
                "collectible": bool(c.get("collectible")), "markers": rows,
            })

    sections, used = [], set()
    for title, gs in SECTIONS:
        if gs is None:
            gs = [g for g in groups if g.startswith("native_vehicle_")]
        items = []
        for g in gs:
            if g not in groups:
                continue
            used.add(g)
            items.append({"key": g, "name": GROUP_NAME_OVERRIDE.get(g) or t(f"base.{g}.name") or g,
                          "cats": groups[g]})
        if items:
            sections.append({"title": title, "groups": items})
    left = [g for g in groups if g not in used]
    if left:
        sections.append({"title": "其他", "groups": [
            {"key": g, "name": t(f"base.{g}.name") or g, "cats": groups[g]} for g in left]})

    regions = json.loads((RAW / "data/gtavi/regions.json").read_text(encoding="utf-8"))
    labels = [{"t": m["title"], **dict(zip(("lng", "lat"), to_lnglat(m["x"], m["y"]))),
               "min": m.get("minZoom", 8), "max": m.get("maxZoom", 18), "imp": m.get("importance", "local")}
              for r in regions for m in r["markers"]]

    out = {"version": 1, "updated": __import__("datetime").date.today().isoformat(), "strings": strings, "cats": cats, "sections": sections, "labels": labels}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(cats)} 个分类，{total} 个标记，{len(strings)} 条文本，"
          f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
