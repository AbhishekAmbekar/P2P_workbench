/* Search panel. Opens from the header search box, Ctrl K or Cmd K, or the / key when not typing in a field.
 * The matching rules live in js/search.js. This file draws the panel and moves between results.
 * Recently opened records are kept in this browser under p2p-workbench-recent and shown when the box is empty. */
(function () {
  "use strict";
  var App = window.App, P = App.P, S = P.search, esc = App.esc;
  var RECENT_KEY = "p2p-workbench-recent", RECENT_MAX = 6;
  var mac = /Mac|iPhone|iPad/.test((navigator.platform || "") + " " + (navigator.userAgent || ""));
  var results = [], active = 0;

  // ---------- recently opened ----------
  function recent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter(function (x) { return typeof x === "string"; }); }
    catch (e) { return []; }
  }
  App.noteRecent = function (id) {
    var list = recent().filter(function (x) { return x !== id; });
    list.unshift(id);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch (e) { /* storage can be blocked */ }
  };
  function recentEntries() {
    var idx = S.index(App.state, App.now());
    return recent().map(function (id) { return idx.find(function (e) { return e.open === id || e.alt === id; }); }).filter(Boolean);
  }

  // ---------- panel ----------
  function build() {
    if (document.getElementById("sp")) return;
    var wrap = document.createElement("div");
    wrap.id = "sp"; wrap.className = "sp"; wrap.hidden = true;
    wrap.innerHTML = '<div class="sp-box" role="dialog" aria-modal="true" aria-label="Search">' +
      '<div class="sp-in"><span class="sp-icon" aria-hidden="true"></span>' +
      '<input id="spq" type="text" autocomplete="off" spellcheck="false" placeholder="Search records, suppliers, screens" role="combobox" aria-controls="spres" aria-expanded="true">' +
      '<kbd>Esc</kbd></div><ul id="spres" class="sp-res" role="listbox" aria-label="Results"></ul>' +
      '<div class="sp-foot"><span>Up and down arrows to move</span><span>Enter to open</span><span>Esc to close</span></div></div>';
    document.body.appendChild(wrap);
    var q = document.getElementById("spq"), list = document.getElementById("spres");
    q.addEventListener("input", function () { run(q.value); });
    q.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
      else if (e.key === "Escape") { e.preventDefault(); App.searchClose(); }
    });
    list.addEventListener("click", function (e) { var li = e.target.closest("li[data-i]"); if (li) choose(results[Number(li.dataset.i)]); });
    list.addEventListener("mousemove", function (e) {
      var li = e.target.closest("li[data-i]");
      if (li && Number(li.dataset.i) !== active) { active = Number(li.dataset.i); mark(); }
    });
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) App.searchClose(); });
  }

  var KIND_CLASS = { Request: "k-req", RFx: "k-rfx", PO: "k-po", Receipt: "k-grn", Invoice: "k-inv", Supplier: "k-sup", Screen: "k-scr" };

  function draw(heading, empty) {
    var list = document.getElementById("spres");
    if (!results.length) {
      list.innerHTML = '<li class="sp-empty">' + empty + "</li>";
      return;
    }
    list.innerHTML = (heading ? '<li class="sp-head" aria-hidden="true">' + esc(heading) + "</li>" : "") + results.map(function (e, i) {
      return '<li role="option" id="spo' + i + '" data-i="' + i + '"><span class="sp-kind ' + (KIND_CLASS[e.kind] || "") + '">' + esc(e.kind) + "</span>" +
        '<span class="sp-main"><b>' + esc(e.title) + "</b><span>" + esc(e.sub) + "</span></span>" +
        (e.status ? '<span class="sp-st">' + App.status(e.status) + "</span>" : "") + "</li>";
    }).join("");
    mark();
  }
  function mark() {
    var lis = document.querySelectorAll("#spres li[data-i]");
    Array.prototype.forEach.call(lis, function (li) {
      var on = Number(li.dataset.i) === active;
      li.classList.toggle("on", on); li.setAttribute("aria-selected", on);
      if (on && li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
    });
    document.getElementById("spq").setAttribute("aria-activedescendant", results.length ? "spo" + active : "");
  }
  function move(d) { if (results.length) { active = (active + d + results.length) % results.length; mark(); } }

  function run(text) {
    active = 0;
    if (!text.trim()) {
      results = recentEntries();
      draw(results.length ? "Recently opened" : "", "Type a record number such as PO-4001, a supplier, an item, a status such as late, or a screen such as receipts.");
      return;
    }
    results = S.search(App.state, text, App.now(), App.tabs);
    draw("", "Nothing matches “" + esc(text.trim()) + "”. Try fewer words, a record number, or a supplier name.");
  }

  function choose(e) {
    if (!e) return;
    App.searchClose();
    if (e.open) App.openRecord(e.open);
    else App.go(e.screen);
  }

  App.searchOpen = function (text) {
    build();
    var wrap = document.getElementById("sp"), q = document.getElementById("spq");
    wrap.hidden = false;
    document.body.classList.add("sp-on");
    q.value = text || "";
    run(q.value);
    q.focus();
  };
  App.searchClose = function () {
    var wrap = document.getElementById("sp");
    if (!wrap || wrap.hidden) return;
    wrap.hidden = true;
    document.body.classList.remove("sp-on");
    var b = document.getElementById("searchBtn");
    if (b) b.focus();
  };
  App.searchResults = function () { return results.slice(); };

  // ---------- header box and keys ----------
  function typing(el) {
    return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); App.searchOpen(); }
    else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !typing(e.target)) { e.preventDefault(); App.searchOpen(); }
  });

  App.drawSearchBox = function () {
    var b = document.getElementById("searchBtn");
    if (!b || b.dataset.ready) return;
    b.dataset.ready = "1";
    b.innerHTML = '<span class="sp-icon" aria-hidden="true"></span><span class="sb-text">Search records, suppliers or screens</span><kbd>' + (mac ? "⌘ K" : "Ctrl K") + "</kbd>";
    b.addEventListener("click", function () { App.searchOpen(); });
  };
})();
