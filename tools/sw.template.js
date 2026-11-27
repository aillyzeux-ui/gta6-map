/* GTA6 离线地图 —— Service Worker
 * shell 缓存：页面、脚本、数据、图标（随版本号更新）
 * bundles 缓存：离线大包（由页面上的“下载离线地图”按钮写入，长期保留）
 *   底图/截图请求时，从对应大包里切出那一段返回，不用把两万多个小文件分别存进缓存。
 */
const VERSION = '__BUILD__';
const SHELL_CACHE = 'gta6map-shell-' + VERSION;
const BUNDLE_CACHE = 'gta6map-bundles-v1';
const SHELL = __SHELL__;
const SCOPE = self.registration.scope;

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
      .then((keys) => Promise.all(keys
        .filter((k) => (k.startsWith('gta6map-shell-') && k !== SHELL_CACHE) || k === 'gta6map-pack-v1')
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---------- 离线包索引：路径 -> [包文件, 偏移, 长度] ----------
let indexPromise = null;
function getIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const res = (await shell.match('data/offline-pack.json', { ignoreSearch: true })) || (await fetch('data/offline-pack.json'));
      const pack = await res.json();
      const map = new Map();
      for (const b of pack.bundles) for (const [path, off, len] of b.entries) map.set(path, [b.file, off, len]);
      return map;
    })().catch((e) => { indexPromise = null; throw e; });
  }
  return indexPromise;
}

// 最近用过的几个包保留 Blob 引用，避免每张底图都重新读包
const blobCache = new Map();
async function bundleBlob(file) {
  if (blobCache.has(file)) {
    const v = blobCache.get(file);
    blobCache.delete(file); blobCache.set(file, v);
    return v;
  }
  const cache = await caches.open(BUNDLE_CACHE);
  const res = await cache.match(SCOPE + file);
  if (!res) return null;
  const p = res.blob().catch(() => { blobCache.delete(file); return null; });
  blobCache.set(file, p);
  if (blobCache.size > 6) blobCache.delete(blobCache.keys().next().value);
  return p;
}

const typeOf = (path) => (path.endsWith('.webp') ? 'image/webp' : path.endsWith('.png') ? 'image/png' : 'image/jpeg');

async function fromBundle(path) {
  let index;
  try { index = await getIndex(); } catch (e) { return null; }
  const hit = index.get(path);
  if (!hit) return null;
  const blob = await bundleBlob(hit[0]);
  if (!blob) return null;
  return new Response(blob.slice(hit[1], hit[1] + hit[2], typeOf(path)), {
    headers: { 'Content-Type': typeOf(path), 'Content-Length': String(hit[2]) },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;
  const path = url.pathname.slice(new URL(SCOPE).pathname.length);

  if (path.startsWith('pack/')) return; // 大包只由页面下载，不经过这里

  if (path.startsWith('tiles/') || path.startsWith('media/')) {
    // 底图/截图：先查离线包，没有就联网
    event.respondWith((async () => {
      const local = await fromBundle(path);
      if (local) return local;
      try { return await fetch(req); } catch (e) { return new Response('', { status: 404, statusText: 'offline' }); }
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
      const index = (await cache.match('./index.html')) || (await cache.match('./'));
      if (index) return index;
    }
    return new Response('离线状态下无法加载该资源', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
