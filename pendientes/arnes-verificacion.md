# Arnés de verificación del SIA Dashboard

Cómo levantar, en cualquier chat del Proyecto o en cualquier máquina, el entorno con el que se validan las entregas (v38–v71). Los scripts viven en `pendientes/arnes/` del repo (no se publican: `.assetsignore` excluye `pendientes`) y desde la entrega 5 de la auditoría del 13-sep-2026 son **reproducibles sin rutas de máquina**: todo se resuelve respecto a la raíz del repo vía `_comun.mjs` (ver `pendientes/arnes/README.md`, que es la referencia corta). Escrito el 13 de septiembre de 2026; actualizado la noche del mismo día.

## 1. Qué se necesita y qué no
- **Node ≥ 18 y Playwright** con Chromium. Instalación normal: `npm i -D playwright` en la raíz del repo y `npx playwright install chromium`. En el contenedor de Claude ya están (`playwright` 1.56 en `/home/claude/.npm-global/lib/node_modules/playwright`, Chromium en `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`): no correr `playwright install`; se apuntan con `PLAYWRIGHT_DIR=/home/claude/.npm-global/lib` y `CHROME=<ruta>`.
- **Los archivos del repo**: `index.html`, `app.js`, `styles.css`, `config.js`, `sw.js`, `_headers`, `manifest.json`, `assets/`, `data/`. Se traen de la carpeta vinculada (`device_stage_files`) a una carpeta de trabajo, p. ej. `/home/claude/verif/`.
- **Leaflet 1.9.4 local**: desde el 14-sep-2026 (B13) es parte del sitio, en `vendor/` de la raíz (`leaflet.js`, `leaflet.css`; el `.css` normalizado a LF por `.gitattributes`, con su hash SRI recalculado en `index.html`). El arnés lo sirve como cualquier archivo del repo. Si hiciera falta reponerlos: `npm pack leaflet@1.9.4` (cdnjs y unpkg no se alcanzan desde el contenedor).
- **No hace falta red** para nada más: el CSV del Sheet, las teselas y los GeoJSON se sirven desde el arnés.

## 2. Servidor
Servidor estático del propio arnés, puerto 8897 (`PUERTO=…` para cambiarlo, en el servidor y en los scripts):
```
setsid nohup node pendientes/arnes/srv.mjs > /dev/null 2>&1 &
```
Sirve la raíz del repo sin caché. Si un script falla con `ERR_CONNECTION_REFUSED`, el servidor murió: relanzarlo con la misma línea (el `setsid nohup` evita que muera al terminar la llamada de shell).

Para las pruebas de Cloudflare Access se usa **otro** servidor (§ 6), porque las rutas de Playwright no interceptan las peticiones que hace el Service Worker.

## 3. Intercepción de red (patrón de todos los scripts)
Cada script abre Chromium y registra `ctx.route('**/*', …)` con estas reglas, en este orden:

| Petición | Respuesta |
|---|---|
| `http://localhost:8897/...` | `continue()` (archivos reales) |
| `leaflet.js` / `leaflet.css` | `vendor/` de la raíz del repo (mapas reales; se sirve solo) — o `fixtures/leaflet-stub.js` y CSS vacío (solo arranque, sin mapas) |
| `docs.google.com` (CSV del Sheet) | `fixtures/inventario_real_2026-09-12.csv` (66 filas reales, columnas del Sheet) o `fixtures/inventario.csv` (66 sintéticas) |
| `basemaps.cartocdn` / `arcgisonline` (teselas) | PNG 256×256 generado en memoria, **con `Access-Control-Allow-Origin: *`** (desde v67 las teselas se piden con `crossOrigin`; sin la cabecera el mapa no pinta) |
| `*.geojson` | el archivo de `data/` con ese nombre; si no existe, `FeatureCollection` vacía |
| `fonts.googleapis.com` | CSS vacío |
| todo lo demás | `abort()` |

`fixtures/leaflet-stub.js` es un Proxy que acepta cualquier llamada a `L.*` sin hacer nada; sirve para probar arranque, navegación, filtros y tabla cuando no interesa el mapa. **No verifica mapas**: para eso, Leaflet real.

Perfiles usados: iPhone 390×844 (dpr 3, `isMobile`, `hasTouch`, UA de Safari), Android 412×915, laptop 1366×768, escritorio 1920×1080. En móvil hay que pasar `hasTouch:true` o los gestos táctiles (`_gestosTactilesIncrustado`) no se activan.

## 4. Scripts incluidos en `pendientes/arnes/`
- **`_comun.mjs`** — rutas respecto a la raíz del repo, carga de Playwright (local o `PLAYWRIGHT_DIR`), Leaflet local, CSV, capas de `data/`, tesela con CORS y el enrutado estándar. **`srv.mjs`** — servidor estático.
- **`aud360.mjs`** — auditoría automática en los 4 perfiles: arranque (ms, errores de página, avisos de consola), recorrido de todos los destinos y subfiltros midiendo desbordamiento horizontal, elementos fuera del viewport, objetivos táctiles < 40 px, textos truncados, botones sin nombre accesible, imágenes sin `alt` y contraste aproximado; cuatro flujos de «¿Dónde estoy?» por coordenada (urbano, ANP con PM en coadministración, SC + PGOEDF, doble cobertura), ficha desde el resultado, generación de la imagen para compartir y cierre con Escape. Escribe `aud360.json` y un resumen en consola. Correr: `node pendientes/arnes/aud360.mjs` desde cualquier carpeta (unos 3 min).
- **`filtros.mjs`** — con el doble de Leaflet y el CSV sintético: qué filtros quedan visibles en cada subconjunto (regla de redundancia).
- **`srv-acceso.mjs` + `acceso.mjs`** — simulación de sesión de Access (§ 6).

Los demás scripts de la sesión (unos 130: `chips`, `gesto2`, `fsbtn`, `arctab`, `barra`, `scrolls`, `cap`, `chipscroll`, `inert3/4`…) fueron pruebas puntuales de cada entrega; siguen el mismo patrón y no vale la pena conservarlos. Uno nuevo se escribe en 20 líneas importando `enrutar()`, `playwright()` y `lanzar()` de `_comun.mjs` (ese módulo ya trae el bloque de rutas del § 3).

## 5. Qué probar en cada entrega (lista mínima)
1. `node --check app.js` y `node --check sw.js`; CSS con `tinycss2` (0 errores).
2. `aud360.mjs` en los cuatro perfiles: cero `pageerror`; sin scroll horizontal en ningún destino; sin objetivos táctiles nuevos < 40 px.
3. Invariantes: `#metaCount` = 66; chips 13/26/18/9; ARCAC 30 y Zona Patrimonio nunca alteran esos contadores.
4. Ficha: abre desde tabla, desde mapa y desde resultado de ubicación; `#dr` pierde `inert` al abrir (observer) y el cuerpo lleva `pagina-bloqueada` en móvil; Escape cierra; el asa de la hoja sube, nunca cierra.
5. Mapas incrustados en móvil: `touch-action: pan-x pan-y` en reposo, `.btn-ampliar` presente, `.sia-fs` al ampliar; mapa del shell con `.mapa-gesto-total`.
6. Service Worker: instala con red → bump de `CACHE_VERSION` sin red (la caché nueva queda vacía y **no** se purga la vieja; la página arranca desde la anterior) → vuelve la red: **desde v67** la primera navegación dispara `repararSiIncompleta()`, que completa la caché nueva, purga la anterior y muestra «Nueva versión disponible…» (hasta v66 esto NO ocurría: la caché nueva quedaba vacía hasta el siguiente bump; auditoría 13-sep-2026, D7-01). **No se simula con `ctx.route`**: las rutas de Playwright no ven las peticiones del SW. Se prueba con un servidor propio que corta la red por bandera (`.caida` → toda petición salvo `sw.js` se destruye; `.caida-total` → también `sw.js`) y un contexto con `serviceWorkers:'allow'`; el guion está en `pendientes/auditoria-360-2026-09-13.md` (D7) y sus scripts `srv-sw.mjs` / `t_sw.mjs` en el arnés de esa auditoría.
7. `_headers`: cada origen que realmente se pide (ver `peticiones` en `aud360.json`) está en la CSP; `frame-ancestors 'self'`.
8. **CSP sobre el Service Worker** (incidente del 14-sep-2026): `_headers` manda la CSP también con `sw.js`, y la CSP de un worker gobierna sus `fetch()`. Todo host que el SW pida (Leaflet, fuentes, teselas, Sheet) debe estar en `connect-src`. Se prueba levantando el servidor del SW con la cabecera real —`CSP_SRC=_headers node srv-sw.mjs`— y comprobando que, con la página controlada por el SW, `typeof L === 'object'` y las hojas externas responden 200 (no 503). El arnés no lo detecta con `ctx.route`: las rutas no ven las peticiones del SW.

## 6. Simulación de Cloudflare Access
Playwright no intercepta las peticiones del Service Worker, así que la expiración de sesión se simula en el servidor: `srv-acceso.mjs` (puerto 8898) responde **302 a `cloudflareaccess.com`** —igual que Access— para `?sesion=`, `?entrar=` y `pgoedf.geojson` mientras exista el archivo `.expirada`; sin él, sirve normal.
```
setsid nohup node pendientes/arnes/srv-acceso.mjs > /dev/null 2>&1 &
node pendientes/arnes/acceso.mjs
```
La bandera `.expirada` se crea en la raíz del repo (los scripts la resuelven solos).
`acceso.mjs` comprueba, en orden: el SW se registra y controla la página; con sesión válida el sondeo `sw.js?sesion=` devuelve `basic 200` y no hay reentrada; al crear `.expirada` y disparar `visibilitychange`, `_verificarSesion()` recibe `opaqueredirect` y la página navega a Access con `?entrar=`; y con la sesión expirada una capa bajo demanda devuelve 401 desde el SW y avisa (`sesion-expirada`) → reentrada. Resultado esperado: `navegó a Access: true` en los dos casos y `errores: []`.

Verificación real complementaria (desde el Chrome del usuario): abrir `https://sedema-sia.cloudflareaccess.com/cdn-cgi/access/logout` y luego `sia.contactoverde.com`: la copia cacheada carga y en ≤ 4 s redirige al login sola.

## 7. Producción
El contenedor no alcanza `sia.contactoverde.com` (Cloudflare Access) ni `github.io` (proxy). Lo que se verifica en producción se hace desde el Chrome del usuario (Claude in Chrome): `sw.js` muestra el `CACHE_VERSION` publicado; `getRegistrations()` y `caches.keys()` en consola dicen qué versión sirve el navegador; desde v69 el propio pie del tablero muestra «Versión del tablero». Ojo: si la sesión de Access expiró, la extensión bloquea la URL de retorno del login (`/cdn-cgi/access/authorized?…`, la trata como token) y Chrome muestra `ERR_FAILED`; en ese caso se entra a mano en una ventana de incógnito y se repite.

## 8. Fuentes de verdad al auditar
Antes de reportar un hallazgo, contrastar con `claude/pendientes.md` (lo abierto), la última `claude/auditoria-360-*.md` (lo ya revisado) y `CLAUDE.md` del repo (reglas e invariantes). Un hallazgo repetido no aporta; uno que contradiga una regla de `CLAUDE.md` debe decirlo explícitamente.
