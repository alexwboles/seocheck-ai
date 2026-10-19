// SEOCheck AI — pure scoring / prioritization / storage logic. No DOM here,
// so every function is testable in Node via require().

const IMPACT_RANK = { high: 0, medium: 1, low: 2 };

const SCORE_BANDS = [
  { min: 90, label: "Excellent" },
  { min: 70, label: "Strong" },
  { min: 40, label: "Getting there" },
  { min: 0, label: "Needs work" }
];

function allItems(sections) {
  const out = [];
  for (const s of sections) {
    for (const item of s.items) {
      out.push({ sectionId: s.id, sectionTitle: s.title, ...item });
    }
  }
  return out;
}

function bandFor(score) {
  for (const b of SCORE_BANDS) {
    if (score >= b.min) return b.label;
  }
  return "Needs work";
}

// ---- Not-applicable items -----------------------------------------------------
// toggleNA(naIds, id) -> new array of N/A item ids.
function toggleNA(naIds, id) {
  const list = (naIds || []).slice();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  return list;
}

// applicableItems(sections, naIds) -> items not marked N/A.
function applicableItems(sections, naIds) {
  const na = new Set(naIds || []);
  return allItems(sections).filter((i) => !na.has(i.id));
}

// computeScore(checkedIds, sections, naIds?) -> { score, maxScore, band, naCount }
// checkedIds: array of item ids marked done. N/A items are excluded from the
// max score, so marking something N/A never punishes the audit. Unknown and
// N/A ids in checkedIds are ignored.
function computeScore(checkedIds, sections, naIds) {
  const na = new Set(naIds || []);
  const items = allItems(sections).filter((i) => !na.has(i.id));
  const maxScore = items.reduce((sum, i) => sum + i.weight, 0);
  const checked = new Set(checkedIds);
  const score = items.reduce(
    (sum, i) => sum + (checked.has(i.id) ? i.weight : 0),
    0
  );
  // Guard against floating point drift; weights are integers so this is exact.
  const rounded = Math.min(maxScore, Math.max(0, Math.round(score)));
  return { score: rounded, maxScore, band: bandFor(rounded), naCount: (naIds || []).length };
}

// prioritizedFixes(checkedIds, sections, naIds?) -> unchecked items sorted by
// impact (high -> medium -> low), then weight descending, then label.
// N/A items are excluded: no point fixing what doesn't apply.
function prioritizedFixes(checkedIds, sections, naIds) {
  const checked = new Set(checkedIds);
  const na = new Set(naIds || []);
  return allItems(sections)
    .filter((i) => !checked.has(i.id) && !na.has(i.id))
    .sort((a, b) => {
      const ir = IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact];
      if (ir !== 0) return ir;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.label.localeCompare(b.label);
    });
}

// sectionProgress(checkedIds, sections, naIds?) -> [{ sectionId, title, checked, total, pct }]
// N/A items are excluded from section totals as well.
function sectionProgress(checkedIds, sections, naIds) {
  const checked = new Set(checkedIds);
  const na = new Set(naIds || []);
  return sections.map((s) => {
    const items = s.items.filter((i) => !na.has(i.id));
    const total = items.length;
    const done = items.filter((i) => checked.has(i.id)).length;
    const pct = total === 0 ? 100 : Math.round((done / total) * 100);
    return { sectionId: s.id, title: s.title, checked: done, total, pct };
  });
}

// projectedScore(checkedIds, sections, fixIds, naIds?) -> { score, maxScore, band, gain }
// What the score would be if fixIds were completed — the "what-if" behind the
// "finish the top 3" banner. Pure.
function projectedScore(checkedIds, sections, fixIds, naIds) {
  const now = computeScore(checkedIds, sections, naIds);
  const merged = Array.from(new Set((checkedIds || []).concat(fixIds || [])));
  const after = computeScore(merged, sections, naIds);
  return { score: after.score, maxScore: after.maxScore, band: after.band, gain: after.score - now.score };
}

// ---- Re-audit reminders --------------------------------------------------------
// nextAuditDue(lastAuditDate, daysAhead) -> "YYYY-MM-DD" or "".
// reminderStatus(lastAuditDate, daysAhead, todayStr?)
//   -> "overdue" | "due-soon" (<=7 days out) | "ok" | "off".
const REMINDER_KEY = "seocheck.v1.reminderDays";

function addDays(dateStr, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setDate(d.getDate() + n);
  const p2 = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

function nextAuditDue(lastAuditDate, daysAhead) {
  const n = parseInt(daysAhead, 10);
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(String(lastAuditDate || ""))) return "";
  if (isNaN(n) || n < 7) return "";
  return addDays(lastAuditDate, n);
}

function reminderStatus(lastAuditDate, daysAhead, todayStr) {
  const due = nextAuditDue(lastAuditDate, daysAhead);
  if (!due) return "off";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(todayStr || ""))
    ? todayStr
    : new Date().toISOString().slice(0, 10);
  if (due < today) return "overdue";
  if (due <= addDays(today, 7)) return "due-soon";
  return "ok";
}

// filterFixes(fixes, { impact, sectionId }) — narrow the prioritized
// action queue by impact level and/or section. Returns a new array.
function filterFixes(fixes, opts) {
  opts = opts || {};
  return (fixes || []).filter(function (f) {
    if (opts.impact && f.impact !== opts.impact) return false;
    if (opts.sectionId && f.sectionId !== opts.sectionId) return false;
    return true;
  });
}

// searchItems(sections, query) — find audit items by label text.
// Returns [{ sectionId, sectionTitle, item }] in section order.
function searchItems(sections, query) {
  var q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  var out = [];
  for (const s of sections) {
    for (const item of s.items) {
      if (item.label.toLowerCase().indexOf(q) >= 0) {
        out.push({ sectionId: s.id, sectionTitle: s.title, item: item });
      }
    }
  }
  return out;
}

// historyWithDeltas(history) — annotate each audit (oldest first) with the
// score change vs the previous audit: { delta: number|null }. Pure.
function historyWithDeltas(history) {
  return (history || []).map(function (h, i, arr) {
    var prev = i > 0 ? arr[i - 1] : null;
    return Object.assign({}, h, {
      delta: prev ? (Number(h.score) - Number(prev.score)) : null
    });
  });
}

// ---- Effort estimates -------------------------------------------------------
// Time budget per fix, derived from impact so the plan is honest about the work.
const EFFORT = {
  high: { label: "Half day", minutes: 240 },
  medium: { label: "~1 hour", minutes: 60 },
  low: { label: "Quick win", minutes: 15 }
};

function effortFor(impact) {
  return EFFORT[impact] || EFFORT.medium;
}

function fmtDuration(min) {
  min = Math.max(0, Math.round(min));
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60), m = min % 60;
  return m ? h + "h " + m + "m" : h + "h";
}

// planEffort(fixes) -> { totalMinutes, quickWins, label }.
function planEffort(fixes) {
  let total = 0, quickWins = 0;
  (fixes || []).forEach(function (f) {
    total += effortFor(f.impact).minutes;
    if (f.impact === "low") quickWins++;
  });
  return { totalMinutes: total, quickWins: quickWins, label: fmtDuration(total) };
}

// ---- Fix notes (work log) -----------------------------------------------------
const FIXNOTES_KEY = "seocheck.v1.fixnotes";

// loadFixNotes(storage) -> { itemId: [{ date, text }] }. {} on bad data.
function loadFixNotes(storage) {
  try {
    const raw = storage.getItem(FIXNOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveFixNotes(storage, notes) {
  try { storage.setItem(FIXNOTES_KEY, JSON.stringify(notes || {})); } catch (e) {}
}

// addFixNote(notes, itemId, text) -> { ok, notes } or { ok: false, error }.
function addFixNote(notes, itemId, text) {
  text = String(text == null ? "" : text).trim().slice(0, 500);
  if (!text) return { ok: false, error: "Note text is required." };
  if (!itemId) return { ok: false, error: "Item id is required." };
  const n = Object.assign({}, notes || {});
  const list = ((n[itemId] || []).slice());
  list.push({ date: new Date().toISOString().slice(0, 10), text: text });
  n[itemId] = list.slice(-20);
  return { ok: true, notes: n };
}

function fixNotesFor(notes, itemId) {
  return (((notes || {})[itemId]) || []).slice();
}

// ---- Re-audit diff --------------------------------------------------------------
// diffAudits(prevCheckedIds, currCheckedIds, sections)
//   -> { completed: [labels], regressed: [labels] } vs the previous audit.
function diffAudits(prevIds, currIds, sections) {
  const prev = {}, curr = {};
  (prevIds || []).forEach(function (id) { prev[id] = true; });
  (currIds || []).forEach(function (id) { curr[id] = true; });
  const labelOf = {};
  allItems(sections).forEach(function (i) { labelOf[i.id] = i.label; });
  const completed = [], regressed = [];
  Object.keys(curr).forEach(function (id) {
    if (!prev[id] && labelOf[id]) completed.push(labelOf[id]);
  });
  Object.keys(prev).forEach(function (id) {
    if (!curr[id] && labelOf[id]) regressed.push(labelOf[id]);
  });
  return { completed: completed, regressed: regressed };
}

// actionPlanText(result, fixes, businessName) — plain-text action plan for
// copy/paste into a task manager or email. Pure.
function actionPlanText(result, fixes, businessName) {
  var lines = [];
  lines.push((businessName ? businessName + " — " : "") +
    "Local SEO action plan · Score " + result.score + "/100 (" + result.band + ")");
  var eff = planEffort(fixes);
  if ((fixes || []).length) {
    lines.push("Estimated effort: " + eff.label + " total · " + eff.quickWins + " quick win(s).");
  }
  lines.push("");
  (fixes || []).forEach(function (f, i) {
    lines.push((i + 1) + ". [" + f.impact + " impact · " + effortFor(f.impact).label + "] " +
      f.label + " (" + f.sectionTitle + ")");
  });
  if (!(fixes || []).length) lines.push("All items complete — nothing left to fix.");
  return lines.join("\n");
}

const HISTORY_KEY = "seocheck.v1.history";

// saveAudit(storage, audit) — appends { date, businessName, score, band, checkedIds }
// and returns the full history array. Keeps the last 50 entries.
function saveAudit(storage, audit) {
  const history = loadAudits(storage);
  history.push({
    date: audit.date,
    businessName: audit.businessName || "",
    score: audit.score,
    band: audit.band,
    checkedIds: Array.isArray(audit.checkedIds) ? audit.checkedIds.slice() : []
  });
  const trimmed = history.slice(-50);
  // Wrapped so a blocked-storage iframe can't crash the "Complete audit" flow.
  try { storage.setItem(HISTORY_KEY, JSON.stringify(trimmed)); } catch (e) {}
  return trimmed;
}

// loadAudits(storage) -> array of past audits (oldest first). [] on bad data.
function loadAudits(storage) {
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeScore,
    prioritizedFixes,
    sectionProgress,
    filterFixes,
    searchItems,
    historyWithDeltas,
    actionPlanText,
    saveAudit,
    loadAudits,
    bandFor,
    effortFor,
    planEffort,
    fmtDuration,
    FIXNOTES_KEY,
    loadFixNotes,
    saveFixNotes,
    addFixNote,
    fixNotesFor,
    diffAudits,
    IMPACT_RANK,
    toggleNA,
    applicableItems,
    projectedScore,
    nextAuditDue,
    reminderStatus,
    REMINDER_KEY
  };
}
