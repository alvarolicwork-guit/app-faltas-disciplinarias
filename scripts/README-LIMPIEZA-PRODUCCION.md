# Limpieza controlada para produccion

El procedimiento preserva `users`, `unidades`, `audit_logs` y las cuentas de Firebase Authentication.

Elimina datos operativos de `personal`, `ci_registry`, `imports_personal`, `faltas`, `reincidencias_bloqueadas`, `solicitudes_eliminacion_falta`, `transferencias_solicitudes`, `transferencias_logs` e `integraciones_sanciones`.

## Vista previa

```powershell
npm run data:cleanup:preview
```

## Ejecucion

La ejecucion crea primero un respaldo JSON en `.data-backups`, elimina por lotes, verifica que las colecciones queden vacias y registra el evento en `audit_logs`.

```powershell
npm run data:cleanup -- --confirm="LIMPIAR DATOS DE PRUEBA control-disciplinario-comando" --reason="Inicio institucional con datos reales"
```

Nunca ejecutar sin revisar el proyecto y la vista previa.
