# Auditoría integral de App Faltas — 28/10/2026

Autorización: auditar permisos, seguridad, datos y funcionamiento, documentando problemas. No incluye corregir la aplicación, publicar, depurar, exportar datos reales ni activar integraciones.

Referencia inicial: `2c55379adf28145a1c7c72837cb534911a86a707`; árbol limpio antes de la auditoría. Las notas de publicación de `.ai/session.md` prevalecen sobre documentos anteriores que dicen «sin publicar».

## Recorrido de revisión

1. Inventariar API, reglas Firestore, perfiles y superficies de lectura/escritura.
2. Revisar autenticación, cambios de acceso, confirmaciones y aislamiento por unidad.
3. Revisar registro, reincidencias, solicitudes, cancelaciones, importaciones y relaciones históricas.
4. Revisar consultas, estadísticas, exportaciones, navegación, caché y operación del despliegue.
5. Ejecutar comprobaciones estáticas, suites existentes y reproducciones adicionales en emuladores aislados.
6. Contrastar el despliegue mediante consultas públicas/configuración de solo lectura y diagnóstico de integridad agregado. No ingresar con cuentas reales ni exportar sus documentos; los diagnósticos procesan lecturas en memoria y guardan solo cantidades, categorías y huellas.
7. Emitir informe, matriz de cobertura y prioridades, distinguiendo evidencia de código, emulador y producción.

## Límites de prueba

- Datos ficticios; pruebas adicionales y rechazo en 8188/9198. Las suites originales y E2E usaron una instancia temporal nueva en 8087/9097 después de comprobar que estaban libres, sin importar ni exportar la persistencia de la demo manual.
- Sin certificación jurídica de artículos o plazos: se contrastan las decisiones funcionales aprobadas por el usuario.
- No se considera «seguro» un módulo solo porque compile o sus pruebas existentes pasen.
- Un fallo reproducido se documenta; no se corrige en esta etapa.
- No se afirma una revisión independiente: la realiza el mismo asistente que participó en la implementación.

## Resultado

Revisión completada y documentada en [INFORME.md](INFORME.md) y [COBERTURA.md](COBERTURA.md): 16 hallazgos, 6 P1, 9 P2 y 1 P3. Correcciones, publicación y depuración no ejecutadas. El informe distingue reproducción de fallos, controles positivos y verificaciones operativas pendientes.
