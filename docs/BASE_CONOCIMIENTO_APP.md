# Base funcional vigente de App Faltas

Actualizada el 28/10/2026. Aplicación institucional de registro y control disciplinario del Comando Departamental de Policía de Chuquisaca. Proyecto separado de BSFP y otras aplicaciones.

## Estado de esta revisión

El usuario autorizó ejecutar el [plan de correcciones de la auditoría](PLAN_CORRECCIONES_AUDITORIA_2026-10-28.md). El estado verificable de cada etapa y de la publicación está en [EJECUCION_CORRECCIONES_2026-10-28.md](EJECUCION_CORRECCIONES_2026-10-28.md).

La referencia publicada antes de estas correcciones fue 2c55379adf28145a1c7c72837cb534911a86a707. La auditoría del 28/10 detectó16 hallazgos; no deben marcarse cerrados por conservar un informe antiguo o pasar un build. Los informes del26/10 y28/10 son evidencia histórica. El documento de ejecución distingue implementación local, verificación publicada y pendientes externos.

## Objetivo y modelo de datos

- Un padrón departamental en personal, con identidad estable personalId y registro único de CI en ci_registry.
- Las personas del padrón no se asignan a unidades. La unidad del registrador está en users.unidadId y sigue siendo obligatoria para perfiles de unidad.
- La sanción conserva unidad sancionadora, autor, fecha, motivo, documento, evidencia de confirmación y antecedentes. El historial de una unidad se obtiene de sanciones registradas allí, incluidas las que quedaron sin efecto.
- Cambiar al registrador no traslada ni elimina la información de la unidad.
- El estado técnico de una sanción dejada sin efecto sigue siendo anulada. La interfaz usa «Dejar sin efecto» y «Sin efecto».
- Unidades mantienen IDs estables, secuencia transaccional y auditoría; su nombre histórico no define la identidad estadística.

## Roles efectivos

| Rol | Registro | Consulta | Cancelación / administración |
| --- | --- | --- | --- |
| admin_unidad | Su unidad automática | Sancionados e historial de su unidad; búsqueda general limitada al registro | Solo solicita sobre sus registros dentro de7 días |
| operador_unidad | No | Su unidad | Seguimiento de solicitudes de su unidad; no resuelve |
| visor_dpto | No | Consulta departamental y estadísticas | No resuelve ni genera auditoría |
| admin_dpto | Unidad elegida | Global o por unidad | Resuelve solicitudes; cancela directamente sus registros dentro de7 días; gestión limitada/relevo de usuarios |
| super_admin | Unidad elegida | Todas las funciones autorizadas | Gestión completa, auditoría y cancelación extraordinaria sin límite de fecha con motivo/confirmación |

Solo puede existir un admin_unidad activo por unidad. El relevo bloquea al saliente antes de habilitar al sustituto y conserva historial. Debe permanecer al menos un superadministrador activo.

## Reincidencia y plazos aprobados

Cada cadena se identifica por persona y conducta original (artículo/inciso). Repetir9/1 puede aplicar10/1 y después11/1, manteniendo9/1 como conducta original.9/2 y otras conductas del mismo policía son independientes. Las cadenas también pueden comenzar en una falta sustantiva del artículo10.

El período es365 días desde la sanción base vigente; las reincidencias no renuevan ese plazo. Al vencer se permite otro episodio desde la conducta base. El vencimiento no elimina sanciones históricas. El artículo12 se trata como remisión conforme al motor existente, sin registrar una sanción ordinaria inventada.

Cada antecedente debe superar la espera ordinaria de7 días y no tener solicitud pendiente. Un rechazo humano oportuno, atribuible y con confirmación dispensa la espera restante; un rechazo automático por vencimiento no concede esa dispensa.

La solicitud ordinaria solo la presenta el autor dentro de7 días desde el registro. Tiene5 días para resolverse; luego se considera rechazada. El estado efectivo se calcula aunque el procesador esté retrasado y la tarea programada persiste/notifica el cierre de forma idempotente. El programador elegido es GitHub Actions en el repositorio público, con OIDC ligado a IDs de repositorio/propietario, workflow y main; el secreto CRON_SECRET permanece como alternativa. No afirmar que existe una ejecución remota exitosa hasta comprobarla.

La cancelación extraordinaria deja sin efecto solo la sanción elegida y baja un escalón a sus dependientes. Si otra pasa a base, su nuevo año se cuenta desde su propia fecha de sanción. Se guardan clasificación original/actual y rastro de los ajustes. Los cierres de solicitudes por esta vía se consultan como «Extraordinarias».

La confirmación es interna y auditable, vinculada a acción, contenido, autor y unidad. No equivale a una firma mediante certificado. Estas reglas son decisiones funcionales del usuario, no certificación jurídica de normativa.

## Arquitectura y controles

Interfaz React/Next → Firebase Auth → token → API → perfil/rol/unidad → reglas de dominio → Firestore Admin SDK. Las reglas de Firestore deniegan acceso directo de clientes; el servidor debe validar permisos en cada endpoint y revalidar actor en la transacción.

Confirmaciones tienen vencimiento y consumo idempotente. Las transacciones se coordinan con access_control/maintenance y una generación de datos para bloquear mantenimiento y peticiones anteriores a un reinicio. La sesión/caché cambia al actualizar esa generación.

Las búsquedas nuevas usan índices de fragmentos normalizados y cursores, con comprobación final de términos. No se convierten fragmentos en búsquedas solo de prefijo ni se declara una lista completa si quedan candidatos por revisar. Existe lectura compatible anterior hasta activar search_index.version1; el reinicio de pruebas deja ese índice listo para la nueva carga.

Panel/reportes utilizan stats_cache por ámbito, rol y fecha institucional, invalidada mediante revisión transaccional. La caché se elimina junto con las pruebas. Los antecedentes usados para registrar siempre se evalúan completos y en vivo; no dependen de una caché estadística.

## Importación y consultas

La importación de personal conserva identidad por CI y la actualización por CI existente. Crea lote persistente, resultados por fila, procesamiento por bloques y recuperación. Un identificador de operación evita duplicar intentos; seleccionar otro archivo/operación permite una carga nueva.

La importación histórica tiene previsualización, validación de cadenas, resultados acumulados por fila, bloqueo de procesador y apertura/continuación del lote desde la lista paginada. No resucita sanciones sin efecto. Las filas omitidas se distinguen de las ya aplicadas.

Personal permite localizar una persona y consultar su ficha. Sanciones registradas consulta el historial de la unidad con paginación. Solicitudes es la bandeja única de seguimiento/resolución. Auditoría del superadministrador separa informes de sanciones y de cancelaciones por mes/unidad. Las notificaciones permanecen dentro de la app.

Los reportes agrupan unidades por ID, usan fechas civiles de Bolivia y excluyen sin efecto de totales vigentes. Los exportadores CSV neutralizan fórmulas sin alterar los valores almacenados.

## Datos de prueba y depuración

El usuario confirmó expresamente que los registros actuales son de prueba y permite retirarlos parcial o totalmente. No hace falta reconstruir documentalmente cadenas que serán eliminadas. Esto no atribuye los fallos del código a datos antiguos.

El procedimiento controlado conserva cuentas/accesos, unidades útiles y configuración; retira padrón, sanciones, dependencias, importaciones/subcolecciones, notificaciones, confirmaciones, caché y residuos de transferencias. Clasifica auditoría, conserva eventos técnicos y registra el reinicio. No exporta documentos automáticamente.

Requiere manifiesto exacto, mantenimiento, progreso reanudable, comprobación de huérfanos y verificación de recursos conservados. No usar instrucciones antiguas de limpieza ni seeds de producción. Una vez cerrado el reinicio, no puede reutilizarse inadvertidamente sobre la futura carga real.

La fuente definitiva todavía debe proporcionarla el usuario. No inventar datos ni extender la autorización de borrado de pruebas a futuras altas reales.

## Continuidad y verificación

Consultar primero esta base, el documento de ejecución y las notas superiores de .ai/session.md y .ai/decisions.md en el workspace padre. Las notas inferiores describen otras etapas.

Los comandos oficiales están en README y la guía de pruebas. Las reproducciones de auditoría que esperan un fallo son evidencia histórica; no constituyen pruebas seguras aprobadas. La aceptación corregida se ejecuta con test:corrections y emuladores demo.

Distinguir siempre código inspeccionado, pruebas locales, navegador emulado, dispositivo físico y servicio real. La configuración existente de Firebase/Vercel es funcional y está desplegada; una indisponibilidad por cuota o una comprobación pendiente no significa que nunca se haya conectado o publicado.
