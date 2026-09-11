# CLAUDE.md · Sistema de Información Ambiental (SIA) · SEDEMA CDMX

Contexto y reglas del proyecto para Claude Code. Léelas antes de cualquier cambio.

## Qué es
Dashboard público de categorías de protección ambiental de la CDMX, en GitHub Pages (sitio estático, sin build). Repo: `SedemaOficina/categorias-de-proteccion-ambiental`.

## Arquitectura
- **Toda la lógica vive en `index.html`** (HTML + CSS + JS inline). No hay pipeline de build ni framework.
- `sw.js` es el Service Worker (caché offline). **Debe quedarse en la raíz**: el ámbito de un SW es la carpeta desde la que se sirve; moverlo a una subcarpeta lo deja sin control sobre `index.html` y elimina el offline.
- Los recursos gráficos viven en `assets/` (`logo-sedema.png`, `favicon.png`, `apple-touch-icon.png`, `og-image.png`). La raíz solo conserva lo que GitHub exige ahí: `index.html`, `sw.js`, `README.md`, `CLAUDE.md`, `.nojekyll`, `.gitattributes`, `.gitignore`, `.github/`.
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
- **ARCAC:** 30 Áreas de Restauración y Conservación Ambiental Comunitaria (17 comunidades + 13 ejidos, 22,567.71 ha). Desde v38 es un chip del **Inventario**, no de Capas, pero sigue fuera de las 66 áreas (ver «ARCAC dentro del inventario» abajo).
- Navegación: **cuatro destinos** (ver «Rediseño de UX» abajo). `GROUPS` sigue teniendo los 11 ids
  y `state.tab` sigue siendo un id de grupo; lo que cambió es cómo se agrupan en pantalla.

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

## Service Worker · purga condicionada (v27c, 27 ago 2026)
`install` traga los errores de red en silencio (`cache.add().catch()`). Si un usuario recibe una
versión nueva estando en una red que no alcanza el origen, la caché nueva queda vacía; el
`activate` anterior borraba la previa en ese momento y lo dejaba **sin tablero ni siquiera offline**.

- `activate` ahora llama a `repararCore()` (reintenta los `CORE_ASSETS` faltantes) y solo purga
  las cachés viejas si `cacheUtilizable()` confirma que `./` **y** `./index.html` están presentes.
- `cacheFirst` consulta primero la caché de la versión vigente y solo después el `caches.match()`
  global. Sin ese orden, una caché conservada podría eclipsar al `index.html` nuevo.
- No tocar esta lógica sin simular los tres escenarios: instala con red · bump sin red · vuelve la red.

## Acceso desde redes móviles · hallazgo verificado (27 ago 2026)
**Telcel no rutea a GitHub Pages desde datos móviles.** Verificado: el sitio responde 200 desde
internet, el DNS resuelve normal (185.199.108–111.153 y `2606:50c0:800x::153`), pero en datos
móviles agotan el tiempo tanto el dashboard como `sw.js` (6.7 KB) y `octocat.github.io` —un host
ajeno nunca visitado—. No es peso, no es caché, no es filtrado del hostname: es la ruta al rango
de GitHub Pages, probablemente por IPv6 sin fallback.

- **Un dominio propio con `CNAME` a GitHub Pages NO lo resuelve**: apunta a las mismas IP.
- Remediación: mover el alojamiento (Cloudflare Pages es la vía de menor fricción; conserva
  GitHub como fuente y despliega en cada push).
- Mitigación operativa mientras tanto: el Service Worker. Quien abra el tablero una vez en Wi-Fi
  lo conserva funcionando en datos. Instrucción de campo: **cargar el tablero antes de salir**.

## Rediseño de UX/UI (v38 · 10 sep 2026)

> **Dónde vive (11 sep 2026):** el rediseño NO está en `index.html`. Vive en
> **`rediseno-v38.html`**, como versión en revisión con una cinta al pie que lo identifica, para
> poder compararlo contra el original sin alterar la página oficial. `index.html` es el original
> (el mismo que sirve GitHub Pages). Al aprobarlo: renombrar `rediseno-v38.html` → `index.html`,
> quitar el bloque `.cinta-borrador` del final del archivo y bumpear `CACHE_VERSION`.

Diagnóstico: once destinos en un solo nivel mezclaban filtros del inventario, inventarios
independientes y herramientas de análisis; había dos buscadores para lo mismo; el cuarto KPI era
el inverso aritmético del tercero; ocho filtros con el mismo peso visual; el mapa vivía debajo de
la tabla en un producto cuyo uso dominante es de campo; y el semáforo rojo/verde competía con el
guinda institucional.

**Navegación de dos niveles.** `DESTINOS` (cuatro) agrupa ids de `GROUPS` que ya existían:
`UBICAR` (sin grupo) · `INVENTARIO` → ALL, BU, BR, ANPL, ANPF · `CAPAS` → ZP, ARCAC, TRASLAPES ·
`ANALITICA` → ANALISIS, METAS, LEGAL. `state.dest` guarda el destino; `state.tab` no cambia de
contrato, así que **ninguna función de render cambió de firma**. `buildTabs()` pinta la barra de
destinos y los subfiltros. `SECONDARY_TABS`, `.tabs`, `.tab` y el menú «Más ▾» quedaron sin uso;
`closeMoreMenu()` se conserva como no-op porque otros listeners la invocan.

**Reglas visuales nuevas:**
- El **guinda es el único color de marca**: señala lo activo y lo accionable. Por eso
  `GROUP_COLORS['ANP · Local']` pasó de `var(--guinda)` a `var(--anpl)` (naranja): antes la misma
  categoría tenía un color en el mapa y otro en las pestañas, y competía con la marca.
- **El estado no se codifica por matiz.** `.status-tag` es un punto: lleno = sí, hueco = no
  (Suelo de Conservación en turquesa). El verde ya significa «Bosque Urbano».
- **La categoría se lee en el filete lateral de la fila** (`tr[data-g]`, alimentado por
  `GRUPO_CLS`), no en un relleno saturado dentro de la tabla.
- **Piso tipográfico de 11 px** (antes 9.5) y escala de once tamaños a seis; en ≤760 px el cuerpo
  sube un escalón completo.

**Estructura:**
- `#globalMapSection` vive **fuera** de `#tableSection` (el destino Ubicar lo muestra con la tabla
  oculta) y va **antes** de la tabla.
- **Vista partida ≥1200 px:** `main#main-content` es un grid de dos columnas; el mapa queda
  `sticky` a la izquierda y la tabla corre a la derecha (columnas visibles, abajo).
- **Celular:** la barra de destinos es `position:fixed` al pie (48 px, alcance del pulgar), el
  destino por defecto es `UBICAR`, la barra «¿Dónde estoy?» solo aparece en ese destino, y la
  tabla se reduce a Nombre · Superficie · PM · SC, con Tipo, Subcategoría, Alcaldía y DG en una
  segunda línea bajo el nombre.
- **Filtros jerarquizados:** Búsqueda, Alcaldía y Programa de manejo a la vista; Tipo,
  Jurisdicción, Subcategoría, SC y DG tras «Más filtros», con conteo de activos. Si hay un filtro
  avanzado activo, el panel se despliega solo (`sincronizarMasFiltros()`).
- **Tabla en vista partida (11 sep):** además de Nombre, Subcategoría, Alcaldía, Superficie, PM y
  SC se muestran **Tipo** y **DG responsable**; solo se ocultan Jurisdicción, Decreto y Fecha PM.
  La columna Nombre baja a 28% y el grid del `main` pasa a `0.88fr / 1fr` para darle ancho a la tabla.
- **Columnas redundantes (11 sep):** la tabla obedece la misma regla que los filtros. En
  `populateFilters()` se calcula, sobre `currentData()`, qué columnas tienen un solo valor en el
  subconjunto activo y se marca la tabla con `oc-<n>` (CSS `table.t.oc-2 th:nth-child(2)`…).
  Se calcula sobre el grupo, no sobre las filas filtradas, para que no aparezcan y desaparezcan
  columnas mientras se teclea. Resultado con el inventario vigente:

  | Subconjunto | Columnas visibles |
  |---|---|
  | Todas | Nombre · Tipo · Subcat. · Alcaldía · Sup. · PM · SC · DG resp. |
  | Bosques Urbanos | Nombre · Alcaldía · Decreto · Sup. · PM |
  | Barrancas | Nombre · Alcaldía · Decreto · Sup. · PM · SC |
  | ANP Locales y Federales | Nombre · Subcat. · Alcaldía · Decreto · Sup. · PM · SC · DG resp. |

- **Ficha · indicadores de estado (11 sep):** Suelo de Conservación mostraba dos elementos con
  tamaños distintos —el punto con «No» y, al lado, «Fuera del Suelo de Conservación»— que decían
  lo mismo y no compartían línea base. Ahora es un solo `.status-tag`: el punto y el texto que lo
  explica. Programa de manejo pasó de «Sí/No» a «Publicado / Sin programa vigente». En `.field`,
  `.status-tag` hereda el tamaño del valor y alinea a la línea base; el punto se centra aparte.
- **Parser de coordenadas (11 sep):** `parseCoordsSia()` es la única implementación y la usan la
  barra «¿Dónde estoy?» y los cinco buscadores de mapa (global, ficha, Zona Patrimonio, ARCAC y
  Traslapes), que la alcanzan por `parseCoords()` dentro de `attachMapSearch`. En los seis, la
  coordenada tiene prioridad sobre Google Places: si el texto parsea, no se gasta una llamada.
  Formatos aceptados, normalizando espacios y paréntesis: `19.42, -99.14` · `(19.42, -99.14)` ·
  `( 19.42 , -99.14 )` · corchetes y llaves · separador coma, punto y coma o espacio ·
  coma decimal (`19,42, -99,14`, solo cuando la lectura es inequívoca: cuatro grupos, 2.º y 4.º
  puras cifras) · hemisferio en letra (`19.42 N, 99.14 W`, también `O`) · símbolo de grado ·
  menos tipográfico `−` y guiones largos · una URL de Google Maps pegada entera (toma el `@lat,lng`).
  **Corrige el orden invertido:** si el primer número excede ±90 no puede ser latitud, así que se
  intercambia con el segundo. El popup siempre muestra la coordenada resultante, de modo que la
  interpretación queda a la vista y el usuario puede desmentirla.
- **Año del decreto (11 sep):** la columna Decreto muestra solo el año a cuatro dígitos
  (`anioDecreto()`, que lee `fecha_decreto_iso` y cae al texto DD/MM/AAAA); la fecha completa
  queda en el `title` de la celda y en la ficha. En vista partida la columna no se oculta siempre:
  la clase `con-decreto` la habilita cuando la regla de redundancia dejó **siete columnas o menos**,
  lo que hoy deja fuera únicamente a «Todas». En el caso lleno (ocho columnas con el año) los
  anchos se reparten a mano para que ni «Decreto» ni «DGCORENADER» queden cortados. El orden sigue siendo por fecha ISO, así que dentro de
  un mismo año ordena bien aunque solo se vea el año.
- **Sello de versión (11 sep):** la cinta de `rediseno-v38.html` muestra el `CACHE_VERSION` con el
  que se compiló. Sirve para saber de un vistazo si el navegador está sirviendo una copia vieja
  desde el Service Worker. El archivo se arma con `python armar-revision.py`, que lee la versión
  de `sw.js` y la inyecta.
- **Descarga CSV retirada (11 sep):** el botón `↓ CSV` del inventario y su listener `btnExport`
  se eliminaron a petición del usuario. El módulo Traslapes conserva el suyo (`trasCsv` →
  `exportTraslapesCSV()`), que es independiente. Las columnas que la tabla oculta en vista
  partida siguen disponibles **en la ficha del área**, ya no en una descarga.
- **Filtros redundantes (11 sep):** `populateFilters()` oculta todo filtro cuyo subconjunto activo
  tenga **un solo valor posible**, porque ahí no filtra nada. Regla general, no lista fija: dentro
  de Bosques Urbanos desaparecen Tipo, Jurisdicción, Subcategoría, SC y DG (todas son AVA · Local ·
  Bosque Urbano, fuera de SC y DGSANPAVA); en Barrancas, Tipo, Jurisdicción, Subcategoría y DG; en
  ANP Locales y Federales solo Tipo y Jurisdicción, porque su Subcategoría sí varía (6 y 2 valores).
  Si ningún filtro avanzado queda útil, el botón «Más filtros» también se oculta, y
  `sincronizarMasFiltros()` no cuenta los filtros ocultos.
- **ARCAC dentro del inventario (11 sep):** el chip ARCAC salió de Capas y entró a la barra de
  categorías del Inventario, junto a Bosques Urbanos, Barrancas y las dos ANP. La invariante de
  las 66 áreas no se toca: ARCAC vive en `DATA_ARCAC`, un arreglo aparte que `construirDatosArcac()`
  arma al vuelo desde `data/arcac.geojson`; **nunca entra a `DATA` ni a `GEOMETRIES`**, y el
  contador institucional del encabezado sigue diciendo 66. Lo único compartido es la tabla:
  `currentData()` devuelve `DATA_ARCAC` cuando `state.tab === 'ARCAC'`.
  - **Columnas.** Los núcleos agrarios no tienen decreto, jurisdicción, programa de manejo ni
    dirección responsable, así que la regla de redundancia los deja fuera sola —no hay excepción
    codificada— y la tabla queda en cuatro columnas: Nombre · Tenencia · Alcaldía · Sup. (ha).
    El encabezado «Subcat.» se renombra a «Tenencia» solo en esta pestaña.
  - **Identidad por `no`, no por nombre.** Cinco nombres se repiten en la capa (San Bernabé
    Ocotepec, San Miguel Ajusco, San Miguel Topilejo, San Nicolás Totolapan, Santa Rosa Xochiac) y
    la repetición es legítima: un registro es ejido y el otro comunidad. Además cuatro nombres
    coinciden con áreas del inventario. Por eso la fila lleva `data-no` y no `data-i`, y el
    manejador de `#tb` enruta `tr[data-no]` a `openARCACFicha()`.
  - **Alcaldía normalizada:** la capa trae «Magdalena Contreras» y «La Magdalena Contreras»; el
    constructor las unifica para que el filtro de alcaldía no las parta en dos.
  - **Carga diferida con candado.** `arcac.geojson` no está en `CORE_ASSETS`. Como `renderDashboard`
    dispara la carga y la carga vuelve a llamar a `renderDashboard`, el estado
    `_arcacTablaEstado` ('sin-cargar' | 'cargando' | 'listo') corta el ciclo; si la descarga falla,
    la tabla muestra el aviso en lugar de reintentar en bucle.
  - **Resumen propio:** `resumenArcacHTML()` reporta 30 núcleos, 22,567.70 ha y el reparto de
    tenencia (17 comunidad · 13 ejido), y cierra con la leyenda «Capa complementaria: no forma
    parte de las 66 áreas del inventario» para que nadie sume ARCAC al universo protegido.
  - **El mapa necesitaba vista propia.** Con ARCAC los cuatro grupos del inventario
    están apagados, así que `allBounds` quedaba inválido, `initGlobalMap` nunca llamaba a
    `fitBounds` y el mapa salía en blanco. Dos correcciones, ambas generales:
    `globalMap.setView([19.36,-99.13], 10)` **inmediatamente después de crear el mapa y antes
    de agregar cualquier capa** —Leaflet falla en `_clipPoints` si dibuja vectores sin vista—,
    y el encuadre de ARCAC lo aporta su propia capa en `asegurarCapaArcacGlobal()`
    (`invalidateSize()` + `fitBounds`) cuando ningún grupo está activo.
  - **`zoomSnap: 0.25` en el mapa global.** Con pasos enteros, la extensión de ARCAC se pasaba
    del nivel 11 por unos pocos píxeles y caía al 10: el contenido ocupaba la mitad del marco.
    Con zoom fraccionario el encuadre queda en 10.75 y llena la vista. Aplica a todas las
    pestañas; ninguna empeoró (ocupación verificada ≥93% del ancho en las seis).
  - **Color por tenencia, no por núcleo.** `loadARCAC()` asignaba 30 matices por ángulo áureo
    (`hsl(i*137.508…)`): una rueda de colores que no codificaba ningún dato y competía con la
    paleta institucional. Ahora el polígono toma `ARCAC_COLORS[tenencia]` —comunidad
    `#7048E8`, ejido `#E8590C`—, de modo que mapa, badge de la tabla y filete de la fila dicen
    lo mismo.
  - **Filtro de tenencia:** el `<label>` de `fCat` se renombra a «Tenencia» en esta pestaña
    (id `labCat`), igual que el encabezado de la columna.
  - **Sin columna de Suelo de Conservación:** se descartó por ahora. Sería un dato derivado y el
    cálculo por muestreo tiene ±2 puntos de error; si se quiere, hay que calcularlo con
    `tools/traslapes.py` y escribirlo como propiedad en `arcac.geojson`, no estimarlo en el cliente.
- Las cuatro tarjetas KPI se sustituyeron por `resumenHTML()`: tres cifras y una barra de
  cobertura de programas de manejo que muestra logro y brecha a la vez.

- **Una sola búsqueda, siempre a la vista (11 sep).** El buscador flotante que vivía dentro de
  cada mapa se retiró de los cinco (global, ficha, Zona Patrimonio, ARCAC y Traslapes) junto con
  la función `attachMapSearch` y su `parseCoords` interno: duplicaba la barra «¿Dónde estoy?» y
  multiplicaba por cinco el consumo de Google Places. Ahora:
  - la barra «¿Dónde estoy?» aparece en **los tres destinos** —se eliminó la regla móvil
    `.wrap:not(.dest-ubicar) .ubicar-bar{display:none}`—, porque es la única entrada de
    direcciones y coordenadas del tablero y no puede desaparecer al cambiar de vista;
  - es **`position:sticky; top:0`**, como la barra de Google Maps: acompaña el desplazamiento y
    buscar nunca obliga a volver al principio de la página. El fondo lleva un color opaco debajo
    del degradado, o el contenido se transparenta al quedar pegada. `z-index: var(--z-sticky)`
    (900) gana a los controles de Leaflet (800) y a los flotantes del mapa (500);
  - en «Ubicar» vuelve a `position:static`: ahí la barra **es** la página y anclarla solo
    duplicaría su altura;
  - fuera de «Ubicar», en celular se comprime a una fila de 66 px —rótulo en línea, sin
    subtítulo, GPS reducido a su icono—, contra los 250 px de la versión grande;
  - `parseCoordsSia()` sigue siendo el parser, ahora con un solo llamador.
- **Controles del mapa en celular: una fila (11 sep).** Al desaparecer el buscador flotante ya
  no hay nada que empuje la segunda fila, así que el zoom vuelve a la izquierda y la tarjeta de
  vista a la derecha, ambos a `top:10px`. Antes se apilaban y entre el buscador de ancho completo
  y la tarjeta se comían medio mapa —y en pantallas angostas se encimaban—.
- **«Capas» desapareció (11 sep).** Sus dos módulos se repartieron donde se buscan:
  **Zona Patrimonio** es un chip más del Inventario y **Traslapes** pasó a Análisis. Quedan tres
  destinos. Ninguno de los dos módulos cambió por dentro: ZP conserva su página propia —la tabla
  de once declaratorias, la subpestaña de embarcaderos, los toggles independientes de capa y su
  ficha lateral—, contenido que la tabla compartida de cuatro columnas no puede sostener. Si más
  adelante se prefiere uniformidad, el camino es el de ARCAC (`DATA_ZP` + `currentData()`), con
  la pérdida de embarcaderos y del cuadro de concurrencia.
  `TRASLAPES` se agregó además a `isSpecialTab()`: estaba fuera por descuido y hacía que
  `render()` y `populateFilters()` trabajaran sobre una tabla oculta.

**Al validar:** la copia de trabajo se prueba en Chromium (Playwright) interceptando la red.
Hasta el 11 de septiembre se usaba un doble de Leaflet, que no pinta nada; **ahora se sirve
Leaflet 1.9.4 real desde `npm` y tejas PNG sintéticas**, así que los mapas SÍ se verifican:
número de polígonos, color de cada capa, encuadre y errores de JS. El CSV del inventario es el
real, exportado del Sheet. Arnés en `/home/claude/verif` (`mapa2.mjs`, `todos.mjs`, `arcac.mjs`,
`coords.mjs`, `ficha.mjs`). Lo que sigue sin verificarse es el basemap real de CARTO y Google
Places, que el contenedor no alcanza.

## Pendientes / riesgos conocidos
- **Migrar fuera de las IP de GitHub Pages** (ver hallazgo de arriba). Al hacerlo hay que actualizar
  `canonical`, `og:url`, `og:image`, `twitter:image` en `index.html` y la restricción de origen de
  la llave de Google en Cloud Console.
- **Rotar la `GOOGLE_MAPS_API_KEY`:** sigue viva en el historial de git (los `index.html.bak`
  borrados el 27-ago no la sacan de los commits anteriores). Ocultarla no es remediación.
- **Continuidad institucional:** el Google Sheet del inventario y el proyecto de Google Cloud deberían colgar de cuentas institucionales de SEDEMA, no personales. Agregar un segundo propietario en IAM.
- **Confirmar el cambio de color de ANP Local** (guinda → naranja) con la identidad institucional.
- **Colores de Zona Patrimonio confundibles:** AICA `#7F77DD` con ARCAC `#7048E8`, y SIPAM
  `#EF9F27` con ANP Local `#F08217`. Propuesta pendiente de validación: `#4C4F9E` y `#C77D0A`.
- **Corregir el Sheet** en la fila de Bosque de Tlalpan (y revisar las 8 parciales) según el hallazgo de arriba.
- **Suelo de Conservación de ARCAC:** falta calcularlo con exactitud (`tools/traslapes.py`) y
  escribirlo como propiedad en `arcac.geojson` si se quiere mostrar la columna.
- **Traslapes ANP–ARCAC** que el tablero no reportaba hasta v36 (ej. Cumbres del Ajusco ∩ ARCAC San Miguel Ajusco). Vale la pena inventariarlos.
