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

## Reparación del bloqueo `SCRIPT_SCOPE_MISMATCH` (NBA · octubre 2026)

El motor CURRENT puede ordenar `P1_COMPLETO` al empezar el nuevo ciclo y, al mismo
tiempo, denegar la compra si `NBA_CONTROL` conserva `Captura odds = Sí` para
`NBA Preseason` o `NBA Summer League`. Esto son dos hechos independientes:
**siguiente paso requerido** frente a **autorización para ejecutarlo**.

La web lee `NEXT_ACTION=P1_COMPLETO` desde la fila más reciente de
`NBA_CONTINUITY!X:X`, pero la autorización sigue exigiendo scope correcto.

### Reparar la captura original (no solamente la visualización)

1. Abre el **Apps Script SMART de NBA** donde están definidas
   `actualizarApuestasNBA`, `revisarP2NBAGratis`, `actualizarP2NBAAuto` y
   `forzarP2NBAOdds`. El archivo `SVL_NBA_Runner.gs` del repositorio es
   sólo un **adaptador**; no es el motor original.
2. En la lista/scope de competiciones de descubrimiento y en las rutas de
   `/odds`, aplica **una allowlist explícita de NBA regular season CURRENT**.
   No basta con filtrar picks después de consumir cuotas. Excluye Preseason,
   Summer League y cualquier otro torneo fuera del Playbook NBA vigente de
   `P1_COMPLETO`, `P2_AUTO` y `P2_FORCE`.
3. Haz que el CONTROL se genere desde **esa misma allowlist efectiva**. Tras
   ejecutar CHECK P2 gratuito, `NBA_CONTROL` debe mostrar
   `Captura odds = No` para los torneos excluidos. **No cambies esas celdas
   manualmente para fingir que el script fue corregido.**
4. Guarda y despliega una **nueva versión** del Apps Script (la URL /exec puede
   permanecer). Si modificaste adaptadores/bridge, despliega esas versiones
   también.
5. Desde Action Center ejecuta **CHECK P2** sin créditos y verifica:
   `NBA_CONTROL`, `NBA_CONTINUITY` y `API_LOG`; la web debe mostrar
   `Siguiente paso: P1 COMPLETO` sin `SCRIPT_SCOPE_MISMATCH`.
6. Ejecuta P1 COMPLETO desde la web con confirmación de créditos, descarga
   el snapshot y pásalo al análisis P1 en ChatGPT. No ejecutes P2 AUTO hasta
   que exista P1 válido del ciclo y un nuevo CHECK que lo justifique.

**Seguridad:** no desactives `svlNBAScopeGuard_` para desbloquear el botón,
no cambies sólo el status de la web, no difundas `SVL_RUNNER_TOKEN` ni
`SVL_BRIDGE_TOKEN`, no borres snapshots del ciclo anterior.

**Diagnóstico actual:** el CHECK `NBA-P2_CHECK-20261026-221508` registró
cinco eventos CURRENT nuevos, cero cuotas y decisión `P1_REQUIRED`.
Se anotó el handoff explícito en CONTINUITY; la corrección pendiente es el
script SMART original. El código Next.js y el adaptador no pueden reescribir
automáticamente un proyecto Apps Script no conectado al repositorio.
