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
- **Join Sheet ↔ geometría por `nombre` exacto** (usar Set / igualdad estricta, NO `includes()`).
- Nombre canónico: **"Tempiluli"**.

## Reglas de datos geoespaciales
- Todo GeoJSON debe estar en **EPSG:4326** y **2D** (sin coordenada Z).
- Insumos en UTM 14N (EPSG:32614) o LCC México (EPSG:6372) → reproyectar a 4326 antes de integrar.
- Validar geometrías (`buffer(0)` si hay auto-intersecciones).

## Reglas de despliegue (OBLIGATORIAS en cada cambio)
- **Bumpear `CACHE_VERSION` en `sw.js`** en cada entrega (formato `sia-v35-AAAA-MM-DD<letra>`). Sin esto, el navegador sirve el `index.html` viejo (estrategia cache-first).
- Capas pesadas (`sipam_fao`, `arcac`, `embarcaderos`) NO van en `CORE_ASSETS` (se cargan bajo demanda y se cachean en runtime).
- Validar el JS antes de entregar: extraer el `<script>` y correr `node --check`.

## Seguridad / calidad
- Escapar texto libre del Sheet con `esc()` antes de insertarlo con `innerHTML`.
- Leaflet se carga con SRI (`integrity` + `crossorigin`). No quitarlo.
- Evitar `alert()`; usar `siaToast()` para avisos no bloqueantes.

## Identidad institucional
- Paleta: guinda `#9d2148`, dorado `#B28E5C`, gris `#55585A`. Tipografía Roboto (cuerpo) / Cabin (títulos).

## Flujo de trabajo
- Editar `index.html` con ediciones precisas y quirúrgicas (no reescribir todo el archivo).
- Tras cambios: `node --check`, bump de `CACHE_VERSION`, y avisar qué archivos subir.
- El push a GitHub lo hace la persona vía GitHub Desktop; Claude Code solo edita los archivos locales.

## Módulos actuales
- **Inventario** (Global + Bosques Urbanos + Barrancas + ANP Local + ANP Federal): mapa global con overlays, tabla, ficha lateral (drawer) con mini-mapa.
- **Zona Patrimonio (ZP):** UNESCO 7,534.17 ha · Ramsar 1363 2,657 ha · AICA 37 2,860.32 ha · SIPAM FAO 1,875.65 ha (6 zonas) · embarcaderos. Capas toggleables, tabla, ficha, buscador, botón Ubicarme.
- **ARCAC:** 30 Áreas de Restauración y Conservación Ambiental Comunitaria (17 comunidades + 13 ejidos, 22,567.71 ha). Color distinto por área; tenencia en badges; tabla con búsqueda/filtros/orden; ficha con mini-mapa; overlay en el mapa global.
- Botón **"Ubicarme"** (geolocalización + punto-en-polígono) en todos los mapas.
