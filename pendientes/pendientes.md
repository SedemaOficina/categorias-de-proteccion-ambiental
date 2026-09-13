# Pendientes · SIA Dashboard

Última revisión: 13 de septiembre de 2026 (noche). **Producción (Cloudflare): v68 (`sia-v35-2026-09-13p`, publicada y purgada el 13-sep en la noche). Repositorio local: v69 (`…13q`, entrega 3 de la auditoría 360).**

Criterio: solo entra lo que **yo no puedo resolver** —requiere tu cuenta, tu firma o una definición institucional—. Lo resuelto se borra de aquí; el historial vive en `claude/auditoria-*.md` del Proyecto y en `CLAUDE.md` del repo. Este archivo se mantiene idéntico en `pendientes/pendientes.md` (repo, no publicado) y `claude/pendientes.md` (Proyecto de Claude).

---

## A · Acciones tuyas (no hay que decidir nada)

### A7 · Correcciones al Sheet tras el cruce con las Gacetas 🟠
Cruce de 55 áreas contra el texto de las 54 Gacetas enlazadas: 33 coinciden; **22 áreas con algo que corregir** (15 fechas de decreto, 3 de PM, 5 ligas a Gacetas que no contienen el instrumento, 2 PM registrados que no existen en la Gaceta citada, la superficie de Chapultepec y la **inversión de categorías de Sierra de Santa Catarina**, ZCE ↔ ZSCE). Cuadro con la corrección exacta por celda en `pendientes/verificacion-sheet-gacetas-2026-09-13.md` (repo) / `claude/verificacion-sheet-gacetas-2026-09-13.md` (Proyecto). Tres cosas me tocan a mí en cuanto confirmes: intercambiar los nombres de los dos polígonos de Santa Catarina en `geometrias.geojson`, renombrar «Volta y Koch» → «Volta y Kotch» si decides el nombre oficial, y la columna `fecha_modificacion` si adoptas el criterio del § 3.

### A6 · 31 PDF de Drive no son públicos 🟠 (los tiene que abrir Clara)
Ninguna liga del inventario está rota, pero 31 archivos de Drive —38 ligas en 35 áreas— piden iniciar sesión a quien no seas tú. **30 son propiedad de `claraaop.16@gmail.com` y 1 (PM de Vista Hermosa) de `rm.cristian.sedema@gmail.com`**, y ninguno tiene acceso general; no puedo cambiarlos desde aquí. Corrección por el propietario: en Drive, seleccionar la **carpeta** que los contiene → *Compartir → Acceso general → Cualquier persona con el enlace → Lector* (una sola vez; los archivos heredan). Lista por área y texto para Clara en `pendientes/enlaces-2026-09-13.md` (repo) / `claude/enlaces-2026-09-13.md` (Proyecto). Alternativa si no responde: copiar los 31 a una carpeta institucional pública y yo te doy las 38 celdas nuevas del Sheet.

### A1d · Publicar v69 🟠
Commit desde GitHub Desktop: `index.html`, `app.js`, `sw.js`, `styles.css`, `CLAUDE.md` y `pendientes/`. Luego «Purge Everything» y comprobar `sw.js` en `…13q` (en incógnito si la ventana normal da `ERR_FAILED`: es el bloqueo de la extensión al retorno del login). **Entrega 3 «accesibilidad y escritorio»** de la auditoría 360: D5-01 la tabla principal se ordena con teclado (Enter/Espacio en los encabezados, `aria-sort`); D5-02 los polígonos de todos los mapas salen del orden de tabulación (antes 82 rutas sin nombre antes de llegar a la tabla); D5-03 el resultado de «¿Dónde estoy?» es región viva; D5-04 número legible sobre el naranja de ANP Local en el reparto por alcaldía; D5-05 el asa de la ficha se mueve con flechas/Inicio/Fin y anuncia su posición; D5-06 los desplazamientos de JS respetan «reducir movimiento»; D2-02 los toggles Mapa/Satélite de la ficha y del mapa global ya no se cruzan ni acumulan escuchas; D4-02 el pie muestra la versión instalada («Versión del tablero: 2026-09-13q»); D4-03 los nombres truncados llevan `title`; D3-03/D3-04 objetivos táctiles de 44 px en tabletas y teléfonos en horizontal (chips, buscador, ayuda, destinos).

### A1c · Probar v68/v69 en tu iPhone 🟠
Publicación hecha (v68 en producción, purga confirmada). Lo que el arnés no puede reproducir:
(1) con resultado de ubicación, girar a horizontal y volver: el resultado sigue visible y la página responde; (2) ficha abierta en horizontal → vertical: la hoja queda arriba; (3) Ampliar desde la ficha (v66); (4) tras la purga, con datos móviles: las teselas se piden una vez y no se vuelven a pedir al reabrir; (5) modo avión → «¿Dónde estoy?» con un punto: el resultado debe traer el aviso «Resultado incompleto…» si alguna capa no estaba cacheada.

---

## B · Decisiones institucionales y trabajos en curso

### B2 · Segundo propietario institucional 🟠
El Google Sheet del inventario, el proyecto de Google Cloud (Places **y ahora el cliente OAuth del login con Google**) y la cuenta de Cloudflare cuelgan de cuentas personales. **Decidir qué cuenta institucional se designa copropietaria** de los tres.

### B9 · Cifras de la tabla del Convenio Marco 🟠
Desde v68 (auditoría D1-05) la tabla «Convenio Marco · Áreas en coadministración» (Análisis → Marco jurídico) lee nombres, fechas y superficies del **inventario**, no del anexo del Convenio: Insurgente Miguel Hidalgo y Costilla 525.05 ha (el Convenio decía 1,889.96), Cerro de la Estrella 1,100.00 (1,183.33), Cumbres del Ajusco 26/08/1936 (23/09/1936), total acumulado 10,409.67 ha (11,857.90). **Decidir** si la tabla debe reproducir el texto del Convenio tal cual (se regresa a valores literales con la fuente citada) o quedarse con el inventario como está.

### B8 · Registro de uso por persona 🟢
Access ya entrega el correo de quien entra (Insights & Logs → Access, 24 h en el plan gratuito), pero no ve qué se consulta dentro del tablero. Propuesta: el Worker recibe eventos mínimos (ficha abierta, destino, búsqueda, ubicación resuelta sin coordenada), les añade el correo de la cabecera de Access y los guarda en D1; vista «Uso» solo para ti. Condición: informar al personal que el uso queda registrado. Dime «sí» y lo entrego.

---

## Operación del acceso (referencia, no pendiente)
- **Alta de una persona:** dos lugares. (1) Cloudflare One → Access → Applications → sia → Policies → «Personal autorizado» → agregar el correo. (2) Google Cloud → Google Auth Platform → Público → Usuarios de prueba → agregar el mismo correo (la app OAuth está en modo Prueba, tope 100; sin este paso Google bloquea el botón «Google», aunque el PIN por correo sigue funcionando).
- **Baja:** quitar el correo de la política; la sesión vigente (hasta 1 mes) se puede cortar en Access → Applications → sia → Revoke existing tokens.
- Sesión: 1 mes desde el último login; al expirar, el tablero detecta la redirección y manda al login solo.

## Resuelto (13-sep) y ya fuera de la lista
Entrega 3 de la auditoría 360 (v69: D5-01…D5-06, D2-02, D4-02, D4-03, D3-03, D3-04) · A1b publicación de v68 y purga (producción en `13p`) · Entregas 1 y 2 de la auditoría 360 (v67: D7-01, D7-02, D6-03, D3-01/02/05, D2-01, D2-03, D6-01, D4-01 · v68: D12-01, D1-01, D1-02, D1-05, D2-04, D2-05, D2-06, D2-07, D2-08) · A1 pruebas de v64 en iPhone (gestos, chips, barra, login automático) · mapa ampliado con controles encimados (v66) · B7 GitHub Pages: **ya estaba apagado en GitHub** (Source: None, sin entorno; el servidor responde 404 a todo, incluido `sw.js`). Lo que «regresaba» era la copia que el Service Worker viejo guardó en cada navegador que visitó la liga; en tu Chrome ya se desregistró y se borraron sus cachés (verificado: 404). En otros dispositivos se limpia sola: al abrir la liga, el navegador busca `sw.js`, recibe 404 y elimina el registro (iPhone: cerrar la pestaña y volver a abrir; o Ajustes → Safari → Avanzado → Datos de sitios web → sedemaoficina.github.io → Eliminar) · A9 botón «Cloudflare» retirado del login · A8 pantalla de login con identidad SEDEMA (verificada) · B3 `frame-ancestors 'self'` en `_headers` (no se incrusta en portales; reversible) · B4 PGOEDF como capa general: descartado · detección de sesión expirada probada en real (copia cacheada → login solo) · B1 control de acceso (Zero Trust, política de 3 correos, One-time PIN + **Google**, detección de sesión expirada en v64, probado en celular) · A1 publicación de v64 y purga (producción en `13l`) · A2 cuotas de Google Places (incluida la «por usuario») · A2c texto «sin programa de manejo» · A4 gestos táctiles rehechos · B5 tres parciales de SC (tolerancia 5 %, `claude/sc-parciales-b5.md`) · B6 logo en alta resolución · fichas ARCAC/ZP sin scroll (`inert`) · tabla ARCAC con tenencia y filete por tenencia · segunda línea de la tabla en celular · atajos de teclado retirados · «Constancia» → «Compartir» · área más cercana rotulada antes del nombre · chip activo centrado · barra de cobertura con el color del subconjunto · bloqueo real de la página de fondo (iOS) · cápsula/chips ya no se enciman.
