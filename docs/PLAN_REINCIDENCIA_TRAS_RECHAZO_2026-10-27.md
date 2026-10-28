# Plan: habilitación de reincidencia tras rechazo expreso

Fecha: 27/10/2026. Estado actualizado: implementación local autorizada y aplicada; ver [resultado, pruebas y límites](IMPLEMENTACION_RECHAZO_EXPRESO_2026-10-27.md). Pendiente de publicación. El contenido siguiente conserva el plan aprobado; sin consultar ni modificar expedientes reales.

## 1. Objetivo y alcance

Permitir que una sanción sirva como antecedente antes de completar siete días desde su registro cuando una solicitud de cancelación, presentada oportunamente, haya sido rechazada expresamente por admin_dpto o super_admin. El rechazo automático por vencimiento no concede esa excepción.

La excepción elimina únicamente la espera restante del antecedente concreto. No crea una reincidencia automáticamente, no reinicia el año, no permite saltar escalones y no confirma otras sanciones de la misma persona. El registrador sigue seleccionando la conducta y confirmando una nueva sanción.

Se preservan identidad, unidad histórica, separación por artículo/inciso de origen, período de 365 días, cancelación extraordinaria y todos los cambios locales anteriores. No comprende publicación, exportación, limpieza ni migración de datos reales.

## 2. Evidencia actual

- `src/lib/domain/sanction-policy.ts`: `ancestorBlock` exige siete días antes de comprobar solicitudes pendientes. No concede excepción por rechazo expreso.
- `src/lib/server/cancellations.ts`: resolución humana guarda `causaCierre: decision`, `resolvedBy`, `resolvedAt`, motivo y `confirmacionId`; vencimiento guarda `causaCierre: vencimiento` y actor sistema. Existe información para distinguir ambas situaciones sin interpretar textos libres.
- `createCancellationRequest` bloquea solicitudes pendientes duplicadas y nuevas solicitudes sobre sanciones con reincidencias dependientes; permite volver a solicitar dentro del plazo si no existen esas restricciones.
- `src/lib/server/recurrence.ts` comprueba todos los antecedentes empleados dentro de la transacción y calcula una versión de la decisión que incluye las solicitudes.
- También consumen `ancestorBlock` la consulta de antecedentes, la reconstrucción de evidencia y la comprobación de elegibilidad en cancelaciones. Registro e importación confirmada utilizan el evaluador transaccional común.
- La prueba manual local permite omitir los siete días mediante una bandera exclusiva del demo. Esa excepción debe estar desactivada en las pruebas de esta nueva regla para no producir falsos positivos.

Estos hallazgos describen código inspeccionado; no son una prueba del comportamiento de producción ni una validación jurídica de los plazos institucionales acordados.

## 3. Regla funcional

| Situación del antecedente | Resultado temporal |
|---|---|
| Registrado, sin solicitud, menos de siete días | Esperar hasta completar siete días |
| Registrado, sin solicitud pendiente, siete días cumplidos | Habilitado si cumple las demás reglas |
| Solicitud pendiente dentro de sus cinco días | Bloqueado, incluso si ya pasaron siete días |
| Solicitud rechazada expresamente y válida | Eliminar espera restante desde la resolución |
| Solicitud rechazada automáticamente por vencimiento | Mantener la regla ordinaria de siete días |
| Solicitud aprobada / sanción sin efecto | No utilizar ese registro como antecedente |
| Otra solicitud pendiente sobre la misma sanción | El bloqueo pendiente prevalece sobre un rechazo anterior |
| Fechas o fundamento no verificables | Mantener revisión; no conceder excepción por inferencia |

No se suman siete más cinco días de forma fija. Sin rechazo expreso, la disponibilidad depende de completar los siete días y de no tener una solicitud pendiente efectiva. Al vencer una solicitud, si ya se cumplieron los siete días, no se añade otra espera. Los límites se calculan con el reloj del servidor: siete períodos de 24 horas desde el registro y cinco desde la solicitud.

La habilitación de A no habilita automáticamente una nueva sanción B: B tendrá su propia espera o resolución. Cada antecedente de la cadena debe cumplir sus controles. El período anual conserva su fecha de inicio actual.

## 4. Fase de preparación

1. Revisar Git y conservar los cambios locales de navegación, reportes y menú móvil sin mezclarlos con reversiones.
2. Leer las instrucciones vigentes y las skills architecture-guard, faltas-multiunidad y code-review para el cambio transversal y su cierre.
3. Inventariar consumidores del evaluador y campos que exponen las API; revisar reglas Firestore para confirmar que el cliente no puede fabricar una resolución.
4. Preparar datos ficticios y emuladores de prueba separados del entorno manual ocupado. No ejecutar suites que limpien los emuladores usados por el usuario.

## 5. Política central de elegibilidad

Introducir una evaluación estructurada de elegibilidad, manteniendo un adaptador compatible para los consumidores que hoy esperan un mensaje o null.

Resultado propuesto: disponible, motivo/código de bloqueo, fecha de habilitación ordinaria y, cuando corresponda, fundamento de excepción con ID de solicitud y fecha de resolución. Los nombres definitivos se ajustarán a los contratos existentes.

Orden de decisión:

1. Verificar que la sanción sigue registrada y que su fundamento y fechas son verificables.
2. Comprobar solicitudes pendientes efectivas; cualquier pendiente impide habilitar el antecedente.
3. Buscar un rechazo expreso válido asociado a ese mismo ID de sanción.
4. Si existe, dispensar solo la espera de siete días de esa sanción.
5. Si no existe, aplicar el vencimiento ordinario de siete días.
6. Mantener por separado la excepción exclusiva del demo, sin confundirla con una resolución real.

Para reconocer un rechazo expreso se exigirá evidencia persistida por el servidor: estado rechazada, causa decision, ID de sanción coincidente, actor identificado con rol admin_dpto o super_admin al resolver, motivo, confirmación y fechas consistentes. La solicitud deberá haberse presentado durante los siete días permitidos y resuelto antes de su vencimiento; una fecha futura o incompleta no habilita anticipadamente.

No basta el estado rechazada ni un texto que contenga esa palabra. Tampoco se usará el rol actual del antiguo resolutor para invalidar una decisión histórica: debe conservarse su identidad y rol al actuar.

## 6. Resolución, transacciones y auditoría

1. Conservar la resolución, confirmación, auditoría y notificación en la transacción actual. Evitar un segundo paso independiente que pueda habilitar antes de que el rechazo quede guardado.
2. Derivar la elegibilidad de la sanción y sus solicitudes; evitar un booleano permanente que quede obsoleto al aparecer otra solicitud o una cancelación extraordinaria.
3. Al guardar una reincidencia mediante esta excepción, conservar en su evidencia de registro los antecedentes beneficiados, solicitud de rechazo, fecha de resolución y versión de política. La referencia debe permitir reconstruir por qué se admitió antes de siete días.
4. Mantener revalidación final y versión de decisión: si cambia una solicitud después de la vista previa, actualizar la evaluación y exigir revisión de la confirmación cuando corresponda.
5. Preservar la coordinación transaccional por persona entre registrar reincidencia, crear solicitud y resolverla. Una solicitud y una reincidencia simultáneas deben producir un estado consistente: pendiente bloqueante o rechazo de la solicitud por dependencias ya registradas.
6. Mantener idempotencia de confirmaciones, resoluciones y notificaciones; repetir una petición no duplicará registros ni eventos.

No se introduce una prohibición nueva de volver a solicitar: se mantienen las condiciones actuales de autoría, unidad, plazo, ausencia de pendientes y ausencia de descendientes. Si vuelve a admitirse una solicitud, bloqueará mientras esté pendiente. Tras su vencimiento se reevaluarán todos los hechos; un rechazo expreso anterior seguirá siendo evidencia de la excepción, pero nunca superará una solicitud pendiente o una sanción sin efecto.

## 7. Coordinación de rutas y compatibilidad

- Aplicar el mismo resultado a `/api/faltas/evaluar`, registro final, `/api/antecedentes`, reconstrucción de evidencia y confirmación de importaciones que usan el motor común.
- Revisar la vista previa de importaciones y su mensaje de siete días para que no contradigan la confirmación final. No introducir dispensas generales para lotes nuevos.
- Mantener permisos: admin_unidad registra en su unidad; admin_dpto y super_admin resuelven según sus permisos vigentes; operador_unidad y visor_dpto no pueden confirmar rechazos.
- La evaluación seguirá consultando los antecedentes pertinentes de otras unidades, entregando solo la información permitida al rol. No ampliar el acceso al expediente ni al motivo de solicitudes ajenas.
- Rechazos existentes con evidencia completa podrán reconocerse al leerlos, sin reescribirlos. Registros antiguos ambiguos conservarán la espera ordinaria; no se completarán campos por suposición.
- Una cancelación extraordinaria posterior seguirá dejando sin efecto el registro elegido y ajustando descendientes según la regla ya aprobada. El rechazo previo no vuelve irrevocable la sanción ni modifica ese procedimiento.
- No se prevé una colección nueva. Verificar necesidad real de índices según consultas finales; no desplegar reglas o índices innecesarios.

## 8. Interfaz, notificaciones e informes

1. En el registro, mostrar cuando sea pertinente: «Antecedente habilitado: la solicitud para dejar sin efecto fue rechazada el [fecha y hora]».
2. Si hay solicitud pendiente: «No puede utilizarse este antecedente mientras su solicitud esté pendiente de resolución».
3. Si venció sin resolución y aún faltan días: «Solicitud cerrada por vencimiento. Este antecedente podrá utilizarse desde [fecha y hora]».
4. Distinguir en la bandeja «Rechazada por el administrador» de «Rechazada por vencimiento», preservando motivo y autoridad en el ámbito autorizado.
5. Al rechazar, notificar al solicitante y al responsable actual de la unidad, dentro de la app. Describir que se elimina la espera restante, sin prometer disponibilidad si existe otro bloqueo.
6. Actualizar evaluación, antecedentes, historial y solicitudes tras la resolución; refrescar al volver al registro y conservar la comprobación final del servidor frente a otras sesiones abiertas.
7. En auditoría de cancelaciones, conservar la causa y efecto de la resolución; en auditoría de sanciones, mostrar el fundamento de la admisión anticipada. No contar un rechazo como una nueva sanción ni mezclar los dos informes.

Usar fechas y horas legibles en America/La_Paz y textos breves; no añadir explicaciones técnicas permanentes a todas las pantallas.

## 9. Pruebas de aceptación

Todas con datos ficticios y espera ordinaria activada, salvo las pruebas específicas de aislamiento de la bandera demo.

| Caso | Resultado esperado |
|---|---|
| Sin solicitud al día 2 | Reincidencia bloqueada |
| Sin solicitud justo antes de siete días / justo al cumplirlos | Bloqueada / habilitada |
| Solicitud día 1, rechazo expreso día 2 | Habilitada desde la resolución, sin esperar al día 7 |
| Solicitud día 1, vencimiento al día 6 | Sigue esperando hasta el día 7 |
| Solicitud día 6, pendiente al día 8 | Bloqueada pese a cumplir siete días |
| Solicitud día 6, vencimiento al día 11 | Habilitada al vencer, sin otros cinco o siete días |
| Resolución justo en el vencimiento | No aceptar rechazo expreso tardío; aplicar vencimiento |
| Solicitud aprobada | Antecedente excluido |
| Rechazo de otra sanción/persona/conducta | No dispensa la espera del antecedente seleccionado |
| Rechazo expreso anterior y nueva solicitud pendiente | Bloqueo mientras esté pendiente |
| Rechazo sin causa, actor autorizado o fechas comprobables | Sin habilitación anticipada |
| Cliente intenta enviar habilitado o resolución falsa | API ignora/rechaza el intento; no autoriza |
| Rechazo en una unidad y registro autorizado en otra | Misma regla global de antecedentes sin ampliar lectura |
| Nueva sanción escalada tras rechazo de su antecesora | Nueva sanción conserva su propia espera |
| Otra conducta de la misma persona | Cadena y plazos independientes |
| Año de cadena vencido | Nueva base según regla vigente; rechazo no renueva el año |
| Cancelación extraordinaria después de rechazo | Se conserva el ajuste de cadena ya aprobado |
| Nueva solicitud/cancelación entre vista previa y guardado | Revalidación y bloqueo o nueva confirmación |
| Registro y solicitud simultáneos | Sin reincidencia fundada en un antecedente pendiente |
| Doble envío de resolución/registro | Una única resolución/registro y notificación |
| Cron de vencimientos no ejecutado todavía | Disponibilidad temporal correcta sin depender del cron |
| Demo con bandera activada y desactivada | Diferencia explícita; la bandera nunca opera en producción |

Validación por niveles: pruebas unitarias de política y fronteras, pruebas API/transacciones en emuladores, pruebas de interfaz con admin_unidad/admin_dpto/super_admin y denegaciones de operador/visor. Comprobar la cadena 9/X → 10/1 → 11/1 y la que nace en 10/X, además de regresión de importación y cancelación.

Antes de cerrar implementación: lint, tipos, suites pertinentes y build. Registrar comandos, resultados y límites; no afirmar verificación en teléfono real o producción a partir de emulación.

## 10. Entrega y publicación posterior

1. Aplicar y revisar el cambio local cuando el usuario autorice ejecutar este plan.
2. Entregar resultados de pruebas y recorrido manual: sanción reciente → solicitud → rechazo expreso → nueva reincidencia; contrastar con cierre automático.
3. Actualizar documentación funcional y notas del proyecto, diferenciando esta excepción de la bandera local de pruebas.
4. Tras la aprobación de la revisión y autorización de publicación, integrar con los cambios locales pendientes, publicar por el flujo GitHub/Vercel y verificar la revisión desplegada.
5. No exportar ni depurar datos reales. No reclasificar sanciones históricas ni crear reincidencias retroactivas por esta actualización.

Criterio de cierre: la misma decisión se observa en vista previa y guardado; solo un rechazo expreso verificable elimina la espera de su sanción, ningún pendiente se elude y la auditoría explica cada registro anticipado.
