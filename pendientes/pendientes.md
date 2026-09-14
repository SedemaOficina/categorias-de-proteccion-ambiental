# Pendientes · SIA Dashboard

Última revisión: 14 de septiembre de 2026 (noche). Solo quedan asuntos abiertos; lo resuelto se retiró de esta lista y vive en `CLAUDE.md` y en `claude/auditoria-*.md`. **Producción (Cloudflare): v75 (`sia-v35-2026-09-14e`), publicada el 14-sep y verificada en GitHub `main`.** Repositorio local: v77 (`sia-v35-2026-09-14g`: menú de capas con desplazamiento real en celular; pendiente de publicar). v76 (`14f`) publicada el 14-sep.

Criterio: solo entra lo que **yo no puedo resolver** —requiere tu cuenta, tu firma o una definición institucional—. Lo resuelto se borra de aquí; el historial vive en `claude/auditoria-*.md` del Proyecto y en `CLAUDE.md` del repo. Este archivo se mantiene idéntico en `pendientes/pendientes.md` (repo, no publicado) y `claude/pendientes.md` (Proyecto de Claude).

---

## A · Acciones tuyas (no hay que decidir nada)

### A7 · Correcciones al Sheet tras el cruce con las Gacetas 🟠 · nota enviada al área (14-sep)
Cruce de 55 áreas contra el texto de las 54 Gacetas enlazadas: 33 coinciden; **22 áreas con algo que corregir** (15 fechas de decreto, 3 de PM, 5 ligas a Gacetas que no contienen el instrumento, 2 PM registrados que no existen en la Gaceta citada, la superficie de Chapultepec y la **inversión de categorías de Sierra de Santa Catarina**, ZCE ↔ ZSCE). Cuadro con la corrección exacta por celda en `pendientes/verificacion-sheet-gacetas-2026-09-13.md` (repo) / `claude/verificacion-sheet-gacetas-2026-09-13.md` (Proyecto). Tres cosas me tocan a mí en cuanto confirmes: intercambiar los nombres de los dos polígonos de Santa Catarina en `geometrias.geojson`, renombrar «Volta y Koch» → «Volta y Kotch» si decides el nombre oficial, y la columna `fecha_modificacion` si adoptas el criterio del § 3.

### A6 · 31 PDF de Drive no son públicos 🟠 · nota enviada al área (14-sep)
Ninguna liga del inventario está rota, pero 31 archivos de Drive —38 ligas en 35 áreas— piden iniciar sesión a quien no seas tú. **30 son propiedad de `claraaop.16@gmail.com` y 1 (PM de Vista Hermosa) de `rm.cristian.sedema@gmail.com`**, y ninguno tiene acceso general; no puedo cambiarlos desde aquí. Corrección por el propietario: en Drive, seleccionar la **carpeta** que los contiene → *Compartir → Acceso general → Cualquier persona con el enlace → Lector* (una sola vez; los archivos heredan). Lista por área y texto para Clara en `pendientes/enlaces-2026-09-13.md` (repo) / `claude/enlaces-2026-09-13.md` (Proyecto). Alternativa si no responde: copiar los 31 a una carpeta institucional pública y yo te doy las 38 celdas nuevas del Sheet.

### A12 · Google marcó `contactoverde.com` como «Páginas engañosas»; Chrome bloquea el retorno del login 🟠
Reproducido el 14-sep desde tu Chrome con v74 ya en producción: `sia.contactoverde.com` → login → Google → retorno a `/cdn-cgi/access/authorized?…` → pantalla roja «Sitio peligroso». No es del Service Worker (A11, resuelto) ni de las extensiones (probado con todas apagadas). **Causa confirmada en Google Search Console (propiedad de dominio `contactoverde.com` verificada por DNS el 14-sep):** «Problemas de seguridad → Páginas engañosas», URLs de muestra «N/D» (el sitio no es rastreable sin sesión). El Informe de transparencia daba limpio `sia.contactoverde.com` y `sedema-sia.cloudflareaccess.com`; la marca está a nivel de dominio. **Afecta a cualquier persona que entre con Chrome y deba iniciar sesión** (en incógnito con sesión viva no pasa por el login; Edge usa SmartScreen).
- **Hecho:** propiedad verificada en Search Console; sesión global de Access ajustada a 1 mes (antes 24 h, que anulaba el «1 month» de la app).
- **En curso (tú):** (1) redirección `contactoverde.com` y `www` → `sia` (Cloudflare → Rules → Redirect Rules; `www` en proxied), para que la raíz no responda 404 de un GitHub Pages apagado; (2) **Solicitar revisión** en Search Console con el texto entregado el 14-sep; respuesta de Google en 1–3 días.
- **Mientras tanto:** pantalla roja → «Detalles» → «Visitar este sitio no seguro»; y «Cuéntanos» (advertencia incorrecta).
- **Si Google rechaza la revisión:** quitar el PIN por correo y dejar solo Google con «Apply instant authentication» (nadie ve la página de Cloudflare con formulario), o cambiar el dominio del equipo de Access; se decide con el texto del rechazo.

### A10 · Columnas `fecha_decreto_iso` y `fecha_pm_iso` del Sheet 🟢
No traen ISO: las 66 filas llevan `DD/MM/AAAA` (el tablero las convierte con `cleanIso()`, así que no falla), pero cualquier consumidor externo del CSV asume un formato que no es (D1-07). Al hacer las correcciones A7, llenar las `_iso` con `AAAA-MM-DD` (fórmula `=TEXTO(F2;"aaaa-mm-dd")` sobre la fecha) o renombrarlas.

### A1c · Pruebas en iPhone que el arnés no puede reproducir 🟠
Pendientes con v75 en producción: (0) **menú de capas (v77):** con v76 confirmaste en tu iPhone que las capas del final no se alcanzaban (el menú no se desplazaba); v77 lo corrige (overflow y propagación táctil) — verificar en Ubicar, en el minimapa de una ficha con PGOEDF encendido y en el mapa del Inventario que el menú se desplaza con un dedo hasta el último renglón; (2) ficha abierta en horizontal → vertical: reportaste «hay problemas» con una captura en horizontal de la tabla del Inventario (sin ficha); falta saber qué falla exactamente (¿la ficha se cierra al girar?, ¿queda abajo?, ¿no abre en horizontal?) — en el arnés la ficha sobrevive a ambos giros; (3) botón guinda «Ampliar» en la ficha → mapa a pantalla completa sin «×» encima, mismo botón cierra (rehecho en v73); (4) con datos móviles, las teselas se piden una vez y no se vuelven a pedir al reabrir; (5) modo avión → «¿Dónde estoy?» con un punto: el resultado debe traer el aviso «Resultado incompleto…» si alguna capa no estaba cacheada. Confirmado: (1) giro con resultado de ubicación; Cristian entró y abrió fichas sin problema desde su iPhone.

---

## B · Decisiones institucionales y trabajos en curso

### B2 · Segundo propietario institucional 🟠
El Google Sheet del inventario, el proyecto de Google Cloud (Places **y ahora el cliente OAuth del login con Google**) y la cuenta de Cloudflare cuelgan de cuentas personales. **Decidir qué cuenta institucional se designa copropietaria** de los tres.

### B10 · Superficies decretadas vs. poligonales cartográficas 🟢
Nueve áreas difieren más del 5 % entre el decreto y la poligonal (D1-04): El Tepeyac 1,500 vs 245.45 ha, Fuentes Brotantes 129 vs 21.93, Cumbres del Ajusco 920 vs 499.04, Jalalpa 101.59 vs 69.45, Texcalatlaco 24.42 vs 19.59, Río Becerra Tepehuache 34.55 vs 40.88, Bosque de las Lomas 26.4 vs 30.72, Tarango 267.18 vs 245.51, Cerro de la Estrella (federal) 1,100 vs 1,177.67. **Decidir** si el Sheet gana una columna `superficie_cartografica_ha` (la ficha mostraría las dos cifras) o se corrige la cartografía de las tres primeras. Observación relacionada: 4.21 de las 76.91 ha de la zonificación del PM de La Loma caen fuera del polígono decretado del inventario (un punto en esa franja sale «Sin área decretada» aunque el PM lo zonifique).

### B11 · `robots`, `canonical` y Open Graph con el sitio detrás de Access 🟢
`index.html` declara `robots index,follow`, `canonical`, `og:*` y `og:image` en `sia.contactoverde.com`, pero desde el 13-sep ningún rastreador ni vista previa (WhatsApp, Teams) puede leer nada: reciben el login. Propuesta: `noindex, nofollow` y retirar `og:image` (o alojarla fuera de Access si se quiere vista previa al compartir la liga entre el personal). Dime cuál y lo aplico en la siguiente entrega con bump.

### B12 · Llave de CARTO en las teselas 🟢
`TILE_LAYERS.positron.url` lleva `?key=cb1_…` (D8-02); no está documentado de qué cuenta cuelga ni si tiene cuota. Los basemaps gratuitos de CARTO no la exigen. **Decidir:** identificar la cuenta (y anotarla en `pendientes/altas-acceso.md`) o retirar la llave y probar en producción.

### B9 · Cifras de la tabla del Convenio Marco 🟠
Desde v68 (auditoría D1-05) la tabla «Convenio Marco · Áreas en coadministración» (Análisis → Marco jurídico) lee nombres, fechas y superficies del **inventario**, no del anexo del Convenio: Insurgente Miguel Hidalgo y Costilla 525.05 ha (el Convenio decía 1,889.96), Cerro de la Estrella 1,100.00 (1,183.33), Cumbres del Ajusco 26/08/1936 (23/09/1936), total acumulado 10,409.67 ha (11,857.90). **Decidir** si la tabla debe reproducir el texto del Convenio tal cual (se regresa a valores literales con la fuente citada) o quedarse con el inventario como está.

### B8 · Registro de uso por persona 🟢
Access ya entrega el correo de quien entra (Insights & Logs → Access, 24 h en el plan gratuito), pero no ve qué se consulta dentro del tablero. Propuesta: el Worker recibe eventos mínimos (ficha abierta, destino, búsqueda, ubicación resuelta sin coordenada), les añade el correo de la cabecera de Access y los guarda en D1; vista «Uso» solo para ti. Condición: informar al personal que el uso queda registrado. Dime «sí» y lo entrego.

---

## Operación del acceso (referencia, no pendiente)
- **Alta de una persona:** dos lugares. (1) Cloudflare One → Access → Applications → sia → Policies → «Personal autorizado» → agregar el correo. (2) Google Cloud → Google Auth Platform → Público → Usuarios de prueba → agregar el mismo correo (la app OAuth está en modo Prueba, tope 100; sin este paso Google bloquea el botón «Google», aunque el PIN por correo sigue funcionando).
- **Baja:** quitar el correo de la política; la sesión vigente (hasta 1 mes) se puede cortar en Access → Applications → sia → Revoke existing tokens.
- Sesión: 1 mes desde el último login; al expirar, el tablero detecta la redirección y manda al login solo.

