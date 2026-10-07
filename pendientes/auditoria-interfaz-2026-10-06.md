# Auditoría de interfaz · 6 de octubre de 2026 · v81 (`sia-v35-2026-10-05a`)

Recorrido visual de todo el tablero con el arnés (`pendientes/arnes/`, Playwright/Chromium) en tres perfiles: celular 390×844 (táctil), laptop 1366×768 y escritorio 1920×1080. Se capturaron 78 pantallas: inicio, los tres destinos con cada subconjunto, ficha (Desierto de los Leones), los cuatro casos de «¿Dónde estoy?» (urbano, ANP con PM, Suelo de Conservación, doble cobertura) y la guía.

**Límites de la prueba.** El arnés no carga Google Fonts: Roboto Mono se ve con la tipografía monoespaciada de respaldo, que es más ancha, así que los cortes de renglón de las etiquetas en mayúsculas pueden ser menores en producción. Las capturas de página completa deforman los elementos fijos y los mapas. Un «mapa vacío» que salió en Ubicar de escritorio era de la captura, no del sitio: se comprobó que el mapa pinta sus 107 polígonos.

Lo que ya está en `pendientes.md` no se repite aquí.

---

## Alta · el dato que se ve no es el correcto

### UI-01 · «Reparto por alcaldía» suma ARCAC aunque dice que no · ✅ corregido en v82 (`sia-v35-2026-10-06a`)
Análisis → Brechas y distribución. La leyenda dice «ARCAC · no suma al inventario», pero el total de cada fila y la longitud de la barra incluyen los núcleos ARCAC (`alcStats[k].total++` y `.sup +=` en `app.js:1365`). Ejemplo: Tlalpan aparece con **26,450.04 ha · 21**, cuando en el inventario tiene **11 áreas y 12,511.42 ha**; las otras 10 y ~13,900 ha son ARCAC. El orden de las alcaldías también cambia por ello: Milpa Alta sube al tercer lugar casi solo por ARCAC. `alcStats[k].supInv` ya existe y no se usa en la gráfica.
Además, la barra mezcla dos medidas: su longitud es superficie y sus segmentos son conteos. En las barras cortas los números se enciman (Miguel Hidalgo «1 2 1») y Coyoacán, Venustiano Carranza y Cuauhtémoc quedan casi invisibles.
**Propuesta:** total y orden por `supInv` y conteo sin ARCAC; ARCAC como dato aparte en la fila (o fuera de la gráfica, como en «Los cuatro grupos»); ocultar el número del segmento cuando el segmento mida menos de ~24 px.

### UI-02 · Gráficas por sexenio: color de marca solo para las dos últimas administraciones e interinatos sin aviso · decisión 6-oct: se conservan los colores y no se agrega nota de interinatos
«Cuántas áreas se decretaron» y «Cuántos programas de manejo se publicaron» pintan a C. Sheinbaum y C. Brugada en guinda (el color institucional del gobierno actual) y a las tres anteriores en morado (`gobiernos`, `app.js:1769`). En un tablero institucional eso puede leerse como énfasis político.
Los interinatos (Encinas, Amieva, Batres) se suman al periodo que termina, decisión documentada en el código pero invisible en pantalla. Por ejemplo, Tepepolco (decreto del 17/07/2024, interinato de Batres) cuenta para «C. Sheinbaum 2018–2024», y esa misma cifra es la línea base de **Metas**. «AMLO» va con siglas y los demás con inicial y apellido.
**Propuesta:** un solo color para todas las barras (o resaltar solo la que se señala con el cursor); una nota bajo cada gráfica: «Cada periodo incluye su interinato (Encinas 2005–06, Amieva 2018, Batres 2023–24)»; nombres con el mismo formato.

## Media · consistencia y jerarquía

### UI-03 · Ficha: la misma información tres veces y con estilos distintos
La cabecera dice «ANP · FEDERAL · Parque Nacional» y debajo se repite en Tipo («Área Natural Protegida»), Jurisdicción («Federal») y Subcategoría («Parque Nacional»). Subcategoría es una etiqueta con borde en escritorio y texto guinda sin borde en celular. **Propuesta:** quitar Jurisdicción y Subcategoría de los campos (ya están en la cabecera) o dejar la cabecera solo con el nombre; mismo estilo de etiqueta en todos los anchos.

### UI-04 · Zonificación: la leyenda y la tabla nombran distinto la misma zona
En el minimapa de la ficha la leyenda dice «Restauración y recuperación» y «Uso público» (familias); la tabla de abajo dice «Zona de Recuperación» y «Zona de uso público» (zonas), con los mismos colores. Quien compara las dos no sabe si son lo mismo. **Propuesta:** leyenda con el nombre de la zona del programa, o tabla agrupada por familia con la zona como detalle.

### UI-05 · Aros de foco que aparecen con ratón y con el dedo
Tras un clic, el chip activo («Todas», «Brechas y distribución», «Metas») muestra doble aro; el «×» de la ficha en celular aparece con aro dorado al abrir, y la guía con borde dorado. Es el foco programático (accesibilidad, v69), pero para quien no usa teclado parece un error. **Propuesta:** `el.focus({focusVisible:false})` donde el navegador lo admita y estilos de foco solo en `:focus-visible`.

### UI-06 · «¿Dónde estoy?» en escritorio: el resultado empuja la navegación
Al consultar un punto, la tarjeta de resultado aparece arriba y las pestañas Ubicar / Inventario / Análisis quedan debajo de ella. En escritorio también se ve el asa de arrastre (barrita gris), que solo tiene sentido en celular. En el caso «Suelo de Conservación» la columna izquierda queda con un hueco de ~150 px junto al mapa. **Propuesta:** resultado debajo de las pestañas (o pestañas fijas arriba), asa oculta desde 761 px.

### UI-07 · Traslapes rompe el patrón de encabezado
Todos los paneles usan rótulo pequeño en mayúsculas → título grande con palabra en guinda → texto. Traslapes pone el título en texto normal y el rótulo («TRASLAPES ENTRE ÁREAS») debajo. Sus filtros (buscador y selector) ocupan cada uno todo el ancho en escritorio.

### UI-08 · Tarjetas de cifras de «Brechas y distribución» desalineadas
Las tres tarjetas (Brecha principal, Vigencia, Concentración) llenan tres de cuatro columnas y dejan un hueco a la derecha en 1366 y 1920 px. **Propuesta:** rejilla de tres columnas en este panel.

## Baja · pulido

- **UI-09 · Error de consola `_leaflet_pos`.** Aparece cuando un mapa se destruye mientras anima un acercamiento: Leaflet 1.9 deja pendiente `_onZoomTransitionEnd`. No se ve en pantalla; se reprodujo al cambiar el tamaño de la ventana durante el cambio de destino. Arreglo de 3 líneas: envolver `L.Map.prototype._onZoomTransitionEnd` para salir si `!this._mapPane`.
- **UI-10 · Textos.** El título dice «Dashboard» (inglés) en un sitio en español: «Tablero». «Registros · 66» en la cabecera repite el «66 áreas protegidas» del resumen. Hay trato de usted («vaya a Metas», «Toque una barra») y de tú («Ubica un punto y revisa»): elegir uno.
- **UI-11 · Botones del mapa en celular.** «Inicio» es un cuadrado de esquinas redondeadas y «Capas» un círculo, uno al lado del otro.
- **UI-12 · Guía rápida.** La tarjeta «ANP» (27 = 18 locales + 9 federales) lleva el borde naranja de ANP Local.
- **UI-13 · Etiquetas de la ficha en celular.** «FECHA PROGRAMA DE MANEJO» ocupa tres renglones y «COADMINISTRACIÓN» se parte con guion. Verificar en iPhone con la tipografía real; si persiste, abreviar («Fecha PM») o dar 110 px a la columna.

## Lo que está bien
Cero errores visibles en los cuatro flujos de ubicación; la jerarquía de coberturas («Estás dentro de 2 áreas», mayor jerarquía primero y nota de concurrencia) se lee clara; el caso urbano muestra el área más cercana y su distancia; la hoja de ficha y la de resultado respetan la barra inferior; contraste y tamaños táctiles sin regresiones respecto a la auditoría del 13-sep.
