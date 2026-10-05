# Sports Value Lab — Runners SMART exactos

Mappings confirmados:

## NBA
- P1_COMPLETO -> actualizarApuestasNBA
- P2_CHECK -> revisarP2NBAGratis
- P2_AUTO -> actualizarP2NBAAuto
- P2_FORCE -> forzarP2NBAOdds

## NHL
- P1_COMPLETO -> actualizarApuestasNHL
- P2_CHECK -> revisarP2NHLGratis
- P2_AUTO -> actualizarP2NHLAuto
- P2_FORCE -> forzarP2NHLOdds

## NFL
- P1_COMPLETO -> actualizarApuestasNFL
- P2_CHECK -> revisarP2NFLGratis
- P2_AUTO -> actualizarP2NFLAuto
- P2_FORCE -> forzarP2NFLOdds

## Soccer
- P1_COMPLETO -> actualizarFutbolGlobal
- P2_CHECK -> revisarP2FutbolGratis
- P2_AUTO -> actualizarP2FutbolAuto
- P2_FORCE -> forzarP2FutbolOdds

## Tennis
- P1_COMPLETO -> actualizarApuestasTenis
- P2_CHECK -> revisarEventosTenis
- P2_AUTO -> actualizarP2AutoTenis
- P2_FORCE -> forzarActualizacionCuotasTenis

## Conexión

En cada Apps Script deportivo:
1. Añadir el archivo runner específico.
2. Crear Script Property SVL_RUNNER_TOKEN con el mismo secreto ya usado en NBA.
3. Desplegar como Web app: ejecutar como Yo; acceso Anyone.
4. Copiar URL /exec.

En el bridge central añadir:
- SVL_RUNNER_NHL_URL
- SVL_RUNNER_NFL_URL
- SVL_RUNNER_SOCCER_URL
- SVL_RUNNER_TENNIS_URL

NBA ya usa SVL_RUNNER_NBA_URL.

No poner tokens ni URLs privadas en código cliente. Las URLs se conservan en Script Properties del bridge.

Primera prueba de cada deporte: sólo P2_CHECK, uno por uno. Validar CONTINUITY/API_LOG y confirmar créditos ejecución=0 antes de habilitar pruebas que compran odds.
