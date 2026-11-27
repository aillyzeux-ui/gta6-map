/* GTA6 离线地图 —— Service Worker
 * shell 缓存：页面、脚本、数据、图标（随版本号更新）
 * bundles 缓存：离线大包（由页面上的“下载离线地图”按钮写入，长期保留）
 *   底图/截图请求时，从对应大包里切出那一段返回，不用把两万多个小文件分别存进缓存。
 */
const VERSION = "2302d0227b9f";
const SHELL_CACHE = 'gta6map-shell-' + VERSION;
const BUNDLE_CACHE = 'gta6map-bundles-v1';
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "data/map.json", "data/offline-pack.json", "data/blip-config.json", "vendor/maplibre-gl.css", "vendor/maplibre-gl.js", "icons/1010_murals_blip.png", "icons/ahol_street_art_blip.png", "icons/ambrosia_raceway_blip.png", "icons/ammu_nations_blip.png", "icons/animal_crackers_blip.png", "icons/arcade_machines_blip.png", "icons/atm_towables_blip.png", "icons/atms_blip.png", "icons/banks_blip.png", "icons/bars_blip.png", "icons/base_jumps_blip.png", "icons/basketball_hoops_blip.png", "icons/big_banks_blip.png", "icons/blip_activity_golf.png", "icons/blip_activity_gym.png", "icons/blip_activity_mudclub.png", "icons/blip_activity_racing_challenge.png", "icons/blip_activity_racing_drone.png", "icons/blip_activity_racing_offroad.png", "icons/blip_activity_racing_street.png", "icons/blip_activity_racing_track.png", "icons/blip_activity_shooting_range.png", "icons/blip_ambient_car_sports.png", "icons/blip_car.png", "icons/blip_gang_bg.png", "icons/blip_gang_final_chapter.png", "icons/blip_gang_guardiabrothers.png", "icons/blip_gang_kingfishers.png", "icons/blip_gang_kolts.png", "icons/blip_gang_m7.png", "icons/blip_gang_pollilanegra.png", "icons/blip_gang_ptty.png", "icons/blip_gang_san4san.png", "icons/blip_garage.png", "icons/blip_garage_purchased.png", "icons/blip_location_bank.png", "icons/blip_location_bank_high_value.png", "icons/blip_location_bg.png", "icons/blip_location_donnie_trailer.png", "icons/blip_location_gang_hideout.png", "icons/blip_location_nightclub.png", "icons/blip_location_train_station.png", "icons/blip_store_bar.png", "icons/blip_store_barber.png", "icons/blip_store_car_wash.png", "icons/blip_store_clothes.png", "icons/blip_store_clothes_formal.png", "icons/blip_store_clothes_souvenir.png", "icons/blip_store_clothes_sports.png", "icons/blip_store_clothes_thrift.png", "icons/blip_store_convenience.png", "icons/blip_store_electronics.png", "icons/blip_store_food_takeaway.png", "icons/blip_store_gas_station.png", "icons/blip_store_gun.png", "icons/blip_store_ice_cream.png", "icons/blip_store_jewelry.png", "icons/blip_store_jewelry_high_value.png", "icons/blip_store_kiosk.png", "icons/blip_store_liquor.png", "icons/blip_store_loans.png", "icons/blip_store_mod_vehicle.png", "icons/blip_store_pawn.png", "icons/blip_store_paynspray.png", "icons/blip_store_shoe.png", "icons/blip_store_tattoo.png", "icons/book_swaps_blip.png", "icons/bus_stops_blip.png", "icons/cafes_takeout_blip.png", "icons/car_washes_blip.png", "icons/casual_street_blip.png", "icons/clubs_blip.png", "icons/contacts_blip.png", "icons/convenience_stores_blip.png", "icons/criminals_blip.png", "icons/curiosities_blip.png", "icons/delights_blip.png", "icons/districts.png", "icons/easter_eggs_blip.png", "icons/electric_chargers_blip.png", "icons/electronics_blip.png", "icons/fast_food_blip.png", "icons/ferry_terminals_blip.png", "icons/final_chapter_blip.png", "icons/fishing_hotspots_blip.png", "icons/footwear_blip.png", "icons/formal_blip.png", "icons/garages_blip.png", "icons/gas_stations_blip.png", "icons/gellhorn_raceway_blip.png", "icons/golf_courses_blip.png", "icons/gyms_blip.png", "icons/hair_beauty_blip.png", "icons/hamlet_boone_speedway_blip.png", "icons/high_end_jewelry_stores_blip.png", "icons/hit_n_run_vc_blip.png", "icons/hot_dog_stands_blip.png", "icons/ice_cream_blip.png", "icons/jack_of_hearts_blip.png", "icons/kentons_treasures_blip.png", "icons/kingfishers_blip.png", "icons/knife_flights_blip.png", "icons/kolt_associates_blip.png", "icons/la_polilla_negra_blip.png", "icons/landmarks.png", "icons/landmarks_blip.png", "icons/liquor_stores_blip.png", "icons/low_end_jewelry_stores_blip.png", "icons/luxury_watches_blip.png", "icons/m7_blip.png", "icons/magazines_blip.png", "icons/meditations_blip.png", "icons/meteorites_blip.png", "icons/mini_golf_courses_blip.png", "icons/mod_shops_blip.png", "icons/moses_vehicles_blip.png", "icons/nine1nine_blip.png", "icons/no_flusher_tags_blip.png", "icons/pawn_shops_blip.png", "icons/pay_n_spray_blip.png", "icons/payday_loans_blip.png", "icons/pool_tables_blip.png", "icons/ptt_youngin_blip.png", "icons/purchasable_garages_blip.png", "icons/racing_challenges_blip.png", "icons/racing_introductions_blip.png", "icons/radar_poi.png", "icons/randy_vehicles_blip.png", "icons/rental_vehicles_blip.png", "icons/safes_blip.png", "icons/san4san_blip.png", "icons/sculptures_blip.png", "icons/shooting_ranges_blip.png", "icons/souvenir_swimwear_blip.png", "icons/sportswear_blip.png", "icons/standout_vehicles_blip.png", "icons/street_food_blip.png", "icons/stunt_jumps_blip.png", "icons/tattoos_blip.png", "icons/the_guardia_brothers_blip.png", "icons/thrift_blip.png", "icons/thrillbilly_mud_club_blip.png", "icons/top_fun_drones_blip.png", "icons/train_stations_blip.png", "icons/under_bridges_blip.png", "icons/underwater_discoveries_blip.png", "icons/unique_playlists_blip.png", "app-icons/icon-180.png", "app-icons/icon-192.png", "app-icons/icon-512.png"];
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
