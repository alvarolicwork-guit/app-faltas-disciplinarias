# Implementación funcional: padrón general y trazabilidad de sanciones

**Continuidad posterior:** los fallos de reincidencia citados en la revisión siguiente ya tienen [aplicación local y pruebas](IMPLEMENTACION_REINCIDENCIA_2026-10-27.md). Leer ese documento para el estado vigente, la decisión de nuevo plazo al promover una base y los cinco conflictos históricos pendientes de revisión; la implementación continúa sin publicar.

Fecha: 27/10/2026. Estado: validación inicial local, con fallos de reincidencia identificados posteriormente; requiere corrección antes de publicación autorizada. Base Git previa: `b141f5b7321e3f19bf4643595b5deeced511466e`.

**Revisión posterior, 27/10/2026:** la validación descrita abajo no cubría cadenas paralelas por conducta original. La [auditoría y plan específicos](reincidencia-2026-10-27/DIAGNOSTICO_Y_PLAN.md) confirman fallos en el código local. De los cinco comportamientos reproducidos con handlers reales y Firebase emulado, cuatro siguen siendo defectos; R03 se reclasifica como reinicio correcto tras vencer la raíz. El usuario precisó un año único desde la sanción original9/X o10/X, sin prolongación por reincidencias: R13 exige impedir continuar cadenas vencidas. La actualización solo cambia diagnóstico/plan y continuidad documental; no aplica las correcciones ni cambia el servicio desplegado.

## Funcionalidad implementada

| Área | Comportamiento |
|---|---|
| Padrón | Un solo registro por policía, conservando `personalId` y CI. Los nuevos registros e importaciones no asignan destino por unidad. Los campos antiguos quedan como legado sin controlar la operación. |
| Personal de unidad | Listado derivado de las sanciones de la unidad, incluso si posteriormente quedaron sin efecto. No es una dotación. Consulta paginada. |
| Registro | `admin_unidad` selecciona a cualquier policía del padrón y registra en su unidad vigente. `admin_dpto` y `super_admin` seleccionan unidad sancionadora. Operador y visor no registran. |
| Confirmación | Resumen, aceptación explícita e intención de cinco minutos vinculada a usuario, acción, unidad y contenido. Consumo y registro atómicos; el reintento de la misma intención devuelve el resultado anterior. Es evidencia interna de intención, no firma certificada. |
| Reincidencia | Reglas disciplinarias actuales, 365 días y remisión Art. 12 inc. 1 conservadas. Consulta global por policía sin truncar los antecedentes a 100. Se comparan códigos de artículo/inciso para conservar compatibilidad con textos históricos. |
| Antecedente utilizable | Vigente, con siete días desde registro y sin solicitud pendiente efectiva. No se admite repetir la sanción base para eludir la espera. |
| Trazabilidad | Referencia e instantánea del antecedente validado por servidor, con cadena previa. La unidad ve el fundamento necesario para su registro; no obtiene libre consulta del expediente ajeno. |
| Solicitud | Solo `admin_unidad` autor de la sanción y con acceso vigente a su unidad, dentro de 168 horas desde el registro. Motivo obligatorio. |
| Resolución | `admin_dpto` o `super_admin`, motivo obligatorio para aprobar/rechazar, antes de vencer la solicitud. La aprobación conserva el registro con estado interno `anulada`, visible «sin efecto». |
| Vencimiento | Cinco días corridos desde presentación. Rechazo por vencimiento con actor sistema, fecha efectiva y procesamiento. Las decisiones y antecedentes aplican el vencimiento aunque el proceso periódico se retrase. |
| Cancelación departamental | Directa sobre registros propios, dentro de siete días, con confirmación y motivo. Para registros ajenos debe resolver una solicitud. |
| Cancelación extraordinaria | Superadministrador, sin solicitud ni límite de fecha; vista de impacto, motivo y confirmación. Solo cancela la sanción elegida. Los descendientes de su cadena bajan un nivel y se reconstruyen sus vínculos. |
| Originales y ajustes | Se preservan documento, fecha y autor originales. Se conserva la tipificación original y cada cambio queda auditado. El documento se marca para revisar su correspondencia con la nueva tipificación; no se inventa ni reemite un memorándum. |
| Relevo | Exclusividad de administrador de unidad, coordinada entre todas las vías de alta/edición/relevo. Saliente bloqueado y entrante pendiente hasta completar Auth. El estado pendiente reserva la unidad y permite reintentar. |
| Notificaciones | Dentro de la app, por solicitante y por unidad; lectura individual. No se envía correo. La autorización se vuelve a comprobar al consultar o marcar. |
| Auditoría | Dos informes de superadministrador: registros de sanciones; cancelaciones, solicitudes y ajustes. Filtros mensuales/unidad, agrupaciones, impresión y CSV protegido contra fórmulas. |
| Estadísticas | Solo sanciones vigentes en los totales operativos. El historial conserva las sin efecto, por separado. Las rebajas extraordinarias cambian la clasificación actual sin crear una sanción nueva. |

## Regla extraordinaria aprobada durante la implementación

La decisión posterior del usuario sustituye P01 del plan inicial. No se cancela toda la cadena ni se envía automáticamente a revisión como procedimiento ordinario:

```text
Antes:  A = Art. 9 inc. X → B = Art. 10 inc. 1 → C = Art. 11 inc. 1
Cancelar A: A sin efecto; B = Art. 9 inc. X; C = Art. 10 inc. 1 con origen B.
Cancelar B: B sin efecto; C = Art. 10 inc. 1 con origen A.
Cancelar C: C sin efecto; A y B conservan su tipificación.
```

Se muestran los cambios antes de confirmar. La confirmación incluye una huella del estado consultado: si cambia la cadena, se exige revisar nuevamente. Operación atómica para las cadenas ordinarias; las independientes no se modifican. Una cadena cíclica, incompleta, con un escalón faltante o excepcionalmente extensa (más de 80 descendientes) se bloquea explícitamente para no inventar relaciones ni aplicar ajustes parciales.

## Roles y alcance

- `operador_unidad`: consulta de su unidad; no registra ni crea solicitudes.
- `admin_unidad`: registro en su unidad y solicitud solo sobre su propia autoría dentro del plazo.
- `visor_dpto`: conserva consulta departamental, historial global autorizado y estadísticas; no escribe sanciones.
- `admin_dpto`: registro para distintas unidades, facultades administrativas previas restringidas, resolución de solicitudes y cancelación directa propia dentro del plazo.
- `super_admin`: capacidades generales y extraordinarias; acceso exclusivo a los nuevos informes de auditoría.

La búsqueda global para registrar y la consulta de antecedentes son operaciones distintas del historial general por policía. Tras la aprobación adicional del27/10, la vista explícita global está permitida a `admin_dpto`, `visor_dpto` y `super_admin`; Personal abre el historial departamental o de unidad según la selección. Ver [plan aplicado de Personal e historial](PLAN_PERSONAL_HISTORIAL_2026-10-27.md). Las cuentas inactivas, sin unidad requerida, en relevo pendiente o con primer cambio de contraseña pendiente no pueden usar operaciones de negocio.

## Correcciones técnicas relacionadas

- Aislamiento del historial aun con `personalId`; perfiles de unidad sin unidad no abren consultas globales.
- Validación de catálogo en el registro y comparación semántica de tipificación con el legado.
- Autoría y plazos de solicitudes; transacciones para resolución, auditoría y notificaciones.
- Revocación de sesiones, comprobación de perfil en servidor y protección del último superadministrador/relevo de cuentas superiores.
- Cambio inicial de contraseña realizado en servidor; no basta declarar que se cambió.
- Limpieza de caché por identidad, rol y unidad; refresco de sesión ante 401/403.
- CSV con comillas y multilínea; escape de HTML al imprimir y protección de fórmulas en CSV de auditoría.
- Unicidad por CI y actualización transaccional del padrón; retiro del reinicio destructivo de personal.
- Importación histórica con vista previa no confirmable hasta completar sus filas; reintentos no sobrescriben ni resucitan sanciones anteriores.
- Dependencias actualizadas sin cambio mayor: Next.js y eslint-config-next 16.4.3, más correcciones compatibles del archivo de bloqueo.

Estos puntos no equivalen a cerrar todos los hallazgos H01–H20 en producción. La auditoría original permanece como evidencia histórica. Quedan límites de escala de consultas completas, correcciones que requieren contexto normativo y los avisos residuales de dependencias.

## Vías retiradas o sujetas a nuevo contrato

1. Mutaciones de traslado de policías: responden 410. El archivo de auditoría anterior se conserva.
2. Borrado/reinicio del padrón: responde 410; se actualiza por CI conservando identidad.
3. Reversión masiva de sanciones importadas: bloqueada; utilizar cancelación extraordinaria individual con impacto. La revisión automática rechazó convertir ese procedimiento en una cascada masiva. Se adoptó esta alternativa para no alterar en bloque cadenas históricas.
4. Integración BSFP: no se activa. El contrato nuevo exige `sancion` con sesión Firebase del registrador y confirmación, además de la autenticación de transporte existente. El contrato anterior responde 426 si se habilitara el servicio; no puede omitir las reglas del registro. Se requiere coordinar el consumidor antes de activarla; no se modificó la otra app.
5. Importar reincidencias cuyo antecedente nace en el mismo lote: se muestra error en la vista previa; importar primero el antecedente y cumplir siete días. No se creó una excepción documental que el usuario no aprobó.

## Inventario real de solo lectura

Consulta del 27/10/2026 al proyecto verificado `control-disciplinario-comando`:

| Colección | Cantidad |
|---|---:|
| personal | 1.483 |
| faltas | 176 |
| users | 1 |
| solicitudes_eliminacion_falta | 0 |

En las comprobaciones implementadas: cero CI duplicados, referencias huérfanas de personal, autores ausentes, fechas de registro ausentes, unidades con administradores duplicados y cadenas inconsistentes detectadas. Esto no es una auditoría exhaustiva del contenido ni una validación normativa.

Se guardaron solo conteos y huellas: [inventario](validacion-funcional-2026-10-26/inventario-2026-10-27.json). No se exportó el padrón ni se escribieron datos reales. El script `scripts/check-workflow-readiness.ts` exige `--read-only` y proyecto explícito coincidente con el entorno. Las huellas permiten comparar la identidad/historial estructural antes y después; no sustituyen un respaldo restaurable.

## Validación

- Diez pruebas de dominio: plazos/fronteras, autoría, bloqueo temporal, rebaja de cadena, rechazo de cadenas ambiguas, CSV/HTML y mes en Bolivia.
- Dieciséis pruebas con Auth y Firestore emulados: API, aislamiento, reglas reales del emulador, confirmaciones, cancelación, vencimiento concurrente, roles, notificaciones, relevo recuperable, validación de toda la cadena e integración con sesión/confirmación.
- Cinco pruebas existentes de importación histórica conservadas.
- Chrome con usuarios ficticios: acceso, padrón sin unidad, confirmación, registro, historial móvil, solicitud, aprobación departamental, notificación a unidad y dos informes del superadministrador. Sin errores JavaScript en el recorrido observado.
- Lint y `npx tsc --noEmit`: aprobados. `npm run build` con Next.js 16.4.3: aprobado. [Compilación final](validacion-funcional-2026-10-26/build-final.txt) y [suite emulada final](validacion-funcional-2026-10-26/emulador-final.txt).

Total: 31 pruebas automatizadas (10 de dominio, 16 emuladas y 5 de importación), más el recorrido de navegador. Revisión propia del diff y de las rutas alternativas; no se presenta como revisión independiente ni como validación del despliegue nuevo.

Datos de prueba limitados al proyecto `demo-app-faltas`. Los emuladores y el servidor temporal se cierran al concluir. Capturas y resultado: [evidencia](validacion-funcional-2026-10-26/e2e.json), [confirmación](validacion-funcional-2026-10-26/confirmacion-desktop.png), [móvil](validacion-funcional-2026-10-26/historial-mobile.png), [auditoría](validacion-funcional-2026-10-26/auditoria-cancelaciones-desktop.png).

La nueva consulta de seguridad pasó de 29 paquetes afectados (dos críticos) a 13 (cero críticos, cuatro altos, ocho moderados y uno bajo). No se aplicó `npm audit fix --force`: las correcciones restantes requieren evaluar migraciones mayores o dependencias transitivas. Detalle: [npm audit final](validacion-funcional-2026-10-26/npm-audit-final-2026-10-27.json). Los conteos no son un número de ataques comprobados.

## Publicación y recuperación: trabajo preparado, no ejecutado

1. Revisar el diff y aprobar la publicación. No se realizó push, despliegue ni escritura en Firebase real.
2. Obtener respaldo restaurable en almacenamiento institucional autorizado y probar su restauración en un entorno separado. El inventario de huellas no sustituye este paso.
3. Repetir inventario justo antes del corte. Comparar con la evidencia y revisar cualquier dato nuevo o inconsistencia. No elegir responsables a desactivar por suposición.
4. No se necesita reconstruir ni borrar el padrón: el diseño es aditivo. Conservar campos de unidad antiguos como legado, IDs y snapshots; no rellenar confirmaciones antiguas como si fueran nuevas.
5. Verificar el estado de la integración en el despliegue. La configuración local la tiene deshabilitada; no se presume que el remoto sea idéntico.
6. Configurar `CRON_SECRET` como secreto de entorno. Preparar la invocación autenticada de `/api/internal/expire-requests` cada cinco minutos mediante un programador disponible. [Plantilla](../deploy/vercel-cron-pro.example.json) para planes compatibles; verificar plan antes de incorporarla a `vercel.json`. En Hobby la frecuencia admitida por Vercel es diaria, por lo que se necesita otra opción si se requiere procesamiento frecuente. No se activó facturación ni se creó un servicio externo.
7. Coordinar servidor, reglas Firestore y código de cliente. Conservar los índices existentes usados por las consultas de fecha/persona. Nuevas lecturas de solicitudes, notificaciones y auditoría usan campos simples o filtrado de servidor; probar índices remotos antes de habilitar el flujo.
8. Publicar en una ventana controlada. Los clientes anteriores no tienen confirmaciones y deben recargarse; el servidor no acepta omitirlas.
9. Comprobar con cuentas autorizadas por rol y una unidad piloto; no crear sanciones ficticias en producción. Verificar tarea periódica, notificaciones, relevo y conciliación de informes.
10. Ante fallo, restringir escrituras afectadas y conservar los registros posteriores al corte. No restaurar ciegamente un respaldo encima de sanciones nuevas ni volver a una versión que ignore confirmaciones/reclasificaciones.

Quedan fuera de esta ejecución local: respaldo/restauración reales, activación del programador, publicación y validación autenticada del despliegue modificado. Son pasos de operación sobre el servicio existente, no problemas de conexión de la aplicación.

Referencias técnicas: [transacciones Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions), [sesiones Firebase](https://firebase.google.com/docs/auth/admin/manage-sessions), [límites de Cron Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Next.js 16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3).
