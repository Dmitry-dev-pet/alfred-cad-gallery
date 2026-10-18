/* Fullscreen mode shared by the gearbox and both FreeCAD pendulum viewers.
 * Native Fullscreen API on desktop/Android, CSS overlay fallback on platforms
 * (such as older iOS Safari) that cannot fullscreen ordinary HTML elements.
 * ResizeObserver in each viewer updates the WebGL camera and renderer.
 */
(() => {
  "use strict";
  const mediaElements = [...document.querySelectorAll(".model-card-media")];
  let overlay = null;
  let restoreFocusTo = null;

  function language() { return document.documentElement.lang === "en" ? "en" : "ru"; }
  function expanded(media) { return document.fullscreenElement === media || overlay === media; }
  function refresh() {
    for (const media of mediaElements) {
      const button = media.querySelector(".model-fullscreen");
      if (!button) continue;
      const full = expanded(media);
      const ru = full ? "Выйти из полного экрана" : "На весь экран";
      const en = full ? "Exit fullscreen" : "Fullscreen";
      button.textContent = full ? "⤢" : "⛶";
      button.setAttribute("aria-label", language() === "ru" ? ru : en);
      button.setAttribute("title", language() === "ru" ? ru : en);
      button.setAttribute("aria-pressed", String(full));
    }
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.remove("is-expanded");
    overlay.closest(".project-card")?.classList.remove("viewer-parent-expanded");
    overlay = null;
    document.body.classList.remove("viewer-open");
    refresh();
    restoreFocusTo?.focus();
    restoreFocusTo = null;
  }

  function showOverlay(media) {
    if (overlay && overlay !== media) closeOverlay();
    overlay = media;
    media.classList.add("is-expanded");
    media.closest(".project-card")?.classList.add("viewer-parent-expanded");
    document.body.classList.add("viewer-open");
    refresh();
  }

  async function toggle(media) {
    const button = media.querySelector(".model-fullscreen");
    if (expanded(media)) {
      if (overlay === media) closeOverlay();
      else if (document.fullscreenElement === media && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch { /* browser refused exit */ }
      }
      refresh();
      return;
    }

    restoreFocusTo = button || document.activeElement;
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch { /* use CSS fallback */ }
    }
    if (typeof media.requestFullscreen === "function") {
      try {
        await media.requestFullscreen({navigationUI:"hide"});
        refresh();
        return;
      } catch { /* iOS and embedded browsers may reject the API */ }
    }
    showOverlay(media);
  }

  for (const media of mediaElements) {
    const button = media.querySelector(".model-fullscreen");
    if (!button) continue;
    button.addEventListener("click", () => { void toggle(media); });
  }

  document.addEventListener("fullscreenchange", () => {
    refresh();
    if (!document.fullscreenElement && !overlay) {
      restoreFocusTo?.focus();
      restoreFocusTo = null;
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !overlay) return;
    event.preventDefault();
    closeOverlay();
  }, true);

  // app.js translates the controls; synchronize the tooltips after its handler.
  document.getElementById("languageToggle")?.addEventListener("click", refresh);
  refresh();
})();
