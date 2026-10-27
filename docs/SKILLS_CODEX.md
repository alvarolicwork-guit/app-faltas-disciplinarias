# Evaluación y configuración de skills para App Faltas

Fecha: 26/10/2026. Petición: evaluar utilidad, recomendar complementos y retirar copias innecesarias para trabajar exclusivamente con Codex.

## Resultado de la evaluación

Las ocho skills aportan workflows útiles; sus versiones anteriores tenían redundancias y supuestos ajenos al estado actual. Se preservan sus nombres y se adaptan a esta app en operación. No se incorporó código funcional, no se modificaron roles ni se cambiaron servicios remotos.

| Skill | Adecuación y ajuste |
|---|---|
| faltas-multiunidad | Es la más específica del dominio. Se sustituyó el enfoque «construir nueva app» por evolución de la existente. Se retiró la prohibición antigua que reservaba toda anulación a super_admin: el estado actual y la política documentada también contemplan admin_dpto. La matriz futura sigue pendiente. |
| project-memory | Útil para continuidad. Ahora da prioridad a base funcional actual y consulta selectiva de .ai, evitando crear otra memoria duplicada o repetir como actuales commits/cuentas antiguos. Respeta autorización separada para memoria global. |
| workspace-orchestrator | Útil como selector mínimo. Se eliminó la cadena extensa para cualquier tarea y se aclaró que seleccionar skills no autoriza delegación, instalaciones ni despliegues. |
| architecture-guard | Útil para cambios transversales. Se reemplazaron capas/repositorios genéricos por el mapa real de componentes, hooks, handlers y librerías. No impone Clean Architecture ni una capa de repositorios inexistente. |
| debug-investigation | Adecuada para H01-H20 y regresiones. Se concretó diagnóstico de rol/unidad/token/API/Firestore, con límites entre código, simulación y producción. |
| safe-refactor | Adecuada para preservar contratos e historial. Se separó refactor de cambio funcional solicitado; orientada a IDs, efectos, caché y commits. |
| code-review | Adecuada para revisar vías alternativas de permisos y regresiones. Se prioriza evidencia y casos propios/ajenos; un build o mock no se equipara a validar Firebase real. |
| memorandum-engine | Útil si se solicita emisión formal. No es necesaria para registrar un número de documento ni para cambiar roles. Se conserva solo para invocación explícita, con el diseño anterior en references/diseno-memorandums.md. No se presume que ese motor esté implementado. |

## Ubicación y limpieza

- Fuente única: `app-faltas/.agents/skills/` desde el workspace, o `.agents/skills/` desde el repositorio.
- Para abrir Codex desde el workspace padre se usa `.agents/skills` como enlace de directorio a la misma fuente. No es otra copia de los archivos.
- Se retiran únicamente `.opencode/skills/`, `.antigravity/skills/` y el script antiguo `scripts/sync-skills.mjs`, que recreaba la duplicación.
- Se conservan los demás archivos de OpenCode/Antigravity si existen: el usuario pidió retirar copias de skills, no desinstalar aplicaciones o borrar dependencias ajenas.
- El respaldo ZIP y su manifiesto SHA-256 están en `.ai/backups/skills-antes-codex-2026-10-26.*` del workspace. Contienen las 15 copias originales y el script antiguo (16 archivos), sin variables de entorno ni datos operativos. Restaurar es una operación manual que debe respetar cambios posteriores.
- Los AGENTS.md del workspace y repositorio enlazan el contexto y evitan repetir la omisión de las carpetas superiores. Son instrucciones por ámbito; no dos copias de skills.

La ubicación y soporte de enlaces se contrastaron con la [documentación oficial de Codex](https://learn.chatgpt.com/docs/build-skills). Las nuevas skills deberían estar disponibles para la selección en el siguiente turno; la comprobación realizada valida archivos/rutas, no confirma que la interfaz ya las haya cargado.

## Complementos que sí conviene considerar

Se revisaron fuentes de los mantenedores, contenido de entrada y señales públicas de uso. No se instalaron complementos externos en esta tarea: el usuario pidió evaluar y recomendar cuáles incorporar. Las cifras siguientes son una consulta fechada y pueden cambiar; popularidad no demuestra seguridad ni compatibilidad.

### Prioridad 1: Firebase y regresión de autorización

El principal vacío es una guía de **autorización y pruebas por rol/recurso**, además de sesiones y reglas. Los helpers actuales no cubren uniformemente API, Firestore, relevo, importación y caché.

- [firebase-auth-basics, mantenido por Firebase](https://github.com/firebase/agent-skills/blob/main/skills/firebase-auth-basics/SKILL.md): apoyo para identidad/tokens/SDK. La ficha consultada muestra unas [173.700 instalaciones](https://skills.sh/firebase/agent-skills/firebase-auth-basics); repositorio de origen, unas [488 estrellas](https://github.com/firebase/agent-skills). Su orientación incluye puesta en marcha y proveedores nuevos; para esta app debe limitarse a la configuración existente. Su entrada no es una cobertura suficiente de revocación y matriz de autorización.
- [firebase-firestore, mantenido por Firebase](https://github.com/firebase/agent-skills/blob/main/skills/firebase-firestore/SKILL.md): consultas, índices y selección de referencias por edición. Unas [134.300 instalaciones](https://skills.sh/firebase/agent-skills/firebase-firestore). No recomiendo instalarla aislada ni seguirla sin adaptación: remite a `firestore-rules-creation` para reglas y contiene rutas de creación de bases/selección Enterprise que no corresponden a migrar esta app por defecto. Resolver sus dependencias antes de incorporarla; no confundir una recomendación con autorización para crear bases o desplegar.

Recomendación técnica: complementar esas referencias con una skill **local específica de autorización de App Faltas**, que use la matriz que se acuerde y exija casos positivos/negativos por recurso. Debe diferenciar API con Admin SDK de reglas del cliente, perfil sin unidad, estado activo, token revocado, cambio de rol, H01-H04/H08-H09/H12 y sesiones/caché. No se creó esa skill porque la nueva política aún no está definida; tampoco necesita inventarla para probar restricciones vigentes.

### Prioridad 2: pruebas de flujos reales

[Playwright de Microsoft](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/tools/skills/playwright-cli/SKILL.md) aporta automatización y trabajo con suites de pruebas; su [documentación oficial](https://github.com/microsoft/playwright.dev/blob/main/agent-cli/skills.mdx) contempla skills en `.agents/skills`. El repositorio consultado tiene unas [98.500 estrellas](https://github.com/microsoft/playwright); no se verificó un contador de instalaciones de esta skill y no se inventa uno.

Adecuado para comprobar login, cambio obligatorio de contraseña, navegación por rol, registro/reincidencia, traspasos, anulación e importaciones. Antes de incorporarlo hay que seleccionar el workflow compatible con las herramientas de navegador disponibles, verificar CLI/navegadores y preparar cuentas/datos de prueba aislados. Evitar guardar estados autenticados o expedientes en Git. Ni una captura de pantalla ni un mock de red verifican por sí solos las reglas de acceso reales.

### Prioridad 3: React y Next.js

[vercel-react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) aporta guías de rendimiento: carga de datos, cascadas de peticiones, bundle y renderizado. Se observaron unas [840.400 instalaciones](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices) y [33.000 estrellas](https://github.com/vercel-labs/agent-skills) en su repositorio. Es pertinente para dashboard, reportes y componentes; no sustituye pruebas de permisos ni justifica cambiar estrategia de caché o arquitectura automáticamente.

No son prioritarias nuevas skills de Supabase, Render, Azure, generación visual o un motor documental para la modificación de roles: no cubren la carencia principal del stack actual.

## Hallazgos documentales que afectan la evaluación

La revisión completa de `.ai/decisions.md` aporta una regla histórica explícita: el envío de personal exige solicitud y aceptación/rechazo de destino. H07 ya no carece de una política documentada para contrastarlo: el traslado directo es una divergencia respecto de esa regla. Sigue pendiente saber si la futura política mantendrá ese circuito o autorizará excepciones.

El checklist `.ai/auditoria-checklist.md` también documenta una limpieza histórica completada y puntos aún abiertos. Eso no demuestra que el endpoint actual de reinicio preserve relaciones: H14 se refiere al código de ese endpoint. Mantener ambas evidencias con su fecha y alcance, sin declarar el problema resuelto por el procedimiento antiguo.

No se reauditaron los 20 hallazgos ni se ejecutaron correcciones de negocio. La evaluación de skills incorpora evidencia documental adicional y señala estas diferencias para la etapa siguiente.

## Verificación

Validar ocho entradas con `quick_validate.py` de skill-creator, referencias Markdown existentes, nombres únicos, política explícita de memorandum-engine, fuente única, respaldo por hash y ausencia de las dos carpetas duplicadas/script antiguo. La validación es estructural y de consistencia; no equivale a una prueba conductual independiente, a detección confirmada en UI ni a validación de la app.

No se ejecuta lint/build de la app por esta tarea exclusivamente documental/de configuración. No se cambiaron dependencias de la app, reglas Firebase, roles ni despliegue. PyYAML se ubicó temporalmente para el validador, sin instalación en el proyecto.
