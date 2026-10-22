# Informe de procedimientos del tarifario Estatal / Interno

Generado por `scripts/generar_tarifario_estatal.py` a partir de los libros «NN Nombre 22.xlsx» y del catálogo de 1858 servicios. Las tarifas NO se leen de los libros: son las del catálogo.

| Concepto | Cantidad |
|---|---|
| Servicios del catálogo | 1858 |
| Procedimientos técnicos leídos de los libros | 1392 |
| Servicios con procedimiento unido | 1371 |
| — por código | 1343 |
| — por nombre exacto + tiempo (código ausente o inválido) | 28 |
| Servicios SIN procedimiento (siguen en null) | 487 |
| Procedimientos sin unir a ningún servicio | 11 |
| Códigos con 2+ procedimientos sin poder decidir | 0 |
| Servicios con familia por listado del libro | 1795 (el resto: «Sin clasificar») |

## Procedimientos sin unir (revisar)

- código «Cantidad de Técnicos:» · Reparación Complejade copiadoras mayores de 20 000 copias · 40 registro Elect_22.xlsx / Proc. Técn._REPARACIÓN fila 255 · 180 min
- código «Cantidad de Técnicos:» · Reparación de Duplicadores RISO ComColor · 40 registro Elect_22.xlsx / Proc. Técn._REPARACIÓN fila 326 · 260 min
- código «Cantidad de Técnicos:» · Mantenimiento a Duplicadores RISO ComColor · 40 registro Elect_22.xlsx / Proc. Técn._MANTENIMIENTO fila 535 · 1367 min
- código «4224» · Guardia Técnica para Ferias · 40 registro Elect_22.xlsx / Proc. Técn._INSTALAC. Y MONTAJE fila 366 · 816 min
- código «nueva 12» · Rep. Media a Multicompresoras y U/C asociada · 70 Clima-Agua 22.xlsx / Reparación fila 6579 · 415 min
- código «nueva 13» · Rep. Mayor a Multicompresoras y U/C asociada · 70 Clima-Agua 22.xlsx / Reparación fila 6623 · 760 min
- código «0000» · Reparación General a Equipos Eléctricos: Productor de hielo >175 kg (226, MV, MC) · 82 Gastronomia 22.xlsx / Reparación fila 5090 · 1385 min
- código «0000» · Reparación General a Equipos Eléctricos: Productor de hielo Mediano (75-175) kg · 82 Gastronomia 22.xlsx / Reparación fila 5116 · 965 min
- código «0000» · Reparación General a Equipos Eléctricos: Productor de hielo pequeño (<75) kg · 82 Gastronomia 22.xlsx / Reparación fila 5141 · 485 min
- código «0000» · Reparación Media a Equipos Eléctricos: Productor de hielo pequeño (<75) kg · 82 Gastronomia 22.xlsx / Reparación fila 5166 · 545 min
- código «0000» · Instalación de dispositivo de SCA o Cerradura Electromagnética · 96 TVS-Seguridad 22.xlsx / Instalación y Montaje fila 930 · 125 min

## Códigos con varios procedimientos sin decidir


## Tiempo del procedimiento distinto del tiempo del catálogo (19) — se une igual; el procedimiento trae su propio tiempo

0156 (catálogo 132 / procedimiento 129), 4208 (catálogo 180 / procedimiento 158), 4209 (catálogo 120 / procedimiento 125), 4210 (catálogo 180 / procedimiento 184), 4211 (catálogo 420 / procedimiento 438), 4213 (catálogo 300 / procedimiento 309), 4214 (catálogo 120 / procedimiento 125), 4215 (catálogo 240 / procedimiento 255), 4221 (catálogo 300 / procedimiento 270), 4222 (catálogo 2400 / procedimiento 2380), 5042 (catálogo 120 / procedimiento 200), 5046 (catálogo 71 / procedimiento 60), 7055 (catálogo 719 / procedimiento 723), 7056 (catálogo 2159 / procedimiento 2162), 7058 (catálogo 3239 / procedimiento 3236), 7178 (catálogo 256 / procedimiento 289), 7115 (catálogo 48 / procedimiento 50), 8053 (catálogo 24 / procedimiento 26), 9133 (catálogo 90 / procedimiento 175)


## Nº de técnicos distinto (2)

6058 (catálogo 1 / procedimiento 4), 8016 (catálogo 1 / procedimiento 2)


## La suma de las actividades no iguala el tiempo de solución (27)

3072 (suma 345 / tiempo 330), 3073 (suma 90 / tiempo 75), 3075 (suma 33882 / tiempo 33480), 4034 (suma 171 / tiempo 88), 4036 (suma 157 / tiempo 88), 4037 (suma 177 / tiempo 78), 4211 (suma 288 / tiempo 438), 4026 (suma 90.62 / tiempo 102), 4027 (suma 118.62 / tiempo 120), 4215 (suma 425 / tiempo 255), 4028 (suma 330 / tiempo 180), 4216 (suma 340 / tiempo 300), 4217 (suma 320.97 / tiempo 360), 4030 (suma 392 / tiempo 85), 4219 (suma 2980 / tiempo 2400), 4220 (suma 1946 / tiempo 1920), 4009 (suma 1579 / tiempo 136), 4019 (suma 1245 / tiempo 400), 7397 (suma 184251 / tiempo 760), 7371 (suma 340 / tiempo 400), 7372 (suma 420 / tiempo 510), 7148 (suma 587 / tiempo 720), 7150 (suma 1115.5 / tiempo 1260), 7151 (suma 1286 / tiempo 1440), 7152 (suma 1512.5 / tiempo 1620), 9133 (suma 265 / tiempo 175), 9630 (suma 27 / tiempo 30)


## Actividades sin minutos (2)

8052, 8053


## «Modalidad 1–4» del catálogo frente al tipo de servicio del libro (100 discrepancias de 1792)

Correspondencia dominante: Modalidad 1 = Reparación, 2 = Revisión y Diagnóstico, 3 = Instalación y Montaje, 4 = Mantenimiento. No se modifica el catálogo; el libro se guarda aparte en `tipo_servicio`.

1001 (Modalidad 3 ≠ Revisión y Diagnóstico), 1002 (Modalidad 3 ≠ Revisión y Diagnóstico), 1003 (Modalidad 3 ≠ Revisión y Diagnóstico), 1004 (Modalidad 3 ≠ Revisión y Diagnóstico), 1005 (Modalidad 3 ≠ Revisión y Diagnóstico), 1006 (Modalidad 3 ≠ Revisión y Diagnóstico), 1007 (Modalidad 3 ≠ Revisión y Diagnóstico), 1008 (Modalidad 1 ≠ Instalación y Montaje), 1009 (Modalidad 1 ≠ Instalación y Montaje), 1010 (Modalidad 1 ≠ Instalación y Montaje), 1011 (Modalidad 3 ≠ Mantenimiento), 1012 (Modalidad 3 ≠ Mantenimiento), 1013 (Modalidad 3 ≠ Mantenimiento), 1014 (Modalidad 3 ≠ Mantenimiento), 1015 (Modalidad 3 ≠ Mantenimiento), 1016 (Modalidad 2 ≠ Reparación), 1017 (Modalidad 2 ≠ Reparación), 1018 (Modalidad 2 ≠ Reparación), 1019 (Modalidad 2 ≠ Reparación), 1020 (Modalidad 2 ≠ Reparación), 1021 (Modalidad 2 ≠ Reparación), 1022 (Modalidad 2 ≠ Reparación), 1023 (Modalidad 2 ≠ Reparación), 1024 (Modalidad 2 ≠ Reparación), 1025 (Modalidad 2 ≠ Reparación), 1026 (Modalidad 2 ≠ Reparación), 1027 (Modalidad 2 ≠ Reparación), 1028 (Modalidad 2 ≠ Reparación), 1029 (Modalidad 2 ≠ Reparación), 1030 (Modalidad 2 ≠ Reparación), 1201 (Modalidad 3 ≠ Revisión y Diagnóstico), 1202 (Modalidad 1 ≠ Instalación y Montaje), 1203 (Modalidad 1 ≠ Instalación y Montaje), 1204 (Modalidad 1 ≠ Instalación y Montaje), 1205 (Modalidad 1 ≠ Instalación y Montaje), 1206 (Modalidad 1 ≠ Instalación y Montaje), 1207 (Modalidad 1 ≠ Instalación y Montaje), 1208 (Modalidad 1 ≠ Instalación y Montaje), 1209 (Modalidad 1 ≠ Instalación y Montaje), 1210 (Modalidad 1 ≠ Instalación y Montaje), 1211 (Modalidad 1 ≠ Instalación y Montaje), 1212 (Modalidad 1 ≠ Instalación y Montaje), 1213 (Modalidad 1 ≠ Instalación y Montaje), 1214 (Modalidad 1 ≠ Instalación y Montaje), 1215 (Modalidad 1 ≠ Instalación y Montaje), 1216 (Modalidad 1 ≠ Instalación y Montaje), 1217 (Modalidad 1 ≠ Instalación y Montaje), 1218 (Modalidad 1 ≠ Instalación y Montaje), 1219 (Modalidad 1 ≠ Instalación y Montaje), 1220 (Modalidad 1 ≠ Instalación y Montaje), 1221 (Modalidad 1 ≠ Instalación y Montaje), 1222 (Modalidad 1 ≠ Instalación y Montaje), 1223 (Modalidad 1 ≠ Instalación y Montaje), 1224 (Modalidad 1 ≠ Instalación y Montaje), 1225 (Modalidad 1 ≠ Instalación y Montaje), 1226 (Modalidad 1 ≠ Instalación y Montaje), 1227 (Modalidad 1 ≠ Instalación y Montaje), 1228 (Modalidad 3 ≠ Mantenimiento), 1229 (Modalidad 3 ≠ Mantenimiento), 1230 (Modalidad 3 ≠ Mantenimiento), 1231 (Modalidad 3 ≠ Mantenimiento), 1232 (Modalidad 3 ≠ Mantenimiento), 1233 (Modalidad 3 ≠ Mantenimiento), 1234 (Modalidad 3 ≠ Mantenimiento), 1235 (Modalidad 3 ≠ Mantenimiento), 1236 (Modalidad 3 ≠ Mantenimiento), 1237 (Modalidad 3 ≠ Mantenimiento), 1238 (Modalidad 3 ≠ Mantenimiento), 1239 (Modalidad 3 ≠ Mantenimiento), 1240 (Modalidad 3 ≠ Mantenimiento), 1241 (Modalidad 3 ≠ Mantenimiento), 1242 (Modalidad 2 ≠ Reparación), 1243 (Modalidad 2 ≠ Reparación), 1244 (Modalidad 2 ≠ Reparación), 1245 (Modalidad 2 ≠ Reparación), 1246 (Modalidad 2 ≠ Reparación), 1247 (Modalidad 2 ≠ Reparación), 1248 (Modalidad 2 ≠ Reparación), 1249 (Modalidad 2 ≠ Reparación), 1250 (Modalidad 2 ≠ Reparación), 1251 (Modalidad 2 ≠ Reparación), 1252 (Modalidad 2 ≠ Reparación), 1253 (Modalidad 2 ≠ Reparación), 1254 (Modalidad 2 ≠ Reparación), 1255 (Modalidad 2 ≠ Reparación), 1256 (Modalidad 2 ≠ Reparación), 1257 (Modalidad 2 ≠ Reparación), 1258 (Modalidad 2 ≠ Reparación), 1259 (Modalidad 2 ≠ Reparación), 1260 (Modalidad 2 ≠ Reparación), 1261 (Modalidad 2 ≠ Reparación), 1262 (Modalidad 2 ≠ Reparación), 1263 (Modalidad 2 ≠ Reparación), 1264 (Modalidad 2 ≠ Reparación), 1265 (Modalidad 2 ≠ Reparación), 1266 (Modalidad 2 ≠ Reparación), 1267 (Modalidad 2 ≠ Reparación), 2369 (Modalidad 4 ≠ Reparación), 2370 (Modalidad 4 ≠ Reparación), 2371 (Modalidad 4 ≠ Reparación)


## Servicios sin procedimiento (487)

0100, 0101, 0102, 0103, 0104, 0105, 0108, 0109, 0113, 0114, 0115, 0116, 0117, 0118, 0119, 0120, 0121, 0122, 0123, 0124, 0125, 0126, 0127, 0128, 0129, 0130, 0131, 0132, 0133, 0134, 0135, 0136, 0137, 0148, 0149, 0150, 0151, 0152, 0153, 0154, 0161, 0162, 0200, 0900, 0901, 0910, 1037, 1038, 2373, 2374, 2375, 2376, 2377, 2378, 2379, 2380, 2381, 2382, 2383, 2384, 2385, 2386, 2387, 2388, 2389, 2390, 2401, 2402, 2403, 2404, 2405, 2406, 2407, 2408, 2409, 2410, 2411, 2412, 2413, 2414, 2415, 2416, 2417, 2418, 3076, 4212, 4218, 4225, 4226, 5054, 5055, 5056, 5057, 5058, 5059, 5060, 5061, 5062, 6009, 7188, 7189, 7190, 7191, 7192, 7193, 7194, 7195, 7196, 7198, 7199, 7200, 7201, 7202, 7203, 7204, 7205, 7206, 7207, 7208, 7209, 7210, 7211, 7212, 7213, 7214, 7215, 7216, 7217, 7218, 7219, 7220, 7221, 7222, 7223, 7224, 7225, 7226, 7227, 7228, 7229, 7230, 7231, 7232, 7233, 7234, 7235, 7236, 7237, 7238, 7239, 7240, 7241, 7242, 7243, 7244, 7245, 7246, 7247, 7248, 7249, 7250, 7251, 7252, 7253, 7254, 7255, 7256, 7257, 7258, 7259, 7260, 7261, 7262, 7263, 7264, 7265, 7266, 7267, 7268, 7269, 7270, 7271, 7272, 7273, 7274, 7275, 7276, 7277, 7278, 7279, 7280, 7281, 7282, 7283, 7284, 7285, 7286, 7287, 7288, 7289, 7290, 7291, 7292, 7293, 7294, 7295, 7296, 7297, 7298, 7299, 7300, 7301, 7302, 7303, 7304, 7305, 7306, 7307, 7308, 7309, 7310, 7311, 7312, 7313, 7314, 7315, 7316, 7318, 7319, 7320, 7321, 7322, 7323, 7324, 7325, 7326, 7327, 7328, 7329, 7330, 7331, 7332, 7333, 7334, 7335, 7336, 7337, 7338, 7339, 7340, 7341, 7342, 7343, 7344, 7345, 7346, 7347, 7348, 7363, 7364, 7365, 7366, 7367, 7377, 7378, 7379, 7396, 7410, 7411, 7412, 7413, 7414, 7415, 7416, 7417, 7418, 7419, 8465, 8466, 8467, 8468, 8469, 8470, 8471, 8472, 8473, 8474, 8475, 8476, 8477, 8478, 8479, 8480, 8481, 8482, 8483, 8484, 8485, 8486, 8487, 8488, 8489, 8490, 8491, 8492, 8493, 8494, 8495, 8496, 8497, 8498, 8499, 8500, 8501, 8502, 8503, 8504, 8505, 8506, 8507, 8508, 8509, 8510, 8511, 8512, 8513, 8514, 8515, 8516, 8517, 8518, 8519, 8520, 8521, 8522, 8523, 8524, 8525, 8526, 8527, 8528, 8529, 8530, 8531, 8532, 8533, 8534, 8535, 8536, 8537, 8538, 8539, 8540, 8541, 8542, 8543, 8544, 8545, 8546, 8547, 8548, 8549, 8550, 8551, 8552, 8553, 8554, 8555, 8556, 8557, 8558, 8559, 8560, 8561, 8562, 8563, 8564, 8565, 8566, 8567, 8568, 8569, 8570, 8590, 8591, 8592, 8593, 9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012, 9013, 9014, 9027, 9028, 9029, 9030, 9051, 9052, 9053, 9054, 9055, 9056, 9057, 9058, 9059, 9060, 9061, 9062, 9063, 9064, 9065, 9066, 9067, 9068, 9069, 9070, 9080, 9081, 9082, 9083, 9084, 9085, 9086, 9087, 9088, 9089, 9090, 9091, 9092, 9093, 9094, 9095, 9096, 9097, 9098, 9099, 9100, 9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108, 9109, 9110, 9111, 9112, 9113, 9114, 9115, 9116, 9117, 9118, 9119, 9120, 9121, 9122, 9123, 9124, 9125, 9126, 9127, 9128, 9129, 9130, 9131, 9134, 9135, 9136, 9137, 9138, 9139, 9140, 9141, 9142, 9650
