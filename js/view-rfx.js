/* RFx: start sourcing for an approved PR, collect quotes, technical evaluation by the user side,
 * compare acceptable offers on one adjusted price (bonus and malus), the Buyer recommends, the Director (and Executive) approve.
 * App.sel.rfx holds the selected RFx id. App.sel.rfxNew holds the request id being sourced. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;

  function reqOf(x) { return App.state.requests.find(function (r) { return r.id === x.requestId; }); }

  // The adjustment values: inputs while they can change, a plain list once locked.
  var ADJ_HELP = {
    capitalPct: "What a day of supplier credit is worth",
    baseTermsDays: "Your company's normal payment terms",
    conditionalCost: "First article and extra incoming checks, once per award",
    bufferDays: "How early the goods should be ready",
    dayPct: "Expediting, premium freight or waiting, per day short",
    qualityTarget: "The supplier rating the plant expects",
    qualityPct: "Rework, rejects and checks, per point below"
  };
  function adjInputs(a) {
    return P.ADJ_FIELDS.map(function (d) {
      return '<label>' + esc(d[1]) + '<input type="number" name="' + d[0] + '" min="' + d[2] + '" max="' + d[3] + '" step="any" value="' + a[d[0]] + '">' +
        '<span class="hint">' + esc(ADJ_HELP[d[0]]) + "</span></label>";
    }).join("");
  }
  function adjList(a) {
    return '<div class="wrap flat"><table><tr><th>Adjustment</th><th class="num">Value</th><th>What it covers</th></tr>' + P.ADJ_FIELDS.map(function (d) {
      var v = d[0] === "conditionalCost" ? App.money(a[d[0]]) : String(a[d[0]]);
      return "<tr><td>" + esc(d[1]) + '</td><td class="num">' + esc(v) + "</td><td>" + esc(ADJ_HELP[d[0]]) + "</td></tr>";
    }).join("") + "</table></div>";
  }
  function adjCard(x) {
    var a = P.adjOf(x), open = x.status === "Open";
    if (open && App.role === "buyer") {
      return '<details class="adjbox"><summary>Adjustment values (bonus and malus). Change them before bidding closes.</summary>' +
        '<form data-form="rfxAdjust" data-id="' + x.id + '" class="form">' + adjInputs(a) +
        '<div class="wide actions"><button type="submit" class="ghost">Save adjustment values</button></div></form></details>';
    }
    return '<details class="adjbox"><summary>Adjustment values' + (open ? ", set by the Buyer" : ", locked when bidding closed on " + esc(x.evalDate || "") ) + "</summary>" + adjList(a) + "</details>";
  }

  // Links from other screens pass either a request id (start an RFx) or an RFx id (open it).
  var baseGoto = App.actions.goto;
  App.actions.goto = function (el) {
    if (el.dataset.arg === "rfx" && el.dataset.id) {
      if (/^REQ-/.test(el.dataset.id)) { App.sel.rfxNew = el.dataset.id; App.sel.rfx = null; }
      else { App.sel.rfx = el.dataset.id; App.sel.rfxNew = null; }
      App.go("rfx");
      return;
    }
    baseGoto(el);
  };

  // ---------- start an RFx ----------
  function startForm(r) {
    var it = App.item(r.itemId);
    var sups = REF.suppliers.filter(function (s) { return s.categories.indexOf(it.category) >= 0; });
    var boxes = sups.map(function (s) {
      return '<label style="display:flex;gap:8px;align-items:center;margin:4px 0;color:var(--ink)">' +
        '<input type="checkbox" name="inv" value="' + s.id + '" style="width:auto"' + (s.status === "Qualified" ? " checked" : "") + ">" +
        "<span>" + esc(s.name) + "</span> " + App.status(s.status) + ' <span class="hint">rating ' + s.quality + ", terms net " + s.terms + "</span></label>";
    }).join("");
    return '<div class="card" style="margin-bottom:12px"><h3>Start sourcing for ' + esc(r.prNo) + "</h3>" +
      '<p class="hint">' + r.qty + " x " + esc(it.name) + ", approved value " + App.money(P.requestTotal(r)) + ", need by " + r.needBy + ".</p>" +
      '<form data-form="rfxStart" data-id="' + r.id + '" class="form">' +
      '<label>Type<select name="type"><option value="RFQ">RFQ (price and lead time)</option><option value="RFP">RFP (full proposal)</option></select></label>' +
      '<label>Bids close on<input type="date" name="closeDate" value="' + P.addDays(App.today(), 7) + '"></label>' +
      '<div class="wide"><div class="hint">Invite suppliers (' + esc(it.category) + ")</div>" + boxes + "</div>" +
      '<details class="wide adjbox"><summary>Adjustment values (bonus and malus). Defaults shown. They lock when bidding closes.</summary>' +
      '<p class="hint">Offers are compared on one adjusted price: landed cost plus a dollar value for each difference that is not in the price.</p>' +
      '<div class="form">' + adjInputs(REF.adjust) + "</div></details>" +
      '<label class="wide">Sole source reason (only needed when inviting one supplier)<input name="soleReason"></label>' +
      '<div class="wide actions"><button type="submit">Open the RFx</button>' +
      '<button type="button" class="ghost" data-act="rfxCancelNew">Not now</button></div></form></div>';
  }
  App.actions.rfxCancelNew = function () { App.sel.rfxNew = null; App.render(); };
  App.actions.rfxStart = function (data, form) {
    var invited = Array.prototype.map.call(form.querySelectorAll('input[name="inv"]:checked'), function (e) { return e.value; });
    var reqId = form.dataset.id;
    var x = App.run(function (s, role, now) {
      var f = { type: data.type, invited: invited, closeDate: data.closeDate, soleReason: data.soleReason };
      P.ADJ_FIELDS.forEach(function (d) { f[d[0]] = data[d[0]]; });
      return P.startRFx(s, role, now, reqId, f);
    }, function (x) { return x.id + " is open for quotes."; });
    if (x) { App.sel.rfxNew = null; App.sel.rfx = x.id; App.render(); }
  };

  // ---------- quotes, closing, awarding ----------
  App.actions.rfxQuote = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) {
      return P.addQuote(s, role, now, id, { supplierId: data.supplierId, unitPrice: data.unitPrice, leadDays: data.leadDays, terms: data.terms,
        tariffPct: data.tariffPct, freight: data.freight, validUntil: data.validUntil });
    }, "Quote recorded.");
  };
  App.actions.rfxAdjust = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) { return P.setAdjustments(s, role, now, id, data); }, "Adjustment values saved. The ranking below uses them.");
  };
  App.actions.rfxRevalidate = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) { return P.extendQuote(s, role, now, id, data.supplierId, data.newDate, data.note); },
      "Quote revalidated.");
  };
  App.actions.rfxClose = function (el) {
    var id = el.dataset.id;
    App.run(function (s, role, now) { return P.closeBidding(s, role, now, id); }, "Bidding closed. Compare the quotes below.");
  };
  App.actions.rfxAward = function (el) {
    var id = el.dataset.id, sup = el.dataset.sup, n = document.getElementById("awardNote");
    App.run(function (s, role, now) { return P.recommendAward(s, role, now, id, sup, n ? n.value : ""); },
      function (x) { return "Award to " + App.supplier(sup).name + " sent for approval: " + x.awardApprovals.map(function (a) { return P.roleLabel(a.role); }).join(", then ") + "."; });
  };
  App.actions.rfxTech = function (data, form) {
    var id = form.dataset.id, sup = form.dataset.sup;
    App.run(function (s, role, now) { return P.techEvaluate(s, role, now, id, sup, data.result, data.note); },
      App.supplier(sup).name + " marked " + String(data.result).toLowerCase() + ".");
  };
  App.actions.rfxTechSubmit = function (el) {
    var id = el.dataset.id;
    App.run(function (s, role, now) { return P.techSubmit(s, role, now, id); }, "Technical recommendation sent to the Buyer.");
  };
  App.actions.rfxDecide = function (el) {
    var id = el.dataset.id, d = el.dataset.decision, n = document.getElementById("awardDecisionNote");
    App.run(function (s, role, now) { return P.decideAward(s, role, now, id, d, n ? n.value : ""); },
      function (x) { return d === "Rejected" ? "Award rejected. It is back with the Buyer." : x.status === "Awarded" ? "Award approved. The Buyer can now create the PO." : "Approved. Next: " + P.roleLabel(x.awardApprovals.find(function (a) { return a.status === "Pending"; }).role) + "."; });
  };
  App.actions.rfxSelect = function (el) { App.sel.rfx = el.dataset.id; App.sel.rfxNew = null; App.render(); };

  // ---------- detail ----------
  function quoteForm(x) {
    var quoted = x.quotes.map(function (q) { return q.supplierId; });
    var opts = x.invited.map(function (id) {
      return '<option value="' + id + '">' + esc(App.supplier(id).name) + (quoted.indexOf(id) >= 0 ? " (revise quote)" : "") + "</option>";
    }).join("");
    return '<h3 style="margin-top:14px">Record a quote</h3><form data-form="rfxQuote" data-id="' + x.id + '" class="form">' +
      '<label>Supplier<select name="supplierId">' + opts + "</select></label>" +
      '<label>Unit price<input type="number" name="unitPrice" min="0.01" step="0.01"></label>' +
      '<label>Lead time (days)<input type="number" name="leadDays" min="1" step="1"></label>' +
      '<label>Tariff or duty (%)<input type="number" name="tariffPct" min="0" max="100" step="0.1" value="0"></label>' +
      '<label>Freight per unit<input type="number" name="freight" min="0" step="0.01" value="0"></label>' +
      '<label>Quote valid until<input type="date" name="validUntil" value="' + P.addDays(App.today(), 30) + '"></label>' +
      '<label>Terms<input name="terms" placeholder="Net 45, FCA plant"></label>' +
      '<div class="wide actions"><button type="submit">Save quote</button></div></form>';
  }

  function adjCell(q) {
    if (!q.adjustments.length) return '<span class="muted">None</span>';
    return q.adjustments.map(function (l) {
      return '<div class="adjline"><span><b class="' + (l.kind === "Bonus" ? "bonus" : "malus") + '">' + l.kind + "</b> " + esc(l.label) + '</span><span class="num">' +
        (l.amount < 0 ? "−" + App.money(-l.amount) : "+" + App.money(l.amount)) + "</span></div>";
    }).join("");
  }

  function compareTable(x, canAward) {
    var ranked = P.scoreRFx(x, App.state, App.now()), r = reqOf(x);
    var top = ranked.filter(function (q) { return q.eligible; })[0];
    var head = "<tr><th>#</th><th>Supplier</th><th>Technical</th><th class=\"num\">Landed unit</th><th>Adjustments per unit</th><th class=\"num\">Adjusted unit</th>" +
      '<th>Ready and validity</th><th></th></tr>';
    var rows = ranked.map(function (q, i) {
      var sp = App.supplier(q.supplierId), won = x.award && x.award.supplierId === q.supplierId;
      var picked = !won && x.recommendation && x.recommendation.supplierId === q.supplierId;
      var tech = q.tech === "Acceptable" ? App.pill("Acceptable", "ok") : q.tech === "Not acceptable" ? App.pill("Not acceptable", "bad") :
        q.tech === "Pending" ? App.pill("Pending", "mut") : '<span class="muted">Not reviewed</span>';
      if (q.techNote) tech += '<div class="hint">' + esc(q.techNote) + "</div>";
      var cell = "";
      if (won) cell = App.pill("Awarded", "ok");
      else if (picked) cell = App.pill("Recommended", "info");
      else if (canAward) {
        if (!q.techOk) cell = App.pill("Fails spec", "bad");
        else if (q.supplierStatus === "Not qualified") cell = App.pill("Cannot award", "bad");
        else if (q.docIssues.length) cell = App.pill("Documents expired", "bad");
        else if (q.expired) cell = App.pill("Quote expired", "bad");
        else cell = '<button class="small" data-act="rfxAward" data-id="' + x.id + '" data-sup="' + q.supplierId + '">Recommend</button>';
      }
      return "<tr" + (won ? ' class="sel"' : "") + "><td>" + (i + 1) + "</td><td>" + esc(sp.name) + '<div style="margin-top:3px">' + App.status(q.supplierStatus) + "</div>" +
        '<div class="hint">rating ' + sp.quality + ", net " + q.termsDays + "</div></td><td>" + tech +
        '</td><td class="num">' + App.money(q.landed) + (q.landed !== q.unitPrice ? '<div class="hint">price ' + App.money(q.unitPrice) + "</div>" : "") +
        (q.tariffPct || q.freight ? '<div class="hint">' + q.tariffPct + "% tariff" + (q.freight ? ", " + App.money(q.freight) + " freight" : "") + "</div>" : "") +
        '</td><td class="adjcell">' + adjCell(q) + '</td><td class="num"><b>' + App.money(q.adjusted) + '</b><div class="hint">' + App.money(q.adjusted * r.qty) + " for " + r.qty + "</div></td>" +
        '<td class="nw">' + q.leadDays + " days lead" + '<div class="hint">ready ' + esc(q.ready) + (q.slack < 0 ? ", " + (-q.slack) + " days late" : "") + "</div>" +
        '<div class="hint">valid until ' + esc(q.validUntil || "") + "</div>" + (q.expired ? App.pill("expired", "bad") : "") + "</td><td>" + cell + "</td></tr>";
    }).join("");
    return adjCard(x) + '<div class="wrap"><table>' + head + rows + "</table></div>" +
      '<p class="hint">Ranked on the adjusted price, lowest first: landed cost (price, tariff and freight) plus a dollar value per unit for payment terms, ' +
      "a conditional supplier, schedule risk against the need date of " + esc(r.needBy) + " and the supplier rating. A bonus lowers the price, a malus raises it. " +
      "Ready dates count from " + (x.status === "Open" ? "today" : "the day bidding closed") + " and add the supplier's usual slip once it has 3 or more deliveries on record." +
      (top ? " Lowest eligible: " + esc(App.supplier(top.supplierId).name) + "." : "") + "</p>" +
      (ranked.some(function (q) { return q.docIssues.length; }) ? '<div class="note warn">' + ranked.filter(function (q) { return q.docIssues.length; }).map(function (q) {
        return esc(App.supplier(q.supplierId).name) + ": " + q.docIssues.map(function (d) { return esc(d.label) + (d.status === "Missing" ? " missing" : " expired " + d.expires); }).join(", ");
      }).join(". ") + ". Quality must record a renewal on the Suppliers tab before an award or PO.</div>" : "");
  }

  // Buyer only. Lists quotes that have lapsed so the supplier can be asked to hold them.
  function revalidateForm(x) {
    var expired = P.scoreRFx(x, App.state, App.now()).filter(function (q) { return q.expired; });
    if (!expired.length || App.role !== "buyer" || reqOf(x).status === "Ordered") return "";
    return '<h3 style="margin-top:14px">Revalidate an expired quote</h3><form data-form="rfxRevalidate" data-id="' + x.id + '" class="form">' +
      '<label>Supplier<select name="supplierId">' + expired.map(function (q) { return '<option value="' + q.supplierId + '">' + esc(App.supplier(q.supplierId).name) + " (expired " + q.validUntil + ")</option>"; }).join("") + "</select></label>" +
      '<label>New valid until<input type="date" name="newDate" value="' + P.addDays(App.today(), 30) + '"></label>' +
      '<label class="wide">How the supplier confirmed<input name="note" placeholder="Email, call or portal message"></label>' +
      '<div class="wide actions"><button type="submit" class="ghost">Revalidate</button></div></form>';
  }

  // The technical reviewer marks each offer against the spec, then sends the recommendation to the Buyer.
  function techPanel(x) {
    var mine = App.role === x.techRole, who = P.roleLabel(x.techRole);
    var h = '<div class="note">Technical evaluation by ' + esc(who) + ". Each offer is checked against the spec before the Buyer compares prices. " +
      "Only offers marked acceptable can be recommended." + (mine ? " Prices are kept out of this view, so the check is on the spec alone." : "") + "</div>";
    if (!mine) return h + '<div class="note">Waiting for the ' + esc(who) + ". Switch roles at the top to do the evaluation.</div>";
    h += '<div class="wrap"><table><tr><th>Supplier</th><th>Offer</th><th>Result</th><th>Note for the Buyer</th><th></th></tr>' + x.quotes.map(function (q) {
      var t = q.tech || {};
      return '<tr><td>' + esc(App.supplier(q.supplierId).name) + "</td><td>" + q.leadDays + " days lead time" + (q.terms ? ", " + esc(q.terms) : "") + "</td>" +
        '<td colspan="3"><form data-form="rfxTech" data-id="' + x.id + '" data-sup="' + q.supplierId + '" class="techrow">' +
        '<select name="result"><option' + (t.result === "Acceptable" ? " selected" : "") + ">Acceptable</option><option" + (t.result === "Not acceptable" ? " selected" : "") + ">Not acceptable</option></select>" +
        '<input name="note" value="' + esc(t.note || "") + '" placeholder="Needed if not acceptable: what does not meet the spec">' +
        '<button type="submit" class="small' + (t.result ? " ghost" : "") + '">' + (t.result ? "Update" : "Save") + "</button>" +
        (t.result ? " " + App.pill(t.result, t.result === "Acceptable" ? "ok" : "bad") : "") + "</form></td></tr>";
    }).join("") + "</table></div>";
    var left = x.quotes.filter(function (q) { return !q.tech; }).length;
    return h + '<div class="actions"><button data-act="rfxTechSubmit" data-id="' + x.id + '"' + (left ? " disabled" : "") + ">Send to the Buyer</button>" +
      (left ? '<span class="hint">' + left + " offer" + (left === 1 ? "" : "s") + " still to evaluate.</span>" : "") + "</div>";
  }

  function chainPills(list, live) {
    return '<div class="chain">' + list.map(function (a, i) {
      var cur = live && list.find(function (z) { return z.status === "Pending"; }) === a;
      return App.pill((i + 1) + ". " + P.roleLabel(a.role) + ": " + (cur ? "waiting" : a.status.toLowerCase()), cur ? "info" : a.status === "Approved" ? "ok" : a.status === "Rejected" ? "bad" : "mut");
    }).join(" ") + "</div>";
  }

  // How the recommended offer compares with the next eligible one on the adjusted price, for the approver.
  function gapText(x, supId) {
    var ranked = P.scoreRFx(x, App.state, App.now()).filter(function (q) { return q.eligible; }), r = reqOf(x);
    var pick = ranked.find(function (q) { return q.supplierId === supId; }), other = ranked.find(function (q) { return q.supplierId !== supId; });
    if (!pick || !other) return "";
    var d = (other.adjusted - pick.adjusted) * r.qty;
    return "Adjusted price " + App.money(pick.adjusted) + " a unit. " + esc(App.supplier(other.supplierId).name) + " is " +
      (d >= 0 ? App.money(d) + " higher" : App.money(-d) + " lower") + " for the order on the same basis. ";
  }

  // The Buyer's recommendation, the approval chain, and the decision buttons for the approver whose turn it is.
  function approvalPanel(x) {
    var rec = x.recommendation, sp = App.supplier(rec.supplierId), step = x.awardApprovals.find(function (a) { return a.status === "Pending"; });
    var h = '<div class="note"><b>Recommended: ' + esc(sp.name) + "</b> for " + App.money(rec.value) + " landed. " +
      (rec.justification ? "Reason: " + esc(rec.justification) + ". " : "Lowest adjusted price among acceptable offers. ") + gapText(x, rec.supplierId) +
      (rec.reasons.length ? "Escalated to the Executive for: " + esc(rec.reasons.join(", ")) + "." : "") + "</div>" + chainPills(x.awardApprovals, true);
    if (App.role === step.role) {
      h += '<label class="hint" style="display:block;margin-top:10px">Comment (needed to reject)</label><textarea id="awardDecisionNote"></textarea>' +
        '<div class="actions"><button data-act="rfxDecide" data-decision="Approved" data-id="' + x.id + '">Approve award</button>' +
        '<button class="danger" data-act="rfxDecide" data-decision="Rejected" data-id="' + x.id + '">Reject, back to the Buyer</button></div>';
    } else h += '<div class="note">Waiting for the ' + esc(P.roleLabel(step.role)) + ". Switch roles at the top to decide.</div>";
    return h;
  }

  function detail(x) {
    var r = reqOf(x), it = App.item(r.itemId), buyer = App.role === "buyer";
    var h = '<div class="card"><h3>' + x.id + " (" + x.type + ") " + App.status(x.status) + App.recBtn(x.id) + App.itemBtn(it.id) + "</h3>" +
      '<p class="hint">For ' + esc(r.prNo) + ": " + r.qty + " x " + esc(it.name) + ", approved value " + App.money(P.requestTotal(r)) + ", need by " + r.needBy +
      (x.closeDate ? ". Bids close " + x.closeDate : "") + ".</p>" + App.itemLessonsNote(it.id) +
      '<div class="chain">' + x.invited.map(function (id) {
        var got = x.quotes.some(function (q) { return q.supplierId === id; });
        return App.pill(App.supplier(id).name + ": " + (got ? "quoted" : "no quote yet"), got ? "ok" : "mut");
      }).join(" ") + "</div>";
    if (x.soleReason) h += '<div class="note warn">Sole source reason: ' + esc(x.soleReason) + "</div>";

    if (x.status === "Open") {
      h += (x.quotes.length ? compareTable(x, false) + revalidateForm(x) : '<p class="empty">No quotes yet.</p>' + adjCard(x));
      if (buyer) {
        h += quoteForm(x) + '<div class="actions"><button class="ghost" data-act="rfxClose" data-id="' + x.id + '"' +
          (x.quotes.length ? "" : " disabled") + ">Close bidding and compare</button></div>";
      } else h += '<div class="note">Quotes are entered by the Buyer. Switch roles to continue.</div>';
    } else if (x.status === "Technical review") {
      // The reviewer judges the spec only, so prices stay out of their view, as in a two part bid. Everyone else sees the comparison.
      h += (App.role === x.techRole ? "" : compareTable(x, false)) + techPanel(x);
    } else if (x.status === "Evaluating") {
      var last = (x.pastRecommendations || []).slice(-1)[0];
      if (last) {
        var no = last.approvals.find(function (a) { return a.status === "Rejected"; });
        h += '<div class="note warn">The award to ' + esc(App.supplier(last.rec.supplierId).name) + " was rejected by the " + esc(P.roleLabel(no.role)) + ": " + esc(no.comment) + "</div>";
      }
      h += compareTable(x, buyer) + revalidateForm(x);
      if (buyer) {
        h += '<label class="hint" style="display:block;margin-top:10px">Justification (required for a conditional supplier, a single bid, or when not picking the lowest adjusted price. Any of these also sends the award to the Executive.)</label>' +
          '<textarea id="awardNote"></textarea>' +
          '<p class="hint">Recommend sends the award for approval: the Director, plus the Executive from ' + App.money(REF.thresholds.executive).replace(/\.00$/, "") + ".</p>";
      } else h += '<div class="note">The Buyer recommends the award. Then the Director, and for large or risky awards the Executive, approve it.</div>';
    } else if (x.status === "Award pending approval") {
      h += compareTable(x, false) + approvalPanel(x);
    } else {
      h += compareTable(x, false) + revalidateForm(x);
      var a = x.award;
      h += '<div class="note">Awarded to <b>' + esc(App.supplier(a.supplierId).name) + "</b>." + (a.justification ? " Justification: " + esc(a.justification) : "") + "</div>" +
        (a.approvals ? chainPills(a.approvals, false) : "");
      if (r.status === "Awarded") h += '<div class="actions"><button class="ghost" data-act="goto" data-arg="pos" data-id="' + r.id + '">Create the PO</button></div>';
      if (r.poId) h += '<div class="actions"><button class="ghost" data-act="goto" data-arg="pos" data-id="' + r.poId + '">View the PO</button></div>';
    }
    return h + "</div>";
  }

  App.views.rfx = function () {
    var s = App.state, buyer = App.role === "buyer";
    var html = "<h2>RFx</h2>";

    var waiting = s.requests.filter(function (r) { return r.status === "Approved"; });
    var newReq = App.sel.rfxNew && s.requests.find(function (r) { return r.id === App.sel.rfxNew && r.status === "Approved"; });
    if (newReq && buyer) html += startForm(newReq);
    if (waiting.length) {
      html += '<div class="card" style="margin-bottom:12px"><h3>Approved PRs waiting for sourcing</h3><div class="wrap" style="border:0"><table><tr><th>PR</th><th>Item</th><th class="num">Value</th><th>Need by</th><th></th></tr>' +
        waiting.map(function (r) {
          var it = App.item(r.itemId);
          return "<tr><td>" + r.prNo + "</td><td>" + esc(it.name) + '</td><td class="num">' + App.money(P.requestTotal(r)) + "</td><td>" + r.needBy + "</td><td>" +
            (buyer ? '<button class="small" data-act="goto" data-arg="rfx" data-id="' + r.id + '">Start RFx</button>' : '<span class="hint">Buyer starts this</span>') + "</td></tr>";
        }).join("") + "</table></div></div>";
    }

    var list = s.rfx.slice().sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    html += '<div class="wrap"><table><tr><th>RFx</th><th>Type</th><th>PR</th><th>Item</th><th>Quotes</th><th>Status</th></tr>' +
      (list.length ? list.map(function (x) {
        var r = reqOf(x);
        return '<tr class="clickable ' + (x.id === App.sel.rfx ? "sel" : "") + '" data-act="rfxSelect" data-id="' + x.id + '"><td>' + x.id + "</td><td>" + x.type + "</td><td>" + r.prNo +
          "</td><td>" + esc(App.item(r.itemId).name) + "</td><td>" + x.quotes.length + " of " + x.invited.length + "</td><td>" + App.status(x.status) + "</td></tr>";
      }).join("") : '<tr><td colspan="6" class="empty">No RFx yet.</td></tr>') + "</table></div>";

    var cur = s.rfx.find(function (x) { return x.id === App.sel.rfx; });
    html += '<div style="margin-top:12px">' + (cur ? detail(cur) : '<p class="hint">Select an RFx to see quotes and the comparison.</p>') + "</div>";
    return html;
  };
})();
