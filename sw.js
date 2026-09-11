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

const CACHE_VERSION = 'sia-v35-2026-09-11i';
const CACHE_RUNTIME = 'sia-runtime-v35';
const CACHE_DATA    = 'sia-data-v35';

/* Recursos críticos: lo mínimo para que la app arranque y se vea.
   La vista por defecto es la tabla del inventario, que no necesita geometrías. */
const CORE_ASSETS = [
  './',
  './index.html',
  './assets/logo-sedema.png',
  './assets/favicon.png'
];

/* Capas que sí conviene tener offline, pero que no deben bloquear el install ni
   competir por ancho de banda con el primer render. Se precachean en segundo plano
   cuando el hilo está ocioso. suelo_conservacion.geojson salió de aquí: index.html
   ya lo pide al arrancar y la estrategia same-origin lo deja cacheado igual —
   estaba descargándose dos veces en cada primera visita.
   sipam_fao, arcac, embarcaderos y traslapes siguen siendo bajo demanda. */
const DEFERRED_ASSETS = [
  './data/geometrias.geojson',
  './data/zona_patrimonio.geojson',
  './data/alcaldias.geojson'
];

/* Precache diferido: no forma parte del waitUntil del install, así que el SW queda
   activo de inmediato y estos 380 KB viajan cuando ya no estorban. */
function precacheDiferido(){
  const arranque = () => caches.open(CACHE_VERSION).then(cache =>
    Promise.all(DEFERRED_ASSETS.map(url =>
      cache.match(url).then(hit => hit ? null :
        cache.add(url).catch(err => console.warn('[SW] Diferido, no se pudo cachear:', url, err))
      )
    ))
  );
  if(typeof requestIdleCallback === 'function') requestIdleCallback(arranque, {timeout:15000});
  else setTimeout(arranque, 3000);
}

/* === INSTALL: pre-cachear assets críticos === */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return Promise.all(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
        )
      );
    }).then(() => { precacheDiferido(); return self.skipWaiting(); })
  );
});

/* Reintenta los CORE_ASSETS que el install no pudo bajar (red caída o filtrada).
   Los que ya están en caché no se vuelven a pedir. */
async function repararCore(){
  const cache = await caches.open(CACHE_VERSION);
  await Promise.all(CORE_ASSETS.map(async url => {
    if(await cache.match(url)) return;
    try { await cache.add(url); }
    catch(err){ console.warn('[SW] No se pudo reparar:', url, err); }
  }));
}

/* ¿La caché de ESTA versión alcanza para arrancar la app sin red? */
async function cacheUtilizable(){
  const cache = await caches.open(CACHE_VERSION);
  const raiz  = await cache.match('./');
  const index = await cache.match('./index.html');
  return !!(raiz && index);
}

/* === ACTIVATE: limpiar caches viejos, pero NUNCA a ciegas ===
   El install traga los errores de red en silencio. Si el usuario recibe una
   versión nueva estando en una red que no alcanza el origen (caso real: datos
   móviles Telcel, que no rutea a GitHub Pages), la caché nueva queda vacía.
   Borrar la anterior en ese momento deja al usuario de campo sin tablero,
   ni siquiera offline. Por eso solo se purga cuando hay reemplazo verificado;
   si no, se conservan las cachés previas y `cacheFirst` las usa de respaldo. */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await repararCore();
    if(await cacheUtilizable()){
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE_VERSION && k !== CACHE_RUNTIME && k !== CACHE_DATA)
            .map(k => caches.delete(k))
      );
    } else {
      console.warn('[SW] Caché nueva incompleta (sin acceso al origen). Se conservan las anteriores.');
    }
    await self.clients.claim();
  })());
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
  /* Primero la caché de la versión vigente; si activate conservó cachés
     anteriores por falta de red, sirven de respaldo. El orden importa: sin él
     una caché vieja puede eclipsar al index.html nuevo. */
  const cache = await caches.open(cacheName);
  const cached = (await cache.match(req)) || (await caches.match(req));
  if(cached) return cached;
  try {
    const response = await fetch(req);
    if(response && response.status === 200){
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
  const limpiar = u => u.split('&_t=')[0].split('?_t=')[0];
  try {
    const response = await fetch(req);
    if(response && response.status === 200){
      /* Solo se persiste lo que parece un CSV: evita guardar como inventario
         una pagina de error de Google que responda 200. */
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if(ct.includes('csv') || ct.includes('text/plain')){
        const cache = await caches.open(CACHE_DATA);
        cache.put(new Request(limpiar(req.url), { method: 'GET' }), response.clone());
      } else {
        console.warn('[SW] Respuesta del Sheet con Content-Type inesperado, no se cachea:', ct);
      }
      return response;
    }
    /* 404 (publicacion revocada), 429 (cuota) o 5xx NO son fallo de red, asi
       que no entran al catch. Sin esto la app entera muestra pantalla de error
       aunque exista una copia buena en cache. */
    const previo = await caches.match(limpiar(req.url));
    if(previo){
      console.warn('[SW] Sheets respondio', response && response.status, '— sirviendo copia en caché');
      return previo;
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
