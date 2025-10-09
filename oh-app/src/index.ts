// oh-app/src/index.ts
// Minimal MCP server that exposes three tools and calls your Firebase functions.
// Docs: Apps SDK + MCP overview :contentReference[oaicite:1]{index=1}

/* eslint-disable @typescript-eslint/no-explicit-any */
const FNS_BASE = process.env.FNS_BASE || "https://us-central1-oradigit-ce343.cloudfunctions.net";

// Helper to POST JSON
async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${url} → ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

// Tool implementations
async function toolSuggestOrder(args: { query: string }) {
  const data = await postJSON<any>(`${FNS_BASE}/suggest`, { query: args.query });
  return { content: [{ type: "json", json: data }] };
}

async function toolSearchRules(args: { modality: string; term?: string }) {
  const data = await postJSON<any>(`${FNS_BASE}/rules_search`, {
    modality: args.modality,
    term: args.term || ""
  });
  return { content: [{ type: "json", json: data }] };
}

async function toolAiJustify(args: { review: string }) {
  const data = await postJSON<any>(`${FNS_BASE}/aiHelper`, { review: args.review });
  return { content: [{ type: "text", text: data.answer ?? JSON.stringify(data) }] };
}

/**
 * The Apps SDK will import this module and expect a default export that
 * lists & handles tools per MCP. The exact adapter varies by SDK runtime;
 * most examples expose a factory or object with `tools` and `handlers`.
 * See the Apps SDK reference for your chosen runtime. :contentReference[oaicite:2]{index=2}
 */
export default {
  tools: [
    {
      name: "suggest_order",
      description:
        "Given a free-text clinical question, propose a best-fit modality and return structured fields from published rules.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string", minLength: 1 } },
        required: ["query"]
      },
      handler: toolSuggestOrder
    },
    {
      name: "search_rules",
      description: "Search published rules by modality and optional term; returns matching protocol headers.",
      input_schema: {
        type: "object",
        properties: {
          modality: { type: "string" },
          term: { type: "string" }
        },
        required: ["modality"]
      },
      handler: toolSearchRules
    },
    {
      name: "ai_justify",
      description:
        "Generate payer-aware documentation: Appropriateness, Documentation notes, Alternatives, and a final one-line Reason.",
      input_schema: {
        type: "object",
        properties: { review: { type: "string", minLength: 1 } },
        required: ["review"]
      },
      handler: toolAiJustify
    }
  ]
};
