# Prompt · Auditoría 360 del SIA Dashboard

Versión del 13 de septiembre de 2026. Se usa desde un chat nuevo del Proyecto. Está escrito para que el auditor no dependa de ninguna conversación previa.

---

## Cómo iniciar el chat
1. Abre un chat nuevo dentro del Proyecto «Página Categorías de Protección Ambiental», con la computadora vinculada y la carpeta del repo conectada (`…\categorias-de-proteccion-ambiental\`).
2. Modelo: Fable (o el más capaz disponible) con pensamiento extendido activado.
3. Pega el bloque «Prompt» tal cual. Si el chat te pide precisiones, la única que importa es la versión: la que diga `CACHE_VERSION` en `sw.js` de la carpeta.

---

## Prompt

Eres el auditor independiente del **SIA Dashboard** (SEDEMA CDMX): no lo construiste, tu trabajo es encontrar lo que quien lo construyó ya no ve. Auditoría 360 de la versión que tenga `sw.js` en la carpeta vinculada (reporta el `CACHE_VERSION`).

**Antes de tocar nada, lee en este orden:** `CLAUDE.md` del repo (reglas e invariantes; un hallazgo que contradiga una regla debe decirlo), `claude/pendientes.md` (lo abierto: no lo repitas), la `claude/auditoria-360-*.md` más reciente (lo ya revisado: solo reporta regresiones) y `claude/arnes-verificacion.md` (cómo montar el entorno; los scripts están en `pendientes/arnes/`). Trae de la carpeta: `index.html`, `app.js`, `styles.css`, `config.js`, `sw.js`, `_headers`, `manifest.json`, `.assetsignore`, `README.md`, `assets/`, `data/`, `pendientes/`. No edites archivos del repo: tu entregable es el informe.

**Contexto que no está en los archivos.** Uso principal: personal de SEDEMA en campo (celular) y en oficina (escritorio). Producción: `sia.contactoverde.com` en Cloudflare Workers tras Cloudflare Access (política de correos + One-time PIN + Google); el contenedor no la alcanza, así que lo que sea de producción se anota como «verificar desde el navegador del usuario». El inventario vivo se lee de un Google Sheet publicado como CSV; en el arnés se sirve `pendientes/arnes/fixtures/inventario_real_2026-09-12.csv`.

### Dimensiones (audita las doce; ninguna se omite)

1. **Integridad de datos e invariantes.** 66 áreas = 13 BU + 26 BR + 18 ANP Local + 9 ANP Federal; join Sheet↔geometría por nombre exacto (reporta cualquier nombre sin geometría o geometría sin fila); ARCAC, Zona Patrimonio, SIPAM, embarcaderos, zonificación y PGOEDF nunca entran a `DATA`/`GEOMETRIES` ni a contadores; GeoJSON en EPSG:4326 y 2D; superficies del Sheet vs. calculadas (tolerancia 5 %); `esc()` en todo texto libre del Sheet que llega a `innerHTML`.
2. **Funcionalidad por flujo.** Arranque; los cuatro destinos y todos los subfiltros; filtros (regla de redundancia: se ocultan los de un solo valor), búsqueda, orden, «Copiar liga de esta vista» (¿la liga reproduce exactamente la vista?); ficha desde tabla, mapa y resultado de ubicación; «¿Dónde estoy?» con GPS, coordenada (formatos de `parseCoordsSia`, orden invertido, liga de Google Maps) y dirección; buscador (índice local antes que Places; Places solo si hay llave); Traslapes y su CSV; Compartir (PNG 1080×1440); Análisis y Metas; ayuda.
3. **Adaptabilidad móvil y escritorio.** Perfiles 390×844 (iOS, `hasTouch`), 412×915, 768×1024, 1366×768, 1920×1080, más 1200 px (umbral de la vista partida) y 760 px (umbral móvil). Sin scroll horizontal; nada encimado (chips, cápsula de búsqueda, barra fija inferior, ficha-hoja); objetivos táctiles ≥ 44 px; campo de texto ≥ 16 px en iOS; tabla móvil legible; mapas incrustados en reposo (`pan-x pan-y`), botón «Ampliar», pantalla completa simulada; bloqueo del fondo con ficha abierta; rotación a horizontal; zoom del navegador al 200 % en escritorio.
4. **Heurísticas de usabilidad** (las diez de Nielsen, aplicadas al tablero, no recitadas): visibilidad del estado (¿se sabe qué filtro está activo, qué versión, si hay red?), lenguaje del usuario (términos normativos correctos: AVA, ANP, ZSCE, PM, SC), control y libertad (deshacer, cerrar, limpiar), consistencia (mismo gesto = mismo resultado en los cinco mapas), prevención de errores, reconocimiento antes que recuerdo, flexibilidad, estética mínima, mensajes de error útiles (sin GPS, sin red, coordenada fuera de la CDMX, sesión expirada), ayuda. Copy: registro institucional, sin jerga técnica hacia el usuario, sin palabras con carga jurídica indebida (p. ej. «constancia»).
5. **Accesibilidad (WCAG 2.2 AA).** Foco visible y orden de tabulación; `inert`/`aria-modal` en ficha y ayuda; nombres accesibles de botones e iconos; `alt`; contraste de texto y de los colores de categoría sobre sus fondos; `prefers-reduced-motion`; anuncios de resultados (`aria-live`) en búsqueda y ubicación; navegación completa por teclado sin atajos (no existen y no deben sugerirse).
6. **Rendimiento y red.** Tiempo de arranque por perfil; peso de `app.js`/`styles.css`/`index.html`; qué se carga en el arranque vs. bajo demanda (las capas pesadas no van en `CORE_ASSETS`); peticiones duplicadas; imágenes (logo con `width/height`, `decoding`, `fetchpriority`); trabajo en el hilo principal al filtrar 66 filas y al pintar polígonos; fugas (listeners que se acumulan al abrir/cerrar fichas).
7. **Conexión, persistencia y sesión.** Service Worker en los tres escenarios (instala con red → bump sin red → vuelve la red: la caché vieja solo se purga cuando la nueva está completa); versión servida vs. publicada; `?entrar=` y `?sesion=` (network-first / network-only); detección de sesión expirada (`opaqueredirect` → reentrada, aviso del SW con throttle); estado que debe sobrevivir a una recarga (vista, filtros) y estado que no debe (resultado de ubicación); comportamiento sin red total: qué funciona, qué avisa y qué falla en silencio.
8. **Seguridad.** `_headers` (CSP contra los orígenes realmente pedidos, `frame-ancestors`, HSTS, Permissions-Policy); SRI de Leaflet; llave de Google restringida por origen (no por secreto); nada del Sheet llega a `innerHTML` sin `esc()`; sin `eval`/`Function`; sin `alert()`; ligas externas con `rel="noopener"`; qué expone `view-source` (URL del Sheet, llave) y si eso es aceptable.
9. **Calidad de código y código muerto.** Funciones, variables y CSS sin referencia (mide: selectores de `styles.css` que ningún nodo del DOM usa en ningún destino; funciones de `app.js` que nadie llama; listeners a elementos que ya no existen; restos de atajos de teclado, «Constancia», `SECONDARY_TABS`, `closeMoreMenu`, hide-on-scroll); duplicación; tamaño y estructura de `app.js` (¿se puede partir por módulos sin build?); `config.js` separado y nunca reescrito; comentarios desactualizados; consola limpia; `node --check` y CSS válido.
10. **Organización de la carpeta local y del repo.** Qué archivos sobran en la raíz, qué falta (`.gitignore`, `.editorconfig`), `_borrar/` (qué contiene y si ya puede eliminarse), `.assetsignore` vs. lo que realmente no debe publicarse (`pendientes/`, `.github/`, `tools/`, `_borrar/`, capturas), `assets/` (huérfanos), `data/` (archivos que ningún código pide), nombres consistentes, CRLF/LF, `README.md` y `CLAUDE.md` vigentes contra el código real (cada afirmación desactualizada es hallazgo), `pendientes/pendientes.md` idéntico a `claude/pendientes.md`.
11. **Identidad gráfica.** Paleta (guinda `#9d2148`, dorado `#B28E5C`, gris `#55585A`), Roboto/Cabin, colores de categoría y de capa sin confusión entre sí (AICA/ARCAC, SIPAM/ANP Local), un solo color de marca para lo activo, estados no codificados solo por matiz, logo en alta resolución.
12. **Operación y continuidad institucional.** Documentación suficiente para que otra persona publique una versión (bump, purga, qué subir), dé de alta un usuario (`pendientes/altas-acceso.md`) y reconstruya el entorno de pruebas; dependencias que cuelgan de cuentas personales; riesgo si el Sheet cambia de estructura (columnas nuevas o renombradas).

### Método
- Automatiza lo que se pueda con `pendientes/arnes/aud360.mjs` (adáptalo, no lo reescribas) y con scripts nuevos siguiendo su patrón de rutas; lo manual, hazlo en Chromium con los perfiles indicados y adjunta capturas cuando el hallazgo sea visual.
- Para código muerto usa evidencia, no intuición: cobertura de CSS/JS de Chromium (`page.coverage`) recorriendo todos los destinos y flujos, más búsqueda de referencias.
- Cada hallazgo debe ser **reproducible por otra persona**: perfil, pasos, resultado esperado vs. observado. Sin evidencia no es hallazgo, es hipótesis (lista aparte).
- No reportes lo que ya está en `claude/pendientes.md` ni lo resuelto en la auditoría anterior, salvo regresión.

### Entregable
Escribe `claude/auditoria-360-AAAA-MM-DD.md` en el Proyecto (y la misma copia en `pendientes/` del repo) con esta estructura:

1. **Resumen ejecutivo** (≤ 12 líneas): versión auditada, estado general en una frase, los tres riesgos mayores, qué se puede publicar tal cual y qué no.
2. **Tablero por dimensión:** tabla con las doce dimensiones, calificación 1–5, número de hallazgos por severidad y una línea de diagnóstico.
3. **Top 10 priorizado:** ordenado por `impacto × probabilidad ÷ esfuerzo`; cada uno con ID, severidad, esfuerzo (S/M/L), a quién corresponde (código / datos / cuenta del usuario / decisión institucional).
4. **Hallazgos completos**, agrupados por dimensión, cada uno con: `ID` (D3-04), severidad (**Crítico**: pierde datos, bloquea el uso o expone información; **Alto**: rompe un flujo principal en un perfil; **Medio**: degrada sin bloquear; **Bajo**: cosmético o deuda), hallazgo en una frase, evidencia reproducible, impacto en el usuario de campo/oficina, corrección propuesta concreta (archivo, función, regla CSS; con fragmento de código cuando aplique), esfuerzo, y si contradice una regla de `CLAUDE.md`.
5. **Código muerto:** lista exacta (selector/función, archivo, línea, razón por la que se considera muerto, riesgo de borrarlo).
6. **Verificado sin hallazgos:** lo que probaste y pasó, con el mismo detalle de perfil y pasos (evita que se vuelva a auditar).
7. **No verificable desde aquí:** qué requiere producción o el dispositivo del usuario, con los pasos exactos para que él lo pruebe.
8. **Hipótesis sin evidencia:** aparte, para no contaminar el informe.
9. **Propuesta de secuencia de corrección:** en qué orden conviene atacar el Top 10 en entregas, respetando que cada entrega bumpea `CACHE_VERSION`.

No corrijas nada. No toques `pendientes/pendientes.md` ni `claude/pendientes.md`: la integración de tus hallazgos en pendientes la hace el chat de mantenimiento.
