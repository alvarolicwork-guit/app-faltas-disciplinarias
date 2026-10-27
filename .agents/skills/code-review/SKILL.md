---
name: code-review
description: "Revisar cambios de App Faltas para detectar regresiones funcionales, permisos cruzados, inconsistencias de datos y límites de validación. Aplicar a revisión solicitada o cierre de cambios relevantes."
---

# Revisión basada en evidencia

Leer el objetivo acordado y el diff, incluidos archivos no versionados pertinentes. Seguir los contratos afectados hacia callers y consumidores; no limitarse a las líneas editadas. Priorizar errores demostrables sobre estilo o preferencias de arquitectura.

En permisos revisar todas las vías: GET/POST/PATCH/DELETE, relevo, importaciones, integración, reglas Firestore y UI. Probar ausencia de token, token inválido/revocado, cuenta bloqueada, perfil sin unidad, rol inesperado y recurso de otra unidad cuando sean relevantes. La comprobación cliente y los mocks no sustituyen una autorización de servidor ni una prueba real de reglas.

En datos comprobar continuidad de personalId, referencias, unicidad, transacciones, auditoría atómica cuando corresponda, reintentos/lotes parciales y anulaciones dependientes. Revisar filtros antes de límites, paginación, zona horaria y respuestas de error cuando el diff los afecte.

Para cada hallazgo indicar archivo/línea, condición o entrada, efecto observable, evidencia y prioridad proporcional. No declarar explotación a partir de un aviso de paquete ni dar por corregido Hxx por una compilación. Las reproducciones de auditoría pasan cuando encuentran el fallo antiguo: revisar sus expectativas al remediar.

Si no hay hallazgos accionables, decirlo con alcance y pruebas ejecutadas. Una revisión propia no es independiente: no crear un segundo agente por defecto ni afirmar independencia. La conclusión debe distinguir hallazgos confirmados, riesgos pendientes y decisiones de negocio.
