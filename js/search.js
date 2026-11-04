/* Search for the P2P Workbench. Pure functions with no page code, so the same rules run in the browser and in tests.
 * P.search(state, query, now) looks across every record (requests and PRs, RFx, POs, receipts, invoices),
 * suppliers and the app's screens, and returns the best matches first.
 * Every word typed must match somewhere in a result. A record number typed in full goes straight to the top. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./logic.js"));
  else root.P2P.search = factory(root.P2P);
})(typeof self !== "undefined" ? self : this, function (P) {
  "use strict";

  var REF = P.REF;
  var LIMIT = 30;
  var norm = function (t) { return String(t === null || t === undefined ? "" : t).toLowerCase(); };
  var item = function (id) { return REF.items.find(function (i) { return i.id === id; }) || {}; };
  var sup = function (id) { return REF.suppliers.find(function (x) { return x.id === id; }) || {}; };
  var money = function (n) { return P.fmt(n).replace(/\.00$/, ""); };

  // Other words people use for each screen.
  var SCREEN_WORDS = {
    dashboard: "home overview kpi budget spend my work",
    requests: "pr prs requisition requisitions purchase request approvals approve",
    rfx: "rfq rfp quote quotes sourcing bid bids tender award",
    contracts: "contract contracts rate contract agreement outline blanket order release releases call off cap",
    pos: "po pos purchase order orders release",
    expedite: "chase late overdue follow up supplier email",
    grn: "receipt receipts goods receiving receive warehouse inbound",
    services: "service services entry entries ses hours timesheet man hours labor crane hire rental consumption",
    invoices: "invoice ap accounts payable bill bills payment pay match",
    suppliers: "supplier suppliers vendor vendors documents certificate",
    audit: "audit log history trail who changed",
    guide: "guide help how rules"
  };

  // One entry per thing that can be found. words holds everything a search can match against.
  function index(s, now) {
    var out = [];
    s.requests.forEach(function (r) {
      var it = item(r.itemId);
      out.push({ kind: "Request", id: r.prNo || r.id, open: r.prNo || r.id, alt: r.prNo ? r.id : "", tab: "requests",
        title: (r.prNo ? r.prNo + " · " : "") + r.id, sub: it.name + " · " + money(P.requestTotal(r)) + " · " + r.costCenter,
        status: r.status, words: [r.id, r.prNo, it.id, it.name, it.category, r.requester, r.status, r.costCenter, r.site, r.reason].join(" ") });
    });
    s.rfx.forEach(function (x) {
      var r = s.requests.find(function (q) { return q.id === x.requestId; }) || {}, it = item(r.itemId);
      var names = x.invited.map(function (id) { return sup(id).name; });
      out.push({ kind: "RFx", id: x.id, open: x.id, tab: "rfx", title: x.id + " · " + x.type,
        sub: it.name + " · " + x.quotes.length + " of " + x.invited.length + " quoted" + (x.award ? " · awarded to " + sup(x.award.supplierId).name : ""),
        status: x.status, words: [x.id, x.type, r.prNo, r.id, it.id, it.name, x.status, names.join(" ")].join(" ") });
    });
    s.pos.forEach(function (po) {
      var it = item(po.itemId), sp = sup(po.supplierId), st = P.poStatus(s, po), c = P.ctb(s, po);
      out.push({ kind: "PO", id: po.id, open: po.id, tab: "pos", title: po.id + " · " + sp.name,
        sub: it.name + " · " + money(P.poTotal(po)) + " · " + st, status: c.status === "Delivered" ? st : c.status,
        words: [po.id, sp.name, sp.id, it.id, it.name, it.category, st, c.status, po.site, po.source, po.requestId].join(" ") });
    });
    s.grns.forEach(function (g) {
      var po = s.pos.find(function (p) { return p.id === g.poId; }) || {}, it = item(po.itemId), sp = sup(po.supplierId);
      out.push({ kind: "Receipt", id: g.id, open: g.id, tab: "grn", title: g.id + " · " + g.poId,
        sub: g.qty + " " + (it.uom || "") + " " + it.name + " · " + sp.name, status: g.result,
        words: [g.id, g.poId, sp.name, it.id, it.name, g.result, g.result === "Hold" ? "quality hold" : "", g.note].join(" ") });
    });
    (s.ses || []).forEach(function (e) {
      var po = s.pos.find(function (p) { return p.id === e.poId; }) || {}, it = item(po.itemId), sp = sup(po.supplierId);
      out.push({ kind: "Service", id: e.id, open: e.id, tab: "services", title: e.id + " · " + e.poId,
        sub: e.qty + " " + (it.uom || "") + "s " + e.period + " · " + sp.name + " · " + money(e.value), status: e.status,
        words: [e.id, e.poId, sp.name, it.id, it.name, e.period, e.status, e.status === "Submitted" ? "waiting release service entry" : "service entry", e.note].join(" ") });
    });
    (s.contracts || []).forEach(function (c) {
      var sp = sup(c.supplierId), items = c.lines.map(function (l) { return item(l.itemId); });
      out.push({ kind: "Contract", id: c.id, open: c.id, tab: "contracts", title: c.id + " · " + c.title,
        sub: sp.name + " · " + money(c.cap) + " cap · " + c.start + " to " + c.end, status: c.status,
        words: [c.id, c.title, sp.name, c.basis, c.status, "contract rate agreement"].concat(items.map(function (it) { return it.id + " " + it.name; })).join(" ") });
    });
    s.invoices.forEach(function (i) {
      var sp = sup(i.supplierId);
      out.push({ kind: "Invoice", id: i.id, open: i.id, alt: i.invNo, tab: "invoices", title: i.id + " · " + i.invNo,
        sub: sp.name + " · " + money(i.qty * i.unitPrice) + " · " + i.poId, status: i.status,
        words: [i.id, i.invNo, i.poId, sp.name, i.status].join(" ") });
    });
    var today = P.dateOf(now);
    REF.suppliers.forEach(function (sp) {
      var blocked = P.supplierDocs(s, sp.id, today).some(function (d) { return d.status === "Expired" || d.status === "Missing"; });
      out.push({ kind: "Supplier", id: sp.id, screen: "suppliers", tab: "suppliers", title: sp.name,
        sub: sp.categories.join(", ") + " · " + sp.status + (blocked ? " · documents expired" : ""), status: blocked ? "Expired" : sp.status,
        words: [sp.name, sp.id, sp.categories.join(" "), sp.status, blocked ? "blocked expired documents" : ""].join(" ") });
    });
    return out;
  }

  function screens(tabs) {
    return tabs.map(function (t) {
      return { kind: "Screen", id: t.id, screen: t.id, tab: t.id, title: t.label, sub: "Go to this screen", status: "",
        words: [t.label, t.id, SCREEN_WORDS[t.id] || ""].join(" ") };
    });
  }

  // Higher is better. 0 means no match. Every word in the query must be found.
  function score(e, words, q) {
    var id = norm(e.id), alt = norm(e.alt), title = norm(e.title), hay = norm(e.words + " " + e.title + " " + e.sub);
    if (id === q || (alt && alt === q)) return 1000;
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (hay.indexOf(w) < 0) return 0;
      if (id.indexOf(w) === 0 || (alt && alt.indexOf(w) === 0)) total += 60;
      else if (title.indexOf(w) === 0) total += 40;
      else if (new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(hay)) total += 20;
      else total += 5;
    }
    // On a tie, the documents people look up most come first.
    return total + ({ Supplier: 5, PO: 4, Request: 3, RFx: 3, Screen: 3, Invoice: 2, Receipt: 1, Service: 1, Contract: 3 }[e.kind] || 0);
  }

  // Returns up to LIMIT matches, best first. Records with the same score keep the newest first.
  function search(s, query, now, tabs) {
    var q = norm(query).trim().replace(/\s+/g, " ");
    if (!q) return [];
    var words = q.split(" ");
    var all = index(s, now).concat(screens(tabs || []));
    var num = function (e) { var m = /(\d+)$/.exec(e.id); return m ? Number(m[1]) : 0; };
    return all.map(function (e) { return { e: e, sc: score(e, words, q) }; })
      .filter(function (x) { return x.sc > 0; })
      .sort(function (a, b) { return (b.sc - a.sc) || (num(b.e) - num(a.e)); })
      .slice(0, LIMIT).map(function (x) { return x.e; });
  }

  return { search: search, index: index, LIMIT: LIMIT };
});
