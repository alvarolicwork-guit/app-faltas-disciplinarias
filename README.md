# App de Control Disciplinario Multiunidad

Base inicial en Next.js + Firebase para el registro y control de faltas disciplinarias de todo el Comando.

## Alcance implementado (Sprint 1)

- Estructura base web con paleta institucional.
- Integracion de Firebase (cliente y admin).
- Endpoint `POST /api/faltas` con:
  - validacion de rol,
  - validacion de unidad,
  - control de reincidencia global de 365 dias,
  - bloqueo por misma tipificacion,
  - escritura de auditoria.
- Endpoint `GET /api/faltas` con filtros principales y scope por rol.
- Endpoint `GET /api/health`.
- Archivos de reglas e indices Firestore listos para despliegue.

## Requisitos

- Node.js 20+
- Proyecto Firebase creado
- Colecciones base en Firestore:
  - `users`
  - `personal`
  - `faltas`
  - `audit_logs`
  - `imports_personal`

## Configuracion

1. Copiar variables de entorno:

```bash
cp .env.example .env.local
```

2. Completar `.env.local`:

- Variables `NEXT_PUBLIC_*` para cliente Firebase.
- Variables `FIREBASE_*` para Admin SDK.

Nota: `FIREBASE_PRIVATE_KEY` debe guardarse con saltos de linea escapados (`\n`).

## Desarrollo local

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Seguridad y datos

- La regla de reincidencia usa ventana movil de 365 dias hacia atras desde la nueva `fechaSancion`.
- El bloqueo revisa historial global del efectivo, sin importar unidad actual.
- Toda creacion de falta genera evento en `audit_logs`.

## Siguientes entregables recomendados

1. Implementar login real con Firebase Authentication en UI.
2. Crear modulo de importacion Excel con validacion por filas y chunks.
3. Completar reportes mensuales y exportacion PDF.
