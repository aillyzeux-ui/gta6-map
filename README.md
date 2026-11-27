# GTA6 离线地图（中文）

GTA VI 雷奥尼达州的中文互动地图，可以添加到手机主屏幕，**下载离线包后没网也能用**。

- 15,000+ 个标记，540+ 个分类，界面、分类和 700+ 条收集品找法提示均为简体中文
- 底图清晰度最高 15 级（放大后仍可继续缩放）
- 收集进度保存在本机，可导出 / 导入备份
- 适配 iPhone、安卓和电脑浏览器

## 在 iPhone 上安装

1. 用 **Safari** 打开网站地址
2. 点底部的分享按钮 → **添加到主屏幕**
3. 从桌面上的「GTA6 地图」图标打开
4. 点左上角 ☰ → 拉到「离线使用」→ **下载离线地图**（约 130 MB，建议连 Wi-Fi，下载时保持屏幕常亮）
5. 显示「✓ 离线地图已全部下载」后，没网也能打开

> 一定要在**主屏幕 App 里**下载。iOS 上 Safari 和主屏幕 App 的存储是分开的。

## 目录结构

```
docs/            发布到 GitHub Pages 的网站
  index.html, app.js, style.css, sw.js
  data/map.json            标记数据（由脚本生成）
  data/offline-pack.json   离线包清单（由脚本生成）
  tiles/day/{z}/{x}_{y}.jpg 底图 z8–15
  media/                   位置截图
  icons/                   标记图标
tools/
  fetch.py         从 GTAVIMap 下载数据、图标、截图和底图
  compile.py       把原始数据 + 中文翻译编译成 map.json
  build.py         编译数据并生成离线包清单和 sw.js
  sw.template.js   Service Worker 模板
```

## 更新数据

```bash
python tools/fetch.py data     # 重新下载最新标记数据
python tools/fetch.py tiles    # 补下载缺失的底图（已有的会跳过）
python tools/build.py          # 重新编译
git add -A && git commit -m "更新数据" && git push
```

中文翻译放在同级目录 `../gtavimap-zh/`（zh-ui.json、zh-categories.json、zh-markers.json）。
