document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("guide-form");
  const input = document.getElementById("guide-input");
  const answerBox = document.getElementById("guide-answer");

  if (!form || !input || !answerBox || !window.HANDBOOK) return;

  function renderAnswer(item) {
    if (!item) {
      answerBox.innerHTML = `<div class="answer-card"><h3>No direct match found</h3><p>Try rephrasing your question or picking one of the quick topics below.</p></div>`;
      return;
    }

    let title = item.title || "Handbook Answer";
    let content = item.answer || item.summary || "";
    let sourceHtml = "";

    if (item.chunk) {
      const chunkData = window.HANDBOOK.chunks.find(c => c.id === item.chunk);
      if (chunkData) {
        title = chunkData.title;
        sourceHtml = `<details class="answer-source"><summary>Read the official policy</summary><div class="quote">${chunkData.paras.join('<br><br>')}</div></details>`;
      }
    } else if (item.paras) {
      sourceHtml = `<details class="answer-source"><summary>Read the official policy</summary><div class="quote">${item.paras.join('<br><br>')}</div></details>`;
    }

    answerBox.innerHTML = `
      <div class="answer-card">
        <h3>${title}</h3>
        <p>${content}</p>
        ${sourceHtml}
      </div>
    `;
  }

  function searchHandbook(query) {
    const queryTokens = query.toLowerCase().replace(/[^\w\s]/g, "").split(" ").filter(w => w.length > 2);
    if (queryTokens.length === 0) return null;

    let bestMatch = null;
    let highestScore = 0;

    window.HANDBOOK.intents.forEach(intent => {
      let score = 0;
      const searchString = JSON.stringify(intent).toLowerCase();
      
      queryTokens.forEach(token => {
        if (searchString.includes(token)) score += 2;
        
        for (const [key, aliases] of Object.entries(window.HANDBOOK.synonyms || {})) {
          if (aliases.includes(token) && searchString.includes(key)) score += 1.5;
        }
      });

      if (score > highestScore) {
        highestScore = score;
        bestMatch = intent;
      }
    });

    if (highestScore < 3) {
      window.HANDBOOK.chunks.forEach(chunk => {
        let score = 0;
        const searchString = (chunk.title + " " + chunk.summary + " " + chunk.keywords).toLowerCase();
        
        queryTokens.forEach(token => {
          if (searchString.includes(token)) score += 1;
        });

        if (score > highestScore) {
          highestScore = score;
          bestMatch = chunk;
        }
      });
    }

    return highestScore > 0 ? bestMatch : null;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const result = searchHandbook(input.value);
    renderAnswer(result);
  });

  document.querySelectorAll(".chip[data-question]").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      input.value = chip.getAttribute("data-question");
      const result = searchHandbook(input.value);
      renderAnswer(result);
    });
  });
});
