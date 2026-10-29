# App Faltas — Control Disciplinario

Aplicación Next.js/React/TypeScript con Firebase Auth y Firestore para padrón departamental, registro disciplinario por unidad, reincidencia por conducta, solicitudes, cancelaciones e informes.

La referencia funcional está en [docs/BASE_CONOCIMIENTO_APP.md](docs/BASE_CONOCIMIENTO_APP.md). Para esta actualización consultar [plan](docs/PLAN_CORRECCIONES_AUDITORIA_2026-10-28.md) y [ejecución y evidencias](docs/EJECUCION_CORRECCIONES_2026-10-28.md).

## Desarrollo y pruebas

Requisitos: Node22, npm, Java21 para emuladores y Firebase CLI15.1.0. Instalar con npm ci. Las pruebas de navegador usan Playwright del proyecto; en Linux instalar Chromium mediante npx playwright install --with-deps chromium. En Windows se usa Chrome instalado o PLAYWRIGHT_CHANNEL.

Prueba manual aislada:

~~~powershell
npm run dev:demo
~~~

Consultar [la guía local](docs/PRUEBA_LOCAL_MANUAL.md). No sustituir el comando por npm run dev sin revisar el destino: la configuración habitual puede apuntar a Firebase publicado.

Comprobaciones secuenciales con datos ficticios:

~~~powershell
npm run lint
npm run test:domain
npm run test:imports
npm run test:rejection
npm run test:emulator
npm run test:corrections
npm run test:e2e
npm run build
~~~

Los emuladores usan demo-app-faltas. No ejecutar dos suites de servidor simultáneamente ni ocupar una demo manual con datos del usuario. La CI ejecuta estas comprobaciones sin credenciales reales.

## Configuración y publicación

.env.example enumera variables sin secretos; usar .env.local fuera de Git. El cliente solo autentica mediante Firebase Auth y consulta datos mediante API autorizada. Firestore deniega lectura/escritura directa de clientes. Admin SDK conserva controles propios de rol, unidad, sesión y transacción.

La publicación utiliza GitHub/main y Vercel. Publicar índices antes de activar consultas nuevas y comprobar revisión de health, reglas remotas y disponibilidad de índices. Las cabeceras de seguridad y la caché privada se configuran en next.config.ts. Nunca sustituir secretos por valores ficticios en producción.

El procesador de solicitudes acepta CRON_SECRET o el OIDC firmado del workflow de vencimientos del repositorio/propietario y rama main aprobados. El programador elegido es GitHub Actions en este repositorio público, con runner estándar y sin artefactos ni secretos adicionales. Su ejecución debe comprobarse; el ejemplo de Vercel en deploy/ no prueba que exista un cron. No cambiar servicios ni facturación para resolver un límite sin la autorización correspondiente. BSFP es otra aplicación y no se activa por publicar este proyecto.

## Operación y reinicio de pruebas

La identidad de una persona es personalId y su CI registrado. La unidad del usuario registrador pertenece al acceso, no al padrón. Un relevo conserva historia por unidad.

Las importaciones guardan progreso/resultado; continuar un lote desde la pantalla evita repetir cargas después de un corte. Los plazos y la tipificación se evalúan en servidor.

La eliminación ordinaria de una sanción conserva su registro como sin efecto. El reinicio administrativo de datos de prueba es un procedimiento diferente: manifiesto, mantenimiento, lotes reanudables, subcolecciones, auditoría técnica y verificación. El usuario autorizó retirar las pruebas actuales, conservando accesos y unidades útiles; no se exportan documentos automáticamente.

~~~powershell
npm run data:cleanup:preview
~~~

Este comando solo evalúa y muestra conteos/huella. La ejecución usa la herramienta documentada en el plan y exige proyecto, operador, motivo y manifiesto exactos. No ejecutar ejemplos antiguos de limpieza, no crear un endpoint de reset para registradores y no reutilizar autorización de pruebas sobre futuras cargas reales.

Los registros/evidencias locales de pruebas van en .local-* y .local-demo; no guardar credenciales ni documentos de personas en el repositorio.
