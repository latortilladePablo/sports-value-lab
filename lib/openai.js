const OPENAI_BASE = "https://api.openai.com/v1";

export function openAIConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

export function openAIModel() {
  return process.env.SVL_OPENAI_MODEL || "gpt-6-sol";
}

async function request(path, body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no configurada");

  const response = await fetch(OPENAI_BASE + path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  if (!response.ok) {
    throw new Error(json?.error?.message || `OpenAI HTTP ${response.status}`);
  }
  return json;
}

export async function createConversation(metadata = {}) {
  return request("/conversations", { metadata });
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if ((content?.type === "output_text" || content?.type === "text") && content?.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n\n").trim();
}

export async function createAnalysisResponse({ conversationId, instructions, input }) {
  const body = {
    model: openAIModel(),
    conversation: conversationId,
    instructions,
    input: [{ role: "user", content: input }],
    store: true,
  };

  if (String(process.env.SVL_AI_WEB_SEARCH || "").toLowerCase() === "true") {
    body.tools = [{ type: "web_search" }];
    body.max_tool_calls = 8;
  }

  const response = await request("/responses", body);
  return {
    raw: response,
    id: response.id,
    model: response.model || openAIModel(),
    text: extractOutputText(response),
    usage: response.usage || null,
  };
}
