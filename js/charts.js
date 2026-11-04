/* Small chart builders for the dashboard. Plain HTML and CSS, no library. Each returns an HTML string.
 * Colors come from CSS: committed is indigo, pipeline is orange (checked for color blind separation and
 * contrast), and delivery and invoice states use the app's status colors, always with a written label.
 * Every mark carries data-tip, which the shell shows as a tooltip on hover, focus or tap. */
(function () {
  "use strict";
  var App = window.App, esc = App.esc;
  var dollars = function (n) { return App.money(n).replace(/\.\d\d$/, ""); };
  var short = function (n) {
    n = Math.round(n);
    if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + "M";
    if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
    return "$" + n;
  };
  // A round number at or above the largest value, so gridlines land on clean labels.
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    return steps.find(function (x) { return f <= x; }) * p;
  }
  var pct = function (v, max) { return Math.max(0, Math.min(100, 100 * v / max)) + "%"; };
  var mark = function (cls, width, tip, extra) {
    return '<i class="' + cls + '" style="width:' + width + '" tabindex="0" data-tip="' + esc(tip) + '"' + (extra || "") + "></i>";
  };

  var Charts = App.charts = {};

  // Budget by cost center. One row each: committed (ordered POs, paid included) then pipeline, against a budget line.
  Charts.budget = function (rows) {
    var scale = Math.max.apply(null, rows.map(function (b) { return Math.max(b.budget, b.used); })) || 1;
    return '<div class="ch-legend"><span class="lg-com">Committed (issued POs)</span><span class="lg-pipe">Pipeline (requested, not yet ordered)</span><span class="lg-line">Budget</span></div>' +
      '<div class="ch-hbars">' + rows.map(function (b) {
        var cls = b.pct > 100 ? "pct-bad" : b.pct >= 90 ? "pct-warn" : "";
        return '<div class="hb-row"><div class="hb-label">' + esc(b.name) + "</div>" +
          '<div class="hb-track">' +
            (b.ordered > 0 ? mark("m-com", pct(b.ordered, scale), b.name + ": committed " + dollars(b.ordered) + ", of which paid " + dollars(b.paid)) : "") +
            (b.requested > 0 ? mark("m-pipe", pct(b.requested, scale), b.name + ": pipeline " + dollars(b.requested)) : "") +
            '<b class="hb-line" style="left:' + pct(b.budget, scale) + '" data-tip="' + esc(b.name + ": budget " + dollars(b.budget)) + '"></b></div>' +
          '<div class="hb-val"><span class="' + cls + '">' + b.pct + "% of " + short(b.budget) + "</span><small>" +
            (b.remaining >= 0 ? dollars(b.remaining) + " left" : '<b class="pct-bad">' + dollars(-b.remaining) + " over budget</b>") + "</small></div></div>";
      }).join("") + "</div>";
  };

  // Spend by category. Two columns per category, committed and pipeline, on one axis from zero.
  Charts.spend = function (cats, spend, pipeline, typeOf) {
    var max = niceMax(Math.max.apply(null, cats.map(function (c) { return Math.max(spend[c], pipeline[c]); })));
    var ticks = [1, 0.5, 0];
    return '<div class="ch-legend"><span class="lg-com">Committed (issued POs)</span><span class="lg-pipe">Pipeline (requested, not yet ordered)</span></div>' +
      '<div class="ch-cols"><div class="cc-axis">' + ticks.map(function (t) { return "<span>" + short(max * t) + "</span>"; }).join("") + "</div>" +
      '<div class="cc-plot">' + ticks.map(function (t) { return '<b class="cc-grid" style="bottom:' + (t * 100) + '%"></b>'; }).join("") +
      cats.map(function (c) {
        var col = function (cls, v, what) {
          return '<i class="' + cls + '" style="height:' + pct(v, max) + '" tabindex="0" data-tip="' + esc(c + ": " + what + " " + dollars(v)) + '"></i>';
        };
        return '<div class="cc-group">' + col("m-com", spend[c], "committed") + col("m-pipe", pipeline[c], "pipeline") + "</div>";
      }).join("") + "</div></div>" +
      '<div class="cc-x"><span></span>' + cats.map(function (c) {
        return "<span><b>" + esc(c) + "</b>" + esc(typeOf[c]) + "</span>";
      }).join("") + "</div>";
  };

  // One whole split into parts, such as POs by delivery health. parts: [{ label, n, cls, act, arg, filter }]
  Charts.split = function (parts, unit, empty) {
    var total = parts.reduce(function (t, p) { return t + p.n; }, 0);
    if (!total) return '<p class="empty">' + esc(empty) + "</p>";
    // A part with nothing in it draws no bar, so no gap appears before the next part.
    var go = function (p) { return p.act ? ' data-act="' + p.act + '" data-arg="' + p.arg + '"' + (p.filter ? ' data-filter="' + p.filter + '"' : "") : ""; };
    return '<div class="ch-split">' + parts.filter(function (p) { return p.n; }).map(function (p) {
      return mark("m-" + p.cls, pct(p.n, total), p.label + ": " + p.n + " " + unit + (p.n === 1 ? "" : "s") + " (" + Math.round(100 * p.n / total) + "%)", go(p));
    }).join("") + "</div>" +
      '<div class="ch-keys">' + parts.map(function (p) {
        return '<button type="button" class="ch-key k-' + p.cls + '"' + go(p) + (p.act ? "" : " disabled") + "><b>" + p.n + "</b> " + esc(p.label) + "</button>";
      }).join("") + "</div>";
  };
})();
