# Sports Value Lab — Data Ingestion Hardening v1.0

## Objetivo

Eliminar uploads manuales recurrentes para fuentes de temporada. P5 debe consumir una capa persistente que refresca fuentes, conserva bytes inmutables por hash, mantiene una copia CURRENT y escribe un manifest de ejecución con origen, retrieved_at, updated_at, SHA-256, tamaño, cobertura y estado.

## Contrato de almacenamiento

- Datos de temporada/resultados/features: `DATA/<sport>/ingestion/`.
- `CURRENT/`: copia mutable del último archivo aceptado + manifest CURRENT.
- `snapshots/`: snapshots de fuente content-addressed por SHA-256; mismos bytes no se duplican.
- `manifests/`: manifest inmutable por ejecución.
- `ODDS_ARCHIVE`: sólo precios/snapshots de mercado realmente utilizados; no mezclar PBP/resultados con odds.

Estados permitidos:
- `CURRENT_VALID`: integridad/cobertura completas y fuente suficientemente asentada.
- `PROVISIONAL_VALID`: integridad/cobertura completas pero susceptible a corrección upstream reciente.
- `INCOMPLETE`: falta fuente, hash, cobertura o integridad.

## NFL — implementado

`bridge/SVL_Data_Ingestion.gs` implementa:

1. schedules desde nflverse/nfldata `games.csv`;
2. release metadata del tag `pbp`;
3. descarga binaria del asset `play_by_play_<season>.csv.gz` dentro de Apps Script;
4. verificación contra digest SHA-256 y tamaño publicados por GitHub;
5. cobertura por `game_id` de todos los REG completados de la temporada CURRENT según schedules;
6. snapshot inmutable por SHA + copia CURRENT;
7. manifest con source_url, retrieved_at, updated_at, sha256, size_bytes, coverage y status;
8. cero odds, cero escritura del registro y cero modificación de modelo.

El fetch corre en Google Apps Script, no en ChatGPT. Esto elimina el problema de que el runtime del chat no pueda transportar release assets binarios.

## Activación única requerida

El código ya está materializado en el repo, pero el Apps Script publicado no se actualiza automáticamente desde GitHub. Una sola vez:

1. añadir `SVL_Data_Ingestion.gs` al proyecto Apps Script del bridge central;
2. actualizar `SVL_Google_Bridge.gs` con la versión del repo;
3. guardar y desplegar una nueva versión de la Web App;
4. ejecutar manualmente `svlInstallDailyIngestionTrigger_()` una vez;
5. autorizar UrlFetch/Drive si Google lo solicita.

Después de esto no se vuelve a pedir `play_by_play_2026.csv.gz` cada semana. El trigger diario sólo crea un snapshot nuevo cuando cambian los bytes.

## Auditoría de los otros deportes

### NBA — NEEDS_ADAPTER
P5 CURRENT usa Basketball-Reference para reconciliación, ESPN como cross-check, NBA.com para discrepancias y SportsDataverse como fuente estructurada/enriquecimiento. Es automatizable, pero los documentos CURRENT no fijan un único artifact URL machine-readable para el refresh semanal. No requiere una política de uploads manuales; requiere fijar el endpoint/adaptador.

### NHL — NEEDS_ADAPTER
El pipeline fastRhockey/SportsDataverse se actualiza diariamente y es ideal para esta misma arquitectura. Falta fijar los artifacts/URLs CURRENT exactos y sus controles de cobertura. Debe ser el siguiente adapter estructurado después de NFL.

### Soccer — NEEDS_ADAPTER
P5 ya tiene league codes CURRENT y una fuente operativa por liga/fecha (ESPN Scoreboard). Es automatizable mediante ventanas de fechas. Hay que congelar endpoint/schema y mantener la regla de verificación oficial para aplazamientos/correcciones.

### Tennis — NEEDS_SPORT_SPECIFIC_DISCOVERY_ADAPTER
ATP/WTA no están definidos como un único archivo recurrente. Requieren discovery por torneo/semana, normalización de identidad, estados retirement/walkover y parser dedicado. La solución correcta es automatizar discovery+parsing; no pedir al usuario que suba cada semana el mismo tipo de archivo.

## Política de P5

P5 debe leer primero el manifest CURRENT del deporte. Si está `CURRENT_VALID` o `PROVISIONAL_VALID`, consume el CURRENT correspondiente respetando las restricciones del playbook. Si está `INCOMPLETE`, reporta el source/gate exacto y no inventa datos. Una corrección upstream genera un nuevo hash/snapshot; nunca reescribe un snapshot inmutable.
