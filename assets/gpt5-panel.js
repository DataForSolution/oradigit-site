// OraDigit Floating AI Panel (bottom-left) — uses window.gpt5
// Safe to include site-wide. Avoids clash with bottom-right chatbot.
(function () {
  'use strict';

  if (!window.gpt5) {
    console.warn('[gpt5-panel] window.gpt5 not found. Make sure /assets/gpt5.js is included.');
    return;
  }
  if (document.getElementById('od-ai-toggle') || document.getElementById('od-ai-panel')) {
    return; // already installed
  }

  // ------- Styles (scoped) -------
  var style = document.createElement('style');
  style.textContent =
    '#od-ai-toggle{position:fixed;left:20px;bottom:20px;z-index:9999;background:#111827;color:#fff;border:0;border-radius:9999px;padding:10px 14px;font:600 14px/1.1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;border:1px solid #1f2937;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer}'+
    '#od-ai-toggle:hover{background:#0b1220}'+
    '#od-ai-panel{position:fixed;left:20px;bottom:70px;z-index:9999;width:360px;max-width:95vw;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);overflow:hidden}'+
    '@media (prefers-color-scheme: dark){#od-ai-panel{background:#0b1220;border-color:#1f2937}}'+
    '#od-ai-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e5e7eb}'+
    '@media (prefers-color-scheme: dark){#od-ai-head{border-color:#1f2937}}'+
    '#od-ai-title{font:600 14px/1.2 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;color:#111827}'+
    '@media (prefers-color-scheme: dark){#od-ai-title{color:#e5e7eb}}'+
    '#od-ai-close{background:transparent;border:0;color:#6b7280;font:700 16px/1 ui-sans-serif;cursor:pointer}'+
    '#od-ai-body{padding:10px 12px;max-height:55vh;overflow:auto}'+
    '#od-ai-out{white-space:pre-wrap;font:500 14px/1.4 ui-sans-serif,system-ui;min-height:60px;color:#111827}'+
    '@media (prefers-color-scheme: dark){#od-ai-out{color:#e5e7eb}}'+
    '#od-ai-row{display:flex;gap:8px;margin:10px 0 4px}'+
    '#od-ai-msg{flex:1;min-height:44px;max-height:120px;padding:10px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;color:#111827;resize:vertical}'+
    '@media (prefers-color-scheme: dark){#od-ai-msg{background:#0b1220;border-color:#1f2937;color:#e5e7eb}}'+
    '.od-btn{border:0;border-radius:10px;padding:10px 12px;font:600 13px/1 ui-sans-serif;cursor:pointer}'+
    '.od-btn.primary{background:#111827;color:#fff} .od-btn.primary:hover{background:#0b1220}'+
    '.od-btn.neutral{background:#f3f4f6;color:#111827} .od-btn.neutral:hover{background:#e5e7eb}'+
    '@media (prefers-color-scheme: dark){.od-btn.neutral{background:#111827;color:#e5e7eb} .od-btn.neutral:hover{background:#0b1220}}';
  document.head.appendChild(style);

  // ------- Markup -------
  var toggle = document.createElement('button');
  toggle.id = 'od-ai-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = 'Ask AI';

  var wrap = document.createElement('div');
  wrap.id = 'od-ai-panel';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.style.display = 'none';
  wrap.innerHTML =
    '<div id="od-ai-head">' +
      '<div id="od-ai-title">OraDigit Assistant</div>' +
      '<button id="od-ai-close" aria-label="Close">×</button>' +
    '</div>' +
    '<div id="od-ai-body">' +
      '<div id="od-ai-out"></div>' +
      '<div id="od-ai-row">' +
        '<textarea id="od-ai-msg" placeholder="Ask anything… (Shift+Enter = new line)"></textarea>' +
        '<button id="od-ai-send" class="od-btn primary">Send</button>' +
        '<button id="od-ai-stop" class="od-btn neutral">Stop</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(toggle);
  document.body.appendChild(wrap);

  // ------- Behavior -------
  var open = false;
  var out  = wrap.querySelector('#od-ai-out');
  var msg  = wrap.querySelector('#od-ai-msg');
  var send = wrap.querySelector('#od-ai-send');
  var stop = wrap.querySelector('#od-ai-stop');
  var close= wrap.querySelector('#od-ai-close');
  var current = null;

  function setOpen(v){
    open = !!v;
    wrap.style.display = open ? 'block' : 'none';
    toggle.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(function(){ msg.focus(); }, 0);
  }

  toggle.addEventListener('click', function(){ setOpen(!open); });
  close.addEventListener('click',  function(){ setOpen(false); });

  function startQuery(text){
    out.textContent = '';
    send.disabled = true;
    stop.disabled = false;
    current = window.gpt5.ask(text, {
      onToken: function(tok){ out.textContent += tok; }
    }).then(function(){ /* done */ }).catch(function(err){
      out.textContent = 'Error: ' + (err && err.message || err);
    }).finally(function(){
      send.disabled = false; stop.disabled = true;
    });
  }

  send.addEventListener('click', function(){
    var text = String(msg.value || '').trim();
    if (!text) return;
    startQuery(text);
  });

  stop.addEventListener('click', function(){
    window.gpt5.abort();
  });

  msg.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send.click();
    }
  });

  // expose a tiny hook if you ever want to control it elsewhere
  window.oraPanel = {
    open: function(){ setOpen(true); },
    close: function(){ setOpen(false); }
  };

})();
