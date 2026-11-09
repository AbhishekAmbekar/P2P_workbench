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
      { id: "projects", label: "Projects", group: "Request" },
      { id: "requests", label: "Requests and PRs" },
      { id: "rfx", label: "RFx", group: "Source" },
      { id: "contracts", label: "Contracts" },
      { id: "pos", label: "Purchase orders", group: "Order" },
      { id: "expedite", label: "Expedite" },
      { id: "grn", label: "Receipts (GRN)", group: "Receive and pay" },
      { id: "services", label: "Service entries" },
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
    Released: "ok", "Sent back": "bad", Waiting: "info", "Not yet": "mut",
    Active: "ok", "Used up": "warn", Expired: "bad", "Not started": "mut",
    Ready: "ok", "On track": "info", "At risk": "warn", Blocked: "bad", Empty: "mut", High: "bad", Medium: "warn", Low: "mut",
    "Pending approval": "info", Approved: "ok", Rejected: "bad", Cancelled: "mut", Sourcing: "info", Awarded: "ok", Ordered: "ok",
    Service: "mut", "In progress": "info", Consumed: "ok", Submitted: "info",
    Open: "info", "Technical review": "warn", Evaluating: "warn", "Award pending approval": "info", Pending: "mut", "Not reviewed": "mut",
    Issued: "info", Confirmed: "ok", "Partially received": "warn", "Quality hold": "warn", Received: "ok", Closed: "mut",
    Accepted: "ok", Hold: "warn", Matched: "ok", Exception: "bad", Paid: "mut",
    Clear: "ok", "At Risk": "warn", Late: "bad", Delivered: "mut",
    Qualified: "ok", Conditional: "warn", "Not qualified": "bad",
    Valid: "ok", Expiring: "warn", Expired: "bad", Missing: "bad"
  };
  // How an approved request will be sourced: RFx awarded, Contract CT-x, Needs RFx or Direct buy.
  App.route = function (r) {
    if (r.status === "Awarded") return "RFx awarded";
    var total = P.requestTotal(r), ct = P.contractFor(App.state, r.itemId, App.today());
    if (ct && r.qty * ct.line.price <= P.contractStatus(App.state, ct.contract, App.today()).remaining + 0.005) return "Contract " + ct.contract.id;
    return total >= REF.thresholds.rfx ? "Needs RFx" : "Direct buy";
  };
  // A titled card of fixed height for the two column card grid (.secs). The body scrolls when it holds more than fits,
  // so cards keep one size however many records they list. Used by record pages and screen detail panels.
  App.card = function (title, body, note, full) {
    return '<div class="card sec' + (full ? " full" : "") + '"><h3>' + App.esc(title) + (note ? "<small>" + App.esc(note) + "</small>" : "") + "</h3>" +
      '<div class="secbody">' + body + "</div></div>";
  };
  // In a two column card grid, a card left alone in its row spans the row, so no empty gap is left beside it.
  App.evenCards = function (root) {
    (root || document).querySelectorAll(".secs").forEach(function (grid) {
      var run = [];
      var close = function () { if (run.length % 2) run[run.length - 1].classList.add("full", "lone"); run = []; };
      Array.prototype.forEach.call(grid.children, function (el) {
        if (el.classList.contains("full")) close(); else run.push(el);
      });
      close();
    });
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
      // Saved before service POs existed: add the empty list, so old data keeps working without a reset.
      if (!App.state.ses) App.state.ses = [];
      if (!App.state.seq.SES) App.state.seq.SES = 7000;
      // Saved before contracts had their own records: turn the old fixed contract prices into approved contracts.
      P.migrateContracts(App.state, App.now());
      // Saved before projects existed: start with none. A request without projectId simply has no project.
      if (!App.state.projects) App.state.projects = [];
      if (!App.state.seq.PRJ) App.state.seq.PRJ = 9000;
      // Suppliers added since the data was saved get documents valid for one year from today.
      // This also replaces the 9999-12-31 placeholder an earlier version saved for them.
      var yearOut = P.addDays(App.today(), 365);
      REF.suppliers.forEach(function (sp) {
        var d = App.state.docs[sp.id] || (App.state.docs[sp.id] = {});
        ["quality", "origin", "subtier"].forEach(function (k) { if (!d[k] || d[k] === "9999-12-31") d[k] = yearOut; });
      });
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

  // ---------- sidebar by role ----------
  // Your work: screens where this role acts. View only: screens it follows. More screens: the rest, folded away
  // but one click open, so nothing is hidden. The engine rules still decide who can act; this only sets the focus.
  App.focus = function (role) { return (REF.focus && REF.focus[role || App.role]) || { work: [], view: [] }; };
  App.viewOnly = function (tab, role) {
    var f = App.focus(role);
    return ["dashboard", "guide", "audit"].indexOf(tab) < 0 && f.work.indexOf(tab) < 0;
  };
  // The Manager, Director and VP follow the whole cycle and get the Oversight home.
  App.oversees = function (role) { return ["manager", "director", "executive"].indexOf(role || App.role) >= 0; };
  App.actions.navMore = function () { App.sel.navMore = !App.sel.navMore; App.render(); };
  function navHtml(badges) {
    var f = App.focus(), tab = function (id) { return App.tabs.find(function (t) { return t.id === id; }); };
    var btn = function (t, cls) {
      return '<button data-act="tab" data-arg="' + t.id + '" class="' + [t.id === App.tab ? "on" : "", cls || ""].join(" ").trim() + '">' +
        "<span>" + App.esc(t.label) + "</span>" + (badges[t.id] ? '<span class="badge">' + badges[t.id] + "</span>" : "") + "</button>";
    };
    var grp = function (label) { return '<div class="navgrp">' + App.esc(label) + "</div>"; };
    var more = App.tabs.filter(function (t) {
      return t.id !== "dashboard" && t.id !== "guide" && f.work.indexOf(t.id) < 0 && f.view.indexOf(t.id) < 0;
    });
    var open = App.sel.navMore || more.some(function (t) { return t.id === App.tab; });
    var home = tab("dashboard");
    if (App.oversees()) home = { id: "dashboard", label: "Oversight" };
    return btn(home) +
      grp("Your work") + f.work.map(function (id) { return btn(tab(id)); }).join("") +
      grp("View only") + f.view.map(function (id) { return btn(tab(id), "ro"); }).join("") +
      (more.length ? '<div class="navmore" data-act="navMore" role="button" tabindex="0" aria-expanded="' + open + '">More screens <span>' + more.length + "</span></div>" +
        more.map(function (t) { return btn(t, "ro more" + (open ? "" : " hid")); }).join("") : "") +
      grp("Help") + btn(tab("guide"));
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
    document.getElementById("tabs").innerHTML = navHtml(badges);

    var view = App.views[App.tab];
    var html;
    try {
      if (App.sel.rec && App.recordPage) html = App.recordPage(App.sel.rec);
      else html = App.page(view ? view() : '<div class="card"><p class="empty">This section is not built yet.</p></div>');
    } catch (e) {
      html = '<div class="note bad">Could not draw this section: ' + App.esc(e.message) + "</div>";
    }
    // A record number at the start of a table cell becomes a link to its full page, on every screen.
    // Clicking the link opens the record page. Clicking elsewhere on the row still opens the quick panel.
    html = html.replace(/<td>((?:REQ|PR|RFX|PO|GRN|INV|SES|CT|PRJ)-\d{4})(?=[<\s])/g,
      '<td class="nw"><a class="rec" href="#$1" data-act="rec" data-id="$1">$1</a>');
    // Dates in table cells stay on one line instead of breaking at the hyphen.
    html = html.replace(/<td>(\d{4}-\d\d-\d\d)<\/td>/g, '<td class="nw">$1</td>');
    document.getElementById("view").innerHTML = html;
    App.evenCards(document.getElementById("view"));
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
    var ro = App.viewOnly(App.tab) && REF.screenOwners && REF.screenOwners[App.tab];
    return '<div class="band"><div class="bandrow"><div><h2>' + title + (ro ? ' <span class="pill mut ropill">View only</span>' : "") + "</h2>" +
      (sub ? '<p class="bandsub">' + sub + "</p>" : "") +
      (ro ? '<p class="bandro">You are working as ' + App.esc(App.roleInfo().label) + ", so this screen is for reading. " + App.esc(REF.screenOwners[App.tab]) + "</p>" : "") + "</div>" +
      csv.bar + "</div></div>" + (csv.panel ? '<div class="csvpanel">' + csv.panel + "</div>" : "") + '<div class="page">' + html + "</div>";
  };

  // ---------- events ----------
  App.actions.tab = function (el) { App.go(el.dataset.arg); };
  App.actions.goto = function (el) { App.go(el.dataset.arg, el.dataset.id); };

  document.addEventListener("click", function (e) {
    var tipped = e.target.closest && e.target.closest("[data-tip]");
    if (tipped) tipShow(tipped);
    var el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    var fn = App.actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".navmore")) { e.preventDefault(); App.actions.navMore(); }
  });
  // ---------- chart tooltips ----------
  // Any element with data-tip shows its text in a small box on hover or keyboard focus. A tap shows it on touch screens.
  var tipEl = null;
  function tipShow(el) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
    tipEl.textContent = el.getAttribute("data-tip");
    var r = el.getBoundingClientRect();
    tipEl.style.display = "block";
    var w = tipEl.offsetWidth, x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    var y = r.top - tipEl.offsetHeight - 8;
    tipEl.style.left = x + "px"; tipEl.style.top = (y < 8 ? r.bottom + 8 : y) + "px";
  }
  function tipHide() { if (tipEl) tipEl.style.display = "none"; }
  document.addEventListener("mouseover", function (e) { var el = e.target.closest && e.target.closest("[data-tip]"); if (el) tipShow(el); else tipHide(); });
  document.addEventListener("focusin", function (e) { var el = e.target.closest && e.target.closest("[data-tip]"); if (el) tipShow(el); else tipHide(); });
  document.addEventListener("focusout", tipHide);
  window.addEventListener("scroll", tipHide, true);
  App.tipText = function () { return tipEl && tipEl.style.display === "block" ? tipEl.textContent : ""; };

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
      // A new role starts every screen on its own default filter.
      App.role = e.target.value; App.sel.reqFilter = App.sel.poFilter = null; App.sel.navMore = false; save(); App.render();
    });
    bindRolePick();
    document.getElementById("resetBtn").addEventListener("click", function () {
      App.reset(); App.toast("Demo data restored");
    });
    // A link such as #PO-4001 or #invoices opens that record or screen. Otherwise show the last screen used.
    if (!(location.hash.length > 1 && App.fromHash())) App.render();
  };
})();
