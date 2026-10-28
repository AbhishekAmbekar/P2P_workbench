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
      { id: "requests", label: "Requests and PRs" },
      { id: "rfx", label: "RFx" },
      { id: "pos", label: "Purchase orders" },
      { id: "grn", label: "Receipts (GRN)" },
      { id: "invoices", label: "Invoices" },
      { id: "suppliers", label: "Suppliers" },
      { id: "audit", label: "Audit trail" },
      { id: "guide", label: "Guide" }
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
    App.tab = tab;
    if (id) App.sel[tab] = id;
    save(); App.render();
    window.scrollTo(0, 0);
  };

  // ---------- rendering ----------
  App.render = function () {
    var sel = document.getElementById("roleSel");
    if (!sel.options.length) {
      sel.innerHTML = REF.roles.map(function (r) {
        return '<option value="' + r.id + '">' + App.esc(r.label + " (" + r.persona + ")") + "</option>";
      }).join("");
    }
    sel.value = App.role;

    var badges = {};
    P.queueFor(App.state, App.role, App.now()).forEach(function (q) { badges[q.tab] = (badges[q.tab] || 0) + q.count; });
    document.getElementById("tabs").innerHTML = App.tabs.map(function (t) {
      return '<button data-act="tab" data-arg="' + t.id + '" class="' + (t.id === App.tab ? "on" : "") + '">' +
        App.esc(t.label) + (badges[t.id] ? '<span class="badge">' + badges[t.id] + "</span>" : "") + "</button>";
    }).join("");

    var view = App.views[App.tab];
    var html;
    try {
      html = view ? view() : '<div class="card"><p class="empty">This section is not built yet.</p></div>';
    } catch (e) {
      html = '<div class="note bad">Could not draw this section: ' + App.esc(e.message) + "</div>";
    }
    document.getElementById("view").innerHTML = html;
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
    document.getElementById("resetBtn").addEventListener("click", function () {
      App.reset(); App.toast("Demo data restored");
    });
    App.render();
  };
})();
