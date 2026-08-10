/* Site behaviour: section menu, reading progress, deep links, jump-to-section. */
(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var menuBtn = document.getElementById("menu-toggle");
  var menu = document.getElementById("menu-panel");
  var bar = document.getElementById("progress-bar");
  var toTop = document.getElementById("backtotop");
  var sectionState = {};

  function setMenu(open) {
    if (!menu || !menuBtn) return;
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    menuBtn.textContent = open ? "Close" : "Sections";
  }

  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      setMenu(menu.hidden);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) {
        setMenu(false);
        menuBtn.focus();
      }
    });
  }

  var lastY = window.pageYOffset;
  function onScroll() {
    var y = window.pageYOffset;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + "%";
    if (toTop) toTop.setAttribute("data-show", y > 900 ? "true" : "false");
    if (header && menu && menu.hidden) {
      var goingDown = y > lastY && y > 320;
      header.setAttribute("data-hidden", goingDown ? "true" : "false");
    }
    lastY = y;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function headerOffset() {
    return (header ? header.offsetHeight : 0) + 12;
  }

  function scrollToEl(node) {
    if (header) header.setAttribute("data-hidden", "false");
    var top = node.getBoundingClientRect().top + window.pageYOffset - headerOffset();
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top, behavior: reduce ? "auto" : "smooth" });
  }

  function flash(node) {
    node.classList.remove("flash");
    void node.offsetWidth;
    node.classList.add("flash");
  }

  /*
   * Section-level disclosure keeps the long handbook scannable on a phone.
   * The full content stays in the HTML for readers without JavaScript, while
   * JavaScript wraps it in a controllable region after the page loads.
   */
  function setSectionOpen(section, open, opts) {
    if (!section) return false;
    var content = section.querySelector(":scope > .wrap > .section-content");
    var button = section.querySelector(":scope > .wrap > .section-head > .section-toggle");
    if (!content || !button) return false;

    content.hidden = !open;
    section.setAttribute("data-section-collapsed", open ? "false" : "true");
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.textContent = open ? "Hide section" : "Open section";
    if (!opts || opts.focus !== false) button.setAttribute("aria-label",
      (open ? "Hide " : "Open ") + (section.querySelector("h2") || {}).textContent);
    sectionState[section.id] = open;
    return true;
  }

  function openParentSection(node) {
    var section = node && node.closest ? node.closest(".section") : null;
    if (section) setSectionOpen(section, true);
    return section;
  }

  function initSectionToggles() {
    Array.prototype.forEach.call(document.querySelectorAll(".section"), function (section) {
      var wrap = section.querySelector(":scope > .wrap");
      var head = wrap && wrap.querySelector(":scope > .section-head");
      if (!wrap || !head || section.querySelector(":scope > .wrap > .section-content")) return;

      var content = document.createElement("div");
      content.className = "section-content";
      content.id = section.id + "-content";
      Array.prototype.slice.call(wrap.children).forEach(function (child) {
        if (child !== head) content.appendChild(child);
      });
      /* The disclosure bulk-control belongs with the section's content, not
         in the compact section summary. This keeps a collapsed section truly
         compact and prevents a hidden-content control from feeling broken. */
      var expandControl = head.querySelector("[data-expand-all]");
      if (expandControl) {
        var expandContainer = expandControl.closest("p");
        if (expandContainer) content.insertBefore(expandContainer, content.firstChild);
      }
      wrap.appendChild(content);

      var button = document.createElement("button");
      button.type = "button";
      button.className = "section-toggle";
      button.setAttribute("aria-controls", content.id);
      head.insertBefore(button, head.children[2] || null);
      button.addEventListener("click", function () {
        var isOpen = !content.hidden;
        setSectionOpen(section, !isOpen);
        if (!isOpen) {
          scrollToEl(section);
          var heading = section.querySelector("h2");
          if (heading) {
            heading.setAttribute("tabindex", "-1");
            heading.focus({ preventScroll: true });
          }
        }
      });

      /* Start compact, unless the page was opened directly to this section. */
      var isLinked = location.hash && section.contains(document.getElementById(location.hash.slice(1)));
      setSectionOpen(section, !!isLinked, { focus: false });
    });
  }

  initSectionToggles();

  function openChunk(id, opts) {
    var node = document.getElementById(id);
    if (!node) return false;
    openParentSection(node);
    var details = node.querySelector("details.official");
    if (details && (!opts || opts.open !== false)) details.open = true;
    setMenu(false);
    scrollToEl(node);
    flash(node);
    var heading = node.querySelector("h3, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    if (history.replaceState) history.replaceState(null, "", "#" + id);
    return true;
  }

  /* Internal links to a subsection should behave like the guide's jump. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    if (!id) return;
    var node = document.getElementById(id);
    if (!node) return;
    e.preventDefault();
    if (node.classList.contains("sub")) {
      openChunk(id);
    } else {
      openParentSection(node);
      setMenu(false);
      scrollToEl(node);
      if (history.replaceState) history.replaceState(null, "", "#" + id);
    }
  });

  /* Expand / collapse all inside a section. */
  Array.prototype.forEach.call(document.querySelectorAll("[data-expand-all]"), function (btn) {
    btn.addEventListener("click", function () {
      var scope = document.getElementById(btn.getAttribute("data-expand-all"));
      if (!scope) return;
      var items = scope.querySelectorAll("details.official");
      var anyClosed = Array.prototype.some.call(items, function (d) { return !d.open; });
      Array.prototype.forEach.call(items, function (d) { d.open = anyClosed; });
      btn.textContent = anyClosed ? "Hide all official wording" : "Show all official wording";
    });
  });

  if (toTop) {
    toTop.addEventListener("click", function () {
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      var skip = document.querySelector(".skip-link");
      if (skip) skip.focus();
    });
  }

  /* Honour a deep link on load. Lazy-loaded photographs can change the page
     height while the first scroll is still running, so the position is
     corrected twice after the initial jump. */
  window.addEventListener("load", function () {
    if (location.hash.length <= 1) return;
    var id = location.hash.slice(1);
    var node = document.getElementById(id);
    if (!node) return;
    var isSub = node.classList.contains("sub");
    setTimeout(function () {
      openChunk(id, { open: isSub });
      setTimeout(function () { scrollToEl(node); }, 350);
      setTimeout(function () { scrollToEl(node); }, 900);
    }, 60);
  });

  window.CareyHandbook = { openChunk: openChunk };
})();
