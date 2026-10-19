/* SEOCheck AI — DOM glue. Renders the audit, score bar, fix list,
   history, settings (optional OpenAI summary), and persists to localStorage. */

(function () {
  "use strict";

  var STATE_KEY = "seocheck.v1";

  function loadState() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { businessName: "", checked: [], auditDate: null };
  }

  function persist(state) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // Reading window.localStorage itself can throw (SecurityError) when storage
  // is blocked, e.g. an iframe with third-party cookies off — so centralize
  // access; the logic-layer helpers treat a null store as "no data".
  function safeLS() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  var state = loadState();
  var checkedSet = {};
  state.checked.forEach(function (id) { checkedSet[id] = true; });
  // items marked not-applicable — excluded from scoring
  var naSet = {};
  (state.na || []).forEach(function (id) { naSet[id] = true; });
  function getNaIds() {
    return Object.keys(naSet).filter(function (id) { return naSet[id]; });
  }

  // per-item work log: { itemId: [{ date, text }] }
  var fixNotes = loadFixNotes(safeLS());

  function getCheckedIds() {
    return Object.keys(checkedSet).filter(function (id) { return checkedSet[id]; });
  }

  var els = {};
  ["businessName", "scoreFill", "scoreText", "scoreBand", "scoreRing", "sections",
   "fixList", "fixCount", "effortLine", "historyList", "summaryBox", "settingsPanel",
   "openaiKey", "year", "itemSearch", "searchNote", "fixImpactFilter",
   "fixSectionFilter", "whatIf", "reminderSel", "reminderBanner", "sevStrip"
  ].forEach(function (id) { els[id] = document.getElementById(id); });

  // search box for the 28 audit items (toolbar is static HTML, outside re-renders)
  var searchQuery = "";

  // populate the fix-list section filter once
  els.fixSectionFilter.innerHTML = '<option value="">All sections</option>' +
    AUDIT_SECTIONS.map(function (s) {
      return '<option value="' + s.id + '">' + escapeHtml(s.title) + "</option>";
    }).join("");

  function refresh() {
    var ids = getCheckedIds();
    var naIds = getNaIds();
    var result = computeScore(ids, AUDIT_SECTIONS, naIds);
    var fixes = prioritizedFixes(ids, AUDIT_SECTIONS, naIds);
    var progress = sectionProgress(ids, AUDIT_SECTIONS, naIds);

    // Score bar
    els.scoreFill.style.width = result.score + "%";
    els.scoreText.textContent = result.score + " / " + result.maxScore;
    els.scoreBand.textContent = result.band;
    els.scoreBand.className = "band band-" + result.band.toLowerCase().replace(/ /g, "-");

    // Severity strip: open-issue counts by impact (Semrush-style).
    var sevCounts = { high: 0, medium: 0, low: 0 };
    fixes.forEach(function (f) { sevCounts[f.impact]++; });
    els.sevStrip.innerHTML =
      '<span class="sev-chip sev-high">' + sevCounts.high + ' errors</span>' +
      '<span class="sev-chip sev-med">' + sevCounts.medium + ' warnings</span>' +
      '<span class="sev-chip sev-low">' + sevCounts.low + ' notices</span>';

    // Score dial ring
    var ring = els.scoreRing;
    if (ring) {
      var CIRC = 2 * Math.PI * 54;
      ring.style.strokeDasharray = CIRC.toFixed(1);
      ring.style.strokeDashoffset = (CIRC * (1 - result.score / result.maxScore)).toFixed(1);
    }

    // Sections + mini progress bars (filtered live by the search box)
    els.sections.innerHTML = "";
    var matchIds = null, matchCount = 0;
    if (searchQuery) {
      matchIds = {};
      searchItems(AUDIT_SECTIONS, searchQuery).forEach(function (m) {
        matchIds[m.item.id] = true;
        matchCount++;
      });
      els.searchNote.textContent = matchCount === 0
        ? "No items match \"" + searchQuery + "\""
        : matchCount + " of 28 items match";
      els.searchNote.hidden = false;
    } else {
      els.searchNote.hidden = true;
    }
    AUDIT_SECTIONS.forEach(function (section, si) {
      var p = progress.filter(function (x) { return x.sectionId === section.id; })[0];
      var shownItems = matchIds
        ? section.items.filter(function (it) { return matchIds[it.id]; })
        : section.items;
      if (matchIds && shownItems.length === 0) return; // hide empty sections while searching
      var card = document.createElement("section");
      card.className = "card audit-section";

      var head = document.createElement("div");
      head.className = "section-head";
      var health = p.pct === 100 ? '<span class="health ok">Complete</span>'
        : p.pct > 0 ? '<span class="health warn">In progress</span>'
        : '<span class="health">Not started</span>';
      head.innerHTML =
        '<span class="sys-n">' + ("0" + (si + 1)) + "</span>" +
        '<h2>' + escapeHtml(section.title) + "</h2>" + health +
        '<div class="sec-progress"><div class="sec-bar"><div class="sec-fill" style="width:' + p.pct + '%"></div></div>' +
        '<span class="sec-pct">' + p.checked + "/" + p.total + "</span></div>";
      card.appendChild(head);

      var list = document.createElement("ul");
      list.className = "checklist";
      shownItems.forEach(function (item) {
        var li = document.createElement("li");
        li.className = "check-item" + (checkedSet[item.id] ? " done" : "");

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "cb-" + item.id;
        cb.checked = !!checkedSet[item.id];
        cb.setAttribute("aria-label", item.label);
        cb.addEventListener("change", function () {
          checkedSet[item.id] = cb.checked;
          if (!cb.checked) delete checkedSet[item.id];
          state.checked = getCheckedIds();
          persist(state);
          refresh();
        });

        var body = document.createElement("div");
        body.className = "check-body";
        var isNA = !!naSet[item.id];
        if (isNA) li.className += " is-na";
        body.innerHTML =
          '<label for="cb-' + item.id + '">' + escapeHtml(item.label) + "</label>" +
          '<span class="impact impact-' + item.impact + '">' + item.impact + "</span>" +
          (isNA ? '<span class="na-pill">N/A — excluded</span>' : "") +
          '<button type="button" class="btn btn-small btn-ghost na-toggle" data-na="' + item.id + '">' +
          (isNA ? "Include again" : "Mark N/A") + "</button>" +
          '<p class="tip">' + escapeHtml(item.tip) + "</p>";

        li.appendChild(cb);
        li.appendChild(body);
        list.appendChild(li);
      });
      card.appendChild(list);
      els.sections.appendChild(card);
    });
    // N/A toggles (delegated — sections re-render every refresh)
    els.sections.querySelectorAll(".na-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-na");
        var ids = toggleNA(getNaIds(), id);
        naSet = {};
        ids.forEach(function (x) { naSet[x] = true; });
        state.na = ids;
        if (naSet[id] && checkedSet[id]) delete checkedSet[id]; // N/A can't stay checked
        state.checked = getCheckedIds();
        persist(state);
        refresh();
      });
    });

    // Fix list (impact + section filters)
    var visibleFixes = filterFixes(fixes, {
      impact: els.fixImpactFilter.value,
      sectionId: els.fixSectionFilter.value
    });
    els.fixCount.textContent = visibleFixes.length;
    var eff = planEffort(visibleFixes);
    els.effortLine.textContent = visibleFixes.length
      ? "≈ " + eff.label + " of work · " + eff.quickWins + " quick win" + (eff.quickWins === 1 ? "" : "s")
      : "";
    // what-if: score after the top 3 fixes
    var top3 = fixes.slice(0, 3).map(function (f) { return f.id; });
    var proj = projectedScore(ids, AUDIT_SECTIONS, top3, naIds);
    els.whatIf.textContent = top3.length && proj.gain > 0
      ? "Finish the top " + top3.length + " fix" + (top3.length === 1 ? "" : "es") +
        " and your score goes to " + proj.score + "/" + proj.maxScore + " (+" + proj.gain + ")."
      : "";
    els.fixList.innerHTML = "";
    if (fixes.length === 0) {
      els.fixList.innerHTML = '<li class="all-done">Nothing left to fix — your local SEO is in great shape.</li>';
    } else if (visibleFixes.length === 0) {
      els.fixList.innerHTML = '<li class="all-done">No fixes match the selected filters.</li>';
    } else {
      // Group fixes by impact, Semrush-style (Errors / Warnings / Notices).
      var groups = [
        { impact: "high", label: "Errors", cls: "sev-high" },
        { impact: "medium", label: "Warnings", cls: "sev-med" },
        { impact: "low", label: "Notices", cls: "sev-low" }
      ];
      var rank = 0;
      groups.forEach(function (g) {
        var inGroup = visibleFixes.filter(function (f) { return f.impact === g.impact; });
        if (!inGroup.length) return;
        var gh = document.createElement("li");
        gh.className = "fix-group";
        gh.innerHTML = '<span class="sev-chip ' + g.cls + '">' + inGroup.length + "</span> " + g.label;
        els.fixList.appendChild(gh);
        inGroup.forEach(function (f) {
          rank++;
          var li = document.createElement("li");
          li.className = "fix-item sev-border-" + f.impact;
          var e = effortFor(f.impact);
          var notes = fixNotesFor(fixNotes, f.id);
          li.innerHTML =
            '<span class="fix-rank">' + rank + "</span>" +
            '<div class="fix-body"><strong>' + escapeHtml(f.label) + "</strong>" +
            '<span class="fix-meta">' + escapeHtml(f.sectionTitle) +
            ' · <span class="effort effort-' + f.impact + '">' + escapeHtml(e.label) + "</span></span>" +
            '<p class="tip">' + escapeHtml(f.tip) + "</p>" +
            '<button type="button" class="btn btn-small btn-ghost fix-notes-toggle" data-notes="' + f.id + '">Work notes' +
            (notes.length ? " (" + notes.length + ")" : "") + "</button>" +
            '<div class="fix-notes" id="notes-' + f.id + '" hidden>' +
            (notes.length
              ? '<ul class="note-list">' + notes.map(function (n) {
                return '<li><span class="note-date">' + escapeHtml(n.date) + "</span> " + escapeHtml(n.text) + "</li>";
              }).join("") + "</ul>"
              : '<p class="tip">No notes yet — log what you did as you work through this fix.</p>') +
            '<div class="fix-note-add"><input type="text" placeholder="Log what you did…" maxlength="500" data-note-input="' + f.id + '" aria-label="Add a work note">' +
            '<button type="button" class="btn btn-small" data-note-add="' + f.id + '">Add note</button></div>' +
            "</div></div>";
          els.fixList.appendChild(li);
        });
      });
      // work-note interactions
      els.fixList.querySelectorAll(".fix-notes-toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var panel = document.getElementById("notes-" + btn.getAttribute("data-notes"));
          if (panel) panel.hidden = !panel.hidden;
        });
      });
      els.fixList.querySelectorAll("[data-note-add]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-note-add");
          var input = els.fixList.querySelector('[data-note-input="' + id + '"]');
          var res = addFixNote(fixNotes, id, input ? input.value : "");
          if (!res.ok) { if (input) input.focus(); return; }
          fixNotes = res.notes;
          saveFixNotes(safeLS(), fixNotes);
          refresh();
        });
      });
    }

    renderHistory();
  }

  function renderReminderBanner() {
    var sel = els.reminderSel;
    var days = parseInt(state.reminderDays, 10);
    var history = loadAudits(safeLS());
    var last = history.length ? history[history.length - 1].date : (state.auditDate || "");
    var st = reminderStatus(last, isNaN(days) ? 0 : days);
    var due = nextAuditDue(last, isNaN(days) ? 0 : days);
    if (st === "off" || !due) {
      els.reminderBanner.textContent = "";
      els.reminderBanner.className = "reminder-banner";
      return;
    }
    var cls = st === "overdue" ? "over" : (st === "due-soon" ? "soon" : "");
    els.reminderBanner.className = "reminder-banner " + cls;
    els.reminderBanner.textContent = st === "overdue"
      ? "Re-audit was due " + due + " — run a fresh audit to keep the score honest."
      : (st === "due-soon"
        ? "Re-audit coming due " + due + " — schedule 10 minutes this week."
        : "Next re-audit due " + due + ".");
  }

  function renderHistory() {
    renderReminderBanner();
    var history = historyWithDeltas(loadAudits(safeLS()));
    els.historyList.innerHTML = "";
    if (history.length === 0) {
      els.historyList.innerHTML = '<li class="empty">No completed audits yet. Check every item, then hit "Complete audit".</li>';
      return;
    }
    history.slice().reverse().forEach(function (h, i, rev) {
      var delta = "";
      if (h.delta !== null && h.delta !== undefined) {
        var cls = h.delta > 0 ? "delta-up" : (h.delta < 0 ? "delta-down" : "delta-same");
        var sign = h.delta > 0 ? "+" : "";
        delta = ' <span class="delta ' + cls + '">' + sign + h.delta + " pts</span>";
      }
      // what changed since the previous audit: fixed vs slipped items
      var prevAudit = rev[i + 1];
      var diffTxt = "";
      if (prevAudit && Array.isArray(h.checkedIds)) {
        var d = diffAudits(prevAudit.checkedIds || [], h.checkedIds, AUDIT_SECTIONS);
        if (d.completed.length || d.regressed.length) {
          diffTxt = ' <span class="h-diff">+' + d.completed.length + " fixed" +
            (d.regressed.length ? ", −" + d.regressed.length + " slipped" : "") + "</span>";
        }
      }
      var li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML =
        "<span class='h-date'>" + escapeHtml(String(h.date || "")) + "</span>" +
        "<span class='h-name'>" + escapeHtml(String(h.businessName || "Unnamed business")) + "</span>" +
        "<span class='h-score'>" + Number(h.score) + " — " + escapeHtml(String(h.band || "")) + delta + diffTxt + "</span>";
      els.historyList.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- Summary (local, with optional OpenAI attempt) ----
  function localSummary(result, fixes) {
    var top = fixes.slice(0, 3).map(function (f) { return f.label; });
    var s = "Score: " + result.score + "/100 (" + result.band + "). ";
    if (top.length) {
      s += "Top fixes, in priority order: " + top.join("; ") + ".";
    } else {
      s += "Every item is complete — keep reviews coming and hours current.";
    }
    return s;
  }

  function generateSummary() {
    var ids = getCheckedIds();
    var result = computeScore(ids, AUDIT_SECTIONS, getNaIds());
    var fixes = prioritizedFixes(ids, AUDIT_SECTIONS, getNaIds());
    var key = (els.openaiKey.value || "").trim();

    function show(text, note) {
      els.summaryBox.innerHTML =
        "<p>" + escapeHtml(text) + "</p>" +
        (note ? '<p class="summary-note">' + escapeHtml(note) + "</p>" : "");
      els.summaryBox.hidden = false;
    }

    if (!key) {
      show(localSummary(result, fixes), "Local summary (no API key entered).");
      return;
    }

    els.summaryBox.innerHTML = "<p>Asking AI for a summary…</p>";
    els.summaryBox.hidden = false;

    var prompt =
      "You are an SEO coach. A small business scored " + result.score +
      "/100 on a local SEO audit (" + result.band + "). Their top unchecked fixes are: " +
      fixes.slice(0, 5).map(function (f) { return f.label + " (" + f.impact + " impact)"; }).join("; ") +
      ". Write a short, plain-English summary: what the score means and the 3 most important next steps.";

    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 220
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var text = data && data.choices && data.choices[0] &&
          data.choices[0].message && data.choices[0].message.content;
        if (text) {
          show(text.trim(), "Generated with your OpenAI key.");
        } else {
          throw new Error("empty response");
        }
      })
      .catch(function () {
        // Any failure falls back to the local summary — said honestly.
        show(
          localSummary(result, fixes),
          "AI summary wasn't available (the request failed), so here's the local summary instead."
        );
      });
  }

  // ---- Wire up controls ----
  els.businessName.value = state.businessName || "";
  els.businessName.addEventListener("input", function () {
    state.businessName = els.businessName.value;
    persist(state);
  });

  document.getElementById("completeBtn").addEventListener("click", function () {
    var ids = getCheckedIds();
    var result = computeScore(ids, AUDIT_SECTIONS, getNaIds());
    var today = new Date().toISOString().slice(0, 10);
    saveAudit(safeLS(), {
      date: today,
      businessName: state.businessName,
      score: result.score,
      band: result.band,
      checkedIds: ids
    });
    state.auditDate = today;
    persist(state);
    refresh();
    els.summaryBox.innerHTML = "<p>Audit saved to history.</p>";
    els.summaryBox.hidden = false;
  });

  els.reminderSel.value = String(state.reminderDays || "");
  els.reminderSel.addEventListener("change", function () {
    state.reminderDays = els.reminderSel.value ? parseInt(els.reminderSel.value, 10) : null;
    persist(state);
    renderReminderBanner();
  });

  document.getElementById("resetBtn").addEventListener("click", function () {
    if (!window.confirm("Reset all checkboxes? Your audit history is kept.")) return;
    checkedSet = {};
    state.checked = [];
    naSet = {};
    state.na = [];
    persist(state);
    refresh();
  });

  document.getElementById("summaryBtn").addEventListener("click", generateSummary);

  // audit item search
  els.itemSearch.addEventListener("input", function () {
    searchQuery = els.itemSearch.value;
    refresh();
  });

  // fix queue filters
  els.fixImpactFilter.addEventListener("change", refresh);
  els.fixSectionFilter.addEventListener("change", refresh);

  // copy action plan to clipboard
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  document.getElementById("copyPlanBtn").addEventListener("click", function () {
    var btn = this;
    var ids = getCheckedIds();
    var result = computeScore(ids, AUDIT_SECTIONS);
    var planFixes = prioritizedFixes(ids, AUDIT_SECTIONS);
    var text = actionPlanText(result, planFixes, state.businessName);
    function done() {
      var old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  });

  // print a clean audit report
  document.getElementById("printBtn").addEventListener("click", function () {
    window.print();
  });

  document.getElementById("settingsBtn").addEventListener("click", function () {
    els.settingsPanel.hidden = !els.settingsPanel.hidden;
  });
  document.getElementById("saveKeyBtn").addEventListener("click", function () {
    try {
      localStorage.setItem("seocheck.v1.openai_key", els.openaiKey.value.trim());
    } catch (e) {}
    els.settingsPanel.hidden = true;
  });
  try {
    els.openaiKey.value = localStorage.getItem("seocheck.v1.openai_key") || "";
  } catch (e) {}

  els.year.textContent = new Date().getFullYear();

  refresh();
})();
