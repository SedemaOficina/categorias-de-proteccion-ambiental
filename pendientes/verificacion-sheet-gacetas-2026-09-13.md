# Verificación del inventario contra las Gacetas · 13 de septiembre de 2026

**Método.** Se extrajo el texto de las 54 Gacetas enlazadas en el Sheet (`url_gaceta_decreto`, `url_gaceta_pm`; portal de la Consejería Jurídica) desde tu Chrome con pdf.js, y se contrastó para cada área: fecha y número de la Gaceta, artículo primero del decreto (nombre, categoría, superficie) y presencia real del instrumento en el ejemplar enlazado. Cubre 55 de las 66 áreas; las 11 sin liga de Gaceta (9 ANP federales/DOF, Bosque de las Lomas 1994 y Parque Ecológico de la CDMX 1989) quedan fuera de este cruce.

**Resultado.** 33 áreas coinciden en todo. En 22 hay algo que corregir: 15 fechas de decreto, 3 fechas de programa de manejo, 5 ligas que apuntan a una Gaceta que no contiene el instrumento, 2 programas de manejo registrados que no existen en la Gaceta citada, 1 superficie y **1 inversión de categorías** (Sierra de Santa Catarina). Además, un patrón sistemático menor: las superficies se capturaron truncadas, no redondeadas (p. ej. 22.870 → 22.86).

---

## 1. Correcciones al Sheet (copiar tal cual)

| # | Área | Campo | Sheet dice | Gaceta dice | Corrección |
|---|---|---|---|---|---|
| 1 | Alameda del Sur | fecha_decreto | 05/07/2024 | GOCDMX 1373 · **05/06/2024** (11.13 ha) | 05/06/2024 |
| 2 | Atzoyapan | fecha_decreto · url_gaceta_decreto | 28/11/2011 · GODF 1233 | GODF 1233 no lo contiene; decreto en **GODF 1491 · 28/11/2012** (208,179.942 m² = 20.82 ha) | 28/11/2012 · liga `50b59a2dbb95c.pdf` |
| 3 | Bezares y El Castillo | fecha_decreto · url_gaceta_decreto | 28/11/2011 · GODF 1233 | GODF 1233 no lo contiene; no aparece en ninguna de las 54 Gacetas enlazadas | **Localizar la Gaceta correcta** (probablemente 2007–2008, misma tanda que Vista Hermosa, Río Becerra y La Diferencia) |
| 4 | Bosque de Chapultepec | superficie | 866.01 | GOCDMX 1182 Bis · Art. 1º: **866.37 ha** (273.83 + 168.03 + 243.90 + 180.61) | 866.37 |
| 5 | Bosque de Chapultepec | fecha_decreto | 31/08/2023 | GOCDMX 1182 Bis (31/08/2023) es **decreto modificatorio** del original: GODF 94 · **02/12/2003** | Decisión: la columna registra ¿declaratoria (02/12/2003) o última modificación (31/08/2023)? Ver § 3 |
| 6 | Bosque de Chapultepec | fecha_pm · url_gaceta_pm | 21/08/2024 · liga a GODF 137 | La liga es el **PM de 2006** (GODF 137 · 17/11/2006 · 686.018 ha), no el de 2024 | Poner la liga del PM 2024 (GOCDMX del 21/08/2024) o corregir la fecha a 17/11/2006 |
| 7 | Cerro de la Estrella (local) | fecha_pm | 06/04/2007 | GODF 62 · **16/04/2007** | 16/04/2007 |
| 8 | Cerro de Zacatepetl | fecha_decreto | 23/04/2003 | GODF 35 Bis · **29/04/2003** (31-93-39.53 ha ✓) | 29/04/2003 |
| 9 | Coyotera | fecha_decreto · url_gaceta_decreto | 15/06/2022 · GOCDMX 873 | GOCDMX 873 no lo contiene; decreto en **GODF 1250 · 21/12/2011** (106,210.853 m² = 10.62 ✓) | 21/12/2011 · liga `4ef15cdb50e4a.pdf` |
| 10 | Río Becerra Tepehuache | fecha_decreto · url_gaceta_decreto | 15/06/2022 · GOCDMX 873 | GOCDMX 873 no lo contiene; su PM (GODF 1493) cita el decreto del **05/07/2007, modificado el 03/08/2007** | 05/07/2007 · localizar la Gaceta de esa fecha |
| 11 | La Diferencia | fecha_decreto · url_gaceta_decreto | 15/06/2012 · GODF 1374 | GODF 1374 no lo contiene; su PM (GODF 1494) cita el decreto del **05/07/2007, modificado el 29/05/2008** | 05/07/2007 · localizar la Gaceta |
| 12 | Vista Hermosa | fecha_decreto · url_gaceta_decreto | 28/11/2012 · GODF 1491 | GODF 1491 no lo contiene; su PM (GODF 1495) cita el decreto del **05/07/2007** (3,212.046 m² = 0.32 ✓) | 05/07/2007 · localizar la Gaceta |
| 13 | Volta y Koch | fecha_decreto · url_gaceta_decreto · nombre | 15/06/2012 · GODF 1374 · «Koch» | GODF 1374 no lo contiene; decreto en **GODF 1491 · 28/11/2012** (18,214.955 m² = 1.82 ✓); el nombre oficial es **«Volta y Kotch»** (decreto y PM) | 28/11/2012 · liga `50b59a2dbb95c.pdf` · decidir si se corrige el nombre (implica renombrar también la geometría; lo hago yo) |
| 14 | Pachuquilla | fecha_decreto | 01/12/2012 | GODF del **01/12/2011** (205,854.14 m²); el PM lo confirma | 01/12/2011 |
| 15 | Santa Rita | fecha_decreto | 01/12/2012 | GODF del **01/12/2011** (30,312.54 m²); el PM lo confirma | 01/12/2011 |
| 16 | Tecamachalco | fecha_decreto ↔ fecha_pm | decreto 23/12/2013 · PM 23/12/2011 | El **decreto** está en GODF 1252 · **23/12/2011** (118,279 m² = 11.83 ✓). La Gaceta 1761 del 23/12/2013 enlazada como decreto **no menciona Tecamachalco** | decreto 23/12/2011 (liga `4ef403bd043a3.pdf`); fecha y liga del PM por verificar |
| 17 | Anzaldo | programa_manejo · fecha_pm | Sí · 21/12/2011 | GODF 1250 (21/12/2011) trae solo el **decreto**; no hay PM publicado ahí (la misma liga se usó para decreto y PM) | Si no existe otro PM publicado: programa_manejo = No |
| 18 | Becerra Tepehuache, Sección La Loma | programa_manejo · fecha_pm | Sí · 28/11/2012 | GODF 1491 (28/11/2012) trae solo el **decreto** (1,223,804.746 m² = 122.38 ✓); no hay PM ahí | Si no existe otro PM publicado: programa_manejo = No |
| 19 | Mimosas | url_gaceta_pm | liga a GODF 1493 (30/11/2012) | El PM de Mimosas está en **GODF 1494 · 03/12/2012** (la fecha del Sheet sí es 03/12/2012) | liga `50bc21ee521c2.pdf` |
| 20 | Ecoguardas | fecha_decreto | 20/11/2006 | GODF 141 · **29/11/2006** (132-63-00 ha ✓) | 29/11/2006 |
| 21 | Ejidos de Xochimilco y San Gregorio Atlapulco | url_gaceta_pm (y fecha) | 26/02/2018 · liga a GOCDMX 479 (26/12/2018) | La Gaceta enlazada **no menciona Xochimilco ni Atlapulco**; el decreto enlazado (GODF 142 · 04/12/2006) tampoco contiene el texto (posible ejemplar escaneado) | Verificar fecha del PM y reponer ambas ligas |
| 22 | Loreto y Peña Pobre | fecha_decreto | 04/06/2024 | GOCDMX 1337 · **15/04/2024** (21,253.50 m² = 2.13 ha) | 15/04/2024 |
| 23 | Tempiluli | url_gaceta_decreto | GODF 1158 (11/08/2011) | La Gaceta enlazada **no menciona Tempiluli** (el PM de 2023 sí está bien) | Localizar la Gaceta del decreto (¿1158 Bis?) |
| 24 | **Sierra de Santa Catarina (ZCE) / (ZSCE)** | categoría ↔ superficie | ZCE = 528 ha · ZSCE = 220.55 ha | GODF 67 (21/08/2003) y PM (GODF 98, 19/08/2005): la **ZSCE** (decretada en 1994, 576-33-02 ha) «queda comprendida en 528-00-00 ha»; la **ZCE** nueva es de **220-55-00 ha**, siete polígonos | Las etiquetas están invertidas. Las geometrías siguen al Sheet (polígono «ZCE» = 525 ha; «ZSCE» = 219 ha), así que hay que intercambiar los nombres en el Sheet **y** en `geometrias.geojson` (lo hago yo en cuanto confirmes) |

## 2. Superficies: truncamiento sistemático (menor)
Del Moral 22.870 → 22.86 · Guadalupe 74.407 → 74.4 · Mixcoac 84.706 → 84.7 · Hueyetlaco 7.718 → 7.71 · Las Margaritas 4.570 → 4.56 · Milpa Vieja 30.889 → 30.88 · Pachuquilla 20.585 → 20.58 · Tarango 267.189 → 267.18 · San Juan de Aragón 160.186 → 160.18 · Loreto y Peña Pobre 2.125 → 2.12 · Bosque de Tlalpan 252.868 → 252.86. Ninguna cambia el dato en la práctica; si se corrige, corregir todas con el mismo criterio (redondeo a dos decimales).

## 3. Decisión de criterio: ¿qué fecha lleva `fecha_decreto`?
Hay áreas con decreto original y decreto modificatorio (Chapultepec 2003/2023; Sierra de Guadalupe 1990/2002; Sierra de Santa Catarina ZSCE 1994/2003; Río Becerra 2007/2007; La Diferencia 2007/2008). El Sheet mezcla criterios. Propuesta: `fecha_decreto` = declaratoria original, y una columna nueva `fecha_modificacion` para la última reforma; la ficha mostraría ambas. Si prefieres una sola fecha, que sea la de la declaratoria.

## 4. Coincidencias verificadas (33)
Gran Canal · Jardín López Velarde · Parque Cuitláhuac · Parque Lineal Vicente Guerrero · Bosque de las Lomas (PM) · Bosque de Nativitas · San Luis Tlaxialtemalco · Bosque de Tláhuac · Bosque de Tlalpan · Canal Nacional · Cerro de la Estrella (decreto) · Echánove · Del Moral · Guadalupe · Jalalpa · Magdalena Eslava · Mixcoac · San Borja · Texcalatlaco · El Zapote · Hueyetlaco · Las Margaritas · Milpa Vieja · Mimosas (fecha) · Tarango · La Loma · La Armella · Los Encinos · San Bernabé Ocotepec · San Juan de Aragón · San Miguel Ajusco · San Miguel Topilejo · San Nicolás Totolapan · Sierra de Guadalupe (633.68) · Parque Ecológico de la CDMX (PM) · Tepepolco · Tempiluli (PM) · Vista Hermosa (PM y superficie).

## 5. Fuera de este cruce
Sin liga de Gaceta (instrumento federal en el DOF o anterior a la Gaceta digital): Bosque de las Lomas (1994), Cerro de la Estrella federal, Cumbres del Ajusco, Desierto de los Leones, El Histórico Coyoacán, El Tepeyac, Fuentes Brotantes, Insurgente Miguel Hidalgo y Costilla, Lago Tláhuac-Xico, Lomas de Padierna, Parque Ecológico de la CDMX (decreto). Se pueden verificar contra el DOF en una segunda ronda.
