# B5 · Tres «parciales» de Suelo de Conservación menores a 4 % — resolución

Fecha: 13 de septiembre de 2026. Entregado en v58 (`sia-v35-2026-09-13f`).

## Pregunta
Atzoyapan (1.29 %), Pachuquilla (1.32 %) y Magdalena Eslava (3.83 %) aparecían como «Parcialmente dentro» del Suelo de Conservación (SC). ¿Es traslape real o artefacto cartográfico? ¿Se pueden citar así en un documento?

## 1. Anatomía geométrica del traslape (EPSG:6372, shapely)

| Área | % en SC | ha en SC | Piezas | Ancho medio | Penetración máx. dentro del SC | Perímetro del AVA pegado (≤15 m) al límite del SC |
|---|---|---|---|---|---|---|
| Atzoyapan | 1.29 | 0.27 | 5 | 5.7 m | **6 m** | 1,189 m de 6,396 m |
| Pachuquilla | 1.32 | 0.27 | 1 | 2.1 m | **1 m** (franja de 1.3 km × 2 m) | 1,334 m de 4,539 m |
| Magdalena Eslava | 3.83 | 0.85 | 7 | 9.2 m | **18 m** | 1,829 m de 19,153 m |
| *Siguiente caso real:* Lomas de Padierna | 11.83 | 136.6 | — | 469 m | 398 m | — |

Lectura: en los tres casos el «traslape» es una franja de 1 a 18 m de ancho adosada al límite del SC. Son dos digitalizaciones distintas de la misma línea (la poligonal del decreto y la del SC de 2000), no una porción del área dentro del SC. El primer caso sustantivo (Lomas de Padierna) penetra casi 400 m: no hay zona gris entre ambos grupos.

## 2. Contraste con los instrumentos

- **Atzoyapan.** Decreto publicado en la GODF núm. 1491 del **28 de noviembre de 2012** (no 2011), superficie 208,179.942 m² en tres polígonos (101,047.776 + 56,407.941 + 50,724.225), Álvaro Obregón; los considerandos citan el Programa General de Desarrollo Urbano y no mencionan el Suelo de Conservación. Fuente: PAOT, GODF 28-11-2012 (índice y texto), y vLex (ficha del decreto: fecha de disposición 27-11-2012, publicación 28-11-2012, Gaceta 1491).
- **Pachuquilla.** Programa de Manejo publicado en la GODF del 3 de diciembre de 2012: superficie 205,854.14 m² en dos polígonos (194,732.77 + 11,121.37); colindancias Av. Arteaga y Salazar (N), autopista México-Toluca (S), antiguo camino a San Mateo Chimalpa (E) y calle Tláloc, Contadero (O). El propio PM describe la zona hípica «entre la zona que comprende Pachuquilla y el suelo de conservación», es decir, la barranca **colinda** con el SC, no está en él. Fuente: PAOT, `GODF_03_12_2012_PACHUQUILLA.pdf`.
- **Magdalena Eslava.** Decreto en la misma GODF 1491 del 28-11-2012 (vLex; el PDF de la PAOT confirma el índice). El texto íntegro no pudo leerse desde aquí (el portal de la Consejería rechaza la conexión y vLex está tras muro de pago); la conclusión geométrica basta por sí sola.

## 3. Resolución aplicada en el tablero (v58)

`SC_TOLERANCIA_PCT = 5` en `app.js`. Por debajo, `scEstado()` devuelve `fuera`; `scColinda()` conserva el dato y la ficha y el tooltip dicen: «Fuera del Suelo de Conservación · colinda con él (traslape cartográfico marginal de X %, no sustantivo)». En tabla y filtros las tres áreas cuentan como «Fuera»; el bloque PGOEDF de su ficha desaparece (el PGOEDF no les aplica). El Sheet no se toca: sigue guardando el porcentaje geométrico real.

## 4. Correcciones para el Sheet (acción tuya)

1. **Atzoyapan · `fecha_decreto`:** el Sheet dice 28/11/2011; la evidencia dice **28/11/2012** (GODF 1491). Verifica el PDF que enlaza `url_gaceta_decreto` (`4ed063209ff32.pdf`, subido en noviembre de 2011 al portal de la Consejería): si no contiene el decreto, corrige fecha y liga. La superficie (20.81 ha) coincide con el decreto (20.82).
2. Pachuquilla y Magdalena Eslava: fechas y superficies coinciden con lo consultado.

## 5. Cómo citarlas en documentos
«La barranca se ubica en suelo urbano y colinda con el Suelo de Conservación; el traslape que arroja el cruce cartográfico (X %) corresponde a la tolerancia entre digitalizaciones del límite y no a una porción del área dentro de dicho suelo.»
