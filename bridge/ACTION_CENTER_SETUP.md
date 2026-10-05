# Action Center — conexión de runners SMART

Sports Value Lab no reescribe los scripts SMART existentes. Cada script añade un adaptador pequeño que expone sus funciones actuales a la web.

## Seguridad

- El navegador nunca ve las URLs de los runners ni el token.
- Vercel habla sólo con `SVL_Google_Bridge`.
- El bridge llama a cada runner con un token compartido guardado en Script Properties.
- P1/AUTO/FORCE siguen usando la lógica y la API key del script original.
- CHECK P2 sigue siendo el modo sin compra de odds.

## En cada uno de los 5 Apps Scripts (NBA, NFL, NHL, Soccer, Tennis)

1. Añade un archivo `SVL_Sport_Runner_Adapter.gs` con el contenido del archivo del repo.
2. En **Configuración del proyecto → Propiedades de secuencia de comandos**, añade:
   - `SVL_RUNNER_TOKEN`: un secreto largo que tú elijas. Usa el MISMO en los cinco runners y en el bridge central. No lo envíes por chat.
   - `SVL_FN_P1_COMPLETO`: nombre exacto de la función existente que ejecuta P1 COMPLETO.
   - `SVL_FN_P2_CHECK`: nombre exacto de la función existente que ejecuta CHECK P2.
   - `SVL_FN_P2_AUTO`: nombre exacto de la función existente que ejecuta P2 AUTO.
   - `SVL_FN_P2_FORCE`: nombre exacto de la función existente que ejecuta P2 FORCE.
3. Despliega ese Apps Script como **Aplicación web**:
   - Ejecutar como: Yo
   - Acceso: Cualquier usuario / Anyone
4. Copia su URL `/exec`.

## En el bridge central (Sports_Value_Lab_Registro_CURRENT)

Añade en Script Properties:
- `SVL_RUNNER_TOKEN`: el mismo secreto.
- `SVL_RUNNER_NBA_URL`
- `SVL_RUNNER_NFL_URL`
- `SVL_RUNNER_NHL_URL`
- `SVL_RUNNER_SOCCER_URL`
- `SVL_RUNNER_TENNIS_URL`

Cada valor es la URL `/exec` del runner correspondiente.

Después actualiza la implementación del bridge central a la versión que incluye `doPost`.

## Gate operativo de la web

La web aplica antes de llamar al runner:
- Snapshot pendiente de ChatGPT → bloquea nuevos scans.
- P1 → sólo cuando el motor marca P1 requerido.
- CHECK P2 → permitido como discovery cuando no hay snapshot pendiente; 0 créditos de odds.
- P2 AUTO → sólo tras CHECK con eventos CURRENT nuevos.
- P2 FORCE → sólo con CONTEXT_WATCH/FORCE y confirmación explícita de gatillo material.
- NBA con SCRIPT_SCOPE_MISMATCH → bloquea acciones que compran odds; CHECK puede permanecer disponible.
- P1/AUTO/FORCE requieren confirmación explícita porque compran odds.

El runner sigue siendo responsable de respetar su scope CURRENT y de no convertir discovery-only en compra de odds.
