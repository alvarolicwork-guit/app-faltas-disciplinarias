# Cobertura y reproducción de la auditoría — 28/10/2026

Documento complementario de [INFORME.md](INFORME.md). Referencia: `2c55379adf28145a1c7c72837cb534911a86a707`.

## Qué significa la cobertura

Se inventariaron los 29 archivos `route.ts` de la API y se revisaron los módulos de interfaz, autenticación, autorización, dominio, persistencia, importación y operación relacionados. No se midió porcentaje de líneas ni se afirma probar toda combinación posible de rol, dato y condición de carrera. Las comprobaciones dinámicas y sus límites se especifican a continuación.

Las reglas del producto se contrastan con las decisiones del usuario: padrón general, historial por unidad sancionadora, un registrador activo por unidad, cadenas separadas por persona/artículo/inciso y cancelaciones con trazabilidad. No se incorporan decisiones de otros proyectos.

## Matriz funcional contrastada

La tabla expresa el comportamiento de API/UI observado y la política vigente, no una certificación de todas las lecturas directas de Firestore. F01/F02 son diferencias respecto a esa matriz.

| Función | admin_unidad | operador_unidad | visor_dpto | admin_dpto | super_admin |
| --- | --- | --- | --- | --- | --- |
| Consulta ordinaria de sancionados/historial | Su unidad | Su unidad | Global o unidad elegida | Global o unidad elegida | Global o unidad elegida |
| Búsqueda en padrón para registrar | Sí, catálogo general | No | Consulta general sin registro | Sí | Sí |
| Registrar sanción | Su unidad automática | No | No | Unidad elegida | Unidad elegida |
| Solicitar dejar sin efecto | Solo sus registros, dentro de 7 días | No | No | Sus registros usan cancelación directa | Dispone de cancelación extraordinaria |
| Ver solicitudes | Su unidad | Su unidad | No | Global | Global |
| Aprobar/rechazar solicitud | No | No | No | Sí, con motivo y confirmación | Sí, con motivo y confirmación |
| Cancelación directa ordinaria | No | No | No | Sus registros, dentro de 7 días | Incluida en facultad extraordinaria |
| Cancelación extraordinaria | No | No | No | No | Cualquier fecha, motivo y confirmación; impacto validado |
| Reportes | Su unidad | Su unidad | Global o unidad | Global o unidad | Global o unidad |
| Informes de auditoría | No | No | No | No por API; F01 en Firestore | Sí, sanciones y cancelaciones separados |
| Usuarios | No | No | No | Consulta, edición/relevo limitado; no administra superadministradores | Administración completa con controles de último superadministrador |
| Crear/desactivar usuarios | No | No | No | No | Sí, con controles de jerarquía y continuidad |
| Importación masiva de padrón e históricos | No | No | No | No | Sí, sujeta a configuración y validaciones |
| Unidades | Consulta contextual | Consulta contextual | Consulta | Administración | Administración |

**Aclaración de auditoría:** F01 afecta a `admin_dpto`; `visor_dpto` no puede leer `audit_logs` con las reglas revisadas.

## Módulos, evidencias y límites

| Área | Inspección y pruebas realizadas | Hallazgos / límite |
| --- | --- | --- |
| Inicio de sesión y perfil | Token ausente/inválido, cuenta bloqueada, primer cambio, renovación tras cambio real de contraseña en emulador | F02; sin ingreso real en producción |
| Usuarios y relevo | Permisos de edición, superadministrador protegido, unicidad de registrador, reserva/relevo recuperable, revocación | F02; no se recrearon usuarios reales |
| Reglas Firestore | Reglas locales, denegación de escrituras, ámbito de lecturas, pruebas directas con ID token, comparación de reglas remotas | F01/F02; IAM completo pendiente |
| Padrón y CI | Alta, reserva de CI, búsqueda y ámbito por sanciones, importación; revisión agregada real de correspondencias | F04/F14; volumen de carga no medido |
| Unidades | Gestión, identidad, concurrencia, nombres históricos y reportes | F03/F10 |
| Confirmación de acciones | Contenido/actor/unidad, alteración, vencimiento, reintento y decisión obsoleta | Flujo interno comprobado; no es firma con certificado |
| Registro y reincidencia | Tipificación, origen, conductas paralelas 9/X y 10/X, salto inválido, fechas, cadena vencida, concurrencia | F05 en historial existente |
| Plazos y rechazo expreso | 7 días, solicitud pendiente, 5 días de resolución, rechazo humano, rechazo automático, evidencia | Motor comprobado; F09 en persistencia/presentación diferida |
| Cancelación extraordinaria | Impacto obsoleto, baja de una sanción, rebaja de dependientes, nueva raíz y conservación de clasificación | F08 en bandeja; casos de dominio/servidor positivos |
| Importación histórica | Parser, preview, duplicados, revalidación, origen, lease, reintento y no resurrección | F07/F12 |
| Personal / Sanciones / Solicitudes | Separación de recorridos, permisos, selección de efectivo, seguimiento y notificación | F08; captura y pruebas E2E |
| Panel y reportes | Totales, sanciones sin efecto, agregación por conducta/unidad, mes y fechas | F10/F11/F14; contador antiguo de bloqueos permanece en Reportes como observación de coherencia UX |
| Auditoría y exportación | Informes separados, motivos, clasificación original/actual, CSV, estados | F01/F07/F09/F12 |
| Notificaciones | Destinatarios, unidad ajena, marcado y persistencia, resultado de resolución | Flujo de servidor y UI comprobados; entrega por programador pendiente |
| Móvil | Vista reducida y Pixel 7 con emulación táctil, menú visible, navegación, tabla de reportes con scroll interno | No teléfono físico ni Safari/iOS real |
| Integración de sanciones | Contrato actual y guardas de sesión/confirmación ejercitados en emulador | No intercambio real BSFP; ningún POST a producción |
| Transferencias/reinicio retirados | Rutas deshabilitadas, respuestas 410 y ausencia de asignación actual de personal por unidad | Restos históricos/conservación incluidos en F06 |
| Dependencias y secretos | npm audit, lockfile, escaneo acotado del historial Git | F15; escaneo no exhaustivo de secretos |
| Despliegue y recuperación | Health/revisión, cabeceras, reglas e índices remotos; script de depuración | F06/F13/F16; backup/restauración y cron no certificados |

## Pruebas ejecutadas

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Lint inicial y final | Correcto | `lint.log`, `lint-final.log` |
| Build Next y comprobación de tipos incluida | Correcto | `build.log` |
| Dominio | 48/48 | `domain.log` |
| Importaciones | 11/11 | `imports.log` |
| Workflow + rechazo expreso | 24/24 = 16 + 8 | `server-baseline.log` |
| Workflow + cadenas | 30/30 = 16 + 14 | `server-recurrence.log` |
| Pruebas existentes distintas | **97** = 48 + 11 + 16 + 8 + 14 | Workflow se ejecutó dos veces; no contarlo dos veces |
| Reproducciones adicionales | 13/13 | `reproducciones.log`, `reproducciones-resultados.json` |
| Navegador local | Correcto: 12 verificaciones enumeradas y controles adicionales de menú/reporte Pixel 7 | `ui/e2e.json`, `e2e.log`, capturas y `e2e-auditoria.mjs` |
| Página pública anónima | Login visible a 390 px, sin errores JS; iframe permitido | `navegador-publico.json` |
| Producción, rutas públicas/protegidas | Health 200 con revisión exacta; 6 GET protegidos 401 | `produccion.json` |
| Reglas e índices | Coincidencia exacta de reglas normalizadas; 27 índices declarados disponibles | `produccion.json` |

**Advertencia de interpretación:** los tests A01–A08/A10 reproducen condiciones defectuosas. Su resultado PASS confirma que el defecto está presente. No deben integrarse como pruebas de aceptación de comportamiento seguro sin invertir sus expectativas después de corregirlo. A09 y los grupos de controles comprueban comportamiento válido.

Los logs conservan errores 500/403 provocados deliberadamente con entradas ficticias. No indican que haya fallado la ejecución final del conjunto. El primer intento de E2E se detuvo por un selector ambiguo; `failure-*` conserva esa evidencia. El intento final terminó con código 0 y sin errores de navegador registrados.

## Reproducción local

Ejecutar desde la raíz Git `app-faltas`. Confirmar primero que los puertos de las configuraciones de emulador están libres; no apagar servicios ajenos, reutilizar una demo con datos manuales ni cambiar las guardas a proyectos reales. Los comandos siguientes usan instancias temporales sin importar ni exportar la base manual.

```powershell
npm run lint
npm run test:domain
npm run test:imports
npm run test:rejection
npm run test:emulator
npm run build
```

Los comandos de emuladores deben ejecutarse **uno después del otro**, no en paralelo. `test:rejection` usa 8188/9198; `test:emulator` usa 8087/9097. En esta auditoría estos últimos estaban libres y se arrancó una instancia nueva, no se importaron archivos de persistencia de la demo manual.

Reproducciones de auditoría, puertos 8188/9198, siempre con proyecto demo:

```powershell
firebase emulators:exec --only 'firestore,auth' --project demo-app-faltas --config firebase.rejection.test.json 'node --import tsx --test --test-concurrency=1 docs/auditoria-2026-10-28/reproducciones.test.cjs'
```

E2E adaptado de auditoría, emuladores 8087/9097 y servidor temporal 3137:

```powershell
firebase emulators:exec --only 'firestore,auth' --project demo-app-faltas --config firebase.test.json 'node --import tsx docs/auditoria-2026-10-28/e2e-auditoria.mjs'
```

El E2E usa Playwright instalado en el runtime local de Codex; su ruta está en el script y puede requerir adaptación en otro equipo. No instalar dependencias ni sustituir conexiones automáticamente. Su `finally` cierra el proceso servidor que él mismo inició.

Los scripts `integridad-agregada.cjs` y `verificar-produccion.mjs` son de lectura real y no forman parte de la regresión normal. Requieren las credenciales y el proyecto exactos mediante el mecanismo autorizado, sin imprimir secretos. No ejecutarlos automáticamente al correr tests. `cleanup-production-data.mjs`, seeds y scripts de migración real **no forman parte de esta auditoría ejecutable**.

## Contraste con la auditoría del 26/10

La auditoría anterior es una instantánea válida de otra revisión. No se eliminan ni se marcan retroactivamente como falsos sus hallazgos. Esta tabla describe el cambio observado; “corregido en el código revisado” no equivale a certificar toda la operación real.

| Anterior | Estado actual observado |
| --- | --- |
| H01, historial global por personalId | Corregido el alcance de API; negativas por unidad y `scope=global_person` comprobadas |
| H02, relevo de cuenta superior | Controles de jerarquía incorporados; flujo de relevo/reserva comprobado |
| H03, contraseña confiada al cliente | Cambio por servidor y bloqueo previo comprobados; renovación de sesión en emulador correcta |
| H04, rol de unidad sin unidad | API rechaza estado incompleto; persiste disparidad de controles directos descrita en F02 |
| H05, catálogo no validado | Validación y tipificación efectiva incorporadas; saltos inválidos y bases paralelas cubiertos |
| H06/H07, transferencias | Retiradas del modelo actual; rutas 410. No restaurarlas para resolver problemas del padrón general |
| H08, solicitud de autor ajeno | Autor y ámbito controlados, cubiertos por pruebas de workflow |
| H09, último superadministrador | Protección reforzada en persistencia; no se ensayó eliminar un superadministrador real |
| H10, dependencias | Versiones cambiaron; diagnóstico actual es F15. No conservar automáticamente la anterior etiqueta “crítica” |
| H11, HTML sin escapar | Escape incorporado en impresión; queda un vector de exportación distinto: F07 (CSV) |
| H12, estado activo y revocación | Estado activo/primer cambio corregidos; revocación y condiciones restantes en F01/F02 |
| H13, importación histórica | Lease, revalidación e idempotencia incorporados y probados; recuperación operativa/totales siguen en F12 |
| H14, reinicio de padrón | Operación retirada; procedimiento externo de depuración requiere F06 |
| H15, truncamiento | Paginación de padrón y consulta completa reemplazan límites anteriores; carga no acotada F14 y lista de lotes F12 |
| H16, unicidad/auditoría | Reserva de CI y flujos transaccionales mejorados; colisión de unidades persiste como F03 |
| H17, token inválido 500 | 70 negativas ordinarias devolvieron 401; ya no se reproduce ese comportamiento |
| H18, dependientes de anulada | Rebaja extraordinaria y nueva raíz incorporadas/probadas; F05 identifica ambigüedades de datos anteriores |
| H19, CSV con comillas | Parser revisado con pruebas de importación; no se vuelve a aplicar el diagnóstico del parser anterior |
| H20, integración BSFP | Entrada actual exige contrato/sesión/confirmación y delega al flujo común; negativa probada en emulador. Intercambio externo real pendiente |

## Orden y criterios de cierre

| Etapa | Hallazgos | Condición para cerrar |
| --- | --- | --- |
| Autorización | F01/F02 | API y Firestore aplican la misma política, incluida revocación, y reglas publicadas coinciden |
| Integridad de altas/cargas | F03/F04/F12 | Concurrencia sin pérdidas; lotes recuperables y totales verdaderos |
| Historial existente | F05 | Documentos contrastados; corrección autorizada y diagnóstico sin ambigüedades no resueltas |
| Cancelaciones | F08/F09 | Todo estado localizable, vencimientos procesados/notificados y cron comprobado |
| Consultas/exportación | F07/F10/F11/F14 | Celdas seguras, identidad de unidad estable, fechas coherentes y carga medida |
| Seguridad/operación | F13/F15/F16 | Cabeceras comprobadas, dependencias tratadas, referencia y pruebas oficiales vigentes |
| Preparación de limpieza | F06 | Manifiesto autorizado, alcance completo, conservación y recuperación ensayadas; ninguna exportación implícita |

Al finalizar las correcciones, repetir los casos afectados, los controles de permisos y la regresión de cadenas. Solo entonces emitir un nuevo dictamen con fallos cerrados y pendientes aceptados. Esta auditoría autoriza documentar problemas; no autoriza por sí sola arreglos, borrado ni despliegue.
