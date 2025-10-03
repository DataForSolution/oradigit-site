// OraDigit GPT helper (ES5-safe) — streaming + smart spacing + abort()
// Exposes: window.gpt5.stream({messages, system?, model?, onToken?, signal?})
//          window.gpt5.ask(prompt, {system?, model?, onToken?, signal?})
//          window.gpt5.abort()
(function () {
  'use strict';

  // TEMP: direct Cloud Function URL until auth.oradigit.com is mapped again
var API_URL = "https://us-central1-oradigit-ce343.cloudfunctions.net/chat5";

  var _controller = null;

  // Insert a space if two alphanumerics would touch across token boundaries.
  function needsSpace(prev, next) {
    if (!prev || !next) return false;
    var a = prev.charAt(prev.length - 1);
    var b = next.charAt(0);
    return /[A-Za-z0-9]/.test(a) && /[A-Za-z0-9]/.test(b);
  }

  function stream(opts) {
    opts = opts || {};
    if (!opts.messages || !opts.messages.length) {
      throw new Error('messages[] required');
    }

    var body = { messages: opts.messages };
    if (opts.system) body.system = opts.system;
    if (opts.model)  body.model  = opts.model;

    _controller = new AbortController();
    var signal = opts.signal || _controller.signal;

    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal
    }).then(function (resp) {
      var ct = resp.headers.get('content-type') || '';

      // Server-Sent Events (streaming)
      if (ct.indexOf('text/event-stream') !== -1 && resp.body && resp.body.getReader) {
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var full   = '';

        function pump() {
          return reader.read().then(function (res) {
            if (res.done) return full;

            buffer += decoder.decode(res.value, { stream: true });

            // SSE events separated by a blank line
            var events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (var i = 0; i < events.length; i++) {
              var block = events[i];
              if (!block.trim()) continue;

              // Parse lines like: "event: message" / "data: ..."
              var lines = block.split('\n');
              var type = '';
              var data = '';
              for (var j = 0; j < lines.length; j++) {
                var line = lines[j];
                if (line.indexOf('event:') === 0) {
                  type = line.replace(/^event:\s*/, '').trim();
                } else if (line.indexOf('data:') === 0) {
                  data += (data ? '\n' : '') + line.replace(/^data:\s*/, '');
                }
              }

              if (type === 'message') {
                var chunk = data;
                if (needsSpace(full, chunk)) chunk = ' ' + chunk;
                full += chunk;
                if (typeof opts.onToken === 'function') {
                  try { opts.onToken(chunk); } catch (e) {}
                }
              } else if (type === 'error') {
                try {
                  var je = JSON.parse(data);
                  throw new Error((je && (je.error || je.message)) || 'Server error');
                } catch (e) {
                  throw new Error('Server error');
                }
              }
              // ignore: open/info/done
            }

            return pump();
          });
        }

        return pump();
      }

      // Non-stream fallback (JSON)
      return resp.text().then(function (txt) {
        var isJSON = (resp.headers.get('content-type') || '').indexOf('application/json') !== -1;
        var payload = isJSON ? (function () { try { return JSON.parse(txt); } catch (e) { return null; } })() : null;

        if (!resp.ok) {
          var msg = (payload && (payload.error || payload.message)) || txt || ('HTTP ' + resp.status);
          throw new Error(msg);
        }

        // If API returns {text: "..."} immediately, emit it
        if (payload && payload.text && typeof opts.onToken === 'function') {
          var output = String(payload.text);
          // first token prints as-is
          opts.onToken(output);
          return output;
        }

        return payload != null ? payload : {};
      });
    });
  }

  function ask(prompt, opts) {
    opts = opts || {};
    return stream({
      system: opts.system || 'You are LLbot for OraDigit.com. Be concise.',
      model:  opts.model,
      messages: [{ role: 'user', content: String(prompt || '') }],
      onToken: opts.onToken,
      signal:  opts.signal
    });
  }

  function abort() {
    if (_controller && typeof _controller.abort === 'function') {
      try { _controller.abort(); } catch (e) {}
    }
  }

  window.gpt5 = { stream: stream, ask: ask, abort: abort };
})();
