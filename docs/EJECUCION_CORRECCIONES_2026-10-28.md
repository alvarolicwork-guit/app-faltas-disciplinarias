# Ejecución del plan de correcciones — 28/10/2026

El usuario autorizó «ejecuta el plan de corrección de forma detallada» y continuar. Se incluyen correcciones, pruebas, publicación y depuración de los datos operativos actuales de prueba, conservando accesos/unidades e infraestructura y sin exportar documentos. La fuente definitiva no fue entregada: su carga queda pendiente de ese insumo.

Referencia inicial: 2c55379adf28145a1c7c72837cb534911a86a707. Informes y plan previos conservados. Esta es una revisión propia, no independiente.

## Estado por etapa

| Etapa | Estado comprobado | Evidencia |
| --- | --- | --- |
| E0 Preparación | Completada | Referencia Git, auditoría y fixtures preservados |
| E1 Permisos | Implementada, probada y reglas publicadas | Denegación de acceso directo; API y transacciones conservan controles |
| E2 Unidades/importaciones | Implementada y validada localmente |12 altas concurrentes distintas; lotes reanudables/totales y reapertura UI |
| E3 Cancelaciones/vencimientos | Código validado; programador pendiente de primera ejecución publicada | Estado extraordinario visible; vencimiento efectivo; autenticación OIDC comprobada localmente |
| E4 Informes/fechas/CSV | Implementada y validada localmente | Unidad por ID, fecha Bolivia, celdas seguras |
| E5 Seguridad/capacidad | Implementada y validada localmente | Cabeceras,0 avisos npm, índices/cursores y caché invalidada transaccionalmente |
| E6 Depuración | Herramienta ensayada en emulador | Interrupción/reanudación, huérfanos, conservación de usuarios/unidades |
| E7 Regresión/documentación | Completada localmente |118 pruebas distintas,16 comprobaciones de navegador, lint/tipos/build |
| E8 Publicación | Firebase completado; publicación del código en preparación |35 índices READY; reglas coinciden con el código |
| E9 Depuración/carga | Detenida por cuota remota; fuente definitiva pendiente | Lectura mínima Firestore devuelve429; no hay borrados ni mantenimiento reales |

## Correcciones por hallazgo

| Hallazgo | Cambio y prueba | Límite restante |
| --- | --- | --- |
| F01 | Firestore deniega lectura/escritura directa de cualquier cliente; auditoría solo por API autorizada. Prueba API403/Firestore403 para admin_dpto | Reglas publicadas y cotejadas |
| F02 | Revocación, rol/unidad/relevo siguen en servidor; revalidación transaccional reforzada; acceso directo cerrado | Verificación autenticada real cuando vuelva la disponibilidad |
| F03 | Secuencia numérica transaccional, precondición create, auditoría atómica e identidad de operación |12 altas simultáneas producen12 IDs; reintento conserva uno |
| F04 | Validación estructural previa; lotes persistentes por fila, bloqueo/progreso, reanudación y actualización por CI existente |151 filas aplicadas acumuladas sin duplicados; error nulo400 con cero escrituras |
| F05 | Retiro de las cadenas actuales de prueba autorizado; se conserva regresión que impide recrear bifurcaciones | Aún no retiradas en Firebase por429; no se declara cerrada la integridad de los datos publicados |
| F06 | Nuevo manifiesto cerrado, mantenimiento/generación, subcolecciones/huérfanos, progreso y reanudación; sin exportación | Ensayo completado; ejecución real pendiente de disponibilidad |
| F07 | CSV de errores usa serialización segura común, incluidos prefijos de control | Comprobación automatizada de salida; no ejecución de Excel real |
| F08 | Nuevo filtro Extraordinarias y etiqueta de cierre, con motivo/resolución | Verificado en navegador con datos ficticios |
| F09 | Estado efectivo uniforme; trabajador paginado/idempotente; métricas; workflow GitHub con OIDC | Comprobar primera ejecución de producción;429 impide persistir en base por ahora |
| F10 | Agrupación y contador por ID de unidad, nombre actual de presentación y nombres históricos en registros | Caso de unidad renombrada y cache invalidada comprobados |
| F11 | Fechas civiles Bolivia y mes institucional; fin de mes/bisiesto cubiertos | Sin cambios de los365 días aprobados |
| F12 | Ledger histórico, totales acumulados, procesamiento por bloques, idempotencia y apertura/continuación/lista paginada | Dos sanciones tras reanudar se informan como dos; sin resucitar anuladas |
| F13 | frame-ancestors none, X-Frame-Options DENY, nosniff, política de referente, respuestas API privadas sin caché de navegador | Cotejar cabeceras y bloqueo de iframe del dominio publicado |
| F14 | Índice de fragmentos/cursor, CI exacto, páginas de sanciones/notificaciones, consultas IN por personas, estadísticas cacheadas e invalidadas con las mutaciones | Fixture1500: página30 candidatos, CI exacto2 lecturas; el reinicio activa índice del nuevo padrón |
| F15 | Admin SDK14.5, ejecutor de pruebas actualizado y dependencias compatibles con Node22; npm audit0 | No se usó audit fix --force |
| F16 | Base funcional/README/guía vigentes, E2E con selectores actuales y Playwright local; CI reproducible | Confirmar primera CI publicada |

Los campos antiguos de asignación de personal dejan de impedir desactivar una unidad. La unidad del registrador en users y los controles de responsables/historial permanecen vigentes. No se reactivan transferencias.

## Carga, cuotas y disponibilidad

La nueva búsqueda conserva fragmentos, tildes y orden indistinto; una página incompleta ofrece continuidad. La evaluación disciplinaria utiliza las cadenas completas y los registros vivos.

Panel/reportes antes releían el historial en cada refresco. Ahora stats_cache se vincula a ámbito/rol/fecha y una revisión que cambia en la misma transacción que alta, cancelación, rebaja, importación o gestión pertinente. Las mutaciones invalidan la caché; un vencimiento próximo también evita servir un contador pendiente desactualizado. El reinicio retira estas vistas derivadas.

La consulta de preparación real encontró RESOURCE_EXHAUSTED. Una comprobación GET mínima confirmó HTTP429 el29/10 a02:56:36UTC, todavía28/10 en Bolivia. El error afecta a lectura de negocio, no a las reglas/índices administrativos. No se presupone un plan contratado ni una causa exacta dentro de la cuota; no se activó facturación ni se aumentaron límites.

La preparación falló antes de producir manifiesto completo o iniciar ejecución: **ningún documento real fue borrado, no se activó mantenimiento y no se exportaron documentos**. El resultado queda en disponibilidad-remota.json. No repetir inventarios masivos mientras persista el límite.

La cuenta de servicio permitió leer configuración pero no crear índices(403). Se usó la sesión existente de Firebase CLI, que compiló y publicó reglas/índices correctamente. No se ampliaron privilegios de esa cuenta ni se inició OAuth.

## Programador elegido

Vercel CLI indicó sesión cerrada y Cloud Scheduler no estaba habilitado. Se eligió GitHub Actions del repositorio ya utilizado, comprobado público con ID1244004584 y propietario254030428. Usa runner estándar público sin artefactos; esa ejecución permanece gratuita según [documentación de GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

El workflow solicita un token temporal con audiencia exclusiva. El endpoint comprueba firma RS256 contra claves oficiales, emisor/audiencia/tiempos, IDs de repositorio y propietario, visibilidad pública, archivo de workflow, rama main y eventos permitidos. Tokens de PR, otros flujos/ramas/repositorios y firmas falsas se rechazan. CRON_SECRET sigue como alternativa.

No se agregan claves del servicio a GitHub ni se imprime el token. El flujo únicamente puede invocar el vencimiento idempotente; no registra sanciones ni resuelve solicitudes humanas. Los horarios pueden retrasarse por el programador: el límite funcional de cinco días lo aplica siempre el servidor. [Referencia OIDC](https://docs.github.com/en/actions/reference/security/oidc).

La primera ejecución debe verificarse después de publicar. Un job que llegue al endpoint pero falle por cuota no acredita cierre/notificación en Firestore.

## Verificaciones locales

- 49 pruebas de dominio/identidad del programador.
- 11 pruebas de importación.
- 16 workflow comunes,8 rechazo y14 cadenas: se ejecutaron en suites24 y30; no contar dos veces el workflow.
- 20 pruebas específicas de corrección, búsqueda con1500 personas y reinicio interrumpido/reanudado.
- Total118 definiciones distintas aprobadas;16 recorridos/aserciones de navegador, incluidos importación/reapertura y móvil táctil.
- Lint, tipos y build aprobados. npm audit sin avisos.
- Capturas de cierre extraordinario y menú móvil inspeccionadas. Es emulación Pixel7, no un teléfono físico.

La prueba de depuración conservó6 usuarios y16 unidades ficticias, retiró los registros operativos y una fila de subcolección sin padre, rechazó una escritura durante mantenimiento y una operación anterior al cambio de generación. Su reanudación no exportó datos.

## Configuración Firebase publicada

Publicación mediante Firebase CLI terminada correctamente. Consulta posterior:29/10/2026 a03:19:11UTC(28/10 Bolivia).

- Reglaset: f5f7552a-7c07-48ff-a2af-d06570d84ef1.
- SHA256 normalizado:38a18835769c71bef2054fd429af1bb1dcf732d07b0085a0a4a9059db15af65f.
- Las reglas remotas coinciden con el archivo local.
- 35 índices declarados y disponibles, todos READY.
- No se eliminó un índice anterior ni se modificaron documentos para publicar esta configuración.

## Evidencia y próximos pasos

Evidencia versionable en [correcciones-2026-10-28/](correcciones-2026-10-28/): pruebas, build/lint, dependencias, configuración Firebase, disponibilidad y capturas. Los JSON/logs contienen datos ficticios o metadatos agregados, no una exportación del padrón real. Los archivos .local-* conservan salidas transitorias fuera de Git.

Antes de ejecutar la limpieza real se debe comprobar versión publicada y recuperación de la disponibilidad; después, regenerar manifiesto y ejecutarlo con el superadministrador/motivo identificados. La autorización de retirar las pruebas ya existe y no requiere confirmaciones por documento.

Al cerrar el reinicio se deshabilita su reutilización automática sobre datos definitivos y se conserva acceso del superadministrador. La carga final requiere el archivo/fuente del usuario; no fue inventada ni ejecutada.
