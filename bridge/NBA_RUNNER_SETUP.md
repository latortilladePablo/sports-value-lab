# NBA Runner — conexión exacta

Funciones NBA confirmadas:

- P1 COMPLETO → `actualizarApuestasNBA()`
- CHECK P2 → `revisarP2NBAGratis()`
- P2 AUTO → `actualizarP2NBAAuto()`
- P2 FORCE → `forzarP2NBAOdds()`

## NBA Apps Script

1. Añade un archivo nuevo llamado `SVL_NBA_Runner.gs`.
2. Copia el contenido de `SVL_NBA_Runner.gs` de este repo.
3. En Script Properties crea `SVL_RUNNER_TOKEN` con un secreto largo nuevo.
4. Despliega como Web app:
   - Ejecutar como: Yo
   - Acceso: Cualquier usuario / Anyone
5. Copia la URL `/exec`.

## Bridge central

En Script Properties del bridge central:
- `SVL_RUNNER_TOKEN` = exactamente el mismo secreto del NBA runner.
- `SVL_RUNNER_NBA_URL` = URL `/exec` del NBA runner.

Actualiza la implementación del bridge central después de confirmar que usa la versión con dispatcher.

## Primera prueba

Usar sólo **CHECK P2 NBA** desde Action Center. CHECK no compra odds.
No probar P1/AUTO/FORCE hasta verificar:
- runner conectado,
- estado CURRENT actualizado,
- respuesta JSON correcta,
- CONTROL/CONTINUITY/API_LOG reflejan el CHECK,
- NBA scope guard sigue bloqueando compras fuera de regular season.
