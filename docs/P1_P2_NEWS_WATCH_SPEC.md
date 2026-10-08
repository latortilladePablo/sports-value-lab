# Sports Value Lab — Continuidad P1/P2 + Sports News Watch

Estado: propuesta técnica para implementar y probar antes de activar producción. Capital real deshabilitado.

## Contrato visible de Hoy y Actions
Cada deporte debe mostrar: ciclo CDMX; último P1 válido (Run ID/hora); último CHECK; último P2 AUTO/FORCE; snapshot pendiente de ChatGPT; último análisis cerrado; picks nuevos registrados; próxima revisión; estado de noticias.
Separar obligatoriamente CAPTURADO, PENDIENTE_DE_ANALISIS, ANALIZADO y SIN_ACCION_JUSTIFICADA.
Nunca inferir "analizado" sólo porque Apps Script produjo CSV. Si no hay confirmación del análisis, indicar "adjunta el CSV y ejecuta P1/P2".
Un CHECK realizado debe cerrarse: nuevos event_id CURRENT -> P2 AUTO; 0 nuevos con contexto material verificado -> P2 FORCE sujeto a confirmación; ninguno -> NINGUNA. No reabrir un CHECK sólo porque el handoff anterior pedía CHECK.
P1 inicia ciclo semanal y fija universe + futuras ventanas P2; no implica elegir picks ni consumir otro snapshot automáticamente.
P2 debe reportar eventos/líneas comparadas, picks nuevos, cero cuando corresponda, registro real confirmado, próximo gate con fecha/franja CDMX y siguiente comando exacto.
El estado se persiste en Sheets CONTINUITY o tabla operativa equivalente, separado de Picks!A:K y ODDS_ARCHIVE. Las posiciones Pendiente conservan A:J congeladas.

## Monitor de noticias (propuesta: cada hora, sin compra de odds)
Scheduler server-side (p. ej. Vercel Cron) a lo sumo una vez por hora, configurable y con control de presupuesto/rate limits. Guardar last_success_at, last_attempt_at, stale/error y no mostrar "sin novedades" cuando la consulta falló.
Fuente pública verificable con URL + published_at y event/athlete/team; cross-check con fuente oficial cuando haya contradicción. Un modelo puede clasificar relevancia, pero no inventar noticia ni decidir pick basado sólo en titulares.
Alcance limitado a futuros eventos CURRENT aún no iniciados y horizon semanal:
- Tennis ATP/WTA: withdrawal, lesión relevante, cambio de horario/sede, nuevos cruces.
- NHL: goalie confirmado/cambio, scratches, injuries, roster, descanso/back-to-back.
- NFL: QB/inactives/injury-practice, OL/WR/TE/RB, defensa material, clima/roof.
- Soccer: alineaciones, bajas/sanciones/rotación, entrenador, clima/sede y calendario.
- NBA: injury report, starters, roster, suspensiones, rest/b2b.
Deduplicar por source+URL+event+tipo; prioridad alta sólo si el cambio es nuevo, prepartido, material y relacionable a eventos de la cartera.
Estados NEWS_NEW_MATERIAL, NEWS_UNCONFIRMED, NEWS_NONE, NEWS_STALE, NEWS_ERROR. Mostrar fuente, hora CDMX, resumen corto, evento, confianza (confirmado/probable/rumor), próximo paso.
Si hay noticia material sobre evento ya conocido: pedir revisión P2 sin coste primero; indicar P2 FORCE sólo si está justificado recapturar precio/línea; nunca comprar automáticamente.
Si aparece cruce/evento nuevo: CHECK P2 gratuito si no se verificó por event_id; P2 AUTO si CHECK ya lo confirmó.
Si no hay noticia material verificada: "Sin novedades materiales verificadas (última consulta X CDMX)", no "no hubo noticias" absoluto.
Si evento ya inició: no retropredecir ni pedir nuevas cuotas para ese evento.
Alerta en Hoy/Actions con un único CTA por deporte: "Revisar noticia", "Ejecutar CHECK P2", "Ejecutar P2 AUTO", "Ejecutar P2 FORCE", o "Analizar CSV en ChatGPT". Orden: snapshot pendiente > AUTO confirmado > P1 faltante > noticia material/contexto > próxima revisión.
Un aviso NO ejecuta P1/P2, NO genera cuotas, NO modifica picks ni stake, NO escribe en Picks sin análisis y confirmación.

## Gate de activación
1. Configurar fuente/noticias con licencia y límite de uso; credenciales sólo server-side.
2. Implementar almacenamiento durable para deduplicación y checkpoints horarios; cron autenticado y protegido contra ejecuciones simultáneas.
3. Añadir endpoint read-only para Hoy/Actions con estado fresco/stale + alertas; no derivar notificaciones de una caché de UI.
4. Validar contra fixture CURRENT y snapshot P1; exigir timestamps pre-kickoff/puck drop.
5. Pruebas: CHECK repetido no genera bucle; cron sin noticias; cron con noticia verificada; rumor; fuente caída; evento iniciado; snapshot pendiente; P1 no ejecutado; cancelación/rehora; deduplicación.
6. Publicar vía PR, verificar preview, luego desplegar a producción de forma explícita.
