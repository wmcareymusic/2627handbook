document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("guide-form");
  const input = document.getElementById("guide-input");
  const answerBox = document.getElementById("guide-answer");

  if (!form || !input || !answerBox || !window.HANDBOOK) return;

  // This ensures the "Quick topics" and new "Related" buttons are always clickable
  function bindChips() {
    document.querySelectorAll(".chip[data-question]").forEach(chip => {
      const newChip = chip.cloneNode(true);
      chip.parentNode.replaceChild(newChip, chip);
      
      newChip.addEventListener("click", (e) => {
        e.preventDefault();
        input.value = newChip.getAttribute("data-question");
        const result = searchHandbook(input.value);
        renderAnswer(result);
      });
    });
  }

  // Grabs the proper title whether it is an intent or a handbook section
  function getTitle(item) {
    if (item.title) return item.title;
    if (item.chunk) {
      const c = window.HANDBOOK.chunks.find(x => x.id === item.chunk);
      return c ? c.title : "Handbook Policy";
    }
    return "Handbook Policy";
  }

  function renderAnswer(resultObj) {
    if (!resultObj || !resultObj.primary) {
      answerBox.innerHTML = `<div class="answer-card"><h3>No direct match found</h3><p>Try rephrasing your question or picking one of the quick topics below.</p></div>`;
      return;
    }

    const item = resultObj.primary;
    const related = resultObj.related || [];

    let title = getTitle(item);
    let content = item.answer || item.summary || "";
    let sourceHtml = "";

    // Build the official policy dropdown
    if (item.chunk) {
      const chunkData = window.HANDBOOK.chunks.find(c => c.id === item.chunk);
      if (chunkData) {
        sourceHtml = `<details class="answer-source"><summary>Read the official policy</summary><div class="quote">${chunkData.paras.join('<br><br>')}</div></details>`;
      }
    } else if (item.paras) {
      sourceHtml = `<details class="answer-source"><summary>Read the official policy</summary><div class="quote">${item.paras.join('<br><br>')}</div></details>`;
    }

    // Build the Related Topics buttons
    let relatedHtml = "";
    if (related.length > 0) {
      const relatedLinks = related.map(rel => {
        const relTitle = getTitle(rel);
        return `<li><button type="button" class="chip" data-question="${relTitle}">${relTitle}</button></li>`;
      }).join("");
      
      relatedHtml = `
        <div class="related" style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid #3b352f;">
          <p style="font-weight:600; margin-bottom:0.6rem; color:#b9b1a9; text-transform:uppercase; letter-spacing:0.05em; font-size:0.75rem;">Related topics</p>
          <ul class="chips">
            ${relatedLinks}
          </ul>
        </div>
      `;
    }

    answerBox.innerHTML = `
      <div class="answer-card">
        <h3>${title}</h3>
        <p>${content}</p>
        ${sourceHtml}
        ${relatedHtml}
      </div>
    `;
    
    // Re-bind click events for the newly generated related buttons
    bindChips();
  }

  function searchHandbook(query) {
    const queryTokens = query.toLowerCase().replace(/[^\w\s]/g, "").split(" ").filter(w => w.length > 1);
    if (queryTokens.length === 0) return null;

    let results = [];

    // Score all specific question intents
    window.HANDBOOK.intents.forEach(intent => {
      let score = 0;
      const searchString = JSON.stringify(intent).toLowerCase();
      
      queryTokens.forEach(token => {
        if (searchString.includes(token)) score += 3; 
        
        for (const [key, aliases] of Object.entries(window.HANDBOOK.synonyms || {})) {
          if (aliases.includes(token) && searchString.includes(key)) score += 2;
        }
      });
      if (score > 0) results.push({ item: intent, score: score });
    });

    // Score all handbook sections
    window.HANDBOOK.chunks.forEach(chunk => {
      let score = 0;
      const searchString = (chunk.title + " " + chunk.summary + " " + chunk.keywords).toLowerCase();
      
      queryTokens.forEach(token => {
        if (searchString.includes(token)) score += 1.5;
        
        for (const [key, aliases] of Object.entries(window.HANDBOOK.synonyms || {})) {
          if (aliases.includes(token) && searchString.includes(key)) score += 1;
        }
      });
      if (score > 0) results.push({ item: chunk, score: score });
    });

    // Sort the matches from highest score to lowest
    results.sort((a, b) => b.score - a.score);

    // Remove duplicates so we don't suggest the same section twice
    let uniqueResults = [];
    let seenTitles = new Set();
    
    for (let res of results) {
        let t = getTitle(res.item);
        if (!seenTitles.has(t)) {
            seenTitles.add(t);
            uniqueResults.push(res.item);
        }
    }

    if (uniqueResults.length === 0) return null;

    // Return the top match, plus up to 3 runner-ups
    return {
      primary: uniqueResults[0],
      related: uniqueResults.slice(1, 4) 
    };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const result = searchHandbook(input.value);
    renderAnswer(result);
  });

  bindChips();
});
