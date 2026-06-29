# Importacion historica de sanciones

## Alcance

La funcion es temporal, exclusiva para `super_admin` y permite cargar sanciones
historicas desde archivos `.xlsx` o `.csv`. La importacion no modifica la unidad,
grado, nombres ni apellidos actuales del personal.

Para desactivarla despues de la carga inicial:

```env
HISTORICAL_SANCTIONS_IMPORT_ENABLED=false
```

## Columnas

Obligatorias:

- `ci`
- `fecha_sancion`
- `articulo`
- `inciso`
- `documento_sancion`
- `numero de documento de sancion`
- `codigo`

Informativas u opcionales:

- `n`
- `grado`
- `nombres`
- `apellidos`
- `motivo`
- `unidad`

El codigo de unidad es el dato vinculante. El nombre de unidad de la planilla se
compara con el catalogo, pero no reemplaza el nombre oficial.

## Normalizaciones

- Fechas: `d/m/aaaa`, `dd/mm/aaaa`, `d-m-aaaa`, ISO y fechas reales de Excel.
- Unidad: `U-44` se convierte en `U-044`.
- Articulo: `ART. 10`, `Art 10` o `10`.
- Inciso: `NUM. 3`, `Inc. 3` o `3`.
- Documento:
  - Art. 9: `Acta-000/aaaa`.
  - Art. 10 y 11: `Memorandum-000/aaaa`.
- Motivo vacio: se registra como no disponible en la fuente historica.

Art. 12 inc. 1 no se importa porque corresponde a remision a Regimen
Disciplinario.

## Flujo operativo

1. Abrir `Registro de Falta`.
2. Abrir `Importacion historica en bloque`.
3. Seleccionar la planilla.
4. Presionar `Analizar archivo`.
5. Revisar filas validas, advertencias, errores y duplicados.
6. Descargar el reporte CSV de filas rechazadas.
7. Confirmar escribiendo `IMPORTAR SANCIONES`.
8. Verificar el historial y registrar manualmente las filas rechazadas despues de corregirlas.

La vista previa no crea sanciones. La escritura comienza unicamente despues de
la confirmacion. Las filas validas y con advertencias se registran; las filas con
error o duplicadas se omiten y permanecen disponibles en el reporte.

## Reincidencias

Las filas se analizan cronologicamente por efectivo. Las repeticiones directas
dentro de 365 dias se bloquean para revision. Art. 10 inc. 1 y Art. 11 inc. 1
requieren un unico origen identificable; si existen varios candidatos, la fila
debe registrarse manualmente.

## Reversion

Una importacion confirmada puede revertirse desde el listado de importaciones
recientes. Se requiere:

- motivo de al menos 10 caracteres;
- confirmacion `REVERTIR IMPORTACION`;
- ausencia de sanciones posteriores dependientes.

La reversion no borra documentos. Marca las sanciones como `anulada`, las
excluye del calculo de reincidencias y conserva toda la auditoria.

## Limites

- Formatos: `.xlsx` y `.csv`.
- Tamano maximo: 5 MB.
- Maximo: 2.000 filas por archivo.
- Solo se procesa la primera hoja del archivo Excel.
