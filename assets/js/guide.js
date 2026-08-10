/* Ask the Handbook — a local, offline question matcher.
   No network calls, no AI model: it scores your words against handbook text
   stored in this page and shows the official wording it matched. */
(function () {
  "use strict";

  var DATA = window.HANDBOOK;
  if (!DATA) return;

  var STOP = ("a an and are as at be by can do does for from get go how i if in is it me my "
    + "need not of on or our should so that the their there they this to was we what when where "
    + "which who whom why will with you your about have has had am are does did doing but its it's "
    + "any all).").split(" ");

  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = true; });

  function normalize(s) {
    return String(s)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[^a-z0-9$%'\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 3 && /(sses|shes|ches)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    return w;
  }

  function tokenize(s) {
    var raw = normalize(s).split(" ").filter(Boolean);
    var out = [];
    raw.forEach(function (w) {
      if (w.length < 2 || STOPSET[w]) return;
      out.push(w);
      var syn = DATA.synonyms[w];
      if (syn) syn.forEach(function (t) { out.push(t); });
    });
    var seen = {};
    var final = [];
    out.forEach(function (w) {
      var s2 = stem(w);
      if (!seen[s2]) { seen[s2] = true; final.push(s2); }
    });
    return final;
  }

  /* Pre-index chunks. */
  var chunks = DATA.chunks.map(function (c) {
    var body = c.paras.join(" \n ");
    return {
      ref: c,
      titleTokens: tokenize(c.title + " " + c.secTitle),
      keyTokens: tokenize(c.keywords || ""),
      summaryTokens: tokenize(c.summary || ""),
      bodyTokens: tokenize(body)
    };
  });

  function countIn(tokens, list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (list[i] === tokens) n++;
    return n;
  }

  function scoreChunk(entry, qTokens) {
    var score = 0;
    qTokens.forEach(function (t) {
      if (entry.titleTokens.indexOf(t) !== -1) score += 5;
      if (entry.keyTokens.indexOf(t) !== -1) score += 4;
      if (entry.summaryTokens.indexOf(t) !== -1) score += 2;
      var hits = countIn(t, entry.bodyTokens);
      if (hits) score += Math.min(3, 1 + Math.log(hits));
    });
    return score;
  }

  function scoreIntent(intent, qTokens) {
    var groupsMatched = 0;
    for (var g = 0; g < intent.groups.length; g++) {
      var group = intent.groups[g].map(stem);
      var hit = false;
      for (var i = 0; i < group.length; i++) {
        if (qTokens.indexOf(group[i]) !== -1) { hit = true; break; }
      }
      if (!hit) return 0;
      groupsMatched++;
    }
    var score = 10 * groupsMatched;
    (intent.bonus || []).forEach(function (b) {
      if (qTokens.indexOf(stem(b)) !== -1) score += 3;
    });
    return score;
  }

  function chunkById(id) {
    for (var i = 0; i < DATA.chunks.length; i++) {
      if (DATA.chunks[i].id === id) return DATA.chunks[i];
    }
    return null;
  }

  /* Best verbatim excerpt: prefer a required quote, else the paragraph with
     the most query words. */
  function bestQuote(chunk, qTokens, needle) {
    var paras = chunk.paras;
    if (!paras.length) return "";
    if (needle) {
      for (var i = 0; i < paras.length; i++) {
        if (paras[i].indexOf(needle) !== -1) return withList(focus(paras[i], needle), paras[i + 1]);
      }
    }
    var best = paras[0];
    var bestScore = -1;
    paras.forEach(function (p) {
      var pt = tokenize(p);
      var s = 0;
      qTokens.forEach(function (t) { if (pt.indexOf(t) !== -1) s++; });
      s = s - Math.min(2, p.length / 1200);
      if (s > bestScore) { bestScore = s; best = p; }
    });
    return best;
  }

  /* A passage ending in a colon introduces the list that follows it, so keep
     the two together instead of quoting an orphaned lead-in. */
  function withList(text, next) {
    if (!next || !/:\s*$/.test(text)) return text;
    return text + "\n" + next;
  }

  /* Keep long passages readable by starting at the line that matched. */
  function focus(para, needle) {
    if (para.length <= 380) return para;
    var lines = para.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(needle) !== -1) {
        if (i === 0) return para;
        return "\u2026\n" + lines.slice(i).join("\n");
      }
    }
    var at = para.indexOf(needle);
    var start = para.lastIndexOf(". ", at);
    return (start > 0 ? "\u2026 " + para.slice(start + 2) : para);
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    var cut = text.slice(0, max);
    var stop = cut.lastIndexOf(". ");
    return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut) + " \u2026";
  }

  function answer(query) {
    var qTokens = tokenize(query);
    if (!qTokens.length) return null;

    var bestIntent = null;
    var bestIntentScore = 0;
    DATA.intents.forEach(function (intent) {
      var s = scoreIntent(intent, qTokens);
      if (s > bestIntentScore) { bestIntentScore = s; bestIntent = intent; }
    });

    var scored = chunks
      .map(function (e) { return { chunk: e.ref, score: scoreChunk(e, qTokens) }; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    /* An intent with optional bonus terms needs more than a single keyword
       hit before it answers confidently; otherwise fall through to ranked
       section matching, which is labelled as a closest match. */
    var intentFloor = bestIntent && bestIntent.bonus && bestIntent.bonus.length ? 13 : 10;
    if (bestIntent && bestIntentScore >= intentFloor) {
      var target = chunkById(bestIntent.chunk);
      if (target) {
        return {
          kind: "curated",
          text: bestIntent.answer,
          chunk: target,
          quote: bestQuote(target, qTokens, bestIntent.quote),
          related: scored
            .filter(function (r) { return r.chunk.id !== target.id && r.score >= 6; })
            .slice(0, 3)
        };
      }
    }

    if (scored.length && scored[0].score >= 4) {
      var top = scored[0].chunk;
      return {
        kind: "matched",
        text: top.summary,
        chunk: top,
        quote: bestQuote(top, qTokens, null),
        related: scored.slice(1, 4).filter(function (r) { return r.score >= 6; })
      };
    }

    return {
      kind: "none",
      related: scored.filter(function (r) { return r.score >= 4; }).slice(0, 3)
    };
  }

  /* ---------- Rendering ---------- */
  var form = document.getElementById("guide-form");
  var input = document.getElementById("guide-input");
  var out = document.getElementById("guide-answer");
  if (!form || !input || !out) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function jumpButton(chunk, label) {
    var b = el("button", "btn btn--sm", label || ("Open " + chunk.title));
    b.type = "button";
    b.addEventListener("click", function () {
      if (window.CareyHandbook) window.CareyHandbook.openChunk(chunk.id);
    });
    return b;
  }

  function render(query, result) {
    out.innerHTML = "";
    var card = el("div", "answer-card");

    if (!result || result.kind === "none") {
      card.appendChild(el("h3", null, "No match in the handbook text"));
      card.appendChild(el("p", null,
        "This guide only searches the words printed in the 2026\u20132027 Music Student Handbook, so it "
        + "cannot answer questions the handbook does not cover. Try different wording, use a suggested "
        + "question, or open the official PDF. For anything the handbook leaves open, ask your applied "
        + "professor, your advisor, or the Music Office."));
      if (result && result.related.length) {
        var alt = el("div", "related");
        alt.appendChild(el("p", null, "Closest sections:"));
        var ul = el("ul");
        result.related.forEach(function (r) {
          var li = document.createElement("li");
          li.appendChild(jumpButton(r.chunk, r.chunk.title));
          ul.appendChild(li);
        });
        alt.appendChild(ul);
        card.appendChild(alt);
      }
      out.appendChild(card);
      out.setAttribute("tabindex", "-1");
      out.focus({ preventScroll: true });
      return;
    }

    var chunk = result.chunk;
    card.appendChild(el("h3", null, query));
    card.appendChild(el("p", null, result.text));

    var meta = el("p", "answer-meta",
      (result.kind === "curated"
        ? "Plain-language summary of "
        : "Closest match in the handbook: ")
      + "Section " + chunk.sec + " \u00b7 " + chunk.title
      + " \u00b7 PDF page " + chunk.page + ".");
    card.appendChild(meta);

    if (result.quote) {
      var det = el("details", "answer-source");
      det.open = true;
      var sum = el("summary", null, "Official handbook wording");
      det.appendChild(sum);
      det.appendChild(el("blockquote", "quote", truncate(result.quote, 900)));
      card.appendChild(det);
    }

    var actions = el("div", "answer-actions");
    actions.appendChild(jumpButton(chunk, "Read the full section"));
    var pdf = el("a", "btn btn--sm", "Open PDF at page " + chunk.page);
    pdf.href = DATA.pdf + "#page=" + chunk.page;
    pdf.target = "_blank";
    pdf.rel = "noopener";
    actions.appendChild(pdf);
    card.appendChild(actions);
    out.appendChild(card);

    if (result.related && result.related.length) {
      var rel = el("div", "related");
      rel.appendChild(el("p", null, "Related sections:"));
      var ul2 = el("ul");
      result.related.forEach(function (r) {
        var li = document.createElement("li");
        li.appendChild(jumpButton(r.chunk, r.chunk.title));
        ul2.appendChild(li);
      });
      rel.appendChild(ul2);
      out.appendChild(rel);
    }

    out.setAttribute("tabindex", "-1");
    out.focus({ preventScroll: true });
  }

  function ask(query) {
    var q = (query || "").trim();
    if (!q) return;
    input.value = q;
    render(q, answer(q));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    ask(input.value);
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-question]"), function (btn) {
    btn.addEventListener("click", function () {
      ask(btn.getAttribute("data-question"));
      input.focus();
    });
  });

  window.CareyGuide = { ask: ask, answer: answer };
})();
