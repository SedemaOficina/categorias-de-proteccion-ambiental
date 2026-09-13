# Pendientes · SIA Dashboard

Última revisión: 13 de septiembre de 2026 (noche). **Producción (Cloudflare): `sia-v35-2026-09-13i`. Repositorio local: v64 (`…13l`).**

Criterio: solo entra lo que **yo no puedo resolver** —requiere tu cuenta, tu firma o una definición institucional—. Lo resuelto se borra de aquí; el historial vive en `claude/auditoria-*.md` del Proyecto y en `CLAUDE.md` del repo. Este archivo se mantiene idéntico en `pendientes/pendientes.md` (repo, no publicado) y `claude/pendientes.md` (Proyecto de Claude).

---

## A · Acciones tuyas (no hay que decidir nada)

### A1 · Publicar v64 🔴
Commit único desde GitHub Desktop: `app.js`, `styles.css`, `sw.js`, `index.html`, `CLAUDE.md`, `README.md`, `assets/logo-sedema.png`, `.assetsignore`, carpeta `pendientes/` (más lo que quedara sin subir de v51–v55: `_headers`, `.assetsignore`, `manifest.json`, `assets/icon-*.png`, `data/*.geojson`, `data/pgoedf_areas.json`). Luego «Purge Everything» en Cloudflare y comprobar que `sw.js` diga `sia-v35-2026-09-13l`.

**Probar en tu iPhone tras la purga (lo que el arnés no puede reproducir):**
1. Ficha: un dedo desplaza la ficha aunque pase por el mapa; dos dedos mueven el mapa; «Ampliar» (bajo el botón de capas) da el mapa completo con un dedo; la página de atrás ya no se mueve.
2. Inventario: al bajar, solo la tira de chips queda fija arriba; nada se encima con la cápsula de búsqueda, tampoco en el rebote del final.
3. Chip elegido queda centrado en la tira.
4. Barra de cobertura de programas de manejo con el color del subconjunto.

### A7 · Correcciones al Sheet tras el cruce con las Gacetas 🟠
Cruce de 55 áreas contra el texto de las 54 Gacetas enlazadas: 33 coinciden; **22 áreas con algo que corregir** (15 fechas de decreto, 3 de PM, 5 ligas a Gacetas que no contienen el instrumento, 2 PM registrados que no existen en la Gaceta citada, la superficie de Chapultepec y la **inversión de categorías de Sierra de Santa Catarina**, ZCE ↔ ZSCE). Cuadro con la corrección exacta por celda en `pendientes/verificacion-sheet-gacetas-2026-09-13.md` (repo) / `claude/verificacion-sheet-gacetas-2026-09-13.md` (Proyecto). Absorbe el antiguo A2b (Atzoyapan). Tres cosas me tocan a mí en cuanto confirmes: intercambiar los nombres de los dos polígonos de Santa Catarina en `geometrias.geojson`, renombrar «Volta y Koch» → «Volta y Kotch» si decides el nombre oficial, y la columna `fecha_modificacion` si adoptas el criterio del § 3.

### A6 · 31 PDF de Drive no son públicos 🟠 (los tiene que abrir Clara)
Ninguna liga del inventario está rota, pero 31 archivos de Drive —38 ligas en 35 áreas— piden iniciar sesión a quien no seas tú. Revisé los permisos con el conector de Drive: **30 son propiedad de `claraaop.16@gmail.com` y 1 (PM de Vista Hermosa) de `rm.cristian.sedema@gmail.com`**, y ninguno tiene acceso general; por eso no puedo cambiarlos desde aquí (el conector solo comparte con correos concretos y no soy propietario). Corrección por el propietario: en Drive, seleccionar la **carpeta** que los contiene → *Compartir → Acceso general → Cualquier persona con el enlace → Lector* (una sola vez; los archivos heredan). Lista por área y texto para Clara en `pendientes/enlaces-2026-09-13.md` (repo) / `claude/enlaces-2026-09-13.md` (Proyecto). Alternativa si no responde: copiar los 31 a una carpeta institucional pública y yo te doy las 38 celdas nuevas del Sheet.

---

## B · Decisiones institucionales y trabajos en curso

### B1 · Control de acceso 🟢 activo · cierre
**Hecho (13-sep):** Zero Trust Free, team `sedema-sia`; aplicación `sia.contactoverde.com` con política «Personal autorizado» (3 correos) y One-time PIN; verificado desde fuera que todo redirige al login. v64 (`13l`) trae la detección de sesión expirada en app.js/sw.js. **Falta:** (1) subir v64; (2) probar en el celular: pestaña privada → correo → código; correo no autorizado rechazado; Safari normal con la copia cacheada debe llevarte al login solo; (3) personalizar la pantalla (Reusable components → Custom pages → Login page) y el nombre de la aplicación (Applications → sia → Details → Name); (4) Google como método de entrada, más adelante (Integrations → Identity providers; pasos en el chat del 13-sep). Registros: Insights & Logs → Access, 24 h en el plan gratuito.

### B2 · Segundo propietario institucional 🟠
El Google Sheet del inventario, el proyecto de Google Cloud y la cuenta de Cloudflare cuelgan de cuentas personales. **Decidir qué cuenta institucional se designa copropietaria** de los tres.

### B3 · ¿El tablero se incrusta en algún portal? 🟡
Define la cabecera `frame-ancestors`. Si la respuesta es «no», la añado como `'self'`. Si algún portal de SEDEMA o de la Ciudad lo va a incrustar, dime cuál y lo permito.

### B4 · PGOEDF como capa del mapa general 🟢
Ya se consulta por punto y por área. Dibujarlo como capa general con leyenda de 12 zonas son 956 KB bajo demanda. **Recomendación:** no, salvo que lo pida un uso concreto.

### B7 · GitHub Pages volvió a publicarse solo 🟠
«Unpublish site» solo retira el despliegue vigente; la fuente sigue en *Deploy from a branch → main*, así que cada push republica `sedemaoficina.github.io/categorias-de-proteccion-ambiental/` como espejo no controlado. Dos salidas:
- **Apagar de verdad:** Settings → Pages → *Build and deployment* → Branch: **None** → Save; luego Settings → Environments → borrar `github-pages`.
- **Convertirla en redirección** (si la liga vieja circuló en oficios): rama `gh-pages` con un solo `index.html` que redirige a `sia.contactoverde.com`; cambias la fuente de Pages a esa rama. Dime «sí» y lo entrego.

### B8 · Registro de uso por persona 🟢
Access no ve qué se consulta dentro del tablero. Propuesta: el Worker recibe eventos mínimos (ficha abierta, destino, búsqueda, ubicación resuelta sin coordenada), les añade el correo que Access entrega en la cabecera y los guarda en D1; vista «Uso» solo para ti. Condición: informar al personal que el uso queda registrado. Se hace después de activar Access.

---

## Resuelto hoy (13-sep) y ya fuera de la lista
A2 cuotas de Google Places (incluida la «por usuario») · A2c texto «sin programa de manejo» · A4 gestos táctiles rehechos (pendiente solo tu prueba en A1) · B5 tres parciales de SC (tolerancia 5 %, `claude/sc-parciales-b5.md`) · B6 logo en alta resolución · fichas ARCAC/ZP sin scroll (`inert`) · tabla ARCAC con tenencia y filete por tenencia · segunda línea de la tabla en celular · atajos de teclado retirados · «Constancia» → «Compartir» · área más cercana rotulada antes del nombre · chip activo centrado · barra de cobertura con el color del subconjunto · bloqueo real de la página de fondo (iOS) · cápsula/chips ya no se enciman.
