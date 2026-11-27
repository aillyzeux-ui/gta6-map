/* GTA6 离线地图 —— Service Worker
 * shell 缓存：页面、脚本、数据、图标（随版本号更新）
 * pack 缓存：地图底图与截图（由页面上的“下载离线地图”按钮写入，长期保留）
 */
const VERSION = "17f899fb462a";
const SHELL_CACHE = 'gta6map-shell-' + VERSION;
const PACK_CACHE = 'gta6map-pack-v1';
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "data/map.json", "data/offline-pack.json", "vendor/maplibre-gl.css", "vendor/maplibre-gl.js", "icons/1010_murals_blip.png", "icons/ahol_street_art_blip.png", "icons/ambrosia_raceway_blip.png", "icons/ammu_nations_blip.png", "icons/animal_crackers_blip.png", "icons/arcade_machines_blip.png", "icons/atm_towables_blip.png", "icons/atms_blip.png", "icons/banks_blip.png", "icons/bars_blip.png", "icons/base_jumps_blip.png", "icons/basketball_hoops_blip.png", "icons/big_banks_blip.png", "icons/book_swaps_blip.png", "icons/bus_stops_blip.png", "icons/cafes_takeout_blip.png", "icons/car_washes_blip.png", "icons/casual_street_blip.png", "icons/clubs_blip.png", "icons/contacts_blip.png", "icons/convenience_stores_blip.png", "icons/criminals_blip.png", "icons/curiosities_blip.png", "icons/delights_blip.png", "icons/districts.png", "icons/easter_eggs_blip.png", "icons/electric_chargers_blip.png", "icons/electronics_blip.png", "icons/fast_food_blip.png", "icons/ferry_terminals_blip.png", "icons/final_chapter_blip.png", "icons/fishing_hotspots_blip.png", "icons/footwear_blip.png", "icons/formal_blip.png", "icons/garages_blip.png", "icons/gas_stations_blip.png", "icons/gellhorn_raceway_blip.png", "icons/golf_courses_blip.png", "icons/gyms_blip.png", "icons/hair_beauty_blip.png", "icons/hamlet_boone_speedway_blip.png", "icons/high_end_jewelry_stores_blip.png", "icons/hit_n_run_vc_blip.png", "icons/hot_dog_stands_blip.png", "icons/ice_cream_blip.png", "icons/jack_of_hearts_blip.png", "icons/kentons_treasures_blip.png", "icons/kingfishers_blip.png", "icons/knife_flights_blip.png", "icons/kolt_associates_blip.png", "icons/la_polilla_negra_blip.png", "icons/landmarks.png", "icons/landmarks_blip.png", "icons/liquor_stores_blip.png", "icons/low_end_jewelry_stores_blip.png", "icons/luxury_watches_blip.png", "icons/m7_blip.png", "icons/magazines_blip.png", "icons/meditations_blip.png", "icons/meteorites_blip.png", "icons/mini_golf_courses_blip.png", "icons/mod_shops_blip.png", "icons/moses_vehicles_blip.png", "icons/nine1nine_blip.png", "icons/no_flusher_tags_blip.png", "icons/pawn_shops_blip.png", "icons/pay_n_spray_blip.png", "icons/payday_loans_blip.png", "icons/pool_tables_blip.png", "icons/ptt_youngin_blip.png", "icons/purchasable_garages_blip.png", "icons/racing_challenges_blip.png", "icons/racing_introductions_blip.png", "icons/radar_poi.png", "icons/randy_vehicles_blip.png", "icons/rental_vehicles_blip.png", "icons/safes_blip.png", "icons/san4san_blip.png", "icons/sculptures_blip.png", "icons/shooting_ranges_blip.png", "icons/souvenir_swimwear_blip.png", "icons/sportswear_blip.png", "icons/standout_vehicles_blip.png", "icons/street_food_blip.png", "icons/stunt_jumps_blip.png", "icons/tattoos_blip.png", "icons/the_guardia_brothers_blip.png", "icons/thrift_blip.png", "icons/thrillbilly_mud_club_blip.png", "icons/top_fun_drones_blip.png", "icons/train_stations_blip.png", "icons/under_bridges_blip.png", "icons/underwater_discoveries_blip.png", "icons/unique_playlists_blip.png", "app-icons/icon-180.png", "app-icons/icon-192.png", "app-icons/icon-512.png"];

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
