# Prueba local manual de App Faltas

Fecha:27/10/2026. Secuencia acordada: **prueba local → publicación tras conformidad → comprobación del despliegue → depuración de registros identificados como pruebas**. No se ha publicado ni autorizado una limpieza inmediata.

## Acceso

Dirección mientras el servidor esté iniciado: [http://localhost:3000](http://localhost:3000).

Proyecto: `demo-app-faltas`, con Auth y Firestore emulados en este equipo. No utiliza el padrón ni las sanciones de producción. Estas cuentas y su contraseña son **credenciales ficticias de prueba local**.

El correo y la contraseña del sistema publicado no se copian a este entorno. La pantalla de ingreso local muestra sus cuentas de prueba; se comprobó el acceso con `super@demo.local` en el navegador integrado.

Contraseña común: `PruebaLocal2026!`

| Cuenta | Rol | Unidad |
|---|---|---|
| `super@demo.local` |super_admin|Global|
| `dpto@demo.local` |admin_dpto|Global|
| `unidad1@demo.local` |admin_unidad|Unidad ficticia Uno|
| `unidad2@demo.local` |admin_unidad|Unidad ficticia Dos|
| `operador@demo.local` |operador_unidad|Unidad ficticia Uno|
| `visor@demo.local` |visor_dpto|Consulta global|

Cerrar sesión antes de cambiar de cuenta. La inicialización conserva los cambios de prueba existentes cuando se vuelve a iniciar con una exportación; no reasigna automáticamente roles que se hayan cambiado durante un relevo.

## Recorrido propuesto

1. **Registro normal:** entrar como `unidad1`, buscar CI`99000001` —Cabo Persona Nueva— y registrar una conducta9/X. Revisar confirmación, autor y unidad. En la prueba manual está desactivada exclusivamente la espera de siete días: repetir la misma conducta permite comprobar inmediatamente9/X→10/1→11/1. El panel muestra la excepción local. Para comprobar la espera normal, iniciar con la opción estricta descrita abajo.
2. **Conductas paralelas:** buscar CI`99000002`. La conducta9/1 ya tiene cadena9/1→10/1→11/1. La conducta9/2 tiene9/2→10/1. Repetir9/2 debe proponer11/1 de esa conducta, sin tomar el11/1 de9/1. Los antecedentes de la segunda conducta son de la Unidad Dos; el nuevo registro realizado por `unidad1` debe quedar en la Unidad Uno.
3. **Vencimiento:** buscar CI`99000003`. Su cadena nació en10/5 hace400 días y contiene11/1 posterior. Una nueva conducta10/5 debe iniciar otra base10/5; no continuar la cadena vencida.
4. **Solicitud de cancelación:** buscar CI`99000004`. Tiene una sanción de hace dos días, registrada por `unidad1`. Solicitar dejarla sin efecto con motivo. Entrar como `dpto` para aprobar/rechazar indicando motivo; volver a `unidad1` para revisar notificación y estado.
5. **Solicitud pendiente:** CI`99000005` tiene9/4 con una solicitud todavía vigente. Repetir esa conducta debe informar que el antecedente no está disponible por la solicitud pendiente.
6. **Solicitud vencida:** CI`99000006` tiene una solicitud presentada hace seis días. Al consultar solicitudes debe materializarse su rechazo por vencimiento, con auditoría y notificación, sin dejar sin efecto la sanción.
7. **Cancelación extraordinaria:** entrar como `super`, localizar la base de una de las cadenas de CI`99000002`, revisar impacto y cancelar con motivo. Solo la elegida debe quedar sin efecto; sus descendientes bajan un nivel y el año se recalcula desde la fecha de la sanción promovida. La otra conducta permanece intacta.
8. **Ámbitos:** entrar como `unidad2`, `operador` y `visor` para comprobar los permisos y las consultas. Operador y visor no registran sanciones; los usuarios de unidad consultan su ámbito.
9. **Auditoría:** con `super`, generar por separado sanciones y cancelaciones; comprobar originales, ajustes, unidades, motivos y plazos. Exportar únicamente estos datos ficticios si se desea revisar los archivos.
10. **Contadores por rol:** `unidad1`, `unidad2` y `operador` ven reincidencias registradas de su unidad; `visor`, reincidencias globales. `dpto` y `super` ven solicitudes de cancelación pendientes. Pulsar la tarjeta abre la bandeja, ordenada por vencimiento y con tiempo restante. Aprobadas, rechazadas y vencidas no se cuentan como pendientes; las notificaciones no leídas son un indicador independiente. El panel se actualiza automáticamente cada minuto para los responsables de resolver.

Los memorándums/actas precargados pertenecen a escenarios ficticios; sus fechas son relativas al momento de crearlos. Algunas sanciones están fechadas antes para poder comprobar plazos sin esperar días reales. Las nuevas operaciones se registran por los flujos normales de la app.

Los CI de esta guía son ejemplos ficticios del proyecto emulado. No introducir información personal real en este entorno.

## Iniciar, conservar y detener

Desde la raíz `app-faltas`:

```powershell
npm run dev:demo
```

Por petición del usuario, este iniciador activa `LOCAL_DEMO_SKIP_RECURRENCE_WAIT=true`. La excepción exige simultáneamente desarrollo, proyecto `demo-app-faltas` y ambos emuladores en los puertos locales exactos. No se activa en producción. Los registros generados con esta opción conservan `pruebaLocalSinEspera:true`, también en la auditoría. Se mantienen el año de la cadena, las solicitudes pendientes y los plazos de cancelación/resolución.

Para una sesión manual con la espera normal, detener y guardar la sesión anterior, y ejecutar:

```powershell
$env:LOCAL_DEMO_SKIP_RECURRENCE_WAIT='false'
npm run dev:demo
```

Para volver a omitirla, iniciar otra sesión con la variable en `true`. Las suites automatizadas no activan esta excepción por defecto. Cambiar esta opción requiere reiniciar el servidor.

Comprobación del27/10:40 pruebas de dominio/política aprobadas, tipos y lint correctos. API local: registro efectivo consecutivo9/1→10/1→11/1 para la persona ficticia independiente CI`99000999`, bloqueo por solicitud pendiente y reinicio por vencimiento anual comprobados. Evidencia local en `.local-demo/skip-wait-verification.json`. Los11 registros anteriores se conservaron; el reinicio importó la exportación de Auth/Firestore. Esta persona adicional es exclusivamente de verificación y tiene una solicitud ficticia pendiente para probar el bloqueo.

El iniciador comprueba que los puertos3000,4400,8087 y9097 estén disponibles, usa únicamente el proyecto demo y abre Next.js en `127.0.0.1:3000`. Requiere Firebase CLI y Java, ya utilizados en las pruebas del proyecto. No ejecutar simultáneamente las suites de emuladores mientras esta sesión manual esté activa.

El log queda en `.local-demo/server.log`; la sesión y los datos exportados del emulador quedan bajo `.local-demo/`, excluidos de Git. Si existe una exportación previa, se importa al iniciar. Ctrl+C en la terminal de inicio solicita cierre y exportación; no garantiza guardar cambios si se cierra forzosamente el proceso/equipo. Se puede pedir a Codex que detenga y guarde la sesión asistida.

No usar `npm run dev` como sustituto de este iniciador para probar sanciones: ese comando conserva la configuración habitual del proyecto y no selecciona por sí mismo los emuladores.

## Publicación y depuración posteriores

La publicación se preparará cuando el usuario confirme el resultado de las pruebas locales. Después se comprobará el funcionamiento del nuevo despliegue antes de depurar datos.

La depuración será un trabajo específico: inventario de los registros realmente creados para pruebas, dependencias y respaldo/restauración, selección revisable y verificación posterior. No se interpretan como desechables todos los176 registros ni el padrón, los usuarios o las unidades por el solo hecho de existir datos de prueba. Se preservará información válida e identidad histórica. Esta guía no ejecuta ni programa ninguna eliminación.
