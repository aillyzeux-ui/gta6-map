/* GTA6 离线地图 —— Service Worker
 * shell 缓存：页面、脚本、数据、图标（随版本号更新）
 * pack 缓存：地图底图与截图（由页面上的“下载离线地图”按钮写入，长期保留）
 */
const VERSION = '__BUILD__';
const SHELL_CACHE = 'gta6map-shell-' + VERSION;
const PACK_CACHE = 'gta6map-pack-v1';
const SHELL = __SHELL__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gta6map-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isPackFile = (path) => /\/(tiles|media)\//.test(path);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isPackFile(url.pathname)) {
    // 底图/截图：缓存优先；联网时顺手存起来
    event.respondWith((async () => {
      const cache = await caches.open(PACK_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 404, statusText: 'offline' });
      }
    })());
    return;
  }

  // 其余文件：缓存优先，后台联网更新（stale-while-revalidate）
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { event.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') {
      const index = await cache.match('./index.html') || await cache.match('./');
      if (index) return index;
    }
    return new Response('离线状态下无法加载该资源', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
