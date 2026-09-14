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

const CACHE_VERSION = 'sia-v35-2026-09-14c';
const CACHE_RUNTIME = 'sia-runtime-v35';
const CACHE_DATA    = 'sia-data-v35';

/* Recursos críticos: lo mínimo para que la app arranque y se vea.
   La vista por defecto es la tabla del inventario, que no necesita geometrías. */
const CORE_ASSETS = [
  './',
  './index.html',
  /* Desde la v44 el tablero son cuatro archivos y se instalan como UNIDAD: un
     index.html nuevo con un styles.css viejo se ve raro sin dar error, que es
     el peor fallo posible. cacheUtilizable() exige los cuatro antes de purgar
     cachés anteriores. config.js lleva la llave y solo lo edita el responsable. */
  './styles.css',
  './app.js',
  './config.js',
  /* Leaflet 1.9.4 desde el propio dominio (14-sep-2026, B13): 162 KB que antes
     venían de unpkg y solo entraban a la caché runtime cuando la red y la CSP
     lo permitían; ahora se instalan con el resto y el mapa arranca sin red. */
  './vendor/leaflet.js',
  './vendor/leaflet.css',
  './assets/logo-sedema.png',
  './assets/favicon.png',
  './manifest.json',
  './assets/icon-192.png',
  /* Respaldo del inventario: pesa 23 KB y es la diferencia entre un tablero
     sin datos y uno con el último corte cuando el Sheet no responde. */
  './data/inventario.csv',
  /* Indice de zonificaciones: 4.8 KB. Sin el, una ficha abierta sin conexion no
     puede ni decir si esa ANP tiene zonificacion publicada. Los siete GeoJSON
     —686 KB en total— NO entran: se piden uno a la vez cuando hacen falta. */
  './data/zonificacion/index.json',
  './data/pgoedf_areas.json'
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
  const piezas = await Promise.all(
    ['./', './index.html', './styles.css', './app.js', './config.js', './vendor/leaflet.js', './vendor/leaflet.css'].map(u => cache.match(u))
  );
  return piezas.every(Boolean);
}

/* Borra las cachés de versiones anteriores. Solo se llama con reemplazo verificado. */
async function purgarAnteriores(){
  const keys = await caches.keys();
  await Promise.all(
    keys.filter(k => k !== CACHE_VERSION && k !== CACHE_RUNTIME && k !== CACHE_DATA)
        .map(k => caches.delete(k))
  );
}

/* Reparación en caliente (auditoría 13-sep-2026, D7-01). Si esta versión se
   activó sin red, su caché quedó vacía y `cacheFirst` sirve la anterior; antes
   nada volvía a intentar la descarga hasta el siguiente bump, así que el usuario
   quedaba atado a la versión vieja aunque la red regresara. Ahora cada
   navegación dispara un intento (nunca dos a la vez) y cada recurso que sale
   de una caché de respaldo dispara otro acotado a uno cada 30 s: completa la
   caché y, solo si ya alcanza para arrancar, purga las anteriores y avisa a
   las pestañas para que ofrezcan recargar. Con la caché completa cuesta cinco
   `cache.match` y nada más. */
let _reparando = null, _ultimoIntentoReparacion = 0, _avisoReparacionPendiente = false;
function entregarAvisoReparacion(event){
  if(!_avisoReparacionPendiente || !event.clientId) return;
  _avisoReparacionPendiente = false;
  self.clients.get(event.clientId).then(c => { if(c) c.postMessage({tipo:'cache-reparada', version: CACHE_VERSION}); }).catch(()=>{});
}
function repararSiIncompleta(esNavegacion){
  if(_reparando) return _reparando;
  const ahora = Date.now();
  if(!esNavegacion && ahora - _ultimoIntentoReparacion < 30000) return Promise.resolve();
  _ultimoIntentoReparacion = ahora;
  _reparando = (async () => {
    try{
      if(await cacheUtilizable()) return;
      await repararCore();
      if(await cacheUtilizable()){
        await purgarAnteriores();
        precacheDiferido();
        console.info('[SW] Caché de', CACHE_VERSION, 'completada tras recuperar la red.');
        /* Aviso a las pestañas. La que provocó la reparación puede no tener
           aún su escucha de mensajes (app.js la instala al final del arranque),
           así que además se deja pendiente y se entrega con su siguiente
           petición propia (el sondeo `?sesion=` a 1.5 s). */
        _avisoReparacionPendiente = true;
        try{
          const clientes = await self.clients.matchAll({type:'window', includeUncontrolled:true});
          clientes.forEach(c => c.postMessage({tipo:'cache-reparada', version: CACHE_VERSION}));
        }catch(e){}
      }
    }catch(e){
      console.warn('[SW] Reparación de caché pospuesta:', e);
    }finally{
      _reparando = null;
    }
  })();
  return _reparando;
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
      await purgarAnteriores();
    } else {
      console.warn('[SW] Caché nueva incompleta (sin acceso al origen). Se conservan las anteriores; se reintenta en cada navegación (repararSiIncompleta).');
    }
    await self.clients.claim();
  })());
});

/* La página pregunta su versión (auditoría 13-sep-2026, D4-02): con la
   reparación en caliente de la caché, personal en campo puede estar en una
   versión anterior sin saberlo; el pie la muestra y así se puede reportar. */
self.addEventListener('message', event => {
  const d = event.data || {};
  if(d.tipo === 'version?' && event.source){
    try{ event.source.postMessage({tipo:'version', version: CACHE_VERSION}); }catch(e){}
  }
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

  // 2. Teselas de mapa (CARTO basemaps.cartocdn.com, ArcGIS World Imagery):
  //    cache-first runtime. Auditoría 13-sep-2026 (D7-02): la regla anterior
  //    buscaba «cartodb» y no coincidía con cartocdn, así que cada tesela
  //    volvía a la red aunque estuviera cacheada.
  if(/(?:cartocdn|arcgisonline)/.test(url.hostname)){
    event.respondWith(cacheFirst(req, CACHE_RUNTIME));
    return;
  }

  // 3. Recursos del propio sitio: cache-first
  if(url.origin === location.origin){
    /* ── Cloudflare Access (desde 13-sep-2026) ──
       El sitio está detrás de un inicio de sesión. Dos peticiones deben ir a
       la red SIN pasar por la caché:
       · `?sesion=` — sondeo que hace app.js al arrancar y al volver a la app:
         la página lo pide con redirect:'manual'; si Access contesta con una
         redirección (opaqueredirect) la sesión expiró y la página lleva al
         usuario a entrar de nuevo.
       · `?entrar=` — navegación forzada tras esa detección: no debe servirse
         index.html cacheado (sería un bucle), sino dejar que el navegador
         siga la redirección al login. Si no hay red, se cae a la caché para
         no dejar sin tablero a quien ya se había autenticado en el aparato. */
    if(url.searchParams.has('sesion')){
      entregarAvisoReparacion(event);
      event.respondWith(fetch(req).catch(() => new Response('', {status: 503})));
      return;
    }
    if(req.mode === 'navigate' && url.searchParams.has('entrar')){
      event.respondWith(fetch(req).catch(async () => (await caches.match('./index.html')) || new Response('Sin conexión', {status: 503})));
      return;
    }
    /* Cada navegación intenta completar la caché de esta versión si quedó
       incompleta (D7-01); con la caché sana no cuesta nada. */
    if(req.mode === 'navigate'){
      _avisoReparacionPendiente = false; /* la página que nace ya recibe la caché completa */
      event.waitUntil(repararSiIncompleta(true));
    }
    event.respondWith(cacheFirst(req, CACHE_VERSION, event));
    return;
  }

  // 4. Nominatim (geocoder): network-only
  if(/nominatim\.openstreetmap\.org/.test(url.hostname)){
    return;
  }

  // 5. Fuentes Google: cache-first runtime (Leaflet ya es propio: regla 3)
  if(/(?:fonts\.googleapis|fonts\.gstatic)/.test(url.hostname)){
    event.respondWith(cacheFirst(req, CACHE_RUNTIME));
    return;
  }

  // 6. Otros recursos: network-first
  event.respondWith(networkFirst(req));
});

/* === Estrategia: cache-first === */
async function cacheFirst(req, cacheName, event){
  /* Primero la caché de la versión vigente; si activate conservó cachés
     anteriores por falta de red, sirven de respaldo. El orden importa: sin él
     una caché vieja puede eclipsar al index.html nuevo. */
  const cache = await caches.open(cacheName);
  /* ignoreSearch: una navegación con query (?fuente=pwa, ?utm…) debe
     encontrar el index.html cacheado; sin esto la app instalada arrancaba en
     503 sin red. Para navegaciones, el último recurso es index.html. */
  const propioVigente = (await cache.match(req, {ignoreSearch:true}))
                     || (req.mode === 'navigate' ? (await cache.match('./index.html')) : null);
  if(propioVigente) return propioVigente;
  const respaldo = await caches.match(req, {ignoreSearch:true});
  if(respaldo){
    /* Salió de una caché de respaldo (versión anterior): la de esta versión
       está incompleta. Se intenta completarla en segundo plano (D7-01). */
    if(cacheName === CACHE_VERSION){
      const p = repararSiIncompleta();
      if(event) event.waitUntil(p);
    }
    return respaldo;
  }
  try {
    /* redirect:'manual' en los recursos del propio sitio: si Access redirige
       al login (sesión expirada), la respuesta llega como opaqueredirect en
       vez de fallar como error de red. Se avisa a las pestañas abiertas y se
       devuelve 401 para que la app no confunda «sin sesión» con «sin red». */
    const propio = new URL(req.url).origin === location.origin;
    const response = await fetch(propio && req.mode !== 'navigate' ? new Request(req, {redirect:'manual'}) : req);
    if(propio && response && response.type === 'opaqueredirect'){
      avisarSesionExpirada();
      return new Response('Sesión expirada', {status: 401, statusText: 'Unauthorized'});
    }
    if(response && response.status === 200){
      cache.put(req, response.clone()).then(() => { if(cacheName === CACHE_RUNTIME) recortarRuntime(); }).catch(()=>{});
    }
    return response;
  } catch(err) {
    console.warn('[SW] Sin red y sin caché para:', req.url);
    return new Response('Recurso no disponible offline', {status: 503, statusText: 'Service Unavailable'});
  }
}

/* Tope de la caché runtime (teselas, Leaflet, fuentes). Desde que las teselas
   se piden con CORS sí se guardan (D7-02), así que crecería sin límite en
   campo. Se revisa cada 25 altas y se borran las más antiguas (la Cache API
   conserva el orden de inserción) por encima de RUNTIME_MAX entradas:
   ~600 teselas ≈ 10-25 MB según la base. */
const RUNTIME_MAX = 600;
let _altasRuntime = 0, _recortando = false;
async function recortarRuntime(){
  if(++_altasRuntime % 25 !== 0 || _recortando) return;
  _recortando = true;
  try{
    const cache = await caches.open(CACHE_RUNTIME);
    const keys = await cache.keys();
    const sobran = keys.length - RUNTIME_MAX;
    if(sobran > 0) await Promise.all(keys.slice(0, sobran).map(k => cache.delete(k)));
  }catch(e){}
  finally{ _recortando = false; }
}

/* Cloudflare Access devolvió una redirección al login para un recurso del
   sitio: todas las pestañas reciben el aviso y app.js decide (reentrar). */
let _ultimoAvisoSesion = 0;
async function avisarSesionExpirada(){
  const ahora = Date.now();
  if(ahora - _ultimoAvisoSesion < 10000) return;
  _ultimoAvisoSesion = ahora;
  try{
    const clientes = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    clientes.forEach(c => c.postMessage({tipo:'sesion-expirada'}));
  }catch(e){}
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
