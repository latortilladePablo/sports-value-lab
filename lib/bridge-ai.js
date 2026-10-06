async function bridgePost(body) {
  const url = process.env.SVL_GOOGLE_BRIDGE_URL;
  const token = process.env.SVL_BRIDGE_TOKEN;
  if (!url || !token) throw new Error("Bridge Google no configurado");

  const sep = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${sep}token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json,text/plain,*/*" },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!response.ok || !json?.ok) {
    throw new Error(json?.error || `Bridge HTTP ${response.status}`);
  }
  return json;
}

export function getAnalysisSnapshot(sport, runId) {
  return bridgePost({ command: "snapshot", sport, runId });
}

export function completeChatGPTAnalysis({ sport, runId, nextAction, note }) {
  return bridgePost({
    command: "chatgpt_handoff",
    sport,
    runId,
    nextAction,
    note,
  });
}
