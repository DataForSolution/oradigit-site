// Minimal client for OraDigit's GPT proxy (SSE). ES5-compatible (no spread / optional chaining).
(function () {
  var API = "https://auth.oradigit.com/api/chat"; // mapped to chat5

  function stream(opts) {
    if (!opts) opts = {};
    if (!Array.isArray(opts.messages)) throw new Error("messages[] required");

    var payload = { messages: opts.messages };
    if (opts.system) payload.system = opts.system;
    if (opts.model) payload.model = opts.model;

    var controller = new AbortController();
    var useSignal = opts.signal || controller.signal;

    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: useSignal
    }).then(function (resp) {
      var ct = resp.headers.get("content-type");
      if (!resp.ok) {
        return resp.text().then(function (txt) {
          try { var j = JSON.parse(txt); throw new Error(j.error || j.message || ("HTTP " + resp.status)); }
          catch (e) { throw new Error(txt || ("HTTP " + resp.status)); }
        });
      }

      // If SSE, parse events
      if (ct && ct.indexOf("text/event-stream") !== -1) {
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        var full = "";

        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return full;

            buffer += decoder.decode(r.value, { stream: true });
            var parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (var i = 0; i < parts.length; i++) {
              var evt = parts[i];
              if (!evt.trim()) continue;
              var lines = evt.split("\n");
              var type = (lines[0] || "").replace(/^event:\s*/, "").trim();
              var data = (lines.slice(1).join("\n") || "").replace(/^data:\s*/, "");

              if (type === "message") {
                full += data;
                if (typeof opts.onToken === "function") opts.onToken(data);
              } else if (type === "error") {
                try { var j = JSON.parse(data); throw new Error(j.message || "Server error"); }
                catch (e) { throw new Error("Server error"); }
              }
              // ignore: open/info/done (informational)
            }
            return pump();
          });
        }
        return pump();
      }

      // Non-SSE fallback (shouldn’t happen now)
      return resp.json().then(function (json) {
        if (json && json.error) throw new Error(json.error);
        return json;
      })["catch"](function () { return {}; });
    });
  }

  function ask(prompt, opts) {
    opts = opts || {};
    return stream({
      system: opts.system || "You are LLbot for OraDigit.com. Be concise.",
      model: opts.model,
      messages: [{ role: "user", content: prompt }],
      onToken: opts.onToken,
      signal: opts.signal
    });
  }

  window.gpt5 = { stream: stream, ask: ask };
})();
