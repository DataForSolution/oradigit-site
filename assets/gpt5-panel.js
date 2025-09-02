// Floating AI Summary panel for OraDigit (ES5-safe).
// Requires window.gpt5 from /assets/gpt5.js
(function () {
  if (typeof window.gpt5 !== "object") {
    console.warn("gpt5.js not loaded; panel will not initialize.");
    return;
  }

  function pageText() {
    var el = document.querySelector("main") || document.querySelector("article") ||
             document.querySelector(".content") || document.querySelector(".post-content") ||
             document.getElementById("content") || document.body;
    var t = (el && (el.innerText || el.textContent)) || "";
    t = t.replace(/\s+/g, " ").trim();
    if (t.length > 6000) t = t.slice(0, 6000);
    return t;
  }

  function init() {
    if (document.getElementById("aiSumPanel")) return; // already added

    // panel
    var box = document.createElement("div");
    box.id = "aiSumPanel";
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px;box-shadow:0 6px 24px rgba(0,0,0,.12);max-width:520px;width:min(92vw,520px)";
    box.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
        '<strong style="flex:1">AI Summary</strong>' +
        '<button id="aiStopBtn" type="button" disabled>Stop</button>' +
      '</div>' +
      '<div id="aiOut" style="white-space:pre-wrap;line-height:1.5"></div>' +
      '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">' +
        '<button id="aiSumBtn" type="button">Summarize this page</button>' +
      '</div>';
    document.body.appendChild(box);

    var btn  = document.getElementById("aiSumBtn");
    var stop = document.getElementById("aiStopBtn");
    var out  = document.getElementById("aiOut");

    var activeSession = 0;

    btn.onclick = function () {
      var t = pageText();
      if (!t) { out.textContent = "Sorry—no readable content found on this page."; return; }

      activeSession = Date.now();
      var mySession = activeSession;

      btn.disabled = true;
      stop.disabled = false;
      out.textContent = "Thinking…";
      var full = "";

      window.gpt5.stream({
        system: "You are LLbot for OraDigit.com. Summarize for executives and prospects in 5–7 concise bullets.",
        messages: [{ role: "user", content: "Summarize this page:\n\n" + t }],
        onToken: function (ch) {
          if (mySession !== activeSession) return; // ignore late chunks
          // smart spacing to avoid words sticking together
          if (full && /[A-Za-z0-9]$/.test(full) && /^[A-Za-z0-9]/.test(ch)) { ch = " " + ch; }
          full += ch;
          out.textContent = full;
        }
      })
      .then(function () {
        if (mySession !== activeSession) return;
        btn.disabled = false;
        stop.disabled = true;
      })
      .catch(function (e) {
        if (mySession !== activeSession) return;
        btn.disabled = false;
        stop.disabled = true;
        out.textContent = "Error: " + (e && e.message ? e.message : e);
      });
    };

    stop.onclick = function () {
      activeSession = 0; // cancel updates
      try { window.gpt5.abort(); } catch (e) {}
      btn.disabled = false;
      stop.disabled = true;
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
