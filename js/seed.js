/* Demo data. Built by running the real workflow actions with backdated timestamps,
 * so every record in the seed obeys the same rules a live user would. All dates are
 * relative to today, so the demo never looks stale. Everything here is fictional. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./logic.js"));
  else root.P2P.seed = factory(root.P2P);
})(typeof self !== "undefined" ? self : this, function (P) {
  "use strict";

  return function seed(nowIso) {
    var today = P.dateOf(nowIso);
    var s = P.newState();
    var D = function (n) { return P.addDays(today, n); };
    var T = function (n, h) { return D(n) + "T" + String(h || 14).padStart(2, "0") + ":00:00.000Z"; };

    function req(off, who, itemId, qty, est, needOff, site, cc, reason) {
      return P.createRequest(s, "requester", T(off, 9), {
        requester: who, itemId: itemId, qty: qty, estUnit: est, needBy: D(needOff),
        site: site, costCenter: cc, reason: reason
      });
    }
    function approveAll(r, off) {
      var step;
      while ((step = r.approvals.find(function (a) { return a.status === "Pending"; }))) {
        P.decide(s, step.role, T(off, 11), r.id, "Approved", "Within budget and policy");
      }
    }
    function quote(x, off, sup, price, lead, terms, extra) {
      P.addQuote(s, "buyer", T(off, 10), x.id, Object.assign({ supplierId: sup, unitPrice: price, leadDays: lead, terms: terms || "" }, extra || {}));
    }
    // The technical reviewer for the item marks each offer. notOk maps a supplier to the reason its offer fails the spec.
    function techReview(x, off, notOk) {
      notOk = notOk || {};
      x.quotes.forEach(function (q) {
        var why = notOk[q.supplierId];
        P.techEvaluate(s, x.techRole, T(off, 15), x.id, q.supplierId, why ? "Not acceptable" : "Acceptable", why || "Meets the spec and drawing revision");
      });
      P.techSubmit(s, x.techRole, T(off, 16), x.id);
    }
    // The Buyer recommends, then each approver in the chain signs off.
    function awardTo(x, off, sup, why) {
      P.recommendAward(s, "buyer", T(off, 10), x.id, sup, why || "");
      var step;
      while ((step = x.status === "Award pending approval" && x.awardApprovals.find(function (a) { return a.status === "Pending"; }))) {
        P.decideAward(s, step.role, T(off, 15), x.id, "Approved", "Supplier choice and price are in line with the comparison");
      }
    }
    var W = { wPrice: 50, wLead: 25, wQuality: 25 };
    var rfxArgs = function (type, invited) { return Object.assign({ type: type, invited: invited }, W); };

    // Delivery history from before this workspace, as if brought in from the old system: promised and received dates.
    // Each list is how many days late (or early, below zero) each past delivery was.
    var history = { tidewater: [2, 4, 3, 5, 1, 3], northfield: [2, 1, 3, 2], atlas: [0, 0, 1, 0, -1], meridian: [0, 1, 0, 0], summit: [0, -2, 1] };
    Object.keys(history).forEach(function (sup) {
      history[sup].forEach(function (slip, i) {
        var promised = D(-260 + i * 30);
        s.deliveries.push({ supplierId: sup, ref: "Earlier order " + (i + 1), promised: promised, received: P.addDays(promised, slip) });
      });
    });

    // Rate contracts. Each is drafted by the Buyer and approved by the Director, plus the Executive from $50,000.
    function contract(off, f, approvers) {
      var c = P.createContract(s, "buyer", T(off), f);
      (approvers || ["director", "executive"]).forEach(function (role, i) {
        if (c.status === "Pending approval") P.decideContract(s, role, T(off + 1 + i), c.id, "Approved", "");
      });
      return c;
    }
    // CT-8001: MRO spares, about half used.
    contract(-200, { supplierId: "meridian", title: "MRO spares rate contract", cap: 9000, start: D(-200), end: D(165),
      basis: "Annual negotiation, rates held from last year",
      lines: [{ itemId: "MR-402", price: 9.10 }, { itemId: "MR-403", price: 5.90 }, { itemId: "MR-404", price: 92.00 }] });
    // CT-8002: technician labor. Ends within 60 days and is over 80% used, so the Buyer should renew it.
    contract(-150, { supplierId: "keystone", title: "Maintenance technician labor", cap: 30000, start: D(-150), end: D(40),
      basis: "Rate card agreed for the maintenance season", lines: [{ itemId: "SV-501", price: 66.00 }] });
    // CT-8003: scaffold rental. One release used the whole cap, so the next scaffold request needs normal sourcing.
    contract(-92, { supplierId: "ridgeway", title: "Scaffold rental for the line 2 rebuild", cap: 4950, start: D(-90), end: D(275),
      basis: "Fixed weekly rate for the rebuild", lines: [{ itemId: "SV-503", price: 495.00 }] });
    // CT-8004: crane hire for next year. $56,000, so the Director approved and it now waits for the Executive.
    contract(-3, { supplierId: "crestline", title: "Crane hire with operator, next year", cap: 56000, start: D(5), end: D(370),
      basis: "Quote CL-Q-0412 after crane days ran over budget", lines: [{ itemId: "SV-502", price: 1400.00 }] }, ["director"]);
    // CT-8005: instrument calibration. Waiting for the Director.
    contract(-1, { supplierId: "truegauge", title: "Gauge and instrument calibration", cap: 6000, start: D(1), end: D(366),
      basis: "Replaces calibration bought one order at a time", lines: [{ itemId: "SV-505", price: 42.00 }] }, []);

    // A. Extrusion profiles: awarded, PO placed, first partial delivery in. Delivery is tight against need date.
    var r = req(-30, "Maya Chen", "RM-101", 2000, 42, 14, "Pilot Line", "CC-100 Operations", "Production plan for line 2");
    approveAll(r, -27);
    var x = P.startRFx(s, "buyer", T(-26), r.id, rfxArgs("RFQ", ["northfield", "helio", "brightpath"]));
    quote(x, -24, "northfield", 41.5, 30, "Net 45, FCA plant");
    quote(x, -24, "helio", 40.8, 42, "Net 30");
    quote(x, -23, "brightpath", 44, 25, "Net 45");
    P.closeBidding(s, "buyer", T(-22), x.id);
    techReview(x, -22);
    awardTo(x, -21, "northfield");
    var po = P.createPO(s, "buyer", T(-20), r.id, {});
    P.confirmPO(s, "buyer", T(-19), po.id, D(10));
    P.postGRN(s, "warehouse", T(-1), po.id, { qty: 1200, result: "Accepted", note: "First truck. Count matches the shipping notice." });

    // B. Solvent: the full cycle, invoice matched first time and paid.
    r = req(-45, "Luis Romero", "RM-103", 12, 1450, -20, "Plant A", "CC-100 Operations", "Quarterly solvent replenishment");
    approveAll(r, -42);
    x = P.startRFx(s, "buyer", T(-41), r.id, rfxArgs("RFQ", ["cobaltridge", "northfield", "helio"]));
    quote(x, -40, "cobaltridge", 1415, 20, "Net 60");
    quote(x, -40, "northfield", 1460, 14, "Net 45");
    quote(x, -39, "helio", 1440, 25, "Net 30");
    P.closeBidding(s, "buyer", T(-38), x.id);
    techReview(x, -38);
    awardTo(x, -37, "northfield");
    po = P.createPO(s, "buyer", T(-36), r.id, {});
    P.confirmPO(s, "buyer", T(-35), po.id, D(-22));
    P.postGRN(s, "warehouse", T(-21), po.id, { qty: 12, result: "Accepted", note: "All drums sealed, certificates attached." });
    var inv = P.enterInvoice(s, "ap", T(-18), { poId: po.id, invNo: "NF-88421", qty: 12, unitPrice: 1460, date: D(-19) });
    P.payInvoice(s, "ap", T(-4), inv.id);

    // C. Laminate film rolls: delivered, sitting on quality hold.
    r = req(-16, "Aisha Khan", "PK-102", 20, 380, 5, "Pilot Line", "CC-400 Quality", "Trial lot for the new product pack");
    approveAll(r, -14);
    po = P.createPO(s, "buyer", T(-12), r.id, { supplierId: "summit", unitPrice: 385, leadDays: 10 });
    P.confirmPO(s, "buyer", T(-11), po.id, D(-2));
    P.postGRN(s, "warehouse", T(-2), po.id, { qty: 20, result: "Hold", note: "Film thickness out of spec on 3 rolls. Waiting for incoming inspection." });

    // D. Control boards: bids are in. Engineering found one offer off spec, and that bidder is not qualified anyway.
    //    Ready for the Buyer's award recommendation.
    r = req(-14, "Tom Becker", "CP-202", 40, 640, 40, "Plant B", "CC-200 Engineering", "Control board build for the pilot run");
    approveAll(r, -12);
    x = P.startRFx(s, "buyer", T(-10), r.id, rfxArgs("RFP", ["brightpath", "pinecrest", "orbit"]));
    quote(x, -8, "brightpath", 628, 21, "Net 45", { freight: 4 });
    quote(x, -7, "pinecrest", 610, 35, "Net 60", { tariffPct: 12, freight: 6 });
    quote(x, -7, "orbit", 590, 18, "Net 30", { tariffPct: 25 });
    P.closeBidding(s, "buyer", T(-2), x.id);
    techReview(x, -1, { orbit: "Board revision B offered. The spec calls for revision C with the added fuse." });

    // E. Support rails: RFQ open, only one quote back so far.
    r = req(-9, "Luis Romero", "CP-201", 500, 38, 45, "Field Service", "CC-300 Maintenance", "Warehouse racking expansion, rows 14 to 18");
    approveAll(r, -7);
    x = P.startRFx(s, "buyer", T(-5), r.id, rfxArgs("RFQ", ["sunarc", "helio", "tidewater"]));
    quote(x, -3, "sunarc", 36.9, 20, "Net 30", { validUntil: D(-1) });

    // F. Cable assemblies: waiting for the Director.
    r = req(-4, "Aisha Khan", "CP-301", 300, 76, 35, "Plant A", "CC-200 Engineering", "Prototype build, harness run");
    P.decide(s, "manager", T(-3), r.id, "Approved", "Budget confirmed");
    P.decide(s, "engineering", T(-2), r.id, "Approved", "Spec rev C is correct");

    // G. Brackets: fully approved, waiting for sourcing.
    r = req(-6, "Tom Becker", "CP-302", 800, 24.5, 25, "Plant B", "CC-100 Operations", "Pilot batch of brackets");
    approveAll(r, -4);

    // H. Bearings: contract buy, invoice price is wrong. Price exception owned by the Buyer.
    r = req(-18, "Maya Chen", "MR-402", 100, 9.4, -5, "Plant A", "CC-300 Maintenance", "Conveyor bearing replacement stock");
    approveAll(r, -17);
    po = P.createPO(s, "buyer", T(-16), r.id, { leadDays: 7 });
    P.confirmPO(s, "buyer", T(-15), po.id, D(-9));
    P.postGRN(s, "warehouse", T(-8), po.id, { qty: 100, result: "Accepted", note: "Box count verified." });
    P.enterInvoice(s, "ap", T(-3), { poId: po.id, invNo: "MM-20413", qty: 100, unitPrice: 9.4, date: D(-4) });

    // I. Gloves: contract buy, supplier billed more than was received. Quantity exception owned by Warehouse.
    r = req(-16, "Luis Romero", "MR-403", 300, 6.2, -4, "Plant A", "CC-300 Maintenance", "Monthly PPE restock");
    approveAll(r, -15);
    po = P.createPO(s, "buyer", T(-14), r.id, { leadDays: 5 });
    P.confirmPO(s, "buyer", T(-13), po.id, D(-9));
    P.postGRN(s, "warehouse", T(-6), po.id, { qty: 300, result: "Accepted", note: "Pallet received complete." });
    P.enterInvoice(s, "ap", T(-2), { poId: po.id, invNo: "MM-20477", qty: 320, unitPrice: 5.9, date: D(-3) });

    // J. Grease: the supplier promise date is later than the need date. Late.
    r = req(-11, "Maya Chen", "MR-404", 20, 96, 3, "Plant B", "CC-300 Maintenance", "Preventive maintenance cycle");
    approveAll(r, -10);
    po = P.createPO(s, "buyer", T(-9), r.id, { leadDays: 17 });
    P.confirmPO(s, "buyer", T(-8), po.id, D(8));

    // K. Connector kits: rejected by the Manager.
    r = req(-7, "Tom Becker", "CP-303", 150, 11.8, 20, "Plant B", "CC-200 Engineering", "Connector stock for harness build");
    P.decide(s, "manager", T(-5), r.id, "Rejected", "Existing stock covers three months. Use stock first.");

    // L. Seal kits: just raised, waiting for the Manager.
    req(0, "Aisha Khan", "MR-203", 6, 910, 40, "Field Service", "CC-300 Maintenance", "Pump overhaul, line 4");

    // M. Housings: RFP awarded, PO still to be created.
    r = req(-11, "Tom Becker", "CP-104", 60, 215, 30, "Pilot Line", "CC-200 Engineering", "Housings for the pack build");
    approveAll(r, -8);
    x = P.startRFx(s, "buyer", T(-7), r.id, rfxArgs("RFP", ["northfield", "helio", "brightpath"]));
    quote(x, -5, "northfield", 212, 28, "Net 45");
    quote(x, -5, "helio", 205, 40, "Net 30", { tariffPct: 12 });
    quote(x, -5, "brightpath", 219, 24, "Net 45");
    P.closeBidding(s, "buyer", T(-4), x.id);
    techReview(x, -4);
    awardTo(x, -3, "brightpath");

    // N. Fastener kits: direct buy from a qualified supplier, delivery at risk.
    r = req(-10, "Maya Chen", "MR-405", 40, 84, 4, "Plant A", "CC-300 Maintenance", "Shutdown maintenance kits");
    approveAll(r, -9);
    po = P.createPO(s, "buyer", T(-8), r.id, { supplierId: "atlas", unitPrice: 82.5, leadDays: 10 });
    P.confirmPO(s, "buyer", T(-7), po.id, D(2));

    // O. Technician man hours on a rate contract. The Requester records each month from the site log and the supplier's timesheets.
    //    Each month is over $5,000, so the Manager and then the Director release it. Two months are released and invoiced.
    //    The third is released by the Manager and waits for the Director, so its invoice sits in exception.
    var month = function (off) { return D(off).slice(0, 7); };
    r = req(-100, "Maya Chen", "SV-501", 400, 68, 60, "Plant A", "CC-300 Maintenance", "Breakdown and shutdown support, about 130 hours a month for a quarter");
    approveAll(r, -98);
    po = P.createPO(s, "buyer", T(-96), r.id, { leadDays: 3 });
    P.confirmPO(s, "buyer", T(-95), po.id, D(-92));
    var e = P.postService(s, "requester", T(-68), po.id, { qty: 96, period: month(-75), note: "Breakdown support on pumps and conveyors, 12 call outs, timesheets KFS-0811" });
    P.decideService(s, "manager", T(-67), e.id, "Accepted", "Hours match the work orders");
    P.decideService(s, "director", T(-66), e.id, "Accepted", "");
    inv = P.enterInvoice(s, "ap", T(-62), { poId: po.id, invNo: "KFS-2210", qty: 96, unitPrice: 66, date: D(-63) });
    P.payInvoice(s, "ap", T(-35), inv.id);
    e = P.postService(s, "requester", T(-38), po.id, { qty: 112, period: month(-45), note: "Planned shutdown, two technicians for seven days, timesheets KFS-0907" });
    P.decideService(s, "manager", T(-37), e.id, "Accepted", "Shutdown log signed off");
    P.decideService(s, "director", T(-36), e.id, "Accepted", "");
    P.enterInvoice(s, "ap", T(-30), { poId: po.id, invNo: "KFS-2246", qty: 112, unitPrice: 66, date: D(-31) });
    e = P.postService(s, "requester", T(-6), po.id, { qty: 88, period: month(-15), note: "Gearbox overhaul support and lubrication rounds, timesheets KFS-1004" });
    P.decideService(s, "manager", T(-4), e.id, "Accepted", "Checked against the gearbox work orders");
    P.enterInvoice(s, "ap", T(-2), { poId: po.id, invNo: "KFS-2291", qty: 88, unitPrice: 66, date: D(-3) });

    // P. Crane hire with operator, billed per day. Each entry is under $5,000, so the Manager alone releases it.
    //    Five of six days used, so the PO is near its limit. Not invoiced yet.
    r = req(-35, "Tom Becker", "SV-502", 6, 1450, 20, "Plant B", "CC-300 Maintenance", "Lift the new heat exchanger and remove the old fan housing");
    approveAll(r, -33);
    po = P.createPO(s, "buyer", T(-31), r.id, { supplierId: "crestline", unitPrice: 1450, leadDays: 4 });
    P.confirmPO(s, "buyer", T(-30), po.id, D(-27));
    e = P.postService(s, "requester", T(-20), po.id, { qty: 3, period: month(-21), note: "Set the heat exchanger on its plinth, 3 days with operator and rigger" });
    P.decideService(s, "manager", T(-19), e.id, "Accepted", "Lift done, permit closed");
    e = P.postService(s, "requester", T(-8), po.id, { qty: 2, period: month(-9), note: "Removed the old fan housing, 2 days" });
    P.decideService(s, "manager", T(-7), e.id, "Accepted", "Housing removed and scrapped");

    // Q. Scaffold for the line 2 rebuild, released from CT-8003. It uses the whole cap.
    r = req(-62, "Tom Becker", "SV-503", 10, 520, 20, "Plant A", "CC-100 Operations", "Scaffold around the line 2 conveyor for the rebuild");
    approveAll(r, -61);
    po = P.createPO(s, "buyer", T(-60), r.id, { leadDays: 2 });
    P.confirmPO(s, "buyer", T(-59), po.id, D(-58));

    // R. Projects. A project groups the requests that must come together by one date. Most buying has no project.
    var byReason = function (txt) { return s.requests.find(function (q) { return q.reason.indexOf(txt) === 0; }); };
    var project = function (off, f, reqs) {
      var p = P.createProject(s, "requester", T(off), f);
      reqs.forEach(function (q, i) { P.linkToProject(s, "requester", T(off, 15 + i), q.id, p.id); });
      return p;
    };
    // PRJ-9001: the pump overhaul. The seal kit is promised after the target date, so it holds the whole job up.
    var pump = project(-9, { name: "Line 2 pump P-204 overhaul", target: D(12), criticality: "High", costPerDay: 4200, owner: "Tom Becker", site: "Plant A",
      note: "Cooling water pump. Line 2 cannot run without it." }, [byReason("Conveyor bearing replacement stock")]);
    r = req(-8, "Tom Becker", "MR-203", 1, 910, 10, "Plant A", "CC-300 Maintenance", "Seal kit for pump P-204 overhaul");
    r.projectId = pump.id; approveAll(r, -8);
    po = P.createPO(s, "buyer", T(-7), r.id, { supplierId: "tidewater", unitPrice: 910, leadDays: 21 });
    P.confirmPO(s, "buyer", T(-6), po.id, D(14));
    r = req(-8, "Tom Becker", "MR-401", 4, 58, 10, "Plant A", "CC-300 Maintenance", "Discharge hoses for pump P-204");
    r.projectId = pump.id; approveAll(r, -7);
    po = P.createPO(s, "buyer", T(-6), r.id, { supplierId: "atlas", unitPrice: 58, leadDays: 11 });
    P.confirmPO(s, "buyer", T(-5), po.id, D(5));
    r = req(-7, "Tom Becker", "SV-502", 1, 1450, 10, "Plant A", "CC-300 Maintenance", "Crane to lift pump P-204 out and back");
    r.projectId = pump.id; approveAll(r, -6);
    po = P.createPO(s, "buyer", T(-5), r.id, { supplierId: "crestline", unitPrice: 1450, leadDays: 15 });
    P.confirmPO(s, "buyer", T(-4), po.id, D(10));
    r = req(-2, "Tom Becker", "SV-501", 24, 66, 10, "Plant A", "CC-300 Maintenance", "Fitters for the pump P-204 overhaul");
    r.projectId = pump.id;   // waits for the Manager
    // PRJ-9002 to PRJ-9005: existing demo records grouped by the work they serve.
    project(-60, { name: "Line 2 conveyor rebuild and restart", target: D(20), criticality: "High", owner: "Maya Chen", site: "Plant A" },
      [byReason("Scaffold around the line 2 conveyor"), byReason("Production plan for line 2")]);
    project(-40, { name: "November shutdown maintenance", target: D(14), criticality: "Medium", owner: "Tom Becker", site: "Plant B" },
      [byReason("Shutdown maintenance kits"), byReason("Preventive maintenance cycle"), byReason("Lift the new heat exchanger"), byReason("Breakdown and shutdown support")]);
    project(-30, { name: "New product pack launch", target: D(25), criticality: "Medium", owner: "Maya Chen", site: "Pilot Line",
      note: "Customer launch date is fixed." }, [byReason("Trial lot for the new product pack"), byReason("Housings for the pack build")]);
    project(-20, { name: "Pilot run, control board build", target: D(45), criticality: "Low", owner: "Maya Chen", site: "Pilot Line" },
      [byReason("Control board build for the pilot run"), byReason("Prototype build, harness run"), byReason("Pilot batch of brackets")]);

    // Supplier documents. Set last, so the demo records above were built while every document was valid.
    P.REF.suppliers.forEach(function (sp, i) {
      ["quality", "origin", "subtier"].forEach(function (k, j) { s.docs[sp.id][k] = D(120 + ((i * 7 + j * 5) * 29) % 260); });
    });
    s.docs.cobaltridge.subtier = D(-9);   // expired: blocks new awards and POs for raw material and component items
    s.docs.kestrel.origin = D(-20);       // expired
    s.docs.sunarc.quality = D(12);        // expiring soon: warning only
    s.docs.pinecrest.subtier = D(18);     // expiring soon: warning only

    return s;
  };
});
