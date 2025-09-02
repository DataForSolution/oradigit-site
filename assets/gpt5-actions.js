// ES5-safe helpers that use window.gpt5 (from /assets/gpt5.js)
(function () {
  if (!window.gpt5) {
    console.error("gpt5 helper not found. Include /assets/gpt5.js first.");
    return;
  }

  function $(id) { return document.getElementById(id); }

  function textFromPage() {
    var el =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector(".content") ||
      document.querySelector(".post-content") ||
      document.getElementById("content") ||
      document.body;
    var t = el && (el.innerText || el.textContent) || "";
    t = (t || "").replace(/\s+/g, " ").trim();
    if (t.length > 6000) t = t.slice(0, 6000); // keep the demo snappy
    return t;
  }

  function setBtn(disabled, label) {
    var b = $("ai-summary-btn");
    if (b) {
      b.disabled = !!disabled;
      if (label != null) b.textContent = label;
    }
  }
 document.addEventListener("DOMContentLoaded", function () {
  var btn = document.getElementById("ai-summary-btn");
  var stop = document.getElementById("ai-summary-stop");
  var out = document.getElementById("ai-summary");
  if (!btn || !out || !stop) return;

  function setBtn(disabled, label) {
    btn.disabled = !!disabled;
    if (label != null) btn.textContent = label;
  }

  stop.addEventListener("click", function () {
    try { gpt5.abort(); } catch (e) {}
    setBtn(false, "AI Summary");
  });

  btn.addEventListener("click", function () {
    var el =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector(".content") ||
      document.querySelector(".post-content") ||
      document.getElementById("content") ||
      document.body;
    var content = el && (el.innerText || el.textContent) || "";
    content = (content || "").replace(/\s+/g, " ").trim();
    if (content.length > 6000) content = content.slice(0, 6000);

    if (!content) {
      out.textContent = "Sorry—no readable content found on this page.";
      return;
    }

    out.textContent = "Thinking…";
    setBtn(true, "Summarizing…");
    var full = "";

    gpt5.stream({
      system: "You are LLbot for OraDigit.com. Summarize for executives and prospects. 5–7 bullet points. Clear, concrete, jargon-light.",
      messages: [{ role: "user", content: "Summarize this page for a prospective client:\n\n" + content }],
      onToken: function (t) { full += t; out.textContent = full; }
    })
    .then(function () { setBtn(false, "AI Summary"); })
    .catch(function (e) {
      out.textContent = "Error: " + (e && e.message ? e.message : e);
      setBtn(false, "AI Summary");
    });
  });
});

  
