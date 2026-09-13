# Pendientes · SIA Dashboard

Última revisión: 13 de septiembre de 2026 (noche). **Producción (Cloudflare): v64 (`sia-v35-2026-09-13l`). Repositorio local: v67 (`…13o`, entrega 1 de la auditoría 360 del 13-sep).**

Criterio: solo entra lo que **yo no puedo resolver** —requiere tu cuenta, tu firma o una definición institucional—. Lo resuelto se borra de aquí; el historial vive en `claude/auditoria-*.md` del Proyecto y en `CLAUDE.md` del repo. Este archivo se mantiene idéntico en `pendientes/pendientes.md` (repo, no publicado) y `claude/pendientes.md` (Proyecto de Claude).

---

## A · Acciones tuyas (no hay que decidir nada)

### A7 · Correcciones al Sheet tras el cruce con las Gacetas 🟠
Cruce de 55 áreas contra el texto de las 54 Gacetas enlazadas: 33 coinciden; **22 áreas con algo que corregir** (15 fechas de decreto, 3 de PM, 5 ligas a Gacetas que no contienen el instrumento, 2 PM registrados que no existen en la Gaceta citada, la superficie de Chapultepec y la **inversión de categorías de Sierra de Santa Catarina**, ZCE ↔ ZSCE). Cuadro con la corrección exacta por celda en `pendientes/verificacion-sheet-gacetas-2026-09-13.md` (repo) / `claude/verificacion-sheet-gacetas-2026-09-13.md` (Proyecto). Tres cosas me tocan a mí en cuanto confirmes: intercambiar los nombres de los dos polígonos de Santa Catarina en `geometrias.geojson`, renombrar «Volta y Koch» → «Volta y Kotch» si decides el nombre oficial, y la columna `fecha_modificacion` si adoptas el criterio del § 3.

### A6 · 31 PDF de Drive no son públicos 🟠 (los tiene que abrir Clara)
Ninguna liga del inventario está rota, pero 31 archivos de Drive —38 ligas en 35 áreas— piden iniciar sesión a quien no seas tú. **30 son propiedad de `claraaop.16@gmail.com` y 1 (PM de Vista Hermosa) de `rm.cristian.sedema@gmail.com`**, y ninguno tiene acceso general; no puedo cambiarlos desde aquí. Corrección por el propietario: en Drive, seleccionar la **carpeta** que los contiene → *Compartir → Acceso general → Cualquier persona con el enlace → Lector* (una sola vez; los archivos heredan). Lista por área y texto para Clara en `pendientes/enlaces-2026-09-13.md` (repo) / `claude/enlaces-2026-09-13.md` (Proyecto). Alternativa si no responde: copiar los 31 a una carpeta institucional pública y yo te doy las 38 celdas nuevas del Sheet.

### A1b · Publicar v67 🟠
Commit desde GitHub Desktop: `app.js`, `sw.js`, `styles.css`, `_headers`, `CLAUDE.md` y la carpeta `pendientes/` (incluye `pendientes/arnes/aud360.mjs` y el informe `auditoria-360-2026-09-13.md` con sus capturas). Luego «Purge Everything» y comprobar que `sw.js` diga `…13o`.
Trae lo de v66 (mapa ampliado de la ficha sin controles encimados, `frame-ancestors 'self'`, `charset=utf-8`) más la **entrega 1 «campo y caché» de la auditoría 360** (`claude/auditoria-360-2026-09-13.md` § 9):
- **D7-01** · el Service Worker completa en caliente la caché de una versión que se activó sin red (cada navegación reintenta; al lograrlo purga las anteriores y la página muestra «Nueva versión disponible…»). Antes el usuario quedaba en la versión vieja hasta el siguiente bump.
- **D7-02 + D6-03** · las teselas del mapa ahora sí quedan en la caché runtime (regla `cartocdn` y capas de teselas con `crossOrigin:'anonymous'`, porque sin CORS el SW recibía respuestas opacas que nunca guardó: **en producción las teselas no se cacheaban en absoluto**, ni con la regla vieja) con tope de 600 entradas.
- **D3-01 / D3-02 / D3-05** · rotar el teléfono ya no rompe «¿Dónde estoy?» ni la ficha (un solo manejador de cambio de medio recalcula caparazón, bloqueo, hoja y resultado).
- **D2-01 + D2-03** · «Copiar liga de esta vista» abre la misma vista en celular; las ligas malformadas ya no tumban el tablero (destino, subconjunto y columna de orden se validan).
- **D6-01 / D9-01** · fuga de escuchas globales cerrada (5 click / 5 keydown constantes tras 15 fichas).
- **D4-01 / D11-01** · avisos «Copia local» e «Inventario con N inconsistencias» con estilo también en escritorio.
**Probar en el iPhone (A1c):** (1) con resultado de ubicación, girar a horizontal y volver: el resultado sigue visible y la página responde; (2) ficha abierta en horizontal → vertical: la hoja queda arriba, no desaparece; (3) Ampliar desde la ficha (pendiente de v66); (4) tras la purga, abrir el tablero con datos móviles: debe pedir teselas una vez y no volver a pedirlas al reabrir.

---

## B · Decisiones institucionales y trabajos en curso

### B2 · Segundo propietario institucional 🟠
El Google Sheet del inventario, el proyecto de Google Cloud (Places **y ahora el cliente OAuth del login con Google**) y la cuenta de Cloudflare cuelgan de cuentas personales. **Decidir qué cuenta institucional se designa copropietaria** de los tres.

### B8 · Registro de uso por persona 🟢
Access ya entrega el correo de quien entra (Insights & Logs → Access, 24 h en el plan gratuito), pero no ve qué se consulta dentro del tablero. Propuesta: el Worker recibe eventos mínimos (ficha abierta, destino, búsqueda, ubicación resuelta sin coordenada), les añade el correo de la cabecera de Access y los guarda en D1; vista «Uso» solo para ti. Condición: informar al personal que el uso queda registrado. Dime «sí» y lo entrego.

---

## Operación del acceso (referencia, no pendiente)
- **Alta de una persona:** dos lugares. (1) Cloudflare One → Access → Applications → sia → Policies → «Personal autorizado» → agregar el correo. (2) Google Cloud → Google Auth Platform → Público → Usuarios de prueba → agregar el mismo correo (la app OAuth está en modo Prueba, tope 100; sin este paso Google bloquea el botón «Google», aunque el PIN por correo sigue funcionando).
- **Baja:** quitar el correo de la política; la sesión vigente (hasta 1 mes) se puede cortar en Access → Applications → sia → Revoke existing tokens.
- Sesión: 1 mes desde el último login; al expirar, el tablero detecta la redirección y manda al login solo.

## Resuelto (13-sep) y ya fuera de la lista
Entrega 1 de la auditoría 360 (v67: D7-01, D7-02, D6-03, D3-01/02/05, D2-01, D2-03, D6-01, D4-01) · A1 pruebas de v64 en iPhone (gestos, chips, barra, login automático) · mapa ampliado con controles encimados (v66) · B7 GitHub Pages: **ya estaba apagado en GitHub** (Source: None, sin entorno; el servidor responde 404 a todo, incluido `sw.js`). Lo que «regresaba» era la copia que el Service Worker viejo guardó en cada navegador que visitó la liga; en tu Chrome ya se desregistró y se borraron sus cachés (verificado: 404). En otros dispositivos se limpia sola: al abrir la liga, el navegador busca `sw.js`, recibe 404 y elimina el registro (iPhone: cerrar la pestaña y volver a abrir; o Ajustes → Safari → Avanzado → Datos de sitios web → sedemaoficina.github.io → Eliminar) · A9 botón «Cloudflare» retirado del login · A8 pantalla de login con identidad SEDEMA (verificada) · B3 `frame-ancestors 'self'` en `_headers` (no se incrusta en portales; reversible) · B4 PGOEDF como capa general: descartado · detección de sesión expirada probada en real (copia cacheada → login solo) · B1 control de acceso (Zero Trust, política de 3 correos, One-time PIN + **Google**, detección de sesión expirada en v64, probado en celular) · A1 publicación de v64 y purga (producción en `13l`) · A2 cuotas de Google Places (incluida la «por usuario») · A2c texto «sin programa de manejo» · A4 gestos táctiles rehechos · B5 tres parciales de SC (tolerancia 5 %, `claude/sc-parciales-b5.md`) · B6 logo en alta resolución · fichas ARCAC/ZP sin scroll (`inert`) · tabla ARCAC con tenencia y filete por tenencia · segunda línea de la tabla en celular · atajos de teclado retirados · «Constancia» → «Compartir» · área más cercana rotulada antes del nombre · chip activo centrado · barra de cobertura con el color del subconjunto · bloqueo real de la página de fondo (iOS) · cápsula/chips ya no se enciman.
