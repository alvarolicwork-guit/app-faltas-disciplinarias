# Instrucciones de App Faltas

Esta es una app operativa de Next.js/React/TypeScript con Firebase Auth, Firestore y Admin SDK. Leer `docs/BASE_CONOCIMIENTO_APP.md` antes de modificar funciones; consultar `docs/auditoria-2026-10-26/INFORME.md` para hallazgos y evidencia. La matriz y la nueva implementación local están en `docs/IMPLEMENTACION_FUNCIONAL_2026-10-27.md`; su existencia no significa que se haya publicado.

La reincidencia por conducta, plazo desde base y promoción de nueva base tiene implementación local y límites documentados en `docs/IMPLEMENTACION_REINCIDENCIA_2026-10-27.md`. Leerla antes de retomar ese flujo; las reproducciones del diagnóstico anterior contienen expectativas del código defectuoso y no sustituyen la suite de aceptación actual.

Las skills propias están en `.agents/skills/`. Seleccionar por alcance y leer sus instrucciones; `memorandum-engine` es explícita y opcional. Si se dispone del workspace padre, consultar también su `AGENTS.md` y `.ai/decisions.md` para decisiones históricas. Si no están disponibles, explicitar la falta y usar los documentos del repositorio; no recrear contexto supuesto.

Preservar cambios locales del usuario, datos e identidad `personalId`. Distinguir unidad actual, sancionadora e histórica. Coordinar autorización de API, reglas Firestore y UI al modificar permisos; no reducir el control a visibilidad de botones. Conservar colecciones y estado interno `anulada`; mostrar «sin efecto».

No inventar requisitos ni normativa. Distinguir evidencia local, simulada y real. Los tests de reproducciones.cjs detectan fallos antiguos y no certifican seguridad. Probar cambios de negocio en entorno aislado con datos ficticios; ningún seed, reset o borrado de producción se infiere de una auditoría o refactor.

La app ya funciona y está desplegada. Cambiar código no implica permiso automático para push a main, publicar en Vercel, desplegar reglas/índices o activar BSFP. Para código ejecutar comprobaciones adecuadas; para skills/documentación validar sus archivos y enlaces. No almacenar credenciales ni datos personales en documentación o evidencias.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
