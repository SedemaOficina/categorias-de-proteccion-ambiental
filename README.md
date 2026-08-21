# Sistema de Información Ambiental · ANP / AVA · CDMX

**Dashboard institucional de las Áreas Naturales Protegidas, Áreas de Valor Ambiental y Zonas de Conservación Ecológica de la Ciudad de México.**

[![Versión](https://img.shields.io/badge/versión-v35-9d2148)](https://github.com/SedemaOficina/categorias-de-proteccion-ambiental)
[![Áreas](https://img.shields.io/badge/áreas-66-266cb4)](https://sedemaoficina.github.io/categorias-de-proteccion-ambiental/)
[![Zona Patrimonio](https://img.shields.io/badge/módulo-Zona_Patrimonio-444441)](https://sedemaoficina.github.io/categorias-de-proteccion-ambiental/)
[![ARCAC](https://img.shields.io/badge/módulo-ARCAC_(30)-7048E8)](https://sedemaoficina.github.io/categorias-de-proteccion-ambiental/)
[![Despliegue](https://img.shields.io/badge/deploy-GitHub_Pages-027a35)](https://sedemaoficina.github.io/categorias-de-proteccion-ambiental/)
[![Licencia](https://img.shields.io/badge/uso-institucional-b28e5c)](#)

> **URL pública:** <https://sedemaoficina.github.io/categorias-de-proteccion-ambiental/>

---

## 1. Qué es

Plataforma web pública que centraliza el inventario georreferenciado de las **66 áreas de protección ambiental** del territorio capitalino: **39 Áreas de Valor Ambiental (AVA)** y **27 Áreas Naturales Protegidas (ANP)** — 9 federales y 18 locales. Reúne polígonos oficiales, fichas técnicas, marco jurídico, indicadores de gestión y cronología histórica de decretos.

Adicionalmente incorpora módulos especiales transversales que **no forman parte del conteo de las 66 áreas** (documentan marcos jurídicos superpuestos o padrones complementarios, no unidades del inventario):

- **Zona Patrimonio (ZP)** — reconocimientos internacionales superpuestos al territorio de conservación (Patrimonio Mundial UNESCO, Sitio Ramsar 1363, AICA 37), la capa **SIPAM FAO** de zonas chinamperas y una capa de **embarcaderos** (turísticos y productivos).
- **ARCAC** — padrón de las 30 **Áreas de Restauración y Conservación Ambiental Comunitaria**: núcleos agrarios (comunidades y ejidos) en suelo de conservación, con capa propia y overlay activable en el mapa general.

**Coordinación institucional:** Tecnologías de la Información para el Monitoreo y Gestión Ambiental (TIMOG) · Secretaría del Medio Ambiente · Gobierno de la Ciudad de México.

## 2. Qué resuelve

- **Trazabilidad jurídica.** Acceso directo al decreto, gaceta y programa de manejo de cada área.
- **Visualización territorial.** Polígonos sobre cartografía base, capa de Suelo de Conservación y resaltado de áreas en coadministración SEMARNAT–CONANP–CDMX (Convenio 2025).
- **Reconocimientos internacionales.** Módulo Zona Patrimonio con el polígono UNESCO (Xochimilco, Tláhuac, Milpa Alta), el Sitio Ramsar 1363, el AICA 37, la capa SIPAM FAO de zonas chinamperas y los embarcaderos del sistema chinampero.
- **Núcleos agrarios (ARCAC).** Módulo del padrón de 30 Áreas de Restauración y Conservación Ambiental Comunitaria, con tabla filtrable/ordenable, color propio por área y overlay activable en el mapa general.
- **Ubicación en campo.** Botón "Ubicarme" (geolocalización) en todos los mapas, que además indica dentro de qué polígono cae el usuario.
- **Gestión por DG.** Filtrado por DGSANPAVA y DGCORENADER, con vacíos detectados como "Sin asignar".
- **Indicadores administrativos.** Comparativo de decretos y programas de manejo por administración electa, con identificación automática de brechas.
- **Operación offline.** Service Worker con caché versionada para uso en campo o conexión intermitente.

## 3. Acceso público

Sitio estático servido desde GitHub Pages. No requiere autenticación.

```
https://sedemaoficina.github.io/categorias-de-proteccion-ambiental/
```

Soporta deep linking a fichas individuales por slug:

```
…/categorias-de-proteccion-ambiental/#area=bosque-de-tlahuac
```

## 4. Estructura del repositorio

```
categorias-de-proteccion-ambiental/
├── index.html                          ← dashboard completo (HTML+CSS+JS)
├── sw.js                               ← Service Worker (offline + caché)
├── SIA_LOGO-03.png                     ← logo institucional
├── README.md                           ← este archivo
└── data/
    ├── geometrias.geojson              ← 66 polígonos de áreas protegidas (inventario)
    ├── zona_patrimonio.geojson         ← módulo Zona Patrimonio (UNESCO / Ramsar / AICA)
    ├── sipam_fao.geojson               ← capa SIPAM FAO (zonas chinamperas)
    ├── arcac.geojson                    ← módulo ARCAC · 30 núcleos agrarios (comunidades/ejidos)
    ├── embarcaderos.geojson             ← capa de puntos · embarcaderos (Turístico/Productivo)
    ├── alcaldias.geojson               ← polígonos de las 16 alcaldías
    ├── suelo_conservacion.geojson      ← capa de Suelo de Conservación
    └── normativa/
        ├── CPCDMX_Constitucion_CDMX.pdf
        ├── LACM_Ley_Ambiental_CDMX.pdf
        ├── LGEEPA_Ley_General_Equilibrio_Ecologico.pdf
        └── CONVENIO_SEMARNAT-CONANP-CDMX_2025.pdf
```

> El inventario tabular **no se versiona en el repositorio**. Vive en un Google Sheet publicado como CSV (ver §5.1) para permitir ediciones operativas sin requerir un commit. Los módulos especiales (Zona Patrimonio, SIPAM FAO) **sí se versionan** como GeoJSON autocontenidos: no dependen del Sheet.

## 5. Arquitectura de datos

### 5.1 Inventario · Google Sheets (fuente única de verdad)

URL pública del Sheet en formato CSV:

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vTjzQYJ2Qyj_LB2oFOU2irZa1Qp1yNt9Z44MGbU_2xkAMwxIPOuiviorX6JI4P_eb5kA3rkKqYomQo1/pub?gid=0&single=true&output=csv
```

Cualquier corrección de captura (alcaldía, fecha, URL, DG responsable) se hace **en el Sheet** y se refleja en producción al siguiente refresco del Service Worker. No requiere despliegue.

### 5.2 Esquema del Sheet (17 columnas)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único interno (3 dígitos) |
| `nombre` | string | Nombre oficial — **llave de unión con el GeoJSON** |
| `grupo` | enum | `AVA · Bosque Urbano` / `AVA · Barranca` / `ANP · Local` / `ANP · Federal` |
| `categoria` | string | Subcategoría jurídica |
| `alcaldia` | string | Una o varias alcaldías (separadas por coma) |
| `fecha_decreto` | string | Formato libre legible (ej. "23 de noviembre de 2010") |
| `fecha_decreto_iso` | date | ISO `AAAA-MM-DD` para cálculos |
| `superficie` | number | Hectáreas decretadas |
| `programa_manejo` | enum | `Sí` / `No` |
| `fecha_pm` | string | Formato libre |
| `fecha_pm_iso` | date | ISO |
| `suelo_conservacion` | enum | `Sí` / `No` |
| `dg_responsable` | enum | `DGSANPAVA` / `DGCORENADER` / vacío |
| `url_pdf_decreto` | url | PDF del decreto |
| `url_gaceta_decreto` | url | URL de la Gaceta Oficial |
| `url_pdf_pm` | url | PDF del programa de manejo |
| `url_gaceta_pm` | url | URL de Gaceta del PM |

### 5.3 Polígonos del inventario · `data/geometrias.geojson`

Colección de 66 features. Cada una sigue el patrón:

```json
{
  "type": "Feature",
  "properties": {
    "nombre": "Sierra de Santa Catarina (ZCE)",
    "grupo": "ANP · Local",
    "match_via": "shapefile_oficial",
    "categoria_origen": "Zona de Conservación Ecológica",
    "alcaldia_origen": "Iztapalapa, Tláhuac",
    "superficie_decretada_origen": 528.00,
    "fuente_origen": "Shapefile oficial TIMOG · SEDEMA"
  },
  "geometry": { "type": "MultiPolygon", "coordinates": [[[...]]] }
}
```

**Reglas de integridad:**

- El campo `nombre` debe coincidir **exactamente** con el del Sheet (incluido sufijo entre paréntesis para áreas homónimas). La unión usa comparación exacta por conjunto (Set), **no** coincidencia permisiva por `includes()`, para evitar doble-match en homónimos.
- Las propiedades con sufijo `_origen` son metadatos del proceso de captura. **El dato visible en UI proviene del Sheet**, no del GeoJSON.
- Una sola feature por declaratoria. Áreas que abarcan varios cuerpos disjuntos (ej. Sierra de Santa Catarina) se representan como `MultiPolygon`, lo cual GeoJSON reconoce como una sola geometría compuesta — Leaflet la renderiza como una entidad clickeable única.

### 5.4 Áreas homónimas

Para áreas con el mismo nombre pero distinto decreto, se utiliza sufijo entre paréntesis tanto en el Sheet como en el GeoJSON:

| Nombre | Tipo | ID | Notas |
|---|---|---|---|
| `Cerro de la Estrella (local)` | ANP · Local | 043 | Decreto local |
| `Cerro de la Estrella (federal)` | ANP · Federal | 058 | Parque Nacional federal |
| `Sierra de Santa Catarina (ZCE)` | ANP · Local | 055 | Zona de Conservación Ecológica · 528.00 ha |
| `Sierra de Santa Catarina (ZSCE)` | ANP · Local | 056 | Zona Sujeta a Conservación Ecológica · 220.55 ha |

### 5.5 Módulos especiales · capas transversales (arquitectura aislada)

Los módulos que representan **marcos jurídicos superpuestos** (no unidades del inventario) se implementan como GeoJSON autocontenidos, con una rama de render aislada marcada por `isSpecialTab()`. **No tocan** `DATA`, ni `geometrias.geojson`, ni los contadores del inventario. Esto evita contaminar las 66 áreas con entidades que legalmente no lo son.

#### `data/zona_patrimonio.geojson` — Zona Patrimonio (ZP)

Tres features autocontenidas, sin unión con el Sheet:

| Feature | Instrumento | Superficie |
|---|---|---|
| ZPM (contenedor) | Zona de Monumentos / Patrimonio Mundial UNESCO 1987 · Xochimilco, Tláhuac, Milpa Alta | 7,534.17 ha (oficial) |
| Ramsar 1363 | Sistema lacustre Ejidos de Xochimilco y San Gregorio Atlapulco | 2,657.00 ha (oficial Ramsar) |
| AICA 37 | Área de Importancia para la Conservación de las Aves · Ciénega de Tláhuac | 2,860.32 ha (oficial CONABIO) |

Capas toggleables independientes vía el sistema `.map-filter-chip`, con colores consistentes por categoría: guinda (ANP Local), verde (AVA Bosque Urbano), azul (ANP Federal), turquesa (Ramsar), morado (AICA) y marco punteado carbón `#444441` (contenedor ZPM). El módulo incluye subpestañas **Declaratorias** (tabla clicable con ficha lateral) y **Embarcaderos**, buscador de coordenadas/direcciones (`attachMapSearch`) y botón "Ubicarme".

#### `data/sipam_fao.geojson` — SIPAM FAO

Capa de las 6 zonas chinamperas reconocidas por la FAO bajo el esquema SIPAM (Sistemas Importantes del Patrimonio Agrícola Mundial), incluida la zona recuperada de Tetelco. Superficie total: **1,875.65 ha**.

#### `data/embarcaderos.geojson` — Embarcaderos

Capa de puntos con los embarcaderos del sistema chinampero (tipos **Turístico** y **Productivo**), con tooltip nombre · tipo · alcaldía. Se muestra dentro del módulo Zona Patrimonio con toggles por tipo y tabla asociada.

#### `data/arcac.geojson` — ARCAC (módulo independiente)

Padrón de las 30 **Áreas de Restauración y Conservación Ambiental Comunitaria**: núcleos agrarios en suelo de conservación, clasificados por tenencia (**17 Comunidades + 13 Ejidos**), superficie total **22,567.71 ha** en 8 alcaldías. Reproyectado de EPSG:32614 a 4326 y simplificado. El módulo ofrece:

- Mapa con **color distinto por cada ARCAC** (para distinguir vecinas), tooltip nombre · tenencia · alcaldía, y filtro por tenencia.
- **Tabla con búsqueda, filtros (tenencia/alcaldía) y columnas ordenables**; la tenencia se muestra como etiqueta de color (badge).
- **Ficha lateral** con mini-mapa del polígono, badge de tenencia, superficie y alcaldía.
- **Overlay activable en el mapa general** mediante un chip `ARCAC`, apagado por defecto.

> **Principio rector.** El valor oficial siempre prevalece sobre el calculado. Ej.: la superficie ZPM usa la cifra oficial de 7,534.17 ha, no la derivada del shapefile (7,550.87 ha). Los campos `Shape_Area` en unidades de grado² de shapefiles de origen ArcGIS se descartan; se usa siempre la superficie oficial en hectáreas.

## 6. Funcionalidades

### Tabs principales

| Tab | Contenido |
|---|---|
| **Global (ALL)** | Vista completa con mapa multicapa y filtros |
| **Bosques Urbanos (BU)** | 13 áreas |
| **Barrancas (BR)** | 26 áreas |
| **ANP Locales (ANPL)** | 18 áreas |
| **ANP Federales (ANPF)** | 9 áreas |
| **Zona Patrimonio (ZP)** | Módulo especial · UNESCO / Ramsar / AICA / SIPAM / embarcaderos · capas toggleables · subpestañas Declaratorias y Embarcaderos |
| **ARCAC** | Módulo especial · 30 núcleos agrarios (Comunidad/Ejido) · tabla filtrable/ordenable · color por área |
| **Análisis** | Cronología por décadas, decretos por administración electa, distribución por alcaldía |
| **Metas** | Comparativo administración anterior vs actual + brechas operativas |
| **Marco Jurídico** | Definiciones jurídicas y descarga de PDFs normativos |

### Filtros (8)

Búsqueda por nombre (insensible a acentos), tipo (AVA/ANP), jurisdicción (Local/Federal), subcategoría, alcaldía, programa de manejo (Sí/No), Suelo de Conservación, DG responsable.

### Ficha técnica de cada área

- Mapa con buscador Nominatim, fullscreen, toggle Mapa/Satélite, capa de Suelo de Conservación y botón **Ubicarme**.
- Sección **Documentos oficiales** con descarga directa al PDF del decreto y del PM cuando hay URL en el Sheet.
- Botón **Compartir enlace** con deep linking.
- Al hacer clic en una fila de tabla (inventario, ZP, ARCAC), además de abrir la ficha, el mapa hace **zoom automático** al polígono correspondiente.

### Botón "Ubicarme" (geolocalización)

Presente en todos los mapas (global, Zona Patrimonio, ARCAC y mini-mapas de ficha). Obtiene la ubicación del navegador (requiere HTTPS), la marca con precisión y detecta mediante *point-in-polygon* dentro de qué área(s) cae el usuario.

### Barra de pestañas

Las pestañas de módulos se acomodan en una **cuadrícula que envuelve en filas** (sin desplazamiento horizontal), responsiva al ancho de pantalla.

### Marco jurídico

Organizado por instrumento (Constitución CDMX, Ley Ambiental CDMX, ANP Federales) con descarga de PDFs.

## 7. Despliegue y operación

### Stack

- HTML estático + JavaScript vanilla
- [Leaflet 1.9.4](https://leafletjs.com/) para mapas
- Service Worker para caché y modo offline
- Tipografías: Roboto + Roboto Mono (Google Fonts)
- Tiles base: CartoDB Positron + Esri World Imagery

### Despliegue

Push a la rama `main` despliega automáticamente vía GitHub Pages.

```bash
git add index.html sw.js data/arcac.geojson data/embarcaderos.geojson
git commit -m "v35 · módulo ARCAC + embarcaderos + botón Ubicarme"
git push origin main
```

> El flujo operativo real es vía la **interfaz web de GitHub** (arrastrar y soltar los archivos modificados), no comandos Git locales.

### Invalidación de caché

Cualquier cambio sustantivo en datos o lógica requiere bumpear la versión del caché en `sw.js`:

```js
// sw.js
const CACHE_VERSION = 'sia-v35-2026-08-19f';   // ← incrementar fecha/sufijo
const CACHE_RUNTIME = 'sia-runtime-v35';
const CACHE_DATA    = 'sia-data-v35';

const CORE_ASSETS = [
  './', './index.html', './SIA_LOGO-03.png',
  './data/geometrias.geojson',
  './data/zona_patrimonio.geojson',
  './data/sipam_fao.geojson',
  './data/embarcaderos.geojson',
  './data/arcac.geojson',
  './data/alcaldias.geojson',
  './data/suelo_conservacion.geojson'
];
```

Sin este cambio, los usuarios con Service Worker activo seguirán viendo la versión previa hasta que expire el caché.

### Estrategias de caché

| Recurso | Estrategia |
|---|---|
| HTML, CSS, JS, imágenes propias | cache-first |
| `data/*.geojson` | cache-first (precargado en `install`) |
| Tiles de mapa (CartoDB, ArcGIS) | cache-first runtime |
| Google Sheets CSV | network-first con fallback a caché |
| Nominatim | network-only |
| Leaflet CDN, Google Fonts | cache-first runtime |

## 8. Convenciones visuales

### Paleta institucional

```css
--guinda:      #9d2148;   /* GCDMX primario · ANP Local */
--dorado:      #b28e5c;   /* AVA */
--dorado-text: #7a5d35;
--azul:        #266cb4;   /* ANP Federal */
--verde:       #027a35;   /* Bosque Urbano */
--carbon:      #444441;   /* contenedor ZPM (marco punteado) */
--rojo:        #e5074c;
--crema:       #fffdf0;
--ink:         #2a2a2a;
```

### Colores por grupo y capa

| Grupo / Capa | Color |
|---|---|
| AVA · Bosque Urbano | `#027a35` (verde) |
| AVA · Barranca | `#ac6d14` (marrón) |
| ANP · Local | `#9d2148` (guinda) |
| ANP · Federal | `#266cb4` (azul) |
| Suelo de Conservación (capa) | `#00838f` (turquesa) |
| Coadministración (capa) | `#f4c842` (amarillo) |
| Sitio Ramsar (ZP) | turquesa |
| AICA (ZP) | morado |
| Contenedor ZPM (ZP) | `#444441` (carbón, punteado) |

## 9. Mantenimiento

### Para corregir un dato (alcaldía, fecha, URL, etc.)
1. Editar la celda correspondiente en el Google Sheet.
2. Verificar que la celda quede en el formato esperado (ej. fecha en `DD/MM/AAAA` o ISO).
3. Refrescar la página en producción tras unos segundos (network-first).

### Para reemplazar la geometría de un polígono del inventario
1. Reemplazar la propiedad `geometry` de la feature en `data/geometrias.geojson`.
2. **Conservar las propiedades** (`properties`) intactas, salvo que se trate de una corrección documentada.
3. Bumpear `CACHE_VERSION` en `sw.js`.
4. Commit + push.

### Para agregar un área nueva al inventario
1. Insertar la fila en el Google Sheet con todas las columnas requeridas.
2. Agregar la feature correspondiente al GeoJSON, asegurando que `nombre` coincida exactamente.
3. Bumpear `CACHE_VERSION` en `sw.js`.
4. Commit + push.

### Para agregar una capa a un módulo especial (Zona Patrimonio / SIPAM / ARCAC)
1. Agregar la feature autocontenida al GeoJSON correspondiente (`zona_patrimonio.geojson`, `sipam_fao.geojson`, `arcac.geojson` o `embarcaderos.geojson`). No se requiere cambio de código: la rama de render aislada la levanta automáticamente.
2. Validar en QGIS: EPSG:4326, geometría 2D (sin coordenada Z). Los insumos en UTM 14N (EPSG:32614) o LCC México (EPSG:6372) deben reproyectarse a 4326 antes de integrar.
3. Bumpear `CACHE_VERSION` en `sw.js`.
4. Commit + push.

### Normalizaciones defensivas en el parser

El JS del dashboard tolera errores de captura comunes:

- `dg_responsable`: acepta variantes (`DGCORENADER`, `CORENADER`, `DGCORENADR`, `CORENADR`, `CORENA`) y normaliza a `DGSANPAVA` o `DGCORENADER`.
- Fechas: convierte `DD/MM/AAAA` → ISO automáticamente; si la fecha es inválida la celda muestra `—`.
- URLs: solo acepta `http://` o `https://`; texto como `n/a`, `pendiente`, `—` se ignora silenciosamente.
- Cálculo de antigüedad: solo opera con fechas ISO válidas en rango 1900–actual.

## 10. Datos pendientes

| Pendiente | Bloqueo | Fuente |
|---|---|---|
| URLs de decreto/PM · 9 ANP federales | Sin URL en el Sheet | DOF; 7 de 9 con decretos 1917–1938 (AGN / Hemeroteca UNAM) |

> Resueltos en versiones recientes: superficie oficial de Ramsar 1363 (2,657.00 ha), AICA 37 (2,860.32 ha) y SIPAM FAO (1,875.65 ha · 6 zonas).

## 11. Historial y versionado

| Versión | Cambios principales |
|---|---|
| **v35.5** | Eliminación del asistente de chat institucional (HTML/CSS/JS) — funcionalidad de bajo uso |
| **v35.4** | Módulo ARCAC: color distinto por área · tabla con búsqueda, filtros y orden por columnas · tenencia en badges de color · ficha con mini-mapa del polígono |
| **v35.3** | Barra de pestañas en cuadrícula (sin desplazamiento horizontal) · botón **Ubicarme** (geolocalización + detección punto-en-polígono) en todos los mapas · zoom automático al clic en tablas |
| **v35.2** | Nuevo módulo **ARCAC** (30 Áreas de Restauración y Conservación Ambiental Comunitaria) con capa propia y overlay en el mapa general · superficies oficiales de Ramsar (2,657 ha) y AICA (2,860.32 ha) |
| **v35.1** | Capa de **SIPAM FAO** con las 6 zonas chinamperas (1,875.65 ha) · capa de **embarcaderos** (Turístico/Productivo) en el módulo Zona Patrimonio |
| **v35** | Módulo **Zona Patrimonio** (tab especial aislado: contenedor ZPM UNESCO 7,534.17 ha + Ramsar 1363 + AICA 37, capas toggleables) · arquitectura de módulos aislados vía `isSpecialTab()` |
| **v34.1** | Auditoría completa: corrección de bugs en lista de coadministración (Insurgente Miguel Hidalgo y Costilla, Cerro de la Estrella federal, Lago Tláhuac-Xico) · contador dinámico · defensa de parser CSV · limpieza de 5 reglas CSS huérfanas |
| **v34** | Integración polígonos Sierra de Santa Catarina (ZCE/ZSCE) · alineación de propiedades con Sheet · cronología de administraciones electas · sección Brechas |
| v33 | Migración del inventario CSV local a Google Sheets · eliminación de `.eyebrow` |
| v32 | Marco jurídico con PDFs descargables · Convenio SEMARNAT-CONANP 2025 |

## 12. Créditos

- **Coordinación:** TIMOG · Secretaría del Medio Ambiente · Gobierno de la Ciudad de México
- **Responsable institucional:** Liber Saltijeral
- **Repositorio:** [`SedemaOficina/categorias-de-proteccion-ambiental`](https://github.com/SedemaOficina/categorias-de-proteccion-ambiental)

## 13. Licencia y uso

Plataforma de uso institucional. Los polígonos, decretos y programas de manejo son documentos públicos del Gobierno de la Ciudad de México. La cartografía base proviene de servicios públicos (CartoDB, Esri, OpenStreetMap) y se utiliza bajo sus respectivas licencias.

---

*Última actualización: agosto 2026 · v35.5*
