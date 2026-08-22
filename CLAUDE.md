# CLAUDE.md · Sistema de Información Ambiental (SIA) · SEDEMA CDMX

Contexto y reglas del proyecto para Claude Code. Léelas antes de cualquier cambio.

## Qué es
Dashboard público de categorías de protección ambiental de la CDMX, en GitHub Pages (sitio estático, sin build). Repo: `SedemaOficina/categorias-de-proteccion-ambiental`.

## Arquitectura
- **Toda la lógica vive en `index.html`** (HTML + CSS + JS inline). No hay pipeline de build ni framework.
- `sw.js` es el Service Worker (caché offline).
- Los datos espaciales están en `data/*.geojson`. El inventario en vivo se lee de un **Google Sheet publicado como CSV** (la fuente autoritativa; el Sheet prevalece sobre valores calculados).

## Invariantes que NUNCA se rompen
- **Inventario = 66 áreas: 39 AVA (13 Bosque Urbano + 26 Barranca) + 27 ANP (18 Local + 9 Federal).** No alterar estos conteos.
- **Módulos especiales aislados:** Zona Patrimonio, SIPAM, embarcaderos y ARCAC viven en sus propios GeoJSON y NUNCA entran a `DATA` ni a `GEOMETRIES` ni afectan los contadores/filtros del inventario.
  - **Excepción explícita (v36):** el diagnóstico de ubicación (`_coberturasEn`) SÍ consulta ARCAC y Zona Patrimonio, pero como **lectura espacial pura**. No escribe en `DATA`/`GEOMETRIES` ni toca contadores, tablas ni filtros. El invariante de conteo se mantiene.
- **Join Sheet ↔ geometría por `nombre` exacto** (usar Set / igualdad estricta, NO `includes()`).
- Nombre canónico: **"Tempiluli"**.

## Reglas de datos geoespaciales
- Todo GeoJSON debe estar en **EPSG:4326** y **2D** (sin coordenada Z).
- Insumos en UTM 14N (EPSG:32614) o LCC México (EPSG:6372) → reproyectar a 4326 antes de integrar.
- Validar geometrías (`buffer(0)` si hay auto-intersecciones).
- `findGeometry(d)` devuelve un **Feature**, no una geometría. Desenvolver con `.geometry` si se necesita la geometría cruda.

## Reglas de despliegue (OBLIGATORIAS en cada cambio)
- **Bumpear `CACHE_VERSION` en `sw.js`** en cada entrega (formato `sia-v35-AAAA-MM-DD<letra>`). Sin esto, el navegador sirve el `index.html` viejo (estrategia cache-first).
- Capas pesadas (`sipam_fao`, `arcac`, `embarcaderos`) NO van en `CORE_ASSETS` (se cargan bajo demanda y se cachean en runtime).
- Validar el JS antes de entregar: extraer el `<script>` y correr `node --check`.
- **La copia local usa CRLF**; el repo en GitHub se sirve en LF. Al escribir el archivo desde fuera, conservar CRLF o el diff sale completo.

## Seguridad / calidad
- Escapar texto libre del Sheet con `esc()` antes de insertarlo con `innerHTML`.
- Leaflet se carga con SRI (`integrity` + `crossorigin`). No quitarlo.
- Evitar `alert()`; usar `siaToast()` para avisos no bloqueantes.
- **`GOOGLE_MAPS_API_KEY`** (constante al inicio del `<script>`): llave de navegador, pública por diseño. Lo que la protege son las restricciones en Google Cloud, no esconderla. Si queda vacía, el buscador degrada a Nominatim al presionar Enter y el sitio sigue funcionando.

## Identidad institucional
- Paleta: guinda `#9d2148`, dorado `#B28E5C`, gris `#55585A`. Tipografía Roboto (cuerpo) / Cabin (títulos).
- Colores de capa (`GROUP_COLORS`): Bosque Urbano `#027a35` · Barranca `#ac6d14` · ANP Local `#9d2148` · ANP Federal `#266cb4`. ARCAC por tenencia: Comunidad `#7048E8` · Ejido `#E8590C`. Suelo de Conservación `#00838f`. ZP: UNESCO `#444441` · Ramsar `#1D9E75` · AICA `#7F77DD` · SIPAM `#EF9F27`.

## Flujo de trabajo
- Editar `index.html` con ediciones precisas y quirúrgicas (no reescribir todo el archivo).
- Tras cambios: `node --check`, bump de `CACHE_VERSION`, y avisar qué archivos subir.
- El push a GitHub lo hace la persona vía GitHub Desktop; Claude Code solo edita los archivos locales.
- **Nunca sobrescribir `index.html` sin traer antes la copia local**: contiene la llave de Google, que no está en el repo de trabajo de Claude.

## Módulos actuales
- **Inventario** (Global + Bosques Urbanos + Barrancas + ANP Local + ANP Federal): mapa global con overlays, tabla, ficha lateral (drawer) con mini-mapa.
- **Zona Patrimonio (ZP):** UNESCO 7,534.17 ha · Ramsar 1363 2,657 ha · AICA 37 2,860.32 ha · SIPAM FAO 1,875.65 ha (6 zonas) · embarcaderos.
- **ARCAC:** 30 Áreas de Restauración y Conservación Ambiental Comunitaria (17 comunidades + 13 ejidos, 22,567.71 ha).
- Navegación: **7 pestañas visibles** + menú **«Más ▾»** con Análisis, Metas y Marco Jurídico (`SECONDARY_TABS`). `GROUPS` sigue teniendo los 10.

## Ficha de ubicación en campo (v36)
Público objetivo: **personal de SEDEMA en campo**, no ciudadanía. Mismo popup para el botón «Ubicarme» y para el buscador de coordenadas.

Orden de bloques: **coberturas → Suelo de Conservación → alcaldía → coordenada y precisión → Ir a la ficha**.

- `_coberturasEn(latlng)` arma la lista ordenada por jerarquía normativa: ANP Federal → ANP Local → Bosque Urbano → Barranca → ARCAC → ZP.
- Suelo de Conservación: **bloque turquesa** cuando cae dentro; renglón discreto del pie cuando cae fuera (y se omite si no hay ninguna cobertura, porque el texto ya lo dice).
- **Aviso de precisión:** si la distancia al borde del polígono es menor que el error reportado del GPS, se muestra franja ámbar. `_geomDistM` calcula punto-a-segmento con proyección plana local (error <0.1% a escala CDMX).
- Botón **Ir a la ficha** cuando hay 1 cobertura; **Ver ficha →** por bloque cuando hay 2 o más; versión secundaria a la más cercana cuando no hay ninguna.
- El subtítulo se omite si el badge ya lo contiene (evita "AVA · Barranca" + "Barranca").

## Controles de mapa (v36)
Un solo sistema de tokens: alto 34 px, radio 4, borde `rgba(42,42,42,.13)`, una sombra común.
- Arriba-izquierda: **una** tarjeta con zoom + Ubicarme + Vista general.
- A su derecha: buscador.
- Arriba-derecha: **una** tarjeta con capa base + pantalla completa.
- Abajo-izquierda: chip de capa.
- En <760 px el buscador toma el ancho y la tarjeta de vista baja una fila.
- `addResetViewControl(map, título)` lee `map._siaHome`, que se asigna junto al `fitBounds` inicial de cada mapa.
- El buscador va aislado con `L.DomEvent.disableScrollPropagation` / `disableClickPropagation`: sin eso, la rueda del mouse sobre los resultados hace zoom en el mapa.
- El lienzo Leaflet de la ficha vive en `#mapCanvasMap`, hijo de `#mapCanvas`. **No vaciar `#mapCanvas`**: ahí viven el buscador, el toggle de capa, pantalla completa y el chip de SC.

## Buscador (v36)
Dos grupos de sugerencias:
1. **En el inventario** — índice local (`_buscarLocal`) sobre los 66 + 30 ARCAC + designaciones ZP. Instantáneo, sin red, sin costo. Al elegir hace zoom y abre la ficha.
2. **Direcciones** — Google **Places API (New)** vía `AutocompleteSuggestion.fetchAutocompleteSuggestions`, con debounce de 280 ms y **session token** (agrupa el tecleo y la selección en un solo cobro). Sesgo al bbox de la CDMX.

Proyecto de Google Cloud: `categorias-proteccion-ambienta`. Llave `SIA Dashboard · web`, restringida a `https://sedemaoficina.github.io/*` y a 2 APIs (Maps JavaScript API + Places API New). Cuotas diarias acotadas en Places; presupuesto con alerta a 20 USD.

## Compartir ficha como imagen
El botón del drawer genera un **PNG 1080×1440 con Canvas**, sin librerías: membrete, badge de categoría, polígono dibujado desde el GeoJSON y datos duros. En móvil abre el menú nativo de compartir; en escritorio descarga. No es captura del DOM (evita mosaicos de otro origen que ensucian el canvas).

## Suelo de Conservación · hallazgo verificado (22 ago 2026)
Cruce geométrico de las 66 áreas contra `data/suelo_conservacion.geojson` (unión de 7 polígonos, 87,137 ha, "Decretado en el 2000"):

| Clasificación | Áreas |
|---|---|
| Totalmente dentro (≥99.5%) | 16 |
| Mayoría dentro (50–99.5%) | 3 |
| Parcial (0.5–50%) | 5 |
| Fuera (<0.5%) | 42 |

- **Bosque de Tlalpan traslapa 0.00% con SC.** El Programa de Manejo (Gaceta Oficial, 2011) lo confirma: *"el ANP se ubica en el territorio cuyo uso del suelo es catalogado como Uso Urbano"*. Si el Sheet lo marca como "Sí", **el Sheet está mal**.
- **La columna `suelo_conservacion` es binaria pero el territorio no.** Casos que un Sí/No no describe: Insurgente Miguel Hidalgo y Costilla 95.96% · Lago Tláhuac-Xico 65.71% · El Tepeyac 63.18% · Cerro de la Estrella federal 24.00% · Lomas de Padierna 11.83% · Magdalena Eslava 3.83% · Pachuquilla 1.32% · Atzoyapan 1.29%.
- Recomendación: agregar `suelo_conservacion_pct` al Sheet, o un tercer valor "Parcial".

## Barra «¿Dónde estoy?» · flujo principal de campo (v37)
El uso dominante del tablero es de **personal de SEDEMA**, no público: en celular para ubicarse
en campo, en escritorio para consultar tablas y estadística. La barra refleja eso.

- Vive **fuera de las pestañas**, entre el header y `<nav class="tabs">`: es una acción, no una
  categoría, y debe estar disponible desde cualquier vista sin gastar un espacio de pestaña
  (con 8 pestañas los nombres empiezan a truncarse).
- **Escritorio**: una fila compacta de 40 px. **Celular (<760px)**: se apila, el botón
  «Usar mi ubicación» ocupa el ancho completo a 48 px y el placeholder se acorta por JS.
- Tres entradas al mismo resultado: GPS, coordenada tecleada (`parseCoordsSia`) o dirección
  (índice local primero, luego Google Places).
- `ubicarResolver()` dibuja el resultado a **ancho completo** en `#ubicarResultado`, no en un
  globo del mapa: bloques de cobertura grandes, cada uno con su botón **Ver ficha**, mapa con
  los polígonos que cubren el punto, y el pie de datos. En celular el mapa va primero (`order:-1`).
- `initUbicarMap` hace **setView antes de agregar capas**: sin vista establecida, Leaflet falla
  en `_clipPoints` al pintar vectores.

## Módulo Traslapes (v37)
Pestaña dentro de «Más ▾», primera de la lista. Color `#d72f89`.

- Los polígonos de intersección se **precalculan** en `data/traslapes.geojson` (143 KB, 35 pares
  con umbral 0.5 ha). Hacerlo en el navegador exigiría una librería de clipping y el sitio solo
  carga Leaflet.
- **Regenerar con `python tools/traslapes.py`** cada vez que cambien `geometrias.geojson`,
  `arcac.geojson` o `zona_patrimonio.geojson`. El archivo lleva su fecha y el módulo la muestra.
- De Zona Patrimonio solo entra el polígono **UNESCO** (`ZPM_POLIGONO`); Ramsar, AICA y SIPAM se
  excluyeron por decisión institucional.
- NO va en `CORE_ASSETS`: carga bajo demanda.
- Hallazgo que expone: **300.47 ha de doble conteo** dentro del inventario (suma 25,968.10 ha vs
  unión real 25,667.63 ha) y 17 pares ANP–ARCAC con doble instrumento.

## Pendientes / riesgos conocidos
- **Continuidad institucional:** el Google Sheet del inventario y el proyecto de Google Cloud deberían colgar de cuentas institucionales de SEDEMA, no personales. Agregar un segundo propietario en IAM.
- **Corregir el Sheet** en la fila de Bosque de Tlalpan (y revisar las 8 parciales) según el hallazgo de arriba.
- **Traslapes ANP–ARCAC** que el tablero no reportaba hasta v36 (ej. Cumbres del Ajusco ∩ ARCAC San Miguel Ajusco). Vale la pena inventariarlos.
