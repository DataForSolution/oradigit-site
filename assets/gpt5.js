// OraDigit GPT helper (ES5-safe) — streaming + smart spacing + abort()
// Exposes: window.gpt5.stream({messages, system?, model?, onToken?, signal?})
//          window.gpt5.ask(prompt, {system?, model?, onToken?, signal?})
//          window.gpt5.abort()
(function () {
  'use strict';

  var API_URL = 'https://auth.oradigit.com/api/chat'; // maps to your proxy
  var _controller = null;

  // Insert a space if two alphanumerics would touch across token boundaries.
  function needsSpace(prev, next) {
    if (!prev || !next) return false;
    var a = prev.charAt(prev.length - 1);
    var b = next.charAt(0);
    return /[A-Za-z0-9]/.test(a) && /[A-Za-z0-9]/.test(b);
  }

  // Basic JSON post for non-stream fallback
  function postJSON(url, body, signal) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal
    }).then(function (resp) {
      return resp.text().then(function (txt) {
        var ct = resp.headers.get('content-type') || '';
        var isJSON = ct.indexOf('application/json') !== -1;
        var payload = isJSON ? (function () { try { return JSON.parse(txt); } catch (e) { return null; } })() : null;

        if (!resp.ok) {
          var msg = (payload && (payload.error || payload.message)) || txt || ('HTTP ' + resp.status);
          throw new Error(msg);
        }
        return payload != null ? payload : {};
      });
    });
  }

  function stream(opts) {
    if (!opts) opts = {};
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

      // If server provided SSE
      if (ct.indexOf('text/event-stream') !== -1 && resp.body && resp.body.getReader) {
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var full = '';

        function pump() {
          return reader.read().then(function (res) {
            if (res.done) return full;

            buffer += decoder.decode(res.value, { stream: true });
            // SSE events are separated by a blank line
            var events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (var i = 0; i < events.length; i++) {
              var block = events[i];
              if (!block.trim()) continue;

              // Typical lines: "event: message" then "data: <chunk>"
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
                // Try to surface server error message
                try {
                  var je = JSON.parse(data);
                  throw new Error(je && (je.error || je.message) || 'Server error');
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

      // Fallback: non-stream JSON response
      return resp.text().then(function (txt) {
        var isJSON = (resp.headers.get('content-type') || '').indexOf('application/json') !== -1;
        var payload = isJSON ? (function () { try { return JSON.parse(txt); } catch (e) { return null; } })() : null;

        if (!resp.ok) {
          var msg = (payload && (payload.error || payload.message)) || txt || ('HTTP ' + resp.status);
          throw new Error(msg);
        }

        // If the API returns {text: "..."} or similar, emit it at once
        if (payload && payload.text && typeof opts.onToken === 'function') {
          var output = String(payload.text);
          // naive tokenization for uniform behavior
          if (needsSpace('', output)) { /* no-op for first token */ }
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

  // public API
  window.gpt5 = {
    stream: stream,
    ask: ask,
    abort: abort
  };
})();
