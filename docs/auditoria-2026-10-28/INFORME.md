# Auditoría integral de App Faltas — 28 de octubre de 2026

**Decisión posterior del usuario:** confirmó que los datos actuales son de prueba y pueden eliminarse parcial o totalmente cuando sea necesario. El [plan de correcciones](../PLAN_CORRECCIONES_AUDITORIA_2026-10-28.md) incorpora esa autorización y sustituye la necesidad de reconstruir documentalmente las cadenas de prueba que se retiren. Los hallazgos y evidencias de esta auditoría se conservan; no se ejecutó depuración al preparar el plan.

## Dictamen

**No recomiendo ejecutar todavía la depuración ni la carga definitiva de información.** La aplicación supera las pruebas existentes y sus flujos principales funcionan en el entorno aislado, pero se confirmaron diferencias de autorización entre la API y Firestore, sobrescritura concurrente de unidades, importaciones con resultados parciales y un procedimiento de depuración que no corresponde al modelo actual.

Se documentan **16 hallazgos: 6 de prioridad alta (P1), 9 de prioridad media (P2) y 1 de prioridad baja (P3)**. P1 significa resolver antes de la puesta en operación con datos definitivos o antes del procedimiento afectado; no significa que todos sean vulnerabilidades críticas de seguridad. No se demostró acceso anónimo a datos protegidos, ejecución remota de código ni una vulnerabilidad P0. Tampoco se garantiza su ausencia mediante esta auditoría.

El diagnóstico de la base publicada encontró **5 sanciones con inconsistencias de encadenamiento, correspondientes a 2 personas**. No se modificaron. No se presupone que sean datos ficticios ni se recomienda borrarlas sin identificar y autorizar los registros concretos.

Esta revisión incluye código, reglas, pruebas de dominio y servidor, navegador, dependencias, configuración publicada y consistencia de datos mediante resultados agregados. No equivale a una certificación de seguridad, una revisión jurídica o una auditoría independiente: la realiza el mismo asistente que participó en la implementación.

## Versión, alcance y evidencia

- Revisión Git: `2c55379adf28145a1c7c72837cb534911a86a707`, rama `main`, árbol inicialmente limpio.
- Producción comprobada: `https://app-faltas-disciplinarias.vercel.app/`. Su `/api/health` devolvió esa misma revisión.
- Firebase: `control-disciplinario-comando`. Las reglas desplegadas coinciden con el archivo local y los 27 índices declarados están disponibles, todos en estado `READY`.
- Reglas: SHA-256 normalizado `3263fb2b641cdbd21f0b4f7fdc797c01d1288589762c613935c84edd84b1490f`; publicación remota consultada de 27/10/2026, 18:40:24 UTC.
- Datos reales: lecturas para diagnóstico en memoria; se guardaron solamente cantidades, categorías de inconsistencia y huellas. No se exportaron documentos, nombres, CI ni credenciales.
- Todas las escrituras de prueba se hicieron en emuladores del proyecto `demo-app-faltas`. No se sembraron, cancelaron, importaron, depuraron ni migraron registros reales.
- No se modificó código funcional, reglas, dependencias ni configuración del despliegue. No se hizo commit, push ni publicación. Los archivos nuevos son evidencia/documentación de auditoría y se actualiza la nota de continuidad del workspace.

Convenciones: **R** = reproducción en emuladores; **C** = comprobación en código; **P** = comprobación de producción de solo lectura; **D** = diagnóstico de dependencias; **N** = navegador. Las limitaciones de cada hallazgo forman parte del resultado.

La [matriz de cobertura](COBERTURA.md) detalla roles, módulos, pruebas, pendientes y el estado de los hallazgos de la auditoría anterior. [Alcance y límites](ALCANCE.md).

## Hallazgos priorizados

| ID | Prioridad | Problema | Evidencia principal |
| --- | --- | --- | --- |
| F01 | P1 | Administrador departamental puede leer auditoría directamente en Firestore | R, C, P: A01 |
| F02 | P1 | Firestore omite revocación y controles de sesión que sí aplica la API | R, C, P: A02/A02b |
| F03 | P1 | Crear unidades simultáneamente sobrescribe registros | R, C: A03 |
| F04 | P1 | Importación de personal guarda parcialmente y devuelve un error general | R, C: A04 |
| F05 | P1 | Cinco sanciones publicadas tienen cadenas inconsistentes | P: diagnóstico agregado |
| F06 | P1 | Depuración existente es global e incompleta para el modelo actual | C: script de limpieza |
| F07 | P2 | CSV de filas rechazadas permite conservar fórmulas de hoja de cálculo | C: función extraída |
| F08 | P2 | Solicitud cerrada por cancelación extraordinaria desaparece de los filtros | R, C: A05 |
| F09 | P2 | Auditoría puede presentar como pendiente una solicitud vencida | R, C: A06; programador remoto no verificado |
| F10 | P2 | Reportes agrupan unidades por nombre, no por identidad | R, C: A07 |
| F11 | P2 | Fechas de reportes y mes del panel no usan una misma zona temporal | R, C: A08 |
| F12 | P2 | Reanudar una importación histórica pierde el total acumulado y carece de recorrido visible | R, C: A10 |
| F13 | P2 | La página publicada permite ser incrustada en otro sitio | P, N, C |
| F14 | P2 | Consultas completas y lecturas adicionales por persona limitan el crecimiento | C; carga de producción no medida |
| F15 | P2 | Dependencias con avisos de seguridad pendientes de evaluación/actualización | D, C |
| F16 | P3 | Documentación canónica y selectores de prueba están desactualizados | C, N |

### F01 — P1 — Acceso directo a auditoría superior al permitido por la API

**Comprobado.** `firestore.rules:60` permite leer `audit_logs` a `isDpto()`, que incluye `admin_dpto`. En cambio, `src/app/api/auditoria/route.ts:13` y la navegación reservan esta función a `super_admin`.

**Reproducción A01:** con el mismo usuario ficticio `admin_dpto`, la API devolvió **403**, pero una lectura REST de Firestore autenticada con su ID token devolvió **200** y el documento de auditoría. No requiere que la interfaz muestre la opción. Las reglas publicadas son idénticas; la lectura indebida se probó únicamente con datos ficticios.

**Impacto:** el administrador departamental puede acceder por fuera de la pantalla a documentos de auditoría, incluidos sus campos anteriores/posteriores, con un alcance mayor al definido para ese recurso.

**Corrección propuesta:** unificar el permiso de auditoría en API y reglas. Evaluar denegar lecturas directas de colecciones que ya se sirven exclusivamente mediante API. Conservar únicamente los accesos directos necesarios y documentados.

**Aceptación:** pruebas positivas para superadministrador y negativas para los otros cuatro roles tanto por API como por SDK/REST de Firestore; comprobar la regla publicada después del cambio.

### F02 — P1 — Revocación y condiciones de acceso distintas entre API y Firestore

**Comprobado.** `src/lib/auth/request-user.ts:67` verifica revocación; también rechaza `handoverPending` y unidades con más de un administrador activo (`:79`, `:84`). `firestore.rules:4` comprueba estado activo y cambio obligatorio de contraseña, pero no esas condiciones.

**Reproducciones:** A02 revoca las sesiones de un visor ficticio que conserva el perfil activo: API **401**, lectura directa con el token anterior **200**. A02b introduce dos administradores activos en una unidad: API **401**, lectura directa de una sanción propia **200**. El bloqueo explícito del perfil y el cambio obligatorio de contraseña sí denegaron ambos canales; no se afirma que todo relevo permita acceso posterior.

**Impacto:** una sesión que la aplicación considera inválida todavía puede leer documentos directamente durante la vigencia restante de su ID token. El rechazo de la API no protege ese segundo canal. Firebase documenta que la comprobación de revocación requiere una verificación adicional o metadatos comprobados por las reglas. [Documentación oficial de sesiones](https://firebase.google.com/docs/auth/admin/manage-sessions).

**Corrección propuesta:** cerrar lecturas directas innecesarias; si deben mantenerse, trasladar las condiciones relevantes a un documento de autorización que las reglas puedan verificar, incluida la fecha de validez de sesión y la asignación única de unidad. No confiar únicamente en el menú o en claims antiguos.

**Aceptación:** token revocado, perfil suspendido, relevo en curso y asignación ambigua denegados en todos los canales; sesión nueva y asignación válida permitidas. Volver a probar cambios de contraseña y relevo para evitar bloquear usuarios legítimos.

### F03 — P1 — Colisión y sobrescritura al crear unidades

**Comprobado.** `src/app/api/unidades/route.ts:75` consulta el último ID, calcula el siguiente y ejecuta `set` sin reservarlo en transacción (`:100`).

**Reproducción A03:** se enviaron 12 altas concurrentes con nombres ficticios diferentes. Las 12 respondieron **201**, pero devolvieron solamente **2 IDs distintos**. Las solicitudes que coincidieron sobreescribieron el documento anterior.

**Impacto:** pérdida silenciosa de unidades y posibilidad de asociar usuarios o registros a una identidad cuyo nombre fue reemplazado. No se encontró evidencia de que esta colisión haya ocurrido en los datos reales.

**Corrección propuesta:** asignación atómica mediante contador transaccional o identidad no colisionable, escritura con precondición de creación y auditoría en la misma transacción. Revisar también los límites del formato secuencial y los fallos entre escritura y auditoría.

**Aceptación:** altas concurrentes producen exactamente tantos documentos e IDs únicos como respuestas exitosas; no hay sobrescritura y cada alta conserva su auditoría.

### F04 — P1 — Importación de personal parcialmente aplicada sin resumen de resultado

**Comprobado.** `src/app/api/imports/personal/route.ts:60` comprueba que `rows` sea un arreglo, pero no valida íntegramente el lote antes de escribir. Cada fila se confirma en su propia transacción (`:159`) y el resumen se escribe al final.

**Reproducción A04:** una fila válida seguida de `null` produce **HTTP 500**, aunque ya existe **1 persona importada** y no se creó el resumen `imports_personal`. El registro individual de auditoría puede existir; el fallo es la falta de un resultado de lote fiel y recuperable, no la ausencia de toda trazabilidad.

El ejemplo usa una entrada API malformada; no se afirma que el lector normal de CSV genere `null`. Demuestra que un error posterior a una escritura no revierte el lote. Un corte de proceso o red plantea el mismo riesgo de estado parcial, aunque ese corte no se simuló.

**Corrección propuesta:** validar estructura y límites del lote antes de escribir, crear una operación persistente y acumular resultados por fila. Permitir reanudación idempotente y diferenciar rechazadas, nuevas, existentes y fallidas. Evitar que un 500 general invite a repetir sin conocer lo ya aplicado.

**Aceptación:** entrada inválida no provoca escritura inesperada; interrupción entre filas deja estado identificable y reanudable; los totales de interfaz coinciden con lo persistido, sin duplicar CI.

### F05 — P1 — Inconsistencias históricas presentes en la base publicada

**Comprobado en lectura real agregada:** 179 sanciones revisadas; 5 marcadas para revisión en 2 personas: **2 por períodos superpuestos de una misma conducta** y **3 por bifurcación de cadena**. Evidencia: `datos-agregados.json` e `integridad-agregada.json`.

**Impacto:** el motor no puede resolver con certeza esos antecedentes. Mantener el bloqueo ante una cadena ambigua es prudente; el problema es el historial incoherente, no que la aplicación se niegue a inventar un origen. Además, la resolución actual analiza el historial de la persona antes de elegir la conducta, por lo que una inconsistencia puede impedir otras evaluaciones de esa persona.

**Corrección propuesta:** identificar de forma controlada los documentos afectados, cotejarlos con su respaldo documental y decidir corrección trazable o retiro únicamente si se confirma que son pruebas autorizadas. No reconstruir automáticamente basándose solo en fechas parecidas.

**Aceptación:** diagnóstico sin cadenas ambiguas o excepciones expresamente documentadas y aisladas; pruebas de ambas personas después de la regularización; conservación del origen y del rastro de ajuste. Esta auditoría no guarda identidades personales ni modifica esos registros.

### F06 — P1 — El procedimiento de depuración no está listo para usarse

**Comprobado en código, sin ejecutarlo:** `scripts/cleanup-production-data.mjs:6` define colecciones completas; `:62` elimina todos sus documentos por lotes. La confirmación dice “datos de prueba”, pero no existe selección por documento ni criterio que distinga pruebas de información real.

La lista omite `imports_sanciones` y sus subcolecciones `rows`, `notificaciones` y `confirmaciones`. Conserva `audit_logs`, donde pueden permanecer copias anteriores/posteriores; esto puede ser correcto por conservación histórica, pero debe formar parte de una política explícita. El script también realiza automáticamente una exportación local (`:92–96`), incompatible con ejecutar sin más la decisión previa de no exportar datos. No se ejecutó ni esa exportación ni la limpieza.

**Impacto:** una depuración podría borrar registros legítimos, dejar residuos y referencias inconsistentes o generar un respaldo no autorizado. El borrado por lotes y sin pausa de escrituras también admite un estado parcial ante fallo o actividad simultánea.

**Corrección propuesta:** preparar un manifiesto explícito de datos autorizados, inventario de colecciones/subcolecciones, simulación de impacto y criterios de conservación de auditoría. Definir ventana de operación y recuperación; cualquier respaldo con datos personales requiere una decisión expresa sobre alcance y destino.

**Aceptación:** ensayo completo en una copia ficticia representativa, resultado y relaciones verificables, controles de reanudación, ningún documento fuera del manifiesto afectado y ninguna exportación implícita. La depuración real requiere autorización específica posterior.

### F07 — P2 — Fórmulas sin neutralizar en el CSV de errores históricos

**Comprobado.** `src/components/registro/importar-sanciones-historicas.tsx:132` solo rodea el valor con comillas y escapa comillas internas. La ejecución de esa función extraída del archivo transforma `=1+1` en `"=1+1"`; conserva el prefijo de fórmula en el CSV descargado (`:179`).

**Impacto:** valores provenientes de una planilla importada pueden interpretarse como fórmulas al abrir el reporte en una hoja de cálculo. No se ejecutaron fórmulas en Excel ni se demostró ejecución de comandos.

**Corrección propuesta:** aplicar una política común de celdas seguras, como la ya presente en `src/lib/domain/audit-report.ts`, sin alterar los datos originales almacenados. Cubrir `=`, `+`, `-`, `@`, espacios y caracteres de control iniciales según el formato destino.

**Aceptación:** CSV malicioso de prueba se abre como texto, conserva delimitadores/comillas y no evalúa fórmulas; verificar también impresión y los demás exportadores.

### F08 — P2 — Cierre extraordinario invisible en la bandeja

**Comprobado.** La cancelación extraordinaria guarda una solicitud pendiente como `cerrada_extraordinaria`; la interfaz `src/components/solicitudes/solicitudes-page.tsx:20` y `:207` solo admite pendiente, aprobada y rechazada.

**Reproducción A05:** después de la cancelación extraordinaria, el documento sigue existiendo, pero ninguno de los tres filtros disponibles lo devuelve. No se perdió el registro; dejó de ser localizable mediante ese recorrido.

**Corrección propuesta:** incorporar estado y filtro comprensibles para “Cerrada por cancelación extraordinaria”, con fecha, motivo y sanción relacionada; mantener los permisos de unidad. Evitar presentarla como aprobación ordinaria.

**Aceptación:** solicitante y responsable autorizado pueden encontrarla; el informe del superadministrador conserva la distinción y las notificaciones concuerdan.

### F09 — P2 — Vencimiento lógico y estado visible de solicitudes pueden diferir

**Comprobado.** `src/app/api/auditoria/route.ts:35` informa el `estado` persistido sin normalizar el vencimiento. A06 crea una solicitud ficticia con plazo cumplido y estado persistido pendiente: el informe todavía muestra **pendiente**. Otros recorridos excluyen el vencimiento o lo procesan al consultar, de modo que la inconsistencia depende del orden de uso.

Existe el endpoint protegido `src/app/api/internal/expire-requests/route.ts`. Las últimas notas de publicación declaran pendiente configurar el programador. No se verificó en esta sesión un cron activo ni su secreto en Vercel; el **401** público confirma protección, no demuestra que el cron exista o esté ausente. En la lectura real no había solicitudes pendientes, por lo que no se observó un caso real vencido durante esta revisión.

**Corrección propuesta:** confirmar y probar el trabajo periódico, registro de sus ejecuciones y alertas; hacer coherente la representación del estado efectivo en auditoría y consultas. Conservar la diferencia entre rechazo humano y vencimiento: este último no dispensa la espera de siete días.

**Aceptación:** una solicitud vence y notifica sin visitas de usuarios; panel, bandeja, auditoría y motor muestran el mismo resultado; la tarea es idempotente y sus fallos son observables.

### F10 — P2 — Estadísticas de unidades separadas o fusionadas por su nombre

**Comprobado.** `src/app/api/reportes/route.ts:67` usa el nombre histórico como clave del agrupamiento, aunque dispone de una identidad de unidad.

**Reproducción A07:** dos sanciones con el mismo `unidadId` y distinto nombre histórico generan **2 grupos**. El contador de unidades de la pantalla también toma el número de grupos. Inversamente, unidades diferentes con el mismo nombre podrían combinarse; esto último se deduce del código y no fue necesario escribirlo en producción.

**Corrección propuesta:** agrupar por ID estable, elegir un nombre de presentación y preservar el nombre histórico en el detalle de cada sanción.

**Aceptación:** un cambio de nombre no duplica la unidad; dos IDs con el mismo nombre no se fusionan; subtotales y total general coinciden.

### F11 — P2 — Fechas civiles de Bolivia y UTC mezcladas

**Comprobado en código y caso controlado.** `src/app/api/dashboard/route.ts:36` construye el mes usando la zona del servidor. `src/components/reportes/reportes-page.tsx:38` obtiene fechas predeterminadas con `toISOString()`, que usa UTC.

**Reproducción A08:** a las 02:00 UTC del 01/11/2026 aún es 31/10, 22:00 en Bolivia. Ejecutado con zona de servidor UTC, el algoritmo de “Este mes” excluye una sanción del 31/10. No se verificó la zona efectiva del proceso remoto; la dependencia existe y el ejemplo la reproduce. En el navegador boliviano, `toISOString()` también adelanta el día a partir de las 20:00 locales.

**Corrección propuesta:** centralizar fecha civil y límites mensuales en `America/La_Paz`, distinguiendo fechas de sanción de instantes de registro. El motor de cadenas ya dispone de utilidades específicas; no cambiar su duración por corregir el formato de reportes.

**Aceptación:** probar 19:59/20:00, medianoche, fin de mes, año nuevo y año bisiesto en navegador/servidor con zonas distintas, obteniendo el mismo período institucional.

### F12 — P2 — Resumen y recuperación de una importación histórica incompletos

**Comprobado.** En `src/app/api/imports/faltas/[id]/confirm/route.ts:194`, `createdRows` comienza en cero en cada intento; una fila ya persistida se omite (`:270`) y suma a `skippedRows` (`:306`). Al finalizar se reemplaza el total del lote por el total del último intento (`:316`).

**Reproducción A10:** se provoca un fallo después de crear una sanción ficticia, se corrige una fila de preparación en el emulador y se reanuda. Quedan **2 sanciones del lote**, pero la respuesta y el resumen dicen **1 creada y 1 omitida**. La interfaz llama “rechazadas” a todas las omitidas (`importar-sanciones-historicas.tsx:260`), aunque una se creó correctamente antes.

El servidor sí tiene lease y protección para no recrear registros anulados. La limitación adicional es de operación: la previsualización vive en estado del componente, la lista presenta solo los últimos diez lotes y no ofrece un recorrido para reabrir/reanudar el lote después de recargar la página.

**Corrección propuesta:** resultados acumulados por fila y lote, diferenciando ya procesadas de rechazadas; recuperación visible del lote y de su previsualización persistida, con permisos y revalidación antes de continuar.

**Aceptación:** interrumpir y recargar, reanudar el mismo lote, verificar totales acumulados, cero duplicados y ausencia de resurrección de sanciones sin efecto.

### F13 — P2 — Falta protección explícita contra incrustación de la interfaz

**Comprobado en producción.** La respuesta no incluyó `Content-Security-Policy` ni `X-Frame-Options`; el navegador pudo cargar la pantalla anónima de acceso dentro de un iframe. Evidencias: `produccion.json`, `navegador-publico.json`. Tampoco se observaron `X-Content-Type-Options` ni `Referrer-Policy`; HSTS sí estaba presente.

**Impacto:** falta una defensa contra superposición de interfaces y clickjacking. No se realizó un ataque sobre una sesión real ni se demostró la emisión de una sanción mediante ese mecanismo.

**Corrección propuesta:** definir `frame-ancestors` y cabecera de respaldo según la necesidad real de integración, además de `nosniff` y política de referente. Introducir una CSP compatible con Firebase/Next de forma comprobada, sin bloquear a ciegas scripts necesarios.

**Aceptación:** iframe de un origen no autorizado rechazado; acceso y flujos autorizados funcionan; cabeceras verificadas en la publicación definitiva.

### F14 — P2 — Crecimiento de lecturas sin límites adecuados en el servidor

**Comprobado estructuralmente.** La búsqueda general en `src/app/api/personal/route.ts:44` carga todo el padrón y recién después filtra/pagina en memoria. `src/lib/server/chain-views.ts:7` añade una consulta completa de sanciones por cada persona incluida en el resultado. Panel, historial, informes y actualizaciones periódicas pueden repetir ese trabajo.

**Impacto previsto:** latencia, costo de lecturas y riesgo de agotar tiempo de una función cuando crezcan el padrón, el historial y los usuarios simultáneos. No se hicieron pruebas de carga contra producción ni se demuestra que hoy esté excediendo sus límites.

**Corrección propuesta:** consultas y paginación efectivas en servidor, búsqueda indexada adecuada, estadísticas agregadas y límite de concurrencia/carga. Conservar la integridad del historial al optimizar; no volver a truncar silenciosamente antecedentes para ganar velocidad.

**Aceptación:** medir número de lecturas y percentiles de latencia con un volumen ficticio representativo y concurrencia acordada; búsqueda, historial y contadores completos y consistentes.

### F15 — P2 — Avisos de seguridad en dependencias

**Comprobado con `npm audit`: 13 paquetes afectados — 4 altos, 8 moderados y 1 bajo; 0 críticos.** El resultado está en `npm-audit.json`. El número incluye propagación por dependencias transitivas; no equivale a 13 fallos explotables independientes de la aplicación.

Entre los avisos se encuentran `@grpc/grpc-js` y `uuid`. El aviso de gRPC requiere configuraciones concretas de autenticación de servidor; no se identificó ese uso en el código de esta app. El aviso de UUID afecta variantes con buffers y límites; tampoco se demostró una ruta explotable aquí. [Aviso oficial de gRPC](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j), [aviso oficial de UUID](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).

**Corrección propuesta:** revisar alcance de ejecución y versiones compatibles, actualizar de manera controlada y repetir las pruebas de Auth/Firestore/build. No ejecutar `npm audit fix --force`: el diagnóstico propone incluso cambios mayores o una versión antigua de Firebase para algunas rutas, que no constituyen automáticamente una solución válida.

**Aceptación:** avisos eliminados o excepción documentada con alcance técnico, responsable y seguimiento; lockfile reproducible y regresiones comprobadas. No se alteraron paquetes durante esta auditoría.

### F16 — P3 — Documentación y prueba de navegador desfasadas

**Comprobado.** `docs/BASE_CONOCIMIENTO_APP.md:3` todavía dice que los últimos cambios no se publicaron y presenta anteriores problemas como pendientes, aunque `health` y la nota superior de `.ai/session.md` confirman publicación. El documento histórico debe conservarse, pero la fuente de entrada actual necesita apuntar inequívocamente al estado vigente.

`scripts/e2e-functional.mjs` conserva etiquetas anteriores de campos. La copia de auditoría corrigió solamente selectores y una coincidencia de texto ambigua para ejecutar el flujo actual; esto no fue un arreglo de la aplicación. No se encontró una configuración de CI versionada que asegure ejecutar estos recorridos antes de publicar; las políticas remotas de rama no se verificaron.

**Corrección propuesta:** actualizar la referencia funcional vigente, mantener la auditoría anterior como histórica, ajustar selectores estables y conectar las verificaciones pertinentes al proceso de publicación. No confundir una prueba que falla por selector con una regresión de negocio.

**Aceptación:** un nuevo colaborador identifica versión, reglas, pendientes y comandos correctos; el comando oficial E2E funciona sin la copia de auditoría y las verificaciones son reproducibles.

## Controles que sí se comprobaron

- Las 35 operaciones API ordinarias ejercitadas rechazaron token ausente e inválido: 70 comprobaciones. Ocho respuestas de operaciones retiradas devolvieron 410. Esto no cubre por sí solo todas las combinaciones autenticadas.
- Usuarios de unidad no obtienen historial global al manipular `scope` ni información de otra unidad al alterar el parámetro. El operador no registra sanciones.
- Perfil bloqueado y cambio de contraseña obligatorio impiden el uso ordinario de API y lecturas directas comprobadas. El cambio real de contraseña y la renovación de sesión funcionaron en el emulador.
- Funcionan confirmaciones vinculadas a la operación, autor y unidad; comprobaciones transaccionales de los flujos disciplinarios y conservación del rastro de cancelación.
- Las pruebas cubren cadenas separadas por artículo/inciso, bases en 9 y 10, vencimiento, espera de siete días, solicitudes pendientes, rechazo expreso frente a vencimiento y rebaja de dependientes por cancelación extraordinaria.
- El E2E comprobó selección del padrón, confirmación, persistencia de unidad/autor, solicitud, resolución, notificación, informes separados del superadministrador, conductas paralelas y reinicio tras vencimiento.
- El menú lateral fue visible y navegable con emulación Pixel 7/táctil. El reporte no desbordó horizontalmente el documento; su tabla conserva desplazamiento interno. Se inspeccionaron las capturas. Esto no sustituye una prueba en teléfono físico.
- Seis rutas GET protegidas de producción devolvieron 401 sin sesión; la página de ingreso cargó sin errores JavaScript en la prueba pública.
- En los datos revisados: 1.483 personas y 1.483 entradas de CI; sin CI duplicados, referencias de sanción a persona inexistente ni unidades inexistentes; sin discrepancias entre padrón y registro de CI; sin dos administradores activos de una unidad. Existen 44 unidades y 2 perfiles de usuario. Estas afirmaciones describen la instantánea inspeccionada.

## Plan de cierre recomendado

1. **Permisos y sesión:** resolver F01/F02 y comprobar API más acceso directo; preparar reglas y código coherentes para una publicación autorizada.
2. **Integridad antes de cargas:** corregir F03/F04/F12. Revisar F05 documentalmente y regularizar solo los registros autorizados, con trazabilidad.
3. **Cancelaciones y operación:** cerrar F08/F09, confirmar ejecución programada y correspondencia entre notificaciones, bandeja e informes.
4. **Calidad y seguridad complementarias:** F07/F10/F11/F13/F14/F15/F16; verificar exportaciones, zona temporal, crecimiento, dependencias y documentación.
5. **Preparar depuración:** reemplazar o adecuar F06; aprobar manifiesto y conservación, ensayar recuperación sin datos reales y obtener autorización específica antes de ejecutarla.
6. **Revisión final de correcciones:** pruebas dirigidas a cada hallazgo más regresión de roles/cadenas; comprobación del despliegue autorizado y prueba controlada en teléfonos físicos. Registrar pendientes aceptados y evidencias. Solo entonces decidir la carga definitiva.

## Límites y pendientes que no deben confundirse con fallos demostrados

- No se realizó una operación autenticada de negocio en producción. El acceso y el flujo real completo todavía requieren verificación controlada con sus responsables.
- No se comprobó IAM efectivo completo, protección de claves en la plataforma, copias automáticas/PITR, restauración, presupuestos/cuotas ni alertas. Usar Admin SDK no certifica esos controles: las bibliotecas de servidor no dependen de las reglas del cliente. [Condiciones de seguridad de Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).
- No se verificó un programador activo ni `CRON_SECRET` en Vercel. No se reintentó el OAuth rechazado en una etapa anterior.
- No se enviaron POST a la integración real. La revisión automática rechazó una comprobación de producción que incluía ese método por su posible efecto sobre registros; se retiró y se continuó únicamente con GET. No bloqueó el resto de la auditoría.
- No se certifica compatibilidad con dispositivos físicos, todos los navegadores, accesibilidad completa, volúmenes máximos ni conexiones externas BSFP.
- El escaneo acotado de secretos examinó 18 commits y 338 blobs de texto con cuatro patrones, sin coincidencias. No es un escaneo exhaustivo de credenciales, validación de llaves ni evidencia de que nunca hubo una exposición.
- Se contrastaron reglas funcionales aprobadas por el usuario, incluida la duración de 365 días. No se revisó la validez jurídica del catálogo o de la confirmación interna; esta última no se presenta como firma mediante certificado.
- El conjunto pasa lint, build y 97 pruebas existentes distintas. Las 13 reproducciones adicionales también finalizan correctamente, **pero varias esperan el comportamiento defectuoso para demostrarlo**; su PASS no equivale a que esos fallos estén corregidos.

## Archivos de evidencia

| Evidencia | Contenido |
| --- | --- |
| `reproducciones.test.cjs`, `reproducciones-resultados.json`, `reproducciones.log` | Casos A01–A10, controles y negativas de autenticación; solo emuladores |
| `produccion.json`, `verificar-produccion.mjs` | Revisión pública, cabeceras, reglas remotas e índices; GET de solo lectura |
| `datos-agregados.json`, `integridad-agregada.json`, `integridad-agregada.cjs` | Conteos y consistencia sin identidades personales exportadas |
| `estatico.json`, `comprobaciones-estaticas.cjs` | Escaneo acotado de secretos, CSV y alcance de depuración |
| `npm-audit.json` | Avisos actuales de paquetes |
| `domain.log`, `imports.log`, `server-baseline.log`, `server-recurrence.log` | Suites existentes de dominio, importación, workflow y rechazo/reincidencia |
| `build.log`, `lint.log`, `lint-final.log` | Verificación de compilación/tipos y lint |
| `e2e-auditoria.mjs`, `e2e.log`, `ui/e2e.json` | Recorrido actual con selectores adaptados y emulación móvil |
| `ui/menu-pixel7.png`, `ui/reporte-pixel7.png`, otras capturas de `ui/` | Interfaz con datos ficticios; los archivos `failure-*` son evidencia del primer intento con selector ambiguo |
| `navegador-publico.json`, `navegador-publico.mjs`, `login-publico.png` | Login público y prueba anónima de iframe, sin sesión real |

Las evidencias son locales, no una instrucción para volver a ejecutar scripts contra producción. Para reproducir pruebas usar exclusivamente los comandos y precauciones de `COBERTURA.md`.
