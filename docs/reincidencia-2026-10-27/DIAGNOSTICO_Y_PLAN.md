# Reincidencia por conducta original: diagnóstico y plan de corrección

Fecha: 27/10/2026. Base Git: `b141f5b7321e3f19bf4643595b5deeced511466e`, con el diff local de la implementación funcional posterior.

**Aplicación posterior autorizada:** el plan ya tiene [implementación local, pruebas y límites de despliegue](../IMPLEMENTACION_REINCIDENCIA_2026-10-27.md). Las secciones de diagnóstico conservan la evidencia anterior a corregir el código; no describen por sí solas su estado actual. Decisión adicional del usuario incorporada: al cancelar la base y promover otra sanción a base, comienza un nuevo año desde la fecha de la sanción promovida. La raíz histórica se conserva por separado.

**Actualización aprobada del plazo:** toda cadena nacida en una conducta del artículo 9 o en una conducta sustantiva del artículo 10 tiene un único plazo de un año desde la sanción original. Se mantienen los 365 días establecidos en los requisitos anteriores. Las reincidencias no renuevan ese plazo. Al cumplirse, la cadena deja de fundamentar nuevas reincidencias y una nueva comisión de la misma conducta permite registrar otra sanción base por su artículo/inciso original. Esta decisión sustituye la propuesta anterior de ventana móvil y reclasifica R03 como comportamiento esperado. La corrección pendiente del vencimiento integral se identifica como R13. Esta actualización es documental; no implementa el cambio.

**Conclusión: la implementación local solo aplica parcialmente la lógica solicitada. No está lista para publicar este flujo.** Distingue algunos primeros antecedentes y conserva vínculos, pero mezcla cadenas al comparar escalones superiores, permite transiciones incompatibles con la secuencia solicitada y mantiene reglas distintas en importación. Que las comprobaciones anteriores aprobaran no demuestra estos escenarios: faltaba cobertura de cadenas paralelas.

Este trabajo comprende revisión, reproducciones y planificación. No modifica código operativo, reglas, índices ni datos reales. La app desplegada sigue siendo un sistema operativo existente; no se verificó su versión remota en esta revisión. Los resultados siguientes corresponden al checkout local y no prueban que ya se hayan producido errores en expedientes reales.

## 1. Regla funcional que debe gobernar el cambio

La **conducta cometida** conserva su artículo/inciso original. La **tipificación sancionadora** puede agravarse por reincidencia. El **antecedente inmediato** es el registro concreto que justifica el siguiente escalón. Son tres datos diferentes.

| Conducta reiterada por una misma persona | Primera sanción | Primera reincidencia | Segunda reincidencia |
|---|---|---|---|
| Art. 9, inc. 1 | 9/1 | 10/1, conducta original 9/1 | 11/1, conducta original 9/1 |
| Art. 9, inc. 2 | 9/2 | 10/1, conducta original 9/2 | 11/1, conducta original 9/2 |
| Art. 10, inciso sustantivo X, distinto del 1 | 10/X | 11/1, conducta original 10/X | Tratamiento terminal existente, sin inventar una nueva sanción local |

Los registros 10/1 y 11/1 de distintas conductas pueden coexistir. Ni el número de sanciones de una persona, ni el artículo sancionador por sí solo, ni su unidad identifican una cadena. El inciso 1 de reincidencia no constituye una nueva conducta original autónoma.

**Vigencia única por cadena:** `fechaInicioCadena` es la fecha de la sanción original; `fechaVencimientoCadena = fechaInicioCadena + 365 días`. La cadena puede fundamentar reincidencia únicamente antes de su vencimiento y cumpliendo los demás controles. Al alcanzar esa fecha ya no se utiliza ningún escalón de esa cadena para agravar una nueva sanción, aunque el último 10/1 o 11/1 sea reciente. La nueva sanción base crea un `cadenaId` distinto y su propio plazo; no se agrega como descendiente de la cadena vencida. Cada conducta/cadena mantiene sus fechas independientes.

Ejemplo: una cadena de conducta 9/1 iniciada el 01/10/2025 vence el 01/10/2026, aunque haya registrado un 10/1 en enero y un 11/1 en septiembre de 2026. Una nueva conducta 9/1 desde el vencimiento permite otra base 9/1. Una cadena nacida en 10/5 reinicia en 10/5, nunca en 9/5 ni en el inciso 1 de reincidencia. Vencer no crea por sí mismo una nueva sanción: hace falta una nueva conducta y su registro confirmado.

El vencimiento se refiere a la aptitud de la cadena para fundamentar reincidencia. **No borra, anula ni reclasifica automáticamente sus sanciones**, ni las excluye de estadísticas históricas o vigentes por el solo transcurso del plazo. La exclusión por estado `anulada` sigue siendo un procedimiento distinto. El historial, los documentos, los autores y las unidades permanecen intactos.

La unidad de cada sanción permanece histórica. La comprobación de antecedentes es global por persona y conducta; un cambio de registrador o unidad no reinicia la reincidencia. La consulta de un antecedente para registrar no concede acceso libre a todo el expediente de otras unidades.

Se mantienen las decisiones anteriores: estado técnico `anulada`, exclusión de sanciones sin efecto, siete días desde registro antes de usar un antecedente, bloqueo por solicitud pendiente efectiva, vencimiento de solicitud a los cinco días y cancelación extraordinaria que deja sin efecto solo el registro elegido y baja un escalón sus descendientes vinculados.

Esta es una especificación informática basada en instrucciones del usuario. No constituye una certificación jurídica del catálogo ni del efecto de una reclasificación.

## 2. Evidencia y alcance de la verificación

- Inspección de dominio, registro manual, esquemas, antecedentes, importación/confirmación histórica, integración, cancelación, consulta, métricas, auditoría y pruebas existentes.
- [Reproducciones de dominio](reproducciones.ts): siete casos originalmente clasificados como defectos y dos controles positivos. Tras la aclaración, R03 es comportamiento esperado; permanecen seis defectos de esos casos. R03 replica en memoria la selección del handler. R07 usa el reconstructor real con transporte simulado. No acceden a Firebase.
- [Reproducciones de API](reproducciones-api.ts): cinco comportamientos confirmados invocando el handler real con `NextRequest`, identidad autenticada y Firestore/Auth emulados; cuatro siguen siendo defectos y R03 pasa a ser comportamiento esperado. [Resultado histórico guardado](resultado-api.json). No hay servidor HTTP ni navegador en esta prueba. R13 se sustenta en inspección de código y requiere su nueva reproducción correctiva.
- Se ejecutaron de nuevo las 15 pruebas existentes de dominio/importación: 15 aprobadas. Ese resultado confirma su alcance limitado, no la corrección de cadenas paralelas.
- [Resumen de evidencia local](resultado-local.json): huellas de seis archivos operativos auditados conservadas, enlaces del plan válidos y TypeScript sin errores después de agregar las reproducciones. No se recompiló la aplicación, ya que no se cambió su código operativo.
- No se volvió a ejecutar el E2E visual ni la suite completa de emuladores anterior: esta revisión añadió casos dirigidos a los fallos nuevos.
- No se consultaron expedientes reales en esta revisión, ni se modificó la aplicación publicada. Se requieren diagnóstico y migración específicos antes de atribuir o corregir casos históricos.

Los scripts y JSON originales se conservan como evidencia de la ejecución previa y contienen la clasificación anterior de R03. Esta actualización prevalece sobre esas etiquetas: que terminen con código 0 confirma el comportamiento observado, no la aprobación funcional de la app. No se alteraron ni se volvieron a ejecutar las reproducciones al actualizar el plan. En la futura suite, R03 debe convertirse en control positivo de reinicio permitido y R13 en rechazo de continuación de una cadena vencida.

## 3. Hallazgos priorizados

### R01 — Alta: cadenas diferentes se confunden al llegar a 11/1

**Ubicación:** `src/lib/domain/disciplinary-recidivism.ts:114` y `src/app/api/faltas/route.ts:269`.

`isReincidenciaOrigenMatch` compara artículo/inciso del antecedente inmediato. No compara su ID ni recorre hasta la conducta original. Cuando dos cadenas provienen de 9/1 y 9/2, sus antecedentes inmediatos pasan a ser 10/1 y parecen iguales.

**Reproducción real emulada:** existe A: 9/1→10/1→11/1 y B: 9/2→10/1. Al registrar 11/1 de B, la API responde 409 y propone 12/1 usando el 11/1 de A. El fundamento y la remisión sugerida pertenecen a otra conducta.

**Corrección:** identidad canónica de conducta + cadena + antecedente concreto; calcular el nivel solo en esa cadena. Nunca resolverlo únicamente añadiendo el ID a la comparación actual: también deben corregirse la búsqueda desde la conducta base y el tratamiento temporal.

### R02 — Alta: la búsqueda desde la conducta original pierde escalones posteriores

**Ubicación:** `src/app/api/faltas/route.ts:328`.

Para una nueva conducta 9/1, el filtro encuentra 10/1 cuyo origen inmediato es 9/1; no encuentra su 11/1, cuyo origen inmediato es 10/1. En la cadena A anterior, la API propone otro 11/1 referenciado al 10/1, aunque ya existe el 11/1. Puede provocar confirmaciones repetidas y propuestas contradictorias antes de llegar al resultado terminal.

**Corrección:** resolver la cadena completa antes de proponer la sanción y seleccionar el extremo vigente que corresponda a esa conducta y fecha.

### R03 — Reclasificado: reiniciar la base al vencer la raíz es correcto

**Ubicación:** `src/app/api/faltas/route.ts:313` y `:315`.

La búsqueda de reincidencias solo continúa si encuentra una sanción con la tipificación base dentro de la ventana. Ejemplo probado: 9/1 del 01/10/2025 y su 10/1 del 01/01/2026; ante otra conducta 9/1 el 27/10/2026, la API registra un nuevo 9/1 (201). La primera sanción quedó fuera de la ventana, pero la repetición de esa misma conducta no.

**Decisión posterior del usuario:** ese registro de nueva base es correcto porque venció el plazo de la sanción que inició la cadena. Se retira la recomendación de impedirlo. Debe preservarse este resultado, asignar una nueva identidad de cadena y comprobar que también se permita para conductas originadas en el artículo 10. La deficiencia es la posible continuación de la cadena antigua desde una escalada reciente: R13.

### R04 — Alta: registro y cancelación admiten secuencias incompatibles

**Ubicación:** `src/lib/domain/disciplinary-recidivism.ts:42`, `src/lib/domain/schemas.ts:81`, `src/lib/domain/sanction-policy.ts:89`.

El registro acepta 11/1 apoyado directamente en 9/X. Se reprodujo con respuesta 201. En cambio, `lowerDependentChain` exige escalones consecutivos y rechaza rebajar esa cadena cuando se cancela la base.

**Corrección:** para nuevos registros seguir la secuencia solicitada 9/X→10/1→11/1. La repetición de una conducta sustantiva 10/X llega a 11/1. Los históricos 9→11 deben clasificarse para revisión; no insertar un 10 ficticio ni cambiar automáticamente documentos antiguos. El texto actual del catálogo menciona ambos artículos: conservarlo como texto y separar la transición funcional, sin presentarlo como interpretación jurídica validada.

### R05 — Alta: la importación puede crear dos escalones iguales desde la misma base

**Ubicación:** `src/lib/imports/historical-sanctions.ts:518` y `src/app/api/imports/faltas/[id]/confirm/route.ts:257`.

La selección automática busca artículos compatibles, no una conducta explícita con cadena. Dos filas 10/1 con distintos documentos y una sola base 9/1 quedan válidas y apuntan a la misma base; se reprodujo con la función real. Si existen varios posibles antecedentes, rechaza por ambigüedad, pero no permite declarar de forma suficiente la conducta/antecedente en el contrato actual.

La confirmación comprueba identidad, `importKey` y estado de los antecedentes; no ejecuta toda la resolución de reincidencia dentro de cada transacción. El bloqueo compartido de persona reduce carreras, pero no sustituye una validación que no existe. Una sanción nueva entre vista previa y confirmación puede dejar obsoleta la decisión, aun con una clave de importación diferente.

**Corrección:** importación y registro deben utilizar el mismo evaluador. Exigir origen explícito para escaladas; comprobarlo al confirmar. Rechazar una fila histórica incompatible, sin modificar silenciosamente la sanción que figura en su documento.

### R06 — Alta: una fecha futura altera la selección de antecedentes

**Ubicación:** `src/lib/domain/schemas.ts:27`, `src/lib/faltas/reincidencia.ts:7`, `src/app/api/faltas/route.ts:181`.

La API manual acepta una sanción del 01/01/2099, comprobada con 201. El esquema valida formato y el parser valida fecha existente, pero no fecha máxima. Al desplazar la ventana puede ignorar antecedentes reales. El importador sí rechaza fechas futuras.

**Corrección:** calendario válido, fecha no futura con criterio institucional explícito, fecha base del cálculo clara, y reglas uniformes entre vías. No mezclar fecha de sanción con hora de registro del servidor.

### R07 — Alta: reconstruir el historial no comprueba toda su coherencia

**Ubicación:** `src/lib/server/operations.ts:58`.

`recurrenceSnapshot` protege identidad, ciclos, estado, espera y solicitudes, pero no valida todas las transiciones ni la cronología entre cada pareja histórica. Con documentos ficticios 10/2→10/1, el reconstructor devuelve una instantánea sin rechazar el salto incompatible. Esto no demuestra que existan tales documentos en producción.

**Corrección:** validar el grafo completo con el mismo contrato que registro/cancelación; clasificar las discrepancias entre referencias reales y copias históricas. No deducir una conducta faltante a partir de una coincidencia ambigua.

### R08 — Media: el selector permite elegir antecedentes no utilizables

**Ubicación:** `src/app/api/antecedentes/route.ts:14`, `src/components/registro/registro-page.tsx:242` y `:576`.

La respuesta incluye `disponible` y `bloqueo`, pero el selector filtra solo por artículo. Omite esos estados y no solicita evaluación para la fecha del formulario. Además, el endpoint evalúa cada fila, no la validez completa de sus antecesores. Un origen puede presentarse seleccionable y fallar recién al confirmar.

**Corrección:** consulta por conducta y fecha, con estado calculado por el servidor; mostrar causas de bloqueo, disponibilidad y último escalón. Mantener validación final transaccional aunque la vista previa diga que es utilizable.

### R09 — Media: falta un indicador de reincidencias realmente registradas por conducta

**Ubicación:** `src/app/api/dashboard/route.ts:40`, `src/app/api/reportes/route.ts:42`.

La propiedad `reincidencias` contiene conteos de `reincidencias_bloqueadas`. La interfaz actual sí los rotula como bloqueados: no afirmar que esa etiqueta sea incorrecta. Sin embargo, ese dato cuenta intentos; repetir una operación bloqueada puede aumentarlo. No indica cuántas sanciones por reincidencia se impusieron ni su conducta original.

**Corrección propuesta:** conservar el indicador operativo con nombre inequívoco y añadir conteo separado de sanciones escaladas vigentes y desglose por conducta original. Mantener las estadísticas personales acordadas y evitar contar a una misma persona como varias personas por tener varias cadenas.

### R10 — Media: auditoría de registro muestra clasificación actual como si fuera la original

**Ubicación:** `src/app/api/auditoria/route.ts:22` y `src/lib/server/cancellations.ts:129`.

Tras una rebaja, la auditoría tipo `sanciones` toma `articulo`, `inciso` y antecedente del documento actual, asociados a la fecha original de registro. La tipificación original y los eventos de ajuste sí se conservan en otros campos/logs, pero no se muestran en esa fila. El informe de ajustes contiene antes/después; la pérdida es de claridad del informe, no borrado demostrado de la evidencia.

**Corrección:** columnas diferenciadas de conducta original, sanción originalmente impuesta, sanción efectiva actual, antecedente vigente y referencia al ajuste. Mantener los dos informes separados solicitados.

### R11 — Alta, riesgo por inspección: inserciones retroactivas pueden dejar incoherente lo posterior

**Ubicación:** `src/app/api/faltas/route.ts:183`, `src/app/api/imports/faltas/[id]/confirm/route.ts:257`.

Las consultas miran hacia atrás desde la fecha ingresada; no resuelven el impacto sobre sanciones ya registradas con fecha posterior. No se reprodujo aquí una operación completa de inserción retroactiva. El diseño debe tratarla antes de unificar el motor; cambiar solo la comparación de origen no la corrige.

**Corrección propuesta:** simulación de impacto y rechazo de inserciones incompatibles sin revisión explícita. Nunca recalificar silenciosamente registros posteriores al importar un antecedente atrasado.

### R12 — Media: el diagnóstico anterior no certifica cada registro de cadena

**Ubicación:** `scripts/check-workflow-readiness.ts:32`, `src/lib/domain/sanction-policy.ts:74` y suites existentes.

El inventario usa `lowerDependentChain` para detectar cadenas inválidas. Esa función valida ancestralidad únicamente cuando hay descendientes del registro seleccionado: una escalada huérfana aislada puede no disparar esa validación. Tampoco comprueba la correcta separación semántica de conductas ni detecta por sí sola todas las bifurcaciones.

Los conteos previos sin incidencias son válidos para aquellas comprobaciones, pero insuficientes como certificación de reincidencia. La suite anterior tampoco incluía dos conductas del mismo policía alcanzando 10/1 y 11/1 independientemente.

**Corrección:** validador explícito de cada nodo/arista, ciclos, raíces, niveles, cronología y ramas; nuevas pruebas de aceptación de la sección 8.

### R13 — Alta, confirmado por inspección: no se impone el vencimiento de la raíz a toda la cadena

**Ubicación:** `src/app/api/faltas/route.ts:252`, `src/lib/server/operations.ts:59`, `src/lib/faltas/reincidencia.ts:24`.

El registro escalado comprueba que el antecedente inmediato esté dentro de los 365 días anteriores a la fecha nueva. El reconstructor recorre sus antecesores, pero no exige que la fecha nueva esté dentro del plazo de la sanción original. Por tanto, una escalada reciente puede seguir sirviendo de fundamento aunque haya vencido la raíz. La app tampoco conserva una fecha única de vencimiento que rija todos los escalones.

**Corrección:** resolver la raíz temporal, calcular el vencimiento fijo y comprobarlo en todas las entradas y confirmaciones. Después de vencer, rechazar cualquier nuevo vínculo con esa cadena y proponer la sanción base de la misma conducta dentro de una cadena nueva. Mantener la cadena anterior solo como historia. La fecha del antecedente inmediato nunca sustituye la fecha de inicio de la cadena. Esta actualización no ejecutó una nueva prueba de API de R13; la aceptación se define en A45–A51.

## 4. Controles existentes que se deben preservar

- Búsqueda de antecedentes por `personalId` a nivel general, sin depender de asignar policías a una unidad.
- Identidad y estado comprobados en servidor; referencias concretas y copias del fundamento.
- Espera de siete días basada en registro del servidor, solicitudes pendientes y vencimiento efectivo.
- Confirmación con identidad, contenido, vigencia y resultado idempotente; revalidación del usuario dentro de la operación.
- Coordinación de escrituras por persona, anulación lógica y auditoría en la misma transacción en los flujos nuevos.
- Rebaja limitada a descendientes identificados por referencias: el control positivo C01 conserva intacta otra cadena correctamente formada.
- Historial de unidad, motivos, autoría, documentos originales y avisos internos.

## 5. Política temporal aprobada y casos excepcionales pendientes

El inicio y vencimiento de la cadena ya están decididos; no deben volver a tratarse como una propuesta. Los casos excepcionales todavía no resueltos se identifican expresamente:

| Punto | Estado comprobado | Propuesta concreta |
|---|---|---|
| Duración | Los requisitos anteriores establecen 365 días; el usuario aclara que rigen desde la primera sanción | Plazo único de 365 días desde la fecha de sanción original, sin renovación; no año enero-diciembre. Probar años bisiestos usando esa duración |
| Inicio y vencimiento | El registro escalado actualmente compara el antecedente inmediato | Aprobado: la raíz determina el vencimiento de toda la cadena. Fecha nueva menor al vencimiento: evaluar escalada; fecha igual o posterior: la cadena antigua no puede fundamentarla y procede evaluar una nueva base |
| Origen de nueva cadena | Las conductas pueden nacer en9/X o10/X sustantivo | Aprobado: reiniciar en el artículo/inciso original, crear otra identidad y otro plazo, sin enlaces sancionadores a la cadena vencida |
| Efectos sobre historial y estadísticas | Vencimiento y anulación son conceptos distintos | Conservar sanciones, unidades, documentos y estado; identificar «plazo de reincidencia vencido» separado de «sin efecto». No eliminar las sanciones de totales solo por vencer la cadena |
| Hecho repetido durante los primeros siete días | El acuerdo impide usar la sanción como antecedente, y el código bloquea repetir la base | Mantener bloqueo y mostrar fecha de disponibilidad. Si se necesita conservar el hecho mientras tanto, diseñar un borrador explícito sin efectos sancionadores; no crearlo por inferencia ni registrarlo como otra base |
| Fecha del hecho o fecha de sanción | Solo `fechaSancion` participa actualmente en el cálculo | Mantenerla hasta confirmar si debe incorporarse una fecha del hecho independiente; no cambiar el reloj jurídico por decisión técnica |
| Dos actuaciones con la misma fecha | Se almacenan fechas sin hora del hecho; la consulta incluye el mismo día | No inventar orden causal usando IDs. Usar referencia documental/orden verificable; bloquear cuando no se pueda determinar el fundamento |
| Registro histórico que altera lo posterior | No hay resolución integral de impacto | Revisión explícita con vista de impacto; no retipificar automáticamente ni descartar silenciosamente el antecedente |
| Cancelación extraordinaria de la raíz y fecha de vencimiento | El usuario resolvió expresamente esta excepción durante la implementación | Aprobado: nuevo año desde la fecha de la sanción promovida a base. Guardar raíz histórica y raíz vigente diferentes; conservar antes/después del plazo. No contar el año desde el día de cancelación ni modificar automáticamente otro episodio si aparece un solapamiento |

No hace falta volver a consultar los roles, la separación por artículo/inciso, el plazo fijo desde la raíz ni la rebaja ya acordados. Solo las excepciones expresamente señaladas permanecen como propuestas; ninguna permite que una reincidencia ordinaria renueve el año.

## 6. Modelo de datos propuesto, compatible con el historial

Se conserva `faltas` como colección única de sanciones y los campos existentes para compatibilidad. No crear bases separadas por conducta o unidad. Los nombres nuevos son propuesta de implementación:

| Campo/concepto | Finalidad y garantía |
|---|---|
| `conductaOrigen.articuloNumero`, `incisoNumero` | Conducta sustantiva que se repite, estable aunque cambie la sanción aplicada |
| `conductaOrigen.etiquetaSnapshot`, versión de catálogo | Texto consultable de esa conducta en la versión utilizada; no depender de comparar descripciones libres |
| `articulo`, `inciso` y códigos de sanción efectiva | Tipificación aplicada actualmente; preserva contratos de consulta mientras migran consumidores |
| `cadenaId` | Identificador estable de una secuencia concreta; no cambia si se cancela su primer registro. Separa episodios temporales de la misma conducta cuando corresponda |
| `raizHistoricaId` | Primera procedencia conocida, incluso sin efecto; no equivale a antecedente válido |
| `raizVigenteId` | Primera sanción efectiva de la cadena; si se cancela y se promueve otra, esta nueva base determina el año conforme a la decisión posterior aprobada |
| `fechaInicioCadena`, `fechaVencimientoCadena` | Anclaje y plazo único derivados de la sanción original; compartidos por todos los escalones y calculados en servidor, nunca prorrogados por una reincidencia |
| Vigencia temporal de cadena | Estado derivado de las fechas: dentro del plazo o vencida para reincidencia. Independiente de `faltas.estado`; no convertir registros a `anulada` por vencimiento |
| `antecedenteInmediatoId` / `reincidenciaOrigen.faltaReferenciaId` | Sanción vigente que justifica este escalón; ambos deben mantenerse coherentes durante compatibilidad |
| `nivelEfectivo` | 0 para base, 1 para primera reincidencia, 2 para segunda; relativo a la conducta original, no derivado solo de 10/1 o 11/1 |
| `versionReglas`, `versionCadena` | Versión de política y de estado evaluado para detectar confirmaciones obsoletas |
| `fundamentoSnapshot` y clasificación al registrar | Evidencia original inmutable; separada de la proyección vigente y de las referencias reconstruidas |
| Estado de revisión histórica | Verificable, ambiguo, incompleto o incompatible; nunca completar datos faltantes inventando vínculos |

Identidad de búsqueda: `personalId + conducta original`. Identidad de secuencia: `cadenaId`, referencias concretas y plazo fijo desde su raíz. Debe haber un único extremo coherente por secuencia. Antes del vencimiento no se puede crear otra cadena para eludir antecedentes; desde el vencimiento debe permitirse una nueva base con otro `cadenaId`. Pueden coexistir históricamente varias cadenas de la misma conducta; sus fechas y vínculos nunca se mezclan.

La cancelación no cambia la conducta cometida: un 10/1 originado en 9/2 que se rebaja pasa a 9/2. Un 11/1 originado en 10/5 pasa a 10/5 si su base es la cancelada. Los documentos emitidos mantienen número, autor y fecha; su correspondencia con la nueva clasificación requiere constancia de ajuste.

## 7. Plan de ejecución por fases y condiciones de cierre

### Fase 0 — Fijar contrato y proteger la versión de trabajo

1. Fijar el plazo único aprobado desde la raíz; resolver únicamente las excepciones pendientes de la sección 5 sin reabrir decisiones aprobadas.
2. Registrar versión de reglas, ejemplos de cada transición y diferencias respecto del catálogo/programación anterior.
3. Identificar el diff ya existente y conservarlo; preparar respaldo recuperable del checkout antes de editar.
4. Delimitar registro actual, histórico, importación, integración, cancelación e informes; mantener producción fuera de las pruebas.

**Salida:** especificación de estados/transiciones y ejemplos aprobados. Dependencia para Fases 1–3. No requiere despliegue.

### Fase 1 — Diagnóstico completo de datos y diseño de compatibilidad

1. Implementar un analizador de solo lectura por persona: validar cada nodo, referencia, conducta original, estado, orden y nivel.
2. Detectar raíces ausentes, ciclos, cruces entre personas/conductas, bifurcaciones, saltos, fechas no verificables, registros enlazados después del vencimiento de su raíz y discrepancias entre snapshot y documento. Clasificar estos últimos para revisión, sin corregirlos automáticamente.
3. Clasificar resultados: reconstrucción determinista; origen ambiguo; inconsistencia estructural; revisión temporal/documental necesaria.
4. Generar un inventario sin información personal en logs y una propuesta de transformación revisable, con huellas antes/después y conteos.
5. Diseñar lectura compatible de legados mientras se agregan los campos nuevos. No confiar en una raíz deducida solo del artículo sancionador.

**Salida:** mapa de compatibilidad y casos pendientes; ninguna escritura real. El inventario anterior no sustituye esta fase.

### Fase 2 — Motor único de reincidencia y pruebas de dominio

1. Normalizar códigos válidos de artículo/inciso sin alterar las etiquetas históricas.
2. Resolver conducta original y cadena desde documentos reales; contrastar snapshots, detectar corrupción y no inferir causas ambiguas.
3. Resolver la sanción original de cada cadena de la conducta y calcular su plazo fijo. No usar una escalada reciente de raíz vencida como antecedente elegible.
4. Separar pertenencia histórica de elegibilidad temporal: desde el vencimiento toda la cadena es inelegible para agravar un nuevo registro, pero se conserva para consulta. Evaluar entonces una nueva base9/X o10/X con nueva identidad y plazo.
5. Calcular estado: primera sanción, nueva base tras vencimiento, escalada procedente dentro del plazo original, espera de siete días, solicitud pendiente, revisión necesaria o remisión terminal existente. Si la cadena venció, no sugerir remisión por su último escalón.
6. Definir transiciones explícitas de 9/X, 10/X sustantivo y las conductas sustantivas de 11 ya soportadas, preservando remisión 12/1 sin abrir nuevos registros locales terminales.
7. Producir resultado explicable: conducta, antecedente, cadena, nivel, clasificación, causa y fecha de bloqueo, versión de decisión.
8. Crear pruebas correctivas para R01, R02, R04–R07 y R13 antes de modificar las rutas. Convertir R03 en control positivo: una base nueva tras vencer la raíz debe seguir siendo admisible. Las reproducciones de defectos restantes deben pasar a fallar cuando desaparezca el defecto.

**Salida:** evaluador determinista compartido, sin dependencias de UI. Aceptación: cadenas paralelas independientes, transiciones uniformes y límites temporales precisos.

### Fase 3 — Registro, consulta de antecedentes y confirmación atómica

1. La entrada principal identifica persona, conducta cometida, fecha, unidad y documento/motivo. El servidor determina la sanción aplicable.
2. Reemplazar búsquedas divergentes de `matching`, `duplicateEscalada` y `escaladasMismoOrigen` por el evaluador único.
3. Devolver vista previa de decisión antes de confirmar; el usuario revisa conducta original y sanción resultante como datos distintos.
4. Vincular la confirmación al contenido, raíz, fecha de vencimiento y versión evaluados; si aparece otra sanción/solicitud, cambia la fecha de la actuación o cambia la cadena, exigir revisión de la propuesta actualizada. Revalidar al confirmar; para el registro actual no reutilizar una previsualización temporalmente obsoleta.
5. Dentro de una transacción: verificar usuario/rol/unidad, persona, fechas, referencias, solicitudes y plazo de la raíz; luego registrar sanción, evidencia, auditoría y resultado idempotente. Si corresponde reinicio, crear la nueva cadena y verificar que ningún escritor concurrente haya creado ya otra base para ese episodio.
6. Conservar coordinación por persona. Reintentos deben reevaluar tras conflictos; dos confirmaciones simultáneas nunca generan dos hijos equivalentes ni saltan la espera de siete días.
7. Verificar contratos antiguos: rechazarlos con mensaje de actualización si no permiten identificar inequívocamente la conducta. No aceptar el nivel que diga el cliente sin comprobarlo.

**Salida:** registro manual y endpoint de antecedentes coherentes, con pruebas autenticadas de roles, idempotencia y carreras.

### Fase 4 — Importación, históricos e integración

1. Añadir al contrato de importación la conducta original y referencia concreta para escaladas; mantener compatibilidad solo cuando la evidencia sea inequívoca.
2. Usar el mismo motor en vista previa y confirmación transaccional de cada fila; validar de nuevo cambios desde la vista previa. Para históricos, comprobar el plazo de la cadena en la fecha de la sanción importada, no únicamente en la fecha actual: estar hoy vencida no invalida por sí solo un registro histórico dentro de su plazo original.
3. Diferenciar duplicado documental de reincidencia: cambiar el memorándum no vuelve válida una sanción del mismo nivel/origen.
4. Rechazar filas inconsistentes con su documento, indicando causa; no convertir automáticamente un 10/1 importado en 11/1.
5. Mantener la espera de siete días para bases recién registradas/importadas mientras esa política siga aprobada; un lote no puede eludirla.
6. Detectar inserciones retroactivas con impacto; reanudar importaciones parcialmente completadas sin duplicar ni resucitar anuladas.
7. La integración admitida delega al registro común. Mantener autenticación/confirmación exigidas y probar que no tenga una ruta de validación alternativa; no activar BSFP ni modificar la otra app.

**Salida:** ninguna vía alternativa permite cadenas que el registro manual rechaza; recuperación de lotes probada.

### Fase 5 — Cancelación y reconstrucción de la cadena específica

1. La cancelación ordinaria conserva autoría, unidad, plazo de siete días y resolución de cinco días; no modifica otras cadenas.
2. Para superadministrador, enumerar por referencias todos los descendientes efectivos de la sanción elegida. No seleccionarlos por `articulo=10/11` de la persona.
3. Previsualizar antes/después: conducta, documento, unidad, nivel, antecedente anterior/nuevo y estado. Mantener hash/versionado del impacto.
4. Cancelar solo el objetivo; bajar exactamente un escalón cada descendiente y reconstruir enlaces efectivos sin cambiar la conducta original.
5. Conservar `cadenaId` y raíz histórica; diferenciar el nuevo primer registro vigente. Guardar evento de cada ajuste y evidencia original intacta. Aplicar la decisión aprobada: si se cancela la base vigente, el año se cuenta desde la fecha de la sanción promovida a base. Si esa renovación se superpone con otro episodio de la misma conducta, exigir revisión de impacto; no modificar silenciosamente ese episodio independiente.
6. Probar cancelaciones sucesivas y nueva reincidencia después del reajuste. Bloquear ambigüedades, ramas o saltos históricos hasta revisión específica, sin inventar documentos.
7. Resolver concurrentemente solicitudes del objetivo; definir estado de solicitudes pendientes de descendientes reajustados y actualizar su contexto, sin notificaciones contradictorias.
8. Notificar al autor/responsable actual de cada unidad afectada. Respetar el límite atómico existente y definir mantenimiento supervisado para cadenas excepcionales; no hacer cambios parciales.

**Salida:** A→B→C se reajusta conforme a la selección; X→Y→Z de otra conducta queda idéntica, comprobado por contenido y referencias.

### Fase 6 — Interfaz, historial, estadísticas y dos auditorías

1. El formulario inicia por la conducta que ocurrió. Presenta «conducta original», «sanción aplicable» y «antecedente utilizado» con ejemplos claros.
2. Mostrar las cadenas de una persona separadas por artículo/inciso de conducta y por episodio temporal, con fecha original y vencimiento. Evitar opciones indistinguibles llamadas solo10/1 o11/1. Diferenciar cadena dentro del plazo, plazo vencido y sanción sin efecto.
3. Deshabilitar selección de antecedentes bloqueados o de cadena vencida para la fecha evaluada, mostrar motivo y fecha de disponibilidad/vencimiento; actualizar evaluación al cambiar persona/conducta/fecha. Al vencer, proponer nueva base del artículo/inciso original sin eliminar la cadena previa del historial.
4. Presentar historia completa de la cadena autorizada, unidades y documentos; separar clasificación original y vigente tras ajustes.
5. Conservar estadísticas personales y totales vigentes/sin efecto. Si se incorpora el desglose de reincidencia, contar sanciones reales, personas únicas y cadenas por separado, con sus definiciones.
6. Informe de sanciones: original y actual, conducta, fundamento, actor, confirmación, mes y unidad. Informe de cancelaciones: solicitud/resolución o vía extraordinaria, motivo, objetivo y ajustes relacionados.
7. Unificar fechas de calendario y zona Bolivia para presentación sin desplazar un día fechas guardadas como fecha sin hora. Invalidar cachés tras alta/cancelación/relevo y evitar respuestas antiguas sobreescribiendo selecciones nuevas.

**Salida:** la interfaz permite explicar cualquier 10/1 o 11/1 sin confundir su conducta, su unidad histórica ni los documentos emitidos.

### Fase 7 — Migración ensayada y control de reversibilidad

1. Preparar una migración aditiva, versionada e idempotente, primero en modo simulación; no borrar ni recrear `personal`, `ci_registry` o `faltas`.
2. Enriquecer solo registros cuyo origen pueda demostrarse, calculando inicio/vencimiento desde esa raíz. Los ambiguos o con vínculos posteriores al vencimiento quedan señalados para revisión, sin una clasificación inventada. No recalcular el plazo desde la importación, la migración ni la última reincidencia.
3. Ensayar en emulador con casos representativos y en entorno aislado con copia autorizada si fuera necesaria. Mantener datos personales fuera de evidencias públicas.
4. Verificar conteos, IDs, unidades, documentos, autores, estados y relaciones antes/después. Las diferencias deben corresponder exactamente al manifiesto aprobado.
5. Preparar respaldo y probar restauración antes de cualquier migración real. Coordinar bloqueo de escrituras o compatibilidad transaccional durante corte, según el mecanismo elegido.
6. Diseñar recuperación de fallo parcial y rollback que preserve registros nuevos; nunca restaurar un backup antiguo sobre operaciones posteriores sin conciliación.

**Salida:** ensayo reproducible y reconciliación sin pérdidas. La existencia del plan no autoriza migración real.

### Fase 8 — Validación integrada y revisión final

1. Ejecutar la matriz de sección 8 en dominio, handlers con emuladores y UI local según corresponda.
2. Probar rutas permitidas/denegadas y aislamiento de unidades sin retirar las garantías existentes.
3. Ejecutar lint, TypeScript, build y suites afectadas después de implementar. Validar reglas/índices que cambien en el entorno aislado.
4. Revisar costos de consultas por persona y número de solicitudes, sin límites silenciosos. Preparar índices a partir de consultas reales; evitar cargar toda la colección para cada decisión.
5. Contrastar API, pantalla, registros persistidos, auditorías y notificaciones en los mismos escenarios.
6. Cerrar cada Rxx solo con evidencia de su caso correctivo. Actualizar documentación funcional y limitaciones; no usar «build aprobado» como certificación del negocio.

**Salida:** informe de aceptación con casos aprobados, límites y defectos pendientes; candidato concreto de publicación.

### Fase 9 — Publicación autorizada y comprobación operacional

1. Presentar versión revisada, manifiesto de datos, respaldo probado, cambios de reglas/índices y procedimiento de vuelta atrás.
2. Obtener autorización específica para los pasos externos pendientes: migración, push/publicación y configuración operacional.
3. Aplicar despliegue compatible con los datos y lectores anteriores; verificar la versión efectiva y el programador de vencimientos.
4. Validar con cuentas autorizadas sin crear sanciones ficticias en producción. Monitorizar fallos de evaluación, conflictos, solicitudes vencidas y registros en revisión.
5. Confirmar continuidad de unidades, padrón, roles y consultas históricas. No cerrar la tarea como desplegada por haber aprobado pruebas locales.

**Orden de dependencias:** 0→1→2→3; 4 y 5 dependen del motor/contrato; 6 depende de sus respuestas; 7 se ensaya con modelo/motor estables; 8 integra todas; 9 requiere aceptación y autorización. Secciones de UI/documentación pueden prepararse antes sin dar por cerrado el flujo.

## 8. Matriz mínima de pruebas de aceptación

| ID | Caso | Resultado exigido |
|---|---|---|
| A01 | Persona sin antecedentes, conducta9/1 | Base9/1, raíz y conducta verificables |
| A02 | Segunda conducta9/1 con antecedente elegible | 10/1, conducta9/1, referencia a la base concreta |
| A03 | Tercera conducta9/1 | 11/1 enlazado al10/1 de esa cadena |
| A04 | Conducta9/2 del mismo policía | Cadena independiente de9/1 |
| A05 | Ambas conductas llegan a10/1 y11/1 | Coexisten; ninguna bloquea, fundamenta ni agrava la otra |
| A06 | Dos conductas sustantivas10/X y10/Y | Dos11/1 con fundamentos separados |
| A07 | 11/1 procedente de9/X frente a11/1 de10/Y | Conservan conductas y niveles relativos distintos |
| A08 | Intento de salto9/X→11/1 | Rechazo en todas las vías nuevas |
| A09 | Reiteración después del último escalón local | Remisión existente de esa cadena; no usar otra conducta |
| A10 | Antecedente en otra unidad | Se detecta globalmente; nuevo registro conserva unidad del registrador |
| A11 | Antecedente con6d23h59m59s y con7d exactos | Bloqueo antes del límite; elegibilidad desde el límite si cumple demás reglas |
| A12 | Solicitud presentada antes de7d, todavía pendiente después | Impide reincidencia hasta resolución/vencimiento |
| A13 | Solicitud cumple5d exactos | Rechazo efectivo idempotente; posterior materialización/auditoría/notificación |
| A14 | Base sin efecto | No sirve de fundamento |
| A15 | Distancias364/365/366d desde la sanción original, año bisiesto | Antes de365d evaluar escalada; desde365d cadena vencida; sumar365d, sin renovación por descendientes |
| A16 | Raíz9/X vencida con10/1 o11/1 reciente | Permite nueva base9/X, con nuevo ID/plazo; rechaza continuar la cadena antigua |
| A17 | Raíz10/X sustantivo vencida con11/1 reciente | Permite nueva base10/X; no9/X ni11/1 apoyado en la cadena vencida |
| A18 | Fecha futura/inexistente; cambio de día Bolivia/UTC | Rechazo o presentación correcta según tipo de fecha |
| A19 | Dos registros fechados el mismo día | Sin orden causal inventado |
| A20 | Inserción histórica que afecta posteriores | Impacto visible y revisión/rechazo explícito |
| A21 | Dos unidades registran simultáneamente misma conducta | Un resultado coherente; segunda operación reevalúa y respeta espera |
| A22 | Dos conductas diferentes registradas simultáneamente | Ambas admisibles sin mezcla de cadenas |
| A23 | Solicitud/cancelación concurrente con reincidencia | Ninguna sanción queda fundada en estado incompatible |
| A24 | Repetir la misma confirmación / alterar contenido | Idempotencia / rechazo, respectivamente |
| A25 | Cambia antecedente después de previsualizar | Exige revisar y confirmar nueva decisión |
| A26 | Importación de dos10/1 de una sola base | No admite dos hijos del mismo nivel/origen |
| A27 | Importación con varias conductas posibles | Exige referencia inequívoca; no adivina |
| A28 | Cambios entre vista previa y confirmación | Reevalúa dentro de transacción, incluso para faltas directas |
| A29 | Lote parcial/reintento sobre fila anulada | No duplica ni resucita registros |
| A30 | Cancelar9/X de A→B→C | A sin efecto; B9/X; C10/1; vínculos/auditoría consistentes |
| A31 | Cancelar10/1 intermedio | Solo ese registro sin efecto;11/1 baja a10/1 con antecedente correcto |
| A32 | Cancelar11/1 final | Anteriores intactos |
| A33 | Cancelar base10/X | Su11/1 pasa a10/X, no a9/X |
| A34 | Cancelación sucesiva y nueva reincidencia posterior | Cada rebaja se audita; escalón disponible se calcula correctamente |
| A35 | Otra cadena del mismo policía | Contenido y referencias idénticos tras cancelación ajena |
| A36 | Ciclo, huérfano, raíz faltante, referencia a otra persona | Revisión/rechazo, ninguna reconstrucción inventada |
| A37 | Bifurcación o salto histórico; snapshot discrepante | Diagnóstico explícito de cada registro, incluidos los terminales |
| A38 | Autor relevado o rol cambiado; unidad distinta | Permisos vigentes y unidad histórica preservados |
| A39 | Intentos bloqueados repetidos | No aumentan el conteo de sanciones realmente impuestas |
| A40 | Rebase y consulta de informes | Original/actual/fundamento visibles; dos informes separados |
| A41 | Consultas por unidad y global autorizada | Sin filtración de expedientes; fundamento suficiente donde corresponda |
| A42 | Volumen alto e historial largo | Sin truncamiento de una decisión; tiempos/costos medidos |
| A43 | Migración ejecutada dos veces, fallo parcial, rollback | IDs estables, cero pérdida/resurrección; diferencias conciliadas |
| A44 | Móvil/teclado, cambio rápido persona/fecha/conducta | Estado y confirmación corresponden a la selección vigente |
| A45 | Reincidencias añadidas durante el año de la raíz | Todos los escalones conservan exactamente el vencimiento original |
| A46 | Intento de escalada con antecedente inmediato reciente y raíz vencida | Rechazo en registro manual, importación e integración; ningún enlace nuevo a esa cadena |
| A47 | Dos conductas del mismo policía con fechas de origen distintas | Vencimiento independiente; una puede reiniciar mientras la otra todavía escala |
| A48 | Dos cadenas históricas de la misma conducta, separadas por vencimiento | Referencias, niveles y conteos separados; nueva cadena no hereda escalones de la antigua |
| A49 | Vence la cadena mientras un descendiente conserva solicitud pendiente | No reutilizar la cadena para agravar; evaluar nueva base sin arrastrar bloqueo de la cadena antigua; resolver la solicitud con su propio plazo |
| A50 | Importación hoy de una reincidencia cuya fecha está dentro del año original | Evaluación histórica por esa fecha, conservando controles de integridad y registro; no rechazo solo por vencimiento actual |
| A51 | Nueva base al vencer y dos registradores concurrentes | Un solo inicio coherente del nuevo episodio; el segundo reevalúa sin duplicar base ni usar cadena antigua |
| A52 | Vencimiento sin nuevas conductas registradas | No crea sanciones, no borra ni anula; historia y totales se conservan según estado real |
| A53 | Cancelación extraordinaria en cadena antigua después de iniciar otra | Solo afecta descendientes vinculados de la cadena antigua; nueva cadena intacta |
| A54 | Cancelación de raíz y rebaja | Nuevo año desde la fecha de la sanción promovida a base; raíz histórica preservada y nueva raíz vigente identificada; revisión explícita si se superpone con otro episodio |

## 9. Mapa de archivos y criterios de cierre

| Área | Archivos principales que deberán cambiar o verificarse |
|---|---|
| Motor y contratos | `src/lib/domain/disciplinary-recidivism.ts`, `schemas.ts`, `sanction-policy.ts`, `src/lib/faltas/reincidencia.ts`; nuevo módulo compartido si simplifica la lógica |
| Operaciones atómicas | `src/lib/server/operations.ts`, `cancellations.ts`, `src/app/api/faltas/route.ts`, `faltas/impacto/route.ts`, `antecedentes/route.ts` |
| Otras entradas | `src/lib/imports/historical-sanctions.ts`, `src/app/api/imports/faltas/route.ts`, `imports/faltas/[id]/confirm/route.ts`, `integraciones/sanciones/route.ts` |
| Pantallas y presentación | `registro-page.tsx`, `importar-sanciones-historicas.tsx`, `historial-page.tsx`, `efectivo-detail.tsx`, `cancelacion-button.tsx`, `reincidencia-format.ts` |
| Informes | Rutas `dashboard`, `reportes`, `auditoria` y sus componentes; separar origen de tipificación aplicada |
| Datos/operación | Analizador de preparación, nuevo script de migración en simulación, índices/reglas afectados y documentación |
| Verificación | Tests de dominio, importación, handlers en emulador y escenarios visuales; nuevas expectativas para A01–A54 |

**Cierre funcional:** cualquier sanción10/1 o11/1 identifica inequívocamente persona, conducta, cadena, fundamento, nivel e inicio/vencimiento de la raíz; decisiones iguales en todas las entradas; historial preservado y cancelaciones independientes; reinicio en9/X o10/X al vencer, sin prolongación por reincidencias; informes conciliados con registros reales; casos críticos aprobados. No deben quedar pendientes R01, R02, R04–R07 ni R13 para publicar el nuevo flujo. R03 debe aprobar como reinicio permitido.

**Cierre operativo:** migración/compatibilidad ensayadas, respaldo restaurable, publicación autorizada y comprobación del despliegue. Es distinto del cierre local de implementación.

## 10. Reproducción y continuidad

Desde la raíz del repositorio, sin cargar `.env.local`:

```powershell
node --import tsx docs/reincidencia-2026-10-27/reproducciones.ts
node --import tsx --test src/lib/domain/sanction-policy.test.ts src/lib/imports/historical-sanctions.test.ts
firebase emulators:exec --only "firestore,auth" --project demo-app-faltas --config firebase.test.json "node --import tsx docs/reincidencia-2026-10-27/reproducciones-api.ts"
```

El script API exige exactamente los emuladores locales y proyecto demo; usa personas ficticias y guarda solo resultados sin credenciales. Ambos emuladores se cerraron tras la ejecución. La primera invocación del CLI sin comillas en `firestore,auth` no arrancó emuladores por interpretación de PowerShell; la invocación citada terminó correctamente.

Skills utilizadas: `project-memory`, `faltas-multiunidad`, `code-review`. La aplicación futura también se beneficia de `architecture-guard` para contratos/datos y de `safe-refactor` al sustituir lógica duplicada. No se necesitan nuevas skills para corregir estos fallos: la prioridad es el contrato de dominio y sus pruebas.
