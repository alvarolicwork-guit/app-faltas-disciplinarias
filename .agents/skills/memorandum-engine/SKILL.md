---
name: memorandum-engine
description: "Diseñar emisión formal de memorándums en App Faltas con plantilla institucional, impresión segura y trazabilidad. Solo invocación explícita; no aplicar al registro de números de documento ni a reportes genéricos."
---

# Emisión de memorándums

Esta capacidad es opcional y no significa que la app ya emita memorándums: actualmente registrar un número de memorándum/acta y emitir un documento son funciones distintas. Aplicar solo cuando el usuario solicite este workflow.

Consultar [diseño de referencia](references/diseno-memorandums.md) para contrato de destinatario, autoridad, plantilla, edición e impresión. Es una propuesta técnica adaptable, no una plantilla legal aprobada ni un esquema existente que deba migrarse automáticamente.

Definir con datos reales autorizados el tipo de documento, numeración/ámbito/año, autoridad firmante, relación con trámite y permisos de emitir/reimprimir/anular. Validar la fuente normativa y no inventar firmas, cargos o texto legal. Usar catálogo de grados y formato institucional vigente del proyecto.

Distinguir vista previa, reserva/emisión y reimpresión. La autorización y unicidad se resuelven en servidor con registro auditable. La ventana de impresión puede cancelarse: no afirmar entrega o impresión física exitosa por abrirla. Acordar el significado de contadores y estados.

Escapar contenido dinámico; edición limitada y segura en lugar de HTML libre. Preservar datos y referencias. Verificar documento renderizado, márgenes, saltos, firmas y ausencia de controles de app, además de errores, permisos y reintento. No instalar un motor de documentos ni crear colecciones sin que lo requiera el alcance autorizado.
