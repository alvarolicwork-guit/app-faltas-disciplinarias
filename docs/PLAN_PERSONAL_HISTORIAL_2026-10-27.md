# Personal e historial individual — plan autorizado, 27/10/2026

Objetivo: desde Personal, buscar un efectivo del padrón general y consultar sus sanciones; al seleccionar unidad, listar personas que tienen registros históricos en ella y consultar ese ámbito inicialmente. No equivale a una asignación de personal por unidad.

## Alcance y permisos

| Rol | Padrón/búsqueda | Historial al seleccionar | Historial departamental |
|---|---|---|---|
| admin_dpto / super_admin | General; por unidad deriva de sanciones | Departamental sin unidad; de la unidad cuando se selecciona | Permitido con opción explícita |
| visor_dpto | Conserva consulta general | Igual ámbito de consulta | Conserva permiso de lectura |
| admin_unidad / operador_unidad | Listado de sancionados de su unidad | Solo sanciones de su unidad | Denegado en API e interfaz |

Las búsquedas de antecedentes para registrar continúan siendo un flujo independiente. No se alteran escritura de sanciones, cancelaciones, asignaciones de registradores, reincidencia ni conservación histórica.

## Pasos

1. Respaldar los tres archivos existentes afectados y conservar los cambios locales previos.
2. Unificar búsqueda sin distinción de mayúsculas/tildes, por CI, nombres o apellidos y combinaciones en distinto orden. Eliminar el segundo filtro incompatible del cliente; conservar paginación de50 y orden visible por grado/apellidos/nombres. Las búsquedas se aplican al enviar el formulario.
3. Permitir volver desde el filtro de unidad a todo el padrón; distinguir búsqueda general de listado de sancionados y evitar que respuestas antiguas reemplacen una consulta nueva.
4. Incorporar una ventana de historial individual con carga/error/reintento, ámbitos explícitos, filtros Todos/Registradas/Sin efecto, fechas y unidad registradora, documentos, falta cometida, reincidencia, motivo y antecedentes relacionados. Mostrar ausencia de sanciones explícitamente.
5. Agregar admin_dpto al permiso compartido de historial global por efectivo, conservando visor/super. Las reglas Firestore ya autorizan lectura departamental para estos tres roles; no requieren despliegue ni ampliación adicional.
6. Verificar API autenticada: roles permitidos/denegados, parámetros de unidad manipulados, historial de ambas unidades y sin efecto. Probar búsqueda con tildes y orden de nombres. Verificar UI y paginación sin truncar historial.
7. Ejecutar lint/tipos/pruebas pertinentes y build; documentar evidencia local. Sin publicación ni mutaciones de datos reales.

## Criterios de aceptación

- Búsqueda general incluye efectivos sin sanciones y abre su historial o mensaje vacío.
- Una persona aparece una vez en cada listado de unidad donde existan sanciones, incluso si quedaron sin efecto.
- Ámbito de unidad conserva todos sus registros; cambiar al departamental muestra los de otras unidades solo a roles autorizados.
- Las sanciones sin efecto se distinguen y no cuentan como registradas; el historial conserva datos originales y ajustes existentes.
- Cambiar persona, rol, unidad o búsqueda no muestra como actuales los resultados de otra consulta.
- Los usuarios de unidad no obtienen registros ajenos alterando parámetros ni solicitando global_person.

## Aplicación y comprobación local

Plan aplicado el27/10/2026, sin publicar. Respaldo previo en `.ai/backups/antes-personal-historial-20261027-141912.zip` del workspace padre.

- Búsqueda y permiso compartido: `personal-search.ts`, `personal-search.test.ts`, API de personal y `roles.ts`. La pantalla conserva búsqueda enviada y paginación y descarta respuestas de consultas anteriores.
- Historial: `components/personal/historial-personal.tsx`, integrado desde `personal-page.tsx`. Consulta completa de solo lectura mediante `/api/faltas`, sin límite adicional ni filtro de estado implícito. Filtros de estado locales, ámbito explícito y campos históricos existentes. No altera documentos ni registra cancelaciones.
-42 pruebas de dominio/política/búsqueda aprobadas, tipos/lint y build correctos. Comprobación real de API local con seis perfiles: global permitido a dpto/super/visor, denegado a unidad/operador; manipular unidad no amplía acceso. Búsqueda con tildes/orden cambiado, paginación, historial vacío, registros sin efecto y conservación del padrón/sanciones comprobados. Evidencia: `.local-demo/personal-history-verification.json` y script del mismo directorio; contienen únicamente datos ficticios.
- Navegador IAB con admin_dpto: búsqueda «PARÁLELAS cadenas» encuentra al efectivo; historial inicial de unidad muestra2 registros y cambio departamental muestra5 de ambas unidades; efectivo con una sanción sin efecto conserva el registro y filtro Registradas queda vacío; CI ficticio sin sanciones muestra el mensaje explícito. Captura `.local-demo/historial-personal.png`.
- Las reglas Firestore no cambiaron: ya permiten consulta departamental a admin_dpto. No se certifica el despliegue con estas pruebas; permanecen pendientes la conformidad manual del usuario y la publicación autorizada.
