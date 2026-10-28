# Reincidencia tras rechazo expreso de una solicitud

Fecha: 27/10/2026. Implementación local del [plan aprobado](PLAN_REINCIDENCIA_TRAS_RECHAZO_2026-10-27.md). No publicada; sin modificaciones ni exportaciones de datos reales.

## Resultado funcional

- Una solicitud presentada dentro de los siete días y rechazada expresamente por admin_dpto o super_admin permite utilizar esa sanción como antecedente sin esperar los días restantes.
- Se exige la evidencia histórica de la resolución: sanción y solicitud identificadas, causa decision, autoridad, motivo, confirmación y fechas verificables. Los rechazos antiguos completos se reconocen al leer; los ambiguos no conceden la excepción.
- Una solicitud pendiente efectiva prevalece sobre cualquier rechazo anterior. Su vencimiento automático conserva la regla ordinaria: no se suman siete más cinco días fijos.
- Las sanciones sin efecto y los fundamentos pendientes de revisión no se habilitan por un rechazo. La nueva sanción escalada tiene su propio plazo; otras conductas y el año de la cadena conservan sus reglas.
- No se prohíbe una nueva solicitud por el mero hecho de un rechazo anterior. Continúan autoría, unidad, plazo, ausencia de pendientes y control de descendientes. La cancelación extraordinaria conserva el ajuste de cadena aprobado.

## Aplicación en código

`src/lib/domain/sanction-policy.ts` incorpora `ancestorEligibility`, con resultado estructurado y evidencia de rechazo; `ancestorBlock` conserva su contrato como adaptador. Se comprueba primero la solicitud pendiente y después la dispensa de espera.

El evaluador transaccional, la consulta de antecedentes y la reconstrucción de evidencia comparten la política. Registro e importación guardan `habilitacionAntecedentes` con versión de política y las resoluciones que permitieron dispensar la espera. La decisión se comprueba de nuevo al guardar y su versión incluye las solicitudes; las confirmaciones antiguas deben revisarse cuando cambia el fundamento.

La resolución humana conserva confirmación, auditoría, notificación y coordinación por persona en su transacción. Registra `dispensaEspera` como efecto de esa resolución, sin usarlo como autorización permanente. Se vuelve a comprobar el plazo inmediatamente antes de preparar la escritura para evitar aceptar una solicitud/resolución que cruzó su límite durante las lecturas.

No se crean colecciones, índices ni permisos nuevos. Firestore mantiene la prohibición de escrituras directas de clientes sobre solicitudes y confirmaciones. La API pública de evaluación omite autoridad, confirmación e ID de solicitud del rechazo; la constancia completa se conserva para auditoría. La consulta de sanciones devuelve una versión reducida de esa evidencia.

## Presentación

- El registro muestra el documento y la fecha del rechazo que permitió usar el antecedente.
- Una solicitud pendiente oculta ese mensaje y bloquea el registro; un vencimiento antes del séptimo día explica hasta cuándo se espera.
- La bandeja distingue rechazo del administrador y rechazo por vencimiento.
- El registro refresca la evaluación al volver a la ventana y cada minuto, excepto durante la confirmación. El servidor sigue revalidando aunque otra sesión conserve una pantalla anterior.
- La notificación informa al solicitante y a los responsables actuales de la unidad mediante los destinatarios existentes de la app.
- Los informes separados conservan la resolución en cancelaciones y el fundamento de la admisión anticipada en sanciones, incluido CSV. El historial muestra una explicación legible de la habilitación al registrar.

## Verificación y límites

- 48 pruebas de dominio: separación de conductas, cadena y año; espera ordinaria; rechazo expreso; prioridad de pendientes; vencimientos exactos; evidencia incompleta, futura o sin autoridad; aislamiento de la excepción demo.
- 11 pruebas de importación.
- 24 pruebas de servidor/API sobre Auth y Firestore emulados: ocho grupos específicos del rechazo y 16 de regresión del flujo existente. Incluyen registro temprano con evidencia, consulta de antecedentes, nueva espera del descendiente, importación, otra unidad, aprobación, cancelación extraordinaria, motivos/notificaciones/auditoría, reintentos, permisos y carrera entre solicitud y registro.
- Cuatro comprobaciones de presentación en Chrome: mensaje y botón habilitado, solicitud pendiente que vuelve a bloquear, vencimiento que conserva espera y etiquetas distintas en la bandeja. Se usaron respuestas API ficticias para esta comprobación visual; no es un recorrido completo de navegador contra los emuladores aislados.
- Lint, tipos y compilación de producción comprobados. Revisión propia del alcance; no es una revisión independiente ni una certificación normativa.

La suite reproducible `npm run test:rejection` usa `firebase.rejection.test.json`, con Firestore8188, Auth9198 y servicios auxiliares separados. No importa ni exporta datos y no ocupa los emuladores manuales8087/9097. La prueba nueva exige esos puertos y el proyecto demo antes de escribir. El proceso finaliza sus emuladores al terminar.

Evidencia local ignorada por Git: `.local-demo/rejection-emulator.log`, `rejection-imports.log`, `rejection-lint.log`, `rejection-build.log`, `rejection-ui-verification.json` y `rechazo-expreso-registro.png`. Solo incluye datos ficticios. Respaldo previo de código en el workspace padre: `.ai/backups/antes-rechazo-expreso-20261027.zip`.

No se ejecutó commit, push, publicación, migración, limpieza ni prueba con expedientes reales. El entorno manual conserva su bandera de omisión de espera autorizada previamente: puede ocultar visualmente la diferencia entre esperar y dispensar. Las pruebas de negocio se ejecutaron con esa bandera desactivada. El programador de vencimientos de producción continúa pendiente según la documentación previa; la elegibilidad no depende de que el cron se haya ejecutado.
