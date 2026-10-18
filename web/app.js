(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const g = 9.81;
  const L = 0.6;
  const rodMass = 0.5;
  const optimalPivot = 126.79491924311225;
  const optimalCollar = 133.58756502501942;

  // Period of a uniform rod pivoted 'p' millimetres below its upper end.
  function pivotSmallAngle(p) {
    const d = L / 2 - p / 1000;
    const inertiaPerMass = L * L / 12 + d * d;
    return 2 * Math.PI * Math.sqrt(inertiaPerMass / (g * d));
  }

  // Rigid uniform rod + homogeneous hollow cylindrical collar.
  // The collar is locked at each tested location (not sliding during motion).
  const collarMass = 0.4;
  const rodWidth = 0.03;
  const outerRadius = 0.042;
  const innerRadius = 0.018;
  const collarHeight = 0.03;
  const a = L / 2 - optimalPivot / 1000;
  const Irod = rodMass * ((L * L + rodWidth * rodWidth) / 12 + a * a);
  const Iring = collarMass * (3 * (outerRadius * outerRadius + innerRadius * innerRadius) + collarHeight * collarHeight) / 12;
  const I0 = Irod + Iring;

  function collarSmallAngle(xMm) {
    const x = xMm / 1000;
    return 2 * Math.PI * Math.sqrt((I0 + collarMass * x * x) / (g * (rodMass * a + collarMass * x)));
  }

  // Exact ideal pendulum finite-amplitude correction via the
  // arithmetic-geometric mean: T(theta) / T0 = 1 / AGM(1, cos(theta/2)).
  function amplitudeFactor(degrees) {
    let aMean = 1;
    let bMean = Math.cos(degrees * Math.PI / 360);
    for (let i = 0; i < 12 && Math.abs(aMean - bMean) > 1e-14; i++) {
      const arithmetic = (aMean + bMean) / 2;
      const geometric = Math.sqrt(aMean * bMean);
      aMean = arithmetic;
      bMean = geometric;
    }
    return 1 / ((aMean + bMean) / 2);
  }

  function graph(svg, fn, lo, hi, selected, optimum) {
    const width = 600, height = 230;
    const left = 38, right = 575, top = 21, bottom = 196;
    const samples = Array.from({length: 151}, (_, i) => {
      const x = lo + (hi - lo) * i / 150;
      return [x, fn(x)];
    });
    const values = samples.map(([x,y]) => y);
    const yMin = Math.min(...values) - 0.035;
    const yMax = Math.max(...values) + 0.065;
    const sx = x => left + (x - lo) / (hi - lo) * (right - left);
    const sy = y => bottom - (y - yMin) / (yMax - yMin) * (bottom - top);
    const line = samples.map(([x,y],i) => (i === 0 ? "M" : "L") + sx(x).toFixed(2) + " " + sy(y).toFixed(2)).join(" ");
    const ticks = [0,1,2,3,4].map(i => {
      const y = top + (bottom - top) * i / 4;
      return '<line class="grid-line" x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '"/>';
    }).join("");
    const currentX = sx(selected), currentY = sy(fn(selected));
    const bestX = sx(optimum), bestY = sy(fn(optimum));
    svg.innerHTML =
      ticks +
      '<path class="curve" d="' + line + '"/>' +
      '<line class="guide" x1="' + currentX + '" y1="' + currentY + '" x2="' + currentX + '" y2="' + bottom + '"/>' +
      '<circle class="optimum-ring" cx="' + bestX + '" cy="' + bestY + '" r="9"/>' +
      '<circle class="current-ring" cx="' + currentX + '" cy="' + currentY + '" r="9"/>' +
      '<text x="' + left + '" y="221">' + lo + ' mm</text>' +
      '<text x="' + right + '" y="221" text-anchor="end">' + hi + ' mm</text>' +
      '<text x="' + right + '" y="18" text-anchor="end">T₀(x) / s</text>';
  }

  function refresh() {
    const pivot = Number($("pivotSlider").value);
    const collar = Number($("collarSlider").value);
    const pivotT = pivotSmallAngle(pivot);
    const collarT = collarSmallAngle(collar);
    $("pivotValue").textContent = pivot.toFixed(1) + " mm";
    $("collarValue").textContent = collar.toFixed(1) + " mm";
    $("pivotPeriod").textContent = pivotT.toFixed(4) + " s";
    $("pivotPeriod15").textContent = (pivotT * amplitudeFactor(15)).toFixed(4) + " s";
    $("collarPeriod").textContent = collarT.toFixed(4) + " s";
    $("collarPeriod20").textContent = (collarT * amplitudeFactor(20)).toFixed(4) + " s";
    for (const [id, value] of [["pivotSlider",pivot],["collarSlider",collar]]) {
      const slider = $(id);
      slider.style.setProperty("--fill", (100 * (value - Number(slider.min)) / (Number(slider.max) - Number(slider.min))).toFixed(1) + "%");
      slider.setAttribute("aria-valuetext", value.toFixed(1) + " millimetres");
    }
    graph($("pivotGraph"), pivotSmallAngle, 20, 250, pivot, optimalPivot);
    graph($("collarGraph"), collarSmallAngle, 35, 410, collar, optimalCollar);
  }

  function applyLanguage(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    document.querySelectorAll("[data-ru][data-en]").forEach(el => {
      el.textContent = el.getAttribute("data-" + lang);
    });
    $("languageToggle").textContent = lang === "ru" ? "EN" : "RU";
    $("languageToggle").setAttribute("aria-label", lang === "ru" ? "Switch to English" : "Переключить на русский");
    document.title = lang === "ru" ? "Alfred CAD Lab — механика в движении" : "Alfred CAD Lab — Mechanics in motion";
  }

  $("languageToggle").addEventListener("click", () => {
    applyLanguage(document.documentElement.lang === "ru" ? "en" : "ru");
  });

  document.querySelectorAll(".filter-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const filter = btn.dataset.filter;
      document.querySelectorAll(".filter-button").forEach(other => {
        const isActive = other === btn;
        other.classList.toggle("active", isActive);
        other.setAttribute("aria-pressed", String(isActive));
      });
      document.querySelectorAll(".project-card").forEach(card => {
        card.hidden = filter !== "all" && card.dataset.category !== filter;
      });
      document.querySelectorAll(".project-card video").forEach(video => {
        if (video.closest(".project-card").hidden) video.pause();
        else if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) video.play().catch(() => {});
      });
    });
  });

  $("pivotSlider").addEventListener("input", refresh);
  $("collarSlider").addEventListener("input", refresh);
  $("pivotReset").addEventListener("click", () => { $("pivotSlider").value = optimalPivot.toFixed(1); refresh(); });
  $("collarReset").addEventListener("click", () => { $("collarSlider").value = optimalCollar.toFixed(1); refresh(); });
  refresh();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll("video[autoplay]").forEach(video => video.pause());
  }
})();