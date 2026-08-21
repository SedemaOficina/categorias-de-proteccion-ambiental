/* ============================================================
 * Service Worker · Dashboard SIA · ANP/AVA CDMX · v35
 * ============================================================
 * Estrategia mixta:
 *  - Recursos estáticos del repo: cache-first
 *  - Tiles de mapa: cache-first runtime
 *  - Google Sheets (inventario): network-first con caché
 *    (siempre intenta datos frescos; si falla red, usa última versión cacheada)
 *  - Nominatim, etc.: network-only
 * ============================================================ */

const CACHE_VERSION = 'sia-v35-2026-08-21e';
const CACHE_RUNTIME = 'sia-runtime-v35';
const CACHE_DATA    = 'sia-data-v35';

/* Recursos críticos: pre-cacheados al instalar el SW */
const CORE_ASSETS = [
  './',
  './index.html',
  './SIA_LOGO-03.png',
  './data/geometrias.geojson',
  './data/zona_patrimonio.geojson',
  './data/alcaldias.geojson',
  './data/suelo_conservacion.geojson'
  // Nota: sipam_fao, arcac y embarcaderos NO se precachean (se cargan bajo demanda
  // al abrir su pestaña y quedan en caché runtime tras la primera visita → install más ligero)
];

/* === INSTALL: pre-cachear assets críticos === */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return Promise.all(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* === ACTIVATE: limpiar caches viejos === */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION && k !== CACHE_RUNTIME && k !== CACHE_DATA)
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

/* === FETCH: estrategia mixta === */
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Google Sheets / Google Docs (inventario CSV publicado): network-first con caché
  if(/docs\.google\.com|googleusercontent\.com/.test(url.hostname)){
    event.respondWith(networkFirstData(req));
    return;
  }

  // 2. Tiles de mapa (CartoDB, ArcGIS): cache-first runtime
  if(/(?:cartodb|arcgisonline|fastly)/.test(url.hostname)){
    event.respondWith(cacheFirst(req, CACHE_RUNTIME));
    return;
  }

  // 3. Recursos del propio sitio: cache-first
  if(url.origin === location.origin){
    event.respondWith(cacheFirst(req, CACHE_VERSION));
    return;
  }

  // 4. Nominatim (geocoder): network-only
  if(/nominatim\.openstreetmap\.org/.test(url.hostname)){
    return;
  }

  // 5. CDN de Leaflet, fuentes Google: cache-first runtime
  if(/(?:unpkg|fonts\.googleapis|fonts\.gstatic)/.test(url.hostname)){
    event.respondWith(cacheFirst(req, CACHE_RUNTIME));
    return;
  }

  // 6. Otros recursos: network-first
  event.respondWith(networkFirst(req));
});

/* === Estrategia: cache-first === */
async function cacheFirst(req, cacheName){
  const cached = await caches.match(req);
  if(cached) return cached;
  try {
    const response = await fetch(req);
    if(response && response.status === 200){
      const cache = await caches.open(cacheName);
      cache.put(req, response.clone());
    }
    return response;
  } catch(err) {
    console.warn('[SW] Sin red y sin caché para:', req.url);
    return new Response('Recurso no disponible offline', {status: 503, statusText: 'Service Unavailable'});
  }
}

/* === Estrategia: network-first === */
async function networkFirst(req){
  try {
    const response = await fetch(req);
    if(response && response.status === 200){
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(req, response.clone());
    }
    return response;
  } catch(err) {
    const cached = await caches.match(req);
    if(cached) return cached;
    return new Response('Recurso no disponible', {status: 503, statusText: 'Service Unavailable'});
  }
}

/* === Estrategia: network-first específica para datos críticos (Sheets) === */
async function networkFirstData(req){
  try {
    const response = await fetch(req);
    if(response && response.status === 200){
      const cache = await caches.open(CACHE_DATA);
      const cleanUrl = req.url.split('&_t=')[0].split('?_t=')[0];
      const cleanReq = new Request(cleanUrl, { method: 'GET' });
      cache.put(cleanReq, response.clone());
    }
    return response;
  } catch(err) {
    const cleanUrl = req.url.split('&_t=')[0].split('?_t=')[0];
    const cached = await caches.match(cleanUrl);
    if(cached){
      console.log('[SW] Sheets sin red, sirviendo desde caché:', cleanUrl);
      return cached;
    }
    return new Response('Datos no disponibles offline', {status: 503, statusText: 'Service Unavailable'});
  }
}
