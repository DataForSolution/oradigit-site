<script>
// Minimal client for OraDigit's GPT proxy (SSE). No temperature is sent.
(function () {
  const API = "https://auth.oradigit.com/api/chat"; // points to your chat5 via rewrite

  async function stream({ messages, system, model, onToken, signal }) {
    if (!Array.isArray(messages)) {
      throw new Error("messages[] required");
    }
    const controller = new AbortController();
    const useSignal = signal || controller.signal;

    const body = JSON.stringify({
      // model is optional; server defaults to gpt-4o and ignores temperature
      ...(model ? { model } : {}),
      ...(system ? { system } : {}),
      messages
    });

    const resp = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: useSignal
    });

    // Handle non-OK quickly
    if (!resp.ok) {
      const maybeJSON = await resp.text().catch(() => "");
      try {
        const j = JSON.parse(maybeJSON);
        throw new Error(j.error || j.message || `HTTP ${resp.status}`);
      } catch {
        throw new Error(maybeJSON || `HTTP ${resp.status}`);
      }
    }

    // If SSE: parse events and accumulate final text
    if (resp.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          if (!evt.trim()) continue;
          const lines = evt.split("\n");
          const type = (lines[0] || "").replace(/^event:\s*/, "").trim();
          const data = (lines.slice(1).join("\n") || "").replace(/^data:\s*/, "");

          if (type === "message") {
            full += data;
            if (typeof onToken === "function") onToken(data);
          } else if (type === "error") {
            let msg = "Server error";
            try { msg = JSON.parse(data).message || msg; } catch {}
            throw new Error(msg);
          }
          // type === "open" / "info" / "done" are informational
        }
      }
      return full;
    }

    // Non-SSE (shouldn’t happen now, but just in case)
    const json = await resp.json().catch(() => ({}));
    if (json.error) throw new Error(json.error);
    return json;
  }

  async function ask(prompt, opts = {}) {
    return stream({
      system: opts.system || "You are LLbot for OraDigit.com. Be concise.",
      model: opts.model, // optional; default is on server
      messages: [{ role: "user", content: prompt }],
      onToken: opts.onToken,
      signal: opts.signal
    });
  }

  // Expose globally
  window.gpt5 = { stream, ask };
})();
</script>
