/* Full page view of one record: a request or PR, an RFx, a PO, a goods receipt or an invoice.
 * Opened with App.openRecord(id), a link such as #PO-4001, or any element with data-act="rec" data-id="PO-4001".
 * The page reads only. Actions stay on the record's own screen, which the "Work on it" button opens. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc, money = App.money;

  var ID = /^(REQ|PR|RFX|PO|GRN|INV)-\d+$/;
  var HOME = { REQ: "requests", PR: "requests", RFX: "rfx", PO: "pos", GRN: "grn", INV: "invoices" };
  var day = function (iso) { return iso ? P.longDate(iso) : ""; };
  var n = function (x) { return Number(x).toLocaleString("en-US"); };

  App.isRecordId = function (id) { return ID.test(String(id || "")); };
  App.recLink = function (id) {
    return App.isRecordId(id) ? '<a class="rec" href="#' + id + '" data-act="rec" data-id="' + id + '">' + id + "</a>" : esc(id);
  };
  App.recBtn = function (id) {
    return ' <button type="button" class="small ghost" data-act="rec" data-id="' + id + '">Full record</button>';
  };
  App.openRecord = function (id) {
    id = String(id || "").trim().toUpperCase();
    App.sel.rec = id;
    App.tab = HOME[id.split("-")[0]] || App.tab;
    App.render();
    window.scrollTo(0, 0);
  };
  App.actions.rec = function (el, e) { if (e) e.preventDefault(); App.openRecord(el.dataset.id); };
  // Opens the record on its working screen, selected, so the actions there apply to it.
  App.actions.recWork = function (el) {
    var id = el.dataset.id, kind = id.split("-")[0], f = P.docFlow(App.state, id);
    if (kind === "GRN") App.go("grn", f.po.id);
    else if (kind === "PR" || kind === "REQ") App.go("requests", f.request.id);
    else App.go(HOME[kind], kind === "INV" ? null : id);
  };

  // ---------- small pieces ----------
  function facts(list) {
    return '<div class="facts">' + list.map(function (f) {
      return "<div><span>" + esc(f[0]) + "</span><b" + (f[2] ? ' class="' + f[2] + '"' : "") + ">" + f[1] + "</b></div>";
    }).join("") + "</div>";
  }
  function dl(rows) {
    return '<dl class="kv">' + rows.filter(function (r) { return r[1] !== "" && r[1] !== null && r[1] !== undefined; }).map(function (r) {
      return "<dt>" + esc(r[0]) + "</dt><dd>" + r[1] + "</dd>";
    }).join("") + "</dl>";
  }
  function section(title, body, note) {
    return '<div class="card sec"><h3>' + esc(title) + (note ? "<small>" + esc(note) + "</small>" : "") + "</h3>" + body + "</div>";
  }
  function table(head, rows, empty) {
    if (!rows.length) return '<p class="empty pad">' + esc(empty) + "</p>";
    return '<div class="wrap flat"><table><tr>' + head.map(function (h) {
      return "<th" + (/^#/.test(h) ? ' class="num">' + esc(h.slice(1)) : ">" + esc(h)) + "</th>";
    }).join("") + "</tr>" + rows.map(function (r) {
      return "<tr>" + r.map(function (c, i) { return "<td" + (/^#/.test(head[i]) ? ' class="num"' : "") + ">" + c + "</td>"; }).join("") + "</tr>";
    }).join("") + "</table></div>";
  }
  function history(ids) {
    var rows = App.state.audit.filter(function (a) { return ids.indexOf(a.entity) >= 0; }).slice().reverse().slice(0, 60);
    if (!rows.length) return '<p class="empty pad">No history yet.</p>';
    return '<ul class="tl">' + rows.map(function (a) {
      return "<li><time>" + day(a.at) + "</time><div><b>" + esc(a.action) + "</b>" + (a.note ? '<div class="muted">' + esc(a.note) + "</div>" : "") +
        '<div class="muted">' + esc(P.roleLabel(a.role)) + (ids.length > 1 ? " · " + App.recLink(a.entity) : "") + "</div></div></li>";
    }).join("") + "</ul>";
  }

  // The chain from request to invoice. Each step links to its own page. Steps that are not needed or not yet done are dashed.
  function flowStrip(f, current) {
    var r = f.request, steps = [];
    var step = function (label, id, text, state) { steps.push({ label: label, id: id, text: text, state: state || "" }); };
    step("Request", r.id, esc(r.requester) + " · " + day(r.createdAt));
    if (r.prNo) step("PR", r.prNo, plural(r.approvals.length, "approval") + " · " + day(r.approvedAt));
    else step("PR", null, r.status === "Rejected" ? "Rejected" : r.status === "Cancelled" ? "Cancelled" : "Waiting for " + P.roleLabel((r.approvals.find(function (a) { return a.status === "Pending"; }) || {}).role), "next");
    if (f.rfx) step(f.rfx.type, f.rfx.id, plural(f.rfx.quotes.length, "quote") + " · " + f.rfx.status.toLowerCase());
    else step("RFx", null, f.po ? "Not needed, " + f.po.source.toLowerCase() + " buy" : "Not started", "next");
    if (f.po) step("PO", f.po.id, P.poStatus(App.state, f.po));
    else step("PO", null, "Not yet", "next");
    if (f.grns.length) {
      var t = P.grnTotals(App.state, f.po.id), last = f.grns[f.grns.length - 1];
      step("Receipt", last.id, (f.grns.length > 1 ? plural(f.grns.length, "receipt") + " · " : "") + n(t.accepted) + " accepted" + (t.hold ? ", " + n(t.hold) + " on hold" : ""));
    } else step("Receipt", null, f.po ? "Nothing received" : "Not yet", "next");
    if (f.invoices.length) {
      var li = f.invoices[f.invoices.length - 1];
      step("Invoice", li.id, (f.invoices.length > 1 ? plural(f.invoices.length, "invoice") + " · " : "") + li.status.toLowerCase());
    } else {
      var open = f.po ? P.grnTotals(App.state, f.po.id).accepted - P.invoicedQty(App.state, f.po.id, null, ["Matched", "Paid"]) : 0;
      step("Invoice", null, open > 0 ? n(open) + " units can be billed" : "Not yet", "next");
    }
    return '<div class="flow2">' + steps.map(function (st) {
      var cur = st.id && (st.id === current || (current === f.request.id && st.id === f.request.id));
      return '<div class="fstep ' + st.state + (cur ? " cur" : "") + '"><span>' + esc(st.label) + "</span>" +
        (st.id ? (cur ? "<b>" + st.id + "</b>" : '<b><a href="#' + st.id + '" data-act="rec" data-id="' + st.id + '">' + st.id + "</a></b>") : "<b>Not yet</b>") +
        "<em>" + st.text + "</em></div>";
    }).join("") + "</div>";
  }
  function plural(k, word) { return k + " " + word + (k === 1 ? "" : "s"); }

  function band(o) {
    var home = App.tabs.find(function (t) { return t.id === o.home; });
    return '<div class="band rec"><div class="crumb"><a href="#' + o.home + '" data-act="tab" data-arg="' + o.home + '">' + esc(home.label) + "</a> / " + esc(o.id) + "</div>" +
      '<div class="bandrow"><div class="trow"><h2>' + esc(o.title) + "</h2>" + (o.pills || "") + "</div>" +
      '<div class="actions" style="margin:0"><button type="button" data-act="recWork" data-id="' + o.id + '">Work on it in ' + esc(home.label) + "</button></div></div>" +
      '<p class="bandsub">' + o.sub + "</p>" + facts(o.facts) + flowStrip(o.flow, o.id) + "</div>";
  }

  // ---------- one page per kind ----------
  function requestPage(f, id) {
    var r = f.request, it = App.item(r.itemId), bc = P.budgetStatus(App.state).find(function (b) { return b.name === r.costCenter; });
    var next = r.approvals.find(function (a) { return a.status === "Pending"; });
    var title = r.prNo ? r.prNo : r.id;
    return band({ home: "requests", id: id, title: title + (r.prNo ? " (" + r.id + ")" : ""), flow: f,
      pills: App.status(r.status) + (r.overBudget ? " " + App.pill("Over budget", "warn") : ""),
      sub: esc(r.qty + " " + r.uom + " " + it.name + " (" + it.id + ") · " + it.category + ", " + REF.categoryType[it.category]),
      facts: [["Value", money(P.requestTotal(r))], ["Quantity", n(r.qty) + " " + esc(r.uom)], ["Need by", day(r.needBy)],
        ["Cost center", esc(r.costCenter.split(" ")[0])], ["Status", esc(r.status)], ["Waiting on", next && r.status === "Pending approval" ? esc(P.roleLabel(next.role)) : "Nobody"]]
    }) + '<div class="page"><div class="secs">' +
      section("Details", '<div class="pad">' + dl([["Item", esc(it.id + " " + it.name)], ["Estimated unit price", money(r.estUnit)], ["Standard price", money(P.refPrice(it))],
        ["Deliver to", esc(r.site)], ["Cost center", esc(r.costCenter)], ["Requester", esc(r.requester)], ["Reason", esc(r.reason)], ["Raised", day(r.createdAt)],
        ["Sourcing", it.contract ? "Contract with " + esc(App.supplier(it.contract.supplierId).name) + " at " + money(it.contract.price) : P.requestTotal(r) >= REF.thresholds.rfx ? "RFx needed at this value" : "Direct buy allowed"]]) + "</div>") +
      section("Approvals", table(["Step", "Role", "Decision", "When", "Comment"], r.approvals.map(function (a, i) {
        return [String(i + 1), esc(P.roleLabel(a.role)), App.status(a.status === "Pending" ? (next === a && r.status === "Pending approval" ? "Pending approval" : "Pending") : a.status), day(a.at), esc(a.comment)];
      }), ""), "In order, set by value, item and budget") +
      (bc ? section("Budget for " + r.costCenter, '<div class="pad">' + dl([["Annual budget", money(bc.budget)], ["Paid", money(bc.paid)], ["Ordered, not paid", money(bc.orderedOpen)],
        ["Requested", money(bc.requested)], ["Remaining", '<span class="' + (bc.remaining < 0 ? "pct-bad" : "") + '">' + money(bc.remaining) + "</span>"], ["Used", bc.pct + "%"]]) + "</div>", "Now, including this request") : "") +
      section("History", '<div class="pad">' + history([r.id]) + "</div>", "From the audit trail") + "</div></div>";
  }

  function rfxPage(f, id) {
    var x = f.rfx, r = f.request, it = App.item(r.itemId), ranked = P.scoreRFx(x, App.state, App.now());
    var aw = x.award ? App.supplier(x.award.supplierId).name : null;
    var noQuote = x.invited.filter(function (s) { return !x.quotes.some(function (q) { return q.supplierId === s; }); });
    return band({ home: "rfx", id: id, title: x.id, flow: f, pills: App.status(x.status) + " " + App.pill(x.type, "mut"),
      sub: esc("For " + (r.prNo || r.id) + " · " + r.qty + " " + r.uom + " " + it.name),
      facts: [["Invited", String(x.invited.length)], ["Quotes in", String(x.quotes.length)], ["Weights", x.weights.price + " / " + x.weights.lead + " / " + x.weights.quality],
        ["Best landed", ranked.length ? money(Math.min.apply(null, ranked.map(function (q) { return q.landed; }))) : "None yet"], ["Awarded to", aw ? esc(aw) : "Not yet"], ["Opened", day(x.createdAt)]]
    }) + '<div class="page"><div class="secs">' +
      section("Ranking", table(["#", "Supplier", "Status", "#Landed", "#Lead days", "Valid until", "#Score", "Can win"], ranked.map(function (q, i) {
        var can = q.eligible ? (q.expired ? App.pill("Quote expired", "warn") : App.pill("Yes", "ok")) : App.pill(q.supplierStatus === "Not qualified" ? "Not qualified" : "Documents", "bad");
        return [String(i + 1), esc(App.supplier(q.supplierId).name) + (x.award && x.award.supplierId === q.supplierId ? " " + App.pill("Awarded", "ok") : ""), App.status(q.supplierStatus),
          money(q.landed), String(q.leadDays), esc(q.validUntil || ""), q.total.toFixed(1), can];
      }), "No quotes yet."), "Landed cost, lead time and supplier rating, weighted " + x.weights.price + "/" + x.weights.lead + "/" + x.weights.quality) +
      section("Decision", '<div class="pad">' + dl([["Award", aw ? esc(aw) + " on " + day(x.award.at) : "Not awarded"], ["Justification", x.award ? esc(x.award.justification || "Top scored eligible quote") : ""],
        ["Sole source reason", esc(x.soleReason)], ["Close date", esc(x.closeDate || "")],
        ["Invited, no quote", noQuote.length ? esc(noQuote.map(function (s) { return App.supplier(s).name; }).join(", ")) : "None"]]) + "</div>") +
      section("History", '<div class="pad">' + history([x.id]) + "</div>", "From the audit trail") + "</div></div>";
  }

  function poPage(f, id) {
    var s = App.state, po = f.po, it = App.item(po.itemId), sp = App.supplier(po.supplierId), t = P.grnTotals(s, po.id), c = P.ctb(s, po), st = P.poStatus(s, po);
    var invoiced = f.invoices.filter(function (i) { return i.status === "Matched" || i.status === "Paid"; }).reduce(function (a, i) { return a + i.qty * i.unitPrice; }, 0);
    var varPct = po.refPrice ? Math.round(1000 * (po.unitPrice - po.refPrice) / po.refPrice) / 10 : 0;
    var pct = function (k) { return Math.min(100, Math.round(100 * k / po.qty)); };
    return band({ home: "pos", id: id, title: po.id, flow: f,
      pills: App.status(st) + (c.status !== "Delivered" ? " " + App.status(c.status) + (c.slack !== null ? ' <span class="muted">' + c.slack + " days slack</span>" : "") : ""),
      sub: esc(sp.name + " · " + n(po.qty) + " " + it.uom + " " + it.name + " (" + it.id + ") · " + it.category + ", " + REF.categoryType[it.category]),
      facts: [["PO value", money(P.poTotal(po))], ["Unit price", money(po.unitPrice)], ["Promised", day(po.promisedDate) + (po.confirmed ? "" : ' <span class="pill info">Unconfirmed</span>')],
        ["Need by", day(po.needBy)], ["Received", n(t.accepted) + " of " + n(po.qty)], ["Invoiced", money(invoiced)]]
    }) + '<div class="page"><div class="secs">' +
      section("Details", '<div class="pad">' + dl([["Supplier", esc(sp.name) + " · " + App.status(sp.status) + " · rating " + sp.quality], ["Item", esc(it.id + " " + it.name)],
        ["Quantity", n(po.qty) + " " + esc(it.uom)], ["Deliver to", esc(po.site)], ["Cost center", esc(f.request.costCenter)], ["Requester", esc(f.request.requester)],
        ["Source", esc(po.source) + (po.rfxId ? " " + App.recLink(po.rfxId) : "")], ["Payment terms", "Net " + sp.terms], ["Issued", day(po.createdAt)],
        ["Supplier email", esc(P.contactOf(s, sp.id)) || '<span class="muted">None saved</span>']]) + "</div>") +
      section("Price", '<div class="pad">' + dl([["Unit price", money(po.unitPrice) + " " + (po.refPrice ? App.pill((varPct > 0 ? varPct + "% above " : varPct < 0 ? Math.abs(varPct) + "% below " : "Equal to ") + (it.contract ? "contract " : "standard ") + money(po.refPrice), varPct > 10 ? "bad" : varPct > 0 ? "warn" : "ok") : "")],
        ["Landed unit", money(P.landedUnit(po.unitPrice, po.tariffPct, po.freight)) + ' <span class="muted">tariff ' + (po.tariffPct || 0) + "%, freight " + money(po.freight || 0) + "</span>"],
        ["Landed value", money(P.poLanded(po))], ["Price reason", esc(po.varianceReason)]]) + "</div>" +
        (f.rfx ? table(["Supplier", "#Landed", "#Lead", "#Score"], P.scoreRFx(f.rfx, s, App.now()).map(function (q) {
          return [esc(App.supplier(q.supplierId).name) + (q.supplierId === po.supplierId ? " " + App.pill("Awarded", "ok") : ""), money(q.landed), q.leadDays + " d", q.total.toFixed(1)];
        }), "") : ""), f.rfx ? "Against reference and the other bids" : "Against reference") +
      section("Delivery and receipts", '<div class="pad"><div class="stack"><i class="seg-acc" style="width:' + pct(t.accepted) + '%"></i><i class="seg-hold" style="width:' + pct(t.hold) + '%"></i></div>' +
        '<div class="legend"><span class="l-acc">Accepted ' + n(t.accepted) + "</span>" + (t.hold ? '<span class="l-hold">On hold ' + n(t.hold) + "</span>" : "") +
        "<span>Still due " + n(P.leftToReceive(s, po)) + "</span>" + (t.rejected ? "<span>Rejected " + n(t.rejected) + "</span>" : "") + "</div></div>" +
        table(["Receipt", "Date", "#Qty", "Result", "Note"], f.grns.map(function (g) {
          return [App.recLink(g.id), day(g.date), n(g.qty), App.status(g.result), esc(g.note + (g.releaseNote ? " Quality: " + g.releaseNote : ""))];
        }), "Nothing received yet."), "Rejected units do not count as received") +
      section("Invoices", table(["Invoice", "Supplier no", "#Qty", "#Amount", "Status", "Due"], f.invoices.map(function (i) {
        return [App.recLink(i.id), esc(i.invNo), n(i.qty), money(i.qty * i.unitPrice), App.status(i.status), day(i.dueDate)];
      }), "No invoices yet.")) +
      section("History", '<div class="pad">' + history([po.id].concat(f.grns.map(function (g) { return g.id; }), f.invoices.map(function (i) { return i.id; }))) + "</div>", "This PO, its receipts and invoices") +
      "</div></div>";
  }

  function grnPage(f, id) {
    var g = App.state.grns.find(function (x) { return x.id === id; }), po = f.po, it = App.item(po.itemId);
    return band({ home: "grn", id: id, title: g.id, flow: f, pills: App.status(g.result),
      sub: esc("Against " + po.id + " · " + App.supplier(po.supplierId).name + " · " + it.name),
      facts: [["Quantity", n(g.qty) + " " + esc(it.uom)], ["Result", esc(g.result)], ["Date", day(g.date)], ["PO quantity", n(po.qty)],
        ["Still due on PO", n(P.leftToReceive(App.state, po))], ["Deliver to", esc(po.site)]]
    }) + '<div class="page"><div class="secs">' +
      section("Receipt", '<div class="pad">' + dl([["PO", App.recLink(po.id)], ["Item", esc(it.id + " " + it.name)], ["Note", esc(g.note)],
        ["Quality decision", esc(g.releaseNote || (g.result === "Hold" ? "Waiting for Quality" : ""))], ["Posted by", esc(P.roleLabel(g.by))]]) + "</div>") +
      section("All receipts on " + po.id, table(["Receipt", "Date", "#Qty", "Result"], f.grns.map(function (x) {
        return [x.id === g.id ? "<b>" + x.id + "</b>" : App.recLink(x.id), day(x.date), n(x.qty), App.status(x.result)];
      }), "")) +
      section("History", '<div class="pad">' + history([g.id]) + "</div>", "From the audit trail") + "</div></div>";
  }

  function invPage(f, id) {
    var i = App.state.invoices.find(function (x) { return x.id === id; }), po = f.po, t = P.grnTotals(App.state, po.id);
    var issues = i.status === "Exception" && i.match ? i.match.issues : [];
    return band({ home: "invoices", id: id, title: i.id, flow: f, pills: App.status(i.status) + (i.firstPass ? " " + App.pill("Matched first time", "ok") : ""),
      sub: esc("Supplier invoice " + i.invNo + " · " + App.supplier(i.supplierId).name + " · against " + po.id),
      facts: [["Amount", money(i.qty * i.unitPrice)], ["Quantity", n(i.qty)], ["Unit price", money(i.unitPrice)], ["Invoice date", day(i.date)],
        ["Due", day(i.dueDate)], ["Paid", i.paidAt ? day(i.paidAt) : "Not yet"]]
    }) + '<div class="page"><div class="secs">' +
      section("Three way match", table(["Check", "PO", "Receipts", "Invoice", "Result"], [
        ["Unit price", money(po.unitPrice), "", money(i.unitPrice), P.matchInvoice ? (Math.round(i.unitPrice * 100) === Math.round(po.unitPrice * 100) ? App.pill("Equal", "ok") : App.pill("Different", "bad")) : ""],
        ["Quantity", n(po.qty) + " ordered", n(t.accepted) + " accepted", n(i.qty) + " billed", issues.some(function (x) { return /^QTY|NO_RECEIPT/.test(x.code); }) ? App.pill("Gap", "bad") : App.pill("Within accepted", "ok")]
      ], ""), "Price to the cent, quantity against accepted units") +
      section("Exceptions", issues.length ? table(["Issue", "Fix owner"], issues.map(function (x) { return [esc(x.msg), esc(P.roleLabel(x.owner))]; }), "")
        : '<p class="empty pad">' + (i.status === "Rejected" ? "Rejected back to the supplier." : "None.") + "</p>") +
      section("History", '<div class="pad">' + history([i.id]) + "</div>", "From the audit trail") + "</div></div>";
  }

  App.recordPage = function (id) {
    var f = App.isRecordId(id) ? P.docFlow(App.state, id) : null;
    var kind = id.split("-")[0];
    if (!f || (kind === "GRN" && !App.state.grns.some(function (g) { return g.id === id; })) || (kind === "INV" && !App.state.invoices.some(function (x) { return x.id === id; }))) {
      return '<div class="band"><h2>' + esc(id) + ' not found</h2><p class="bandsub">There is no record with that number in this workspace. It may be from before a Reset demo.</p></div>';
    }
    if (kind === "REQ" || kind === "PR") return requestPage(f, id);
    if (kind === "RFX") return rfxPage(f, id);
    if (kind === "PO") return poPage(f, id);
    if (kind === "GRN") return grnPage(f, id);
    return invPage(f, id);
  };
})();
