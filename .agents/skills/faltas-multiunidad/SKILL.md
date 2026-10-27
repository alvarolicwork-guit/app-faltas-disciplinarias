---
name: faltas-multiunidad
description: "Desarrollar o modificar reglas de App Faltas: permisos por usuario, historial, reincidencia, traspasos, anulaciones e importaciones. Aplicar al dominio de esta app existente, no a otros proyectos."
---

# App Faltas en operación

La app ya está desplegada, conectada a Firebase y en uso, confirmado por el usuario. Se evoluciona sobre datos e historial existentes.

Leer [base funcional](../../../docs/BASE_CONOCIMIENTO_APP.md) y, para el módulo afectado, [auditoría H01-H20](../../../docs/auditoria-2026-10-26/INFORME.md). Contrastar con código y últimas instrucciones: las notas históricas no prueban el estado remoto actual.

Para cambiar funciones por usuario, expresar rol × acción × recurso × ámbito × condición × datos visibles. Distinguir permiso deseado, permiso declarado y comportamiento efectivo. No inventar una nueva matriz: concretar la solicitada por el usuario. Roles vigentes están en src/lib/domain/roles.ts y constants.ts; no forman una jerarquía acumulativa uniforme.

Coordinar rutas API, reglas Firestore, componentes, caché, datos y consumidores. Ocultar un botón no autoriza un recurso; Admin SDK requiere controles en servidor. Revisar personalId aun sin scope explícito y perfiles sin unidad. Preservar la comprobación global de reincidencia para personas autorizadas sin divulgar expedientes ajenos.

Preservar personalId, ci_registry y referencias históricas. Distinguir unidad actual, sancionadora y de servicio histórico. Usuarios de acceso y personal del padrón son entidades diferentes. Mantener nombres de colecciones y estado interno anulada; mostrar «Dejar sin efecto» / «sin efecto» en sanciones.

La memoria de decisiones histórica en ../../../../.ai/decisions.md exige aceptación de traspasos. La transferencia directa actual es una divergencia para resolver explícitamente. Anular un antecedente requiere revisar dependientes; su efecto jurídico necesita sustento institucional, no anulación automática inventada.

Revisar el catálogo y las reglas de 365 días en código; no presentar su existencia como validación normativa. Art. 12 inc. 1 genera remisión según implementación actual. Para importación, considerar validación, identidad, lotes parciales, reintento y reversión. BSFP es otra app: no cambiarla ni activar sincronización por implicación.

Comprobar flujos permitidos y denegados, recursos propios/ajenos, sesiones y estados afectados. Informar qué se verificó localmente, con mocks, emulador o servicio real. Los tests de reproducciones.cjs confirman fallos antiguos y necesitan expectativas seguras al corregirlos; no son una suite de seguridad aprobada.
