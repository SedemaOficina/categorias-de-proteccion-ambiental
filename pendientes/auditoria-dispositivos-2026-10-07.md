# Auditoría por dispositivo · 7 de octubre de 2026 · v92 (`sia-v35-2026-10-07f`)

Recorrido completo del tablero en **celular** (390 × 844, táctil), **iPad vertical** (820 × 1180, táctil), **iPad horizontal** (1180 × 820, táctil), **iPad mini** (744 × 1133) y **computadora** (1440 × 900 y 1024 × 768), con el arnés (`pendientes/arnes/`): «¿Dónde estoy?» y su resultado, Inventario (resumen, mapa, tabla, ficha), portada de Análisis y sus cuatro secciones, Zona Patrimonio y la guía. Se midieron desbordes horizontales, objetivos táctiles menores de 40 px y errores de JavaScript, y se revisó cada pantalla en captura. Además se generaron seis imágenes compartibles de casos densos.

**Resultado general:** cero errores de JavaScript en los cinco perfiles; sin desborde horizontal en ninguna pantalla. Lo que el arnés marca «fuera de pantalla» (`#drTirador`, `#drClose`, controles del minimapa) es la ficha cerrada, que espera escondida a la derecha: correcto.

## Corregido en esta jornada (v89–v92)

| # | Hallazgo | Equipo | Corrección |
|---|---|---|---|
| D-01 | La tabla del Inventario no cabía: en iPad vertical la columna de hectáreas salía cortada («11.») y PM, SC, Fecha PM y DG quedaban fuera; en iPad horizontal se cortaban encabezados y la columna DG | iPad | De 761 a 1199 px la tabla muestra siete columnas (Nombre, Tipo, Subcategoría, Alcaldía, Ha, PM, SC), se ajusta al ancho y el nombre usa dos renglones. Jurisdicción, Decreto, Fecha PM y DG siguen en la ficha |
| D-02 | Objetivos táctiles chicos en iPad, que usa el diseño de escritorio con el dedo: «×» del buscador 30 px, índice de Marco jurídico 36 px, «Ver listado» 27 px, botones de compartir 32 px | iPad | 44 px en toda pantalla táctil (`pointer:coarse`) |
| D-03 | «Subcategoría en sigla: pasa el cursor…» en pantallas sin cursor | iPad, celular | Esa parte de la leyenda se oculta en pantallas táctiles |
| D-04 | La parte de arriba de los chips de Inventario se veía cortada | Celular | La tira (que se desplaza de lado y por eso recorta) lleva aire arriba y abajo |
| D-05 | En la portada de Análisis «Entrar» casi no se veía y las tarjetas parecían solo informativas | Todos | Botón guinda lleno, alineado al fondo de cada tarjeta |
| D-06 | Imagen compartible encimada con mucha información: filas apretadas, valores cortados a un renglón, leyenda fuera del recuadro | Todos | Alto variable (≥ 1440 px), valores completos en varios renglones, leyenda en varias filas, Zona Patrimonio con trazo tenue |
| D-07 | «predio» en cuatro textos | Todos | «polígono» |
| D-08 | Filtros de Inventario tapaban la lista en celular | Celular | Hoja «Filtros (n)» |
| D-09 | La flecha «atrás» sacaba del tablero (y el botón atrás de Android) | Todos | Historial por destino, sección y ficha |

## Recomendaciones pendientes

### Prioridad media

- **R-01 · Cabecera en iPad vertical.** De 761 a ~1100 px «Actualizado · 7 oct 2026» y el botón «?» bajan a un renglón propio con mucho aire (unos 90 px perdidos arriba). Ponerlos en la misma línea que el título o compactar el bloque.
- **R-02 · El buscador conserva la última consulta.** Tras cerrar el resultado de «¿Dónde estoy?», la coordenada o dirección sigue escrita en el buscador al cambiar a Inventario o Análisis (en celular, en la cápsula de arriba). Propuesta: al cerrar el resultado, vaciar el campo (o dejar el texto en gris como «última consulta»).
- **R-03 · iPad horizontal en «¿Dónde estoy?».** El resultado ocupa 400 px y el mapa el resto: bien. En iPad vertical (820) la columna del mapa queda en ~470 px; si el resultado es largo, la página crece. Valorar en iPad vertical poner el resultado arriba del mapa a todo el ancho.
- **R-04 · Probar en dispositivos reales lo que el arnés no ve:** arrastre de las hojas en iPhone (v87), pantalla completa simulada en iPad Safari, desplazamiento del menú de capas en iPad, fuentes reales (Roboto Mono) en las etiquetas de la ficha (UI-13).

### Prioridad baja

- **R-05 · Portada de Análisis en celular.** El panel de introducción («¿Qué quieres analizar?») deja un hueco grande bajo el texto; reducir su relleno inferior.
- **R-06 · «Tipo» y «Subcategoría» en tableta** repiten información con el filete de color. Si se quiere más aire para el nombre, en iPad vertical se puede quitar «Tipo».
- **R-07 · Leyenda de la imagen compartible:** cuando un área de la consulta es también capa de contexto aparecen dos entradas del mismo color («ANP Local» y «Cerro de la Estrella (local)»). Se puede omitir la de categoría si solo contiene esa área.

## Cómo se verificó

`pendientes/arnes/aud360.mjs` (cuatro perfiles) sin errores ni hallazgos; `filtros.mjs` sin errores; recorrido propio en cinco perfiles con capturas de 13 pantallas por perfil; seis imágenes compartibles (1080 × 1470 a 1856) revisadas una por una.
