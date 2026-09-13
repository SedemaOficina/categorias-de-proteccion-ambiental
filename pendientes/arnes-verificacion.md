# Arnés de verificación del SIA Dashboard

Cómo levantar, en cualquier chat del Proyecto, el entorno con el que se validan las entregas (v38–v65). Los scripts viven en `pendientes/arnes/` del repo (no se publican: `.assetsignore` excluye `pendientes`). Escrito el 13 de septiembre de 2026.

## 1. Qué se necesita y qué no
- **Node ≥ 18 y Playwright** con Chromium. En el contenedor de Claude ya están: `playwright` 1.49 en `/home/claude/.npm-global/lib/node_modules/playwright` y Chromium en `/opt/pw-browsers/chromium-*/chrome-linux/chrome` (no correr `playwright install`; si la ruta cambia, `export CHROME=<ruta>`).
- **Los archivos del repo**: `index.html`, `app.js`, `styles.css`, `config.js`, `sw.js`, `_headers`, `manifest.json`, `assets/`, `data/`. Se traen de la carpeta vinculada (`device_stage_files`) a una carpeta de trabajo, p. ej. `/home/claude/verif/`.
- **Leaflet 1.9.4 local** (`vendor/leaflet.js`, `vendor/leaflet.css`): el contenedor no alcanza `unpkg.com`; se descarga de cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js` y `leaflet.css`). Sin él, los mapas no se pintan y se usa el doble (§ 3).
- **No hace falta red** para nada más: el CSV del Sheet, las teselas y los GeoJSON se sirven desde el arnés.

## 2. Servidor
Servidor estático simple en el puerto 8897:
```
cd /home/claude/verif && setsid nohup python3 -m http.server 8897 > /dev/null 2>&1 &
```
Si un script falla con `ERR_CONNECTION_REFUSED`, el servidor murió: relanzarlo con la misma línea (el `setsid nohup` evita que muera al terminar la llamada de shell).

Para las pruebas de Cloudflare Access se usa **otro** servidor (§ 6), porque las rutas de Playwright no interceptan las peticiones que hace el Service Worker.

## 3. Intercepción de red (patrón de todos los scripts)
Cada script abre Chromium y registra `ctx.route('**/*', …)` con estas reglas, en este orden:

| Petición | Respuesta |
|---|---|
| `http://localhost:8897/...` | `continue()` (archivos reales) |
| `leaflet.js` / `leaflet.css` | `vendor/` (mapas reales) — o `fixtures/leaflet-stub.js` y CSS vacío (solo arranque, sin mapas) |
| `docs.google.com` (CSV del Sheet) | `fixtures/inventario_real_2026-09-12.csv` (66 filas reales, columnas del Sheet) o `fixtures/inventario.csv` (66 sintéticas) |
| `basemaps.cartocdn` / `arcgisonline` (teselas) | PNG 256×256 generado en memoria |
| `*.geojson` | el archivo de `data/` con ese nombre; si no existe, `FeatureCollection` vacía |
| `fonts.googleapis.com` | CSS vacío |
| todo lo demás | `abort()` |

`fixtures/leaflet-stub.js` es un Proxy que acepta cualquier llamada a `L.*` sin hacer nada; sirve para probar arranque, navegación, filtros y tabla cuando no interesa el mapa. **No verifica mapas**: para eso, Leaflet real.

Perfiles usados: iPhone 390×844 (dpr 3, `isMobile`, `hasTouch`, UA de Safari), Android 412×915, laptop 1366×768, escritorio 1920×1080. En móvil hay que pasar `hasTouch:true` o los gestos táctiles (`_gestosTactilesIncrustado`) no se activan.

## 4. Scripts incluidos en `pendientes/arnes/`
- **`aud360.mjs`** — auditoría automática en los 4 perfiles: arranque (ms, errores de página, avisos de consola), recorrido de todos los destinos y subfiltros midiendo desbordamiento horizontal, elementos fuera del viewport, objetivos táctiles < 40 px, textos truncados, botones sin nombre accesible, imágenes sin `alt` y contraste aproximado; cuatro flujos de «¿Dónde estoy?» por coordenada (urbano, ANP con PM en coadministración, SC + PGOEDF, doble cobertura), ficha desde el resultado, generación de la imagen para compartir y cierre con Escape. Escribe `aud360.json` y un resumen en consola. Correr: `node aud360.mjs` (unos 3 min).
- **`filtros.mjs`** — con el doble de Leaflet y el CSV sintético: qué filtros quedan visibles en cada subconjunto (regla de redundancia).
- **`srv-acceso.mjs` + `acceso.mjs`** — simulación de sesión de Access (§ 6).

Los demás scripts de la sesión (unos 130: `chips`, `gesto2`, `fsbtn`, `arctab`, `barra`, `scrolls`, `cap`, `chipscroll`, `inert3/4`…) fueron pruebas puntuales de cada entrega; siguen el mismo patrón y no vale la pena conservarlos. Uno nuevo se escribe en 20 líneas copiando el bloque de rutas del § 3.

## 5. Qué probar en cada entrega (lista mínima)
1. `node --check app.js` y `node --check sw.js`; CSS con `tinycss2` (0 errores).
2. `aud360.mjs` en los cuatro perfiles: cero `pageerror`; sin scroll horizontal en ningún destino; sin objetivos táctiles nuevos < 40 px.
3. Invariantes: `#metaCount` = 66; chips 13/26/18/9; ARCAC 30 y Zona Patrimonio nunca alteran esos contadores.
4. Ficha: abre desde tabla, desde mapa y desde resultado de ubicación; `#dr` pierde `inert` al abrir (observer) y el cuerpo lleva `pagina-bloqueada` en móvil; Escape cierra; el asa de la hoja sube, nunca cierra.
5. Mapas incrustados en móvil: `touch-action: pan-x pan-y` en reposo, `.btn-ampliar` presente, `.sia-fs` al ampliar; mapa del shell con `.mapa-gesto-total`.
6. Service Worker: instala con red → bump de `CACHE_VERSION` sin red (la caché nueva queda vacía y **no** se purga la vieja) → vuelve la red (`repararCore` completa y purga). Se simula con `ctx.route` abortando `localhost` durante el bump.
7. `_headers`: cada origen que realmente se pide (ver `peticiones` en `aud360.json`) está en la CSP; `frame-ancestors 'self'`.

## 6. Simulación de Cloudflare Access
Playwright no intercepta las peticiones del Service Worker, así que la expiración de sesión se simula en el servidor: `srv-acceso.mjs` (puerto 8898) responde **302 a `cloudflareaccess.com`** —igual que Access— para `?sesion=`, `?entrar=` y `pgoedf.geojson` mientras exista el archivo `.expirada`; sin él, sirve normal.
```
cd /home/claude/verif && setsid nohup node srv-acceso.mjs > /dev/null 2>&1 &
node acceso.mjs
```
`acceso.mjs` comprueba, en orden: el SW se registra y controla la página; con sesión válida el sondeo `sw.js?sesion=` devuelve `basic 200` y no hay reentrada; al crear `.expirada` y disparar `visibilitychange`, `_verificarSesion()` recibe `opaqueredirect` y la página navega a Access con `?entrar=`; y con la sesión expirada una capa bajo demanda devuelve 401 desde el SW y avisa (`sesion-expirada`) → reentrada. Resultado esperado: `navegó a Access: true` en los dos casos y `errores: []`.

Verificación real complementaria (desde el Chrome del usuario): abrir `https://sedema-sia.cloudflareaccess.com/cdn-cgi/access/logout` y luego `sia.contactoverde.com`: la copia cacheada carga y en ≤ 4 s redirige al login sola.

## 7. Producción
El contenedor no alcanza `sia.contactoverde.com` (robots) ni `github.io` (proxy). Lo que se verifica en producción se hace desde el Chrome del usuario (Claude in Chrome): `sw.js` muestra el `CACHE_VERSION` publicado; `getRegistrations()` y `caches.keys()` en consola dicen qué versión sirve el navegador.

## 8. Fuentes de verdad al auditar
Antes de reportar un hallazgo, contrastar con `claude/pendientes.md` (lo abierto), la última `claude/auditoria-360-*.md` (lo ya revisado) y `CLAUDE.md` del repo (reglas e invariantes). Un hallazgo repetido no aporta; uno que contradiga una regla de `CLAUDE.md` debe decirlo explícitamente.
