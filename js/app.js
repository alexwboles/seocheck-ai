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

  var state = loadState();
  var checkedSet = {};
  state.checked.forEach(function (id) { checkedSet[id] = true; });

  function getCheckedIds() {
    return Object.keys(checkedSet).filter(function (id) { return checkedSet[id]; });
  }

  var els = {};
  ["businessName", "scoreFill", "scoreText", "scoreBand", "sections",
   "fixList", "fixCount", "historyList", "summaryBox", "settingsPanel",
   "openaiKey", "year"
  ].forEach(function (id) { els[id] = document.getElementById(id); });

  function refresh() {
    var ids = getCheckedIds();
    var result = computeScore(ids, AUDIT_SECTIONS);
    var fixes = prioritizedFixes(ids, AUDIT_SECTIONS);
    var progress = sectionProgress(ids, AUDIT_SECTIONS);

    // Score bar
    els.scoreFill.style.width = result.score + "%";
    els.scoreText.textContent = result.score + " / " + result.maxScore;
    els.scoreBand.textContent = result.band;
    els.scoreBand.className = "band band-" + result.band.toLowerCase().replace(/ /g, "-");

    // Sections + mini progress bars
    els.sections.innerHTML = "";
    AUDIT_SECTIONS.forEach(function (section) {
      var p = progress.filter(function (x) { return x.sectionId === section.id; })[0];
      var card = document.createElement("section");
      card.className = "card audit-section";

      var head = document.createElement("div");
      head.className = "section-head";
      head.innerHTML =
        '<h2>' + escapeHtml(section.title) + "</h2>" +
        '<div class="sec-progress"><div class="sec-bar"><div class="sec-fill" style="width:' + p.pct + '%"></div></div>' +
        '<span class="sec-pct">' + p.checked + "/" + p.total + "</span></div>";
      card.appendChild(head);

      var list = document.createElement("ul");
      list.className = "checklist";
      section.items.forEach(function (item) {
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
        body.innerHTML =
          '<label for="cb-' + item.id + '">' + escapeHtml(item.label) + "</label>" +
          '<span class="impact impact-' + item.impact + '">' + item.impact + "</span>" +
          '<p class="tip">' + escapeHtml(item.tip) + "</p>";

        li.appendChild(cb);
        li.appendChild(body);
        list.appendChild(li);
      });
      card.appendChild(list);
      els.sections.appendChild(card);
    });

    // Fix list
    els.fixCount.textContent = fixes.length;
    els.fixList.innerHTML = "";
    if (fixes.length === 0) {
      els.fixList.innerHTML = '<li class="all-done">Nothing left to fix — your local SEO is in great shape.</li>';
    } else {
      fixes.forEach(function (f, idx) {
        var li = document.createElement("li");
        li.className = "fix-item";
        li.innerHTML =
          '<span class="fix-rank">' + (idx + 1) + "</span>" +
          '<div class="fix-body"><strong>' + escapeHtml(f.label) + "</strong>" +
          '<span class="fix-meta">' + escapeHtml(f.sectionTitle) + ' · <span class="impact impact-' + f.impact + '">' + f.impact + " impact</span></span>" +
          '<p class="tip">' + escapeHtml(f.tip) + "</p></div>";
        els.fixList.appendChild(li);
      });
    }

    renderHistory();
  }

  function renderHistory() {
    var history = loadAudits(localStorage);
    els.historyList.innerHTML = "";
    if (history.length === 0) {
      els.historyList.innerHTML = '<li class="empty">No completed audits yet. Check every item, then hit "Complete audit".</li>';
      return;
    }
    history.slice().reverse().forEach(function (h) {
      var li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML =
        "<span class='h-date'>" + escapeHtml(String(h.date || "")) + "</span>" +
        "<span class='h-name'>" + escapeHtml(String(h.businessName || "Unnamed business")) + "</span>" +
        "<span class='h-score'>" + Number(h.score) + " — " + escapeHtml(String(h.band || "")) + "</span>";
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
    var result = computeScore(ids, AUDIT_SECTIONS);
    var fixes = prioritizedFixes(ids, AUDIT_SECTIONS);
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
    var result = computeScore(ids, AUDIT_SECTIONS);
    var today = new Date().toISOString().slice(0, 10);
    saveAudit(localStorage, {
      date: today,
      businessName: state.businessName,
      score: result.score,
      band: result.band
    });
    state.auditDate = today;
    persist(state);
    refresh();
    els.summaryBox.innerHTML = "<p>Audit saved to history.</p>";
    els.summaryBox.hidden = false;
  });

  document.getElementById("resetBtn").addEventListener("click", function () {
    if (!window.confirm("Reset all checkboxes? Your audit history is kept.")) return;
    checkedSet = {};
    state.checked = [];
    persist(state);
    refresh();
  });

  document.getElementById("summaryBtn").addEventListener("click", generateSummary);

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
