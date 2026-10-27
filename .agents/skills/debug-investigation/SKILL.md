---
name: debug-investigation
description: "Investigar un fallo concreto de App Faltas trazando UI, token, API, rol/unidad y Firestore con evidencia. Aplicar a errores y regresiones, sin abrir auditorías generales no solicitadas."
---

# Investigación de un fallo

Precisar síntoma, resultado esperado, rol/unidad, entrada y entorno a partir de lo disponible; consultar al usuario solo por información imprescindible no recuperable. Revisar git status y diferencias pertinentes.

Trazar la primera divergencia entre UI/hook de API, token/perfil, handler, filtro/índice, transacción y actualización/caché. Revisar flags efectivos, errores ignorados y respuestas HTTP. Un 200 de health no prueba conexión Auth/Firestore; una API sin token con 401 no prueba permisos entre unidades.

Usar datos ficticios y entorno aislado para reproducciones con escrituras. No ejecutar seed, limpieza, importaciones o desactivaciones sobre producción como prueba diagnóstica. No imprimir .env, tokens ni expedientes reales. Una autorización de cambio no implica realizar mutaciones remotas de prueba.

Conservar error y condiciones reproducibles; clasificar hipótesis, evidencia de código, reproducción simulada y resultado real. Aislar problemas del entorno (red sandbox, EPERM de .next) de defectos de app; revisar procesos y rutas antes de reintentar o borrar archivos.

Corregir la causa demostrada dentro del alcance, revisar vías equivalentes y comprobar el comportamiento esperado. No encadenar arreglos especulativos ni limpiar módulos ajenos. Informar causa, cambio, prueba y límite de confianza; si no se reprodujo, decirlo.
