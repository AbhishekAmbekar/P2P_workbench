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
      seq: { REQ: 1000, PR: 2000, RFX: 3000, PO: 4000, GRN: 5000, INV: 6000, SES: 7000 },
      requests: [], rfx: [], pos: [], grns: [], invoices: [], ses: [], audit: [], docs: docs, contacts: {}
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
  var refPrice = function (it) { return it.contract ? it.contract.price : it.stdPrice; };
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
      createdAt: now, approvedAt: null, rfxId: null, poId: null
    };
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
    var w = { price: Number(f.wPrice), lead: Number(f.wLead), quality: Number(f.wQuality) };
    if ([w.price, w.lead, w.quality].some(function (n) { return !(n >= 0); }) || w.price + w.lead + w.quality !== 100) {
      fail("Scoring weights must be zero or more and add up to 100.");
    }
    var x = {
      id: nextId(s, "RFX", "RFX"), type: f.type === "RFP" ? "RFP" : "RFQ", requestId: r.id,
      status: "Open", invited: invited, weights: w, soleReason: sole, quotes: [],
      createdAt: now, closeDate: f.closeDate || null, award: null
    };
    s.rfx.push(x);
    r.status = "Sourcing"; r.rfxId = x.id;
    log(s, now, role, x.id, x.type + " opened for " + (r.prNo || r.id),
      "Invited " + invited.map(function (id) { return supplier(id).name; }).join(", ") +
      (sole ? ". Sole source reason: " + sole : ""));
    return x;
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

  // Price is scored on landed cost (price plus tariff plus freight), so a tariff can change the winner.
  // Pass the state and the current time to also check supplier documents and quote expiry.
  function scoreRFx(x, s, now) {
    var q = x.quotes;
    if (!q.length) return [];
    var landed = q.map(quoteLanded);
    var minP = Math.min.apply(null, landed);
    var minL = Math.min.apply(null, q.map(function (z) { return z.leadDays; }));
    var w = x.weights;
    var today = now ? dateOf(now) : null;
    var cat = s ? item(getReq(s, x.requestId).itemId).category : null;
    return q.map(function (z, i) {
      var sp = supplier(z.supplierId);
      var p = minP / landed[i] * 100, l = minL / z.leadDays * 100, qs = sp.quality;
      var total = (p * w.price + l * w.lead + qs * w.quality) / 100;
      var docs = s && today ? blockingDocs(docIssues(s, z.supplierId, today, cat)) : [];
      return {
        supplierId: z.supplierId, unitPrice: z.unitPrice, tariffPct: z.tariffPct || 0, freight: z.freight || 0, landed: landed[i],
        validUntil: z.validUntil || null, expired: !!(today && z.validUntil && z.validUntil < today),
        leadDays: z.leadDays, terms: z.terms, supplierStatus: sp.status, docIssues: docs,
        tech: z.tech ? z.tech.result : (x.techRole ? "Pending" : "Not reviewed"), techNote: z.tech ? z.tech.note : "", techOk: techOk(x, z),
        scores: { price: round1(p), lead: round1(l), quality: qs }, total: round1(total),
        eligible: sp.status !== "Not qualified" && docs.length === 0 && techOk(x, z)
      };
    }).sort(function (a, b) { return b.total - a.total; });
  }

  // The Buyer recommends a supplier. The award only stands once the approval chain signs it off.
  // Director always (every RFx is at least the RFx threshold). Executive from the executive threshold,
  // or at any value for a single bid, a conditional supplier, or a pick that is not the top eligible quote.
  function recommendAward(s, role, now, rfxId, supplierId, justification) {
    need(role, ["buyer"]);
    var x = getRfx(s, rfxId);
    if (x.status === "Technical review") fail("The technical evaluation is not done yet. It is with the " + roleLabel(x.techRole) + ".");
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
    if (eligible[0].supplierId !== supplierId) reasons.push("not the top scored eligible quote");
    var j = (justification || "").trim();
    if (reasons.length && j.length < 10) fail("A written justification is required (" + reasons.join(", ") + ").");
    var r = getReq(s, x.requestId), value = cents(r.qty * pick.landed) / 100;
    var chain = ["director"];
    if (value >= TH.executive || reasons.length) chain.push("executive");
    x.recommendation = { supplierId: supplierId, justification: j, reasons: reasons, value: value, by: role, at: now };
    x.awardApprovals = chain.map(function (rl) { return { role: rl, status: "Pending", at: null, comment: "" }; });
    x.status = "Award pending approval";
    log(s, now, role, x.id, "Award recommended: " + sp.name + " for " + fmt(value),
      (j || "Top scored eligible quote") + ". Approval chain: " + chain.map(roleLabel).join(" then ") +
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

  // ---------- 3. purchase order ----------
  function createPO(s, role, now, reqId, f) {
    need(role, ["buyer"]);
    f = f || {};
    var r = getReq(s, reqId), it = item(r.itemId);
    var supId, price, lead, rfxId = null, source, tariff = 0, freight = 0;
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
      if (it.contract) {
        supId = it.contract.supplierId; price = it.contract.price; source = "Contract";
      } else {
        source = "Direct";
        if (requestTotal(r) >= TH.rfx) {
          fail("This request is " + fmt(requestTotal(r)) + " with no contract. Values of " + fmt(TH.rfx) + " or more need an RFx.");
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
    var ref = refPrice(it), varPct = Math.round(100 * (price - ref) / ref);
    var vReason = (f.varianceReason || "").trim();
    if (price > ref * (1 + TH.priceVariance) + 0.0001 && vReason.length < 10) {
      fail("PO price " + fmt(price) + " is " + varPct + "% above the " + (it.contract ? "contract" : "standard") + " price " + fmt(ref) +
        ". Add a reason (at least a short sentence) before issuing it.");
    }
    var po = {
      id: nextId(s, "PO", "PO"), requestId: r.id, rfxId: rfxId, supplierId: supId, itemId: it.id,
      qty: r.qty, unitPrice: price, tariffPct: tariff, freight: freight, refPrice: ref, varianceReason: vReason,
      site: r.site, needBy: r.needBy,
      promisedDate: addDays(dateOf(now), lead), confirmed: false, cancelled: false,
      source: source, createdAt: now
    };
    s.pos.push(po);
    r.status = "Ordered"; r.poId = po.id;
    log(s, now, role, po.id, "PO issued to " + supplier(supId).name + " (" + source + ")",
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
    if (isService(po)) fail(po.id + " is a service PO. The Buyer records a service entry and the Requester accepts it.");
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
  // A service PO is an estimated quantity (hours, days, weeks, months) at a rate. Each period the Buyer records the
  // work from the supplier's report and the Requester accepts it, the service version of a goods receipt.
  var round2 = function (n) { return Math.round(n * 100) / 100; };
  var sesOf = function (s) { if (!s.ses) s.ses = []; if (!s.seq.SES) s.seq.SES = 7000; return s.ses; };
  function isService(po) { var it = REF.items.find(function (i) { return i.id === po.itemId; }); return !!(it && it.service); }
  var getSES = function (s, id) { return byId(sesOf(s), id, "Service entry"); };

  function postService(s, role, now, poId, f) {
    need(role, ["buyer"]);
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
        ") remain. The Requester must raise a new request for more.");
    }
    var e = { id: nextId(s, "SES", "SES"), poId: poId, period: f.period, qty: qty, value: round2(qty * po.unitPrice), note: note,
      status: "Submitted", by: role, at: now, decidedAt: null, decisionNote: "" };
    sesOf(s).push(e);
    log(s, now, role, e.id, "Service entry recorded on " + po.id + ": " + qty + " " + it.uom + "s for " + f.period, fmt(e.value) + ". " + note);
    return e;
  }

  function decideService(s, role, now, sesId, decision, note) {
    need(role, ["requester"]);
    var e = getSES(s, sesId);
    if (e.status !== "Submitted") fail("This service entry is already " + e.status.toLowerCase() + ".");
    if (decision !== "Accepted" && decision !== "Rejected") fail("Choose Accepted or Rejected.");
    var n = (note || "").trim();
    if (decision === "Rejected" && n.length < 5) fail("Say what is wrong with the entry, so the Buyer can correct it with the supplier.");
    e.status = decision; e.decidedAt = now; e.decisionNote = n;
    log(s, now, role, e.id, "Service entry " + decision.toLowerCase() + " for " + e.poId, n || fmt(e.value) + " confirmed as done");
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
    if (dup) issues.push({ code: "DUPLICATE", owner: "ap", msg: "Invoice number " + inv.invNo + " is already on file for this supplier." });
    if (invoiceable <= 0) {
      if (svc) issues.push({ code: "NO_RECEIPT", owner: t.hold > 0 ? "requester" : "buyer",
        msg: t.hold > 0 ? "No accepted service yet. " + t.hold + " " + uom + "s are recorded and waiting for the Requester to accept them."
                        : "No service entry is recorded against this PO. The Buyer records it from the supplier's report." });
      else issues.push({ code: "NO_RECEIPT", owner: "warehouse",
        msg: t.hold > 0 ? "No accepted receipt yet. " + t.hold + " units are on quality hold."
                        : "No accepted goods receipt is posted against this PO." });
    } else if (inv.qty > invoiceable) {
      issues.push({ code: "QTY_OVER", owner: svc ? (t.hold > 0 ? "requester" : "buyer") : "warehouse",
        msg: "Invoice bills " + inv.qty + " " + uom + "s but only " + invoiceable + " are accepted and not yet invoiced." +
          (svc && t.hold > 0 ? " " + t.hold + " more are waiting for the Requester's acceptance." : "") });
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
    var sesWaiting = sesOf(s).filter(function (e) { return e.status === "Submitted"; }).length;
    if (role === "requester") {
      add("Service entries waiting for your acceptance", sesWaiting, "services");
      add("Invoices waiting on your service acceptance", invFor("requester"), "invoices");
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
      add("POs not yet confirmed by supplier", s.pos.filter(function (po) { return poStatus(s, po) === "Issued"; }).length, "pos");
      add("POs to chase with the supplier", expediteList(s, now || new Date().toISOString()).length, "expedite");
      add("Invoice exceptions on your desk", invFor("buyer"), "invoices");
      add("Service entries rejected by the Requester", sesOf(s).filter(function (e) { return e.status === "Rejected"; }).length, "services");
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
    techEvaluate: techEvaluate, techSubmit: techSubmit, recommendAward: recommendAward, decideAward: decideAward, techReviewer: techReviewer,
    createPO: createPO, confirmPO: confirmPO, updatePromise: updatePromise, amendPOPrice: amendPOPrice,
    grnTotals: grnTotals, postGRN: postGRN, releaseHold: releaseHold,
    isService: isService, postService: postService, decideService: decideService, serviceStatus: serviceStatus,
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
