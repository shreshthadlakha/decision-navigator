"use strict";

// ============================================================
// CONSTANTS
// ============================================================
const LS_KEY     = "dn-v1";
const DEBOUNCE   = 500;

// ============================================================
// STATE
// ============================================================
let state;
let _saveT, _urlT;
const openNotes = new Set(); // UI-only: which option IDs have notes expanded

function uid() {
  try { return crypto.randomUUID(); } catch (_) {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}

function freshState() {
  return {
    meta: {
      id:      uid(),
      version: "1.0",
      created: Date.now(),
      updated: Date.now()
    },
    decision: {
      title:   "",
      context: ""
    },
    options:  [],
    criteria: [],
    scores:   {},
    // v1: stored in model but not surfaced in UI yet — foundation for decision journal
    outcome:    null,
    reflection: null
  };
}

function touch() {
  state.meta.updated = Date.now();
  scheduleSave();
  scheduleURL();
}

// ============================================================
// PERSISTENCE
// ============================================================
function scheduleSave() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
  }, DEBOUNCE);
}

function scheduleURL() {
  clearTimeout(_urlT);
  _urlT = setTimeout(() => {
    try { history.replaceState(null, "", "#" + encState(state)); } catch (_) {}
  }, DEBOUNCE);
}

function encState(s) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
  } catch (_) { return ""; }
}

function decState(h) {
  return JSON.parse(decodeURIComponent(escape(atob(h))));
}

function loadFromURL() {
  const h = location.hash.slice(1);
  if (!h) return null;
  try { return decState(h); } catch (_) { return null; }
}

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ============================================================
// VALIDATION HELPERS
// ============================================================
function namedOpts() { return state.options.filter(o  => o.name.trim()); }
function namedCrit() { return state.criteria.filter(c => c.name.trim()); }
function canScore()  { return namedOpts().length >= 2 && namedCrit().length >= 2; }

function getScore(optId, critId) {
  return state.scores[optId]?.[critId] ?? 5;
}

// ============================================================
// CALCULATIONS — pure functions, no DOM, no mutation
// ============================================================

function calcScores() {
  const opts = namedOpts();
  const crit = namedCrit();
  if (opts.length < 2 || crit.length < 2) return [];

  const totalW = crit.reduce((s, c) => s + c.weight, 0);
  if (!totalW) return [];

  const maxP = totalW * 10;

  return opts
    .map(opt => {
      const weighted = crit.reduce((s, c) => {
        return s + getScore(opt.id, c.id) * c.weight;
      }, 0);

      const pct = Math.round((weighted / maxP) * 100);

      const breakdown = crit.map(c => ({
        name:         c.name,
        score:        getScore(opt.id, c.id),
        weight:       c.weight,
        contribution: Math.round((getScore(opt.id, c.id) * c.weight / maxP) * 100)
      }));

      return { id: opt.id, name: opt.name, score: pct, breakdown };
    })
    .sort((a, b) => b.score - a.score);
}

function calcConf(ranked) {
  if (ranked.length < 2) return { level: "none", label: "", desc: "" };
  const gap = ranked[0].score - ranked[1].score;
  if (gap <= 4)  return {
    level: "low",
    label: "Low Confidence",
    desc:  "The options are very close. Revisit your weights — a small change may flip the result."
  };
  if (gap <= 12) return {
    level: "medium",
    label: "Medium Confidence",
    desc:  "A moderate advantage. The winner is the better choice given your stated priorities."
  };
  return {
    level: "high",
    label: "High Confidence",
    desc:  "The top option clearly outperforms the alternatives across your weighted criteria."
  };
}

function isTie(ranked) {
  return ranked.length >= 2 && ranked[0].score === ranked[1].score;
}

function genRec(ranked, conf) {
  if (!ranked.length) return "";
  const w   = ranked[0];
  const sec = ranked[1];
  const top = [...w.breakdown].sort((a, b) => b.contribution - a.contribution)[0];

  let t = `Based on your weighted criteria, ${w.name} is the strongest choice with a score of ${w.score}%.`;
  if (top) t += ` It performs especially well on ${top.name}.`;
  if (sec) t += ` The next closest option is ${sec.name} at ${sec.score}%.`;
  t += ` This is a ${conf.level} confidence recommendation — ${conf.desc.toLowerCase()}`;
  return t;
}

function genCopy(ranked, conf) {
  const title = state.decision.title.trim() || "Untitled Decision";
  let t = `Decision: ${title}\n\n`;

  if (!ranked.length) return t + "No results yet.";

  t += `Recommended: ${ranked[0].name} — ${ranked[0].score}%\n`;
  t += `Confidence:  ${conf.label}\n\n`;
  t += `Ranked Results:\n`;
  ranked.forEach((r, i) => { t += `${i + 1}. ${r.name} — ${r.score}%\n`; });

  const rec = genRec(ranked, conf);
  if (rec) t += `\nWhy: ${rec}`;
  return t;
}

// ============================================================
// RENDER HELPERS
// ============================================================
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreBg(v) {
  const n = parseInt(v) || 5;
  if (n <= 3) return "var(--score-low)";
  if (n >= 7) return "var(--score-high)";
  return "#FFFFFF";
}

// ============================================================
// RENDER — OPTIONS
// ============================================================
function renderOptions() {
  const list   = $("options-list");
  const hint   = $("options-hint");
  const addBtn = $("btn-add-option");

  list.innerHTML = state.options.map((opt, i) => {
    const open = openNotes.has(opt.id);
    return `
      <div class="item-card">
        <div class="item-row">
          <span class="item-num">${i + 1}</span>
          <input
            class="item-name"
            type="text"
            placeholder="Option name"
            value="${esc(opt.name)}"
            maxlength="100"
            data-field="opt-name"
            data-id="${opt.id}"
            autocomplete="off"
          >
          <button class="btn-icon" data-action="rm-opt" data-id="${opt.id}" title="Remove option">✕</button>
        </div>
        <button class="notes-toggle" data-action="toggle-notes" data-id="${opt.id}">
          ${open ? "▲ Hide notes" : "▼ Add notes"}
        </button>
        <div class="notes-body ${open ? "notes-open" : ""}">
          <textarea
            class="notes-input"
            rows="2"
            placeholder="Pros / advantages"
            data-field="opt-pros"
            data-id="${opt.id}"
          >${esc(opt.pros)}</textarea>
          <textarea
            class="notes-input"
            rows="2"
            placeholder="Cons / disadvantages"
            data-field="opt-cons"
            data-id="${opt.id}"
          >${esc(opt.cons)}</textarea>
        </div>
      </div>
    `;
  }).join("");

  hint.style.display   = state.options.length < 2 ? "flex" : "none";
  addBtn.disabled      = state.options.length >= 8;
}

// ============================================================
// RENDER — CRITERIA
// ============================================================
function renderCriteria() {
  const list   = $("criteria-list");
  const hint   = $("criteria-hint");
  const addBtn = $("btn-add-criterion");

  list.innerHTML = state.criteria.map((c, i) => `
    <div class="item-card">
      <div class="item-row">
        <span class="item-num">${i + 1}</span>
        <input
          class="item-name"
          type="text"
          placeholder="Criterion name"
          value="${esc(c.name)}"
          maxlength="80"
          data-field="crit-name"
          data-id="${c.id}"
          autocomplete="off"
        >
        <button class="btn-icon" data-action="rm-crit" data-id="${c.id}" title="Remove criterion">✕</button>
      </div>
      <div class="weight-row">
        <span class="weight-label">Importance</span>
        <input
          class="weight-slider"
          type="range"
          min="1" max="10" step="1"
          value="${c.weight}"
          data-action="weight"
          data-id="${c.id}"
        >
        <span class="weight-val" id="wv-${c.id}">${c.weight}</span>
        <span class="weight-max">/10</span>
      </div>
    </div>
  `).join("");

  hint.style.display = state.criteria.length < 2 ? "flex" : "none";
  addBtn.disabled    = state.criteria.length >= 8;
}

// ============================================================
// RENDER — MATRIX
// ============================================================
function renderMatrix() {
  const section = $("matrix-section");
  const table   = $("score-matrix");

  if (!canScore()) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  const opts = namedOpts();
  const crit = namedCrit();

  const headCells = crit.map(c => `
    <th class="mx-th">
      <span class="mx-crit-name">${esc(c.name)}</span>
      <span class="mx-crit-weight" data-wid="${c.id}">w: ${c.weight}</span>
    </th>
  `).join("");

  const rows = opts.map(opt => {
    const cells = crit.map(c => {
      const val = getScore(opt.id, c.id);
      return `
        <td class="mx-td">
          <input
            class="score-input"
            type="number"
            min="1" max="10" step="1"
            value="${val}"
            data-action="score"
            data-opt="${opt.id}"
            data-crit="${c.id}"
            style="background:${scoreBg(val)}"
          >
        </td>
      `;
    }).join("");

    return `
      <tr>
        <td class="mx-opt">${esc(opt.name)}</td>
        ${cells}
      </tr>
    `;
  }).join("");

  table.innerHTML = `
    <thead>
      <tr>
        <th class="mx-corner"></th>
        ${headCells}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

// ============================================================
// RENDER — RESULTS
// ============================================================
function renderResults() {
  const section = $("results-section");
  const content = $("results-content");

  if (!canScore()) {
    section.style.display = "none";
    return;
  }

  const ranked = calcScores();
  if (!ranked.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  const conf   = calcConf(ranked);
  const winner = ranked[0];
  const tied   = isTie(ranked);
  const rec    = genRec(ranked, conf);

  const rankItems = ranked.map((r, i) => `
    <div class="rank-item ${i === 0 ? "rank-first" : ""}">
      <span class="rank-pos">${i + 1}</span>
      <span class="rank-name" title="${esc(r.name)}">${esc(r.name)}</span>
      <div class="rank-track">
        <div class="rank-fill" style="width:${r.score}%"></div>
      </div>
      <span class="rank-pct">${r.score}%</span>
    </div>
  `).join("");

  content.innerHTML = `
    ${tied ? `
      <div class="tie-alert">
        ⚠ Tie detected — these two options score equally. Consider adding a tiebreaker criterion to separate them.
      </div>
    ` : ""}

    <div class="winner-card">
      <div class="winner-eyebrow">Recommended</div>
      <div class="winner-name">${esc(winner.name)}</div>
      <span class="winner-pct">${winner.score}<span class="winner-pct-unit">%</span></span>
      <div class="conf-badge conf-${conf.level}">${conf.label}</div>
    </div>

    <div class="results-block">
      <h3 class="block-title">All Options Ranked</h3>
      <div class="rank-list">${rankItems}</div>
    </div>

    ${conf.level !== "none" ? `
      <div class="results-block">
        <h3 class="block-title">Confidence</h3>
        <p class="conf-desc conf-desc-${conf.level}">${conf.desc}</p>
      </div>
    ` : ""}

    ${rec ? `
      <div class="results-block">
        <h3 class="block-title">Recommendation</h3>
        <p class="rec-text">${rec}</p>
      </div>
    ` : ""}

    <div class="results-actions">
      <button class="btn btn-primary" id="btn-copy">Copy Summary</button>
      <button class="btn btn-secondary" id="btn-share">Share URL</button>
    </div>
  `;
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
  renderOptions();
  renderCriteria();
  renderMatrix();
  renderResults();
}

// ============================================================
// EXAMPLE STATE
// ============================================================
// Pre-verified scores. Expected results:
// 1. Decision Navigator: 87%  (gap 13% → High confidence)
// 2. GST Invoice Generator: 74%
// 3. Image Compressor: 66%
// 4. Prompt Refiner: 62%
const EXAMPLE = {
  meta: { id: "example", version: "1.0", created: 0, updated: 0 },
  decision: {
    title:   "Which tool should I build for my developer trial?",
    context: "Evaluating project ideas for the Digital Marketing Heroes developer trial task. Weighted against what actually matters: real utility, originality, and no external dependencies."
  },
  options: [
    { id: "eo1", name: "GST Invoice Generator",  pros: "Practical, wide user base in India",    cons: "Many similar tools already exist"          },
    { id: "eo2", name: "Prompt Refiner",          pros: "Relevant for AI users",                 cons: "Requires API key, narrows audience"         },
    { id: "eo3", name: "Decision Navigator",      pros: "Universal use case, fully client-side", cons: "Less obvious utility at first glance"       },
    { id: "eo4", name: "Image Compressor",        pros: "Instantly understandable",              cons: "Highly commoditized, many free tools exist" }
  ],
  criteria: [
    { id: "ec1", name: "Usefulness to real users", weight: 9 },
    { id: "ec2", name: "Uniqueness of idea",        weight: 8 },
    { id: "ec3", name: "No-API feasibility",        weight: 8 },
    { id: "ec4", name: "Build speed",               weight: 6 },
    { id: "ec5", name: "Portfolio value",            weight: 7 }
  ],
  scores: {
    "eo1": { "ec1": 8, "ec2": 5, "ec3": 10, "ec4": 7, "ec5": 7 },
    "eo2": { "ec1": 7, "ec2": 6, "ec3":  4, "ec4": 6, "ec5": 8 },
    "eo3": { "ec1": 9, "ec2": 9, "ec3": 10, "ec4": 6, "ec5": 9 },
    "eo4": { "ec1": 7, "ec2": 3, "ec3": 10, "ec4": 8, "ec5": 5 }
  },
  outcome:    null,
  reflection: null
};

// ============================================================
// UTILITY
// ============================================================
function $(id) { return document.getElementById(id); }

function copyText(text, btn, defaultLabel) {
  const done = () => {
    btn.textContent = "Copied!";
    btn.classList.add("btn-copied");
    setTimeout(() => {
      btn.textContent = defaultLabel;
      btn.classList.remove("btn-copied");
    }, 2000);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else {
    // Fallback for http or older browsers
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
    done();
  }
}

// ============================================================
// EVENTS
// ============================================================
function bindEvents() {

  // Decision title
  $("decision-title").addEventListener("input", e => {
    state.decision.title = e.target.value;
    touch();
  });

  // Decision context
  $("decision-context").addEventListener("input", e => {
    state.decision.context = e.target.value;
    touch();
  });

  // Add option
  $("btn-add-option").addEventListener("click", () => {
    if (state.options.length >= 8) return;
    state.options.push({ id: uid(), name: "", pros: "", cons: "" });
    touch();
    renderOptions();
    renderMatrix();
    renderResults();
    // Focus the new name input
    const inputs = document.querySelectorAll("#options-list .item-name");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  // Add criterion
  $("btn-add-criterion").addEventListener("click", () => {
    if (state.criteria.length >= 8) return;
    state.criteria.push({ id: uid(), name: "", weight: 5 });
    touch();
    renderCriteria();
    renderMatrix();
    renderResults();
    const inputs = document.querySelectorAll("#criteria-list .item-name");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  // Load example
  $("btn-load-example").addEventListener("click", () => {
    state = JSON.parse(JSON.stringify(EXAMPLE));
    state.meta = { id: uid(), version: "1.0", created: Date.now(), updated: Date.now() };
    openNotes.clear();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
    try { history.replaceState(null, "", "#" + encState(state)); } catch (_) {}
    // Sync unmanaged inputs
    $("decision-title").value   = state.decision.title;
    $("decision-context").value = state.decision.context;
    renderAll();
  });

  // Reset
  $("btn-reset").addEventListener("click", () => {
    if (!confirm("Reset everything? This cannot be undone.")) return;
    state = freshState();
    openNotes.clear();
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
    history.replaceState(null, "", location.pathname + location.search);
    $("decision-title").value   = "";
    $("decision-context").value = "";
    renderAll();
  });

  // ── Event delegation — CLICK ─────────────────────────────
  document.addEventListener("click", e => {
    const el     = e.target;
    const action = el.dataset.action;
    const id     = el.dataset.id;

    // Remove option
    if (action === "rm-opt") {
      state.options = state.options.filter(o => o.id !== id);
      delete state.scores[id];
      openNotes.delete(id);
      touch();
      renderOptions();
      renderMatrix();
      renderResults();
    }

    // Remove criterion
    if (action === "rm-crit") {
      state.criteria = state.criteria.filter(c => c.id !== id);
      Object.keys(state.scores).forEach(oid => {
        if (state.scores[oid]) delete state.scores[oid][id];
      });
      touch();
      renderCriteria();
      renderMatrix();
      renderResults();
    }

    // Toggle notes
    if (action === "toggle-notes") {
      openNotes.has(id) ? openNotes.delete(id) : openNotes.add(id);
      renderOptions();
    }

    // Copy summary
    if (el.id === "btn-copy") {
      const ranked = calcScores();
      const conf   = calcConf(ranked);
      copyText(genCopy(ranked, conf), el, "Copy Summary");
    }

    // Share URL — push current state to URL and copy link
    if (el.id === "btn-share") {
      // Force immediate URL update (bypass debounce)
      try { history.replaceState(null, "", "#" + encState(state)); } catch (_) {}
      copyText(location.href, el, "Share URL");
    }
  });

  // ── Event delegation — INPUT ─────────────────────────────
  document.addEventListener("input", e => {
    const el     = e.target;
    const action = el.dataset.action;
    const field  = el.dataset.field;
    const id     = el.dataset.id;

    // Option name
    if (field === "opt-name") {
      const o = state.options.find(x => x.id === id);
      if (o) { o.name = el.value; touch(); renderMatrix(); renderResults(); }
      return;
    }

    // Criterion name
    if (field === "crit-name") {
      const c = state.criteria.find(x => x.id === id);
      if (c) { c.name = el.value; touch(); renderMatrix(); renderResults(); }
      return;
    }

    // Option notes
    if (field === "opt-pros") {
      const o = state.options.find(x => x.id === id);
      if (o) { o.pros = el.value; touch(); }
      return;
    }
    if (field === "opt-cons") {
      const o = state.options.find(x => x.id === id);
      if (o) { o.cons = el.value; touch(); }
      return;
    }

    // Weight slider
    if (action === "weight") {
      const c = state.criteria.find(x => x.id === id);
      if (!c) return;
      c.weight = Math.max(1, Math.min(10, parseInt(el.value) || 5));
      // Update weight display in criteria panel (no full re-render)
      const wv = $("wv-" + id);
      if (wv) wv.textContent = c.weight;
      // Update matrix column header weight (no full re-render)
      document.querySelectorAll(`.mx-crit-weight[data-wid="${id}"]`).forEach(span => {
        span.textContent = `w: ${c.weight}`;
      });
      touch();
      renderResults();
      return;
    }

    // Score cell
    if (action === "score") {
      const optId  = el.dataset.opt;
      const critId = el.dataset.crit;
      const raw    = parseInt(el.value);
      if (isNaN(raw)) return; // user is mid-typing (e.g. cleared field)
      const val = Math.max(1, Math.min(10, raw));
      el.value = val; // sync display immediately if value was clamped
      if (!state.scores[optId]) state.scores[optId] = {};
      state.scores[optId][critId] = val;
      el.style.background = scoreBg(val); // heat map update without re-render
      touch();
      renderResults();
      return;
    }
  });

  // Blur on name fields → refresh matrix labels and results
  // (matrix only re-renders on add/remove or blur of names, never on score input)
  document.addEventListener("blur", e => {
    const field = e.target.dataset.field;
    if (field === "opt-name" || field === "crit-name") {
      renderMatrix();
      renderResults();
    }
    // Clamp score on blur in case user typed out-of-range value
    if (e.target.dataset.action === "score") {
      const raw = parseInt(e.target.value);
      if (!isNaN(raw)) {
        const clamped = Math.max(1, Math.min(10, raw));
        e.target.value = clamped;
        e.target.style.background = scoreBg(clamped);
        const optId  = e.target.dataset.opt;
        const critId = e.target.dataset.crit;
        if (!state.scores[optId]) state.scores[optId] = {};
        state.scores[optId][critId] = clamped;
        touch();
        renderResults();
      }
    }
  }, true); // capture to catch blur (which doesn't bubble)
}

// ============================================================
// INIT
// ============================================================
function init() {
  // Priority: URL hash → localStorage → blank state
  state = loadFromURL() || loadFromLS() || freshState();

  // Sync the two standalone unmanaged inputs
  $("decision-title").value   = state.decision?.title   || "";
  $("decision-context").value = state.decision?.context || "";

  bindEvents();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
