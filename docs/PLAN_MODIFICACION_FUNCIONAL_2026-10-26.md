# Plan de modificación funcional de App Faltas

**Aplicación del plan de reincidencia, 27/10/2026:** leer [resultado local, pruebas y pendientes operativos](IMPLEMENTACION_REINCIDENCIA_2026-10-27.md). El usuario autorizó implementar y resolvió que cancelar la base reinicia el año desde la sanción promovida. La publicación y migración de datos reales no se ejecutaron.

**Actualización 27/10/2026:** el usuario resolvió P01: cancelar solo la sanción seleccionada y rebajar un escalón cada registro posterior de esa cadena, conservando originales y auditoría. Esta instrucción sustituye las alternativas pendientes de cancelación conjunta/revisión mencionadas en el plan original. Ver [implementación y límites actuales](IMPLEMENTACION_FUNCIONAL_2026-10-27.md); todavía no se publicó.

**Precisión posterior del plazo, 27/10/2026:** prevalece el [plan detallado de reincidencia actualizado](reincidencia-2026-10-27/DIAGNOSTICO_Y_PLAN.md). Toda cadena nacida en el artículo 9 o en una conducta sustantiva del artículo 10 vence al cumplirse un año desde su sanción original; las reincidencias no prolongan ese plazo. Después se permite una nueva sanción base del artículo/inciso original con nueva cadena, conservando el historial anterior. No se trata de una anulación por vencimiento. El plan actualizado contiene 54 casos de aceptación y distingue las excepciones todavía pendientes. Esta actualización documental no modifica la app.

Fecha: 26/10/2026. Estado: plan para revisión; no constituye implementación ni autorización de despliegue. Referencia de código local: `b141f5b7321e3f19bf4643595b5deeced511466e`.

## 1. Objetivo y alcance

Evolucionar la aplicación operativa para mantener un padrón departamental único, registrar sanciones por la unidad del registrador, preservar autoría e historial, confirmar explícitamente las acciones, controlar la reincidencia y regular solicitudes y cancelaciones. Incorporar notificaciones internas y dos informes de auditoría separados.

La aplicación ya está desplegada, conectada a Firebase y en uso, según lo informado por el usuario. Se conserva Next.js/React/TypeScript, Firebase Auth y Firestore. No se propone crear bases independientes por unidad ni migrar a otro proveedor. «Historial de la unidad» significa consultar sanciones asociadas a esa unidad en la base compartida.

Este documento distingue: **acordado** (instrucción del usuario), **propuesta técnica** (forma de implementarla) y **pendiente** (decisión funcional aún no aprobada). Las instrucciones de esta conversación prevalecen sobre decisiones históricas incompatibles. Las reglas programadas no se presentan como validación jurídica.

Entregables previstos: matriz de permisos aplicada, cambios coordinados de servidor e interfaz, migración compatible y verificable, pruebas de aceptación, manual breve, informe de correcciones de auditoría y paquete de publicación/recuperación. En esta tarea solo se prepara el plan.

## 2. Decisiones acordadas

| ID | Decisión |
|---|---|
| R01 | Un solo padrón de policías del Comando Departamental, sin asignación operativa a unidades. |
| R02 | Retirar asignación y traspaso de policías entre unidades y los conteos de personal destinado por unidad. Conservar la asignación de los usuarios de acceso a sus unidades. |
| R03 | El `admin_unidad` registra sanciones a cualquier policía del padrón. La unidad se obtiene de su asignación vigente en el servidor. `operador_unidad` no registra. |
| R04 | `admin_dpto` puede registrar para distintas unidades; `super_admin` conserva las funcionalidades, con facultad extraordinaria de cancelación. `visor_dpto` solo consulta. |
| R05 | Historial y listado de sancionados pertenecen a la unidad sancionadora y permanecen al relevar al registrador. |
| R06 | Confirmación sencilla y auditable de intención, sin exigir certificado de firma digital. |
| R07 | Mantener reglas actuales de artículos/incisos, ventana y escalamiento; excluir sanciones sin efecto. Añadir espera de siete días y bloqueo por solicitud pendiente para utilizar un antecedente. |
| R08 | Conservar vínculo e información del antecedente que fundamenta una reincidencia, incluyendo la cadena precedente cuando corresponda. |
| R09 | Solo el autor solicita dejar sin efecto su sanción, dentro de siete días desde su registro. |
| R10 | Administrador departamental resuelve; superadministrador conserva esta facultad. Aprobación y rechazo requieren motivo. |
| R11 | La solicitud permanece pendiente como máximo cinco días desde su presentación; después queda rechazada automáticamente y se notifica. |
| R12 | El administrador departamental cancela sus propios registros directamente, dentro de siete días, con motivo y confirmación. |
| R13 | El superadministrador puede cancelar sin solicitud y sin límite temporal, con motivo, confirmación y auditoría. |
| R14 | Notificaciones únicamente dentro de la app al solicitante y al responsable actual de la unidad, preservando continuidad del relevo. |
| R15 | Sanciones sin efecto separadas y excluidas de totales vigentes; conservación de identidad, autoría y unidad histórica. |
| R16 | Un único `admin_unidad` activo por unidad. Antes de habilitar al reemplazo se revoca el acceso del anterior. |
| R17 | Superadministrador puede consultar y generar dos informes separados: registro de sanciones por meses/unidades; cancelaciones y sanciones sin efecto. |

## 3. Puntos pendientes y criterios propuestos

No repetir preguntas ya resueltas. Los puntos siguientes se pueden cerrar al revisar el plan y no impiden desarrollar componentes independientes.

| Punto | Propuesta y consecuencia |
|---|---|
| P01: cancelación extraordinaria de un antecedente con descendientes | Mostrar cadena e impacto. La propuesta anterior de dejar sin efecto toda la cadena **no fue aprobada**. No ejecutarla automáticamente. Antes de habilitar este caso, aprobar una resolución conjunta o un procedimiento explícito de revisión de descendientes. Mientras no se decida, preparar detección y vista de impacto; no publicar una operación que deje una cadena incoherente. |
| P02: límite exacto del plazo | Usar períodos corridos: siete días = 168 horas; cinco días = 120 horas. Hora del servidor. Solicitud/cancelación ordinaria si `ahora < vence`; a partir de `vence` el plazo está agotado. Presentar fecha y hora límite en America/La_Paz. Es una precisión técnica propuesta, no una regla normativa verificada. |
| P03: registros históricos e importación | Mantener capacidades actuales de alta histórica/importación de administradores autorizados; no habilitar una excepción silenciosa a los siete días. Proponer modo documental de importación histórica que conserve relaciones ya existentes, con validación y confirmación por lote, separado del registro operativo. Acordar su tratamiento temporal antes de habilitar cargas de nuevas cadenas históricas. |
| P04: registros antiguos sin fecha/autor fiables o solicitudes antiguas pendientes | No inventar fechas, autoría ni intención. Detectar y listar casos; aprobar su tratamiento de transición. Propuesta: no abrir cancelación ordinaria si no se puede probar plazo y autoría; usar facultad extraordinaria. No rechazar masivamente solicitudes antiguas sin un corte de transición acordado. |

Decisiones técnicas de este plan que no crean permisos nuevos: conservar permisos administrativos no afectados, mantener los lectores departamentales actuales, restringir nuevos informes de auditoría al `super_admin`, y no ampliar el acceso libre de una unidad a expedientes ajenos. Una cuenta desactivada no recibe acceso para leer una notificación: la unidad mantiene su copia.

## 4. Matriz funcional objetivo

En todas las operaciones: cuenta activa, sesión válida, recurso autorizado y validación en servidor. El alcance nunca se obtiene únicamente de campos enviados por el navegador.

| Acción | operador_unidad | admin_unidad | visor_dpto | admin_dpto | super_admin |
|---|---|---|---|---|---|
| Listado operativo de sancionados e historial | Propia unidad | Propia unidad | Todas, consulta | Todas, según vistas actuales | Todas |
| Buscar padrón para registrar | No | Global, datos mínimos | No registra | Global | Global |
| Consulta departamental de padrón/estadísticas | No | No | Sí | Sí | Sí |
| Registrar sanción | No | Unidad asignada | No | Unidad elegida | Unidad elegida |
| Antecedentes de otra unidad durante registro | No | Solo fundamento necesario | Consulta global actual | Solo fundamento necesario y vistas actuales | Global |
| Solicitar dejar sin efecto | No | Solo propia autoría, misma unidad, dentro de siete días | No | Para propias usa vía directa | Vía extraordinaria disponible |
| Resolver solicitud | No | No | No | Sí, antes del vencimiento | Sí, antes del vencimiento |
| Cancelación directa ordinaria | No | No | No | Solo registros propios, siete días | Puede actuar por vía extraordinaria |
| Cancelación extraordinaria | No | No | No | No | Sí, motivo e impacto |
| Ver decisiones/notificaciones de la unidad | Sí, alcance de consulta | Sí | No ampliar por este cambio | Bandeja de revisión | Bandeja global |
| Crear personal individual | No | No | No | Sí, como actualmente | Sí |
| Importar padrón e histórico masivamente | No | No | No | No | Sí, con validaciones |
| Administrar usuarios/relevos | No | No | No | Facultades actuales restringidas | Facultades actuales |
| Nuevos informes de auditoría | No | No | No | No se añade permiso | Sí |

El padrón global para selección no es un expediente global de sanciones. Separar la búsqueda identificativa de la consulta de antecedentes. Mantener el modo explícito de historial global por persona de `visor_dpto`/`super_admin` como existe hoy; no ampliar implícitamente esa vista a `admin_dpto`.

La exclusividad del autor reduce un permiso actual: `operador_unidad` ya no podrá crear solicitudes, aunque hoy la API lo admite. Un reemplazante tampoco podrá solicitar sobre registros del anterior. Si el autor fue relevado o perdió la unidad, la excepción corresponde al superadministrador; no se reactiva el acceso anterior para tramitarla.

## 5. Diseño de datos y conservación

### 5.1 Colecciones existentes

- `personal` y `ci_registry`: mantener IDs y unicidad por CI. Dejar de exigir o utilizar unidad actual para altas, consultas o registro. Los campos antiguos pueden permanecer como legado durante la transición; no representan una asignación vigente. No reconstruir el padrón ni regenerar `personalId`.
- `users`: conservar unidad/rol del usuario, estado y UID. Agregar o reutilizar versión de asignación/acceso para controlar relevos y rechazar formularios abiertos antes de un cambio.
- `unidades`: conservar IDs y nombres históricos. Una unidad con historial no se borra para crear otra con el mismo nombre.
- `faltas`: preservar `unidadId`, identidad del policía, documento, fecha disciplinaria, autor y relaciones. No recalcular unidad desde el perfil actual del autor. Mantener estado técnico `anulada` y presentación «sin efecto».
- `solicitudes_eliminacion_falta`: conservar colección e historial. Incorporar vencimiento, causa de cierre, actor humano o sistema y fechas efectivas.
- `audit_logs`: conservar y extender eventos; no reemplazar el historial por un único campo «última modificación».
- `transferencias_solicitudes` / `transferencias_logs`: retirar operaciones activas y mantener archivo de lectura administrativa. No borrar evidencia antigua. Solicitudes de transferencia pendientes requieren cierre de transición explícito, sin ejecutar el traslado.
- Importaciones: conservar lotes y trazabilidad, adaptar plantillas para que unidad del policía deje de ser obligatoria. La unidad sancionadora continúa siendo necesaria en cada sanción importada.

### 5.2 Campos y soportes propuestos

Los nombres siguientes son contratos de diseño; se mapearán a los campos existentes para evitar duplicación:

| Recurso | Datos necesarios |
|---|---|
| Sanción | `createdAt` fiable; actor UID/rol/unidad al registrar; versión de reglas; constancia de confirmación; origen manual/histórico/importación; referencia e instantánea del antecedente; estado y eventos de cancelación. |
| Antecedente | ID, policía, artículo/inciso, fecha, documento, unidad sancionadora y referencia al origen precedente. Instantánea de datos al registrar más estado actual consultable. |
| Solicitud | Sanción y unidad de origen, autor solicitante, motivo, `createdAt`, `expiresAt`, estado, motivo/actor de resolución, fecha efectiva y fecha de procesamiento. |
| Confirmación | Acción, UID autenticado, unidad, referencia de intención de un solo uso, resumen/carga confirmada, vencimiento, fecha del servidor y versión del texto aceptado. |
| Notificación | Evento único, referencia, destinatario personal o unidad, fecha, contenido mínimo y lecturas por usuario. |
| Relevo | Unidad, administrador saliente/entrante, actor autorizante, fechas, estado de revocación y evidencia del cambio. |

Proponer una reserva única del administrador activo por unidad, actualizada transaccionalmente, y un documento de coordinación por policía para serializar altas/solicitudes/cancelaciones que afectan reincidencia. Una consulta previa por sí sola no prueba exclusividad bajo concurrencia.

La lista de sancionados de una unidad se deriva de sus sanciones: un policía aparece una vez por unidad, aunque tenga varios registros. Si todas sus sanciones quedan sin efecto, permanece accesible en el histórico con ese estado; no aparece como sancionado vigente. Si el volumen exige una proyección por unidad/persona, será derivada, reconstruible y reconciliada; nunca un segundo padrón independiente.

## 6. Registro y confirmación de intención

1. Autenticar y cargar perfil vigente. Verificar rol, estado y reserva de administrador de unidad cuando corresponda.
2. Buscar por CI o nombres/apellidos en el padrón general, con paginación y normalización. Seleccionar por ID, no por coincidencia aproximada de nombre.
3. Mostrar identidad del policía. Para `admin_unidad`, unidad automática de solo lectura; para administradores globales, selector obligatorio de unidad sancionadora.
4. Ingresar artículo, inciso, fecha, documento y motivo con validación del catálogo real en servidor.
5. Evaluar reincidencia global y mostrar antecedentes mínimos, disponibilidad, impedimentos y fundamento seleccionado.
6. Presentar resumen final: policía, unidad, tipificación, documento, fecha, motivo y antecedente. Casilla explícita y botón «Confirmar y registrar sanción».
7. Propuesta técnica: el servidor crea una intención breve de un solo uso ligada al actor, asignación y contenido. Si cambian datos, unidad o antecedente, se exige confirmar otra vez. La caducidad de la intención será configurable; propuesta inicial: cinco minutos, distinta del plazo de solicitudes.
8. Al confirmar, revalidar todo en servidor dentro de la operación consistente: actor, asignación, fechas, catálogo, estado del antecedente y ausencia de solicitudes pendientes. Consumir intención y guardar sanción, evidencia y auditoría de forma atómica cuando corresponda.
9. Devolver identificador estable y actualizar vistas. Reintentos de red/doble clic con la misma intención no crean otra sanción.

Este mecanismo deja evidencia de una acción explícita realizada por una sesión autenticada. No prueba de manera absoluta quién estaba físicamente ante el equipo ni equivale a firma digital certificada. No guardar contraseñas ni tokens en auditoría. Mantener una interacción sencilla; proponer reautenticación adicional para cancelación extraordinaria/relevo o sesión que no reúna las condiciones de seguridad, sin exigirla rutinariamente en cada sanción ordinaria.

## 7. Reincidencia y reglas temporales

Conservar la ventana actual de 365 días basada en la fecha disciplinaria, artículos/incisos admitidos, escalamiento y tratamiento existente de Art. 12 inc. 1 como remisión. Añadir las condiciones operativas acordadas sin reescribir las reglas disciplinarias.

Definiciones propuestas:

```text
limiteCancelacion = fechaHoraRegistroServidor + 168 horas
limiteSolicitud = fechaHoraSolicitudServidor + 120 horas
puedeSolicitar = autor autenticado y autorizado
                y sancion vigente y ahora < limiteCancelacion
                y ausencia de solicitud pendiente
antecedenteHabilitado = cumple reglas disciplinarias actuales
                       y sancion vigente y ahora >= limiteCancelacion
                       y ausencia de solicitud pendiente efectiva
solicitudPendienteEfectiva = estado pendiente y ahora < limiteSolicitud
```

No confundir fecha de registro, fecha de sanción, fecha de solicitud y fecha de resolución. El reloj del navegador no define permisos. Si falta evidencia temporal antigua, no sustituirla silenciosamente por `fechaSancion`.

La espera no permite registrar de nuevo el mismo artículo/inciso base para evitar el escalamiento. Si el sistema identifica reincidencia pero el antecedente aún no es utilizable, bloquear la operación correspondiente y explicar la causa/fecha disponible. Tampoco convertirla automáticamente en una sanción menor. Esta espera puede impedir un registro inmediato; es una consecuencia operativa de la regla solicitada que debe quedar visible.

Guardar referencia e instantánea del antecedente realmente validado en servidor. No confiar en una instantánea suministrada por el navegador. Mantener origen y cadena transitiva, evitar ciclos, exigir misma persona y revisar elegibilidad al confirmar. Consultar antecedentes completos pertinentes, sin el límite silencioso actual de 100 resultados.

Ejemplo: sanción registrada el 1 de noviembre a las 10:00; el plazo ordinario termina el 8 a las 10:00. Solicitud presentada el 7 a las 09:00 vence el 12 a las 09:00. El antecedente queda bloqueado hasta la resolución o el vencimiento efectivo, aunque ya transcurrieron siete días. Si se aprueba, se excluye; si se rechaza antes del día 8, aún debe esperar al día 8.

## 8. Solicitudes y cancelaciones

### 8.1 Solicitud ordinaria

- Autoría por UID del registro, cuenta activa y alcance de unidad; nunca comparar solo nombres/correo. Motivo específico obligatorio, incluso si se conserva el tipo «representación».
- Transacción que valida plazo, estado y unicidad; guarda solicitud, vencimiento, señal de bloqueo del antecedente y auditoría. Avisar a la bandeja departamental.
- No reiniciar el plazo de siete días por edición, importación, reintento, relevo o resolución. Una solicitud nueva después de rechazo solo sería admisible dentro de la ventana original y conservando todos los intentos; no borrar la anterior ni extender la ventana.
- Resolutor: `admin_dpto` o `super_admin`. Ver resumen y fundamento, exigir motivo al aprobar/rechazar y confirmar la decisión.
- Aprobación: actualizar sanción a `anulada` con datos de resolución; conservar documento original. Rechazo: sanción sigue vigente y se libera bloqueo cuando proceda.
- Una solicitud presentada a tiempo puede aprobarse después del séptimo día si todavía está dentro de sus cinco días de resolución. Son dos plazos distintos.

### 8.2 Vencimiento automático

- Al alcanzar `expiresAt`, la solicitud se considera rechazada por vencimiento; ya no puede aprobarse por la vía ordinaria.
- Persistir resolución con actor «sistema», motivo, fecha efectiva de vencimiento y fecha real de procesamiento. Emitir una única notificación por evento.
- Programar un proceso periódico idempotente. Propuesta: cada cinco minutos, sujeto al servicio/plan verificado. No depender de que alguien abra una pantalla.
- Toda lectura/decisión/registro usa la fecha efectiva, aunque el proceso periódico se retrase. Materializar el vencimiento de manera consistente al actuar, con auditoría y notificaciones pendientes de entrega si hace falta. No escribir y luego lanzar un error que revierta la transición.
- Aprobación y vencimiento simultáneos deben competir sobre la misma solicitud/sanción: solo una resolución gana. Nunca aprobar vencida ni duplicar mensajes.
- No usar TTL para este cierre: la evidencia se conserva y la transición es de estado, no borrado.

### 8.3 Cancelación directa del administrador departamental

Solo sanciones cuya autoría le corresponde, dentro de siete días. Confirmación explícita y motivo. Para sanciones de otros registradores, resolver la solicitud; no mantener una ruta directa que eluda ese requisito. Conservar autor original y actor de cancelación por separado.

### 8.4 Cancelación extraordinaria del superadministrador

Sin solicitud ni plazo. Pantalla diferenciada, motivo específico, confirmación reforzada y vista de consecuencias. Registrar evento «cancelación extraordinaria», nunca hacerlo pasar por una aprobación ordinaria. Notificar unidades/registradores afectados con acceso vigente.

Sin descendientes: cancelación lógica auditable. Con descendientes: P01 requiere decisión. Implementar primero detección completa de dependencias, incluidos casos antiguos. La vista no debe declarar «sin dependientes» por consulta truncada o vínculo faltante: señalar incertidumbre y revisar.

Si se aprueba cancelación conjunta, diseñar operación recuperable y consistente para toda la cadena. Para cadenas que no quepan en una sola transacción: operación con identificador, bloqueo efectivo del conjunto, pasos idempotentes y conciliación; no mostrar una ejecución parcial como concluida. No cancelar sanciones independientes del mismo policía ni reemplazar automáticamente el fundamento por otro.

Las solicitudes pendientes sobre una sanción cancelada extraordinariamente se cierran con causa específica, sin presentarlas falsamente como rechazo de fondo o aprobación ordinaria. El informe distingue esta resolución excepcional.

## 9. Relevo y seguridad de acceso

1. Detectar administradores duplicados actuales en un informe; no escoger cuál desactivar por inferencia.
2. Mantener una reserva única por unidad. Validarla en creación, edición de roles/unidades, reactivación y relevo; no solo al crear usuarios.
3. Relevo explícito: desactivar al saliente en el control efectivo de acceso, invalidar su asignación, registrar evento y revocar sus sesiones. Habilitar al entrante únicamente después de que el acceso anterior haya quedado denegado.
4. Firebase Auth y Firestore no se tratan como una transacción única. Diseñar pasos recuperables: si falla revocación o activación, mantener bloqueo seguro y estado visible de relevo pendiente; reintentar sin dos administradores activos.
5. Revalidar perfil/reserva al confirmar una escritura. Una sesión o formulario abierto antes del relevo no puede seguir registrando.
6. Limpiar cachés y suscripciones al cambiar identidad, rol o unidad. Preservar historial, solicitudes y notificaciones de la unidad.
7. Mantener protecciones de cuentas superiores y último superadministrador en todas las rutas, incluidas PATCH y relevo.

La comprobación de cuenta activa debe aplicarse tanto en API como en las reglas Firestore que permitan lecturas directas. Resolver el cambio obligatorio de contraseña y revocación pendientes para que la constancia de intención no se apoye en un control de sesión incompleto.

## 10. Interfaz, notificaciones, estadísticas e informes

### Interfaz

- Personal de unidad pasa a «Personal sancionado» y deriva del historial de esa unidad. Búsqueda global independiente dentro del formulario de registro.
- Retirar selectores de asignación de policías, traspasos y métricas de dotación. Conservar gestión de unidades y asignación de usuarios.
- Historial: separar vigentes/sin efecto, mostrar origen de reincidencia, solicitudes y fechas límite. Una unidad ve la información mínima del antecedente ajeno necesaria para fundamentar su propio registro, no navegación libre al expediente de otra unidad.
- Pantallas de solicitudes y confirmación accesibles en escritorio y móvil, sin depender del color para estado; mensajes claros de plazo, autorización y concurrencia.
- No añadir emisión de memorándums ni firma documental como alcance implícito.

### Notificaciones internas

Evento durable asociado al solicitante y a la unidad; lectura por usuario. El responsable actual accede a las notificaciones de su unidad aunque el creador anterior haya sido relevado. No usar la notificación como puerta de acceso a información de otra unidad. Al abrir, revalidar permisos.

Eventos: nueva solicitud para revisión; aprobación; rechazo motivado; rechazo automático por vencimiento; cancelación directa/extraordinaria; consecuencias sobre cadenas si se aprueban. Sin correo, servicios de mensajería ni envío externo. Doble entrega por reintento no crea duplicados.

### Estadísticas

- Conservar atributos estadísticos existentes del personal y sus filtros pertinentes. Eliminar únicamente el concepto de dotación por unidad, ya incompatible con el nuevo padrón.
- Distinguir total del padrón departamental, policías únicos sancionados por unidad, sanciones vigentes, sin efecto y solicitudes. No mezclar personas con cantidad de sanciones o intentos bloqueados.
- Una persona sancionada en varias unidades puede contarse una vez en cada una; el total departamental de personas se deduplica por `personalId`, no sumando subtotales.
- Las pendientes siguen vigentes hasta aprobación, pero con marca de solicitud y exclusión temporal como antecedentes. El rechazo no crea una sanción nueva.
- Fijar y etiquetar la base de fecha de cada indicador; no cambiar silenciosamente entre registro y fecha de sanción. Pruebas de conciliación entre pantalla, filtros y exportación.

### Informe 1: auditoría de registros de sanciones

Para `super_admin`, filtros por año/mes y unidad sancionadora; fechas en Bolivia. Base predeterminada: fecha de registro, indicando también fecha disciplinaria. Detalle: ID, policía, artículo/inciso, documento, unidad, registrador, fecha/hora, origen, confirmación y vínculo de reincidencia. Incluye evidencia histórica de registros luego anulados, identificados por su estado; totales vigentes y sin efecto diferenciados. Agrupar por mes/unidad y paginar sin omisiones.

### Informe 2: cancelaciones y sanciones sin efecto

Separado del anterior. Filtros por mes de resolución, unidad, vía, estado y actor. Secciones diferenciadas para solicitudes pendientes/rechazadas/aprobadas y sanciones efectivamente sin efecto. Mostrar motivo de solicitud, decisión y motivo, autor/resolutor, fechas, vencimiento automático, cancelación directa/extraordinaria y cadena afectada. Un rechazo no aumenta el total de sanciones sin efecto.

Propuesta de entrega para ambos: vista imprimible y exportación CSV con filtros/metadatos de generación; confirmar si se requiere PDF descargable como archivo adicional. Escapar contenido al imprimir y proteger exportación frente a fórmulas de hoja de cálculo. Registrar generación del informe sin copiar innecesariamente todo su contenido a logs.

## 11. Mapa de impacto técnico

| Área actual | Trabajo previsto |
|---|---|
| `src/lib/domain/roles.ts`, `constants.ts`, `schemas.ts` | Centralizar condiciones por acción/recurso; quitar unidad obligatoria del policía; validar catálogo, confirmación, fechas y motivos. |
| `src/lib/auth/request-user.ts`, `src/hooks/use-auth.tsx` | Cuenta activa, revocación, asignación vigente, errores de sesión y primer cambio de contraseña. |
| `src/app/api/personal/route.ts` | Padrón global y búsqueda identificativa controlada; listado de sancionados por unidad separado. |
| `src/app/api/faltas/route.ts`, `src/lib/faltas/reincidencia.ts`, `src/lib/domain/disciplinary-recidivism.ts` | Alta, unidad derivada, confirmación, antecedentes, paginación, cancelación y coordinación concurrente. |
| `src/app/api/faltas/solicitudes/**` | Autoría, siete/cinco días, motivo, resolución, vencimiento y notificaciones. |
| `src/app/api/users/route.ts`, `users/handover/route.ts` | Exclusividad, relevo recuperable y cierre de vías alternativas. |
| `src/app/api/personal/[id]/transfer/route.ts`, `transferencias/**` | Deshabilitar mutaciones de traslado; conservar evidencia histórica accesible a roles autorizados. |
| `src/app/api/imports/**`, `src/lib/imports/**` | Padrón sin unidad, conservación de IDs, validación de cadenas históricas, idempotencia y reversión controlada. |
| `src/app/api/integraciones/sanciones/route.ts` | Verificar contrato y consumo del dominio común; no habilitar BSFP ni modificar la otra app. |
| `src/app/api/dashboard/route.ts`, `reportes/route.ts` | Métricas con semántica definida, filtros completos y dos informes separados. |
| Componentes `registro`, `personal`, `historial`, `solicitudes`, `usuarios`, `reportes`, `dashboard`, `importacion` | Adaptar flujos y mensajes; agregar confirmaciones, cadena, notificaciones y auditoría. |
| Navegación y `use-data-cache.tsx` | Menús según permisos y limpieza de caché al relevar/cambiar cuenta. |
| `firestore.rules`, `firestore.indexes.json` | Acceso activo y por recurso; índices de solicitudes/vencimientos, historial, antecedentes, notificaciones e informes. |

Agregar módulos pequeños de dominio para plazos, autorización, confirmaciones y cancelación cuando eviten duplicación. No imponer un cambio general de arquitectura. Nombres definitivos de endpoints nuevos se decidirán con el contrato; mantener compatibilidad de lectura con registros antiguos y cerrar rutas antiguas que eludan las reglas.

## 12. Correcciones de auditoría incluidas

| Hallazgos | Tratamiento |
|---|---|
| H01, H04, H08 | Aislamiento de consultas, perfil sin unidad y autoría de solicitudes; necesarios antes de exponer el padrón global. |
| H02, H03, H09, H12, H17 | Jerarquía, sesión, relevo, primer acceso y errores de autenticación; necesarios para confirmar acciones con autoría fiable. |
| H05, H15, H16, H18 | Catálogo, resultados completos, concurrencia y dependencia de reincidencias; incluidos en dominio y pruebas. |
| H13, H14, H19 | Importación/reversión/CSV e identidad histórica; corregir en los flujos que permanezcan habilitados. No conservar borrado/reimportación destructivos como vía de mantenimiento. |
| H06, H07 | Retirar flujo operativo de traspasos, cerrar rutas y conservar archivo; verificar que no existan consumidores activos. No invertir en reescribir un flujo retirado. |
| H11 | Escapado de impresión y exportaciones afectadas. |
| H10 | Reevaluar avisos actuales; actualizar dependencias necesarias en cambio separado y probado. No tratar el conteo antiguo de avisos como diagnóstico actual ni mezclar actualizaciones mayores indiscriminadas. |
| H20 | Mantener integración deshabilitada si ese es su estado verificado. Si estuviera activa en producción, acordar transición compatible antes de publicar. No dejar una vía activa que eluda las reglas nuevas. |

Cerrar hallazgos solo con evidencia proporcional. La reproducción antigua que confirma un fallo no constituye una prueba de regresión segura. No declarar resuelta toda la auditoría por completar esta modificación.

## 13. Plan de ejecución por fases

| Fase | Trabajo y dependencias | Entregable / criterio de salida |
|---|---|---|
| 0. Cierre funcional | Revisar R01–R17 y P01–P04; acordar límites, transición histórica y cancelación extraordinaria con descendientes. | Matriz y reglas versionadas. Puede avanzar análisis sin ejecutar la política pendiente. |
| 1. Inventario y respaldo | Confirmar commit/cambios actuales, rutas y consumidores, estado real de integración, volúmenes/índices y capacidad del programador. Inventario de calidad de datos en solo lectura cuando se autorice acceso correspondiente. | Diagnóstico sin datos personales en documentos, manifiesto de respaldo y prueba de restauración aislada antes de migrar. |
| 2. Contratos y pruebas de dominio | Definir fechas, estados, permisos, confirmaciones e idempotencia. Escribir casos permitidos/denegados antes de alterar handlers sensibles. | Pruebas reproducibles de reglas nuevas y reglas disciplinarias conservadas. |
| 3. Acceso y relevo | Corregir autorización/sessiones, reserva única de unidad y bloqueo del saliente; reglas Firestore y caché. | Dos administradores no pueden quedar operativos para la misma unidad, incluso con concurrencia. |
| 4. Padrón e historial | Quitar dependencia de unidad del policía, conservar IDs, retirar transferencias, crear lista derivada de sancionados. | Selección global y consulta local correcta, sin pérdida histórica. |
| 5. Registro y reincidencia | Confirmación de intención, validación final, espera temporal, snapshots/cadena, consultas completas. | Alta única, antecedente correcto y ninguna vía de registro que eluda controles. |
| 6. Cancelaciones y vencimiento | Autoría/plazos, resolución, cancelación directa, modo extraordinario conforme P01, proceso automático. | Estados y auditoría consistentes ante carreras, reintentos y proceso retrasado. |
| 7. Notificaciones y reportes | Bandeja durable, estadísticas, informes separados, filtros y exportación. | Notificación a destinatarios autorizados; totales conciliados y exportaciones completas. |
| 8. Migración ensayada | Aplicar esquema aditivo e inventario de legado en copia aislada; adaptar importaciones y consumidores. | Informe antes/después, cero pérdida de IDs/documentos/relaciones; excepciones explicitadas. |
| 9. Validación integral | Pruebas unitarias, API/reglas, concurrencia, interfaz escritorio/móvil, lint/tipos/build e importaciones. | Evidencia trazable por requisito y revisión de seguridad/consistencia. |
| 10. Publicación controlada | Preparar paquete, ventana, índices, migración, proceso periódico y recuperación; ejecutar solo con autorización externa correspondiente. | Verificación real por roles y observación de errores, vencimientos, notificaciones y conciliación. |

Orden de integración: seguridad y datos antes de habilitar UI nueva; no publicar una pantalla que dependa de reglas aún inexistentes. Trabajar en cambios revisables por fase. No se fija una duración en días sin conocer volumen real, calidad del legado y resultado del ensayo.

## 14. Migración y recuperación

1. Crear respaldo verificable de Firestore, reglas/índices y versión de código; conservar de forma segura la correspondencia de perfiles de acceso. No copiar credenciales a documentos del proyecto.
2. Inventariar IDs/CI duplicados, sanciones huérfanas, unidades inexistentes, autores/fechas faltantes, vínculos de reincidencia incompletos, administradores múltiples y solicitudes pendientes. No reparar por suposición.
3. Migración aditiva e idempotente con modo de simulación: agregar campos derivados solo cuando haya evidencia; no renombrar colecciones ni regenerar personas.
4. Mantener unidad sancionadora y snapshots históricos; retirar dependencia del dato de destino del policía. No marcar constancias de confirmación antiguas como si hubieran sido aceptadas bajo el nuevo mecanismo.
5. Establecer corte de transición aprobado para solicitudes antiguas, importaciones y transferencias. No ejecutar rechazo masivo ni cancelación retroactiva como efecto colateral.
6. Verificar cantidades por unidad/estado, identidad, vínculos, documentos y autores antes/después. La igualdad de cantidades por sí sola no prueba integridad; muestrear relaciones y comprobar hashes de campos que deban preservarse.
7. Evitar versiones simultáneas incompatibles: confirmar en servidor versión de contrato y rechazar confirmaciones obsoletas; usar ventana controlada si el despliegue/migración lo exige.
8. Preparar vuelta a versión compatible de lectura o modo restringido. No restaurar ciegamente un backup sobre sanciones nuevas: preservar y reconciliar escrituras posteriores. Preferir corregir hacia adelante cuando la versión antigua no entienda los datos nuevos.

No ejecutar los scripts actuales de limpieza/seed como pruebas. Las importaciones y su reversión deben pasar por controles de dependencia: revertir un lote no puede borrar o resucitar sanciones utilizadas como antecedentes ni saltarse cancelaciones auditables.

## 15. Pruebas y criterios de aceptación

Todas las pruebas mutantes se realizan con usuarios y datos ficticios en entorno aislado. Un build correcto no valida Firebase real ni la interfaz.

| ID | Escenario y resultado esperado |
|---|---|
| T01 | `operador_unidad`/`visor_dpto` intentan registrar por API: denegado aunque envíen payload válido. |
| T02 | `admin_unidad` selecciona cualquier policía; sanción queda en su unidad. Unidad manipulada en petición: denegada o ignorada de forma documentada, sin atribución ajena. |
| T03 | Consultas por `personalId`, exportaciones, URLs directas y Firestore no exponen sanciones de otras unidades. Antecedente ajeno muestra solo fundamento autorizado. |
| T04 | Cuenta sin unidad, desactivada, relevada o con token revocado no registra ni accede a datos fuera de permiso. |
| T05 | Dos altas/relevos/reactivaciones concurrentes dejan como máximo un administrador operativo por unidad. Fallo intermedio mantiene acceso seguro. |
| T06 | Doble clic, pérdida de respuesta y reintento crean una sola sanción y un evento consistente. Intención modificada, caducada, reutilizada o de otro actor: rechazada. |
| T07 | Misma persona/artículo/inciso en otra unidad se detecta; sanción sin efecto no fundamenta reincidencia. No truncar antecedentes. |
| T08 | Antes, exactamente y después de 168 horas: permiso según frontera acordada. No usar reloj del cliente ni fecha disciplinaria para el plazo. |
| T09 | Antecedente con solicitud pendiente bloquea reincidencia. Espera no permite duplicar sanción base. Rechazo antes del séptimo día no elimina espera. |
| T10 | Solicitud de otro autor/reemplazante, vencida, duplicada o sobre sanción sin efecto: rechazada. Motivo vacío: rechazado. |
| T11 | Aprobación después del séptimo día pero dentro de cinco días de solicitud: permitida. Resolución al vencer las 120 horas: rechazo automático. |
| T12 | Aprobación y vencimiento concurrentes producen una sola resolución; proceso periódico repetido no duplica auditoría/notificación. |
| T13 | Proceso periódico detenido: no se puede aprobar una solicitud efectivamente vencida ni queda bloqueado indebidamente un antecedente. Al recuperarse, materializa y notifica una vez. |
| T14 | `admin_dpto` cancela directamente registro propio dentro de plazo; ajeno o fuera de plazo: denegado. |
| T15 | `super_admin` cancela fuera de plazo con motivo/confirmación; dependencias siguen P01 aprobado, sin cascadas silenciosas ni estados parciales presentados como finales. |
| T16 | Carrera entre alta de reincidencia, nueva solicitud y cancelación no permite usar un antecedente invalidado. Coordinación incluye todas las vías activas. |
| T17 | Relevo conserva historia y bandeja de unidad; usuario anterior pierde acceso; lectura de notificación no filtra datos de otras unidades. |
| T18 | Informes separados por mes/unidad concilian con registros; rechazo no cuenta como anulación; zona horaria correcta en límites mensuales. |
| T19 | Migración mantiene IDs/CI/autoría/unidad/relaciones. Legado incompleto señalado y no inventado. Reejecución no duplica. |
| T20 | CSV con comillas/multilínea, impresión con HTML y exportación con fórmulas se tratan de manera segura. |
| T21 | Importación, reversión e integración activa no eluden permisos, confirmación aplicable, cancelación o cadena. Cadena histórica sigue P03 aprobado. |
| T22 | Retiro de traspasos alcanza interfaz y endpoints; las URL antiguas no modifican unidades del padrón. Archivo histórico conservado. |
| T23 | Se mantienen reglas actuales de escalamiento, 365 días, origen requerido y remisión Art. 12 inc. 1; casos de varias cadenas independientes no se mezclan. |
| T24 | Interfaz móvil/escritorio permite búsqueda, confirmación, consulta de cadena y resolución con mensajes comprensibles y navegación por teclado. |

Comprobaciones técnicas previstas: `npm run lint`, `npx tsc --noEmit`, pruebas existentes `npm run test:imports`, pruebas nuevas proporcionales de autorización/plazos/concurrencia, emulador de reglas y pruebas de interfaz, y `npm run build`. Verificar scripts que cargan `.env.local` antes de ejecutarlos; no usar `smoke:reincidencia` contra datos reales por defecto. Registrar por separado pruebas de dominio, API simulada, emulador, navegador y servicio real.

## 16. Publicación, operación y seguimiento

- Preparar revisión del cambio, reporte de pruebas, decisiones pendientes, respaldo/restauración y comparación de datos.
- Verificar servicio programador disponible y sus permisos/costos antes de elegir Firebase Scheduler o programador compatible con el despliegue existente. La corrección del vencimiento no depende de precisión exacta del disparo periódico.
- Preparar índices antes de activar consultas, coordinar reglas y servidor, ejecutar migración aprobada y habilitar interfaz por etapas compatibles.
- Tras publicación autorizada, verificar con cuentas de cada rol, una unidad piloto y operaciones controladas aprobadas. No usar sanciones reales ficticias como prueba.
- Supervisar errores de autorización, duplicados, retraso de vencimientos, notificaciones pendientes, relevos incompletos y divergencias de reportes. Mostrar fallos; no presentar una carga parcial como total correcto.
- Documentar procedimiento de soporte para autor relevado, cadena incompleta, solicitud vencida y cancelación extraordinaria; actualizar base funcional y matriz al concluir implementación.

La tarea se considera implementada únicamente cuando los requisitos acordados tienen evidencia, las decisiones P01–P04 necesarias para publicar están cerradas, se conserva la historia y la prueba de recuperación es satisfactoria. Preparar código no implica permiso de push, despliegue de reglas, activación de servicios o cambios de datos reales.

## 17. Fuentes y límites de esta planificación

Fuentes locales: [base funcional](BASE_CONOCIMIENTO_APP.md), [auditoría H01–H20](auditoria-2026-10-26/INFORME.md), [roles](../src/lib/domain/roles.ts), [esquemas](../src/lib/domain/schemas.ts), [API de sanciones](../src/app/api/faltas/route.ts), [solicitudes](../src/app/api/faltas/solicitudes/route.ts), [resolución](../src/app/api/faltas/solicitudes/[id]/resolver/route.ts), [reglas Firestore](../firestore.rules) y decisiones históricas del workspace contrastadas con las instrucciones actuales del usuario.

Referencias técnicas oficiales consultadas el 26/10/2026:

- [Transacciones de Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions): fundamento para transiciones coordinadas; reintentos obligan a evitar efectos externos no idempotentes dentro de transacciones.
- [Gestión de sesiones de Firebase Auth](https://firebase.google.com/docs/auth/admin/manage-sessions): revocación y verificación de sesiones; desactivar un botón no revoca acceso.
- [Funciones programadas](https://firebase.google.com/docs/functions/schedule-functions): opción para procesar vencimientos, con despliegue/servicio por verificar antes de adoptar.
- [TTL de Firestore](https://firebase.google.com/docs/firestore/ttl): mecanismo de eliminación diferida; no es sustituto de una resolución auditable por vencimiento.

Se inspeccionó código y documentación local; no se consultaron datos personales ni se volvió a probar producción en esta tarea. No se aplicaron cambios de código, permisos, Firebase o despliegue. Este documento no certifica validez jurídica de los plazos ni de las reglas disciplinarias; expresa las instrucciones funcionales recibidas y el diseño propuesto.
