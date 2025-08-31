// Highlight-to-Summarize for OraDigit (ES5-safe)
// Requires window.gpt5 from /assets/gpt5.js
(function () {
  if (!window.gpt5) { console.warn("gpt5.js not loaded."); return; }

  var BTN_ID = "gpt5-sel-btn";
  var PANEL_ID = "gpt5-sel-panel";
  var OUT_ID = "gpt5-sel-out";
  var STOP_ID = "gpt5-sel-stop";
  var CLOSE_ID = "gpt5-sel-close";
  var inProgress = false;

  function ensureBtn() {
    var b = document.getElementById(BTN_ID);
    if (b) return b;
    b = document.createElement("button");
    b.id = BTN_ID;
    b.type = "button";
    b.textContent = "Summarize";
    b.setAttribute("aria-label", "Summarize selection with AI");
    b.style.position = "fixed";
    b.style.display = "none";
    b.style.zIndex = "2147483647";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "9999px";
    b.style.border = "1px solid #d1d5db";
    b.style.background = "#111";
    b.style.color = "#fff";
    b.style.font = "14px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial";
    b.style.boxShadow = "0 2px 8px rgba(0,0,0,.15)";
    b.onkeydown = function (e) {
      if (e.key === "Escape") hideBtn();
    };
    document.body.appendChild(b);
    return b;
  }

  function ensurePanel() {
    var p = document.getElementById(PANEL_ID);
    if (p) return p;

    p = document.createElement("div");
    p.id = PANEL_ID;
    p.style.position = "fixed";
    p.style.right = "16px";
    p.style.bottom = "16px";
    p.style.maxWidth = "520px";
    p.style.width = "min(92vw,520px)";
    p.style.maxHeight = "60vh";
    p.style.overflow = "auto";
    p.style.background = "#fff";
    p.style.border = "1px solid #e5e7eb";
    p.style.borderRadius = "12px";
    p.style.boxShadow = "0 10px 30px rgba(0,0,0,.12)";
    p.style.padding = "12px";
    p.style.font = "14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial";
    p.style.color = "#111";
    p.style.zIndex = "2147483647";

    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginBottom = "8px";

    var h = document.createElement("div");
    h.textContent = "AI Summary";
    h.style.fontWeight = "600";
    h.style.flex = "1";

    var stop = document.createElement("button");
    stop.id = STOP_ID;
    stop.type = "button";
    stop.textContent = "Stop";
    stop.style.padding = "6px 10px";
    stop.style.border = "1px solid #d1d5db";
    stop.style.borderRadius = "8px";
    stop.style.background = "#fff";
    stop.onclick = function () {
      try { window.gpt5.abort(); } catch (e) {}
      inProgress = false;
    };

    var close = document.createElement("button");
    close.id = CLOSE_ID;
    close.type = "button";
    close.textContent = "Close";
    close.style.padding = "6px 10px";
    close.style.border = "1px solid #d1d5db";
    close.style.borderRadius = "8px";
    close.style.background = "#fff";
    close.onclick = function () { p.remove(); };

    row.appendChild(h);
    row.appendChild(stop);
    row.appendChild(close);

    var out = document.createElement("div");
    out.id = OUT_ID;
    out.setAttribute("aria-live", "polite");
    out.style.whiteSpace = "pre-wrap";

    p.appendChild(row);
    p.appendChild(out);
    document.body.appendChild(p);
    return p;
  }

  function getSelectionText() {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) return "";
    var s = sel.toString() || "";
    s = s.replace(/\s+/g, " ").trim();
    if (s.length > 6000) s = s.slice(0, 6000);
    return s;
  }

  function showBtnNearSelection() {
    var btn = ensureBtn();
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) { hideBtn(); return; }
    if (!sel.rangeCount) { hideBtn(); return; }
    var r = sel.getRangeAt(0);
    var rect = r.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { hideBtn(); return; }

    // Only show for reasonable lengths
    var text = getSelectionText();
    if (text.length < 20) { hideBtn(); return; }

    var x = rect.right + window.scrollX - btn.offsetWidth - 4;
    var y = rect.top + window.scrollY - 36;
    if (x < 8) x = 8;
    if (y < 8) y = rect.bottom + window.scrollY + 8;

    btn.style.left = x + "px";
    btn.style.top  = y + "px";
    btn.style.display = "inline-block";
  }

  function hideBtn() {
    var b = document.getElementById(BTN_ID);
    if (b) b.style.display = "none";
  }

  function summarize(text) {
    var panel = ensurePanel();
    var out = document.getElementById(OUT_ID);
    var stop = document.getElementById(STOP_ID);
    var btn = document.getElementById(BTN_ID);
    if (!out) return;

    out.textContent = "Thinking…";
    inProgress = true;
    if (btn) btn.disabled = true;
    if (stop) stop.disabled = false;

    var full = "";
    window.gpt5.stream({
      system: "You are LLbot for OraDigit.com. Summarize clearly for business stakeholders in 5–7 short bullets.",
      messages: [{ role: "user", content: "Summarize this selection:\n\n" + text }],
      onToken: function (t) { full += t; out.textContent = full; }
    })
    .then(function () {
      inProgress = false;
      if (btn) btn.disabled = false;
      if (stop) stop.disabled = true;
    })
    .catch(function (e) {
      inProgress = false;
      if (btn) btn.disabled = false;
      if (stop) stop.disabled = true;
      out.textContent = "Error: " + (e && e.message ? e.message : e);
    });
  }

  // Button click handler
  document.addEventListener("click", function (e) {
    var btn = document.getElementById(BTN_ID);
    if (btn && e.target === btn) {
      var text = getSelectionText();
      hideBtn();
      if (text) summarize(text);
    }
  });

  // Show button when user selects text (mouseup / keyup)
  document.addEventListener("mouseup", function () { setTimeout(showBtnNearSelection, 0); });
  document.addEventListener("keyup", function (e) {
    if (e.key === "Escape") hideBtn();
    else setTimeout(showBtnNearSelection, 0);
  });

  // Optional hotkey: Alt+S to summarize current selection
  document.addEventListener("keydown", function (e) {
    if (e.altKey && (e.key === "s" || e.key === "S")) {
      var t = getSelectionText();
      if (t) summarize(t);
    }
  });

  // Hide on scroll (optional)
  window.addEventListener("scroll", function () { hideBtn(); }, { passive: true });
})();
