# Plan de corrección y preparación para datos definitivos

Fecha: 28/10/2026. Estado al redactarse: **plan preparado, antes de su ejecución**. El usuario autorizó posteriormente su aplicación; el estado vigente y la evidencia están en [EJECUCION_CORRECCIONES_2026-10-28.md](EJECUCION_CORRECCIONES_2026-10-28.md).

Base: auditoría integral de la revisión `2c55379adf28145a1c7c72837cb534911a86a707`. El estado local se volvió a comprobar al preparar este plan; solo estaban pendientes de versionar los archivos de la auditoría. Fuentes: [informe](auditoria-2026-10-28/INFORME.md), [cobertura](auditoria-2026-10-28/COBERTURA.md) y decisiones posteriores del usuario.

## 1. Objetivo y decisión sobre los datos existentes

Corregir los 16 hallazgos, conservar el funcionamiento aprobado por rol y dejar la app preparada para cargar información definitiva, sin arrastrar las asignaciones antiguas de personal por unidad ni residuos de las pruebas.

**El usuario ha confirmado que los datos actuales insertados son de prueba y permite eliminarlos parcial o totalmente cuando sea necesario para aplicar correctamente las correcciones.** Esta decisión sustituye la incertidumbre anterior sobre la necesidad de conservar o reconstruir documentalmente las cinco sanciones inconsistentes. No es necesario investigar exhaustivamente su procedencia para retirarlas.

La estrategia recomendada es **corregir primero el código y después reiniciar de forma controlada los datos operativos de prueba**, conservando accesos y configuración útiles. No se borrará el proyecto Firebase ni se confundirá una cuenta de acceso con una persona del padrón. Tampoco se utilizará la limpieza como sustituto de arreglar los errores que se reprodujeron con datos nuevos.

La autorización de eliminación queda registrada para la ejecución de la etapa correspondiente; no se pedirá nuevamente autorización para cada registro de prueba. Este turno solicita un plan y, por tanto, no ejecuta el borrado ni las correcciones. La publicación y cualquier cambio de servicio/costo se incluirán en el alcance autorizado al pasar a ejecución; no se infieren de esta preparación documental.

Se mantiene la decisión previa de **no exportar los datos**: el procedimiento no creará un respaldo local con documentos personales automáticamente. El borrado no tendrá una restauración de datos garantizada; la recuperación prevista de estas pruebas será recrear escenarios sintéticos. La reversión del código y la recuperación del servicio son operaciones distintas de recuperar documentos borrados.

## 2. Condiciones funcionales que deben conservarse

| Área | Condición de aceptación permanente |
| --- | --- |
| Padrón | Un único listado departamental; sin destino/asignación de efectivos por unidad |
| Historial de unidad | Se deriva de las sanciones registradas en esa unidad; incluye las que quedaron sin efecto para consulta separada |
| Registro por unidad | Solo `admin_unidad`, con unidad tomada del perfil vigente; un registrador activo por unidad |
| Acceso de consulta | `operador_unidad` consulta su ámbito; `visor_dpto` consulta ámbito departamental; sin registrar ni resolver |
| Administración departamental | Registra para distintas unidades y resuelve solicitudes con motivo y confirmación |
| Superadministración | Conserva todas sus funciones, auditoría y cancelación extraordinaria con motivo |
| Relevo | El acceso anterior deja de operar antes de habilitar al sustituto; el historial pertenece a la unidad |
| Reincidencia | Persona + artículo/inciso de la conducta original; cadenas independientes aun cuando se apliquen 10/1 u 11/1 |
| Plazo anual | 365 días desde la base vigente; nuevas reincidencias no renuevan el plazo; al vencer puede comenzar otra cadena |
| Solicitud ordinaria | Solo el autor, dentro de siete días desde el registro; pendiente bloquea el uso del antecedente |
| Resolución | Cinco días; motivo al aprobar/rechazar; vencimiento automático no equivale a rechazo humano ni dispensa espera |
| Rechazo expreso | Evidencia verificable permite dispensar la espera restante del antecedente correspondiente |
| Extraordinaria | Cancela solo la elegida; descendientes bajan un escalón; nueva base cuenta su año desde su propia fecha de sanción |
| Evidencia | Confirmación interna auditable; conservación de clasificación original/actual y motivos; no presentarla como firma con certificado |
| Estadísticas | Sanciones sin efecto excluidas de totales vigentes, visibles por separado; unidad y fecha institucional coherentes |

No se cambiarán estas reglas para que una prueba pase, ni se reactivarán transferencias de personal eliminadas. Las pruebas locales de los plazos usarán reloj/fechas controlados; la omisión manual de espera no puede activarse en producción.

## 3. Secuencia y cobertura de hallazgos

| Etapa | Trabajo | Hallazgos | Dependencia / resultado |
| --- | --- | --- | --- |
| E0 | Preparación y contratos de aceptación | Todos | Base de código y casos de referencia conservados |
| E1 | Unificar permisos y cerrar lectura directa innecesaria | F01, F02 | Bloque previo a cambios de datos |
| E2 | Unidades e importaciones consistentes | F03, F04, F12 | Altas sin sobrescritura; lotes reanudables |
| E3 | Cancelaciones, estados y vencimientos | F08, F09 | Bandeja, auditoría y motor coherentes |
| E4 | Reportes, fechas y exportación | F07, F10, F11 | Datos y presentación correctos |
| E5 | Defensa web, dependencias y consultas | F13, F14, F15 | Superficie reducida y crecimiento medido |
| E6 | Procedimiento de reinicio de datos y retirada de residuos | F05, F06 | Herramienta ensayada, todavía sin ejecutarla en la base publicada |
| E7 | Regresión integral y documentación vigente | F16 y todos | Versión corregida validada localmente |
| E8 | Publicación controlada y verificación | Todos los cambios de código/configuración | Versión exacta y configuración publicadas comprobadas |
| E9 | Depuración de pruebas y carga definitiva | F05, F06 | Base operativa limpia, accesos preservados y carga verificable |

La limpieza publicada queda al final, después de las correcciones, su prueba local y la comprobación del despliegue. Así se evita borrar primero y ocultar un defecto que reaparecería con los datos definitivos.

## 4. E0 — Preparación proporcionada

1. Registrar commit, diff, archivos de configuración y resultados base; preservar cambios previos. Respaldar solamente código/configuración no secreta mediante Git o copia de código, sin exportar Firestore.
2. Conservar los informes de auditoría y crear una lista de seguimiento F01–F16 con estados: pendiente, implementado, verificado localmente y verificado publicado, según corresponda.
3. Convertir las reproducciones que esperan fallos en pruebas con expectativas correctas; conservar las reproducciones originales como evidencia histórica, fuera del criterio de aceptación de la versión corregida.
4. Trabajar con `demo-app-faltas` y puertos libres. No reutilizar ni limpiar una demo manual con trabajo del usuario sin necesidad.
5. Preparar fixtures pequeños que reproduzcan el modelo antiguo y el actual. No copiar el padrón publicado para obtener esos fixtures.

**Entrega:** rama/diff de trabajo identificable, casos de aceptación y fixtures. No ejecutar otra auditoría general ni reconstruir sanciones de prueba históricas.

## 5. E1 — Autorización coherente en API y Firestore

### Decisión técnica propuesta

El cliente revisado utiliza Firebase Auth y obtiene perfil/datos mediante API. `src/lib/firebase/client.ts` no inicializa Firestore para la interfaz y la búsqueda de consumidores en hooks/componentes no encontró lecturas directas. Por ello, la solución preferida es **denegar toda lectura y escritura directa de documentos a los clientes de la app y servir los datos por los endpoints autorizados existentes**.

Esto cierra F01 y F02 sin duplicar en reglas todas las condiciones de revocación, relevo y unicidad. Firebase Auth sigue funcionando: autenticar una cuenta no requiere permiso de lectura a documentos de Firestore. Los controles del servidor siguen siendo indispensables, porque Admin SDK no queda restringido por las reglas de cliente. [Referencia de Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).

### Acciones

1. Confirmar el inventario completo de consumidores antes de cambiar reglas, incluyendo `/api/me`, listas, importadores y cualquier consumidor declarado. Si aparece un acceso directo necesario, migrarlo al endpoint correspondiente en el mismo cambio.
2. Sustituir permisos directos innecesarios por denegación por defecto. No dejar una excepción de auditoría para `admin_dpto` ni una excepción general para `super_admin` cliente: el superadministrador usa su API autorizada.
3. Mantener `verifyIdToken(..., true)`, perfil activo, cambio obligatorio, relevo en curso, rol válido, unidad y registrador único en `request-user.ts`.
4. Revisar que las mutaciones sensibles revaliden actor/rol/unidad en la transacción, de modo que un cambio de acceso entre la comprobación inicial y la escritura no autorice una operación tardía.
5. Confirmar coherencia de menús, datos visibles y caché. Invalidar datos de la sesión al cambiar usuario, rol o unidad; nunca usar una caché compartida sin ámbito de autorización.

**Archivos principales:** `firestore.rules`, `src/lib/auth/request-user.ts`, `src/lib/server/operations.ts`, `src/lib/server/user-access.ts`, rutas afectadas y pruebas de reglas/workflow.

**Pruebas obligatorias:** lectura/escritura directa denegada para anónimo y los cinco roles; API permite cada función legítima; token revocado, perfil bloqueado, cambio obligatorio, relevo pendiente, unidad ajena y asignación ambigua denegados. El superadministrador sigue entrando y generando ambos informes de auditoría por API.

**Cierre:** expectativas seguras de A01/A02/A02b satisfechas, sin regresión del acceso normal; después de publicar, reglas remotas coinciden con las revisadas.

## 6. E2 — Unidades e importaciones sin resultados engañosos

### E2.1. Alta y mantenimiento de unidades — F03

1. Reemplazar “leer máximo y hacer set” por reserva transaccional de secuencia o identificador estable no colisionable. Preferencia: mantener el formato visible `U-XXX` mediante contador protegido, sin renumerar unidades existentes.
2. Inicializar el contador a partir del máximo numérico real de unidades una sola vez; no ordenar numéricamente mediante una comparación lexicográfica que falle al superar tres dígitos.
3. Crear unidad, avanzar contador y escribir auditoría en la misma transacción; usar precondición de creación para impedir sobrescritura.
4. Usar identificador de operación para que repetir una petición por pérdida de respuesta no cree una segunda unidad.
5. Aplicar la misma coherencia a edición/desactivación y sus registros de auditoría.
6. Retirar la dependencia obsoleta de `personal.unidadId` al desactivar unidades. La consulta sigue presente en `src/app/api/unidades/route.ts:192`, aunque la asignación de efectivos fue retirada. Conservar los controles por sanciones históricas y verificar responsables activos/relevos antes de desactivar. No confundir `users.unidadId`, que sigue siendo necesario, con el campo antiguo del padrón.

Firestore permite agrupar escrituras transaccionales y reintenta el bloque ante ciertos conflictos; por ello no se colocarán efectos externos o notificaciones no idempotentes dentro de ese bloque. [Transacciones oficiales](https://firebase.google.com/docs/firestore/manage-data/transactions).

**Aceptación:** 12 y luego un lote mayor de altas concurrentes generan exactamente el número de unidades exitosas, sin IDs repetidos ni auditoría separada del alta. Reintentar la misma operación conserva la unidad. Una asignación antigua en un fixture del padrón no determina la baja de una unidad; un responsable vigente sí se considera.

### E2.2. Importación de personal — F04

1. Validar la estructura completa del cuerpo, tamaño, cantidad de filas y tipos antes de escribir. Una fila `null` u objeto malformado debe producir un error controlado y cero escrituras del lote rechazado estructuralmente.
2. Distinguir errores globales de formato de errores de una fila. Los errores de datos por fila deben quedar identificados y presentarse en la previsualización/resultado, no convertirse en un 500 general después de insertar otras filas.
3. Crear un registro de lote persistente con identidad, huella del archivo, autor, fechas, estado y resultados por fila. Mantener `imports_personal`; cualquier subcolección nueva debe incluirse en el inventario de depuración.
4. Procesar por bloques limitados al tiempo disponible del servidor. Guardar progreso y permitir reanudación mediante el mismo ID de lote, con exclusión de dos procesadores simultáneos y recuperación de un bloqueo vencido.
5. Reservar CI, crear la persona, registrar la auditoría y marcar la fila aplicada de forma atómica. Mantener la política actual sobre CI existente; no inventar una sobrescritura masiva de datos personales.
6. Devolver totales acumulados: creadas, existentes/omitidas, rechazadas y pendientes de procesamiento. La suma debe explicar todas las filas. Un corte de conexión no borra la evidencia de lo aplicado.
7. Incluir campos de búsqueda del nuevo modelo cuando corresponda a E5; nunca volver a grabar una asignación de personal a unidad.

**Aceptación:** entrada malformada sin escrituras; fallo en medio del lote con recuperación exacta; dos reintentos no duplican personas/CI; pantalla, lote y cantidad persistida coinciden. Cubrir archivo vacío, duplicados internos, caracteres con tildes y límites de tamaño.

### E2.3. Importación histórica — F12

1. Mantener lease, revalidación de antecedentes y protección contra recreación de registros sin efecto.
2. Persistir resultado por fila en la misma transacción que crea la sanción. Calcular totales acumulados del lote, no contadores reiniciados en cada invocación.
3. Separar “ya procesada” de “rechazada”; no presentar una sanción creada en el intento previo como error al reanudar.
4. Añadir consulta del lote y filas por ID, lista paginada y acciones para abrir, continuar o consultar resultado después de recargar la página.
5. Revalidar permisos y antecedentes en cada continuación. No editar automáticamente una fila ya aplicada ni resucitar anuladas.
6. Revisar el resumen de reversión para que use la cantidad real aplicada; conservar el motivo y la autorización existentes.

**Archivos principales:** `src/app/api/imports/personal/route.ts`, `src/app/api/imports/faltas/`, componentes de importación, validadores y helpers acotados de lote.

**Aceptación A10 corregida:** tras un intento parcial y reanudación, dos sanciones persistidas se reflejan como dos aplicadas acumuladas; cero duplicados y cero resurrecciones. Recargar el navegador permite recuperar la operación sin volver a subirla como lote nuevo.

## 7. E3 — Cancelaciones localizables y vencimientos coherentes

### E3.1. Cierre extraordinario — F08

1. Incluir `cerrada_extraordinaria` en tipos compartidos, filtros API, bandeja y etiquetas.
2. Mostrar “Cerrada por cancelación extraordinaria”, fecha, motivo, resolución y enlace al registro, dentro del ámbito permitido.
3. Incorporar el mismo estado a informes y exportación; no contarlo como pendiente ni como aprobación ordinaria.
4. Mantener notificación al solicitante y responsables actuales de la unidad, sin duplicados.

**Aceptación:** A05 deja de desaparecer de los filtros; queda localizable por la unidad y el superadministrador y no altera el contador de pendientes.

### E3.2. Vencimiento lógico y procesamiento — F09

1. Centralizar el cálculo del estado efectivo de una solicitud usando hora del servidor y el plazo establecido. Panel, bandeja, auditoría y evaluación deben coincidir aun si el procesamiento periódico se retrasa.
2. Mantener la resolución persistente de vencimientos en una operación transaccional e idempotente. Distinguir `resolvedAt` (vencimiento efectivo) de `processedAt` (momento de procesamiento).
3. Consultar solo solicitudes pendientes vencidas, con orden, índice, cursor y lote limitado. No recorrer todo el historial en cada ejecución.
4. Exigir el secreto del endpoint y registrar métricas mínimas: última ejecución, escaneadas/procesadas y error, sin datos personales en logs.
5. Probar competencia entre cron y resolución humana: solo una resolución válida gana y se genera una sola notificación.
6. Configurar y verificar un programador real antes de dar por cerrada la entrega automática. El objetivo propuesto es procesar cada cinco minutos; la exactitud del límite de cinco días no dependerá de la puntualidad del cron.

**Dependencia operativa concreta:** revisar el plan y las conexiones disponibles de Vercel. Su documentación limita Hobby a una ejecución diaria, mientras Pro/Enterprise permiten intervalos menores. No afirmar que el ejemplo `deploy/vercel-cron-pro.example.json` está activo ni imponer una suscripción. Si el plan actual no permite la frecuencia, dejar preparado el endpoint y escoger un programador ya autorizado o presentar la decisión concreta de servicio/costo antes de activarlo. [Límites de cron de Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).

**Aceptación:** vencimiento visible y efectivo al llegar el límite, sin dispensa por rechazo automático; tarea ejecutada sin visitas de usuarios, notificación única y evidencia verificable de su programación. Si solo está probado el código local, F09 permanece parcialmente pendiente de operación.

## 8. E4 — Informes, fechas y exportación

### E4.1. Unidad por identidad — F10

Agrupar por `unidadId`/identidad sancionadora estable; presentar un nombre coherente, conservando el nombre histórico en cada sanción. Adaptar tipos API/UI y claves de caché. El contador de unidades debe contar IDs distintos, no nombres.

**Aceptación:** un ID renombrado produce un grupo; dos IDs con igual nombre producen dos grupos; subtotales coinciden con el total. No convertir el informe en un conteo de personal destinado.

### E4.2. Fecha institucional — F11

Centralizar utilidades de fecha civil de Bolivia y límites de consulta. Separar fecha de sanción de instante de registro, resolución o notificación. Corregir valores predeterminados del formulario y “Este mes”; no modificar los 365 días del motor ni reiniciar cadenas por un cambio de formato.

**Aceptación:** mismos resultados con servidor UTC y navegador Bolivia; casos de 19:59/20:00, medianoche, fin de mes, año nuevo y bisiesto. Una fecha ingresada debe conservar el mismo día al guardar, consultar y exportar.

### E4.3. CSV seguro — F07

Reutilizar una función de serialización segura para exportaciones, incluyendo el CSV de filas rechazadas. Neutralizar prefijos interpretables como fórmulas y sus variantes con espacios/control; mantener los valores originales en la base. Conservar escape correcto de comillas, saltos de línea, delimitador y caracteres españoles.

**Aceptación:** `=1+1`, variantes `+`, `-`, `@` y prefijos de control se muestran como texto en el archivo de prueba. Validar la estructura y, cuando esté disponible, abrir un archivo ficticio en la hoja de cálculo destino. No presentar inspección estática como ejecución real en Excel.

**Archivos principales:** `src/app/api/reportes/route.ts`, `src/app/api/dashboard/route.ts`, `src/components/reportes/reportes-page.tsx`, `src/lib/domain/audit-report.ts` y exportador histórico.

## 9. E5 — Defensa web, dependencias y capacidad

### E5.1. Cabeceras — F13

1. Añadir protección contra incrustación externa mediante `frame-ancestors` y cabecera compatible de respaldo; incorporar `nosniff` y una política de referente apropiada.
2. Revisar la guía de la versión instalada de Next y los recursos realmente cargados antes de definir CSP completa. No incluir comodines o excepciones amplias por conveniencia.
3. Comprobar acceso Firebase, hidratación, estilos, importación y descargas en build de producción. Probar iframe externo anónimo y con sesión ficticia en entorno aislado.
4. Verificar cabeceras del dominio publicado después del despliegue.

### E5.2. Dependencias — F15

1. Actualizar el diagnóstico al comenzar la implementación: el reporte actual es una instantánea, no una lista perpetua de vulnerabilidades.
2. Identificar rutas de dependencia y exposición efectiva; preferir versiones compatibles corregidas. No ejecutar `npm audit fix --force` ni degradar Firebase para obtener un informe vacío.
3. Actualizar en bloques pequeños y conservar lockfile reproducible. Si un cambio mayor es indispensable, probarlo antes de integrarlo al resto.
4. Documentar cualquier aviso residual con fundamento y alcance. No cerrar un aviso solo porque el build pase.

### E5.3. Consultas y crecimiento — F14

1. Medir lecturas y latencia en fixtures del tamaño observado (aproximadamente 1.500 personas) y un volumen superior sintético; no hacer carga contra producción.
2. Para CI exacto, usar `ci_registry` y acceso directo al documento. Para listado general, implementar paginación real por cursor.
3. Para nombres/fragmentos, agregar campos normalizados y una selección indexada de candidatos que preserve tildes, orden indistinto y coincidencias actuales. Mantener `matchesPersonalSearch` como comprobación de paridad. No cambiar silenciosamente una búsqueda por fragmentos por una búsqueda solo de prefijos.
4. Resolver términos demasiado cortos mediante recorrido paginado y acotado con continuidad explícita, o una estrategia indexada que supere las pruebas de paridad. Nunca devolver “sin resultados” si solo se revisó una fracción del padrón; no inventar un total exacto antes de conocerlo.
5. En historial, paginar la consulta visible y cargar una sola vez las cadenas completas de las personas necesarias por petición, limitando concurrencia. La evaluación de una sanción no puede basarse en una página incompleta de antecedentes.
6. Para estadísticas, reducir consultas repetidas: clasificación efectiva persistida/normalizada y agregados consistentes si las mediciones justifican su uso. Cualquier agregado debe actualizarse en alta, cancelación, rebaja e importación, y ser reconciliable con los registros fuente.
7. Paginar notificaciones e informes extensos; evitar reenviar/leer todo el historial cada minuto. Conservar contador y ámbito de destinatarios.
8. Crear solo índices utilizados por las consultas nuevas; documentar su publicación y esperar disponibilidad antes de activar el código que los exige.

**Aceptación:** CI exacto sin lectura de todo el padrón; navegación entre páginas sin repetir un escaneo completo; mismos resultados de búsqueda y estadísticas; menos lecturas medibles y ausencia de timeout en la carga sintética acordada. No introducir un servicio externo de búsqueda o caché como requisito sin demostrar su necesidad.

## 10. E6 — Preparar una depuración completa y acotada

### Alcance recomendado: reinicio de datos operativos de prueba

Esta opción evita invertir trabajo en reparar cadenas antiguas que no se van a conservar. Mantiene la estructura útil para iniciar el uso definitivo.

| Recurso | Tratamiento propuesto |
| --- | --- |
| `personal`, `ci_registry` | Eliminar conjuntamente el padrón de prueba y su registro de identidad |
| `faltas` | Eliminar las sanciones de prueba completas; no dejar descendientes u orígenes aislados |
| `solicitudes_eliminacion_falta` | Eliminar las solicitudes asociadas a esas pruebas, de todos los estados |
| `imports_personal` | Eliminar lotes y resultados/filas de prueba, incluidas subcolecciones nuevas de E2 |
| `imports_sanciones` y `rows` | Eliminar previsualizaciones, lotes, errores y filas históricas de prueba |
| `notificaciones`, `confirmaciones` | Eliminar las vinculadas a las operaciones de prueba; invalidar confirmaciones anteriores al reinicio |
| `reincidencias_bloqueadas` | Eliminar intentos de prueba del modelo anterior |
| `transferencias_solicitudes`, `transferencias_logs` | Eliminar residuos de la asignación de efectivos retirada |
| `integraciones_sanciones` | Eliminar registros de integración de prueba dentro del mismo proyecto; no actuar sobre BSFP u otra app |
| `audit_logs` | Retirar eventos disciplinarios/importaciones/transferencias de prueba y sus snapshots; conservar eventos técnicos de acceso/configuración útiles y el nuevo evento de depuración |
| `users` y Firebase Authentication | Conservar accesos operativos y al menos un superadministrador funcional; no borrar cuentas por equipararlas al padrón |
| `unidades` | Conservar catálogo e IDs útiles, revisando coherencia con usuarios. No hace falta reconstruir unidades para limpiar sanciones |
| `access_control` y futuros contadores/configuración | Conservar coordinación de usuarios, secuencia de unidades, estado del reinicio y controles técnicos; reconstruir solo derivados expresamente identificados |
| Índices, reglas, proyecto Firebase, Vercel y secretos | Conservar infraestructura; aplicar solamente las correcciones de configuración previstas |

La clasificación de auditoría debe hacerse por acción/recurso y relación con el conjunto eliminado, no por buscar palabras en un motivo. Si una categoría no se puede clasificar con certeza, debe figurar en el resultado previo; no se borra a ciegas ni se declara vacía la auditoría. Los eventos técnicos conservados no deben producir falsos registros de sanciones/cancelaciones en los informes.

No hay que borrar todas las colecciones para obtener una base operativa limpia. La autorización del usuario permite retirar las pruebas; la propuesta conserva por defecto las cuentas y las unidades que evitan perder acceso o repetir configuración innecesariamente.

### Procedimiento a implementar

1. **Modo de evaluación sin borrar:** comprobar proyecto y entorno exactos; inventariar colecciones, subcolecciones y conteos; generar manifiesto con recursos incluidos/excluidos, huella y política de conservación. No volcar documentos ni CI en el reporte.
2. **Lista cerrada:** rechazar rutas/colecciones fuera del manifiesto. Detectar colecciones desconocidas y presentarlas como pendientes, sin incluirlas automáticamente.
3. **Mantenimiento efectivo:** bloquear nuevas mutaciones en API, importaciones, cron y entradas de integración. Conservar autenticación y consulta del estado para el responsable. La guarda debe cubrir también rutas GET con efectos de escritura existentes.
4. **Operaciones en curso:** esperar finalización o invalidar de forma segura leases/lotes activos. Los flujos transaccionales deben leer la versión de mantenimiento/datos para que una petición iniciada antes del reinicio no vuelva a crear documentos después de limpiarlos. Coordinar otros procesos con Admin SDK que no obedecen reglas de cliente.
5. **Ejecución identificada:** registrar operador, motivo, hora, proyecto, manifiesto, versión de código y estado del trabajo. La herramienta acepta el manifiesto exacto revisado; no expande el alcance al ejecutar.
6. **Borrado reanudable:** eliminar por bloques, con progreso y reintentos idempotentes; tratar subcolecciones explícitamente y comprobar también descendientes de documentos padre ausentes. Firestore no elimina automáticamente las subcolecciones al borrar un documento mediante SDK. [Documentación oficial de borrado](https://firebase.google.com/docs/firestore/manage-data/delete-data).
7. **Orden:** invalidar confirmaciones y detener trabajos; retirar dependencias operativas y subcolecciones de importación; retirar sanciones, registro de CI y padrón; depurar eventos de prueba de auditoría conforme al manifiesto. El modo mantenimiento impide que el orden intermedio se vea como una base normal en uso.
8. **Invalidación de vistas:** incrementar una versión de datos o mecanismo equivalente para invalidar cachés y formularios antiguos, sin eliminar innecesariamente las cuentas de acceso.
9. **Verificación:** conteos esperados, cero dependencias huérfanas, cero cadenas de prueba, cero solicitudes/notificaciones asociadas, cero filas huérfanas de importación. Comprobar integridad de cuentas/unidades preservadas y acceso del superadministrador.
10. **Cierre:** guardar resumen técnico sin snapshots personales; retirar el modo mantenimiento solo después de verificar. Si hay fallo, conservar estado y reanudar; no anunciar éxito parcial ni reabrir escrituras automáticamente.

### Sin exportación automática

El script actual `scripts/cleanup-production-data.mjs` debe modificarse o sustituirse antes de usarlo. Se retirará su exportación implícita. La recuperación ensayada será de interrupciones del proceso y continuidad del servicio; no se prometerá recuperar datos de prueba eliminados sin copia.

### Alternativa parcial, solo si resulta útil

Puede conservarse un padrón válido y eliminar únicamente cadenas/operaciones de prueba. En ese caso el conjunto se amplía a sus dependencias: descendientes, solicitudes, confirmaciones, notificaciones, lotes y eventos relacionados. No borrar una sanción intermedia dejando el resto de la cadena. Si se conserva una persona, preservar su `personalId` y correspondencia con CI, y retirar únicamente campos de asignación obsoletos que el modelo ya no usa.

No es necesario combinar ambas opciones. La recomendación para empezar con información definitiva es el reinicio operativo completo descrito en la tabla, con cuentas y unidades conservadas.

### Prueba de depuración

Ensayar en emulador con datos antiguos y actuales mezclados, subcolecciones huérfanas, fallo después de varios bloques, reanudación, intento de escritura concurrente y cambio de manifiesto. El ensayo debe demostrar que no se borra un usuario/unidad excluido y que ninguna operación reintroduce datos eliminados.

**Cierre F05:** los datos inconsistentes autorizados se retiraron y la regresión del modelo actual crea cadenas válidas. No se declara “corregida la lógica” solo porque la base quedó vacía.

**Cierre F06:** herramienta segura ensayada, ejecución trazable, dependencias completas y conservación verificada. La limpieza no se ejecuta desde un botón ordinario del usuario ni se convierte en facultad permanente de los registradores.

## 11. E7 — Verificación integral y documentación

### Pruebas mínimas antes de publicar

| Grupo | Escenarios que deben pasar |
| --- | --- |
| Permisos | Cinco roles, anónimo, token inválido/revocado, perfil bloqueado, unidad propia/ajena, acceso directo Firestore, cambios de rol/relevo |
| Unidades | Alta concurrente, reintento, auditoría atómica, cambio de nombre, desactivación sin antigua asignación de efectivos |
| Padrón/importación | CI único, nulos, límites, duplicados, corte de lote, reanudación y recuperación desde UI |
| Cadenas | 9/1 y 9/2 independientes, base 10/X, vencimiento fijo, nuevo episodio, fechas límite y operaciones concurrentes |
| Cancelaciones | Solo autor, siete días, solicitud pendiente, cinco días, rechazo expreso/automático, cierre extraordinario y rebaja |
| Informes | Unidad por ID, cero/vacío, sin efecto, totales acumulados, zona Bolivia, CSV seguro y estados coherentes |
| Navegador | Login, primer cambio, padrón, registro/confirmación, solicitudes, resolución, notificación y auditoría |
| Móvil | Menú, selección y cierre, tablas desplazables, formularios y acciones visibles; teléfono físico antes de darlo por verificado en dispositivo |
| Operación | Cron idempotente, cabeceras, interrupción/reanudación de depuración y versión exacta del despliegue |

Ejecutar lint, tipos/build, dominio, importación, suites de servidor y E2E oficiales. Corregir selectores del E2E del proyecto para que no dependa de la copia de auditoría. Mantener las pruebas de regresión existentes: el mínimo de 97 verificadas es la referencia, no una cifra que se deba alcanzar borrando casos.

Añadir CI versionada con emuladores ficticios y sin credenciales de producción. Actualizar `docs/BASE_CONOCIMIENTO_APP.md`, README, guía de pruebas y `.ai` para que indiquen versión publicada, nueva política de datos de prueba, comandos correctos y pendientes reales. F16 se cierra con documentación y comando oficial funcionales, no solo con un documento nuevo.

Cada hallazgo debe terminar con: archivos cambiados, prueba que demuestra la corrección, resultado local y comprobación publicada cuando corresponda. Una prueba que aún espera el fallo no cuenta como cierre.

## 12. E8 — Publicación controlada

1. Publicar únicamente después de la revisión local del conjunto y dentro de la autorización de ejecución/publicación correspondiente.
2. Crear los índices necesarios y esperar su disponibilidad antes de activar consultas dependientes.
3. Publicar una versión compatible con la política de acceso y comprobar el uso exclusivo de API. Aplicar las reglas endurecidas en el orden que permita conservar acceso legítimo sin dejar permisos innecesarios abiertos.
4. Comprobar revisión exacta en health, reglas remotas, índices, cabeceras, login y operaciones permitidas/denegadas. Validar al menos un recorrido por rol con datos de prueba identificables antes de limpiar.
5. Configurar y comprobar el programador y su secreto por la vía autorizada disponible; no reintentar accesos OAuth previamente rechazados ni extraer credenciales de otro contexto.
6. Mantener un punto de reversión de código/configuración. Si se revierte una parte, no reabrir deliberadamente reglas vulnerables para ocultar una incompatibilidad: resolver compatibilidad o mantener mantenimiento.

**Salida:** versión corregida servida por el dominio y comprobaciones publicadas registradas. “Build correcto” o “push correcto” no sustituye esta comprobación.

## 13. E9 — Depurar y preparar la carga definitiva

1. Ejecutar primero la evaluación del manifiesto sobre el estado existente al llegar a esta etapa. Las cantidades de la auditoría son una referencia; no se presume que sigan idénticas.
2. Aplicar el reinicio de datos de prueba autorizado mediante la herramienta ya ensayada, con mantenimiento y sin exportación automática.
3. Verificar todas las condiciones de E6, incluyendo acceso de superadministrador y ámbitos de usuarios conservados.
4. Cambiar la instalación a etapa de datos definitivos: impedir que los comandos de reinicio de prueba puedan volver a ejecutarse inadvertidamente una vez iniciada la carga real.
5. Validar la fuente definitiva cuando el usuario la proporcione: columnas, CI, duplicados, cantidad y errores. No inventar nombres ni completar información faltante como si fuera real.
6. Cargar por lotes reanudables con resumen acumulado; cotejar cantidad de personas y CI, muestras de búsqueda e historial vacío cuando corresponda. No generar sanciones reales de ejemplo.
7. Dejar una comprobación final de que no reaparecen asignaciones de efectivos, transferencias ni sanciones de prueba. A partir de esta etapa, la autorización sobre datos de prueba no se extiende automáticamente a borrar información real nueva.

## 14. Criterio de finalización

El trabajo estará completo cuando:

- F01–F16 tengan evidencia de cierre o un pendiente residual explícito y aceptado; no se declare completa la entrega del cron si solo se comprobó localmente.
- Los permisos efectivos correspondan a los roles aprobados y no exista una vía directa menos restrictiva.
- Altas, importaciones, cancelaciones y estadísticas pasen las pruebas de concurrencia, recuperación y fechas.
- La versión publicada y sus reglas/índices sean los verificados.
- Los datos de prueba elegidos hayan sido retirados con sus dependencias, conservando accesos y configuración.
- La nueva carga se base en la fuente real entregada, sin registros inventados, residuos de prueba ni asignaciones antiguas reintroducidas.
- La documentación permita continuar sin repetir la auditoría ni reconstruir decisiones anteriores.

No se fija una duración en horas sin ejecutar las correcciones y medir los cambios de dependencias/consultas. La secuencia y los criterios anteriores permiten avanzar por bloques verificables sin pedir aprobación para cada ajuste rutinario ya incluido en el alcance.
