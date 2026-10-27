---
name: safe-refactor
description: "Reestructurar código existente de App Faltas preservando contratos, historial y efectos laterales, o aislar una reorganización necesaria para un cambio funcional autorizado."
---

# Refactor con contratos explícitos

Identificar consumidores, entradas/salidas, permisos y efectos del código antes de reorganizar. Separar la equivalencia que debe conservarse del cambio funcional que el usuario pidió; no ocultar una modificación de permisos dentro de un cambio de estilo.

Revisar con rg imports, handlers, scripts y consumidores indirectos antes de mover, renombrar o retirar. Mantener API, colecciones Firestore, personalId, registros de auditoría y tipos serializados salvo migración o contrato nuevo dentro del alcance.

Para cambios en Auth/Firestore: preservar orden de validación y escritura, commits, unicidad, reintentos y tratamiento de errores. En transacciones una excepción aborta escrituras; no anunciar cambios que no se confirmaron. En UI conservar estados de carga/error e invalidación por identidad/rol/unidad.

Preferir pasos revisables y compatibilidad de callers cuando el alcance lo permita. No imponer capas, servicios o dependencias por estilo. Respetar cambios locales del usuario. Antes de retirar archivos comprobar el destino preservado; las operaciones irreversibles o remotas requieren autorización aplicable.

Ejecutar las verificaciones proporcionales al comportamiento afectado: tipos/lint/build para código, pruebas de contrato y casos de regresión para lógica. No correr build por solo documentación ni repetir suites ya válidas sin motivo. Informar qué cambió de estructura, qué cambió de función y qué se comprobó.
