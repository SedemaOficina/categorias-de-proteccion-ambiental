# CLAUDE.md · Sistema de Información Ambiental (SIA) · SEDEMA CDMX

Reglas del proyecto para el asistente de código. Vigente desde el 13 de septiembre de 2026 (v53). La versión anterior, con el historial de decisiones de agosto y principios de septiembre, quedó en `_borrar/CLAUDE-2026-09-11.md`; el detalle de cada auditoría vive en los documentos del Proyecto de Claude (`claude/*.md`).

## Qué es
Tablero público de las 66 áreas de protección ambiental de la CDMX. Público objetivo: personal de SEDEMA en campo (celular) y en oficina (escritorio). Producción: **https://sia.contactoverde.com** en Cloudflare Workers (assets estáticos). Repo: `SedemaOficina/categorias-de-proteccion-ambiental`. GitHub Pages está apagado.

## Arquitectura (desde v44)
- **Cuatro archivos, sin build ni framework:** `index.html` (marcado), `styles.css`, `app.js` (un solo IIFE; no es módulo ES) y `config.js` (`window.SIA_CONFIG.GOOGLE_MAPS_API_KEY`). El orden de carga es `config.js` → `app.js`.
- **`config.js` nunca se reescribe en las entregas**: contiene la llave. Si hace falta cambiarla, se edita esa línea y nada más.
- `sw.js` en la raíz (su ámbito es la carpeta desde la que se sirve). `CORE_ASSETS` instala `./`, `index.html`, `styles.css`, `app.js`, `config.js`, logo, favicon, `data/inventario.csv`, `data/zonificacion/index.json`, `data/pgoedf_areas.json`. Nada pesado ahí.
- Sin `?v=` en las URLs de los assets: Cloudflare ignora la query; la coherencia la da la caché por versión del SW.
- `_headers`: cabeceras de seguridad (nosniff, Referrer-Policy, Permissions-Policy, HSTS, COOP y la misma CSP que `index.html` lleva en `<meta>`; `frame-ancestors` pendiente de decisión).
- **PWA:** `manifest.json` (standalone, atajos «¿Dónde estoy?» e «Inventario») + iconos en `assets/icon-*.png`; el SW responde navegaciones con query desde `index.html` cacheado (`ignoreSearch`). `.assetsignore`: `tools`, `CLAUDE.md`, `README.md`, `_borrar`, `wrangler.jsonc`, dotfiles.
- Datos en `data/`. Inventario en vivo desde el Google Sheet (CSV publicado); respaldo en `data/inventario.csv`.

## Invariantes que nunca se rompen
- **66 = 13 Bosque Urbano + 26 Barranca + 18 ANP Local + 9 ANP Federal.** `verificarInventario()` lo comprueba al arrancar (Sheet, respaldo, geometrías, índice de zonificación) y pinta el aviso `#avisoIntegridad`.
- Join Sheet ↔ geometría por `nombre` **exacto** (Set / igualdad estricta, nunca `includes()`). Nombre canónico: «Tempiluli».
- Módulos complementarios —Zona Patrimonio, SIPAM, embarcaderos, ARCAC, zonificación, PGOEDF— viven en sus propios archivos y **nunca** entran a `DATA` ni a `GEOMETRIES` ni a contadores o filtros. Excepción de lectura: `_coberturasEn()` los consulta como lectura espacial pura.
- **Regla de la zonificación:** puede haber área con programa de manejo sin archivo de zonificación; nunca archivo de zonificación para un área sin programa. `_alertasZonificacion` lo vigila.
- **Tolerancia cartográfica de Suelo de Conservación:** `SC_TOLERANCIA_PCT = 5`. Debajo de 5 % el área se lee «Fuera» y la ficha añade «colinda con él»; el Sheet conserva el porcentaje real. Fundamento: las tres áreas bajo ese umbral (Atzoyapan, Pachuquilla, Magdalena Eslava) traslapan franjas de 1–18 m pegadas al límite del SC; el primer caso sustantivo (Lomas de Padierna, 11.83 %) penetra ~400 m. Ver `claude/sc-parciales-b5.md`.
- El PGOEDF solo aplica **fuera de ANP**; dentro rige el programa de manejo. La cartografía `pgoedf.geojson` trae las ANP anteriores al Programa como zona propia sin ordenamiento: por eso esas áreas salen con cobertura ~0 y la ficha lo dice así.

## Datos geoespaciales
- Todo GeoJSON en EPSG:4326 y 2D. Insumos en UTM 14N (32614) o LCC México (6372) → reproyectar antes de integrar. Validar con `buffer(0)` (los siete rasgos inválidos históricos se repararon el 12-sep-2026).
- `findGeometry(d)` devuelve un **Feature**; desenvolver con `.geometry` si se necesita la geometría cruda.
- Derivados: `tools/traslapes.py` regenera `traslapes.geojson`; `pgoedf_areas.json` se recalcula con shapely en 6372 cuando cambien geometrías o PGOEDF.

## Reglas de despliegue (obligatorias en cada entrega)
1. `node --check app.js` (y `sw.js` si cambió). CSS: 0 errores de sintaxis.
2. **Bumpear `CACHE_VERSION` en `sw.js`** (`sia-v35-AAAA-MM-DD<letra>`).
3. Decir qué archivos subir. El push lo hace la persona con GitHub Desktop; después **Purge Everything** en Cloudflare y comprobar `sw.js` en vivo.
4. La copia local está en LF (`.gitattributes`); escribir los archivos en LF.
5. **Nunca borrar archivos de la carpeta local:** lo que sobre se mueve a `_borrar/` (ignorada por git) y se avisa.

## Seguridad y calidad
- Texto libre del Sheet → `esc()` antes de `innerHTML`.
- Leaflet con SRI (`integrity` + `crossorigin`): no quitarlo.
- Sin `alert()`: `siaToast(msg, duracion)`.
- Ediciones quirúrgicas; nunca reescribir un archivo completo.
- Elementos con `hidden` cuya clase declara `display:flex|grid`: añadir `.clase[hidden]{display:none !important}` (ya pasó tres veces).
- El Service Worker se registra al final del arranque asíncrono: si `document.readyState === 'complete'` se registra de inmediato; nunca depender solo del evento `load`.
- **Cloudflare Access (desde 13-sep-2026):** el sitio exige inicio de sesión (Zero Trust, team `sedema-sia`, política por lista de correos, código de un solo uso). El tablero arranca desde caché, así que la sesión expirada se detecta en dos puntos: sondeo `./sw.js?sesion=` con `redirect:'manual'` (al arrancar y al volver a la pestaña) y aviso `{tipo:'sesion-expirada'}` del SW cuando un recurso propio recibe `opaqueredirect`. Ambos navegan a `./?entrar=`, que el SW sirve desde la red (fallback a caché sin conexión: quien ya se autenticó conserva el tablero offline). Nunca usar imágenes de `sia.contactoverde.com` en la pantalla de login (está detrás del login).
- **Cajón de ficha (`#dr`) e `inert`:** cerrado lleva `inert`; un `MutationObserver` sobre la clase `open` lo retira, pone `aria-modal`, aísla `.wrap` y enfoca `#drClose` para **cualquier** abridor (inventario, ARCAC, Zona Patrimonio, embarcaderos). No abrir el cajón por otra vía que `classList.add('open')`; no gestionar `inert` a mano en los abridores.
- **Mapas en táctil (regla única, `_gestosTactilesIncrustado`):** todo mapa incrustado en una página u hoja que se desplaza nace dormido (`.mapa-en-reposo`, `touch-action: pan-x pan-y`, arrastre de Leaflet apagado): un dedo desplaza la página en cualquier ángulo, dos dedos mueven y acercan el mapa (touchZoom), y el botón «Ampliar» (`.btn-ampliar`, bajo el de capas) lo lleva a pantalla completa —nativa o simulada con `.sia-fs`, porque iPhone no tiene Fullscreen API— donde un dedo arrastra. La simulada saca el lienzo a `<body>` con `_siaFsPortal` (marcador `.sia-fs-ph` para regresarlo) porque `position:fixed` no escapa del `transform` de la hoja `#dr`; `siaFsSalirTodo()` lo restaura al cerrar la ficha. Excepción de gesto total (`.mapa-gesto-total`, `touch-action: none`): el mapa del caparazón de «¿Dónde estoy?» en celular. Nunca volver al «toca para activar» ni escuchar `scroll`.

## Identidad y simbología
- Paleta: guinda `#9d2148`, dorado `#b28e5c`, gris `#55585a`. Cabin para títulos (también `.drawer h2`), Roboto para cuerpo, Roboto Mono para etiquetas y cifras. Piso tipográfico 11 px.
- El guinda es el único color de marca (activo/accionable). El estado no se codifica por matiz: `.status-tag` es punto lleno/hueco.
- Colores de capa (`GROUP_COLORS`): BU `#027a35` · Barranca `#ac6d14` · ANP Local `#f08217` · ANP Federal `#266cb4`. Para **texto pequeño** usar `GROUP_TEXT_COLORS` (`--anpl-text:#a85400`, `--br-text:#8f5610`): el naranja y el marrón no alcanzan AA como texto.
- Jerarquía cartográfica (líneas px / relleno): alcaldías 1 discontinua / 0 · Suelo de Conservación 1.25 discontinua / .12 · inventario 1.75 / .20 (hover 3 / .38) · ARCAC 1.25 / .30 · Zona Patrimonio designaciones 2 punteada `1 5` / .10 · zonificación borde blanco 1.25 / .45 (el área pasa a relleno 0, línea 3; SC a .04) · área en ficha 2.5 / .14 · coadministración resaltada 3.5.
- Coadministración: **achurado** SVG (`#siaAchuradoCoadmin`) en el propio azul federal, no un color aparte; el resto del inventario se atenúa.
- En satélite todas las superposiciones llevan halo blanco (`.leaflet-container.base-satelite .leaflet-overlay-pane svg`), activado en `_marcarBase()`.
- Zona Patrimonio: UNESCO `#444441`, Ramsar `#1d9e75`, AICA `#d9a400`, SIPAM `#6b7a2f`. Zonificación por familia: protección `#1f6b4a`, restauración `#b28e5c`, uso público `#364fc7`, uso especial `#8f4889`, agrícola `#5d8a5e`, AHI `#55585a`.

## Componentes compartidos (no duplicar)
- **Minimapa de ficha:** `fichaMapaHTML({zonif})` + `fichaMapaConectar(container)` para inventario, ARCAC y Zona Patrimonio. Menú de capas único (`montarBotonBase`): Mapa / Satélite y sección «Capas» con zonificación (si existe) arriba de Suelo de Conservación; en celular también absorbe los chips de categoría del mapa general (`#mapFilters.en-menu`).
- **Desplazamiento (celular):** un solo elemento pegajoso arriba —la tira de chips (`nav#tabs.nav2`, top 0)—; la cápsula de búsqueda se desplaza con la página fuera del caparazón. La página de fondo se congela con `siaBloquearPagina(on, clave)` (body `position:fixed` conservando el scroll; `overflow:hidden` no basta en iOS): lo piden la ficha en celular, la guía y el caparazón de «¿Dónde estoy?». Todo contenedor con scroll propio lleva `overscroll-behavior:contain`.
- **Hoja de ficha en celular:** tres posiciones por `--dvis`; el toque simple en el asa SUBE (completa → media); cerrar solo arrastrando hacia abajo o con el ×.
- **Ficha:** cabecera fija (`.drawer-header-row`), campos `.field` (140/100 px de etiqueta), orden lógico: DG responsable → Tipo → Jurisdicción → Subcategoría → Alcaldía → Suelo de Conservación → **PGOEDF** → Decreto → Programa de manejo → Fecha PM → **Zonificación** → Coadministración → Documentos → Fundamento jurídico. Cuando viene de una ubicación, los bloques de zonificación y PGOEDF añaden «Punto consultado: …».
- **Imagen compartible:** `descInventario/descArcac/descZP` se evalúan **al hacer clic** (descriptor perezoso); dibuja base, capas encendidas (`_capasActivasFicha`), leyenda, polígono y punto; filas en el mismo orden que la ficha más `ZONA PM DEL PUNTO` y `PGOEDF DEL PUNTO`; la caja del mapa cede alto cuando hay más de 9 u 11 filas.
- **Resultado de «¿Dónde estoy?»:** una plantilla para los tres casos (dentro / Suelo de Conservación / sin cobertura); el «×» y el botón **Compartir** viven en la fila del encabezado. `compartirConstancia()` arma `descConstancia(_ubiUltimo, scFC)` (nombres internos; en pantalla e imagen nunca se dice «constancia»: es «Consulta de ubicación · informativa, sin validez legal») —coordenada como cifra grande, fecha y hora, origen y precisión, coberturas por jerarquía, PM, coadministración, zona PM y PGOEDF del punto, área más cercana, que en pantalla se rotula ANTES del nombre— y reutiliza el generador de las fichas (`d.grande`, `d.capas` explícitas, `d.soloPunto`).
- **Buscador:** placeholder como única guía; `×` dentro del campo (`--go-w`); Google desde 3 caracteres con 350 ms; coordenadas y ligas de Maps se resuelven localmente antes de llamar a Google.
- **Chips de subconjunto:** al elegir uno, el foco vuelve al chip activo, el contador `#counterLive` anuncia, en celular la tira (`nav#tabs`) queda fija arriba y la vista baja al resumen y al mapa.

## Flujos de ubicación (contrato)
Suelo urbano → chip «Suelo urbano» + área más cercana · Suelo de Conservación sin ANP → bloque PGOEDF con zona, clave y catálogo · ANP con PM → chips «Programa de manejo publicado · fecha» (+ «Coadministración con la Federación») + «Zona del programa de manejo en este punto» (o «aún no disponible en formato geoespacial») · sin PM → «Sin programa de manejo vigente» · varias coberturas → lista por jerarquía normativa + nota de concurrencia · fuera de CDMX → aviso de ámbito.

## Verificación antes de entregar
Arnés Playwright (Chromium) con doble de Leaflet, teselas sintéticas y CSV de 66 filas: `traslapes-ui` (0 pares encimados en 393 y 1500 px), `integ` (invariante y escenarios de borrado/renombre), `flujos` (4 casos), `zon`, `limpiar`, `fichas-uniformes` (misma huella en las tres fichas), `aud360` (cuatro perfiles: iPhone, Pixel, laptop, escritorio). Lo que el arnés no ve —teselas reales, fuentes, Google Places, SW en producción— se comprueba en el navegador real tras la purga.

## Pendientes y decisiones
Lista viva en **dos copias idénticas**: `pendientes/pendientes.md` (repo; carpeta versionada pero excluida del sitio por `.assetsignore`) y `claude/pendientes.md` (Proyecto de Claude). Se actualizan las dos en cada entrega. Los cortes de verificación y hallazgos (cruces con Gacetas, revisión de ligas, análisis puntuales) van en la misma carpeta con fecha en el nombre. No duplicar la lista aquí.
