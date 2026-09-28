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

// ---- Storage helpers (pure: operate on a passed storage object) ----
// Storage shape: { getItem(k), setItem(k, v), removeItem(k) } like localStorage.

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
    saveAudit,
    loadAudits,
    bandFor,
    IMPACT_RANK
  };
}
