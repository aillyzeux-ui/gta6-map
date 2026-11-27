/* GTA6 离线地图 —— 主程序 */
(function () {
  'use strict';

  const BASE = new URL('./', location.href).href;
  const STORE_KEY = 'gta6map.state.v1';
  const PACK_CACHE = 'gta6map-pack-v1';
  const BOUNDS = [[-1.40625, 0], [0, 1.4061088354351563]];
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 本地状态 ----------
  const state = loadState();
  function loadState() {
    const def = { hidden: {}, collected: {}, hideCollected: false, labels: true, size: 1, open: {}, collapsed: {}, view: null, initialized: false };
    try { return Object.assign(def, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { return def; }
  }
  let saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('无法保存进度（存储不可用）'); }
    }, 150);
  }

  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- 数据 ----------
  let DATA, S, features = [];
  const catKeyIndex = new Map();

  async function loadData() {
    const res = await fetch('data/map.json');
    if (!res.ok) throw new Error('地图数据加载失败');
    DATA = await res.json();
    S = DATA.strings;
    DATA.cats.forEach((c, ci) => {
      catKeyIndex.set(c.key, ci);
      c.markers.forEach((m, mi) => {
        features.push({
          type: 'Feature', id: features.length,
          properties: { c: ci, m: mi, k: m[6], ic: c.icon, s: c.scale },
          geometry: { type: 'Point', coordinates: [m[0], m[1]] },
        });
      });
    });
    // 首次使用：默认只显示收集品/活动/彩蛋，数量巨大的“地点”“特殊载具”先隐藏
    if (!state.initialized) {
      DATA.sections.forEach((sec) => {
        if (sec.title === '地点' || sec.title === '特殊载具') {
          sec.groups.forEach((g) => g.cats.forEach((ci) => { state.hidden[DATA.cats[ci].key] = 1; }));
        }
      });
      state.initialized = true; saveState();
    }
  }
  const str = (i) => (i >= 0 ? S[i] : '');

  // ---------- 地图 ----------
  let map;
  function initMap() {
    const v = state.view;
    map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {
          day: {
            type: 'raster', tileSize: 256, minzoom: 8, maxzoom: 15, bounds: [-1.40625, 0, 0, 1.4061088354351563],
            tiles: [BASE + 'tiles/day/{z}/{x}_{y}.jpg'],
            attribution: '地图画面 © Rockstar Games · 数据 GTAVIMap',
          },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#4891a8' } },
          { id: 'day', type: 'raster', source: 'day', paint: { 'raster-fade-duration': 0 } },
        ],
      },
      center: v ? v.center : [-0.70, 0.67],
      zoom: v ? v.zoom : 9.6,
      minZoom: 8, maxZoom: 17.5,
      maxBounds: [[-1.9, -0.5], [0.5, 1.9]],
      dragRotate: false, pitchWithRotate: false, touchPitch: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('moveend', () => {
      const c = map.getCenter();
      state.view = { center: [+c.lng.toFixed(5), +c.lat.toFixed(5)], zoom: +map.getZoom().toFixed(2) };
      saveState();
    });
    // 缺失的瓦片（海面等）静默忽略
    map.on('error', (e) => { if (!(e && e.sourceId === 'day')) console.warn(e && e.error); });

    return new Promise((resolve) => map.on('load', resolve));
  }

  async function addMarkers() {
    const icons = [...new Set(DATA.cats.map((c) => c.icon))];
    await Promise.all(icons.map(async (name) => {
      try {
        const img = await map.loadImage(BASE + 'icons/' + name + '.png');
        if (!map.hasImage(name)) map.addImage(name, img.data);
      } catch (e) { console.warn('图标加载失败', name); }
    }));
    map.addSource('markers', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({
      id: 'markers', type: 'symbol', source: 'markers',
      layout: {
        'icon-image': ['get', 'ic'],
        'icon-size': iconSize(),
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['case', ['boolean', ['feature-state', 'done'], false], 0.35, 1] },
    });
    features.forEach((f) => { if (state.collected[f.properties.k]) map.setFeatureState({ source: 'markers', id: f.id }, { done: true }); });
    applyFilter();

    map.on('click', 'markers', (e) => { const f = e.features && e.features[0]; if (f) openPopup(f.id, window.innerWidth <= 760); });
    map.on('mouseenter', 'markers', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'markers', () => { map.getCanvas().style.cursor = ''; });
  }

  function applyFilter() {
    if (!map || !map.getLayer('markers')) return;
    const visible = DATA.cats.map((c, i) => (state.hidden[c.key] ? -1 : i)).filter((i) => i >= 0);
    const filter = ['all', ['in', ['get', 'c'], ['literal', visible]]];
    if (state.hideCollected) filter.push(['!', ['in', ['get', 'k'], ['literal', Object.keys(state.collected)]]]);
    map.setFilter('markers', filter);
  }

  function applySize() {
    if (!map.getLayer('markers')) return;
    map.setLayoutProperty('markers', 'icon-size', iconSize());
  }

  // zoom 只能出现在最外层的 interpolate 里
  function iconSize() {
    const k = state.size;
    return ['interpolate', ['linear'], ['zoom'],
      8, ['*', ['get', 's'], 0.32 * k],
      11, ['*', ['get', 's'], 0.55 * k],
      14, ['*', ['get', 's'], 0.85 * k],
      16, ['*', ['get', 's'], 1.05 * k]];
  }

  // ---------- 区域名称 ----------
  const labelMarkers = [];
  function addLabels() {
    DATA.labels.forEach((l) => {
      const el = document.createElement('div');
      el.className = 'region-label ' + (l.imp || 'local');
      el.textContent = l.t;
      labelMarkers.push({ l, mk: new maplibregl.Marker({ element: el }).setLngLat([l.lng, l.lat]) });
    });
    map.on('zoomend', updateLabels);
    updateLabels();
  }
  function updateLabels() {
    const z = map.getZoom();
    labelMarkers.forEach(({ l, mk }) => {
      const show = state.labels && z >= l.min && z < l.max && !(l.imp !== 'major' && z > 14.5);
      if (show && !mk._added) { mk.addTo(map); mk._added = true; }
      if (!show && mk._added) { mk.remove(); mk._added = false; }
    });
  }

  // ---------- 弹窗 ----------
  let popup = null;
  // 让标记落在屏幕偏下的位置，弹窗才有空间完整显示
  const popupOffset = () => [0, Math.round(window.innerHeight * 0.28)];
  function openPopup(fid, pan) {
    const f = features[fid];
    const { c: ci, m: mi, k } = f.properties;
    const cat = DATA.cats[ci], m = cat.markers[mi];
    const name = str(m[2]), hint = str(m[3]), desc = str(m[4]), shot = str(m[5]);
    const done = !!state.collected[k];
    const isCard = cat.group === 'collectible_cards';
    const html = `<div class="pop">
      <h3>${esc(name)}</h3>
      <div class="cat-line">${isCard ? '收藏系列：' : ''}${esc(cat.name)}</div>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
      ${shot ? `<img src="${esc(BASE + shot)}" alt="位置截图" loading="lazy">` : ''}
      <div class="actions"><button type="button" class="${done ? 'done' : ''}" data-act="collect">${done ? '✓ 已收集（点击取消）' : (cat.collectible ? '标记为已收集' : '标记为已完成')}</button></div>
    </div>`;
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 16, maxWidth: '340px', focusAfterOpen: false })
      .setLngLat(f.geometry.coordinates).setHTML(html).addTo(map);
    if (pan) map.easeTo({ center: f.geometry.coordinates, offset: popupOffset(), duration: 350 });
    const el = popup.getElement();
    const img = el.querySelector('img');
    if (img) img.addEventListener('error', () => { img.replaceWith(Object.assign(document.createElement('p'), { className: 'desc', textContent: '（截图未下载，联网后可查看）' })); });
    el.querySelector('[data-act=collect]').addEventListener('click', () => { toggleCollected(fid); openPopup(fid); });
  }

  function toggleCollected(fid) {
    const k = features[fid].properties.k;
    if (state.collected[k]) delete state.collected[k]; else state.collected[k] = 1;
    map.setFeatureState({ source: 'markers', id: fid }, { done: !!state.collected[k] });
    saveState();
    if (state.hideCollected) applyFilter();
    renderCounts();
  }

  // ---------- 侧边菜单 ----------
  const catRows = new Map();   // catIdx -> {row, checkbox, count}
  const groupRows = [];         // {g, checkbox, count}

  function renderMenu() {
    const root = $('sections'); root.innerHTML = '';
    DATA.sections.forEach((sec) => {
      const secEl = document.createElement('div');
      secEl.className = 'section' + (state.collapsed[sec.title] ? ' collapsed' : '');
      const title = document.createElement('div');
      title.className = 'section-title';
      title.innerHTML = `<span>${esc(sec.title)}</span><span class="chev">▼</span>`;
      title.addEventListener('click', () => {
        secEl.classList.toggle('collapsed');
        state.collapsed[sec.title] = secEl.classList.contains('collapsed') ? 1 : 0; saveState();
      });
      const groupsEl = document.createElement('div'); groupsEl.className = 'groups';
      sec.groups.forEach((g) => groupsEl.appendChild(renderGroup(g)));
      secEl.append(title, groupsEl); root.appendChild(secEl);
    });
    renderCounts();
  }

  function renderGroup(g) {
    const el = document.createElement('div');
    el.className = 'group' + (state.open[g.key] ? ' open' : '');
    const head = document.createElement('div'); head.className = 'group-head';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.setAttribute('aria-label', '显示 ' + g.name);
    const name = document.createElement('span'); name.className = 'name'; name.textContent = g.name;
    const count = document.createElement('span'); count.className = 'count';
    const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▶';
    head.append(cb, name, count, chev);
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      g.cats.forEach((ci) => { if (cb.checked) delete state.hidden[DATA.cats[ci].key]; else state.hidden[DATA.cats[ci].key] = 1; });
      saveState(); applyFilter(); renderCounts();
    });
    head.addEventListener('click', () => {
      el.classList.toggle('open'); state.open[g.key] = el.classList.contains('open') ? 1 : 0; saveState();
    });
    const cats = document.createElement('div'); cats.className = 'cats';
    g.cats.forEach((ci) => {
      const c = DATA.cats[ci];
      const row = document.createElement('label'); row.className = 'cat';
      const ccb = document.createElement('input'); ccb.type = 'checkbox';
      const img = document.createElement('img'); img.src = 'icons/' + c.icon + '.png'; img.alt = ''; img.loading = 'lazy';
      const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = c.name;
      const cnt = document.createElement('span'); cnt.className = 'count';
      row.append(ccb, img, nm, cnt);
      ccb.addEventListener('change', () => {
        if (ccb.checked) delete state.hidden[c.key]; else state.hidden[c.key] = 1;
        saveState(); applyFilter(); renderCounts();
      });
      catRows.set(ci, { row, cb: ccb, count: cnt });
      cats.appendChild(row);
    });
    el.append(head, cats);
    groupRows.push({ g, cb, count });
    return el;
  }

  function renderCounts() {
    catRows.forEach(({ row, cb, count }, ci) => {
      const c = DATA.cats[ci];
      const on = !state.hidden[c.key];
      cb.checked = on; row.classList.toggle('off', !on);
      const n = c.markers.length;
      const done = c.markers.reduce((a, m) => a + (state.collected[m[6]] ? 1 : 0), 0);
      count.textContent = done ? `${done}/${n}` : String(n);
    });
    groupRows.forEach(({ g, cb, count }) => {
      const on = g.cats.filter((ci) => !state.hidden[DATA.cats[ci].key]).length;
      cb.checked = on === g.cats.length; cb.indeterminate = on > 0 && on < g.cats.length;
      count.textContent = g.cats.reduce((a, ci) => a + DATA.cats[ci].markers.length, 0);
    });
  }

  function setAll(show) {
    DATA.cats.forEach((c) => { if (show) delete state.hidden[c.key]; else state.hidden[c.key] = 1; });
    saveState(); applyFilter(); renderCounts();
  }

  // ---------- 搜索 ----------
  let searchIndex = null;
  function buildSearchIndex() {
    searchIndex = features.map((f) => {
      const c = DATA.cats[f.properties.c], m = c.markers[f.properties.m];
      return (str(m[2]) + ' ' + c.name + ' ' + str(m[3])).toLowerCase();
    });
  }
  function runSearch(q) {
    const box = $('results');
    q = q.trim().toLowerCase();
    if (!q) { box.hidden = true; $('browse').hidden = false; return; }
    if (!searchIndex) buildSearchIndex();
    const words = q.split(/\s+/);
    const hits = [];
    for (let i = 0; i < searchIndex.length && hits.length < 80; i++) {
      if (words.every((w) => searchIndex[i].includes(w))) hits.push(i);
    }
    box.innerHTML = '';
    if (!hits.length) box.innerHTML = '<div class="empty">没有找到匹配的标记</div>';
    hits.forEach((fid) => {
      const f = features[fid], c = DATA.cats[f.properties.c], m = c.markers[f.properties.m];
      const b = document.createElement('button'); b.type = 'button'; b.className = 'result';
      b.innerHTML = `<img src="icons/${esc(c.icon)}.png" alt=""><span><span class="t">${esc(str(m[2]))}${state.collected[m[6]] ? ' ✓' : ''}</span><span class="s">${esc(c.name)}</span></span>`;
      b.addEventListener('click', () => focusFeature(fid));
      box.appendChild(b);
    });
    box.hidden = false; $('browse').hidden = true;
  }
  function focusFeature(fid) {
    const f = features[fid], c = DATA.cats[f.properties.c];
    if (state.hidden[c.key]) { delete state.hidden[c.key]; saveState(); applyFilter(); renderCounts(); }
    closeMenu();
    map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 15), speed: 1.6, offset: popupOffset() });
    map.once('moveend', () => openPopup(fid));
  }

  // ---------- 手机菜单 ----------
  function openMenu() { document.body.classList.add('menu-open'); $('backdrop').hidden = false; $('menu-btn').setAttribute('aria-expanded', 'true'); }
  function closeMenu() { document.body.classList.remove('menu-open'); $('backdrop').hidden = true; $('menu-btn').setAttribute('aria-expanded', 'false'); }

  // ---------- 离线下载 ----------
  let pack = null, downloading = false;
  async function initOffline() {
    const btn = $('offline-btn'), status = $('offline-status'), hint = $('offline-hint');
    if (!('serviceWorker' in navigator) || !('caches' in window)) {
      status.textContent = '当前浏览器不支持离线功能。'; return;
    }
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) { status.textContent = '离线功能启动失败：' + e.message; return; }
    try { pack = await (await fetch('data/offline-pack.json')).json(); } catch (e) {
      status.textContent = '离线包清单加载失败，请联网后重试。'; return;
    }
    const total = pack.files.length;
    const cache = await caches.open(PACK_CACHE);
    const have = new Set((await cache.keys()).map((r) => r.url));
    const missing = pack.files.filter((p) => !have.has(BASE + p));
    const mb = (pack.bytes / 1048576).toFixed(0);
    if (IS_IOS && !IS_STANDALONE) {
      hint.textContent = 'iPhone 提示：请先点 Safari 的分享按钮 →「添加到主屏幕」，然后从桌面图标打开再下载。在 Safari 里下载的离线数据，主屏幕 App 用不了。';
    }
    if (!missing.length) {
      status.textContent = `✓ 离线地图已全部下载（${total} 个文件，约 ${mb} MB），没网也能用。`;
      btn.textContent = '重新检查'; btn.disabled = false;
    } else {
      status.textContent = have.size
        ? `已下载 ${total - missing.length} / ${total} 个文件，还差 ${missing.length} 个。`
        : `离线包约 ${mb} MB（地图底图 + 截图），下载后没网也能查看地图。建议连 Wi-Fi 下载。`;
      btn.textContent = have.size ? '继续下载' : `下载离线地图（约 ${mb} MB）`;
      btn.disabled = false;
    }
    btn.onclick = () => downloadPack(cache);
  }

  async function downloadPack(cache) {
    if (downloading) return;
    downloading = true;
    const btn = $('offline-btn'), status = $('offline-status'), bar = $('offline-bar');
    btn.disabled = true; bar.parentElement.hidden = false;
    if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (e) { /* 忽略 */ } }
    const have = new Set((await cache.keys()).map((r) => r.url));
    const todo = pack.files.filter((p) => !have.has(BASE + p));
    const total = pack.files.length;
    let done = total - todo.length, failed = 0, idx = 0;
    const update = () => {
      bar.style.width = (done / total * 100).toFixed(1) + '%';
      status.textContent = `正在下载… ${done} / ${total}${failed ? `（${failed} 个失败）` : ''}。请保持屏幕常亮、不要切出 App。`;
    };
    update();
    async function worker() {
      while (idx < todo.length) {
        const p = todo[idx++];
        try {
          const r = await fetch(BASE + p, { cache: 'no-store' });
          if (r.ok) await cache.put(BASE + p, r); else failed++;
        } catch (e) { failed++; }
        done++;
        if (done % 25 === 0 || done === total) update();
      }
    }
    try {
      await Promise.all(Array.from({ length: 6 }, worker));
    } catch (e) {
      toast('下载中断：' + (e && e.name === 'QuotaExceededError' ? '手机存储空间不足' : e.message), 5000);
    }
    downloading = false;
    update();
    if (failed) { status.textContent += ' 点击“继续下载”重试失败的文件。'; }
    await initOffline();
    if (!failed) toast('离线地图下载完成 🎉');
  }

  // ---------- 备份 ----------
  function exportProgress() {
    const blob = new Blob([JSON.stringify({ app: 'gta6map', v: 1, collected: state.collected, hidden: state.hidden }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'gta6-map-进度.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importProgress(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.app !== 'gta6map' || typeof j.collected !== 'object') throw new Error('不是本地图导出的进度文件');
      state.collected = j.collected; if (j.hidden) state.hidden = j.hidden;
      saveState();
      features.forEach((f) => map.setFeatureState({ source: 'markers', id: f.id }, { done: !!state.collected[f.properties.k] }));
      applyFilter(); renderCounts();
      toast(`已导入 ${Object.keys(j.collected).length} 条收集记录`);
    } catch (e) { toast('导入失败：' + e.message, 4000); }
  }

  // ---------- 启动 ----------
  async function main() {
    $('menu-btn').onclick = openMenu; $('close-btn').onclick = closeMenu; $('backdrop').onclick = closeMenu;
    $('show-all').onclick = () => setAll(true); $('hide-all').onclick = () => setAll(false);
    let st = null;
    $('search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => runSearch(e.target.value), 180); });

    const hc = $('opt-hide-collected'); hc.checked = state.hideCollected;
    hc.onchange = () => { state.hideCollected = hc.checked; saveState(); applyFilter(); };
    const lb = $('opt-labels'); lb.checked = state.labels;
    lb.onchange = () => { state.labels = lb.checked; saveState(); updateLabels(); };
    const sz = $('opt-size'); sz.value = String(state.size);
    sz.onchange = () => { state.size = +sz.value; saveState(); applySize(); };
    $('export-btn').onclick = exportProgress;
    $('import-btn').onclick = () => $('import-file').click();
    $('import-file').onchange = (e) => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ''; };
    $('reset-btn').onclick = () => {
      if (!confirm('确定清空所有收集进度吗？此操作无法撤销。')) return;
      state.collected = {}; saveState();
      features.forEach((f) => map.setFeatureState({ source: 'markers', id: f.id }, { done: false }));
      applyFilter(); renderCounts(); toast('已清空收集进度');
    };

    try {
      await loadData();
    } catch (e) {
      document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center;background:#211829;z-index:99">无法加载地图数据。<br>第一次使用请先联网打开一次。<br><small>${esc(e.message)}</small></div>`);
      return;
    }
    $('data-version').textContent = `共 ${DATA.cats.length} 个分类、${features.length} 个标记。数据更新于 ${DATA.updated || '—'}。`;
    renderMenu();
    await initMap();
    await addMarkers();
    addLabels();
    initOffline();
  }

  main();
})();
