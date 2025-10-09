// oh-app/src/ui/radiologyForm.tsx
import React, { useState } from "react";

type Props = {
  callTool: (name: string, args: Record<string, unknown>) => Promise<any>;
};

export default function RadiologyForm({ callTool }: Props) {
  const [query, setQuery] = useState("");
  const [modality, setModality] = useState<string | null>(null);
  const [protocols, setProtocols] = useState<string[]>([]);
  const [reason, setReason] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 1) Suggest best modality
    const s = await callTool("suggest_order", { query });
    const suggested = s?.content?.[0]?.json || s;
    const mod = suggested?.modality || "CT";
    setModality(mod);

    // 2) Fetch protocol headers for that modality
    const r = await callTool("search_rules", { modality: mod, term: query });
    const list = (r?.content?.[0]?.json?.records ?? []).map((x: any) => x.header || String(x));
    setProtocols(list);

    // 3) Generate payer-aware final reason
    const a = await callTool("ai_justify", { review: query });
    const text =
      a?.content?.[0]?.text ??
      a?.content?.[0]?.json?.answer ??
      "AI justification unavailable.";
    setReason(text);
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <textarea
        placeholder="Enter clinical question or indication…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={4}
      />
      <button type="submit">Build Order with AI</button>

      {modality && (
        <div className="card">
          <h4>Suggested Modality: {modality}</h4>
        </div>
      )}
      {!!protocols.length && (
        <div className="card">
          <h4>Matching Protocols</h4>
          <ul>{protocols.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {reason && (
        <div className="card">
          <h4>AI Justification</h4>
          <p>{reason}</p>
        </div>
      )}
    </form>
  );
}
