/* App shell: state persistence, role switching, tabs, toasts, and a small action runner.
 * Each screen registers itself with App.views[name] = function () { return htmlString; }
 * and handles clicks through App.actions[name] = function (el) { ... }. */
(function () {
  "use strict";
  var P = window.P2P, REF = P.REF;
  var KEY = "p2p-workbench-v2";

  var App = window.App = {
    P: P, REF: REF, state: null, role: "buyer", tab: "dashboard",
    views: {}, actions: {}, sel: {}, tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "requests", label: "Requests and PRs", group: "Request" },
      { id: "rfx", label: "RFx", group: "Source" },
      { id: "pos", label: "Purchase orders", group: "Order" },
      { id: "expedite", label: "Expedite" },
      { id: "grn", label: "Receipts (GRN)", group: "Receive and pay" },
      { id: "invoices", label: "Invoices" },
      { id: "suppliers", label: "Suppliers", group: "Records" },
      { id: "audit", label: "Audit trail" },
      { id: "guide", label: "Guide", group: "Help" }
    ]
  };

  App.esc = function (s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  App.now = function () { return new Date().toISOString(); };
  App.today = function () { return App.now().slice(0, 10); };
  App.money = P.fmt;
  App.roleInfo = function (id) { return REF.roles.find(function (r) { return r.id === (id || App.role); }); };
  App.item = function (id) { return REF.items.find(function (i) { return i.id === id; }); };
  App.supplier = function (id) { return REF.suppliers.find(function (s) { return s.id === id; }); };

  App.pill = function (text, kind) { return '<span class="pill ' + (kind || "mut") + '">' + App.esc(text) + "</span>"; };
  var STATUS_KIND = {
    "Pending approval": "info", Approved: "ok", Rejected: "bad", Cancelled: "mut", Sourcing: "info", Awarded: "ok", Ordered: "ok",
    Open: "info", Evaluating: "warn",
    Issued: "info", Confirmed: "ok", "Partially received": "warn", "Quality hold": "warn", Received: "ok", Closed: "mut",
    Accepted: "ok", Hold: "warn", Matched: "ok", Exception: "bad", Paid: "mut",
    Clear: "ok", "At Risk": "warn", Late: "bad", Delivered: "mut",
    Qualified: "ok", Conditional: "warn", "Not qualified": "bad",
    Valid: "ok", Expiring: "warn", Expired: "bad", Missing: "bad"
  };
  App.status = function (s) { return App.pill(s, STATUS_KIND[s] || "mut"); };

  // ---------- persistence ----------
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ state: App.state, role: App.role, tab: App.tab })); } catch (e) { /* storage can be blocked */ }
  }
  App.save = save;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d.state || !d.state.requests || !d.state.docs) return false;
      App.state = d.state;
      if (d.role && App.roleInfo(d.role)) App.role = d.role;
      if (d.tab && App.tabs.some(function (t) { return t.id === d.tab; })) App.tab = d.tab;
      return true;
    } catch (e) { return false; }
  }
  App.reset = function () {
    App.state = P.seed(App.now());
    App.sel = {};
    save(); App.render();
  };

  // ---------- toast ----------
  var toastTimer;
  App.toast = function (msg, isErr) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show" + (isErr ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, isErr ? 6000 : 2800);
  };

  // Run a workflow action. Policy errors become a visible message and never break the page.
  App.run = function (fn, okMsg) {
    try {
      var out = fn(App.state, App.role, App.now());
      save(); App.render();
      if (okMsg) App.toast(typeof okMsg === "function" ? okMsg(out) : okMsg);
      return out;
    } catch (e) {
      App.toast(e.message, true);
      return null;
    }
  };

  App.go = function (tab, id) {
    // Leaving a screen drops its half finished "create" panel so it does not reappear later.
    if (tab !== "pos") App.sel.poNew = null;
    if (tab !== "rfx") App.sel.rfxNew = null;
    App.sel.rec = null;
    App.tab = tab;
    if (id) App.sel[tab] = id;
    save(); App.render();
    window.scrollTo(0, 0);
  };

  // ---------- role menu ----------
  // A button with a menu that always opens below it. A native select opens over itself on some systems,
  // which covered the header. The hidden select stays as the value holder, so saving and tests work the same.
  function drawRolePick() {
    var box = document.getElementById("rolePick");
    if (!box) return;
    var cur = App.roleInfo(), open = box.classList.contains("open");
    box.innerHTML = '<button type="button" class="rp-btn" aria-haspopup="listbox" aria-expanded="' + open + '" aria-labelledby="roleLbl rpNow">' +
      '<span id="rpNow"><b>' + App.esc(cur.label) + '</b><span class="rp-per"> ' + App.esc(cur.persona) + '</span></span><span class="rp-caret" aria-hidden="true"></span></button>' +
      '<ul class="rp-menu" role="listbox" aria-labelledby="roleLbl">' + REF.roles.map(function (r) {
        return '<li role="option" tabindex="-1" data-role="' + r.id + '" aria-selected="' + (r.id === App.role) + '"' + (r.id === App.role ? ' class="on"' : "") + ">" +
          "<b>" + App.esc(r.label) + "</b><span>" + App.esc(r.persona) + "</span></li>";
      }).join("") + "</ul>";
  }
  function rolePickOpen(on) {
    var box = document.getElementById("rolePick");
    box.classList.toggle("open", on);
    box.querySelector(".rp-btn").setAttribute("aria-expanded", on);
    if (on) { var li = box.querySelector("li.on") || box.querySelector("li"); li.focus(); }
  }
  function pickRole(id) {
    var sel = document.getElementById("roleSel");
    rolePickOpen(false);
    if (id && id !== App.role) { sel.value = id; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    document.querySelector("#rolePick .rp-btn").focus();
  }
  function bindRolePick() {
    var box = document.getElementById("rolePick");
    if (!box) return;
    box.addEventListener("click", function (e) {
      if (e.target.closest(".rp-btn")) { rolePickOpen(!box.classList.contains("open")); return; }
      var li = e.target.closest("li[data-role]");
      if (li) pickRole(li.dataset.role);
    });
    box.addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call(box.querySelectorAll("li[data-role]")), i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { if (box.classList.contains("open")) { e.preventDefault(); pickRole(null); } }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!box.classList.contains("open")) { rolePickOpen(true); return; }
        var next = e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
        items[next].focus();
      } else if ((e.key === "Enter" || e.key === " ") && i >= 0) { e.preventDefault(); pickRole(items[i].dataset.role); }
    });
    document.addEventListener("click", function (e) {
      if (box.classList.contains("open") && !box.contains(e.target)) rolePickOpen(false);
    });
  }

  // ---------- rendering ----------
  App.render = function () {
    var sel = document.getElementById("roleSel");
    if (!sel.options.length) {
      sel.innerHTML = REF.roles.map(function (r) {
        return '<option value="' + r.id + '">' + App.esc(r.label + " (" + r.persona + ")") + "</option>";
      }).join("");
    }
    sel.value = App.role;
    drawRolePick();
    if (App.drawSearchBox) App.drawSearchBox();

    var badges = {};
    P.queueFor(App.state, App.role, App.now()).forEach(function (q) { badges[q.tab] = (badges[q.tab] || 0) + q.count; });
    document.getElementById("tabs").innerHTML = App.tabs.map(function (t) {
      return (t.group ? '<div class="navgrp">' + App.esc(t.group) + "</div>" : "") +
        '<button data-act="tab" data-arg="' + t.id + '" class="' + (t.id === App.tab ? "on" : "") + '">' +
        "<span>" + App.esc(t.label) + "</span>" + (badges[t.id] ? '<span class="badge">' + badges[t.id] + "</span>" : "") + "</button>";
    }).join("");

    var view = App.views[App.tab];
    var html;
    try {
      if (App.sel.rec && App.recordPage) html = App.recordPage(App.sel.rec);
      else html = App.page(view ? view() : '<div class="card"><p class="empty">This section is not built yet.</p></div>');
    } catch (e) {
      html = '<div class="note bad">Could not draw this section: ' + App.esc(e.message) + "</div>";
    }
    // Dates and record numbers in table cells stay on one line instead of breaking at the hyphen.
    html = html.replace(/<td>(\d{4}-\d\d-\d\d|[A-Z]{2,4}-\d{4})<\/td>/g, '<td class="nw">$1</td>');
    document.getElementById("view").innerHTML = html;
    syncHash();
  };

  // ---------- links ----------
  // The address shows the open screen (#pos) or record (#PO-4001), so a page can be bookmarked or sent.
  // Opening a record adds a history step, so the browser Back button returns to where you were.
  function syncHash() {
    var want = "#" + (App.sel.rec || App.tab);
    if (location.hash === want) return;
    try { history[App.sel.rec ? "pushState" : "replaceState"](null, "", want); } catch (e) { /* file pages can refuse this */ }
  }
  App.fromHash = function () {
    var h = decodeURIComponent(location.hash.slice(1));
    if (!h || h === (App.sel.rec || App.tab)) return false;
    if (App.tabs.some(function (t) { return t.id === h; })) { App.sel.rec = null; App.tab = h; App.render(); return true; }
    if (App.isRecordId && App.isRecordId(h.toUpperCase())) { App.openRecord(h); return true; }
    return false;
  };
  window.addEventListener("hashchange", function () { App.fromHash(); });
  window.addEventListener("popstate", function () { App.fromHash(); });

  // Every screen gets a white header band: the title, the short description under it, and the CSV buttons.
  // Views keep returning "<h2>Title</h2><p class=hint>...</p>..." and this moves those two into the band.
  App.page = function (html) {
    var tab = App.tabs.find(function (t) { return t.id === App.tab; }), title = tab ? App.esc(tab.label) : "", sub = "";
    var m = /^<h2>([\s\S]*?)<\/h2>/.exec(html);
    if (m) { title = m[1]; html = html.slice(m[0].length); }
    m = /^<p class="hint">([\s\S]*?)<\/p>/.exec(html);
    if (m) { sub = m[1]; html = html.slice(m[0].length); }
    var csv = App.csvParts ? App.csvParts(App.tab) : { bar: "", panel: "" };
    return '<div class="band"><div class="bandrow"><div><h2>' + title + "</h2>" + (sub ? '<p class="bandsub">' + sub + "</p>" : "") + "</div>" +
      csv.bar + "</div></div>" + (csv.panel ? '<div class="csvpanel">' + csv.panel + "</div>" : "") + '<div class="page">' + html + "</div>";
  };

  // ---------- events ----------
  App.actions.tab = function (el) { App.go(el.dataset.arg); };
  App.actions.goto = function (el) { App.go(el.dataset.arg, el.dataset.id); };

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    var fn = App.actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  document.addEventListener("submit", function (e) {
    var form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    var fn = App.actions[form.dataset.form];
    if (fn) {
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      fn(data, form);
    }
  });

  // Forms can ask to hear about field changes (to preview values) without being submitted.
  document.addEventListener("input", function (e) {
    var form = e.target.closest && e.target.closest("form[data-change]");
    if (!form) return;
    var fn = App.actions[form.dataset.change];
    if (fn) fn(e.target, form);
  });
  document.addEventListener("change", function (e) {
    var form = e.target.closest && e.target.closest("form[data-change]");
    if (!form || e.target.tagName !== "SELECT") return;
    var fn = App.actions[form.dataset.change];
    if (fn) fn(e.target, form);
  });

  App.start = function () {
    if (!load()) { App.state = P.seed(App.now()); }
    document.getElementById("roleSel").addEventListener("change", function (e) {
      App.role = e.target.value; save(); App.render();
    });
    bindRolePick();
    document.getElementById("resetBtn").addEventListener("click", function () {
      App.reset(); App.toast("Demo data restored");
    });
    // A link such as #PO-4001 or #invoices opens that record or screen. Otherwise show the last screen used.
    if (!(location.hash.length > 1 && App.fromHash())) App.render();
  };
})();
