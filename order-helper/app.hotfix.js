/* Order Helper – emergency loader (standalone, safe to add/remove) */
(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else { init(); }

  function $(s){ return document.querySelector(s); }
  const els = {
    status:     $("#status"),
    modality:   $("#modality"),
    region:     $("#region"),
    bodyPart:   $("#bodyPart"),
    contrast:   $("#contrast"),
    laterality: $("#laterality"),
    context:    $("#context"),
  };

  const RULES_URL = document.querySelector('meta[name="oh-rules-path"]')?.content
                 || "/order-helper/data/rules.json";

  const FALLBACK = {
    schema_version: "1.1",
    modalities: {
      "PET/CT": {
        regions:    ["Skull base to mid-thigh","Whole body"],
        body_parts: ["Head/Neck","Chest","Abdomen/Pelvis"],
        contrast:   ["None"],
        laterality: ["N/A"],
        contexts:   ["Staging","Restaging","Treatment response","Surveillance","Acute"]
      },
      "CT": {
        regions:    ["Head/Brain","Chest","Abdomen/Pelvis"],
        body_parts: ["Head","Chest","Abdomen","Pelvis"],
        contrast:   ["None","IV","Oral","IV + Oral"],
        laterality: ["N/A","Right","Left","Bilateral"],
        contexts:   ["Acute","Follow-up","Staging"]
      },
      "MRI": {
        regions:    ["Brain","Spine","MSK"],
        body_parts: ["Brain","Cervical","Lumbar","Hip"],
        contrast:   ["None","Gadolinium"],
        laterality: ["N/A","Right","Left","Bilateral"],
        contexts:   ["Acute","Follow-up","Staging"]
      }
    }
  };

  function setStatus(msg){ if (els.status) els.status.textContent = msg; }
  function setOptions(selectEl, items, placeholder){
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = ""; ph.disabled = true; ph.selected = true;
    ph.textContent = placeholder || "Select…";
    selectEl.appendChild(ph);
    (items || []).forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v; selectEl.appendChild(o);
    });
  }

  async function tryLoad(url){
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP "+res.status);
      const json = await res.json();
      if (!json?.modalities || typeof json.modalities !== "object") throw new Error("Bad schema");
      setStatus("Rules loaded.");
      return json;
    } catch (e) {
      console.warn("[OH emergency] rules load failed, using fallback:", e);
      setStatus("Using built-in defaults (rules.json unavailable).");
      return FALLBACK;
    }
  }

  function bind(cat){
    if (!els.modality) return;
    const modalities = Object.keys(cat.modalities || {});
    setOptions(els.modality, modalities, "Select modality…");
    els.modality.addEventListener("change", () => {
      const m = els.modality.value;
      const spec = (cat.modalities || {})[m] || {};
      setOptions(els.region,     spec.regions,     "Select region…");
      setOptions(els.bodyPart,   spec.body_parts,  "Select body part…");
      setOptions(els.contrast,   spec.contrast,    "Select contrast…");
      setOptions(els.laterality, spec.laterality,  "Select laterality…");
      setOptions(els.context,    spec.contexts,    "Select context…");
    });
    // Auto-select first to avoid empty UI
    if (els.modality.options.length > 1) {
      els.modality.selectedIndex = 1;
      els.modality.dispatchEvent(new Event("change"));
    }
  }

  async function init(){
    const cat = await tryLoad(RULES_URL);
    bind(cat);
    // expose for other scripts, but non-invasive
    window.OH = Object.assign(window.OH || {}, { catalog: cat });
    document.dispatchEvent(new CustomEvent("oh:catalog-ready", { detail: { catalog: cat }}));
  }
})();
