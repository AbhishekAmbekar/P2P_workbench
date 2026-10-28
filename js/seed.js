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
    var W = { wPrice: 50, wLead: 25, wQuality: 25 };
    var rfxArgs = function (type, invited) { return Object.assign({ type: type, invited: invited }, W); };

    // A. Extrusion profiles: awarded, PO placed, first partial delivery in. Delivery is tight against need date.
    var r = req(-30, "Maya Chen", "RM-101", 2000, 42, 14, "Pilot Line", "CC-100 Operations", "Production plan for line 2");
    approveAll(r, -27);
    var x = P.startRFx(s, "buyer", T(-26), r.id, rfxArgs("RFQ", ["northfield", "helio", "brightpath"]));
    quote(x, -24, "northfield", 41.5, 30, "Net 45, FCA plant");
    quote(x, -24, "helio", 40.8, 42, "Net 30");
    quote(x, -23, "brightpath", 44, 25, "Net 45");
    P.closeBidding(s, "buyer", T(-22), x.id);
    P.award(s, "buyer", T(-21), x.id, "northfield", "");
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
    P.award(s, "buyer", T(-37), x.id, "northfield", "");
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

    // D. Control boards: bids are in, one bidder is not qualified. Ready to award.
    r = req(-14, "Tom Becker", "CP-202", 40, 640, 40, "Plant B", "CC-200 Engineering", "Control board build for the pilot run");
    approveAll(r, -12);
    x = P.startRFx(s, "buyer", T(-10), r.id, rfxArgs("RFP", ["brightpath", "pinecrest", "orbit"]));
    quote(x, -8, "brightpath", 628, 21, "Net 45", { freight: 4 });
    quote(x, -7, "pinecrest", 610, 35, "Net 60", { tariffPct: 12, freight: 6 });
    quote(x, -7, "orbit", 590, 18, "Net 30", { tariffPct: 25 });
    P.closeBidding(s, "buyer", T(-2), x.id);

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
    P.award(s, "buyer", T(-3), x.id, "brightpath", "");

    // N. Fastener kits: direct buy from a qualified supplier, delivery at risk.
    r = req(-10, "Maya Chen", "MR-405", 40, 84, 4, "Plant A", "CC-300 Maintenance", "Shutdown maintenance kits");
    approveAll(r, -9);
    po = P.createPO(s, "buyer", T(-8), r.id, { supplierId: "atlas", unitPrice: 82.5, leadDays: 10 });
    P.confirmPO(s, "buyer", T(-7), po.id, D(2));

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
