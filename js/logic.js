/* Workflow engine for the P2P Workbench.
 * Pure functions over a plain state object. No DOM. Every action takes the acting role,
 * so the same rules apply in the browser and in the tests. Policy breaks throw an Error
 * with a message written for the person using the app. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"));
  else root.P2P = factory(root.P2P_REF);
})(typeof self !== "undefined" ? self : this, function (REF) {
  "use strict";

  var TH = REF.thresholds;

  // ---------- small helpers ----------
  var round1 = function (n) { return Math.round(n * 10) / 10; };
  var cents = function (n) { return Math.round(n * 100); };
  var sum = function (a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); };
  var dateOf = function (iso) { return String(iso).slice(0, 10); };
  var fail = function (m) { throw new Error(m); };
  var fmt = function (n) {
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  function addDays(dateStr, n) {
    var d = new Date(dateOf(dateStr) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round((new Date(dateOf(b) + "T00:00:00Z") - new Date(dateOf(a) + "T00:00:00Z")) / 86400000);
  }
  var validDate = function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || "") && !isNaN(new Date(d + "T00:00:00Z")); };

  var roleLabel = function (id) {
    var r = REF.roles.find(function (x) { return x.id === id; });
    return r ? r.label : id;
  };
  function need(role, allowed) {
    if (allowed.indexOf(role) < 0) {
      fail("The " + roleLabel(role) + " role cannot do this. Switch to " + allowed.map(roleLabel).join(" or ") + ".");
    }
  }
  var item = function (id) { return REF.items.find(function (i) { return i.id === id; }) || fail("Unknown item " + id); };
  var supplier = function (id) { return REF.suppliers.find(function (x) { return x.id === id; }) || fail("Unknown supplier " + id); };

  // ---------- state ----------
  function newState() {
    // Every supplier starts with all documents valid. The seed then lets a few lapse.
    var docs = {};
    REF.suppliers.forEach(function (sp) {
      docs[sp.id] = { quality: "9999-12-31", origin: "9999-12-31", subtier: "9999-12-31" };
    });
    return {
      seq: { REQ: 1000, PR: 2000, RFX: 3000, PO: 4000, GRN: 5000, INV: 6000, SES: 7000, CT: 8000, PRJ: 9000, LES: 1100 },
      requests: [], rfx: [], pos: [], grns: [], invoices: [], ses: [], contracts: [], projects: [], deliveries: [], lessons: [], guideEdits: [], audit: [], docs: docs, contacts: {}
    };
  }

  // ---------- supplier documents ----------
  // Expired or missing documents block awards and POs. Expiring ones only warn.
  // Service suppliers need a current quality certificate. Goods suppliers also need an origin declaration.
  function requiredDocs(category) {
    if (category === "Services") return ["quality"];
    var req = ["quality", "origin"];
    if (REF.subtierCategories.indexOf(category) >= 0) req.push("subtier");
    return req;
  }
  function docStatus(expires, today) {
    if (!expires) return "Missing";
    if (expires < today) return "Expired";
    return daysBetween(today, expires) <= REF.docWarnDays ? "Expiring" : "Valid";
  }
  function docIssues(s, supId, today, category) {
    var have = (s.docs && s.docs[supId]) || {};
    return requiredDocs(category).map(function (k) {
      return { doc: k, label: REF.docTypes[k], expires: have[k] || null, status: docStatus(have[k], today) };
    }).filter(function (d) { return d.status !== "Valid"; });
  }
  var blockingDocs = function (list) {
    return list.filter(function (d) { return d.status === "Expired" || d.status === "Missing"; });
  };
  var docText = function (d) { return d.label + (d.status === "Missing" ? " is missing" : " expired on " + d.expires); };
  // All documents a supplier needs for the categories it sells in, with status.
  function supplierDocs(s, supId, today) {
    var sp = supplier(supId), have = (s.docs && s.docs[supId]) || {};
    var need = ["quality"];
    if (sp.categories.some(function (c) { return c !== "Services"; })) need.push("origin");
    if (sp.categories.some(function (c) { return REF.subtierCategories.indexOf(c) >= 0; })) need.push("subtier");
    return need.map(function (k) {
      return { doc: k, label: REF.docTypes[k], expires: have[k] || null, status: docStatus(have[k], today) };
    });
  }

  // ---------- landed cost ----------
  var landedUnit = function (price, tariffPct, freight) {
    return Math.round((price * (1 + (tariffPct || 0) / 100) + (freight || 0)) * 100) / 100;
  };
  var quoteLanded = function (q) { return landedUnit(q.unitPrice, q.tariffPct, q.freight); };
  var poLanded = function (po) { return cents(po.qty * landedUnit(po.unitPrice, po.tariffPct, po.freight)) / 100; };
  // Standard price of an item. With an active contract the contract rate is the reference instead (see refPriceAt).
  var refPrice = function (it) { return it.stdPrice; };
  var nextId = function (s, key, prefix) { s.seq[key] += 1; return prefix + "-" + s.seq[key]; };
  function log(s, now, role, entity, action, note) {
    s.audit.push({ at: now, role: role, entity: entity, action: action, note: note || "" });
  }
  var byId = function (list, id, label) {
    return list.find(function (x) { return x.id === id; }) || fail(label + " " + id + " was not found.");
  };
  var getReq = function (s, id) { return byId(s.requests, id, "Request"); };
  var getRfx = function (s, id) { return byId(s.rfx, id, "RFx"); };
  var getPO = function (s, id) { return byId(s.pos, id, "PO"); };
  var getGRN = function (s, id) { return byId(s.grns, id, "GRN"); };
  var getInv = function (s, id) { return byId(s.invoices, id, "Invoice"); };

  var requestTotal = function (r) { return cents(r.qty * r.estUnit) / 100; };
  var poTotal = function (po) { return cents(po.qty * po.unitPrice) / 100; };

  // ---------- 1. request and approval ----------
  // overBudget adds the Executive when the cost center would pass its budget.
  function buildChain(it, total, overBudget) {
    var chain = ["manager"];
    if (it.needsQuality) chain.push("quality");
    if (it.needsEngineering) chain.push("engineering");
    if (total >= TH.director) chain.push("director");
    if (total >= TH.executive || overBudget) chain.push("executive");
    return chain.map(function (r) { return { role: r, status: "Pending", at: null, comment: "" }; });
  }

  // ---------- budgets ----------
  // Value a request still holds against its budget before it becomes a PO.
  function requestedValue(s, r) {
    if (["Pending approval", "Approved", "Sourcing"].indexOf(r.status) >= 0) return requestTotal(r);
    if (r.status === "Awarded") {
      var x = getRfx(s, r.rfxId);
      var q = x.quotes.find(function (z) { return z.supplierId === x.award.supplierId; });
      return cents(r.qty * quoteLanded(q)) / 100;
    }
    return 0;
  }
  // Paid is part of ordered. Used = ordered plus requested. Remaining = budget minus used.
  function budgetStatus(s) {
    var by = {};
    REF.costCenters.forEach(function (cc) {
      by[cc] = { name: cc, budget: REF.budgets[cc] || 0, paid: 0, ordered: 0, requested: 0 };
    });
    s.pos.forEach(function (po) {
      var b = by[getReq(s, po.requestId).costCenter];
      if (b && !po.cancelled) b.ordered += poLanded(po);
    });
    s.invoices.forEach(function (i) {
      if (i.status !== "Paid") return;
      var b = by[getReq(s, getPO(s, i.poId).requestId).costCenter];
      if (b) b.paid += cents(i.qty * i.unitPrice) / 100;
    });
    s.requests.forEach(function (r) {
      var b = by[r.costCenter];
      if (b) b.requested += requestedValue(s, r);
    });
    return REF.costCenters.map(function (cc) {
      var b = by[cc], r2 = function (n) { return Math.round(n * 100) / 100; };
      var ordered = r2(b.ordered), paid = Math.min(r2(b.paid), ordered), requested = r2(b.requested);
      var used = r2(ordered + requested);
      return {
        name: cc, budget: b.budget, paid: paid, orderedOpen: r2(ordered - paid), ordered: ordered, requested: requested,
        used: used, remaining: r2(b.budget - used), pct: b.budget ? Math.round(100 * used / b.budget) : 0
      };
    });
  }
  // What would this cost center look like after one more request of this value?
  function budgetCheck(s, costCenter, extra) {
    var b = budgetStatus(s).find(function (x) { return x.name === costCenter; });
    if (!b) return { found: false, over: false };
    var used = b.used + (extra || 0);
    return { found: true, budget: b.budget, used: b.used, after: used, pctAfter: b.budget ? Math.round(100 * used / b.budget) : 0, over: used > b.budget + 0.005 };
  }

  function createRequest(s, role, now, f) {
    need(role, ["requester"]);
    var it = item(f.itemId);
    var qty = Number(f.qty), est = Number(f.estUnit);
    if (!Number.isInteger(qty) || qty <= 0) fail("Quantity must be a whole number above zero.");
    if (!(est > 0)) fail("Estimated unit price must be above zero.");
    if (!validDate(f.needBy) || f.needBy < dateOf(now)) fail("Need by date cannot be in the past.");
    if (!f.site) fail("Choose a site.");
    if (!f.costCenter) fail("Choose a cost center.");
    if (!f.reason || f.reason.trim().length < 5) fail("Give a short reason for the request.");
    var total = cents(qty * est) / 100;
    var bc = budgetCheck(s, f.costCenter, total);
    var r = {
      id: nextId(s, "REQ", "REQ"), prNo: null, requester: f.requester || "Requester",
      itemId: it.id, qty: qty, uom: it.uom, estUnit: est, needBy: f.needBy,
      site: f.site, costCenter: f.costCenter, reason: f.reason.trim(),
      status: "Pending approval", approvals: buildChain(it, total, bc.over), overBudget: bc.over,
      createdAt: now, approvedAt: null, rfxId: null, poId: null, projectId: null
    };
    if (f.projectId) {
      var pj = getPRJ(s, f.projectId);
      if (pj.status !== "Open") fail(pj.id + " is closed. Choose an open project, or none.");
      r.projectId = pj.id;
    }
    s.requests.push(r);
    log(s, now, role, r.id, "Request raised", qty + " x " + it.id + " for " + fmt(requestTotal(r)) +
      ". Approval chain: " + r.approvals.map(function (a) { return roleLabel(a.role); }).join(" then ") +
      (bc.over ? ". Over budget: " + f.costCenter + " would reach " + bc.pctAfter + "% of its " + fmt(bc.budget) + " budget, so the Executive must approve" : ""));
    return r;
  }

  function cancelRequest(s, role, now, reqId, reason) {
    need(role, ["requester"]);
    var r = getReq(s, reqId);
    if (r.status !== "Pending approval" && r.status !== "Approved") {
      fail("Only requests that are pending or approved (and not yet sourced) can be cancelled.");
    }
    r.status = "Cancelled";
    log(s, now, role, r.id, "Request cancelled", reason || "");
    return r;
  }

  function decide(s, role, now, reqId, decision, comment) {
    var r = getReq(s, reqId);
    if (r.status !== "Pending approval") fail("This request is not waiting for approval.");
    var step = r.approvals.find(function (a) { return a.status === "Pending"; });
    if (!step) fail("No approval step is pending.");
    if (step.role !== role) {
      fail("The next approval belongs to the " + roleLabel(step.role) + ", not the " + roleLabel(role) + ".");
    }
    if (decision !== "Approved" && decision !== "Rejected") fail("Decision must be Approved or Rejected.");
    var c = (comment || "").trim();
    if (decision === "Rejected" && c.length < 5) fail("Add a reason when rejecting.");
    step.status = decision; step.at = now; step.comment = c;
    if (decision === "Rejected") {
      r.status = "Rejected";
      log(s, now, role, r.id, "Rejected at " + roleLabel(role) + " step", c);
    } else if (!r.approvals.some(function (a) { return a.status === "Pending"; })) {
      r.status = "Approved"; r.prNo = nextId(s, "PR", "PR"); r.approvedAt = now;
      log(s, now, role, r.id, "Final approval. PR " + r.prNo + " issued", c);
    } else {
      log(s, now, role, r.id, "Approved at " + roleLabel(role) + " step", c);
    }
    return r;
  }

  // ---------- 2. RFx ----------
  function startRFx(s, role, now, reqId, f) {
    need(role, ["buyer"]);
    var r = getReq(s, reqId);
    if (r.status !== "Approved") fail("Only approved PRs can go to sourcing.");
    var it = item(r.itemId);
    var invited = Array.from(new Set(f.invited || []));
    invited.forEach(function (id) {
      var sp = supplier(id);
      if (sp.categories.indexOf(it.category) < 0) fail(sp.name + " does not supply " + it.category + ".");
    });
    if (invited.length < 1) fail("Invite at least one supplier.");
    var sole = (f.soleReason || "").trim();
    if (invited.length < 2 && sole.length < 10) {
      fail("Invite at least two suppliers, or explain why only one is possible (sole source reason).");
    }
    var adj = readAdj(f, REF.adjust);
    var x = {
      id: nextId(s, "RFX", "RFX"), type: f.type === "RFP" ? "RFP" : "RFQ", requestId: r.id,
      status: "Open", invited: invited, adj: adj, soleReason: sole, quotes: [],
      createdAt: now, closeDate: f.closeDate || null, award: null
    };
    s.rfx.push(x);
    r.status = "Sourcing"; r.rfxId = x.id;
    log(s, now, role, x.id, x.type + " opened for " + (r.prNo || r.id),
      "Invited " + invited.map(function (id) { return supplier(id).name; }).join(", ") +
      (sole ? ". Sole source reason: " + sole : ""));
    return x;
  }

  // ---------- 2a. adjusted price (bonus and malus) ----------
  // Each difference that is not in the price gets a dollar value, so every offer competes on one number. The values
  // are set per RFx (defaults in REF.adjust) and lock when bidding closes, so they cannot be tuned after seeing prices.
  var ADJ_FIELDS = [
    ["capitalPct", "Cost of capital (% a year)", 0, 30], ["baseTermsDays", "Standard payment terms (days)", 0, 180],
    ["conditionalCost", "Extra checks for a conditional supplier (per award)", 0, 1000000],
    ["bufferDays", "Schedule buffer before the need date (days)", 0, 90], ["dayPct", "Cost per day short of the buffer (% of landed)", 0, 10],
    ["qualityTarget", "Supplier rating target", 0, 100], ["qualityPct", "Cost per rating point below target (% of landed)", 0, 10]
  ];
  function readAdj(f, base) {
    var out = {};
    ADJ_FIELDS.forEach(function (d) {
      var v = f[d[0]];
      v = v === undefined || v === null || v === "" ? base[d[0]] : Number(v);
      if (!(v >= d[2] && v <= d[3])) fail(d[1] + " must be between " + d[2] + " and " + d[3] + ".");
      out[d[0]] = v;
    });
    return out;
  }
  var adjOf = function (x) { return x.adj || Object.assign({}, REF.adjust); };
  // The day offers are measured from: bidding close once closed, today while open.
  var evalDateOf = function (x, now) { return x.evalDate || (x.status === "Open" ? dateOf(now || new Date().toISOString()) : dateOf(x.createdAt)); };
  var termsDays = function (q, sp) { var m = /net\s*(\d+)/i.exec(q.terms || ""); return m ? Number(m[1]) : sp.terms; };

  function setAdjustments(s, role, now, rfxId, f) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    if (x.status !== "Open") fail("The adjustment values locked when bidding closed, so they cannot be changed after the prices are known.");
    var old = adjOf(x), adj = readAdj(f, old);
    var changed = ADJ_FIELDS.filter(function (d) { return old[d[0]] !== adj[d[0]]; });
    if (!changed.length) fail("Nothing changed.");
    x.adj = adj;
    log(s, now, role, x.id, "Adjustment values changed", changed.map(function (d) { return d[1] + " " + old[d[0]] + " to " + adj[d[0]]; }).join("; "));
    return x;
  }

  // The bonus and malus lines for one offer, and its adjusted unit price.
  function adjustQuote(s, x, z, landed, now) {
    var a = adjOf(x), sp = supplier(z.supplierId), r = getReq(s, x.requestId), lines = [];
    var add = function (amount, label) { amount = round2c(amount); if (amount) lines.push({ kind: amount < 0 ? "Bonus" : "Malus", amount: amount, label: label }); };
    var td = termsDays(z, sp);
    add(landed * a.capitalPct / 100 * (a.baseTermsDays - td) / 365,
      "Net " + td + " against standard net " + a.baseTermsDays + ", at " + a.capitalPct + "% a year");
    if (sp.status === "Conditional") add(a.conditionalCost / r.qty, "Conditional supplier: " + fmt(a.conditionalCost) + " of extra checks over " + r.qty + " units");
    var slip = x.slips && x.slips[z.supplierId] !== undefined ? x.slips[z.supplierId] : (function () { var rec = deliveryRecord(s, z.supplierId); return rec.enough ? rec.typicalSlip : 0; })();
    var ready = addDays(evalDateOf(x, now), z.leadDays + slip), slack = daysBetween(ready, r.needBy), short = Math.max(0, a.bufferDays - slack);
    var n = function (k, w) { return k + " " + w + (k === 1 ? "" : "s"); };
    add(landed * a.dayPct / 100 * short, (slack < 0 ? "Ready " + n(-slack, "day") + " after the need date" : "Ready " + n(slack, "day") + " before the need date") +
      (slip ? ", planned on a usual slip of " + n(slip, "day") : "") + ": " + n(short, "day") + " short of the " + a.bufferDays + " day buffer");
    var pts = Math.max(0, a.qualityTarget - sp.quality);
    add(landed * a.qualityPct / 100 * pts, "Rating " + sp.quality + ", " + n(pts, "point") + " below the target of " + a.qualityTarget);
    var sum = lines.reduce(function (t, l) { return t + l.amount; }, 0);
    return { lines: lines, adjusted: round2c(landed + sum), ready: ready, slack: slack, slip: slip, termsDays: td };
  }
  var round2c = function (n) { return Math.round(n * 100) / 100; };

  // ---------- 2b. best and final round (round 2) ----------
  // After the technical review the Buyer can run one more round for the eligible offers. Each supplier is told only its
  // own rank. Round 1 offers stay binding: a round 2 offer can lower the price, shorten the lead time or lengthen the
  // terms, never the reverse. One round only, so suppliers have no reason to hold back for a third.
  var ordinal = function (n) { return n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"); };

  // A rule of thumb for the next step, from the number of eligible offers and the gap between them.
  function rfxStrategy(s, x, now) {
    if (x.status !== "Evaluating" || x.round2) return null;
    var el = scoreRFx(x, s, now).filter(function (q) { return q.eligible && !q.expired; });
    if (!el.length) return { kind: "none", text: "No eligible offer. Invite more suppliers, or ask the suppliers whose offers failed to quote again to the spec." };
    if (el.length === 1) {
      var it = item(getReq(s, x.requestId).itemId);
      return { kind: "negotiate", text: "One eligible offer, so another round would add no competition. Negotiate with the supplier directly. Compare its price with the standard price of " +
        fmt(it.stdPrice) + " and with past orders on the item card." };
    }
    var gap = round1((el[1].adjusted - el[0].adjusted) / el[0].adjusted * 100);
    return { kind: "round2", n: el.length, gap: gap, text: el.length + " eligible offers, " + gap + "% apart on the adjusted price. Suggested: one best and final round. " +
      "Each supplier learns only its own rank, and round 1 offers stay binding." +
      (gap > 15 ? " The gap is wide, so the leader has little reason to move. The round mainly tests whether the others can close it." :
        gap < 3 ? " The offers are close, so each supplier has a real chance to win by improving." : "") };
  }

  function openRound2(s, role, now, rfxId, f) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    if (x.round2) fail("This RFx already had its best and final round. There is one round only, as the suppliers were told.");
    if (x.status !== "Evaluating") fail("Round 2 opens after the technical review and before an award is recommended.");
    var el = scoreRFx(x, s, now).filter(function (q) { return q.eligible && !q.expired; });
    if (el.length < 2) fail("A best and final round needs at least 2 eligible offers. With one, negotiate directly.");
    var close = (f && f.closeDate) || addDays(dateOf(now), 3);
    if (!validDate(close) || close < dateOf(now)) fail("Round 2 cannot close in the past.");
    var ranks = {}, first = {};
    el.forEach(function (q, i) {
      ranks[q.supplierId] = i + 1;
      first[q.supplierId] = { unitPrice: q.unitPrice, leadDays: q.leadDays, terms: q.terms, termsDays: q.termsDays, landed: q.landed, adjusted: q.adjusted };
    });
    x.round2 = { openedAt: now, closeDate: close, invited: el.map(function (q) { return q.supplierId; }), of: el.length, ranks: ranks, first: first, offers: {}, closedAt: null };
    x.status = "Round 2";
    log(s, now, role, x.id, "Round 2 opened", "Best and final round for " + el.map(function (q) { return supplier(q.supplierId).name; }).join(", ") +
      ". Closes " + close + ". Round 1 offers stay binding.");
    return x;
  }

  function addRound2Offer(s, role, now, rfxId, f) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    if (x.status !== "Round 2") fail("Round 2 is not open on this RFx.");
    var sp = supplier(f.supplierId);
    if (x.round2.invited.indexOf(f.supplierId) < 0) fail(sp.name + " is not in round 2. Only eligible offers from round 1 are invited.");
    var q = x.quotes.find(function (z) { return z.supplierId === f.supplierId; }), one = x.round2.first[f.supplierId];
    var blank = function (v) { return v === undefined || v === null || v === ""; };
    var price = Number(f.unitPrice), lead = blank(f.leadDays) ? one.leadDays : Number(f.leadDays), terms = blank(f.terms) ? one.terms : String(f.terms).trim();
    if (!(price > 0)) fail("Enter the round 2 unit price.");
    if (price > one.unitPrice) fail(sp.name + "'s round 2 price of " + fmt(price) + " is higher than its binding round 1 price of " + fmt(one.unitPrice) +
      ". A round 2 offer can only be the same or lower.");
    if (!Number.isInteger(lead) || lead < 1) fail("Lead time must be a whole number of days, at least 1.");
    if (lead > one.leadDays) fail(sp.name + "'s round 2 lead time cannot be longer than round 1 (" + one.leadDays + " days).");
    var td = termsDays({ terms: terms }, sp);
    if (td < one.termsDays) fail(sp.name + "'s round 2 payment terms cannot be shorter than round 1 (net " + one.termsDays + ").");
    q.unitPrice = price; q.leadDays = lead; q.terms = terms; q.round = 2;
    x.round2.offers[f.supplierId] = { at: now };
    log(s, now, role, x.id, "Round 2 offer: " + sp.name, fmt(one.unitPrice) + " to " + fmt(price) + " each, " + lead + " days lead time" + (terms ? ", " + terms : ""));
    return x;
  }

  function closeRound2(s, role, now, rfxId) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    if (x.status !== "Round 2") fail("Round 2 is not open on this RFx.");
    x.round2.closedAt = now; x.status = "Evaluating";
    var silent = x.round2.invited.filter(function (id) { return !x.round2.offers[id]; });
    log(s, now, role, x.id, "Round 2 closed", (x.round2.invited.length - silent.length) + " of " + x.round2.invited.length + " improved their offer" +
      (silent.length ? ". Round 1 stands for " + silent.map(function (id) { return supplier(id).name; }).join(", ") : ""));
    return x;
  }

  // What round 2 saved on one supplier's offer, on landed cost, per unit and for the order.
  function round2Saving(s, x, supId) {
    if (!x.round2 || !x.round2.first[supId]) return null;
    var q = x.quotes.find(function (z) { return z.supplierId === supId; }), one = x.round2.first[supId], qty = getReq(s, x.requestId).qty;
    var unit = round2c(one.landed - quoteLanded(q));
    return { unit: unit, total: round2c(unit * qty), pct: one.landed ? round1(unit / one.landed * 100) : 0, from: one.landed, to: quoteLanded(q) };
  }

  // The rank only email for one supplier. Nothing about other offers goes in it.
  function round2Draft(s, x, supId, fromName) {
    var r = getReq(s, x.requestId), it = item(r.itemId), sp = supplier(supId), one = x.round2.first[supId];
    var units = plural(r.qty, it.uom, it.uom === "ea" ? "units" : it.uom + "s");
    return {
      to: contactOf(s, supId), subject: x.id + " " + it.name + ": best and final offer by " + longDate(x.round2.closeDate),
      body: "Hi " + sp.name + " team,\n\nThank you for your offer on " + x.id + " for " + units + " of " + it.name + ".\n\n" +
        "After the technical review and our total cost comparison, your offer ranks " + ordinal(x.round2.ranks[supId]) + " of " + x.round2.of + ". " +
        "The comparison looks at landed cost, lead time against our need date, payment terms and supplier status, not only the unit price. " +
        "We do not share other suppliers' offers.\n\n" +
        "Your round 1 offer of " + fmt(one.unitPrice) + " per " + (it.uom === "ea" ? "unit" : it.uom) + ", " + one.leadDays + " days lead time" + (one.terms ? " and " + one.terms : "") + " stays binding. " +
        "If you wish to improve it, please reply by " + longDate(x.round2.closeDate) + " with your best and final price, lead time and terms.\n\n" +
        "This is the only further round. We will not ask again.\n\nThank you,\n" + fromName
    };
  }
  function logRound2Draft(s, role, now, rfxId, supId, via) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    log(s, now, role, x.id, "Round 2 email drafted for " + supplier(supId).name, "Opened through " + via + ". The app cannot tell if it was sent.");
  }

  function addQuote(s, role, now, rfxId, f) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    if (x.status !== "Open") fail("Bidding is closed on this RFx.");
    if (x.invited.indexOf(f.supplierId) < 0) fail("That supplier was not invited.");
    var price = Number(f.unitPrice), lead = Number(f.leadDays);
    if (!(price > 0)) fail("Quoted unit price must be above zero.");
    if (!Number.isInteger(lead) || lead < 1) fail("Lead time must be a whole number of days, at least 1.");
    var blank = function (v) { return v === undefined || v === null || v === ""; };
    var tariff = blank(f.tariffPct) ? 0 : Number(f.tariffPct);
    var freight = blank(f.freight) ? 0 : Number(f.freight);
    if (!(tariff >= 0 && tariff <= 100)) fail("Tariff must be between 0 and 100 percent.");
    if (!(freight >= 0)) fail("Freight per unit cannot be negative.");
    var valid = blank(f.validUntil) ? addDays(dateOf(now), 30) : f.validUntil;
    if (!validDate(valid) || valid < dateOf(now)) fail("The quote validity date cannot be in the past.");
    var q = { supplierId: f.supplierId, unitPrice: price, tariffPct: tariff, freight: freight, validUntil: valid,
      leadDays: lead, terms: (f.terms || "").trim(), at: now };
    var i = x.quotes.findIndex(function (z) { return z.supplierId === f.supplierId; });
    if (i >= 0) x.quotes[i] = q; else x.quotes.push(q);
    log(s, now, role, x.id, (i >= 0 ? "Quote revised: " : "Quote received: ") + supplier(f.supplierId).name,
      fmt(price) + " each" + (tariff || freight ? ", landed " + fmt(quoteLanded(q)) + " (tariff " + tariff + "%, freight " + fmt(freight) + ")" : "") +
      ", " + lead + " days lead time, valid until " + valid);
    return x;
  }

  // A supplier agrees to hold a lapsed quote for longer. Allowed until a PO exists.
  function extendQuote(s, role, now, rfxId, supplierId, newDate, note) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId), r = getReq(s, x.requestId);
    if (r.status === "Ordered") fail("A PO already exists, so the quote can no longer be changed.");
    var q = x.quotes.find(function (z) { return z.supplierId === supplierId; });
    if (!q) fail("That supplier has not quoted.");
    if (!validDate(newDate) || newDate < dateOf(now)) fail("The new validity date cannot be in the past.");
    if (newDate <= q.validUntil) fail("The new date must be later than the current one (" + q.validUntil + ").");
    if (!note || note.trim().length < 5) fail("Note how the supplier confirmed (email, call, portal).");
    var old = q.validUntil;
    q.validUntil = newDate;
    log(s, now, role, x.id, "Quote revalidated: " + supplier(supplierId).name + ", " + old + " to " + newDate, note.trim());
    return x;
  }

  function closeBidding(s, role, now, rfxId) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    if (x.status !== "Open") fail("Bidding is already closed.");
    if (x.quotes.length < 1) fail("No quotes have been received yet.");
    // Next the user side checks each offer against the spec. Engineered items go to Engineering,
    // items flagged for inspection to Quality, everything else to the Requester who raised the need.
    var it = item(getReq(s, x.requestId).itemId);
    x.techRole = techReviewer(it);
    x.status = "Technical review";
    // The adjustment values and the day offers are measured from are fixed from here on.
    x.adj = adjOf(x); x.evalDate = dateOf(now);
    x.slips = {};
    x.quotes.forEach(function (q) { var rec = deliveryRecord(s, q.supplierId); x.slips[q.supplierId] = rec.enough ? rec.typicalSlip : 0; });
    log(s, now, role, x.id, "Bidding closed", x.quotes.length + " of " + x.invited.length + " invited suppliers quoted. Sent to " +
      roleLabel(x.techRole) + " for technical evaluation");
    return x;
  }

  var techReviewer = function (it) { return it.needsEngineering ? "engineering" : it.needsQuality ? "quality" : "requester"; };

  // The technical reviewer marks one quote as acceptable or not against the spec, with a note (the technical recommendation).
  function techEvaluate(s, role, now, rfxId, supplierId, result, note) {
    var x = getRfx(s, rfxId);
    if (x.status !== "Technical review") fail("This RFx is not waiting for a technical evaluation.");
    need(role, [x.techRole]);
    var q = x.quotes.find(function (z) { return z.supplierId === supplierId; }) || fail("That supplier has not quoted.");
    if (result !== "Acceptable" && result !== "Not acceptable") fail("Choose Acceptable or Not acceptable.");
    var n = (note || "").trim();
    if (result === "Not acceptable" && n.length < 5) fail("Say why the offer does not meet the spec.");
    q.tech = { result: result, note: n, by: role, at: now };
    log(s, now, role, x.id, "Technical evaluation: " + supplier(supplierId).name + " " + result.toLowerCase(), n);
    return x;
  }

  // Sends the technical recommendation back to the Buyer. Every quote must be evaluated first.
  function techSubmit(s, role, now, rfxId) {
    var x = getRfx(s, rfxId);
    if (x.status !== "Technical review") fail("This RFx is not waiting for a technical evaluation.");
    need(role, [x.techRole]);
    var open = x.quotes.filter(function (q) { return !q.tech; });
    if (open.length) fail("Evaluate every quote first. Still open: " + open.map(function (q) { return supplier(q.supplierId).name; }).join(", ") + ".");
    var ok = x.quotes.filter(function (q) { return q.tech.result === "Acceptable"; }).length;
    x.status = "Evaluating"; x.techDone = { by: role, at: now };
    log(s, now, role, x.id, "Technical recommendation sent to the Buyer",
      ok + " of " + x.quotes.length + " offers technically acceptable" + (ok ? "" : ". Nothing can be awarded; the Buyer needs new quotes"));
    return x;
  }
  // Older saved RFx never had a technical review. Their quotes count as acceptable.
  var techOk = function (x, q) { return !x.techRole || !!(q.tech && q.tech.result === "Acceptable"); };

  // Offers are ranked on the adjusted price: landed cost (price plus tariff plus freight) plus bonus and malus for
  // payment terms, a conditional supplier, schedule risk and the supplier rating. Lowest first.
  // Pass the state and the current time to also check supplier documents and quote expiry.
  function scoreRFx(x, s, now) {
    var q = x.quotes;
    if (!q.length) return [];
    var today = now ? dateOf(now) : null;
    var cat = s ? item(getReq(s, x.requestId).itemId).category : null;
    return q.map(function (z) {
      var sp = supplier(z.supplierId), landed = quoteLanded(z), a = adjustQuote(s, x, z, landed, now);
      var docs = s && today ? blockingDocs(docIssues(s, z.supplierId, today, cat)) : [];
      return {
        supplierId: z.supplierId, unitPrice: z.unitPrice, tariffPct: z.tariffPct || 0, freight: z.freight || 0, landed: landed,
        validUntil: z.validUntil || null, expired: !!(today && z.validUntil && z.validUntil < today),
        leadDays: z.leadDays, terms: z.terms, supplierStatus: sp.status, docIssues: docs,
        tech: z.tech ? z.tech.result : (x.techRole ? "Pending" : "Not reviewed"), techNote: z.tech ? z.tech.note : "", techOk: techOk(x, z),
        adjustments: a.lines, adjusted: a.adjusted, ready: a.ready, slack: a.slack, slip: a.slip, termsDays: a.termsDays,
        eligible: sp.status !== "Not qualified" && docs.length === 0 && techOk(x, z)
      };
    }).sort(function (a, b) { return a.adjusted - b.adjusted || a.landed - b.landed; });
  }

  // The Buyer recommends a supplier. The award only stands once the approval chain signs it off.
  // Director always (every RFx is at least the RFx threshold). Executive from the executive threshold,
  // or at any value for a single bid, a conditional supplier, or a pick that is not the top eligible quote.
  function recommendAward(s, role, now, rfxId, supplierId, justification) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    if (x.status === "Technical review") fail("The technical evaluation is not done yet. It is with the " + roleLabel(x.techRole) + ".");
    if (x.status === "Round 2") fail("Round 2 is still open. Close it before recommending an award.");
    if (x.status !== "Evaluating") fail("Close bidding before awarding.");
    var ranked = scoreRFx(x, s, now);
    var pick = ranked.find(function (q) { return q.supplierId === supplierId; });
    if (!pick) fail("That supplier has not quoted.");
    var sp = supplier(supplierId);
    if (sp.status === "Not qualified") fail(sp.name + " is not qualified, so it cannot receive an award. Choose another supplier.");
    if (!pick.techOk) fail("The offer from " + sp.name + " is not technically acceptable" + (pick.techNote ? ": " + pick.techNote : "") + ".");
    if (pick.docIssues.length) {
      fail(sp.name + " cannot receive an award: " + pick.docIssues.map(docText).join(", ") + ". Quality must record the renewal first.");
    }
    if (pick.expired) fail("The quote from " + sp.name + " expired on " + pick.validUntil + ". Ask the supplier to revalidate it first.");
    var eligible = ranked.filter(function (q) { return q.eligible; });
    var reasons = [];
    if (sp.status === "Conditional") reasons.push("conditional supplier");
    if (ranked.length < 2) reasons.push("only one bid");
    if (eligible[0].supplierId !== supplierId) reasons.push("not the lowest adjusted price");
    var j = (justification || "").trim();
    if (reasons.length && j.length < 10) fail("A written justification is required (" + reasons.join(", ") + ").");
    var r = getReq(s, x.requestId), value = cents(r.qty * pick.landed) / 100;
    var chain = ["director"];
    if (value >= TH.executive || reasons.length) chain.push("executive");
    x.recommendation = { supplierId: supplierId, justification: j, reasons: reasons, value: value, by: role, at: now };
    x.awardApprovals = chain.map(function (rl) { return { role: rl, status: "Pending", at: null, comment: "" }; });
    x.status = "Award pending approval";
    log(s, now, role, x.id, "Award recommended: " + sp.name + " for " + fmt(value),
      (j || "Lowest adjusted price among eligible offers") + ". Approval chain: " + chain.map(roleLabel).join(" then ") +
      (reasons.length ? ". Escalated for: " + reasons.join(", ") : ""));
    return x;
  }

  function decideAward(s, role, now, rfxId, decision, comment) {
    var x = getRfx(s, rfxId);
    if (x.status !== "Award pending approval") fail("This RFx has no award waiting for approval.");
    var step = x.awardApprovals.find(function (a) { return a.status === "Pending"; });
    if (step.role !== role) fail("The next award approval belongs to the " + roleLabel(step.role) + ", not the " + roleLabel(role) + ".");
    if (decision !== "Approved" && decision !== "Rejected") fail("Decision must be Approved or Rejected.");
    var c = (comment || "").trim();
    if (decision === "Rejected" && c.length < 5) fail("Add a reason when rejecting the award.");
    step.status = decision; step.at = now; step.comment = c;
    var rec = x.recommendation, sp = supplier(rec.supplierId);
    if (decision === "Rejected") {
      // Back to the Buyer to pick again. The rejected recommendation stays on record.
      x.pastRecommendations = (x.pastRecommendations || []).concat([{ rec: rec, approvals: x.awardApprovals }]);
      x.recommendation = null; x.awardApprovals = null; x.status = "Evaluating";
      log(s, now, role, x.id, "Award to " + sp.name + " rejected at " + roleLabel(role) + " step", c);
    } else if (!x.awardApprovals.some(function (a) { return a.status === "Pending"; })) {
      x.award = { supplierId: rec.supplierId, justification: rec.justification, by: rec.by, at: now, approvals: x.awardApprovals };
      x.status = "Awarded";
      getReq(s, x.requestId).status = "Awarded";
      log(s, now, role, x.id, "Award approved. Awarded to " + sp.name, c || "Final approval");
    } else {
      log(s, now, role, x.id, "Award approved at " + roleLabel(role) + " step", c);
    }
    return x;
  }

  // ---------- 2c. contracts ----------
  // A rate contract fixes a supplier and a price per item for a period, up to a value cap. Each PO issued from it is a
  // release and uses up part of the cap. The Buyer creates it; the Director approves it, and the Executive too from
  // the executive threshold, the same ladder as an award.
  var ctOf = function (s) { if (!s.contracts) s.contracts = []; if (!s.seq.CT) s.seq.CT = 8000; return s.contracts; };
  var getCT = function (s, id) { return byId(ctOf(s), id, "Contract"); };
  var CT_WARN_DAYS = 60;

  function contractChain(cap) { return cap >= TH.executive ? ["director", "executive"] : ["director"]; }

  // Value released (POs), received or accepted, and invoiced against a contract.
  function contractUse(s, c) {
    var pos = s.pos.filter(function (po) { return po.contractId === c.id && !po.cancelled; });
    var released = 0, received = 0, invoiced = 0;
    pos.forEach(function (po) {
      released += po.qty * po.unitPrice;
      received += grnTotals(s, po.id).accepted * po.unitPrice;
      invoiced += sum(s.invoices.filter(function (i) { return i.poId === po.id && (i.status === "Matched" || i.status === "Paid"); }),
        function (i) { return i.qty * i.unitPrice; });
    });
    var r2 = function (n) { return Math.round(n * 100) / 100; };
    released = r2(released);
    return { pos: pos, released: released, received: r2(received), invoiced: r2(invoiced), remaining: r2(c.cap - released),
      pct: c.cap ? Math.round(100 * released / c.cap) : 0 };
  }

  // Where a contract stands on a date. status: Pending approval, Rejected, Not started, Active, Used up or Expired.
  function contractStatus(s, c, today) {
    var u = contractUse(s, c), st;
    if (c.status === "Pending approval" || c.status === "Rejected") st = c.status;
    else if (u.remaining <= 0.005) st = "Used up";
    else if (today > c.end) st = "Expired";
    else if (today < c.start) st = "Not started";
    else st = "Active";
    var daysLeft = daysBetween(today, c.end);
    return Object.assign(u, { status: st, daysLeft: daysLeft,
      warn: st === "Active" && u.pct >= (REF.serviceWarnPct || 80), endsSoon: st === "Active" && daysLeft <= CT_WARN_DAYS });
  }

  // The active contract that covers an item on a date, with its line, or null.
  function contractFor(s, itemId, today) {
    var hit = null;
    ctOf(s).some(function (c) {
      var line = c.lines.find(function (l) { return l.itemId === itemId; });
      if (line && contractStatus(s, c, today).status === "Active") { hit = { contract: c, line: line }; return true; }
      return false;
    });
    return hit;
  }
  // The price a PO is compared with: the active contract rate if there is one, else the standard price.
  function refPriceAt(s, itemId, today) { var h = contractFor(s, itemId, today); return h ? h.line.price : item(itemId).stdPrice; }

  function createContract(s, role, now, f) {
    need(role, ["buyer"]);
    var today = dateOf(now), sp = supplier(f.supplierId || fail("Choose a supplier."));
    var title = (f.title || "").trim();
    if (title.length < 5) fail("Give the contract a short title, such as the scope it covers.");
    if (sp.status !== "Qualified") fail("Contracts need a qualified supplier. " + sp.name + " is " + sp.status.toLowerCase() + ".");
    var lines = (f.lines || []).filter(function (l) { return l && l.itemId; }).map(function (l) { return { itemId: l.itemId, price: Number(l.price) }; });
    if (!lines.length) fail("Add at least one item with its agreed price.");
    var seen = {};
    lines.forEach(function (l) {
      var it = item(l.itemId);
      if (seen[it.id]) fail(it.id + " is on the contract twice.");
      seen[it.id] = true;
      if (sp.categories.indexOf(it.category) < 0) fail(sp.name + " does not supply " + it.category + ".");
      if (!(l.price > 0) || Math.round(l.price * 100) / 100 !== l.price) fail("Enter the agreed price for " + it.id + ", to the cent.");
    });
    if (!validDate(f.start) || !validDate(f.end)) fail("Enter the start and end dates.");
    if (f.end <= f.start) fail("The end date must be after the start date.");
    if (f.end < today) fail("The end date has already passed.");
    var cap = Number(f.cap);
    if (!(cap > 0)) fail("Enter the value cap, the most that can be released on this contract.");
    // One contract per item at a time, unless the other one is used up.
    ctOf(s).forEach(function (c) {
      if (c.status === "Rejected" || c.start > f.end || c.end < f.start) return;
      var both = c.lines.filter(function (l) { return seen[l.itemId]; });
      if (both.length && contractUse(s, c).remaining > 0.005) {
        fail(both[0].itemId + " is already on " + c.id + " from " + c.start + " to " + c.end + ". Start the new contract after " + c.end + ".");
      }
    });
    var cats = Array.from(new Set(lines.map(function (l) { return item(l.itemId).category; })));
    cats.forEach(function (cat) {
      var block = blockingDocs(docIssues(s, sp.id, today, cat));
      if (block.length) fail(sp.name + " cannot get a contract: " + block.map(docText).join(", ") + ". Quality must record the renewal first.");
    });
    var c = { id: nextId(s, "CT", "CT"), supplierId: sp.id, title: title, lines: lines, start: f.start, end: f.end, cap: cap,
      basis: (f.basis || "").trim(), status: "Pending approval", by: role, createdAt: now,
      approvals: contractChain(cap).map(function (r) { return { role: r, status: "Pending", at: null, note: "" }; }) };
    ctOf(s).push(c);
    log(s, now, role, c.id, "Contract drafted with " + sp.name + ": " + title,
      fmt(cap) + " cap, " + c.start + " to " + c.end + ", " + lines.map(function (l) { return l.itemId + " at " + fmt(l.price); }).join(", ") +
      ". Approval: " + c.approvals.map(function (a) { return roleLabel(a.role); }).join(" then ") + ".");
    return c;
  }

  function decideContract(s, role, now, id, decision, note) {
    need(role, ["director", "executive"]);
    var c = getCT(s, id);
    if (c.status !== "Pending approval") fail("This contract is already " + c.status.toLowerCase() + ".");
    var step = c.approvals.find(function (a) { return a.status === "Pending"; });
    if (step.role !== role) {
      fail(c.approvals.some(function (a) { return a.role === role; })
        ? "The next approval belongs to the " + roleLabel(step.role) + ", not the " + roleLabel(role) + "."
        : "This contract is under " + fmt(TH.executive) + ", so the Executive does not approve it.");
    }
    var n = (note || "").trim();
    if (decision === "Rejected") {
      if (n.length < 5) fail("Give a reason, so the Buyer knows what to change.");
      step.status = "Rejected"; step.at = now; step.note = n; c.status = "Rejected";
      log(s, now, role, c.id, "Contract rejected", n);
      return c;
    }
    if (decision !== "Approved") fail("Choose Approve or Reject.");
    step.status = "Approved"; step.at = now; step.note = n;
    var next = c.approvals.find(function (a) { return a.status === "Pending"; });
    if (!next) c.status = "Approved";
    log(s, now, role, c.id, "Contract approved at " + roleLabel(role) + " step", (n ? n + ". " : "") +
      (next ? "Now waits for the " + roleLabel(next.role) + "." : "Releases can be issued from " + c.start + "."));
    return c;
  }

  // Saved data from before contracts had their own records kept the contract terms on the items. Turn those terms
  // into approved contracts, link the POs already issued from them, and leave newer data alone.
  var LEGACY_CONTRACTS = [
    { supplierId: "meridian", title: "MRO spares rate contract", cap: 40000, lines: [["MR-402", 9.10], ["MR-403", 5.90], ["MR-404", 92.00]] },
    { supplierId: "keystone", title: "Maintenance technician labor", cap: 60000, lines: [["SV-501", 66.00]] }
  ];
  function migrateContracts(s, now) {
    if (s.contracts) return false;
    ctOf(s);
    var today = dateOf(now);
    LEGACY_CONTRACTS.forEach(function (d) {
      var c = { id: nextId(s, "CT", "CT"), supplierId: d.supplierId, title: d.title, start: addDays(today, -180), end: addDays(today, 185), cap: d.cap,
        lines: d.lines.map(function (l) { return { itemId: l[0], price: l[1] }; }), basis: "Carried over from earlier saved data",
        status: "Approved", by: "buyer", createdAt: now, approvals: [{ role: "director", status: "Approved", at: now, note: "Carried over" }] };
      s.contracts.push(c);
      s.pos.forEach(function (po) {
        if (po.source === "Contract" && po.supplierId === c.supplierId && c.lines.some(function (l) { return l.itemId === po.itemId; })) po.contractId = c.id;
      });
    });
    return true;
  }

  // ---------- 2d. projects ----------
  // A project groups the requests (and through them the RFx, POs, receipts, service entries and invoices) that must come
  // together by one date, such as a pump overhaul or a shutdown. Optional: everyday buying needs no project.
  // Criticality is required, because an engineer can always say how much a slip matters. Cost per day is optional,
  // because it usually comes from production planning or finance; with none, the app shows days, never a made up figure.
  var prjOf = function (s) { if (!s.projects) s.projects = []; if (!s.seq.PRJ) s.seq.PRJ = 9000; return s.projects; };
  var getPRJ = function (s, id) { return byId(prjOf(s), id, "Project"); };
  var CRITICALITY = ["High", "Medium", "Low"];
  // The Requester (the planner or engineer) creates projects and groups work into them. The Buyer can also add an order it
  // places. Everyone else follows the project.
  var PRJ_ROLES = ["requester"];

  function createProject(s, role, now, f) {
    need(role, PRJ_ROLES);
    var name = (f.name || "").trim();
    if (name.length < 5) fail("Give the project a name people will recognise, such as the equipment and the work.");
    if (!validDate(f.target)) fail("Enter the target date, when everything must be in place.");
    if (CRITICALITY.indexOf(f.criticality) < 0) fail("Choose how critical a slip is: High, Medium or Low.");
    var cost = f.costPerDay === undefined || f.costPerDay === null || f.costPerDay === "" ? null : Number(f.costPerDay);
    if (cost !== null && !(cost >= 0)) fail("Cost per day must be a number, or left empty if nobody knows it yet.");
    var p = { id: nextId(s, "PRJ", "PRJ"), name: name, target: f.target, criticality: f.criticality, costPerDay: cost,
      owner: (f.owner || "").trim() || roleLabel(role), site: f.site || "", note: (f.note || "").trim(),
      status: "Open", by: role, createdAt: now };
    prjOf(s).push(p);
    log(s, now, role, p.id, "Project created: " + name, "Target " + p.target + ", criticality " + p.criticality +
      (cost !== null ? ", downtime " + fmt(cost) + " a day" : ", no cost per day given"));
    return p;
  }

  // The request a record belongs to: a request or PR itself, or the request behind an RFx, PO, receipt, service entry or invoice.
  function requestOf(s, recordId) {
    var f = docFlow(s, recordId);
    if (!f) fail(recordId + " was not found.");
    return f.request;
  }

  // Link a record's request to a project, or unlink it with projectId null. Everything after the request follows it.
  function linkToProject(s, role, now, recordId, projectId) {
    need(role, PRJ_ROLES.concat(["buyer"]));
    var r = requestOf(s, recordId);
    if (projectId) {
      var p = getPRJ(s, projectId);
      if (p.status !== "Open") fail(p.id + " is closed.");
      if (r.status === "Cancelled") fail(r.id + " is cancelled, so it cannot join a project.");
      if (r.projectId === p.id) fail(r.id + " is already in " + p.id + ".");
      var from = r.projectId;
      r.projectId = p.id;
      log(s, now, role, p.id, r.id + " added to the project" + (from ? ", moved from " + from : ""), item(r.itemId).name);
      return p;
    }
    if (!r.projectId) fail(r.id + " is not in a project.");
    var old = r.projectId;
    r.projectId = null;
    log(s, now, role, old, r.id + " removed from the project", item(r.itemId).name);
    return getPRJ(s, old);
  }

  // Where one request of a project stands: the step it waits at, who holds it, since when, the date it should be ready,
  // and how that date compares with the project target.
  // ---------- item knowledge: lessons learned ----------
  // What went wrong with an item before, so the next request, RFx and receipt get it right. Engineering, Quality and the
  // Requester log lessons; failed technical reviews and rejected or held receipts feed in on their own.
  var LESSON_ROLES = ["engineering", "quality", "requester"];
  var LESSON_KINDS = ["Technical review", "Receipt or quality check", "Failure in use", "Supplier", "Other"];
  var lesOf = function (s) { if (!s.lessons) s.lessons = []; if (!s.seq.LES) s.seq.LES = 1100; return s.lessons; };

  function addLesson(s, role, now, f) {
    need(role, LESSON_ROLES);
    var it = item(f.itemId || fail("Choose the item the lesson is about."));
    if (LESSON_KINDS.indexOf(f.kind) < 0) fail("Choose what kind of lesson it is.");
    var what = (f.what || "").trim(), why = (f.why || "").trim(), next = (f.next || "").trim(), source = (f.source || "").trim();
    if (what.length < 10) fail("Say what happened, in a sentence.");
    if (why.length < 5) fail("Say why it happened, if it is known. Write \"Not known yet\" if it is not.");
    if (next.length < 10) fail("Say what to do next time. That is the part the next person needs.");
    if (source.length > 40) fail("Keep the source short, such as a record number.");
    var l = { id: nextId(s, "LES", "LES"), itemId: it.id, kind: f.kind, what: what, why: why, next: next, source: source, by: role, at: now };
    lesOf(s).push(l);
    log(s, now, role, it.id, "Lesson logged on " + it.id + ": " + f.kind, next);
    return l;
  }

  // Everything known about an item: logged lessons, failed technical reviews, rejected or held receipts, what was bought.
  function itemKnowledge(s, itemId) {
    var it = item(itemId);
    var reqs = s.requests.filter(function (r) { return r.itemId === itemId; });
    var reviews = [];
    reqs.forEach(function (r) {
      if (!r.rfxId) return;
      var x = getRfx(s, r.rfxId);
      x.quotes.forEach(function (q) {
        if (q.tech && q.tech.result === "Not acceptable") reviews.push({ rfxId: x.id, supplierId: q.supplierId, note: q.tech.note, by: q.tech.by, at: q.tech.at });
      });
    });
    var pos = s.pos.filter(function (po) { return po.itemId === itemId && !po.cancelled; });
    var receipts = [];
    pos.forEach(function (po) {
      s.grns.forEach(function (g) {
        if (g.poId === po.id && g.result !== "Accepted") receipts.push({ grnId: g.id, poId: po.id, supplierId: po.supplierId, result: g.result, note: g.note, at: g.at });
      });
    });
    var byDate = function (a, b) { return a.at < b.at ? 1 : -1; };
    return { item: it, lessons: lesOf(s).filter(function (l) { return l.itemId === itemId; }).sort(byDate),
      reviews: reviews.sort(byDate), receipts: receipts.sort(byDate), pos: pos.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }),
      requests: reqs.length };
  }

  // Items in the master that may be the same part under another number: same category and at least two shared words,
  // or a link written into the item guide.
  var STOP = { with: 1, and: 1, the: 1, for: 1, per: 1 };
  function similarItems(itemId, sameAs) {
    var it = item(itemId), words = function (n) { return n.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && !STOP[w]; }); };
    var mine = words(it.name);
    return REF.items.filter(function (o) {
      if (o.id === it.id || o.category !== it.category) return false;
      if ((sameAs || []).indexOf(o.id) >= 0) return true;
      return words(o.name).filter(function (w) { return mine.indexOf(w) >= 0; }).length >= 2;
    });
  }

  // ---------- item guides: revised in the app ----------
  // The written guide (what it is, where it is used, the specs that matter and why, what to ask the supplier) starts
  // from item-guides.js. Engineering and Quality revise it, each change with a reason, and every version is kept.
  // The drawing and look alike links stay with the written guide. The base guide is passed in, so this stays pure.
  var GUIDE_ROLES = ["engineering", "quality"];
  var gdeOf = function (s) { if (!s.guideEdits) s.guideEdits = []; return s.guideEdits; };
  function guideRevisions(s, itemId) {
    return gdeOf(s).filter(function (r) { return r.itemId === itemId; }).sort(function (a, b) { return b.rev - a.rev; });
  }
  function itemGuide(s, itemId, base) {
    var r = guideRevisions(s, itemId)[0];
    if (!r) return base ? Object.assign({}, base, { revision: null }) : null;
    return Object.assign({}, base || {}, { what: r.what, where: r.where, specs: r.specs, ask: r.ask, revision: r });
  }
  function editGuide(s, role, now, f, base) {
    need(role, GUIDE_ROLES);
    var it = item(f.itemId || fail("Choose the item the guide is about."));
    var what = (f.what || "").trim(), where = (f.where || "").trim(), reason = (f.reason || "").trim();
    if (what.length < 20) fail("Say what the item is, in a sentence or two.");
    if (where.length < 5) fail("Say where the item is used.");
    var specs = [];
    (f.specs || []).forEach(function (x) {
      var a = String(x[0] || "").trim(), b = String(x[1] || "").trim();
      if (!a && !b) return;
      if (!a || !b) fail("Each spec needs its name and why it matters.");
      specs.push([a, b]);
    });
    if (!specs.length) fail("List at least one spec that matters.");
    if (specs.length > 12) fail("Keep it to the 12 specs that matter most.");
    var ask = (Array.isArray(f.ask) ? f.ask : String(f.ask || "").split("\n")).map(function (q) { return String(q).trim(); }).filter(Boolean);
    if (!ask.length) fail("List at least one question to ask the supplier.");
    if (ask.length > 10) fail("Keep it to the 10 questions that matter most.");
    var cur = itemGuide(s, it.id, base);
    if (cur && cur.what === what && cur.where === where && JSON.stringify(cur.specs) === JSON.stringify(specs) && JSON.stringify(cur.ask) === JSON.stringify(ask)) {
      fail("Nothing changed. Edit a section before saving.");
    }
    if (reason.length < 10) fail("Say what you changed and why, so the next reader can trust it.");
    var revs = guideRevisions(s, it.id);
    var r = { itemId: it.id, rev: (revs.length ? revs[0].rev : (base ? 1 : 0)) + 1, what: what, where: where, specs: specs, ask: ask, reason: reason, by: role, at: now };
    gdeOf(s).push(r);
    log(s, now, role, it.id, (cur ? "Guide revised on " : "Guide written for ") + it.id + " (version " + r.rev + ")", reason);
    return r;
  }
  // Lessons logged after the guide last changed: the guide may need them.
  function lessonsSinceGuide(s, itemId) {
    var r = guideRevisions(s, itemId)[0];
    return lesOf(s).filter(function (l) { return l.itemId === itemId && (!r || l.at > r.at); });
  }

  // ---------- supplier delivery record ----------
  // How a supplier's deliveries compared with what it promised. Counts receipts in this workspace and delivery history
  // brought in from before it (state.deliveries: { supplierId, ref, promised, received }). Services have no delivery.
  var REC_MIN = 3, REC_LAST = 8;
  function deliveryRecord(s, supId) {
    var list = (s.deliveries || []).filter(function (d) { return d.supplierId === supId; })
      .map(function (d) { return { ref: d.ref, promised: d.promised, received: d.received }; });
    s.pos.forEach(function (po) {
      if (po.supplierId !== supId || po.cancelled || isService(po) || !po.confirmed) return;
      var g = s.grns.filter(function (x) { return x.poId === po.id; })[0];
      if (g) list.push({ ref: po.id, promised: po.promisedDate, received: g.date });
    });
    list.sort(function (a, b) { return a.received < b.received ? -1 : 1; });
    list = list.slice(-REC_LAST);
    var slips = list.map(function (d) { return daysBetween(d.promised, d.received); });
    var sorted = slips.slice().sort(function (a, b) { return a - b; });
    var median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
    return { n: list.length, deliveries: list, slips: slips, enough: list.length >= REC_MIN,
      onTimePct: list.length ? Math.round(100 * slips.filter(function (x) { return x <= 0; }).length / list.length) : null,
      typicalSlip: list.length >= REC_MIN ? Math.max(0, median) : 0 };
  }
  // The date to plan on for an open goods PO: the promise, moved by the supplier's usual slip when its record is long enough.
  function plannedDate(s, po) {
    var rec = deliveryRecord(s, po.supplierId);
    return { promised: po.promisedDate, planned: rec.typicalSlip ? addDays(po.promisedDate, rec.typicalSlip) : po.promisedDate, record: rec };
  }

  var STAGES = ["Request", "Approval", "Sourcing", "Order", "Delivery", "Ready"];
  function projectRow(s, p, r, today) {
    var it = item(r.itemId), x = r.rfxId ? getRfx(s, r.rfxId) : null, po = r.poId ? getPO(s, r.poId) : null;
    var row = { request: r, item: it, po: po, rfx: x, service: !!it.service, stage: 0, holder: "", expected: null, ready: false, note: "" };
    var pending = function (list) { return (list || []).find(function (a) { return a.status === "Pending"; }); };
    if (r.status === "Rejected") { row.stage = 1; row.holder = "Requester"; row.note = "Rejected. Raise a new request."; row.blocked = true; }
    else if (r.status === "Pending approval") { row.stage = 1; row.holder = roleLabel(pending(r.approvals).role); }
    else if (r.status === "Approved") { row.stage = 2; row.holder = "Buyer"; }
    else if (r.status === "Sourcing" && x) {
      row.stage = 2;
      row.holder = x.status === "Open" ? "Suppliers quoting" : x.status === "Technical review" ? roleLabel(x.techRole) + ", technical review"
        : x.status === "Award pending approval" ? roleLabel((pending(x.awardApprovals) || { role: "director" }).role) + ", award approval" : "Buyer";
    } else if (r.status === "Awarded") { row.stage = 3; row.holder = "Buyer"; }
    else if (po) {
      var t = grnTotals(s, po.id);
      if (row.service) {
        row.expected = po.promisedDate;
        if (!po.confirmed) { row.stage = 3; row.holder = "Supplier, to confirm"; }
        else {
          row.stage = 4; row.holder = "Booked with the supplier";
          var nx = sesOf(s).filter(function (e) { return e.poId === po.id; }).map(nextReleaser).filter(Boolean)[0];
          if (nx) row.holder = roleLabel(nx) + ", service release";
          if (po.promisedDate <= p.target) { row.ready = true; row.note = "Booked for " + po.promisedDate; }
        }
      } else if (t.accepted >= po.qty) { row.stage = 5; row.ready = true; row.holder = "In stores"; row.expected = null; }
      else {
        row.expected = po.promisedDate;
        if (t.hold > 0) { row.stage = 4; row.holder = "Quality, receipt on hold"; row.blocked = true; }
        else if (!po.confirmed) { row.stage = 3; row.holder = "Supplier, to confirm"; }
        else { row.stage = 4; row.holder = "Supplier" + (t.accepted ? ", " + t.accepted + " of " + po.qty + " in" : ""); }
        // Plan on the supplier's record, not only its promise.
        var pd = plannedDate(s, po);
        if (pd.planned !== pd.promised) {
          row.expected = pd.planned; row.promised = pd.promised; row.slip = pd.record.typicalSlip; row.recN = pd.record.n;
          row.note = "Promised " + pd.promised + ". " + supplier(po.supplierId).name + " usually delivers " + pd.record.typicalSlip + " day" +
            (pd.record.typicalSlip === 1 ? "" : "s") + " late (last " + pd.record.n + " deliveries), so plan on " + pd.planned + ".";
        }
      }
    }
    if (row.ready) { row.state = "Ready"; row.stage = 5; }
    else {
      var exp = row.expected || r.needBy;
      row.expectedShown = exp;
      var slack = daysBetween(exp, p.target);
      row.slack = slack;
      row.state = row.blocked ? "Blocked" : slack < 0 ? "Late" : slack < 5 ? "At risk" : "On track";
      if (!row.expected && !row.note) row.note = "Not ordered yet. Date shown is the need by date.";
    }
    // Days since anything last moved on this request, its RFx, PO, receipts or service entries.
    var ids = [r.id, r.rfxId, r.poId].filter(Boolean);
    if (po) s.grns.concat(sesOf(s)).forEach(function (g) { if (g.poId === po.id) ids.push(g.id); });
    var last = s.audit.filter(function (a) { return ids.indexOf(a.entity) >= 0; }).map(function (a) { return a.at; }).sort().pop() || r.createdAt;
    row.since = daysBetween(last, today);
    return row;
  }

  var STATE_RANK = { Late: 0, Blocked: 1, "At risk": 2, "On track": 3, Ready: 4 };
  function projectStatus(s, p, today) {
    var rows = s.requests.filter(function (r) { return r.projectId === p.id && r.status !== "Cancelled"; })
      .map(function (r) { return projectRow(s, p, r, today); })
      .sort(function (a, b) { return STATE_RANK[a.state] - STATE_RANK[b.state] || (b.expectedShown || "").localeCompare(a.expectedShown || ""); });
    var open = rows.filter(function (r) { return !r.ready; });
    var dates = open.map(function (r) { return r.expectedShown; }).filter(Boolean).sort();
    var readyBy = open.length ? dates[dates.length - 1] : (rows.length ? today : null);
    var gating = open.length ? open.slice().sort(function (a, b) { return (b.expectedShown || "").localeCompare(a.expectedShown || ""); })[0] : null;
    var daysLate = readyBy ? Math.max(0, daysBetween(p.target, readyBy)) : 0;
    var counts = { Ready: 0, "On track": 0, "At risk": 0, Late: 0, Blocked: 0 };
    rows.forEach(function (r) { counts[r.state] += 1; });
    // Services booked before the rest can be ready stand idle on the day unless they are moved.
    var idle = [];
    if (readyBy && daysLate > 0) rows.forEach(function (r) {
      if (r.service && r.ready && r.po && r.po.promisedDate < readyBy) {
        r.idleDays = daysBetween(r.po.promisedDate, readyBy);
        r.note = "Booked for " + r.po.promisedDate + ", " + r.idleDays + " days before the rest can be ready. Move it, or it stands idle.";
        idle.push(r);
      }
    });
    var state = !rows.length ? "Empty" : rows.reduce(function (w, r) { return STATE_RANK[r.state] < STATE_RANK[w] ? r.state : w; }, "Ready");
    return { rows: rows, counts: counts, readyBy: readyBy, idle: idle, gating: gating && gating.state !== "On track" ? gating : null, daysLate: daysLate,
      delayCost: p.costPerDay !== null && p.costPerDay !== undefined ? daysLate * p.costPerDay : null, state: state,
      value: sum(rows, function (r) { return r.po ? r.po.qty * r.po.unitPrice : requestTotal(r.request); }) };
  }

  // ---------- 3. purchase order ----------
  function createPO(s, role, now, reqId, f) {
    need(role, ["buyer"]);
    f = f || {};
    var r = getReq(s, reqId), it = item(r.itemId);
    var supId, price, lead, rfxId = null, source, tariff = 0, freight = 0, contractId = null;
    if (r.status === "Awarded") {
      var x = getRfx(s, r.rfxId);
      var q = x.quotes.find(function (z) { return z.supplierId === x.award.supplierId; });
      if (q.validUntil && q.validUntil < dateOf(now)) {
        fail("The awarded quote from " + supplier(q.supplierId).name + " expired on " + q.validUntil + ". Revalidate it on the RFx screen first.");
      }
      supId = q.supplierId; price = q.unitPrice; lead = q.leadDays; rfxId = x.id; source = "RFx";
      tariff = q.tariffPct || 0; freight = q.freight || 0;
    } else if (r.status === "Approved") {
      lead = f.leadDays === undefined || f.leadDays === "" ? 7 : Number(f.leadDays);
      var ct = contractFor(s, it.id, dateOf(now));
      if (ct) {
        supId = ct.contract.supplierId; price = ct.line.price; source = "Contract"; contractId = ct.contract.id;
        var left = contractUse(s, ct.contract).remaining, value = cents(r.qty * price) / 100;
        if (value > left + 0.005) {
          fail("This release is " + fmt(value) + " but " + ct.contract.id + " has only " + fmt(left) + " left. Raise an RFx for it instead, or set up a new contract.");
        }
      } else {
        source = "Direct";
        if (requestTotal(r) >= TH.rfx) {
          fail("This request is " + fmt(requestTotal(r)) + " with no active contract. Values of " + fmt(TH.rfx) + " or more need an RFx.");
        }
        supId = f.supplierId; price = Number(f.unitPrice);
        if (!supId) fail("Choose a supplier.");
        var sp = supplier(supId);
        if (sp.categories.indexOf(it.category) < 0) fail(sp.name + " does not supply " + it.category + ".");
        if (sp.status !== "Qualified") fail("Direct buys need a qualified supplier. " + sp.name + " is " + sp.status.toLowerCase() + ".");
        if (!(price > 0)) fail("Enter the agreed unit price.");
        var blank = function (v) { return v === undefined || v === null || v === ""; };
        tariff = blank(f.tariffPct) ? 0 : Number(f.tariffPct);
        freight = blank(f.freight) ? 0 : Number(f.freight);
        if (!(tariff >= 0 && tariff <= 100)) fail("Tariff must be between 0 and 100 percent.");
        if (!(freight >= 0)) fail("Freight per unit cannot be negative.");
      }
    } else {
      fail("The PR must be approved (and awarded, if it went to RFx) before a PO can be created.");
    }
    var docBlock = blockingDocs(docIssues(s, supId, dateOf(now), it.category));
    if (docBlock.length) {
      fail(supplier(supId).name + " cannot be ordered from: " + docBlock.map(docText).join(", ") + ". Quality must record the renewal first.");
    }
    if (!Number.isInteger(lead) || lead < 0) fail("Lead time must be a whole number of days.");
    var approved = requestTotal(r), total = cents(r.qty * price) / 100;
    if (total > approved * (1 + TH.poOverrun) + 0.005) {
      fail("PO value " + fmt(total) + " is more than " + Math.round(TH.poOverrun * 100) + "% above the approved PR value " +
        fmt(approved) + ". The requester must revise the request and get it approved again.");
    }
    var refCt = contractFor(s, it.id, dateOf(now)), ref = refCt ? refCt.line.price : it.stdPrice, varPct = Math.round(100 * (price - ref) / ref);
    var vReason = (f.varianceReason || "").trim();
    if (price > ref * (1 + TH.priceVariance) + 0.0001 && vReason.length < 10) {
      fail("PO price " + fmt(price) + " is " + varPct + "% above the " + (refCt ? "contract" : "standard") + " price " + fmt(ref) +
        ". Add a reason (at least a short sentence) before issuing it.");
    }
    var po = {
      id: nextId(s, "PO", "PO"), requestId: r.id, rfxId: rfxId, supplierId: supId, itemId: it.id,
      qty: r.qty, unitPrice: price, tariffPct: tariff, freight: freight, refPrice: ref, varianceReason: vReason,
      site: r.site, needBy: r.needBy,
      promisedDate: addDays(dateOf(now), lead), confirmed: false, cancelled: false,
      source: source, contractId: contractId, createdAt: now
    };
    s.pos.push(po);
    r.status = "Ordered"; r.poId = po.id;
    log(s, now, role, po.id, "PO issued to " + supplier(supId).name + " (" + (contractId ? "release of " + contractId : source) + ")",
      r.qty + " x " + it.id + " at " + fmt(price) + " = " + fmt(total) +
      (tariff || freight ? ", landed " + fmt(poLanded(po)) + " with " + tariff + "% tariff" : "") +
      ". Promised " + po.promisedDate + (vReason ? ". Price reason: " + vReason : ""));
    return po;
  }

  function confirmPO(s, role, now, poId, date) {
    need(role, ["buyer"]);
    var po = getPO(s, poId);
    if (po.cancelled) fail("This PO is cancelled.");
    if (!validDate(date)) fail("Enter the supplier confirmed delivery date.");
    po.confirmed = true; po.promisedDate = date;
    log(s, now, role, po.id, "Supplier confirmed", "Delivery date " + date);
    return po;
  }

  function updatePromise(s, role, now, poId, date, note) {
    need(role, ["buyer"]);
    var po = getPO(s, poId);
    if (po.cancelled) fail("This PO is cancelled.");
    if (!validDate(date)) fail("Enter a valid date.");
    if (!note || note.trim().length < 5) fail("Add a note on why the date moved.");
    var old = po.promisedDate;
    po.promisedDate = date;
    log(s, now, role, po.id, "Promise date moved " + old + " to " + date, note.trim());
    return po;
  }

  function amendPOPrice(s, role, now, poId, price, reason) {
    need(role, ["buyer"]);
    var po = getPO(s, poId), r = getReq(s, po.requestId);
    price = Number(price);
    if (!(price > 0)) fail("Enter a price above zero.");
    if (!reason || reason.trim().length < 10) fail("Explain why the price is changing (at least a short sentence).");
    if (s.invoices.some(function (i) { return i.poId === po.id && i.status === "Paid"; })) {
      fail("A payment has already been made on this PO, so the price is locked.");
    }
    var total = cents(po.qty * price) / 100, approved = requestTotal(r);
    if (total > approved * (1 + TH.poOverrun) + 0.005) {
      fail("New PO value " + fmt(total) + " is more than " + Math.round(TH.poOverrun * 100) + "% above the approved PR value " + fmt(approved) + ".");
    }
    var old = po.unitPrice;
    po.unitPrice = price;
    if (po.refPrice && price > po.refPrice * (1 + TH.priceVariance) + 0.0001) po.varianceReason = reason.trim();
    log(s, now, role, po.id, "Price amended " + fmt(old) + " to " + fmt(price), reason.trim());
    return po;
  }

  // ---------- supplier documents ----------
  function renewDoc(s, role, now, supId, docType, expiry, note) {
    need(role, ["quality"]);
    var sp = supplier(supId);
    if (!REF.docTypes[docType]) fail("Choose a document type.");
    if (!validDate(expiry) || expiry <= dateOf(now)) fail("The new expiry date must be in the future.");
    if (!s.docs) s.docs = {};
    if (!s.docs[supId]) s.docs[supId] = {};   // a supplier added after the data was saved has no document record yet
    var have = s.docs[supId][docType] || null;
    if (have && expiry <= have) fail("The new expiry date must be later than the current one (" + have + ").");
    if (!note || note.trim().length < 5) fail("Note what was checked (certificate number, issuing body, reviewer).");
    s.docs[supId][docType] = expiry;
    log(s, now, role, supId, "Document renewed: " + REF.docTypes[docType] + " for " + sp.name, "Now valid until " + expiry + ". " + note.trim());
    return s.docs[supId];
  }

  // ---------- 4. goods receipt ----------
  // What has arrived against a PO. For a service PO this counts service entries instead of goods receipts:
  // accepted entries count as accepted, entries waiting for the Requester count like goods on hold
  // (they use up the PO but cannot be invoiced yet), and rejected entries count as rejected.
  function grnTotals(s, poId) {
    var t = { accepted: 0, hold: 0, rejected: 0 };
    var po = s.pos.find(function (p) { return p.id === poId; });
    if (po && isService(po)) {
      sesOf(s).forEach(function (e) {
        if (e.poId !== poId) return;
        if (e.status === "Accepted") t.accepted += e.qty;
        else if (e.status === "Submitted") t.hold += e.qty;
        else t.rejected += e.qty;
      });
      t.accepted = round2(t.accepted); t.hold = round2(t.hold); t.rejected = round2(t.rejected);
      return t;
    }
    s.grns.forEach(function (g) {
      if (g.poId !== poId) return;
      if (g.result === "Accepted") t.accepted += g.qty;
      else if (g.result === "Hold") t.hold += g.qty;
      else t.rejected += g.qty;
    });
    return t;
  }

  function postGRN(s, role, now, poId, f) {
    need(role, ["warehouse"]);
    var po = getPO(s, poId);
    if (po.cancelled) fail("This PO is cancelled.");
    if (isService(po)) fail(po.id + " is a service PO. The Requester records a service entry on Service entries.");
    var qty = Number(f.qty);
    if (!Number.isInteger(qty) || qty <= 0) fail("Received quantity must be a whole number above zero.");
    if (["Accepted", "Rejected", "Hold"].indexOf(f.result) < 0) fail("Choose Accepted, Rejected or Hold.");
    var note = (f.note || "").trim();
    if (f.result !== "Accepted" && note.length < 5) fail("Add a note for a rejected or held receipt.");
    var t = grnTotals(s, poId), remaining = po.qty - t.accepted - t.hold;
    if (f.result !== "Rejected" && qty > remaining) {
      fail("Over receipt. Only " + remaining + " units remain open on " + po.id + ".");
    }
    var g = { id: nextId(s, "GRN", "GRN"), poId: poId, date: dateOf(now), qty: qty, result: f.result, note: note, by: role, at: now };
    s.grns.push(g);
    log(s, now, role, g.id, "Goods received against " + po.id + ": " + qty + " " + f.result.toLowerCase(), note);
    return g;
  }

  function releaseHold(s, role, now, grnId, decision, note) {
    need(role, ["quality"]);
    var g = getGRN(s, grnId);
    if (g.result !== "Hold") fail("This receipt is not on hold.");
    if (decision !== "Accepted" && decision !== "Rejected") fail("Choose Accepted or Rejected.");
    if (!note || note.trim().length < 5) fail("Add the inspection result.");
    g.result = decision; g.releaseNote = note.trim();
    log(s, now, role, g.id, "Quality hold released as " + decision.toLowerCase(), note.trim());
    return g;
  }

  // ---------- 4b. service entries ----------
  // A service PO is an estimated quantity (hours, days, weeks, months) at a rate. Each period the Requester records the
  // work from the site log and the supplier's timesheet. Approvers release it by value, the service version of a goods receipt.
  var round2 = function (n) { return Math.round(n * 100) / 100; };
  var sesOf = function (s) { if (!s.ses) s.ses = []; if (!s.seq.SES) s.seq.SES = 7000; return s.ses; };
  function isService(po) { var it = REF.items.find(function (i) { return i.id === po.itemId; }); return !!(it && it.service); }
  var getSES = function (s, id) { return byId(sesOf(s), id, "Service entry"); };

  // The release chain for an entry of this value: Manager always, then Director and Executive by value.
  function serviceChain(value) {
    var t = REF.serviceRelease || { director: 5000, executive: 10000 }, c = ["manager"];
    if (value >= t.director) c.push("director");
    if (value >= t.executive) c.push("executive");
    return c;
  }
  // Entries saved before the release chain existed get their chain when first read.
  function releasesOf(e) {
    if (!e.releases) {
      e.releases = serviceChain(e.value).map(function (r) {
        return e.status === "Accepted" ? { role: r, status: "Released", at: e.decidedAt, note: "" } : { role: r, status: "Pending", at: null, note: "" };
      });
    }
    return e.releases;
  }
  // The role whose release the entry waits for, or null when it is not waiting.
  function nextReleaser(e) {
    if (e.status !== "Submitted") return null;
    var p = releasesOf(e).find(function (x) { return x.status === "Pending"; });
    return p ? p.role : null;
  }

  function postService(s, role, now, poId, f) {
    need(role, ["requester"]);
    var po = getPO(s, poId), it = item(po.itemId);
    if (!isService(po)) fail(po.id + " is for goods. The Warehouse posts a goods receipt instead.");
    if (po.cancelled) fail("This PO is cancelled.");
    var qty = Number(f.qty);
    if (!(qty > 0) || round2(qty) !== qty) fail("Quantity must be above zero, with at most two decimals.");
    if (!/^\d{4}-\d{2}$/.test(f.period || "")) fail("Choose the month the work was done.");
    var note = (f.note || "").trim();
    if (note.length < 5) fail("Describe the work, as on the supplier's report.");
    var t = grnTotals(s, poId), left = round2(po.qty - t.accepted - t.hold);
    if (qty > left + 1e-9) {
      fail("That would take " + po.id + " past its ordered quantity. Only " + left + " " + it.uom + "s (" + fmt(left * po.unitPrice) +
        ") remain. Raise a new request for more.");
    }
    var e = { id: nextId(s, "SES", "SES"), poId: poId, period: f.period, qty: qty, value: round2(qty * po.unitPrice), note: note,
      status: "Submitted", by: role, at: now, decidedAt: null, decisionNote: "", decidedBy: null };
    e.releases = serviceChain(e.value).map(function (r) { return { role: r, status: "Pending", at: null, note: "" }; });
    sesOf(s).push(e);
    log(s, now, role, e.id, "Service entry recorded on " + po.id + ": " + qty + " " + it.uom + "s for " + f.period,
      fmt(e.value) + ". " + note + (/[.!?]$/.test(note) ? "" : ".") + " Release: " + e.releases.map(function (x) { return roleLabel(x.role); }).join(" then ") + ".");
    return e;
  }

  // decision is "Accepted" (release) or "Rejected" (send back to the Requester). Releases go in order.
  function decideService(s, role, now, sesId, decision, note) {
    need(role, ["manager", "director", "executive"]);
    var e = getSES(s, sesId);
    if (e.status !== "Submitted") fail("This service entry is already " + (e.status === "Accepted" ? "released" : "sent back") + ".");
    if (decision !== "Accepted" && decision !== "Rejected") fail("Choose Release or Send back.");
    var step = releasesOf(e).find(function (x) { return x.status === "Pending"; });
    if (step.role !== role) {
      var mine = e.releases.find(function (x) { return x.role === role; });
      fail(mine ? (mine.status === "Released" ? "You have already released this entry. It waits for the " + roleLabel(step.role) + "."
                                               : "The next release belongs to the " + roleLabel(step.role) + ", not the " + roleLabel(role) + ".")
                : "This entry is " + fmt(e.value) + ", so the " + roleLabel(role) + " does not need to release it.");
    }
    var n = (note || "").trim();
    if (decision === "Rejected") {
      if (n.length < 5) fail("Say what is wrong with the entry, so the Requester can correct it with the supplier.");
      step.status = "Sent back"; step.at = now; step.note = n;
      e.status = "Rejected"; e.decidedAt = now; e.decisionNote = n; e.decidedBy = role;
      log(s, now, role, e.id, "Service entry sent back for " + e.poId, n);
      return e;
    }
    step.status = "Released"; step.at = now; step.note = n;
    var next = e.releases.find(function (x) { return x.status === "Pending"; });
    if (!next) { e.status = "Accepted"; e.decidedAt = now; e.decisionNote = n; e.decidedBy = role; }
    log(s, now, role, e.id, "Service entry released by the " + roleLabel(role) + " for " + e.poId,
      (n ? n + ". " : "") + (next ? "Now waits for the " + roleLabel(next.role) + "." : fmt(e.value) + " accepted and can be invoiced."));
    return e;
  }

  // Ordered, accepted, waiting and remaining value on a service PO. warn is true once the share used passes REF.serviceWarnPct.
  function serviceStatus(s, po) {
    var t = grnTotals(s, po.id), ordered = round2(po.qty * po.unitPrice);
    var acc = round2(t.accepted * po.unitPrice), wait = round2(t.hold * po.unitPrice), left = round2(ordered - acc - wait);
    var pct = ordered ? Math.round(100 * (acc + wait) / ordered) : 0;
    return { qty: po.qty, acceptedQty: t.accepted, waitingQty: t.hold, leftQty: round2(po.qty - t.accepted - t.hold),
      ordered: ordered, accepted: acc, waiting: wait, remaining: left, pct: pct, warn: pct >= (REF.serviceWarnPct || 80) };
  }

  // ---------- PO status ----------
  function invoicedQty(s, poId, exceptId, statuses) {
    return sum(s.invoices.filter(function (i) {
      return i.poId === poId && i.id !== exceptId && statuses.indexOf(i.status) >= 0;
    }), function (i) { return i.qty; });
  }

  function poStatus(s, po) {
    if (po.cancelled) return "Cancelled";
    var t = grnTotals(s, po.id);
    if (isService(po)) {
      if (t.accepted >= po.qty) return invoicedQty(s, po.id, null, ["Paid"]) >= po.qty ? "Closed" : "Consumed";
      if (t.accepted > 0 || t.hold > 0) return "In progress";
      return po.confirmed ? "Confirmed" : "Issued";
    }
    if (t.accepted >= po.qty) {
      return invoicedQty(s, po.id, null, ["Paid"]) >= po.qty ? "Closed" : "Received";
    }
    if (t.accepted > 0) return "Partially received";
    if (t.hold > 0) return "Quality hold";
    return po.confirmed ? "Confirmed" : "Issued";
  }

  function ctb(s, po) {
    // Services are not shipments, so delivery health does not apply.
    if (isService(po)) return { status: "Service", slack: null };
    var st = poStatus(s, po);
    if (st === "Received" || st === "Closed" || st === "Cancelled") return { status: "Delivered", slack: null };
    var slack = daysBetween(po.promisedDate, po.needBy);
    return { status: slack < 0 ? "Late" : slack < 5 ? "At Risk" : "Clear", slack: slack };
  }

  // ---------- supplier emails ----------
  // The app never sends mail. It builds a draft and hands it to the user's own mail program or webmail.
  var emailOk = function (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || ""); };
  var contactOf = function (s, supId) { return (s.contacts && s.contacts[supId]) || ""; };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var longDate = function (d) { var p = dateOf(d).split("-"); return Number(p[2]) + " " + MONTHS[Number(p[1]) - 1] + " " + p[0]; };
  var plural = function (n, one, many) { return n + " " + (n === 1 ? one : many); };

  function setContact(s, role, now, supId, email) {
    need(role, ["buyer"]);
    var sp = supplier(supId), e = (email || "").trim();
    s.contacts = s.contacts || {};
    if (!e) { delete s.contacts[supId]; log(s, now, role, supId, "Supplier email removed for " + sp.name); return ""; }
    if (!emailOk(e)) fail("That does not look like an email address.");
    s.contacts[supId] = e;
    log(s, now, role, supId, "Supplier email saved for " + sp.name);
    return e;
  }

  // Quantity still expected from the supplier. Rejected units do not count as received, quality holds do.
  function leftToReceive(s, po) {
    var t = grnTotals(s, po.id);
    return Math.max(0, po.qty - t.accepted - t.hold);
  }

  function lastChase(s, poId) {
    var hit = null;
    s.audit.forEach(function (a) { if (a.entity === poId && a.action.indexOf("Chase email drafted") === 0) hit = a; });
    return hit ? dateOf(hit.at) : null;
  }

  // Open POs that need a nudge, worst first. One reason per PO, the most serious one.
  // overdue: supplier's own promise date has passed. late: promise is after the need by date.
  // at risk: under 5 days of slack. confirm: issued more than 2 days ago and still not confirmed.
  var TIER = { overdue: 0, late: 1, risk: 2, confirm: 3 };
  function expediteList(s, now) {
    var today = dateOf(now), rows = [];
    s.pos.forEach(function (po) {
      if (isService(po)) return;
      var st = poStatus(s, po);
      if (["Issued", "Confirmed", "Partially received"].indexOf(st) < 0) return;
      var left = leftToReceive(s, po);
      if (left <= 0) return;
      var c = ctb(s, po), kind = null, reason = "", size = 0;
      var past = daysBetween(po.promisedDate, today);
      var age = daysBetween(dateOf(po.createdAt), today);
      if (past > 0) { kind = "overdue"; size = past; reason = "Promise date passed " + plural(past, "day", "days") + " ago"; }
      else if (c.slack < 0) { kind = "late"; size = -c.slack; reason = "Promised " + plural(-c.slack, "day", "days") + " after the need by date"; }
      else if (c.slack < 5) { kind = "risk"; size = 5 - c.slack; reason = "Only " + plural(c.slack, "day", "days") + " of slack"; }
      else if (st === "Issued" && age > 2) { kind = "confirm"; size = age; reason = "Not confirmed after " + plural(age, "day", "days"); }
      if (!kind) return;
      rows.push({
        po: po, kind: kind, reason: reason, size: size, left: left, slack: c.slack,
        value: cents(left * po.unitPrice) / 100, supplier: supplier(po.supplierId),
        email: contactOf(s, po.supplierId), lastChase: lastChase(s, po.id)
      });
    });
    return rows.sort(function (a, b) {
      return (TIER[a.kind] - TIER[b.kind]) || (b.size - a.size) || (b.value - a.value);
    });
  }

  // Plain, polite chase message built from the PO record. The buyer can edit it before it goes anywhere.
  function chaseDraft(s, poId, kind, fromName) {
    var po = getPO(s, poId), it = item(po.itemId), sp = supplier(po.supplierId), left = leftToReceive(s, po);
    var what = plural(left, it.uom, it.uom === "ea" ? "units" : it.uom + "s") + " of " + it.name;
    var facts = "Order: " + po.id + ", " + what + "\nPromised: " + longDate(po.promisedDate) + "\nNeeded by: " + longDate(po.needBy) +
      "\nDeliver to: " + po.site;
    var subject, intro, ask;
    if (kind === "confirm") {
      subject = po.id + ": please confirm the delivery date";
      intro = "We sent you the purchase order below and have not had a confirmation yet.";
      ask = "Could you confirm the order and the date you can ship? A short reply is fine.";
    } else if (kind === "overdue") {
      subject = po.id + ": past the promised date, need an update";
      intro = "The promised date on the order below has passed and we have not received the goods.";
      ask = "Could you tell me where the order is, what caused the delay, and the earliest date it can ship? If part of it can ship sooner, a partial shipment is fine.";
    } else {
      subject = po.id + ": can the delivery date move up?";
      intro = kind === "late"
        ? "The promised date on the order below is later than the date we need it."
        : "The promised date on the order below leaves us very little room before the date we need it.";
      ask = "Could you check if you can ship earlier, or send part of it first? Please let me know the earliest date you can commit to.";
    }
    return {
      to: contactOf(s, po.supplierId), subject: subject,
      body: "Hi " + sp.name + " team,\n\n" + intro + "\n\n" + facts + "\n\n" + ask + "\n\nThank you,\n" + fromName
    };
  }

  // Links that open the draft. Mailto has no real length limit but some programs cut long ones, so we flag it.
  function mailLinks(d) {
    var enc = encodeURIComponent, crlf = function (t) { return t.replace(/\r?\n/g, "\r\n"); };
    var mailto = "mailto:" + enc(d.to || "").replace(/%40/g, "@") + "?subject=" + enc(d.subject) + "&body=" + enc(crlf(d.body));
    return {
      mailto: mailto,
      gmail: "https://mail.google.com/mail/?view=cm&fs=1&to=" + enc(d.to || "") + "&su=" + enc(d.subject) + "&body=" + enc(d.body),
      outlook: "https://outlook.office.com/mail/deeplink/compose?to=" + enc(d.to || "") + "&subject=" + enc(d.subject) + "&body=" + enc(d.body),
      tooLong: mailto.length > 1800
    };
  }

  // A draft file most mail programs open as an unsent message.
  function emlText(d) {
    return "To: " + (d.to || "") + "\r\nSubject: " + d.subject + "\r\nX-Unsent: 1\r\nContent-Type: text/plain; charset=UTF-8\r\n" +
      "Content-Transfer-Encoding: 8bit\r\n\r\n" + d.body.replace(/\r?\n/g, "\r\n");
  }

  // The app cannot see whether the mail was sent, so the log says drafted, never sent.
  function logChase(s, role, now, poId, via) {
    need(role, ["buyer"]);
    var po = getPO(s, poId), sp = supplier(po.supplierId);
    log(s, now, role, po.id, "Chase email drafted for " + sp.name, "Opened through " + via + ". The app cannot tell if it was sent.");
  }

  // ---------- 5. invoice and three way match ----------
  function matchInvoice(s, inv) {
    var svc = isService(getPO(s, inv.poId)), uom = svc ? item(getPO(s, inv.poId).itemId).uom : "unit";
    var po = getPO(s, inv.poId), issues = [];
    var dup = s.invoices.some(function (o) {
      return o.id !== inv.id && o.supplierId === inv.supplierId && o.status !== "Rejected" &&
        o.invNo.toLowerCase() === inv.invNo.toLowerCase();
    });
    var t = grnTotals(s, po.id);
    var invoiceable = t.accepted - invoicedQty(s, po.id, inv.id, ["Matched", "Paid"]);
    // For a service PO, work waiting for release goes to the next releaser of the oldest waiting entry.
    var waitOn = svc ? (sesOf(s).filter(function (e) { return e.poId === po.id; }).map(nextReleaser).filter(Boolean)[0] || "requester") : null;
    if (dup) issues.push({ code: "DUPLICATE", owner: "ap", msg: "Invoice number " + inv.invNo + " is already on file for this supplier." });
    if (invoiceable <= 0) {
      if (svc) issues.push({ code: "NO_RECEIPT", owner: t.hold > 0 ? waitOn : "requester",
        msg: t.hold > 0 ? "No accepted service yet. " + t.hold + " " + uom + "s are recorded and waiting for the " + roleLabel(waitOn) + " to release them."
                        : "No service entry is recorded against this PO. The Requester records it from the site log." });
      else issues.push({ code: "NO_RECEIPT", owner: "warehouse",
        msg: t.hold > 0 ? "No accepted receipt yet. " + t.hold + " units are on quality hold."
                        : "No accepted goods receipt is posted against this PO." });
    } else if (inv.qty > invoiceable) {
      issues.push({ code: "QTY_OVER", owner: svc ? (t.hold > 0 ? waitOn : "requester") : "warehouse",
        msg: "Invoice bills " + inv.qty + " " + uom + "s but only " + invoiceable + " are accepted and not yet invoiced." +
          (svc && t.hold > 0 ? " " + t.hold + " more are waiting for the " + roleLabel(waitOn) + " to release them." : "") });
    } else if (inv.qty < invoiceable) {
      issues.push({ code: "QTY_UNDER", owner: "ap",
        msg: "Invoice bills " + inv.qty + " units but " + invoiceable + " are accepted and not yet invoiced." });
    }
    if (cents(inv.unitPrice) !== cents(po.unitPrice)) {
      issues.push({ code: "PRICE", owner: "buyer",
        msg: "Invoice price " + fmt(inv.unitPrice) + " does not equal PO price " + fmt(po.unitPrice) + "." });
    }
    return { ok: issues.length === 0, issues: issues };
  }

  function enterInvoice(s, role, now, f) {
    need(role, ["ap"]);
    var po = getPO(s, f.poId);
    if (po.cancelled) fail("This PO is cancelled.");
    var no = (f.invNo || "").trim();
    var qty = Number(f.qty), price = Number(f.unitPrice);
    if (!no) fail("Enter the supplier invoice number.");
    // Service invoices bill hours or days, which can carry two decimals. Goods are billed in whole units.
    if (isService(po) ? !(qty > 0) || round2(qty) !== qty : !Number.isInteger(qty) || qty <= 0) {
      fail(isService(po) ? "Invoiced quantity must be above zero, with at most two decimals." : "Invoiced quantity must be a whole number above zero.");
    }
    if (!(price > 0)) fail("Invoiced unit price must be above zero.");
    if (!validDate(f.date)) fail("Enter the invoice date.");
    var sp = supplier(po.supplierId);
    var inv = {
      id: nextId(s, "INV", "INV"), invNo: no, poId: po.id, supplierId: po.supplierId, qty: qty, unitPrice: price,
      date: f.date, dueDate: addDays(f.date, sp.terms), status: "Exception", firstPass: false,
      match: null, paidAt: null, enteredAt: now
    };
    s.invoices.push(inv);
    inv.match = matchInvoice(s, inv);
    inv.status = inv.match.ok ? "Matched" : "Exception";
    inv.firstPass = inv.match.ok;
    log(s, now, role, inv.id, "Invoice " + no + " entered for " + po.id + ": " + (inv.match.ok ? "matched" : "exception"),
      inv.match.ok ? fmt(qty * price) + " ready for payment" : inv.match.issues.map(function (i) { return i.msg; }).join(" "));
    return inv;
  }

  function rerunMatch(s, role, now, invId) {
    need(role, ["ap"]);
    var inv = getInv(s, invId);
    if (inv.status !== "Exception") fail("Only invoices in exception can be re-matched.");
    inv.match = matchInvoice(s, inv);
    if (inv.match.ok) inv.status = "Matched";
    log(s, now, role, inv.id, inv.match.ok ? "Re-match passed" : "Re-match still failing",
      inv.match.ok ? "Ready for payment" : inv.match.issues.map(function (i) { return i.msg; }).join(" "));
    return inv;
  }

  function rejectInvoice(s, role, now, invId, reason) {
    need(role, ["ap"]);
    var inv = getInv(s, invId);
    if (inv.status !== "Exception") fail("Only invoices in exception can be rejected.");
    if (!reason || reason.trim().length < 5) fail("Add the reason and what you asked the supplier for.");
    inv.status = "Rejected";
    log(s, now, role, inv.id, "Invoice rejected back to supplier", reason.trim());
    return inv;
  }

  function payInvoice(s, role, now, invId) {
    need(role, ["ap"]);
    var inv = getInv(s, invId);
    if (inv.status !== "Matched") fail("Only matched invoices can be paid.");
    inv.status = "Paid"; inv.paidAt = dateOf(now);
    log(s, now, role, inv.id, "Payment released", fmt(inv.qty * inv.unitPrice));
    return inv;
  }

  // ---------- document flow ----------
  // Every record linked to the one asked for, from the request to its invoices. Accepts a REQ, PR, RFX, PO, GRN or INV id.
  // Returns null when the id is not on file.
  function docFlow(s, id) {
    id = String(id || "").trim().toUpperCase();
    var find = function (list, key) { return list.find(function (x) { return x[key] === id; }) || null; };
    var kind = id.split("-")[0], req = null, x = null, po = null, g, inv;
    if (kind === "REQ") req = find(s.requests, "id");
    else if (kind === "PR") req = find(s.requests, "prNo");
    else if (kind === "RFX") { x = find(s.rfx, "id"); if (x) req = getReq(s, x.requestId); }
    else if (kind === "PO") { po = find(s.pos, "id"); if (po) req = getReq(s, po.requestId); }
    else if (kind === "GRN") { g = find(s.grns, "id"); if (g) { po = getPO(s, g.poId); req = getReq(s, po.requestId); } }
    else if (kind === "INV") { inv = find(s.invoices, "id"); if (inv) { po = getPO(s, inv.poId); req = getReq(s, po.requestId); } }
    else if (kind === "SES") { g = find(sesOf(s), "id"); if (g) { po = getPO(s, g.poId); req = getReq(s, po.requestId); } }
    if (!req) return null;
    if (!x && req.rfxId) x = getRfx(s, req.rfxId);
    if (!po && req.poId) po = getPO(s, req.poId);
    return {
      kind: kind, id: id, request: req, rfx: x, po: po,
      contract: po && po.contractId ? ctOf(s).find(function (c) { return c.id === po.contractId; }) || null : null,
      project: req.projectId ? prjOf(s).find(function (p) { return p.id === req.projectId; }) || null : null,
      grns: po ? s.grns.filter(function (r) { return r.poId === po.id; }) : [],
      ses: po ? sesOf(s).filter(function (r) { return r.poId === po.id; }) : [], service: po ? isService(po) : !!item(req.itemId).service,
      invoices: po ? s.invoices.filter(function (r) { return r.poId === po.id; }) : []
    };
  }

  // ---------- queues and metrics ----------
  function invOwners(inv) {
    if (inv.status !== "Exception") return [];
    return Array.from(new Set(inv.match.issues.map(function (i) { return i.owner; })));
  }

  // Suppliers with at least one document that is expired or missing (blocking) or expiring soon (warning).
  function docAlerts(s, today) {
    var out = { blocking: 0, expiring: 0 };
    REF.suppliers.forEach(function (sp) {
      var list = supplierDocs(s, sp.id, today);
      if (list.some(function (d) { return d.status === "Expired" || d.status === "Missing"; })) out.blocking += 1;
      else if (list.some(function (d) { return d.status === "Expiring"; })) out.expiring += 1;
    });
    return out;
  }

  function queueFor(s, role, now) {
    var q = [], today = dateOf(now || new Date().toISOString());
    var add = function (label, count, tab) { if (count > 0) q.push({ label: label, count: count, tab: tab }); };
    add("Requests waiting for your approval", s.requests.filter(function (r) {
      var st = r.approvals.find(function (a) { return a.status === "Pending"; });
      return r.status === "Pending approval" && st && st.role === role;
    }).length, "requests");
    add("RFx waiting for your technical evaluation", s.rfx.filter(function (x) {
      return x.status === "Technical review" && x.techRole === role;
    }).length, "rfx");
    add("Awards waiting for your approval", s.rfx.filter(function (x) {
      var st = x.status === "Award pending approval" && x.awardApprovals.find(function (a) { return a.status === "Pending"; });
      return st && st.role === role;
    }).length, "rfx");
    var openPOs = s.pos.filter(function (po) { return ["Issued", "Confirmed", "Partially received"].indexOf(poStatus(s, po)) >= 0; });
    var invFor = function (who) { return s.invoices.filter(function (i) { return invOwners(i).indexOf(who) >= 0; }).length; };
    if (role === "requester") {
      add("Your projects that are late or at risk", prjOf(s).filter(function (p) {
        var st = p.status === "Open" ? projectStatus(s, p, today).state : "";
        return st === "Late" || st === "At risk" || st === "Blocked";
      }).length, "projects");
    }
    add("Contracts waiting for your approval", ctOf(s).filter(function (c) {
      var st = c.status === "Pending approval" && c.approvals.find(function (a) { return a.status === "Pending"; });
      return st && st.role === role;
    }).length, "contracts");
    add("Service entries waiting for your release", sesOf(s).filter(function (e) { return nextReleaser(e) === role; }).length, "services");
    if (["manager", "director", "executive"].indexOf(role) >= 0) add("Invoices waiting on your service release", invFor(role), "invoices");
    if (role === "requester") {
      // A sent back entry stays on the list until a later entry is recorded for the same PO and month.
      add("Service entries sent back to you", sesOf(s).filter(function (e) {
        return e.status === "Rejected" && !sesOf(s).some(function (x) { return x.poId === e.poId && x.period === e.period && x.id > e.id; });
      }).length, "services");
      add("Invoices waiting on your service entry", invFor("requester"), "invoices");
      // Only the requester's own requests. The name is the persona on the Requester role, the same name the request form saves.
      var me = (REF.roles.find(function (x) { return x.id === "requester"; }) || { persona: "" }).persona.split(",")[0];
      add("Your requests that were rejected", s.requests.filter(function (r) { return r.status === "Rejected" && r.requester === me; }).length, "requests");
    } else if (role === "quality") {
      add("Receipts on quality hold", s.grns.filter(function (g) { return g.result === "Hold"; }).length, "grn");
      var da = docAlerts(s, today);
      add("Suppliers with expired or missing documents", da.blocking, "suppliers");
      add("Suppliers with documents expiring soon", da.expiring, "suppliers");
    } else if (role === "buyer") {
      add("Suppliers blocked by expired documents", docAlerts(s, today).blocking, "suppliers");
      add("Approved PRs waiting for sourcing", s.requests.filter(function (r) { return r.status === "Approved"; }).length, "requests");
      add("Awarded RFx waiting for a PO", s.requests.filter(function (r) { return r.status === "Awarded"; }).length, "requests");
      add("RFx open for quotes", s.rfx.filter(function (x) { return x.status === "Open"; }).length, "rfx");
      add("RFx in technical review", s.rfx.filter(function (x) { return x.status === "Technical review"; }).length, "rfx");
      add("RFx ready for your award recommendation", s.rfx.filter(function (x) { return x.status === "Evaluating"; }).length, "rfx");
      add("RFx in a best and final round", s.rfx.filter(function (x) { return x.status === "Round 2"; }).length, "rfx");
      add("POs not yet confirmed by supplier", s.pos.filter(function (po) { return poStatus(s, po) === "Issued"; }).length, "pos");
      add("POs to chase with the supplier", expediteList(s, now || new Date().toISOString()).length, "expedite");
      add("Invoice exceptions on your desk", invFor("buyer"), "invoices");
      var cts = ctOf(s).map(function (c) { return contractStatus(s, c, today); });
      add("Contracts ending within " + CT_WARN_DAYS + " days", cts.filter(function (c) { return c.endsSoon; }).length, "contracts");
      add("Contracts over " + (REF.serviceWarnPct || 80) + "% used", cts.filter(function (c) { return c.warn; }).length, "contracts");
      add("Service POs over " + (REF.serviceWarnPct || 80) + "% used", s.pos.filter(function (po) {
        return isService(po) && !po.cancelled && poStatus(s, po) !== "Closed" && serviceStatus(s, po).warn;
      }).length, "services");
    } else if (role === "warehouse") {
      add("POs open for receiving", openPOs.length, "pos");
      add("Invoice exceptions needing a receipt check", invFor("warehouse"), "invoices");
    } else if (role === "ap") {
      add("Invoice exceptions on your desk", invFor("ap"), "invoices");
      add("Matched invoices ready to pay", s.invoices.filter(function (i) { return i.status === "Matched"; }).length, "invoices");
    }
    return q;
  }

  function metrics(s, now) {
    var today = dateOf(now);
    var cnt = function (st) { return s.requests.filter(function (r) { return r.status === st; }).length; };
    var open = s.pos.filter(function (po) { return ["Received", "Closed", "Cancelled"].indexOf(poStatus(s, po)) < 0; });
    var ctbCounts = { Clear: 0, "At Risk": 0, Late: 0 };
    open.forEach(function (po) { if (!isService(po)) ctbCounts[ctb(s, po).status] += 1; });
    // Committed spend is the landed value of issued POs. Pipeline is what approved or pending requests still hold.
    var spend = {}, pipeline = {};
    REF.categories.forEach(function (c) { spend[c] = 0; pipeline[c] = 0; });
    s.pos.filter(function (po) { return !po.cancelled; }).forEach(function (po) {
      var c = item(po.itemId).category; spend[c] += poLanded(po);
    });
    s.requests.forEach(function (r) {
      var c = item(r.itemId).category; pipeline[c] += requestedValue(s, r);
    });
    REF.categories.forEach(function (c) {
      spend[c] = Math.round(spend[c] * 100) / 100; pipeline[c] = Math.round(pipeline[c] * 100) / 100;
    });
    var aboveRef = s.pos.filter(function (po) { return !po.cancelled && po.refPrice && po.unitPrice > po.refPrice + 0.0001; }).length;
    var cyc = s.requests.filter(function (r) { return r.poId && r.approvedAt; }).map(function (r) {
      return daysBetween(r.approvedAt, getPO(s, r.poId).createdAt);
    });
    var exc = s.invoices.filter(function (i) { return i.status === "Exception"; });
    var uninvoiced = s.pos.filter(function (po) {
      var t = grnTotals(s, po.id);
      return !po.cancelled && t.accepted > 0 && invoicedQty(s, po.id, null, ["Matched", "Paid"]) < t.accepted;
    }).length;
    return {
      today: today,
      pending: cnt("Pending approval"), awaitingSourcing: cnt("Approved"),
      inRfx: cnt("Sourcing") + cnt("Awarded"), openPOs: open.length,
      receivedNotInvoiced: uninvoiced, exceptions: exc.length,
      exceptionValue: sum(exc, function (i) { return i.qty * i.unitPrice; }),
      paid: s.invoices.filter(function (i) { return i.status === "Paid"; }).length,
      firstPass: s.invoices.length ? Math.round(100 * s.invoices.filter(function (i) { return i.firstPass; }).length / s.invoices.length) : null,
      cycleDays: cyc.length ? round1(sum(cyc, function (d) { return d; }) / cyc.length) : null,
      ctb: ctbCounts, spend: spend, pipeline: pipeline, budget: budgetStatus(s),
      posAboveRef: aboveRef, docAlerts: docAlerts(s, today),
      overdueInvoices: s.invoices.filter(function (i) { return (i.status === "Matched" || i.status === "Exception") && i.dueDate < today; }).length
    };
  }

  return {
    REF: REF, fmt: fmt, addDays: addDays, dateOf: dateOf, daysBetween: daysBetween, roleLabel: roleLabel,
    newState: newState, requestTotal: requestTotal, poTotal: poTotal, buildChain: buildChain,
    createRequest: createRequest, cancelRequest: cancelRequest, decide: decide,
    startRFx: startRFx, addQuote: addQuote, closeBidding: closeBidding, scoreRFx: scoreRFx,
    setAdjustments: setAdjustments, adjOf: adjOf, ADJ_FIELDS: ADJ_FIELDS,
    rfxStrategy: rfxStrategy, openRound2: openRound2, addRound2Offer: addRound2Offer, closeRound2: closeRound2, round2Saving: round2Saving,
    round2Draft: round2Draft, logRound2Draft: logRound2Draft, ordinal: ordinal,
    techEvaluate: techEvaluate, techSubmit: techSubmit, recommendAward: recommendAward, decideAward: decideAward, techReviewer: techReviewer,
    createPO: createPO, confirmPO: confirmPO, updatePromise: updatePromise, amendPOPrice: amendPOPrice,
    grnTotals: grnTotals, postGRN: postGRN, releaseHold: releaseHold,
    isService: isService, postService: postService, decideService: decideService, serviceStatus: serviceStatus,
    serviceChain: serviceChain, serviceReleases: releasesOf, nextReleaser: nextReleaser,
    createContract: createContract, decideContract: decideContract, contractChain: contractChain, contractStatus: contractStatus,
    contractFor: contractFor, refPriceAt: refPriceAt,
    deliveryRecord: deliveryRecord, plannedDate: plannedDate,
    addLesson: addLesson, itemKnowledge: itemKnowledge, similarItems: similarItems, LESSON_KINDS: LESSON_KINDS, LESSON_ROLES: LESSON_ROLES,
    editGuide: editGuide, itemGuide: itemGuide, guideRevisions: guideRevisions, lessonsSinceGuide: lessonsSinceGuide, GUIDE_ROLES: GUIDE_ROLES,
    createProject: createProject, linkToProject: linkToProject, projectStatus: projectStatus, CRITICALITY: CRITICALITY, PROJECT_STAGES: STAGES, migrateContracts: migrateContracts, CT_WARN_DAYS: CT_WARN_DAYS,
    poStatus: poStatus, ctb: ctb, invoicedQty: invoicedQty,
    matchInvoice: matchInvoice, enterInvoice: enterInvoice, rerunMatch: rerunMatch,
    rejectInvoice: rejectInvoice, payInvoice: payInvoice, invOwners: invOwners,
    queueFor: queueFor, metrics: metrics, docFlow: docFlow,
    // new in this version
    extendQuote: extendQuote, renewDoc: renewDoc, docIssues: docIssues, supplierDocs: supplierDocs, docAlerts: docAlerts,
    quoteLanded: quoteLanded, poLanded: poLanded, refPrice: refPrice, landedUnit: landedUnit,
    budgetStatus: budgetStatus, budgetCheck: budgetCheck, requestedValue: requestedValue,
    setContact: setContact, contactOf: contactOf, emailOk: emailOk, leftToReceive: leftToReceive, expediteList: expediteList,
    chaseDraft: chaseDraft, mailLinks: mailLinks, emlText: emlText, logChase: logChase, lastChase: lastChase, longDate: longDate
  };
});
