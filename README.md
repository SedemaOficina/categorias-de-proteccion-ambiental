# Sistema de Información Ambiental · Categorías de Protección Ambiental · CDMX

**Tablero institucional de las 66 áreas de protección ambiental de la Ciudad de México** —39 Áreas de Valor Ambiental (13 Bosques Urbanos + 26 Barrancas) y 27 Áreas Naturales Protegidas (18 locales + 9 federales)— con polígonos oficiales, fichas técnicas, zonificación de programas de manejo, ordenamiento ecológico (PGOEDF), marco jurídico y diagnóstico de ubicación en campo.

> **Sitio:** <https://sia.contactoverde.com> · Secretaría del Medio Ambiente · Gobierno de la Ciudad de México

---

## 1. Qué hace

- **Inventario.** Tabla filtrable y mapa de las 66 áreas, con ficha por área: superficie, decreto, programa de manejo, DG responsable, Suelo de Conservación, coadministración con la Federación, documentos oficiales y fundamento jurídico.
- **¿Dónde estoy?** Diagnóstico por punto (GPS, coordenada, dirección o liga de Google Maps): en qué áreas cae, régimen de Suelo de Conservación, zona del programa de manejo en ese punto, zona del PGOEDF con su catálogo de actividades permitidas y prohibidas (117), y área más cercana cuando no cae en ninguna.
- **Zonificación.** Tabla y capa de la zonificación de los programas de manejo publicados en formato geoespacial (siete ANP hoy), y cruce de cada área en Suelo de Conservación con el PGOEDF 2000.
- **Capas complementarias**, aisladas del inventario y de sus conteos: Zona Patrimonio (UNESCO, Ramsar 1363, AICA 37, SIPAM FAO), ARCAC (30 núcleos agrarios), traslapes precalculados.
- **Analítica.** Cronología de decretos, cobertura de programas de manejo, brechas por grupo, comparativo por administración, marco jurídico con PDFs.
- **Imagen compartible** de cada ficha (PNG 1080×1440 generado en el navegador) con mapa base, capas encendidas, punto consultado y datos duros.
- **Imagen de la consulta de ubicación**: imagen compartible del diagnóstico por punto (coordenada, fecha y hora, coberturas, régimen, zonas PM y PGOEDF). Es informativa, sin validez legal, y así lo dice la propia imagen.
- **Instalable como app** (PWA) en iPhone y Android, con operación offline mediante Service Worker con caché versionada.

Público objetivo: personal de la Secretaría en campo (celular) y en oficina (escritorio). **Desde el 13 de septiembre de 2026 el sitio está detrás de Cloudflare Access**: exige iniciar sesión (código de un solo uso al correo o cuenta de Google) y solo entran los correos dados de alta en la política (ver `pendientes/altas-acceso.md`). El tablero arranca desde la caché del Service Worker y, si la sesión expiró, detecta la redirección y manda al login solo.

## 2. Estructura del repositorio

```
categorias-de-proteccion-ambiental/
├── index.html            ← marcado; carga styles.css, config.js y app.js
├── styles.css            ← toda la hoja de estilos
├── app.js                ← toda la lógica (un solo IIFE, sin módulos ES)
├── config.js             ← window.SIA_CONFIG (llave pública de Google Maps)
├── sw.js                 ← Service Worker · CACHE_VERSION · CORE_ASSETS
├── manifest.json         ← instalable como app (iconos en assets/icon-*.png)
├── _headers              ← cabeceras HTTP (Cloudflare) · seguridad y CSP
├── .assetsignore         ← qué NO se publica (tools, CLAUDE.md, README, _borrar…)
├── wrangler.jsonc        ← despliegue en Cloudflare Workers (assets estáticos)
├── CLAUDE.md             ← reglas del proyecto para el asistente de código
├── assets/               ← logo, favicon, apple-touch-icon, og-image
├── tools/traslapes.py    ← regenera data/traslapes.geojson
├── pendientes/           ← lista viva de pendientes, cortes de verificación y el arnés de pruebas (no se publica)
├── .editorconfig · .gitattributes ← LF y UTF-8 en el editor y en git
├── .github/workflows/validar.yml  ← CI: sintaxis de app.js/sw.js/config.js/inline/CSS, bump de versión en push, GeoJSON 2D-4326, invariante 66, contrato de columnas
└── data/
    ├── inventario.csv               ← respaldo del Sheet (arranque sin red)
    ├── geometrias.geojson           ← 66 polígonos del inventario
    ├── alcaldias.geojson · suelo_conservacion.geojson
    ├── zona_patrimonio.geojson · sipam_fao.geojson · arcac.geojson · traslapes.geojson
    ├── embarcaderos.geojson         ← vacío hasta contar con el padrón
    ├── pgoedf.geojson               ← zonas del PGOEDF 2000 sin la zona ANP (523 polígonos)
    ├── pgoedf_actividades.json      ← 117 actividades × 8 claves de zona
    ├── pgoedf_areas.json            ← cruce PGOEDF × poligonal de cada área
    ├── zonificacion/                ← index.json + un GeoJSON por ANP con zonificación
    └── normativa/                   ← PDFs citados desde el tablero
```

## 3. Datos

### 3.1 Inventario · Google Sheet (fuente única de verdad)

El inventario tabular vive en un Google Sheet publicado como CSV; el tablero lo lee al arrancar y, si no responde, usa `data/inventario.csv`. Cualquier corrección de captura se hace **en el Sheet** y no requiere despliegue. Columnas: `id`, `nombre`, `grupo`, `categoria`, `alcaldia`, `fecha_decreto`, `fecha_decreto_iso`, `superficie`, `programa_manejo`, `fecha_pm`, `fecha_pm_iso`, `suelo_conservacion_pct`, `dg_responsable`, `url_pdf_decreto`, `url_gaceta_decreto`, `url_pdf_pm`, `url_gaceta_pm`.

`suelo_conservacion_pct` es el porcentaje de la poligonal dentro del Suelo de Conservación (cruce geométrico); el tablero lo traduce a *Dentro / Parcial / Fuera*.

### 3.2 Reglas que no se rompen

- **66 = 13 + 26 + 18 + 9.** El tablero lo verifica al arrancar y avisa si el Sheet, el respaldo o las geometrías se desvían.
- El join Sheet ↔ geometría es por `nombre` **exacto**. Nombre canónico: «Tempiluli».
- Los módulos complementarios (Zona Patrimonio, SIPAM, ARCAC, embarcaderos, zonificación, PGOEDF) **nunca** entran al inventario ni a sus contadores.
- Todo GeoJSON en EPSG:4326, 2D, geometrías válidas (`buffer(0)`).
- Puede haber áreas con programa de manejo sin archivo de zonificación; nunca un archivo de zonificación para un área sin programa de manejo.

### 3.3 Regenerar derivados

- `data/traslapes.geojson`: `python tools/traslapes.py` cuando cambien geometrías, ARCAC o Zona Patrimonio.
- `data/pgoedf_areas.json`: cruce de las 66 poligonales contra `pgoedf.geojson` en EPSG:6372 (cuando cambien geometrías o el PGOEDF).

## 4. Despliegue

Cloudflare Workers sirve el repositorio como assets estáticos (`wrangler.jsonc`, sin build). Flujo:

1. Editar los archivos.
2. `node --check app.js` y **bumpear `CACHE_VERSION` en `sw.js`** (`sia-v35-AAAA-MM-DD<letra>`). Sin el bump el Service Worker sigue sirviendo la versión anterior.
3. Commit y push a `main` (GitHub Desktop). Cloudflare despliega.
4. **Purge Everything** en Cloudflare y comprobar en el sitio que `sw.js` muestre la versión nueva.

El CI (`validar.yml`) corre en cada push a `main` y en cada pull request: rechaza sintaxis inválida en `app.js`, `sw.js`, `config.js`, el script inline de `index.html` y `styles.css`; exige el bump de `CACHE_VERSION` cuando cambia cualquier archivo servido desde caché (`index.html`, `styles.css`, `app.js`, `config.js`, `sw.js`, `manifest.json`, `data/**`); valida que los GeoJSON sean JSON, 2D y lon/lat; y comprueba el invariante de 66 en `geometrias.geojson` y en `data/inventario.csv`, las 17 columnas del respaldo y que todo nombre del respaldo tenga polígono. Las pruebas de comportamiento (Playwright) viven en `pendientes/arnes/` (ver su `README.md`) y se corren a mano antes de cada entrega.

El pie del tablero muestra la versión instalada («Versión del tablero»), que es el `CACHE_VERSION` del Service Worker que controla ese navegador: es lo que hay que reportar cuando algo se ve distinto en dos aparatos.

Las capas pesadas (`pgoedf`, `sipam_fao`, `arcac`, `traslapes`, zonificaciones) no van en `CORE_ASSETS`: se piden bajo demanda y se cachean en tiempo de ejecución.

## 5. Servicios externos

- **Leaflet 1.9.4**, alojado en `vendor/` del propio sitio (desde v73; antes unpkg) y cargado con SRI; instalado por el Service Worker con el núcleo, así que el mapa arranca sin red desde la primera visita. Teselas: CARTO Positron y Esri World Imagery, pedidas con `crossOrigin` para que el Service Worker pueda cachearlas (hasta 600 entradas). La URL de Positron lleva una llave de CARTO (`?key=…` en `TILE_LAYERS.positron.url`, `app.js`); los basemaps gratuitos de CARTO no la exigen y no está documentado de qué cuenta cuelga: si algún día las teselas dejan de cargar, lo primero es probar la misma URL sin `?key=`.
- **Google Maps JavaScript API + Places API (New)** para direcciones (autocompletado con token de sesión, desde 3 caracteres). La llave es de navegador, pública por diseño; lo que la protege son las restricciones por sitio y las cuotas en Google Cloud.
- **Google Fonts**: Roboto, Roboto Mono, Cabin.

## 6. Identidad

Paleta institucional: guinda `#9d2148`, dorado `#b28e5c`, gris `#55585a`. Tipografía: Cabin para títulos, Roboto para cuerpo, Roboto Mono para etiquetas y cifras.

Colores de capa: Bosque Urbano `#027a35` · Barranca `#ac6d14` · ANP Local `#f08217` · ANP Federal `#266cb4` · Suelo de Conservación `#00838f` · ARCAC `#7048e8` · Zona Patrimonio: UNESCO `#444441`, Ramsar `#1d9e75`, AICA `#d9a400`, SIPAM `#6b7a2f`. La coadministración con la Federación se dibuja como achurado sobre el propio azul federal, no como color aparte.

## 7. Uso institucional

Los límites, superficies y demás datos tienen fines informativos y de consulta; no constituyen deslinde catastral ni sustituyen los decretos, programas de manejo u otros instrumentos jurídicos vigentes, que prevalecen en caso de discrepancia.
