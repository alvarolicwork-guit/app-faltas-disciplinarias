# Auditoría técnica de App Faltas

Fecha: 26 de octubre de 2026, America/La_Paz. Base examinada: commit `b141f5b` (`Complete disciplinary controls and historical import`). El árbol de trabajo estaba limpio al comenzar. Node local: 22.17.0; Next.js: 16.2.4; React: 19.2.4; sharp: 0.34.5.

## Dictamen y alcance

**La revisión identificó problemas de controles de acceso e integridad que requieren corrección en el sistema existente.** Compila y rechaza llamadas sin token, pero existen caminos autenticados que evitan restricciones de unidad, administración de cuentas y validación del catálogo.

**Aclaración operativa incorporada el 26/10/2026:** el usuario confirma que la app ya estaba desplegada, conectada funcionalmente a Firebase y en uso real. Esta auditoría no volvió a verificar la conexión remota y no diagnosticó un fallo de despliegue o conexión. Sus límites de comprobación no deben interpretarse como una puesta en marcha pendiente. Los cambios posteriores deben planificarse como evolución de un sistema en operación, preservando servicio, datos y usuarios.

Se revisaron arquitectura, handlers de API, autenticación, roles, reglas e índices Firestore, registro y anulación, personal, unidades, transferencias, relevo de usuarios, importaciones, integración BSFP, reportes, componentes de interfaz, caché, dependencias y procedimientos operativos. Se ejecutaron pruebas locales y reproducciones aisladas. Esto es una auditoría del código disponible y del arranque local, **no una certificación completa de producción**.

No se consultó ni modificó el padrón real, no se usaron cuentas de usuarios, no se ejecutaron scripts de limpieza o seed, ni se publicaron cambios. Solo se añadieron este informe y evidencias en esta carpeta. No se corrigió el código funcional.

Distinción de evidencia:

- **R — Reproducido:** ejecución de handlers reales transpilados, con Auth y Firestore sustituidos por servicios en memoria y datos ficticios. Prueba lógica; no prueba de Firebase real ni de navegador.
- **C — Confirmado por código:** ruta y condición verificables en archivos; consecuencias de concurrencia o fallos de infraestructura no se provocaron en producción.
- **D — Dependencias:** avisos consultados en el registro npm y fuentes de los mantenedores; aplicabilidad concreta depende del despliegue.
- **P — Pendiente:** requiere entorno real, decisiones operativas o evidencia adicional.

## Comprobaciones realizadas

| Comprobación | Resultado | Alcance real |
|---|---|---|
| ESLint | Correcto, salida 0 | Incluye archivos de evidencia añadidos |
| TypeScript `npx tsc --noEmit` | Sin errores observados | También validado por la compilación de producción |
| `npm run test:imports` | 5/5 aprobadas | Normalización y consistencia básica de importaciones |
| `npm run build` | Correcto | Compilación, tipos y generación de páginas |
| Arranque `next start` | Correcto | Servidor temporal en loopback; cerrado al terminar |
| HTTP sin autenticación | 35 combinaciones ruta/método | 33 respuestas 401; health 200; integración 503 |
| Página `/` | HTTP 200 | No equivale a revisión visual ni login funcional |
| Reproducciones aisladas | 9/9 confirman los comportamientos H01–H09 | Los tests aprueban cuando el defecto sigue presente |
| `npm audit --json` | 29 paquetes afectados | 2 críticos, 16 altos, 8 moderados, 3 bajos; incluye dependencias de desarrollo |
| `git diff --check` | Correcto | No demuestra seguridad ni funcionamiento |

La primera consulta npm y la primera conexión local fallaron por aislamiento de red. Se completaron con ejecución autorizada fuera del sandbox; el servidor y las comprobaciones HTTP se ejecutaron juntos. No quedaron bloqueos de aprobación.

Evidencias: `npm-audit.json`, `reproducciones.cjs`, `reproducciones.txt`, `http-smoke.json`, `http-smoke.cjs`, `run-local-smoke.cjs` y `lint.txt`. El JSON npm cuenta paquetes afectados, **no 29 vulnerabilidades independientes demostradas**.

## Hallazgos

### H01 — Alta — Consulta por persona omite aislamiento de unidad [R]

Ubicación: `src/app/api/faltas/route.ts:645–669`, especialmente línea 662.

El filtro de unidad del actor se aplica solamente cuando no existe `personalId`. Un operador de U-A recibe el registro completo de una persona de U-B usando `GET /api/faltas?personalId=...`, mientras que la misma solicitud con `scope=global_person` devuelve 403. Conocer el ID es una precondición; no es un control de autorización. La prueba H01 devolvió 200 y el motivo de una sanción ajena.

Corrección: comprobar que la persona esté dentro del ámbito permitido antes de consultar. Para reincidencia de un efectivo de la propia unidad puede ser necesario consultar antecedentes globales: preservar esa función mediante una respuesta mínima y una autorización explícita, sin abrir la lectura arbitraria de cualquier persona.

Aceptación: operador de A no consulta persona de B; el control de reincidencia de personal de A sigue considerando antecedentes válidos de otras unidades.

### H02 — Alta — Relevo permite modificar una cuenta superior [R]

Ubicación: `src/app/api/users/handover/route.ts:74–144`; comparar con `src/app/api/users/route.ts:190–205`.

`admin_dpto` puede elegir como entrante el correo de un `super_admin`. El endpoint no protege el rol previo: reactiva Auth y sobrescribe el documento con un rol de unidad. La prueba H02 convirtió `super_admin` en `admin_unidad`. No se demostró apropiación de su contraseña; el fallo es modificación no autorizada de una cuenta superior y posible pérdida del administrador principal.

Corrección: validar el usuario entrante y su jerarquía antes de cualquier modificación en Auth; reutilizar las restricciones de edición, impedir relevar cuentas globales por esta vía y proteger al último superadministrador. Verificar también la existencia y vigencia de la unidad.

### H03 — Alta — Cambio obligatorio de contraseña confiado al cliente [R/C]

Ubicación: `src/app/api/users/password-change/route.ts:23–31`; `src/lib/auth/request-user.ts:42,65–77`; `src/components/disciplinario-app.tsx:43–45`.

El endpoint acepta un POST vacío y desactiva `mustChangePassword`, sin actualizar ni verificar la contraseña en Firebase Auth. La prueba H03 lo confirmó. Además, el bloqueo está en la interfaz; el guard de API devuelve al usuario aunque la bandera siga activa.

Corrección: operación de cambio verificada por el servidor o protocolo confiable que compruebe el cambio efectivo; mientras exista la bandera, permitir únicamente los endpoints necesarios para completar ese proceso. No registrar `first_password_change` sobre una simple declaración del cliente.

### H04 — Alta — Edición puede dejar un rol de unidad sin unidad y abrir consultas [R/C]

Ubicación: `src/app/api/users/route.ts:212,235–239,263`; `src/app/api/faltas/route.ts:662–669`; `src/app/api/dashboard/route.ts:15–22`; `src/app/api/reportes/route.ts:15–24`.

Con `unidadId: null`, la validación usa `updates.unidadId ?? before.unidadId` y considera válida la unidad antigua; la escritura guarda null. H04 reprodujo el estado inválido. En varias consultas, una unidad vacía hace que no se añada filtro, ampliando el alcance a toda la colección.

Corrección: validar el documento resultante real, distinguir campo omitido de null, exigir unidad válida en el guard de todos los roles de unidad y rechazar roles desconocidos. Un perfil incompleto debe fallar cerrado, nunca convertirse en consulta global.

### H05 — Alta — API admite tipificaciones ajenas al catálogo [R]

Ubicación: `src/lib/domain/schemas.ts:51–66`; `src/app/api/faltas/route.ts:125–140,461–480`.

Artículo e inciso son textos libres con longitud mínima. La prueba H05 registró `Art. 888` y `999. Inventado` con HTTP 201. Las opciones limitadas del formulario no protegen la API. También hay comparaciones exactas de textos en reincidencia: variantes de un mismo concepto pueden no coincidir.

Corrección: validar pertenencia artículo/inciso en servidor y almacenar identificadores canónicos, conservando etiquetas para visualización. Rechazar fechas futuras y validar estados de personal/unidades conforme a la política aprobada; hoy el registro manual no tiene los mismos controles temporales que el importador histórico. Esto evalúa consistencia técnica, no certifica la exactitud jurídica del catálogo.

### H06 — Media — Vencimiento de transferencia aborta su propia actualización [R]

Ubicación: `src/app/api/transferencias/solicitudes/[id]/resolver/route.ts:51–73,158`.

Dentro de la transacción se programa `estado: vencida` y luego se lanza `REQUEST_EXPIRED`. El error cancela las escrituras. H06 confirmó que el handler responde que venció, pero el estado simulado conserva `pendiente` y no hay auditoría persistida. Una lectura posterior puede vencerla por otro camino; no corrige la respuesta falsa de este endpoint.

Corrección: devolver un resultado de vencimiento desde la transacción, confirmarla y construir después la respuesta HTTP. Firebase documenta que una transacción fallida no aplica escrituras: [transacciones Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).

### H07 — Alta si se exige aprobación — Transferencia directa elude el circuito de solicitudes [R/P]

Ubicación: `src/app/api/personal/[id]/transfer/route.ts:28–35,47–49,91–97`; `src/lib/domain/roles.ts:25`.

Un `admin_unidad` que conoce el ID de un efectivo ajeno puede moverlo a su propia unidad sin solicitud ni aprobación previa; incluso `fromUnidadId` es opcional. H07 reprodujo el traslado. Esto es comportamiento confirmado; que deba prohibirse depende de la política de traspasos, porque también existe una interfaz de traslado directo.

Recomendación: definir una única política. Si la aprobación es obligatoria, reservar la reasignación directa a administración global y exigir solicitud aceptada para unidades. Adicionalmente, el endpoint exige unidad propia incluso a administradores globales, bloqueando a perfiles globales válidos sin unidad.

### H08 — Alta — Solicitud de anulación sobre sanción ajena [R]

Ubicación: `src/app/api/faltas/solicitudes/route.ts:54–117`.

Se valida el rol, pero no la unidad de la sanción ni la relación autorizada con el efectivo. H08 creó una solicitud desde U-A para una sanción U-B. La solicitud copia CI, nombre, memorándum y datos de la sanción; el solicitante puede recuperar ese resumen mediante su listado. La aprobación global sigue siendo necesaria para anular: no se demostró anulación directa por operador.

Corrección: autorizar el recurso antes de comprobar o copiar datos; definir expresamente el tratamiento de antecedentes de personas trasladadas, en lugar de aceptar cualquier ID.

### H09 — Alta — PATCH evita la protección del último superadministrador [R]

Ubicación: `src/app/api/users/route.ts:173–280`, comparar con `:299–343`.

DELETE impide la baja propia y la del último `super_admin`, pero PATCH permite `status: baja` o cambio de rol sin esa protección. H09 desactivó la única cuenta superadministradora en memoria con HTTP 200.

Corrección: centralizar la invariante para todas las operaciones, incluido relevo; comprobarla transaccionalmente para evitar dos bajas simultáneas. Debe conservarse al menos una cuenta superadministradora activa y utilizable.

### H10 — Crítica por avisos de componentes — Dependencias desactualizadas [D]

Ubicación: `package.json`, `package-lock.json`, evidencia `npm-audit.json`.

El registro npm reportó dos paquetes con severidad crítica: `next` y `websocket-driver`. Next instalado es 16.2.4 y sharp 0.34.5. El informe npm propone Next 16.4.3 como actualización disponible en esta consulta; debe validarse compatibilidad y volver a auditar el árbol completo, sin ejecutar `audit fix --force` a ciegas.

Los mantenedores documentan una vulnerabilidad de ejecución remota en servidores Windows que afecta a Next 16.2.4: [GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36). El entorno local inspeccionado es Windows y no habilita Cache Components; no se ejecutó un exploit ni se verificó exposición externa. Existe además un aviso sobre optimización SVG en Linux glibc, condicionado al entorno y bibliotecas: [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw). No debe extrapolarse un aviso Windows al alojamiento remoto sin comprobar su sistema operativo.

Prioridad: actualizar dependencias directas y transitivas, ejecutar build y pruebas funcionales de roles/importaciones, volver a obtener el informe y revisar avisos residuales por aplicabilidad. Mantener el servidor local limitado a loopback hasta cerrar esta exposición.

### H11 — Alta — HTML sin escapar en impresión de errores [C]

Ubicación: `src/components/importacion/import-page.tsx:209–222` y `src/app/api/imports/personal/route.ts:146–164`.

Los valores erróneos del archivo pasan a `err.value` y se interpolan directamente dentro de `document.write`. Un campo inválido con etiquetas HTML conserva dichas etiquetas en la ventana de impresión. Un manejador de evento incrustado podría ejecutarse cuando un superadministrador imprime el informe. Se confirmó el flujo fuente-destino; no se ejecutó JavaScript malicioso en un navegador.

Corrección: construir el documento con nodos/textContent o escapar todos los valores dinámicos, incluidos mensaje y metadatos. Añadir una prueba con caracteres `<`, `>`, `&`, comillas y un marcador HTML inofensivo. CSP sería defensa adicional, no sustituto del escape.

### H12 — Alta — Reglas Firestore no comprueban cuenta activa; revocación incompleta [C/P]

Ubicación: `firestore.rules:4–17,33–45`; `src/lib/auth/request-user.ts:65`.

La API consulta `status/isActive`, pero las reglas de lectura directa solo usan autenticación, rol y unidad. Un token todavía vigente de una cuenta bloqueada puede seguir satisfaciendo esas reglas si son las desplegadas. Además, `verifyIdToken(idToken)` no solicita comprobación de revocación; un token revocado de una cuenta que permanece activa no queda necesariamente rechazado por la API.

Corrección: revisar revocación con `verifyIdToken(token, true)` o mecanismo equivalente, controles de sesión y reglas con estado activo; probar baja/relevo/cambio de contraseña con tokens previos. El comportamiento del SDK está documentado en [gestión de sesiones Firebase](https://firebase.google.com/docs/auth/admin/manage-sessions). No se descargaron reglas remotas ni se usó un token real bloqueado; la exposición desplegada queda pendiente.

### H13 — Alta — Importación histórica sin recuperación robusta e integridad concurrente [C]

Ubicación: `src/app/api/imports/faltas/route.ts:219–250`; `src/app/api/imports/faltas/[id]/confirm/route.ts:64–74,112–127,255–324`; `src/app/api/imports/faltas/[id]/revert/route.ts:50–82,123–155`.

Rutas de fallo observables:

- La cabecera aparece como `preview` antes de terminar de guardar todas las filas. Si falla un lote, puede quedar una vista previa incompleta susceptible de confirmación.
- La confirmación escribe por lotes; un fallo posterior deja faltas activas y estado `failed`. Reintentar usa `set` sobre los mismos IDs y reconstruye `estado: registrada`, pudiendo sobrescribir modificaciones o anulaciones realizadas entre intentos.
- Un proceso interrumpido puede quedar en `processing`; no existe vencimiento de bloqueo. Una reversión fallida puede quedar en `reverting`, y el siguiente intento exige `confirmed`.
- Dos importaciones diferentes verifican duplicados fuera de una transacción compartida. Pueden superar simultáneamente esa comprobación. La confirmación tampoco vuelve a ejecutar toda la consistencia de reincidencia sobre antecedentes añadidos desde la vista previa.

Corrección: estados de preparación/validación terminados, conteo y hash de filas, bloqueo con vencimiento, progreso persistido por lote y recuperación idempotente que no sobreescriba sanciones modificadas. Coordinar claves de unicidad y revalidar antecedentes al confirmar. Probar fallos inducidos antes/después de cada commit en un entorno aislado.

### H14 — Alta — Reinicio del padrón deja historial referenciado a IDs inexistentes [C]

Ubicación: `src/app/api/imports/personal/route.ts:279–340`.

La eliminación masiva borra `personal`, `ci_registry` e `imports_personal`, pero conserva sanciones y solicitudes que referencian `personalId`. Al reimportar, se crean IDs nuevos: el mismo CI deja de encontrar su historial por el ID anterior y el control de reincidencia también usa ese ID. El endpoint no comprueba esas dependencias ni genera un respaldo antes de borrar.

Corrección: deshabilitar este reinicio en operación real o rechazarlo cuando haya dependencias; preferir actualización del padrón conservando IDs. Una migración excepcional necesita respaldo y estrategia explícita de referencias. El script separado de limpieza documenta respaldo, pero no es el código ejecutado por este botón. No se ejecutó ninguna eliminación.

### H15 — Media — Listados e historiales incompletos sin paginación [C]

Ubicación: `src/app/api/personal/route.ts:39–54,72–76`; `src/components/personal/personal-page.tsx:102`; `src/app/api/faltas/route.ts:706–734`; `src/app/api/transferencias/solicitudes/route.ts:115–134`.

La UI pide 300 personas pero el backend limita la respuesta a 100. Las búsquedas textuales filtran solamente los primeros 2.000 documentos; faltas filtra texto después de limitar a 100. No hay cursor para recuperar el resto. Transferencias limita antes de ordenar en memoria, por lo que no garantiza mostrar las más recientes.

También se limita a 100 antecedentes en búsquedas de cadenas de reincidencia (`faltas/route.ts:282,344`); si se supera ese volumen en la ventana, puede omitirse un antecedente relevante. No se verificó que el volumen real alcance esos límites.

Corrección: paginación con cursor, orden estable en base de datos y búsquedas indexadas; mostrar total y avisos de truncamiento. No imponer límites silenciosos a una comprobación disciplinaria decisiva.

### H16 — Media — Unicidad y auditoría inconsistentes bajo concurrencia/fallo [C]

Ubicación: `src/app/api/unidades/route.ts:75–101`; `src/app/api/users/route.ts:36–54,129–164,263–281`; `src/app/api/imports/personal/route.ts:85–94,194–250`.

Las unidades calculan el siguiente ID leyendo el máximo y después hacen `set`: dos altas simultáneas pueden usar el mismo ID y sobrescribirse. La importación de personal lee el padrón completo antes de escribir, sin transaccionar la exclusividad de `ci_registry` como sí hace el alta individual. Dos cargas concurrentes pueden crear dos personas para un CI y dejar el registro apuntando a una sola.

Varias operaciones guardan el dato y luego auditoría en llamadas separadas: un fallo de auditoría produce 500 aunque el cambio ya ocurrió. Auth y Firestore también pueden quedar desalineados en creación/relevo. El importador de personal cuenta filas, no escrituras, para sus lotes y no limita el número de filas en servidor; cada fila añade dos escrituras. No se afirma un límite vigente de 500 operaciones ni un fallo medido por tamaño: deben probarse tamaño/tiempo con el SDK y servicio reales.

Corrección: contadores/reservas transaccionales, unicidad compartida entre todas las vías de alta, dato y evento en el mismo commit cuando sea posible, compensación/reintento explícito entre Auth y Firestore, límites y fragmentación por escrituras/tamaño real.

### H17 — Media — Token inválido se trata como error interno [C]

Ubicación: `src/lib/auth/request-user.ts:65`; `src/app/api/me/route.ts:6`; capturas generales de las rutas.

El verificador propaga errores de token inválido/expirado. La mayoría de endpoints los transforma en 500 y `/api/me` ni siquiera tiene captura propia. La prueba HTTP sin token confirmó 401, pero ese caso no demuestra el tratamiento correcto de token inválido. `useApi` espera JSON incluso cuando el error de Next puede no tener ese formato.

Corrección: clasificar errores de autenticación en el guard, devolver JSON/401 consistente y mantener los errores de infraestructura como 5xx; no exponer mensajes internos completos al cliente. Verificar también expiración, revocación y usuario desactivado.

### H18 — Alta para integridad — Anular un antecedente no revisa sanciones dependientes [C/P]

Ubicación: `src/app/api/faltas/route.ts:782–831`; `src/app/api/faltas/solicitudes/[id]/resolver/route.ts:75–111`.

Ambas vías anulan la falta sin examinar sanciones activas que la referencian mediante `reincidenciaOrigen`. En cambio, la reversión de importaciones sí tiene una comprobación de dependencias. El estado resultante puede contener sanciones escaladas apoyadas en un antecedente anulado.

Corrección: detectar y mostrar dependencias, impedir cambios incoherentes o abrir una revisión formal según la regla de negocio aprobada. **No se recomienda anular automáticamente sanciones derivadas sin sustento normativo.** La consecuencia jurídica y el procedimiento deben validarse con la fuente institucional vigente.

### H19 — Media — CSV de personal no interpreta comillas [C]

Ubicación: `src/components/importacion/import-page.tsx:50–88`.

El parser separa con `line.split(delimiter)` y divide previamente por saltos de línea. No interpreta campos entre comillas, separadores dentro de un campo ni campos multilínea. Un CSV válido con un apellido que contenga una coma entre comillas puede desplazar las columnas. El importador histórico dispone de un parser diferente y más completo.

Corrección: parser CSV conforme al formato admitido y compartido entre vista previa y backend; pruebas con delimitadores, BOM, comillas escapadas y saltos de línea. El servidor debe validar tipos y tamaño de cada fila: actualmente un valor numérico en un campo sometido a `.trim()` puede terminar en 500.

### H20 — Alta si se habilita — Integración BSFP tiene estados y validaciones divergentes [C/P]

Ubicación: `src/app/api/integraciones/sanciones/route.ts:117–150,191–215,285–343`.

Un evento previamente guardado como `personal_not_found` o `blocked` se responde en la siguiente llamada con `ok:true` y `ALREADY_SYNCED`, aunque puede no existir sanción. Se almacena el hash pero no se compara para detectar reutilización del ID externo con otro contenido. Si dos llamadas con el mismo ID compiten, la transacción perdedora retorna sin escribir, pero la respuesta exterior puede anunciar 201 con un `faltaId` que no se creó.

La reincidencia directa se consulta fuera de la transacción y la escalada no valida el antecedente contra la base con las mismas garantías que el alta manual. La integración estaba deshabilitada en la configuración local probada (503), por lo que estos son defectos latentes, no evidencia de explotación de un servicio activo.

Corrección: no habilitarla hasta unificar las reglas de dominio, distinguir estado fallido de sincronizado, comparar hash, manejar reintentos y devolver el resultado real de la transacción.

## Observaciones adicionales y pendientes

| Área | Observación / pendiente |
|---|---|
| Interfaz y accesibilidad | Revisión de código: Modal tiene rol y Escape, pero no gestión/retención/restauración del foco; el backdrop puede impedir el cierre exterior porque el target no es el contenedor. Falta verificar visualmente móvil, teclado y lector de pantalla. |
| Fechas | El formulario usa `new Date().toISOString().slice(0,10)`: entre 20:00 y 23:59 de Bolivia puede proponer el día siguiente. Dashboard usa zona local del servidor y cuenta desde inicio del mes sin límite superior. Definir tratamiento uniforme de fechas civiles y zona America/La_Paz. |
| Rendimiento | Dashboard, reportes y prevalidaciones cargan colecciones completas; costo/latencia crecen con el historial. No se midieron cargas ni costos reales. Considerar agregados y paginación después de corregir consistencia. |
| Caché | Se vacía por UID, no por cambio de rol/unidad; una solicitud pendiente puede repoblar caché después de cambiar sesión. El importador de personal no invalida listados/cache al crear o reiniciar. Requiere prueba de carrera en navegador y claves por contexto de autorización. |
| Métricas | `reincidenciasBloqueadas` cuenta intentos bloqueados, no necesariamente personas únicas ni sanciones escaladas. Repetir un intento puede aumentar el contador. Validar que la definición sea la deseada y explicarla en UI/reportes. |
| Cabeceras | La respuesta local no incluye CSP ni protección explícita anti-framing; configuración Next vacía. No se deduce que el proxy remoto carezca de estas cabeceras. Revisar CSP compatible con Firebase y `frame-ancestors`/protección equivalente. |
| Pruebas y CI | Solo cinco pruebas de importación forman parte de los scripts normales; no se encontró pipeline CI versionado en este checkout. Faltan pruebas de roles, reglas, concurrencia, regresión de historial y flujos end-to-end. |
| Observabilidad | `/api/health` retorna 200 sin comprobar Auth/Firestore. Sirve como liveness, no como readiness. No se verificaron alertas, SLO, cuotas, retención ni recuperación. |
| Credenciales | `.env.local` está excluido de Git y solo `.env.example` aparece entre archivos de entorno versionados. No se imprimieron secretos. No se hizo un escaneo completo del historial Git ni se verificó rotación/IAM. |
| Documentación | README sigue describiendo Sprint 1 y recomienda implementar login/importación que ya existen. Debe reflejar roles, configuración, riesgos, despliegue y recuperación actuales. |
| Fuente normativa | No se aportó/verificó el texto institucional vigente para certificar artículos, incisos, plazos y efectos de anulación. Se auditó su implementación informática, no se emitió dictamen jurídico. |
| Despliegue | No se verificaron reglas/índices efectivamente desplegados, versión remota, backups restaurables, usuarios reales ni integraciones externas. No se atribuyen resultados locales a producción. |

## Controles positivos observados

- Las 33 operaciones ordinarias probadas rechazan ausencia de token con 401.
- Todas las reglas de colecciones declaradas prohíben escritura directa del cliente; las mutaciones se concentran en servidor.
- Alta individual de personal usa transacción y `ci_registry`; alta de faltas y varias resoluciones escriben auditoría dentro de transacciones.
- La anulación conserva el registro en lugar de borrarlo físicamente.
- Importación histórica restringida a superadministrador, con previsualización, validación por fila, máximo declarado de 5 MB/2.000 filas, exclusión de errores/duplicados y confirmación textual.
- Firma HMAC con comparación temporalmente segura y ventana de frescura en la integración; integración local deshabilitada.
- El código valida fechas reales en `parseFechaSancion`, y comprueba pertenencia y ventana del antecedente en la creación manual de reincidencia escalada.

Estos controles son útiles pero no compensan las vías alternativas señaladas.

## Orden de corrección y aceptación

1. **Acceso y componentes:** H01–H04, H08–H12. Actualizar dependencias; bloquear lecturas cruzadas y cambios de cuenta indebidos. Aceptación: matriz de los cinco roles con recursos propios/ajenos, usuario sin unidad, baja, token revocado y cambio obligatorio de contraseña; pruebas de reglas en emulador.
2. **Integridad disciplinaria:** H05, H13–H14, H18. Preservar IDs y relaciones, recuperar lotes y validar catálogo. Aceptación: fallos inducidos y reintentos sin duplicados, pérdida ni resurrección de sanciones; procedimiento aprobado para dependencias.
3. **Flujos y concurrencia:** H06–H07, H16, H19–H20. Unificar política de transferencias y contratos de integración. Aceptación: solicitudes simultáneas, vencidas y reintentadas, altas concurrentes y archivos límite.
4. **Operación:** H15, H17 y observaciones adicionales. Paginación, fechas, caché, accesibilidad, readiness, CI y documentación. Aceptación: pruebas autenticadas en staging, revisión visual y restauración de un backup de prueba.

No se asignan plazos cerrados sin conocer entorno de pruebas, volumen y requisitos operativos. La siguiente etapa debe trabajar sobre respaldo y entorno aislado, conservando la separación respecto de otras aplicaciones.

## Reproducibilidad

Desde la raíz de `app-faltas`:

```powershell
node --test docs/auditoria-2026-10-26/reproducciones.cjs
node docs/auditoria-2026-10-26/run-local-smoke.cjs
```

El segundo comando necesita build existente y puerto 3318 disponible; inicia un proceso oculto en loopback y lo termina al finalizar. Envía peticiones sin token. El primero no abre conexiones Firebase: usa datos en memoria. **Tras corregir los fallos, las aserciones de reproducción deberán cambiar a las expectativas seguras; una reproducción que deja de aprobar es lo esperable.**
