---
name: architecture-guard
description: "Evaluar impacto transversal en la arquitectura real de App Faltas antes de cambiar permisos, contratos API, persistencia o componentes compartidos. No imponer una arquitectura nueva a cambios locales."
---

# Arquitectura real de App Faltas

Mapa actual: src/components y hooks gestionan UI/sesión/caché; src/app/api contiene handlers; src/lib/domain, faltas e imports contienen validaciones/reglas; src/lib/firebase encapsula SDK cliente/Admin. Firestore rules y API son superficies distintas de autorización.

Inspeccionar contratos y llamadas reales antes de proponer movimiento de código. Este proyecto no tiene una capa universal de repositorios ni inyección de dependencias: no exigirlas ni tratar todos sus handlers actuales como infracciones de una arquitectura hipotética.

Para cambios transversales identificar: entrada UI/API/integración, autenticación y autorización, recurso y unidad, consulta/índices, mutación/auditoría, serialización y caché. Revisar callers y vías alternativas, incluida importación/administración de usuarios. El objetivo es coherencia del comportamiento pedido.

Mantener secretos y Admin SDK fuera del bundle cliente. Un helper compartido de permisos debe servir decisiones consistentes; no asumir que cambiarlo cubre condiciones duplicadas en rutas o reglas. Evitar ciclos y copias divergentes de reincidencia entre alta e integración.

Conservar colecciones, IDs y compatibilidad salvo cambio autorizado con migración explícita. Proponer abstracciones cuando resuelvan duplicación o contratos concretos del alcance. Entregar mapa de impacto breve, pruebas necesarias y riesgos residuales; no exigir aprobación extra para trabajo ya autorizado.
