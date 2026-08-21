# Auditoría integral · Sistema de Información Ambiental (SIA)

**Repositorio:** `jorgeliber28/Categorias_Proteccion_Ambiental-` · **Versión auditada:** `sia-v35-2026-08-19f`
**Alcance:** análisis estático de `index.html`, `sw.js` y 7 capas GeoJSON. **Método:** extracción de JS/CSS, `node --check`, validación de geometrías, verificación referencial código↔datos, conteo de vértices y payload.

---

## Dictamen general

**Estado: SÓLIDO, apto para producción, con 1 corrección de datos prioritaria.**

La arquitectura es robusta: los módulos especiales están correctamente aislados del inventario, la integridad referencial es total y las geometrías son válidas. Se detectó **un hallazgo crítico de datos** (capa de embarcaderos en versión de ejemplo) y algunas mejoras de seguridad y rendimiento recomendables.

| Dimensión | Dictamen |
|---|---|
| Integridad HTML/JS | ✅ Correcto |
| Integridad de datos (GeoJSON) | ⚠️ 1 crítico (embarcaderos placeholder) |
| Invariante del inventario (66/39/27) | ✅ Intacto |
| Integridad referencial código↔datos | ✅ 100% |
| Aislamiento arquitectónico de módulos | ✅ Impecable |
| Service Worker / offline | ✅ Coherente |
| Seguridad | ⚠️ 2 medios (SRI, innerHTML) |
| Accesibilidad | ✅ Base sólida |
| Rendimiento / payload | 🟡 1 optimización sugerida |
| Consistencia / naming | ✅ Correcto |

---

## Hallazgos por severidad

### 🔴 Crítico

**H-1 · La capa de embarcaderos en el repo es el archivo de EJEMPLO, no los datos reales.**
`data/embarcaderos.geojson` contiene **2 features** llamadas *"EJEMPLO — reemplazar (turístico)"* y *"...(productivo)"*, sin campo `alcaldia`. El módulo Zona Patrimonio muestra 2 puntos ficticios en lugar de los **89 embarcaderos reales** (71 productivos + 18 turísticos) procesados previamente.
**Acción:** subir el `embarcaderos.geojson` real (89 puntos, con alcaldía) a `data/`. Bumpear `CACHE_VERSION`.

### 🟡 Medio

**H-2 · Leaflet se carga desde unpkg sin SRI (Subresource Integrity).**
Riesgo de cadena de suministro: si el CDN se comprometiera, se ejecutaría JS arbitrario. Solo 2 recursos externos tienen `integrity`.
**Acción:** agregar `integrity` + `crossorigin` al `<script>`/`<link>` de Leaflet, o auto-hospedar `leaflet.js`/`leaflet.css` en el repo.

**H-3 · 33 asignaciones `.innerHTML` con interpolación de datos del Sheet/GeoJSON.**
Frontera de confianza: si una celda del Google Sheet (editable por personal) contuviera `<img onerror=...>` o `<script>`, se ejecutaría (XSS almacenado). Riesgo bajo hoy (fuente semiconfiable), pero latente.
**Acción:** escapar los campos de texto libres editables antes de insertarlos (una función `esc()` de 3 líneas), o documentar formalmente que el Sheet es fuente confiable con control de acceso.

### 🟢 Menor / observación

**H-4 · Payload inicial ~1.2 MB de GeoJSON precacheado.** `sipam_fao` (457 KB) y `arcac` (285 KB) se precargan en `install` aunque el usuario no abra esos módulos; además ya se cargan bajo demanda al abrir su pestaña.
**Acción (opcional):** moverlos de `CORE_ASSETS` a caché runtime → primera carga ~740 KB más ligera. *Trade-off:* esos módulos no estarían offline hasta abrirlos una vez.

**H-5 · Restos de depuración:** 3 `console.log` y 2 `alert()` nativos (mensajes del botón "Ubicarme"). **Acción (opcional):** retirar `console.log`; sustituir `alert` por un aviso visual no bloqueante.

**H-6 · `getElementById('offlineNotice')` — verificado sano.** El elemento se crea dinámicamente (`notice.id = 'offlineNotice'`); no es una referencia huérfana. Sin acción.

---

## Fortalezas confirmadas

- **Aislamiento arquitectónico impecable.** `ARCAC_GEO`, `ZP_DESIGNACIONES` y `EMBARCADEROS` **no contaminan** `DATA` ni `GEOMETRIES`. Por construcción, el inventario permanece en 66.
- **Invariante 66/39/27 intacto:** 66 features · 39 AVA (13 Bosque Urbano + 26 Barranca) · 27 ANP (18 Local + 9 Federal). Sin nombres duplicados.
- **Integridad referencial total:** las 7 áreas de `ZP_INVENTARIO` y las 8 de `COADMIN_AREAS` existen exactamente en `geometrias.geojson` (match por Set, no `includes()`).
- **Geometrías válidas:** las 7 capas en EPSG:4326, 2D, sin coordenada Z.
- **Service Worker coherente:** 9 `CORE_ASSETS`, todos existen; ningún GeoJSON del repo queda sin precachear; versiones alineadas (`v35-…f` / `runtime-v35` / `data-v35`).
- **HTML sano:** DOCTYPE, `lang`, `charset UTF-8`, `viewport`, `<title>`, `meta description`; scripts balanceados (2/2).
- **Sin deuda evidente:** 0 `TODO/FIXME`, 0 funciones zombie detectadas, `Tempiluli` canónico (sin variantes), 0 `target=_blank` sin `noopener`.

---

## Plan de remediación priorizado

| # | Hallazgo | Severidad | Acción | Esfuerzo |
|---|---|---|---|---|
| H-1 | Embarcaderos placeholder | 🔴 Crítico | Subir `embarcaderos.geojson` real (89 pts) + bump SW | Bajo |
| H-2 | Leaflet sin SRI | 🟡 Medio | Agregar `integrity` o auto-hospedar | Bajo |
| H-3 | `innerHTML` sin escape | 🟡 Medio | Función `esc()` en campos del Sheet | Medio |
| H-4 | Payload precache | 🟢 Menor | Mover sipam/arcac a runtime cache | Bajo |
| H-5 | Logs/alert de depuración | 🟢 Menor | Limpiar `console.log`; toast en vez de `alert` | Bajo |

---

## Métricas del sistema

| Métrica | Valor |
|---|---|
| `index.html` | 271 KB · 80 funciones · 4,476 líneas |
| GeoJSON precargado (total) | 1,202 KB |
| Vértices: geometrias / sipam / arcac | 13,848 / 11,136 / 11,396 |
| PDFs normativa (bajo demanda) | 10.5 MB |
| Inventario | 66 áreas (39 AVA + 27 ANP) |
| Módulos especiales | ZP (UNESCO/Ramsar/AICA/SIPAM/embarcaderos) · ARCAC (30) |

*Auditoría generada sobre la versión limpia sin asistente de chat · agosto 2026.*

---

## Bitácora de remediación · v35-…g

| # | Hallazgo | Estado | Resolución |
|---|---|---|---|
| H-1 | Embarcaderos placeholder | ⏸ **Diferido (decisión operativa)** | El shapefile de julio no resultó dato válido; la capa se mantiene como **ejemplo (2 puntos)** hasta contar con un insumo real verificado |
| H-2 | Leaflet sin SRI | ✅ **No aplica** | Falso positivo: Leaflet CSS y JS **ya tenían** `integrity` + `crossorigin` (líneas 38-39). Único recurso externo ejecutable, ya protegido |
| H-3 | `innerHTML` sin escape | ✅ **Mitigado** | Añadida función `esc()`; aplicada a los campos de texto libre del Sheet (`nombre`, `categoria`, `alcaldia`) en la tabla del inventario y en la ficha |
| H-4 | Payload precache | ✅ **Resuelto** | `sipam_fao`, `arcac` y `embarcaderos` fuera de `CORE_ASSETS` → install ~740 KB más ligero; se cachean runtime al abrir su pestaña |
| H-5 | Logs/alert de depuración | ✅ **Resuelto** | Eliminados 3 `console.log`; 2 `alert()` sustituidos por aviso visual `siaToast()` no bloqueante |

**Resultado:** 4 hallazgos cerrados · H-1 diferido por decisión operativa (datos reales pendientes). Versión de caché `sia-v35-2026-08-19g`. Validación `node --check` sin errores.
