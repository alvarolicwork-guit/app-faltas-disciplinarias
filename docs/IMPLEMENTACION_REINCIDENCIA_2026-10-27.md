# Aplicación del plan de reincidencia por conducta y cadena

Fecha: 27/10/2026. Estado: **implementación local comprobada, sin publicar ni migrar datos reales**. Base Git: `b141f5b7321e3f19bf4643595b5deeced511466e`, conservando el trabajo local previo. Este documento prevalece sobre las notas que describen el plan como pendiente de implementación.

**Paso posterior dispuesto por el usuario:** prueba manual local antes de publicar y verificación del despliegue antes de depurar registros de prueba. El [entorno manual preparado](PRUEBA_LOCAL_MANUAL.md) agrega iniciador y escenarios ficticios sin cambiar la lógica funcional de esta validación. Su estado/procesos se comprueban de nuevo al retomar; no equivale a conformidad del usuario ni a publicación.

El [plan detallado](reincidencia-2026-10-27/DIAGNOSTICO_Y_PLAN.md) conserva el diagnóstico original y sus 54 casos de aceptación. La ejecución de esta etapa comprende código, compatibilidad de lectura, diagnóstico real de solo lectura, ensayo de migración/restauración en emuladores, pruebas y preparación para publicación. No equivale a aprobación jurídica del catálogo ni a despliegue del código nuevo.

## 1. Comportamiento implementado

| Área | Resultado |
|---|---|
| Identidad de la conducta | Se conserva el artículo/inciso sustantivo original; 10/1 y11/1 son clasificaciones sancionadoras que pueden existir para conductas distintas del mismo policía |
| Cadena | Se comprueban referencias reales, persona, secuencia, fechas, raíz histórica, base vigente y nivel; no se decide comparando únicamente el artículo del antecedente inmediato |
| Plazo ordinario | Un único plazo de365 días desde la fecha de la sanción base de la cadena; ninguna reincidencia lo prolonga |
| Reinicio por vencimiento | Al cumplirse el plazo, se permite una nueva base9/X o10/X sustantivo de la misma conducta, con otro identificador y otro año, sin enlazarla a la cadena vencida |
| Conservación | Vencer no borra, anula ni retipifica sanciones; conserva historial y estadísticas conforme a su estado real |
| Cancelación de la raíz | Decisión posterior del usuario: si una descendiente pasa a ser base, el nuevo año se cuenta desde la fecha de esa sanción promovida, no desde la fecha de cancelación |
| Cancelación intermedia/final | Solo el registro seleccionado queda sin efecto; sus descendientes identificados bajan exactamente un escalón y se vuelven a vincular; otros episodios y conductas permanecen separados |
| Evidencia | Se conservan clasificación y fundamento al registrar, documento, autor, unidad y eventos antes/después de cada ajuste |
| Elegibilidad | Se mantienen espera de siete días desde registro del servidor, exclusión de sin efecto y bloqueo por solicitudes pendientes efectivas |
| Solicitudes | Autoría, unidad, siete días para solicitar, cinco días para resolver y motivos/notificaciones internos conservados |
| Fechas | Servidor rechaza fechas futuras o inexistentes; el día institucional se determina en America/La_Paz; el plazo de cadena usa fechas de sanción |
| Remisión | El último escalón local conserva la remisión existente a Régimen Disciplinario; no crea una sanción local12/1 |

Ejemplos admitidos para una misma persona:

```text
Conducta9/1: A9/1 → B10/1 → C11/1
Conducta9/2: X9/2 → Y10/1 → Z11/1
Conducta10/5: M10/5 → N11/1
```

Z puede registrarse aunque C ya exista: sus fundamentos son diferentes. El vencimiento de la cadenaA no afecta el plazo de X o M. Al vencer M, una nueva comisión permite otra base10/5.

Si se cancela A, B pasa a9/1, C a10/1 y ambos comparten el nuevo vencimiento calculado desde la fecha de B. La raíz históricaA se conserva para auditoría y B queda identificado como raíz vigente. Si esa renovación se superpone con otra cadena de la misma conducta, se detiene el reajuste para revisión de impacto; no se modifica silenciosamente el otro episodio.

## 2. Cambios coordinados

El motor común reside en `src/lib/domain/recurrence-chain.ts`. Resuelve cada arista a partir de documentos reales, identifica cadenas paralelas y episodios sucesivos, verifica que la secuencia no salte9→11 y distingue vencimiento, anulación e inconsistencia. Su diagnóstico revisa también hojas huérfanas sin descendientes y plazos superpuestos.

`src/lib/server/recurrence.ts` aplica ese motor dentro de las transacciones de registro e importación. Consulta todo el historial pertinente de la persona, sin limitarlo a100 registros, y comprueba solicitudes/espera en toda la ancestralidad utilizada. La coordinación por persona y la revalidación transaccional evitan bases duplicadas bajo concurrencia.

Se incorpora `POST /api/faltas/evaluar`. La interfaz selecciona **la conducta original**; el servidor propone sanción, antecedente y plazo. El registrador revisa esos datos antes de confirmar. La confirmación incluye la versión del estado evaluado; si los antecedentes cambian, debe revisar una propuesta actualizada. El registro final vuelve a verificar la decisión y conserva su resultado idempotente.

Los campos nuevos son aditivos: `conductaOrigen`, `cadenaId`, `raizHistoricaId`, `raizVigenteId`, `fechaInicioCadena`, `fechaVencimientoCadena`, `nivelEfectivo`, `versionReglas` y `fundamentoOriginal`. Se mantienen `faltas`, `personalId`, las unidades históricas y las referencias existentes. El estado técnico de una sanción sin efecto sigue siendo `anulada`.

La lectura compatible en `src/lib/server/chain-views.ts` reconstruye datos demostrables de registros antiguos sin escribirlos. Las discrepancias se muestran como revisión necesaria; no se completan antecedentes ambiguos. Esto permite consultar datos válidos sin exigir una migración inmediata.

La importación usa el mismo evaluador en vista previa y confirmación de cada fila. Las escaladas requieren `antecedente_id`; se muestran conducta, referencia y plazo. Cambiar el memorándum no permite duplicar un escalón. Se valida nuevamente al confirmar, incluso para faltas directas. Una fila incompatible con su documento se rechaza; no se convierte automáticamente en otra sanción.

Las importaciones incorporan propietario y vencimiento de su bloqueo de procesamiento. Un proceso interrumpido puede reanudarse después de vencer su reserva; otro proceso no puede apropiarse de una operación todavía vigente ni sobrescribir el estado de un nuevo propietario. El reintento no resucita filas sin efecto. Las bases recién importadas siguen sujetas a los siete días antes de poder fundamentar reincidencias.

La integración admitida continúa delegando al registro común con autenticación y confirmación; no se activó BSFP ni se modificó la otra aplicación.

La cancelación actualiza plazo, nivel y vínculos de los descendientes en la misma transacción, con auditoría de cada ajuste y notificaciones. Las solicitudes pendientes de un descendiente reajustado conservan su resumen anterior y reciben el contexto actualizado. Una hoja histórica inválida sin descendientes puede dejarse sin efecto mediante la operación extraordinaria, con motivo y auditoría, porque no requiere retipificar otros registros. Una cadena ambigua con descendientes exige revisión antes de reajustarse.

Se mantienen los dos informes de auditoría. El de sanciones muestra conducta, clasificación original y actual, fundamento y plazo. El de cancelaciones incluye resoluciones y reajustes, con cambios de fechas. Dashboard/reportes distinguen sanciones impuestas por reincidencia, personas e intentos bloqueados; el desglose por conducta excluye los registros que requieren revisión y lo informa expresamente. La unidad conserva su historial al relevar a un registrador.

## 3. Diagnóstico real, sin mutaciones

Se ejecutó `scripts/preview-chain-migration.ts --read-only` contra el proyecto configurado `control-disciplinario-comando`. El resumen muestra:

| Comprobación | Resultado |
|---|---:|
| Sanciones leídas |176|
| Registros con enriquecimiento aditivo preparable |171|
| Personas con ese enriquecimiento preparable |149|
| Registros marcados para revisión |5|
| Marcados por plazos superpuestos de una conducta |2|
| Marcados por bifurcación de cadena |3|

Son cinco **registros señalados**, no una afirmación de cinco personas o cinco cadenas diferentes. No se exportó un manifiesto real, ni nombres, CI o documentos personales a las evidencias; no se modificó Firestore. El informe no elige cuál registro de un conflicto es el correcto. La resolución requiere revisión documental por la autoridad correspondiente; la nueva interfaz de auditoría muestra la causa y conserva las operaciones extraordinarias autorizadas.

## 4. Migración y recuperabilidad

`scripts/preview-chain-migration.ts` solo lee y prepara un diagnóstico. Exige `--read-only` y coincidencia explícita del proyecto. Guardar un manifiesto requiere un parámetro específico; no se guardó el de producción.

`src/lib/server/chain-migration.ts` prepara modificaciones exclusivamente aditivas de los campos de cadena para personas sin inconsistencias. No cambia artículos, incisos, fechas de sanción, unidades, autores, documentos ni estados. Las huellas detectan cambios desde la preparación. Se ensayaron aplicación, segunda preparación sin cambios y restauración exacta de los campos previos con datos ficticios.

La aplicación/restauración implementadas en ese módulo **solo aceptan el emulador local demo-app-faltas**. Una restauración rechaza operar si hubo cambios posteriores, para evitar sobreescribirlos. No constituye una herramienta de migración real ya autorizada: esa etapa requiere respaldo restaurable, manifiesto revisado, conciliación de los conflictos y autorización operativa.

Antes de editar se guardó un respaldo de código en el workspace padre: `.ai/backups/antes-motor-reincidencia-20261027-085530.zip`. Es respaldo del código local previo, no de los datos de Firebase.

## 5. Validación ejecutada

| Verificación | Resultado y alcance |
|---|---|
| Dominio/importación |48 pruebas aprobadas, cero fallidas; incluye plazos, cadenas paralelas, promoción de base, episodios independientes, importación explícita y160 registros sin truncamiento |
| Servidor/Auth/Firestore |30 pruebas aprobadas, cero fallidas, proyecto demo local; incluye roles, reglas, carreras, confirmación obsoleta, solicitudes, cancelación, auditoría, importación histórica y recuperación de lotes |
| Navegador |12 comprobaciones aprobadas con Chrome y datos ficticios; cero errores JavaScript observados |
| Interfaz específica |11/1 de conducta9/2 registrado aunque ya existe11/1 de9/1; nueva base10/5 tras vencer su cadena; cambio rápido de selección sin adoptar la respuesta anterior |
| Migración/restauración |Ensayo en emulador; idempotencia y restauración exacta, rechazo ante operaciones posteriores |
| TypeScript |Sin errores |
| ESLint |Sin errores ni advertencias; se excluyen los artefactos generados `.next-demo` igual que los de `.next` |
| Build |`npm run build` aprobado con Next.js16.4.3/Webpack, tipos, generación y trazas de producción |
| Revisión local |Referencias documentales, diff y puertos de prueba revisados; no implica certificación del despliegue |

Evidencias en [validación de reincidencia](validacion-reincidencia-2026-10-27/resultado-final.json), [dominio](validacion-reincidencia-2026-10-27/dominio-final.txt), [servidor](validacion-reincidencia-2026-10-27/emulador-aprobado.txt), [build](validacion-reincidencia-2026-10-27/build-aprobado.txt) y [navegador](validacion-reincidencia-2026-10-27/e2e.json). Capturas: [confirmación](validacion-reincidencia-2026-10-27/confirmacion-desktop.png), [reincidencia de9/2](validacion-reincidencia-2026-10-27/reincidencia-conducta-9-2.png) e [historial móvil](validacion-reincidencia-2026-10-27/historial-mobile.png).

El build inicial con Turbopack falló al iniciar el proceso de transformación de CSS, incluso fuera del entorno restringido. Se usó la alternativa Webpack soportada por la CLI instalada y ya utilizada en desarrollo; el script de build quedó explícito. La compilación final necesitó acceso a las fuentes externas configuradas. Las pruebas visuales tienen un directorio `.next-demo` separado para evitar compartir archivos de compilación con el desarrollo normal. Los intentos iniciales fallidos conservados como logs/capturas no son la evidencia de aceptación final.

## 6. Cobertura del plan y límites precisos

| Casos del plan | Evidencia principal |
|---|---|
| A01–A09, A15–A20, A45–A48, A52 |Dominio; casos centrales también por API y navegador |
| A10–A14, A21–A25, A38, A41, A49, A51 |Dominio/servidor, pruebas previas de ámbito/roles y nuevas carreras/confirmaciones |
| A26–A29, A50 |Vista previa/importación y confirmación con Firestore emulado, reintento y recuperación de reserva vencida |
| A30–A37, A53–A54 |Rebaja, cancelaciones sucesivas, promoción10/X, plazo nuevo desde la base promovida e integridad de otras cadenas |
| A39–A40 |Contadores antes/después de intento bloqueado e informe con clasificación original/actual y fechas de ajuste |
| A42 |Selección funcional con160 antecedentes sin truncamiento; no es una prueba de carga/costo de producción |
| A43 |Migración/restauración en emulador; respaldo/restauración real y corte operativo pendientes |
| A44 |Móvil y selección rápida comprobados; no se certifica accesibilidad completa con lector de pantalla y teclado |

Los78 tests no significan que se hayan ejecutado78 operaciones reales ni que cada uno de los54 casos sea un test separado. El navegador agrega recorridos de integración; las pruebas locales no certifican reglas, versión o comportamiento del despliegue remoto.

La inserción retroactiva de una conducta con registros posteriores se rechaza de forma conservadora para exigir revisión de impacto. No se incorporó un procedimiento automático para retipificar expedientes posteriores. Tampoco se habilitó la reversión masiva de importaciones: permanece la operación individual revisable.

El cambio no resuelve automáticamente los cinco conflictos de datos existentes. Mientras no se revisen, la evaluación se detiene cuando no puede demostrar una cadena coherente. Los demás datos verificables tienen lectura compatible, pero una migración real todavía no se ejecutó.

## 7. Estado por fase y siguiente corte operativo

| Fase | Estado |
|---|---|
|0 Contrato/protección local|Aplicados; decisión de promoción temporal incorporada; respaldo de código previo |
|1 Diagnóstico/compatibilidad|Aplicados; lectura real resumida y cinco registros para revisión individual |
|2 Motor común|Implementado y probado |
|3 Registro/confirmación|Implementado y probado localmente |
|4 Otras entradas|Implementadas y probadas; integración externa conservada deshabilitada en el entorno probado |
|5 Cancelación/reconstrucción|Implementadas; revisión requerida ante ramificación o solapamiento que impida un ajuste inequívoco |
|6 Interfaz/informes|Implementados y verificados dentro del alcance indicado |
|7 Migración/recuperabilidad|Herramientas y ensayo demo preparados; migración/restauración real pendientes |
|8 Validación/revisión|Completadas localmente con los límites de la sección6 |
|9 Publicación|Pendiente de autorización y del procedimiento operativo sobre datos reales |

Antes del corte real: revisar los cinco conflictos documentales, preparar y comprobar respaldo/restauración de datos, acordar el manifiesto y el mecanismo de corte, publicar la versión compatible y configurar/verificar el programador del nuevo flujo de vencimientos. No se efectuó push, publicación Vercel, despliegue de reglas/índices ni activación BSFP durante esta aplicación.

## 8. Comandos reproducibles

```powershell
npm run test:domain
npm run test:imports
firebase emulators:exec --only "firestore,auth" --project demo-app-faltas --config firebase.test.json "node --import tsx --test --test-concurrency=1 src/lib/server/workflow.emulator.test.ts src/lib/server/recurrence.emulator.test.ts"
firebase emulators:exec --only "firestore,auth" --project demo-app-faltas --config firebase.test.json "node --import tsx scripts/e2e-functional.mjs"
npm run lint
npx tsc --noEmit
npm run build
```

Los comandos de emulador exigen proyecto demo y puertos locales en los scripts. El diagnóstico real de solo lectura es una operación separada, no un paso de los tests. No ejecutar los antiguos scripts de limpieza como parte de esta validación.
