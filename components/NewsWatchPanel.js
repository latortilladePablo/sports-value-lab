export default function NewsWatchPanel({ news }) {
  const labels = {
    ACTUALIZADO: "Actualizado", DESACTUALIZADO: "Desactualizado",
    NO_CONFIGURADO: "Sin conectar", ERROR: "Error de consulta",
    TITULARES_SIN_VERIFICAR: "Titulares por comprobar",
    SIN_SENALES_EN_FEED: "Sin señales en fuentes consultadas",
  };
  return (
    <section className="newsWatchPanel" aria-label="Noticias deportivas">
      <div className="newsWatchHead">
        <div><span className="eyebrow">SPORTS NEWS WATCH · GRATUITO</span><h2>Novedades prepartido</h2></div>
        <span className="source">{labels[news.freshness] || news.freshness} · {news.checkedAt}</span>
      </div>
      <p className="newsWatchDisclaimer">
        Los titulares RSS son pistas sin verificar, no confirmaciones de lesiones ni autorización para comprar cuotas.
        {news.freshness !== "ACTUALIZADO" ? " Monitor no actualizado: no se puede afirmar que no haya noticias." : ""}
      </p>
      <div className="newsWatchGrid">
        {news.sports.map((sport) => (
          <article className="newsWatchCard" key={sport.id}>
            <h3>{sport.icon} {sport.name}</h3>
            <strong>{labels[sport.status] || sport.status}</strong>
            {sport.articles.length ? (
              <ul>{sport.articles.slice(0, 3).map((item) => (
                <li key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a></li>
              ))}</ul>
            ) : <p>{sport.status === "SIN_SENALES_EN_FEED" ? "No se detectaron titulares relevantes en esta consulta." : "Sin noticias verificables disponibles en este momento."}</p>}
            <p className="newsNextStep"><b>Siguiente paso:</b> {sport.nextStep}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
