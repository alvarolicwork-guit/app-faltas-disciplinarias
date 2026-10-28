# Actualización autorizada de la versión actual — 27/10/2026

El usuario autorizó publicar todos los cambios hasta la versión actual. Se conserva su decisión anterior de publicar sin exportar datos. Esta etapa comprende código y documentación; no incluye depuración, migración, carga de pruebas ni cambios en expedientes reales.

## Alcance del corte

- Personal mantiene la búsqueda y ficha del efectivo; Sanciones registradas reúne los registros por unidad; la bandeja de solicitudes es única y conserva el ámbito y las facultades de cada rol.
- La navegación móvil muestra el panel lateral al abrir el menú; se conservan cierre y navegación. Ajustes de foco de modales, caché por sesión y descarte de respuestas tardías.
- Reportes elimina la aclaración repetida y alinea encabezados/resultados del desglose por conducta, con desplazamiento horizontal de la tabla en móvil.
- Un rechazo expreso verificable permite utilizar el antecedente antes de completar siete días. Un rechazo automático conserva la espera ordinaria y cualquier solicitud pendiente sigue bloqueando. Se guarda el fundamento en sanciones e informes separados de auditoría.
- Conserva identidad, unidad histórica, conductas/cadenas independientes, plazo anual y cancelación extraordinaria. La excepción de prueba de espera está limitada por código al entorno demo de desarrollo y no se activa en producción.

Referencias: [navegación](PLAN_NAVEGACION_PERSONAL_SANCIONES_2026-10-27.md), [regla tras rechazo](IMPLEMENTACION_RECHAZO_EXPRESO_2026-10-27.md).

## Preparación y comprobaciones

- Base local/remota comprobada: `1b2f820968b20a74b787bbc2c994ca7bc5264495`, rama main del repositorio existente. Health de producción confirmó esa revisión antes del corte.
- Lint, 48 pruebas de dominio, 11 de importación, 24 de servidor y compilación de producción aprobados: 83 pruebas automatizadas. La suite de servidor se ejecutó con Auth/Firestore aislados de la demo manual; los resultados se conservan en la evidencia local de publicación.
- Se conservan las comprobaciones previas de navegación/API/Chrome, menú táctil emulado, alineación de reportes y presentación de rechazo expreso. No se confunden con pruebas en teléfono físico ni con un recorrido autenticado de producción.
- Escaneo de208 archivos candidatos sin coincidencias de los patrones de claves privadas/tokens revisados. No equivale a una auditoría exhaustiva de secretos. `.env.local`, `.local-demo/` y `.data-backups/` permanecen excluidos.
- No hay cambios de reglas o índices Firestore en este corte ni nuevas colecciones. No se requiere desplegarlos de nuevo.

## Publicación y verificación

Flujo autorizado: commit y push a GitHub/main, despliegue automático de Vercel y comprobación de la revisión exacta mediante `/api/health`. También se comprobarán la pantalla de acceso y respuestas sin sesión de las rutas protegidas. La evidencia final con revisión y fecha se guarda en el registro operativo del workspace para evitar un commit adicional solo por anotar el identificador del propio corte.

El programador autenticado de vencimientos continúa pendiente de configuración, como ya se informó; los controles temporales se aplican al consultar y resolver. No se inicia un nuevo acceso OAuth ni se contrata un servicio. Los cinco conflictos históricos previamente identificados conservan su revisión pendiente; no se corrigen datos por inferencia.

La prueba posterior del usuario debe usar sus credenciales reales y la URL de producción. No se trasladan cuentas demo a Firebase real ni se borran registros al publicar.
