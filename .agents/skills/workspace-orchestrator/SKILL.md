---
name: workspace-orchestrator
description: "Elegir un conjunto mínimo de skills locales para una tarea de App Faltas que atraviese varios módulos o workflows. No activar una cadena completa para consultas o cambios simples."
---

# Selección proporcional de workflows

Usar solo las skills que aporten a la petición; leer sus SKILL.md antes de aplicarlas. Las skills están junto a esta carpeta y son específicas del proyecto.

| Necesidad | Skill |
|---|---|
| Retomar contexto | project-memory |
| Permisos o reglas disciplinarias | faltas-multiunidad |
| Investigar error reproducible | debug-investigation |
| Cambio transversal o estructural | architecture-guard |
| Reorganizar código existente | safe-refactor |
| Revisar diff o regresiones | code-review |
| Emisión formal de memorándums solicitada | memorandum-engine, solo invocación explícita |

El diagnóstico y el alcance preceden a una modificación relevante; revisar el resultado cuando haya cambio funcional. No imponer todas las etapas a un arreglo local ni convertir una petición en un rediseño general.

El nombre «orchestrator» significa selección de workflows, no delegación automática. Crear subagentes solo con autorización del usuario o instrucciones aplicables que la exijan y permitan. Esta skill no cambia modelo, instala herramientas, activa servicios ni publica cambios por sí misma.
