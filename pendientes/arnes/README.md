# Arnés de verificación · SIA Dashboard

Pruebas automatizadas con Playwright (Chromium) contra la copia local del repo, **sin red**: Leaflet se sirve desde `vendor/` de la raíz (propio del sitio desde B13), el inventario desde `fixtures/`, las teselas son sintéticas y todo lo demás se aborta. Reproducible desde cualquier carpeta: los scripts resuelven sus rutas respecto a la raíz del repo (`_comun.mjs`).

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
| `filtros.mjs` | Filtros visibles/ocultos y columnas por subconjunto (usa el stub de Leaflet, no el real). |
| `acceso.mjs` + `srv-acceso.mjs` | Detección de sesión expirada de Cloudflare Access (sondeo `?sesion=` y aviso del SW). |
| `fixtures/` | `inventario_real_2026-09-12.csv` (copia del Sheet), `inventario.csv` (mínimo), `leaflet-stub.js`. |

## 4. Reglas

- Las teselas se responden **con** `Access-Control-Allow-Origin: *`: desde v67 las capas se piden con `crossOrigin`, y sin la cabecera el mapa no pinta.
- Los scripts no dependen de la carpeta desde la que se ejecutan ni de rutas de una máquina concreta; si uno nuevo lo hace, corrígelo antes de guardarlo aquí.
- El Service Worker se prueba con un servidor propio y corte de red por bandera (las rutas de Playwright no ven las peticiones del SW); ese escenario está descrito en `claude/arnes-verificacion.md` § 5.6 y en la auditoría del 13-sep-2026 (D7-01).
- Lo que el arnés no ve —teselas reales, fuentes, Google Places, el SW en producción, Cloudflare Access real— se comprueba en el navegador tras la purga.
