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

// computeScore(checkedIds, sections) -> { score, maxScore, band }
// checkedIds: array of item ids marked done. Unknown ids are ignored.
function computeScore(checkedIds, sections) {
  const items = allItems(sections);
  const maxScore = items.reduce((sum, i) => sum + i.weight, 0);
  const checked = new Set(checkedIds);
  const score = items.reduce(
    (sum, i) => sum + (checked.has(i.id) ? i.weight : 0),
    0
  );
  // Guard against floating point drift; weights are integers so this is exact.
  const rounded = Math.min(maxScore, Math.max(0, Math.round(score)));
  return { score: rounded, maxScore, band: bandFor(rounded) };
}

// prioritizedFixes(checkedIds, sections) -> unchecked items sorted by
// impact (high -> medium -> low), then weight descending, then label.
function prioritizedFixes(checkedIds, sections) {
  const checked = new Set(checkedIds);
  return allItems(sections)
    .filter((i) => !checked.has(i.id))
    .sort((a, b) => {
      const ir = IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact];
      if (ir !== 0) return ir;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.label.localeCompare(b.label);
    });
}

// sectionProgress(checkedIds, sections) -> [{ sectionId, title, checked, total, pct }]
function sectionProgress(checkedIds, sections) {
  const checked = new Set(checkedIds);
  return sections.map((s) => {
    const total = s.items.length;
    const done = s.items.filter((i) => checked.has(i.id)).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { sectionId: s.id, title: s.title, checked: done, total, pct };
  });
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

// actionPlanText(result, fixes, businessName) — plain-text action plan for
// copy/paste into a task manager or email. Pure.
function actionPlanText(result, fixes, businessName) {
  var lines = [];
  lines.push((businessName ? businessName + " — " : "") +
    "Local SEO action plan · Score " + result.score + "/100 (" + result.band + ")");
  lines.push("");
  (fixes || []).forEach(function (f, i) {
    lines.push((i + 1) + ". [" + f.impact + " impact] " + f.label + " (" + f.sectionTitle + ")");
  });
  if (!(fixes || []).length) lines.push("All items complete — nothing left to fix.");
  return lines.join("\n");
}

const HISTORY_KEY = "seocheck.v1.history";

// saveAudit(storage, audit) — appends { date, businessName, score, band } and
// returns the full history array. Keeps the last 50 entries.
function saveAudit(storage, audit) {
  const history = loadAudits(storage);
  history.push({
    date: audit.date,
    businessName: audit.businessName || "",
    score: audit.score,
    band: audit.band
  });
  const trimmed = history.slice(-50);
  storage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
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
    IMPACT_RANK
  };
}
