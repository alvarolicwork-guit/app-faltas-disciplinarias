# Publicación autorizada — 27/10/2026

El usuario dio conformidad a la revisión local y autorizó publicar para comprobar el funcionamiento real. Eligió expresamente **publicar sin exportar los datos**. No se ejecutan limpieza, migración, restauración ni registros ficticios en producción. La conexión existente corresponde a `control-disciplinario-comando`.

## Preparación

- Rama `main`, remoto `alvarolicwork-guit/app-faltas-disciplinarias`; coincidencia local/remota previa `b141f5b7321e3f19bf4643595b5deeced511466e`.
- Flujo existente: push a GitHub/main y despliegue automático Vercel, dominio `app-faltas-disciplinarias.vercel.app`. La publicación no introduce otros proveedores ni activa BSFP.
- Verificación final:42 pruebas de dominio/política/búsqueda y11 de importación aprobadas, lint y compilación de producción correctos. Se conserva la evidencia previa de emuladores y las pruebas autenticadas locales de seis perfiles.
- Escaneo de199 archivos candidatos sin claves privadas/tokens detectados. `.env.local`, `.local-demo/` y `.data-backups/` están excluidos de Git. Cuentas y contraseña demo son ficticias; no se copian usuarios/personal del emulador a Firebase real.
- La excepción de espera exige `NODE_ENV=development`, proyecto demo y ambos emuladores exactos. En producción conserva la espera de siete días. El endpoint health incorpora la revisión Git para verificar el código realmente servido.
- Publicación de reglas Firestore limitada al archivo revisado. No se despliegan cambios de índices ajenos al alcance ni se eliminan registros.

## Límites operativos que se conservan

- Cinco registros históricos requieren revisión documental por solapamiento/bifurcación. No se reinterpretan ni corrigen automáticamente: el motor rechaza operaciones cuyo fundamento no se puede verificar y conserva la historia.
- Los vencimientos se aplican en consultas/resoluciones aunque no haya tarea periódica; el procesamiento en segundo plano necesita configurar `CRON_SECRET` y un programador compatible con el plan Vercel. El cron de cinco minutos es una plantilla, no una configuración activa. No se autoriza contratar un plan o servicio de pago.
- La sesión CLI de Vercel está vencida. La revisión automática rechazó iniciar el acceso OAuth de GitHub; se usa el enlace de despliegue existente y los estados de GitHub. Una conexión autorizada de Vercel sigue siendo necesaria para configurar o inspeccionar opciones administrativas adicionales.
- El respaldo de datos fue rechazado por revisión automática; tras consultarlo, el usuario eligió continuar sin exportación. No se creó ese respaldo.

## Verificación del corte

Después del push se comprobarán la revisión servida por `/api/health`, el estado de Vercel en GitHub, la página de acceso y la protección de las rutas nuevas. Estas comprobaciones no sustituyen la prueba del usuario con sus credenciales reales. No se crean sanciones ni se cambian contraseñas de usuarios reales como prueba.

Estado al preparar este documento: publicación en curso. El resultado final se conservará en la memoria operativa del workspace y en una actualización de este informe.
