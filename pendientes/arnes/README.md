# Arnés de verificación · SIA Dashboard

Pruebas automatizadas con Playwright (Chromium) contra la copia local del repo, **sin red**: Leaflet se sirve desde `vendor/` de la raíz (el mismo que publica el sitio), el inventario desde `fixtures/`, las teselas son sintéticas y todo lo demás se aborta. Reproducible desde cualquier carpeta: los scripts resuelven sus rutas respecto a la raíz del repo (`_comun.mjs`).

## 1. Requisitos (una sola vez)

```bash
# en la raíz del repo
npm i -D playwright@1.56          # o el 1.4x que tengas; no importa la menor
npx playwright install chromium   # baja el Chromium que usa Playwright
```

Alternativas: si Playwright ya está instalado en otra carpeta, `PLAYWRIGHT_DIR=/ruta/que/contiene/node_modules node …`; si quieres otro Chromium, `CHROME=/ruta/al/chrome node …`.

Python solo hace falta para `tools/traslapes.py` y para las comprobaciones geométricas (`pip install shapely pyproj`).

## 2. Arranque exacto

```bash
# terminal 1 · servidor estático de la raíz del repo (puerto 8897)
node pendientes/arnes/srv.mjs

# terminal 2 · los scripts, desde la raíz o desde pendientes/arnes, da igual
node pendientes/arnes/aud360.mjs      # cuatro perfiles: iPhone, Pixel, laptop, escritorio
node pendientes/arnes/filtros.mjs     # filtros dependientes y columnas por subconjunto
```

`acceso.mjs` necesita su propio servidor, que simula Cloudflare Access (redirección al login cuando existe la bandera `.expirada` en la raíz del repo):

```bash
node pendientes/arnes/srv-acceso.mjs &      # puerto 8898
node pendientes/arnes/acceso.mjs
```

Otro puerto: `PUERTO=9000 node pendientes/arnes/srv.mjs` y el mismo `PUERTO=9000` al correr el script.

## 3. Qué hay aquí

| Archivo | Qué prueba |
|---|---|
| `_comun.mjs` | Rutas, Playwright, Leaflet local, CSV, capas de `data/`, tesela sintética con CORS, enrutado estándar. Todo script nuevo importa de aquí. |
| `srv.mjs` | Servidor estático sin caché (8897). |
| `aud360.mjs` | Auditoría 360 automatizada: errores de consola, desbordes, objetivos táctiles < 40 px, contraste, truncados y los cuatro flujos de ubicación, en cuatro perfiles. |
| `filtros.mjs` | Filtros visibles/ocultos y columnas por subconjunto. Responde con el stub de Leaflet si la página lo pide fuera del servidor local; como `index.html` lo carga de `vendor/`, en la práctica corre con el real. |
| `acceso.mjs` + `srv-acceso.mjs` | Detección de sesión expirada de Cloudflare Access (sondeo `?sesion=` y aviso del SW). |
| `fixtures/` | `inventario_real_2026-09-12.csv` (copia del Sheet), `inventario.csv` (mínimo), `leaflet-stub.js`. |

## 4. Reglas

- Las teselas se responden **con** `Access-Control-Allow-Origin: *`: las capas se piden con `crossOrigin`, y sin la cabecera el mapa no pinta.
- Los scripts no dependen de la carpeta desde la que se ejecutan ni de rutas de una máquina concreta; si uno nuevo lo hace, corrígelo antes de guardarlo aquí.
- El Service Worker se prueba con un servidor propio y corte de red por bandera (las rutas de Playwright no ven las peticiones del SW); ese escenario está descrito en el punto 6 del § 6.
- Lo que el arnés no ve —teselas reales, fuentes, Google Places, el SW en producción, Cloudflare Access real— se comprueba en el navegador tras la purga.
- En móvil hay que crear el contexto con `hasTouch:true`; si no, los gestos táctiles (`_gestosTactilesIncrustado`) no se activan. `fixtures/leaflet-stub.js` acepta cualquier llamada a `L.*` sin hacer nada: sirve para arranque, filtros y tabla, **no** para verificar mapas.
- Las pruebas puntuales de una entrega (`t_*.mjs`) no se guardan aquí: se escriben en unas 20 líneas importando `playwright()`, `lanzar()` y `enrutar()` de `_comun.mjs` y se documentan en el informe de la revisión que las usó.

## 5. Intercepción de red (patrón de todos los scripts, `enrutar()`)

| Petición | Respuesta |
|---|---|
| `http://localhost:8897/...` | archivos reales del repo |
| `leaflet.js` / `leaflet.css` fuera del servidor local | `vendor/` de la raíz (mapas reales) o `fixtures/leaflet-stub.js` y CSS vacío |
| `docs.google.com` (CSV del Sheet) | `fixtures/inventario_real_2026-09-12.csv` (66 filas reales) o `fixtures/inventario.csv` (66 sintéticas) |
| `basemaps.cartocdn` / `arcgisonline` | PNG 256×256 en memoria con `Access-Control-Allow-Origin: *` |
| `*.geojson` | el archivo de `data/` con ese nombre; si no existe, `FeatureCollection` vacía |
| `fonts.googleapis.com` | CSS vacío |
| todo lo demás | `abort()` |

## 6. Qué probar en cada entrega (lista mínima)

1. Las validaciones del CI (`.github/workflows/validar.yml`) en local: sintaxis de JS y CSS, hashes de CSP y SRI, GeoJSON, invariante de 66 y contrato de columnas.
2. `aud360.mjs` en los cuatro perfiles: cero `pageerror`; sin scroll horizontal en ningún destino; sin objetivos táctiles nuevos < 40 px; los cuatro flujos de ubicación con su cabeza esperada.
3. Invariantes en pantalla: el resumen dice 66 áreas; chips 13/26/18/9; ARCAC y Zona Patrimonio nunca alteran esos contadores.
4. Ficha: abre desde tabla, mapa y resultado de ubicación; `#dr` pierde `inert` al abrir y en móvil el cuerpo lleva `pagina-bloqueada`; Escape cierra; el asa de la hoja sube, nunca cierra.
5. Mapas incrustados: en móvil `touch-action: pan-x pan-y` en reposo y `.mapa-gesto-total` en el mapa del caparazón; `.btn-ampliar` presente en todo puntero y en estado «Salir de pantalla completa» al ampliar cualquier mapa, aunque antes se haya abierto otro.
6. Service Worker: instala con red → bump de `CACHE_VERSION` sin red (la caché nueva queda vacía y la página arranca de la anterior) → vuelve la red: la primera navegación dispara `repararSiIncompleta()`, que completa la caché nueva, purga la anterior y muestra «Nueva versión disponible…». Se prueba con un servidor que corta la red por bandera (`.caida`: todo salvo `sw.js`; `.caida-total`: también `sw.js`) y un contexto con `serviceWorkers:'allow'`; guion en `pendientes/auditoria-360-2026-09-13.md`, apartado D7.
7. CSP: cada origen externo que pide el tablero (`app.js`, `index.html`, `sw.js`) está en la CSP de `_headers`, y todo host que pida el SW está además en `connect-src` (la CSP de un worker gobierna sus `fetch()`). `aud360.json` no sirve para esto: `red.peticiones` solo cuenta las peticiones al servidor local.
8. `acceso.mjs`: `navegó a Access: true` en los dos casos de sesión expirada, `errores []` y `→ OK` en el retorno de Access con SW.

## 7. Producción

`sia.contactoverde.com` está detrás de Cloudflare Access: lo que se verifica en vivo se hace desde un navegador con sesión autorizada. El pie del tablero muestra la versión instalada («Versión del tablero»); en consola, `navigator.serviceWorker.getRegistrations()` y `caches.keys()` dicen qué versión sirve ese navegador. Si un navegador conserva un SW antiguo que intercepta `/cdn-cgi/` y el login termina en `ERR_FAILED`, «Unregister» en DevTools → Application → Service Workers lo resuelve. Prueba de sesión real: abrir `https://sedema-sia.cloudflareaccess.com/cdn-cgi/access/logout` y luego el tablero: la copia cacheada carga y en ≤ 4 s redirige al login sola.

Antes de reportar un hallazgo, contrastar con `pendientes/pendientes.md` (lo abierto), la última `pendientes/auditoria-360-*.md` (lo ya revisado) y `CLAUDE.md` (reglas e invariantes).
