import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const code = await readFile("lib/news-watch.js", "utf8");
const { normalizeNewsWatch, getNewsWatch } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const sports = [
 {id:"nba", name:"NBA", status:"CHATGPT_REQUIRED", prompt:"P1"},
 {id:"nhl", name:"NHL", status:"AUTO_REQUIRED"},
 {id:"nfl", name:"NFL", status:"P1_REQUIRED"},
 {id:"soccer", name:"Soccer", status:"OK"},
 {id:"tennis", name:"Tennis", status:"ERROR"},
];
const fresh = () => ({schema_version:1,checked_at_utc:new Date().toISOString(),sports:Object.fromEntries(
 ["nba","nhl","nfl","soccer","tennis"].map(id=>[id,{status:"NO_SIGNALS_IN_FEED",articles:[]}])
)});
let data = normalizeNewsWatch(null, sports);
assert.equal(data.freshness,"NO_CONFIGURADO","initial branch must not say no news");
data=normalizeNewsWatch(fresh(),sports);
assert.equal(data.freshness,"ACTUALIZADO");
assert.equal(data.sports[0].status,"SIN_SENALES_EN_FEED");
assert.match(data.sports[0].nextStep,/Analizar CSV.*P1/);
assert.match(data.sports[1].nextStep,/P2 AUTO/);
assert.match(data.sports[2].nextStep,/P1 COMPLETO/);
assert.match(data.sports[4].nextStep,/Resolver bloqueo/);
let withArticle=fresh();
withArticle.sports.soccer={status:"HEADLINES_UNVERIFIED",articles:[{title:"Potential injury",url:"https://example.org/article",published_at:new Date().toISOString()}]};
data=normalizeNewsWatch(withArticle,sports);
assert.equal(data.sports[3].status,"TITULARES_SIN_VERIFICAR");
assert.match(data.sports[3].nextStep,/no capturar cuotas/i,"news must never trigger paid FORCE");
let failed=fresh();failed.sports.nhl={status:"SOURCE_ERROR",articles:[]};
assert.equal(normalizeNewsWatch(failed,sports).sports[1].status,"ERROR");
let old=fresh();old.checked_at_utc=new Date(Date.now()-4*3600*1000).toISOString();
assert.equal(normalizeNewsWatch(old,sports).freshness,"DESACTUALIZADO");
let malformed=fresh();delete malformed.sports.tennis;
assert.equal(normalizeNewsWatch(malformed,sports).freshness,"NO_CONFIGURADO");
const prior=process.env.SVL_NEWS_WATCH_URL;
process.env.SVL_NEWS_WATCH_URL="https://example.org/news.json";
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>({ok:false});
try {
 data=await getNewsWatch(sports);
 assert.equal(data.freshness,"ERROR");
 assert.equal(data.sports[0].status,"ERROR");
} finally {
 globalThis.fetch=originalFetch;
 if (prior===undefined) delete process.env.SVL_NEWS_WATCH_URL;
 else process.env.SVL_NEWS_WATCH_URL=prior;
}
console.log("PASS: fresh, initial, stale, malformed, source error, fetch failure, P1/P2 priority and no paid FORCE");
