# Plan de reorganización de Personal, Sanciones y Solicitudes

Fecha: 27/10/2026. Estado: implementación local aplicada por autorización posterior del usuario y comprobada; pendiente de revisión manual y publicación posterior.

## 1. Objetivo y alcance

Separar tres tareas: encontrar a una persona y consultar su historial; consultar y gestionar sanciones de una unidad; seguir y resolver solicitudes para dejar sin efecto. Reutilizar la misma ficha de historial desde los dos primeros recorridos.

El usuario autorizó aplicar el plan después de su elaboración. La implementación y las pruebas se realizaron en local, con datos ficticios; publicar será una etapa posterior. Conservar Firebase, colecciones, identidades, unidad histórica, confirmaciones y auditoría. No exportar datos reales, migrar, depurar ni sembrar producción. No modificar reglas de reincidencia, plazos, asignaciones de usuarios o facultades de los roles.

## 2. Situación comprobada en el código

- `PersonalPage` permite buscar en el padrón y listar personas con sanciones por unidad. Abre `HistorialPersonal`, de solo lectura, con ámbito explícito y filtros de estado.
- `HistorialPage` contiene dos recorridos: por unidad y por efectivo. El segundo duplica la consulta individual de Personal. Además incluye solicitud de cancelación, cancelación directa y una bandeja de seguimiento.
- `SolicitudesPage` ya ofrece pendientes/aprobadas/rechazadas y resolución con motivo y confirmación, pero su interfaz no diferencia roles: muestra Aprobar/Rechazar en filas pendientes. Hoy el menú la limita a admin_dpto/super_admin.
- La API de solicitudes permite consulta propia de unidad a admin_unidad y operador_unidad; el visor está excluido. Por tanto, trasladar el seguimiento a la bandeja exige adaptar primero la UI por rol; no basta con mostrar su menú.
- Los nombres de módulos están repetidos en sidebar, navegación móvil y encabezado. La navegación usa claves internas y estado React en `disciplinario-app.tsx`.
- La ficha individual admite identidad y ámbito, pero el tipo local `Falta` de Historial no declara `personalId`. Antes de enlazar una sanción con la ficha hay que comprobar el contrato real de la API y tiparlo; nunca enlazar por nombre ni deducir identidad por coincidencia textual.
- Las claves de caché actuales de Historial y Solicitudes no incorporan explícitamente UID/rol/unidad de sesión. Revisar también el proveedor y reforzar aislamiento y descarte de respuestas antiguas en los módulos intervenidos.

La revisión es de código local. No se volvió a probar producción durante la preparación de este plan. Las notas antiguas de la base funcional describen permisos y estados anteriores; prevalecen código vigente y decisiones posteriores documentadas en `.ai/session.md` y `.ai/decisions.md`.

## 3. Organización funcional propuesta

| Entrada | Propósito | Comportamiento previsto |
|---|---|---|
| Personal | Encontrar un efectivo y consultar sus sanciones | Conservar CI/nombres/apellidos, padrón general para roles globales y personas sancionadas por unidad. Una persona por fila. |
| Sanciones registradas | Consultar y gestionar registros | Sustituye el nombre Historial. Una sanción por fila; unidad, documento, estados y acciones según permisos. |
| Solicitudes de cancelación | Seguimiento y resolución | Bandeja única. Seguimiento de su unidad para roles de unidad; resolución departamental para admin_dpto. |
| Cancelaciones, para super_admin | Acceso a solicitudes y cancelación extraordinaria | La bandeja conserva el título Solicitudes de cancelación. Un acceso «Buscar sanción para dejar sin efecto» conduce a Sanciones registradas; no se crea un segundo formulario de cancelación. |

En móvil utilizar etiquetas breves Personal, Sanciones, Solicitudes/Cancelaciones con nombres accesibles completos. Resolver espacio y acceso a todos los módulos sin amontonar botones ni ocultar acciones; comprobar 360 px y 390 px.

Mantener «Dejar sin efecto» y «Solicitar dejar sin efecto» en las acciones, y «Sin efecto» para el estado. No llamar «vigentes» a todas las registradas: el vencimiento del período de reincidencia no equivale a dejar sin efecto una sanción.

### Personal y ficha compartida

1. Conservar búsqueda enviada, paginación, retorno al padrón y deduplicación del listado por unidad.
2. Sin filtro de unidad, los roles globales abren el historial departamental. Con unidad seleccionada, abren primero ese ámbito y pueden cambiar explícitamente al departamental.
3. Los roles de unidad solo ven su ámbito, incluso si se manipulan parámetros.
4. Reutilizar `HistorialPersonal` desde Personal y desde Sanciones. Extraerlo a una ubicación compartida solo si facilita el mantenimiento; evitar una segunda implementación.
5. Desde la fila de sanción, un botón explícito «Ver historial del efectivo» abre la ficha por `personalId`. «Ver detalle de la sanción» mantiene una acción distinta, referida a ese documento concreto.
6. Compartir el contenido de detalle cuando ambos recorridos muestran los mismos campos. Antes de reemplazar `EfectivoDetail`, inventariar sus campos para no perder datos históricos, motivos, autor, origen de reincidencia ni advertencias de ajustes.
7. Si falta la referencia o el efectivo no puede consultarse, conservar el detalle histórico de la sanción y mostrar un mensaje claro. No inventar datos, recrear personas ni perder el registro.
8. La ficha será de consulta; las operaciones sobre sanciones se mantienen en Sanciones registradas. Cerrar la ficha devuelve al listado conservando filtros, página y foco.

### Sanciones registradas

1. Retirar selector Por unidad/Por efectivo y los estados, efectos y llamadas exclusivos del buscador duplicado.
2. Mantener selector de unidad para roles globales y unidad fija para roles de unidad. No introducir consulta departamental masiva como requisito nuevo: conservar el comportamiento de selección actual.
3. Conservar búsqueda por documento, filtros Registradas/Sin efecto/Todas y presentación tabla/tarjetas existente. Mostrar claramente unidad y filtro activo. Mantener Registradas como filtro inicial para no cambiar silenciosamente el recorrido.
4. Mostrar persona, documento, fecha, unidad, falta cometida, sanción aplicada y estado; evitar confundir conducta original con artículo aplicado por reincidencia.
5. Conservar solicitud propia y cancelación directa según los indicadores de la API; el servidor seguirá siendo quien autoriza y valida cada operación.
6. Mantener el formulario y confirmación de solicitud. Tras enviarla, actualizar elegibilidad y ofrecer «Ver solicitud» en la bandeja, sin forzar la pérdida del contexto del listado.
7. Retirar la bandeja duplicada solo después de comprobar el seguimiento equivalente en Solicitudes.
8. No eliminar por accidente la información de solicitudes pendientes utilizada para impedir envíos duplicados: separar ese dato funcional de la tabla que se retira, o utilizar el indicador del servidor una vez comprobada su equivalencia.

### Bandeja única de solicitudes

1. Abrirla a admin_unidad y operador_unidad en modo seguimiento, con el mismo alcance de lectura que actualmente tienen en Historial.
2. Mostrar Aprobar/Rechazar exclusivamente a admin_dpto y super_admin y únicamente si la solicitud sigue pendiente dentro de plazo. Revalidar en servidor al confirmar.
3. Mantener tabs Pendientes, Aprobadas y Rechazadas. Las vencidas pertenecen a Rechazadas; explicar el vencimiento si consta en la resolución existente, sin crear un nuevo estado persistente.
4. Mostrar efectivo, documento, unidad, solicitante, fecha de solicitud, motivo/tipo, vencimiento y resolución con fecha y motivo disponibles. No inventar un dato histórico ausente.
5. Mantener prioridad de las próximas a vencer, actualización temporal y consulta del plazo real. El reloj visual no será fuente de autorización.
6. Incluir carga, error y reintento separados del estado vacío. Actualmente la carga usa try/finally sin una presentación específica de error; corregirlo al adaptar el módulo.
7. Preservar filtros al actualizar, descartar respuestas antiguas y separar caché por identidad/rol/unidad/estado. No mostrar resultados de una sesión anterior.
8. Conservar el acceso desde el contador departamental. El enlace «Ver solicitud» puede transportar un ID interno y seleccionar/resaltar el registro autorizado, pero nunca utilizar ese ID como autorización.
9. El superadministrador seguirá ejecutando la cancelación extraordinaria en el registro concreto con motivo, confirmación, análisis de impacto y auditoría existentes. La bandeja no se convertirá en un informe duplicado de Auditoría.

## 4. Matriz de permisos que debe conservarse

| Rol | Consulta de personal e historial | Consulta de sanciones | Solicitudes | Operación permitida |
|---|---|---|---|---|
| admin_unidad | Personas con registros e historial de su unidad | Su unidad | Seguimiento de su unidad | Solicitar sobre sanción propia elegible, dentro de 7 días y con asignación vigente |
| operador_unidad | Igual ámbito de lectura de unidad | Su unidad | Seguimiento de su unidad | Ninguna escritura |
| visor_dpto | Padrón e historial departamental | Unidades autorizadas globalmente | Sin acceso, conforme al contrato actual | Solo lectura |
| admin_dpto | Padrón e historial departamental | Selección de unidad | Consulta y resolución departamental | Resolver; cancelación directa de sanciones propias dentro de 7 días |
| super_admin | Padrón e historial departamental | Selección de unidad | Consulta y resolución departamental | Además, cancelación extraordinaria sin límite de fecha, con motivo y auditoría |

No convertir acceso al menú en permiso de escritura. Proteger también el montaje del módulo y los callbacks de resolución frente a cambios de sesión. Verificar que solicitudes y confirmaciones siguen rechazando operaciones de roles de lectura en la API.

## 5. Mapa de cambios y contratos

| Área / archivo | Trabajo |
|---|---|
| `components/layout/sidebar.tsx`, `mobile-nav.tsx`, `header.tsx` | Nombres coherentes, visibilidad por rol y etiquetas accesibles. Preferir un descriptor pequeño compartido para los módulos afectados. |
| `components/disciplinario-app.tsx` | Pasar contexto mínimo de navegación; resetear datos al cambiar identidad/rol/unidad; mantener claves internas historial/solicitudes. |
| `components/personal/personal-page.tsx`, `historial-personal.tsx` | Integración de ficha compartida y contrato de identidad/ámbito; conservar comportamiento actual de búsqueda. |
| `components/historial/historial-page.tsx`, `efectivo-detail.tsx` | Retirar consulta y bandeja duplicadas; acceso explícito a ficha; preservar acciones y detalle de sanción. |
| `components/solicitudes/solicitudes-page.tsx` | Modos consulta/resolución, información completa, errores, caché y navegación desde solicitud creada. |
| `lib/domain/roles.ts`, `hooks/use-auth.ts` si procede | Helpers específicos de consulta/resolución y exports; no usar isGlobalRole para habilitar seguimiento de unidad. |
| `components/dashboard/dashboard-page.tsx` | Verificar acceso existente a pendientes y actualización tras resolución; cambios mínimos si necesita contexto de navegación. |
| `/api/personal`, `/api/faltas`, `/api/faltas/solicitudes` y rutas de resolución | Reutilizar contratos; comprobar personalId y alcance. Cambiar solo si falta un campo necesario o se detecta una brecha directamente vinculada, documentando la diferencia. |
| Caché compartida | Revisar aislamiento actual; invalidar consultas relacionadas tras operaciones sin reemplazar todo el mecanismo. |

No se prevén colecciones, índices ni reglas Firestore nuevos para esta reorganización. Es una previsión basada en las consultas existentes, no una garantía antes de revisar el diff final. No renombrar endpoints ni estados persistidos. Evitar una reestructuración general de código de transferencias o módulos no implicados.

## 6. Orden de implementación y entregables

### Fase 1. Preparación

- Confirmar Git, cambios del usuario y entorno demo; registrar base y archivos afectados.
- Leer skills architecture-guard y safe-refactor; consultar faltas-multiunidad solo para contrastar restricciones operativas. Usar code-review al cierre.
- Respaldar únicamente los archivos de código afectados dentro del workspace, excluyendo secretos y datos reales.
- Elaborar inventario breve de campos y operaciones de ambas vistas de historial y solicitudes; comprobar personalId y comportamiento de caché.
- Entregable: alcance cerrado y tabla de equivalencias de información antes/después.

### Fase 2. Bandeja compatible con todos sus lectores

- Implementar primero modos seguimiento/resolución, estados de error, aislamiento y permisos de UI.
- Verificar API por rol antes de exponer la navegación de unidad.
- Entregable: unidad puede consultar sus solicitudes sin botones de resolución y sin ver otras unidades; responsables pueden resolver con controles existentes.

### Fase 3. Ficha única y lista de sanciones

- Reutilizar ficha por identidad; añadir botón a cada sanción y conservar detalle individual.
- Retirar búsqueda duplicada Por efectivo y bandeja duplicada, manteniendo formulario de solicitud y controles de solicitudes pendientes.
- Conservar filtros al cerrar/volver y refrescar datos después de mutaciones.
- Entregable: recorridos coherentes desde persona, sanción y solicitud, sin pérdida de información.

### Fase 4. Navegación y textos

- Aplicar nombres y permisos en escritorio, móvil y encabezado de forma consistente.
- Conectar contador, Ver solicitud y acceso del super a búsqueda de sanciones.
- Verificar teclado, foco, Escape, botones explícitos y pantallas estrechas; evitar que pulsar una acción dispare también el clic de la fila.
- Entregable: recorrido completo utilizable por los cinco roles.

### Fase 5. Validación local y revisión

- Ejecutar pruebas de la sección siguiente en entorno aislado o sobre datos ficticios identificados, sin contaminar las pruebas manuales en curso.
- Ejecutar lint, tipos, pruebas pertinentes y build; inspeccionar diff y errores de consola/red.
- Documentar resultados comprobados, limitaciones y defectos pendientes. Actualizar `.ai/session.md` con estado local, sin presentarlo como publicado.
- Entregable: cambio local revisable, evidencia y lista de aceptación manual.

### Fase 6. Publicación posterior

- Solo después de conformidad local y autorización de publicación: revisar secretos/diff, publicar por el flujo GitHub/Vercel ya existente y verificar revisión desplegada y acceso.
- No publicar reglas ni índices si no cambian. No exportar ni limpiar datos reales.
- La reversión sería de código revisado si surgiera una regresión; las acciones legítimas realizadas mientras tanto permanecen en datos y auditoría. No restaurar una base antigua para revertir una reorganización visual.

## 7. Pruebas de aceptación

| Caso | Resultado requerido |
|---|---|
| Buscar CI/nombre con tildes y palabras en otro orden | Mismos resultados correctos que antes; paginación conserva búsqueda |
| Persona sin sanciones | Visible en búsqueda general; mensaje de historial vacío correcto |
| Persona con sanciones en dos unidades | Una persona en cada listado pertinente; ficha abre ámbito seleccionado; global muestra ambas solo con permiso |
| Todas las sanciones de una persona sin efecto | Permanece en listado histórico de unidad y en ficha; no se cuenta como registrada |
| Abrir ficha desde Personal y desde Sanciones | Mismos datos para misma identidad, ámbito y estado de la base |
| Referencia personal ausente/no disponible | Detalle histórico sigue accesible; error explícito al intentar historial completo |
| Cerrar ficha y volver a lista | Conserva unidad, búsqueda, filtros, página y foco |
| admin_unidad autor / otro registrador / fuera de plazo | Solo autor elegible puede solicitar; API rechaza el resto |
| operador_unidad | Ve seguimiento de su unidad; sin registrar, solicitar ni resolver |
| visor_dpto | Consulta global de personas/sanciones; sin bandeja ni operaciones de cancelación |
| admin_dpto | Resuelve con motivo; cancelación directa propia dentro de plazo; no hereda privilegio extraordinario |
| super_admin | Conserva resolución y cancelación extraordinaria con impacto y auditoría |
| Solicitud pendiente duplicada | No permite duplicar ni habilita reincidencia sobre antecedente bloqueado |
| Solicitud vencida mientras permanece abierta | Sale de pendientes, queda rechazada según servidor y no puede aprobarse mediante UI/API |
| Aprobar/rechazar desde bandeja | Actualiza sanción cuando corresponde, solicitudes, contador, reportes/notificaciones; conserva motivo y auditoría |
| Cambiar usuario, rol, unidad o consulta con petición en curso | No muestra datos anteriores como actuales; cancela/ignora respuesta obsoleta |
| Manipular unidad/personalId/ID de solicitud | No amplía alcance ni habilita operación prohibida |
| Error de red o sesión expirada | Error distinguible de lista vacía; reintento o acceso según corresponda |
| Escritorio, móvil y teclado | Mismos módulos autorizados, textos legibles y acciones accesibles |
| Regresión del dominio | Se mantienen cadenas separadas por conducta, período desde base, espera, bloqueo por solicitud y rebaja extraordinaria |

Usar pruebas de componentes/integración para permisos, navegación y respuestas desordenadas; pruebas API con perfiles ficticios para autorización. Reutilizar suite existente de dominio para garantizar que el refactor no alteró reglas. No crear tests que solo comprueben que una etiqueta se renombró. No certificar permisos con capturas ni funcionamiento del servidor solo con build.

## 8. Riesgos y límites

- Mostrar la bandeja actual a unidad sin adaptarla expondría botones improcedentes: resolver antes de retirar el seguimiento de Historial.
- Unificar ficha sin inventario podría perder información del detalle antiguo: comparar campos, no solo apariencia.
- Desaparecer el buscador Por efectivo cambia un acceso conocido: Personal mantiene esa búsqueda y las filas conservan acceso directo a la ficha.
- Caché y respuestas tardías pueden mezclar ámbitos: identidad y alcance en claves, limpieza y descarte explícitos.
- Consultar solicitudes puede procesar vencimientos en el servidor. Las pruebas de expiración se ejecutarán en emuladores; no considerar ese GET una operación necesariamente libre de efectos.
- El programador de vencimientos en segundo plano sigue pendiente según el registro de publicación. Esta reorganización conserva controles actuales y no implica que se haya configurado el programador.
- Los registros históricos con problemas de cadena siguen sujetos a revisión independiente; este plan no los modifica ni los declara corregidos.

## 9. Definición de terminado

Personal, Sanciones registradas y Solicitudes tienen propósitos distintos; la ficha del efectivo es única; se conserva toda información y acción autorizada; no hay bandejas ni buscadores individuales duplicados; los cinco roles superan pruebas positivas y negativas; no hay errores de compilación ni regresiones detectadas en las comprobaciones pertinentes. El cierre distingue implementación local, aceptación del usuario y publicación. La planificación por sí sola no cumple esos hitos.

## 10. Aplicación y evidencia local

- Respaldo de código previo: `.ai/backups/antes-reorganizacion-navegacion-20261027.zip`, en el workspace padre. No contiene una exportación de Firestore.
- Navegación: Personal, Sanciones registradas y Solicitudes de cancelación; Cancelaciones para super_admin. Mismos nombres y permisos en escritorio/móvil/encabezado. Sidebar móvil corregido y navegación inferior desplazable cuando las entradas no caben.
- Ficha única: `HistorialPersonal` por `personalId` desde ambos módulos. `ContenidoSancion` comparte la información con `EfectivoDetail`; conserva motivo, autor, documentos, conductas, antecedentes, ajustes y sin efecto. El detalle de una sanción sigue siendo una acción distinta; falta de referencia personal muestra un aviso.
- Sanciones: retirados búsqueda Por efectivo y seguimiento duplicado. Se mantienen unidad, búsqueda aplicada, estados, tabla/tarjetas y acciones autorizadas en ambos formatos. Enlace Ver solicitud usa el `solicitudId` real devuelto por la API.
- Se comprueban pendientes antes de permitir solicitud. Si falla esa comprobación, las sanciones siguen disponibles pero solicitar queda deshabilitado hasta reintentar; retirar la tabla no elimina el bloqueo funcional.
- Bandeja: lectura de unidad para admin_unidad/operador_unidad; resolución solo admin_dpto/super_admin; visor excluido. Documento, solicitante, tipo, motivo y resolución consultables; errores/reintento separados de vacío. GET usa el mismo helper de lectura, con su ámbito existente.
- Identidad/alcance: reinicio de módulos al cambiar UID/rol/unidad, claves de caché con ese ámbito y descarte de respuestas obsoletas. El proveedor no vuelve a guardar respuestas de una generación anterior tras limpiar por cambio de sesión.
- Modal mantiene el foco dentro de su contenido y lo devuelve al control que lo abrió. Escape y ciclo de Tab comprobados en este recorrido.
-43 pruebas de dominio/políticas/búsqueda y11 de importación aprobadas; tipos, lint y build correctos. Sin cambios en reglas/índices Firestore ni motor disciplinario.
- Script `scripts/check-navigation.mjs`: siete grupos API/Chrome aprobados con cinco perfiles ficticios. Verifica límites de unidad, prohibición de resolver para lectores, token ausente, vencimiento, ficha desde ambos módulos, persona sin sanciones, sin efecto, solicitud real, rechazo y aprobación reales con confirmación, seguimiento de operador, vista previa extraordinaria, cambio de sesión, móvil360/390px, respuestas tardías y errores/reintento. La cancelación extraordinaria no se ejecutó en este script; su regla conserva las pruebas de dominio existentes.
- El script exige proyecto y hosts demo exactos, crea fixtures con prefijo único y retira solo sus documentos/usuarios. Huellas del padrón y sanciones demo previos iguales antes/después. Evidencia `.local-demo/navigation-verification.json`; capturas `navegacion-sanciones.png` y `navegacion-mobile.png` en el mismo directorio. Sin datos de producción.
- `e2e-functional.mjs` recibió ajustes de selectores a navegación/textos actuales; no se volvió a ejecutar aquí porque utiliza los emuladores del entorno manual. La nueva evidencia de navegador corresponde al script anterior.
- Revisión propia del diff y consumidores con code-review; no es una auditoría independiente ni certificación completa de producción. Cron pendiente y registros históricos ambiguos siguen fuera del cambio.
- Entrega: cambios locales sin commit/push ni despliegue. Pruebas en contextos aislados de Chrome, sin intervenir la sesión del usuario. Próximo hito: revisión manual local y publicación posterior autorizada.
