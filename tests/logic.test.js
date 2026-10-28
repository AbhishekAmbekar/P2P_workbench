/* Run with: node tests/logic.test.js */
const assert = require("assert");
const P = require("../js/logic.js");
const seed = require("../js/seed.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok    " + name); }
  catch (e) { failed++; console.log("FAIL  " + name + "\n      " + e.message); }
}
function throwsWith(fn, text) {
  try { fn(); } catch (e) {
    assert.ok(e.message.indexOf(text) >= 0, "Expected error containing '" + text + "' but got '" + e.message + "'");
    return;
  }
  assert.fail("Expected an error containing '" + text + "' but nothing was thrown");
}

const NOW = "2026-10-26T14:00:00.000Z";
const day = n => P.addDays("2026-10-26", n);
const at = n => day(n) + "T14:00:00.000Z";

function baseReq(s, over) {
  return P.createRequest(s, "requester", NOW, Object.assign({
    requester: "Test", itemId: "MR-405", qty: 10, estUnit: 84, needBy: day(20),
    site: "Plant A", costCenter: "CC-300 Maintenance", reason: "Test request"
  }, over || {}));
}
function approveAll(s, r) {
  let st;
  while ((st = r.approvals.find(a => a.status === "Pending"))) P.decide(s, st.role, NOW, r.id, "Approved", "ok");
}
const W = { wPrice: 50, wLead: 25, wQuality: 25 };

// ---------- 1. request and approvals ----------
test("approval chain follows value tiers and category checks", () => {
  const s = P.newState();
  const small = baseReq(s, { costCenter: "CC-100 Operations" });          // $840, MRO
  assert.deepStrictEqual(small.approvals.map(a => a.role), ["manager"]);
  const mid = baseReq(s, { itemId: "PK-102", qty: 20, estUnit: 380, costCenter: "CC-200 Engineering" });    // $7,600, quality item
  assert.deepStrictEqual(mid.approvals.map(a => a.role), ["manager", "quality", "director"]);
  const big = baseReq(s, { itemId: "RM-101", qty: 2000, estUnit: 42, costCenter: "CC-100 Operations" });   // $84,000
  assert.deepStrictEqual(big.approvals.map(a => a.role), ["manager", "quality", "director", "executive"]);
  const elec = baseReq(s, { itemId: "CP-202", qty: 10, estUnit: 640, costCenter: "CC-200 Engineering" });   // $6,400, engineering item
  assert.deepStrictEqual(elec.approvals.map(a => a.role), ["manager", "engineering", "director"]);
});

test("approvals must happen in order by the right role", () => {
  const s = P.newState();
  const r = baseReq(s, { itemId: "PK-102", qty: 20, estUnit: 380 });
  throwsWith(() => P.decide(s, "director", NOW, r.id, "Approved", ""), "next approval belongs to the Manager");
  P.decide(s, "manager", NOW, r.id, "Approved", "");
  throwsWith(() => P.decide(s, "manager", NOW, r.id, "Approved", ""), "belongs to the Quality");
  P.decide(s, "quality", NOW, r.id, "Approved", "");
  P.decide(s, "director", NOW, r.id, "Approved", "");
  assert.strictEqual(r.status, "Approved");
  assert.ok(/^PR-\d+$/.test(r.prNo));
});

test("only the requester can raise requests, and validation catches bad input", () => {
  const s = P.newState();
  throwsWith(() => P.createRequest(s, "buyer", NOW, {}), "cannot do this");
  throwsWith(() => baseReq(s, { qty: 0 }), "Quantity");
  throwsWith(() => baseReq(s, { qty: 2.5 }), "Quantity");
  throwsWith(() => baseReq(s, { needBy: day(-1) }), "past");
  throwsWith(() => baseReq(s, { reason: "x" }), "reason");
});

test("rejection needs a reason and ends the request", () => {
  const s = P.newState();
  const r = baseReq(s);
  throwsWith(() => P.decide(s, "manager", NOW, r.id, "Rejected", ""), "reason");
  P.decide(s, "manager", NOW, r.id, "Rejected", "Use existing stock first");
  assert.strictEqual(r.status, "Rejected");
  throwsWith(() => P.decide(s, "manager", NOW, r.id, "Approved", ""), "not waiting");
});

// ---------- 2. RFx ----------
function rfxFixture() {
  const s = P.newState();
  const r = baseReq(s, { itemId: "CP-104", qty: 60, estUnit: 215 });   // $12,900
  approveAll(s, r);
  return { s, r };
}

test("RFx needs two suppliers or a sole source reason, and weights must total 100", () => {
  const { s, r } = rfxFixture();
  throwsWith(() => P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["northfield"] }, W)), "two suppliers");
  throwsWith(() => P.startRFx(s, "buyer", NOW, r.id, { type: "RFQ", invited: ["northfield", "helio"], wPrice: 50, wLead: 50, wQuality: 50 }), "add up to 100");
  throwsWith(() => P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["northfield", "meridian"] }, W)), "does not supply");
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["northfield"], soleReason: "Only qualified source for this enclosure" }, W));
  assert.strictEqual(x.status, "Open");
  assert.strictEqual(r.status, "Sourcing");
});

test("scoring ranks by weighted price, lead time and supplier quality", () => {
  const { s, r } = rfxFixture();
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFP", invited: ["northfield", "helio", "brightpath"] }, W));
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 212, leadDays: 28 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 205, leadDays: 40 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "brightpath", unitPrice: 219, leadDays: 24 });
  const ranked = P.scoreRFx(x);
  assert.strictEqual(ranked[0].supplierId, "brightpath");
  assert.strictEqual(ranked[2].supplierId, "helio");
  assert.ok(ranked[0].total > ranked[1].total);
});

test("award rules: bidding must close, unqualified blocked, off ranking needs justification", () => {
  const { s, r } = rfxFixture();
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFP", invited: ["northfield", "helio", "orbit"] }, W));
  throwsWith(() => P.closeBidding(s, "buyer", NOW, x.id), "No quotes");
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 212, leadDays: 28 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 205, leadDays: 40 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "orbit", unitPrice: 150, leadDays: 10 });
  throwsWith(() => P.award(s, "buyer", NOW, x.id, "northfield", ""), "Close bidding");
  P.closeBidding(s, "buyer", NOW, x.id);
  throwsWith(() => P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 1, leadDays: 1 }), "closed");
  throwsWith(() => P.award(s, "buyer", NOW, x.id, "orbit", "cheapest by far"), "not qualified");
  const top = P.scoreRFx(x).filter(q => q.eligible)[0].supplierId;
  const other = top === "northfield" ? "helio" : "northfield";
  throwsWith(() => P.award(s, "buyer", NOW, x.id, other, ""), "justification");
  P.award(s, "buyer", NOW, x.id, top, "");
  assert.strictEqual(x.status, "Awarded");
  assert.strictEqual(r.status, "Awarded");
});

test("conditional supplier and single bid both need a justification", () => {
  const s = P.newState();
  const r = baseReq(s, { itemId: "CP-301", qty: 200, estUnit: 76 });  // $15,200
  approveAll(s, r);
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["kestrel", "northfield"] }, W));
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "kestrel", unitPrice: 70, leadDays: 20 });
  P.closeBidding(s, "buyer", NOW, x.id);
  throwsWith(() => P.award(s, "buyer", NOW, x.id, "kestrel", ""), "conditional supplier, only one bid");
  P.award(s, "buyer", NOW, x.id, "kestrel", "Only bidder, extra incoming inspection planned");
  assert.strictEqual(x.award.supplierId, "kestrel");
});

// ---------- 3. PO policy ----------
test("direct PO: contract buys allowed, large uncontracted buys blocked, supplier must be qualified", () => {
  const s = P.newState();
  const contract = baseReq(s, { itemId: "MR-402", qty: 100, estUnit: 9.4 });
  approveAll(s, contract);
  const po = P.createPO(s, "buyer", NOW, contract.id, {});
  assert.strictEqual(po.source, "Contract");
  assert.strictEqual(po.unitPrice, 9.1);

  const large = baseReq(s, { itemId: "MR-401", qty: 300, estUnit: 58 });  // $17,400
  approveAll(s, large);
  throwsWith(() => P.createPO(s, "buyer", NOW, large.id, { supplierId: "tidewater", unitPrice: 58 }), "need an RFx");

  const small = baseReq(s, { itemId: "MR-401", qty: 20, estUnit: 58 });
  approveAll(s, small);
  throwsWith(() => P.createPO(s, "buyer", NOW, small.id, { supplierId: "orbit", unitPrice: 58 }), "does not supply");
  throwsWith(() => P.createPO(s, "buyer", NOW, small.id, { supplierId: "pinecrest", unitPrice: 58 }), "does not supply");
  const ok = P.createPO(s, "buyer", NOW, small.id, { supplierId: "tidewater", unitPrice: 58, leadDays: 5 });
  assert.strictEqual(ok.promisedDate, day(5));
});

test("PO cannot run more than 10 percent over the approved PR value", () => {
  const s = P.newState();
  const r = baseReq(s, { itemId: "MR-405", qty: 40, estUnit: 84 });
  approveAll(s, r);
  throwsWith(() => P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 95 }), "10% above");
  const po = P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 92 });
  assert.strictEqual(po.unitPrice, 92);
  assert.strictEqual(r.status, "Ordered");
  throwsWith(() => P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 80 }), "must be approved");
});

test("only the buyer controls POs", () => {
  const s = P.newState();
  const r = baseReq(s);
  approveAll(s, r);
  throwsWith(() => P.createPO(s, "warehouse", NOW, r.id, { supplierId: "atlas", unitPrice: 84 }), "cannot do this");
});

test("clear to build status uses promise date against need date", () => {
  const s = P.newState();
  const r = baseReq(s, { needBy: day(10) });
  approveAll(s, r);
  const po = P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 84, leadDays: 3 });
  assert.strictEqual(P.ctb(s, po).status, "Clear");
  P.updatePromise(s, "buyer", NOW, po.id, day(8), "Supplier slipped a few days");
  assert.strictEqual(P.ctb(s, po).status, "At Risk");
  P.updatePromise(s, "buyer", NOW, po.id, day(12), "Material shortage at supplier");
  assert.strictEqual(P.ctb(s, po).status, "Late");
  throwsWith(() => P.updatePromise(s, "buyer", NOW, po.id, day(13), ""), "note");
});

// ---------- 4. receipts ----------
function poFixture() {
  const s = P.newState();
  const r = baseReq(s, { itemId: "MR-405", qty: 40, estUnit: 84 });
  approveAll(s, r);
  const po = P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 82.5, leadDays: 5 });
  return { s, r, po };
}

test("receipts: partial, over receipt blocked, rejected units do not count", () => {
  const { s, po } = poFixture();
  assert.strictEqual(P.poStatus(s, po), "Issued");
  throwsWith(() => P.postGRN(s, "buyer", NOW, po.id, { qty: 5, result: "Accepted" }), "cannot do this");
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 25, result: "Accepted" });
  assert.strictEqual(P.poStatus(s, po), "Partially received");
  throwsWith(() => P.postGRN(s, "warehouse", NOW, po.id, { qty: 20, result: "Accepted" }), "Over receipt");
  throwsWith(() => P.postGRN(s, "warehouse", NOW, po.id, { qty: 5, result: "Rejected", note: "" }), "note");
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 5, result: "Rejected", note: "Damaged in transit" });
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 15, result: "Accepted" });
  assert.strictEqual(P.poStatus(s, po), "Received");
  assert.strictEqual(P.ctb(s, po).status, "Delivered");
});

test("quality hold: counts against the PO until Quality releases it", () => {
  const { s, po } = poFixture();
  const g = P.postGRN(s, "warehouse", NOW, po.id, { qty: 40, result: "Hold", note: "Waiting for incoming inspection" });
  assert.strictEqual(P.poStatus(s, po), "Quality hold");
  throwsWith(() => P.releaseHold(s, "warehouse", NOW, g.id, "Accepted", "fine"), "cannot do this");
  throwsWith(() => P.releaseHold(s, "quality", NOW, g.id, "Accepted", ""), "inspection result");
  P.releaseHold(s, "quality", NOW, g.id, "Accepted", "Passed inspection, all within spec");
  assert.strictEqual(P.poStatus(s, po), "Received");
});

// ---------- 5. invoices ----------
test("exact match: a clean invoice matches and can be paid, closing the PO", () => {
  const { s, po } = poFixture();
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 40, result: "Accepted" });
  const inv = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "A-1", qty: 40, unitPrice: 82.5, date: day(0) });
  assert.strictEqual(inv.status, "Matched");
  assert.strictEqual(inv.firstPass, true);
  assert.strictEqual(inv.dueDate, day(30));
  throwsWith(() => P.payInvoice(s, "warehouse", NOW, inv.id), "cannot do this");
  P.payInvoice(s, "ap", NOW, inv.id);
  assert.strictEqual(inv.status, "Paid");
  assert.strictEqual(P.poStatus(s, po), "Closed");
});

test("exact match: any gap is an exception with a named owner", () => {
  const { s, po } = poFixture();
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 40, result: "Accepted" });
  const price = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "A-2", qty: 40, unitPrice: 82.51, date: day(0) });
  assert.strictEqual(price.status, "Exception");
  assert.deepStrictEqual(price.match.issues.map(i => i.code), ["PRICE"]);
  assert.deepStrictEqual(P.invOwners(price), ["buyer"]);
  const over = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "A-3", qty: 41, unitPrice: 82.5, date: day(0) });
  assert.deepStrictEqual(over.match.issues.map(i => i.code), ["QTY_OVER"]);
  assert.deepStrictEqual(P.invOwners(over), ["warehouse"]);
  const under = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "A-4", qty: 39, unitPrice: 82.5, date: day(0) });
  assert.deepStrictEqual(under.match.issues.map(i => i.code), ["QTY_UNDER"]);
  const dup = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "a-2", qty: 40, unitPrice: 82.5, date: day(0) });
  assert.ok(dup.match.issues.some(i => i.code === "DUPLICATE"));
});

test("no receipt: invoice is blocked and the quality hold is mentioned", () => {
  const { s, po } = poFixture();
  const none = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "B-1", qty: 40, unitPrice: 82.5, date: day(0) });
  assert.deepStrictEqual(none.match.issues.map(i => i.code), ["NO_RECEIPT"]);
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 40, result: "Hold", note: "Waiting for inspection" });
  const held = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "B-2", qty: 40, unitPrice: 82.5, date: day(0) });
  assert.ok(held.match.issues[0].msg.indexOf("quality hold") >= 0);
});

test("fixing the cause and re-running the match clears an exception", () => {
  const { s, po } = poFixture();
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 40, result: "Accepted" });
  const inv = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "C-1", qty: 40, unitPrice: 85, date: day(0) });
  assert.strictEqual(inv.status, "Exception");
  P.rerunMatch(s, "ap", NOW, inv.id);
  assert.strictEqual(inv.status, "Exception");
  throwsWith(() => P.amendPOPrice(s, "ap", NOW, po.id, 85, "Supplier raw material surcharge agreed"), "cannot do this");
  throwsWith(() => P.amendPOPrice(s, "buyer", NOW, po.id, 85, ""), "Explain");
  P.amendPOPrice(s, "buyer", NOW, po.id, 85, "Supplier raw material surcharge agreed in writing");
  P.rerunMatch(s, "ap", NOW, inv.id);
  assert.strictEqual(inv.status, "Matched");
  assert.strictEqual(inv.firstPass, false);
});

test("a partial invoice only matches what is accepted and not yet invoiced", () => {
  const { s, po } = poFixture();
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 15, result: "Accepted" });
  const a = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "D-1", qty: 15, unitPrice: 82.5, date: day(0) });
  assert.strictEqual(a.status, "Matched");
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 25, result: "Accepted" });
  const b = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "D-2", qty: 40, unitPrice: 82.5, date: day(0) });
  assert.deepStrictEqual(b.match.issues.map(i => i.code), ["QTY_OVER"]);
  const c = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "D-3", qty: 25, unitPrice: 82.5, date: day(0) });
  assert.strictEqual(c.status, "Matched");
});

test("rejecting an invoice needs a reason and frees the invoice number", () => {
  const { s, po } = poFixture();
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 40, result: "Accepted" });
  const bad = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "E-1", qty: 50, unitPrice: 82.5, date: day(0) });
  throwsWith(() => P.rejectInvoice(s, "ap", NOW, bad.id, ""), "reason");
  P.rejectInvoice(s, "ap", NOW, bad.id, "Over billed. Asked supplier for a corrected invoice.");
  assert.strictEqual(bad.status, "Rejected");
  const good = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "E-1", qty: 40, unitPrice: 82.5, date: day(0) });
  assert.strictEqual(good.status, "Matched");
});

// ---------- seed and metrics ----------
test("seed builds without breaking any rule and covers every stage", () => {
  const s = seed(NOW);
  const m = P.metrics(s, NOW);
  assert.strictEqual(s.requests.length, 14);
  assert.ok(m.pending >= 2, "pending approvals");
  assert.ok(m.awaitingSourcing >= 1, "awaiting sourcing");
  assert.ok(s.rfx.some(x => x.status === "Open"));
  assert.ok(s.rfx.some(x => x.status === "Evaluating"));
  assert.ok(s.rfx.some(x => x.status === "Awarded"));
  assert.ok(s.grns.some(g => g.result === "Hold"));
  assert.strictEqual(m.exceptions, 2);
  assert.strictEqual(m.paid, 1);
  assert.ok(m.ctb.Late >= 1 && m.ctb["At Risk"] >= 1 && m.ctb.Clear >= 0);
  assert.ok(m.cycleDays > 0);
  assert.ok(s.requests.some(r => r.status === "Rejected"));
});

test("seed exceptions have the expected owners", () => {
  const s = seed(NOW);
  const owners = s.invoices.filter(i => i.status === "Exception").map(i => P.invOwners(i)[0]).sort();
  assert.deepStrictEqual(owners, ["buyer", "warehouse"]);
});

test("queues point each role at its own work", () => {
  const s = seed(NOW);
  const labels = role => P.queueFor(s, role).map(q => q.label);
  assert.ok(labels("buyer").some(l => l.indexOf("waiting for sourcing") >= 0));
  assert.ok(labels("quality").some(l => l.indexOf("quality hold") >= 0));
  assert.ok(labels("director").some(l => l.indexOf("approval") >= 0));
  assert.ok(labels("ap").some(l => l.indexOf("Invoice exceptions") >= 0) === false); // AP owns none in the seed
  assert.ok(labels("warehouse").some(l => l.indexOf("receipt check") >= 0));
});

test("the seed stays valid when generated on any day", () => {
  ["2026-01-31", "2027-03-01", "2028-02-29"].forEach(d => assert.doesNotThrow(() => seed(d + "T14:00:00.000Z")));
});


// ---------- budgets ----------
test("a request that takes a cost center past its budget adds the Executive and says why", () => {
  const s = P.newState();
  const ok = baseReq(s, { itemId: "PK-102", qty: 20, estUnit: 380, costCenter: "CC-400 Quality" });   // $7,600 of $25,000
  assert.strictEqual(ok.overBudget, false);
  assert.ok(!ok.approvals.some(a => a.role === "executive"));
  const over = baseReq(s, { itemId: "RM-103", qty: 12, estUnit: 1450, costCenter: "CC-400 Quality" }); // +$17,400 = $25,000 exactly
  assert.strictEqual(over.overBudget, false, "exactly at budget is not over");
  const past = baseReq(s, { itemId: "MR-405", qty: 10, estUnit: 84, costCenter: "CC-400 Quality" });  // pushes it past
  assert.strictEqual(past.overBudget, true);
  assert.deepStrictEqual(past.approvals.map(a => a.role), ["manager", "executive"]);
  assert.ok(s.audit.some(a => a.entity === past.id && a.note.indexOf("Over budget") >= 0));
});

test("budget status separates paid, ordered, requested and remaining", () => {
  const s = seed(NOW);
  const by = {}; P.budgetStatus(s).forEach(b => { by[b.name] = b; });
  const c1 = by["CC-100 Operations"];
  assert.strictEqual(c1.paid, 17520);
  assert.strictEqual(c1.orderedOpen, 83000);
  assert.strictEqual(c1.requested, 19600);
  assert.strictEqual(c1.remaining, 29880);
  assert.strictEqual(c1.pct, 80);
  assert.strictEqual(by["CC-200 Engineering"].requested, 61540);   // includes the awarded RFx at its quoted value
  assert.strictEqual(by["CC-300 Maintenance"].pct, 81);
  assert.strictEqual(by["CC-400 Quality"].orderedOpen, 7700);
  P.budgetStatus(s).forEach(b => assert.strictEqual(b.used + b.remaining, b.budget));
});

test("rejected and cancelled requests release their budget", () => {
  const s = P.newState();
  const r = baseReq(s, { costCenter: "CC-400 Quality" });
  const before = P.budgetStatus(s).find(b => b.name === "CC-400 Quality").requested;
  assert.strictEqual(before, 840);
  P.decide(s, "manager", NOW, r.id, "Rejected", "Not needed this quarter");
  assert.strictEqual(P.budgetStatus(s).find(b => b.name === "CC-400 Quality").requested, 0);
});

// ---------- landed cost ----------
test("a tariff can change the winner: the cheaper sticker price loses on landed cost", () => {
  const { s, r } = rfxFixture();
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["northfield", "helio"] }, W));
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 200, leadDays: 20, tariffPct: 30 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 230, leadDays: 20 });
  const ranked = P.scoreRFx(x, s, NOW);
  assert.strictEqual(ranked[0].supplierId, "helio");
  assert.strictEqual(ranked.find(q => q.supplierId === "northfield").landed, 260);
  throwsWith(() => P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 230, leadDays: 20, tariffPct: 150 }), "between 0 and 100");
  throwsWith(() => P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 230, leadDays: 20, freight: -1 }), "Freight");
});

test("tariff and freight carry into the PO, its landed value and the budget", () => {
  const s = P.newState();
  const r = baseReq(s, { qty: 10, estUnit: 90, costCenter: "CC-100 Operations" });   // $900 approved
  approveAll(s, r);
  const po = P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 80, tariffPct: 10, freight: 2, leadDays: 5 });
  assert.strictEqual(po.unitPrice, 80);
  assert.strictEqual(P.poTotal(po), 800);        // invoices match on the supplier price
  assert.strictEqual(P.poLanded(po), 900);       // 80 x 1.10 + 2 = 90 per unit
  assert.strictEqual(P.budgetStatus(s).find(b => b.name === "CC-100 Operations").ordered, 900);
});

// ---------- quote validity ----------
test("a quote cannot be entered already expired, and an expired quote cannot be awarded until revalidated", () => {
  const { s, r } = rfxFixture();
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["northfield", "helio"] }, W));
  throwsWith(() => P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 200, leadDays: 20, validUntil: day(-1) }), "in the past");
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 200, leadDays: 20, validUntil: day(1) });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 230, leadDays: 25, validUntil: day(30) });
  P.closeBidding(s, "buyer", NOW, x.id);
  const later = at(5);
  assert.strictEqual(P.scoreRFx(x, s, later).find(q => q.supplierId === "northfield").expired, true);
  throwsWith(() => P.award(s, "buyer", later, x.id, "northfield", ""), "expired on");
  throwsWith(() => P.extendQuote(s, "requester", later, x.id, "northfield", day(20), "Confirmed by email"), "cannot do this");
  throwsWith(() => P.extendQuote(s, "buyer", later, x.id, "northfield", day(20), ""), "how the supplier confirmed");
  throwsWith(() => P.extendQuote(s, "buyer", later, x.id, "northfield", day(1), "Confirmed by email"), "in the past");
  throwsWith(() => P.extendQuote(s, "buyer", later, x.id, "helio", day(10), "Confirmed by email"), "later than");
  P.extendQuote(s, "buyer", later, x.id, "northfield", day(20), "Confirmed by email");
  P.award(s, "buyer", later, x.id, "northfield", "");
  assert.strictEqual(x.status, "Awarded");
});

test("an awarded quote that lapses before the PO blocks the PO until revalidated", () => {
  const { s, r } = rfxFixture();
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["northfield", "helio"] }, W));
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 200, leadDays: 20, validUntil: day(2) });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 230, leadDays: 25, validUntil: day(2) });
  P.closeBidding(s, "buyer", NOW, x.id);
  P.award(s, "buyer", NOW, x.id, "northfield", "");
  throwsWith(() => P.createPO(s, "buyer", at(6), r.id, {}), "expired on");
  P.extendQuote(s, "buyer", at(6), x.id, "northfield", day(15), "Supplier agreed by phone");
  assert.ok(P.createPO(s, "buyer", at(6), r.id, {}).id);
});

// ---------- supplier documents ----------
test("an expired document blocks an award, and Quality renewing it unblocks it", () => {
  const { s, r } = rfxFixture();                                   // CP-104 is a component, so all three documents count
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["northfield", "helio"] }, W));
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 200, leadDays: 20 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 230, leadDays: 25 });
  P.closeBidding(s, "buyer", NOW, x.id);
  s.docs.northfield.subtier = day(-1);
  const ranked = P.scoreRFx(x, s, NOW);
  assert.strictEqual(ranked.find(q => q.supplierId === "northfield").eligible, false);
  throwsWith(() => P.award(s, "buyer", NOW, x.id, "northfield", ""), "Sub-tier disclosure expired on");
  throwsWith(() => P.renewDoc(s, "buyer", NOW, "northfield", "subtier", day(300), "Reviewed new disclosure"), "cannot do this");
  throwsWith(() => P.renewDoc(s, "quality", NOW, "northfield", "subtier", day(-1), "Reviewed new disclosure"), "in the future");
  throwsWith(() => P.renewDoc(s, "quality", NOW, "northfield", "subtier", day(300), ""), "what was checked");
  P.renewDoc(s, "quality", NOW, "northfield", "subtier", day(300), "Reviewed new disclosure, ref SD-2291");
  assert.ok(s.audit.some(a => a.action.indexOf("Document renewed") === 0));
  P.award(s, "buyer", NOW, x.id, "northfield", "");
  assert.strictEqual(x.status, "Awarded");
});

test("the sub tier document is only required for raw materials and components", () => {
  const s = P.newState();
  s.docs.atlas.subtier = day(-5);
  assert.deepStrictEqual(P.docIssues(s, "atlas", "2026-10-26", "MRO"), []);
  assert.strictEqual(P.docIssues(s, "atlas", "2026-10-26", "Raw materials")[0].status, "Expired");
  const r = baseReq(s, { qty: 10, estUnit: 90 }); approveAll(s, r);
  assert.ok(P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 84 }).id);
});

test("documents that lapse after the award still block the PO, and expiring ones only warn", () => {
  const s = P.newState();
  const r = baseReq(s, { qty: 10, estUnit: 90 }); approveAll(s, r);
  s.docs.atlas.origin = day(10);                                  // 10 days left: warning, not a block
  assert.strictEqual(P.docIssues(s, "atlas", "2026-10-26", "MRO")[0].status, "Expiring");
  s.docs.atlas.quality = day(-2);
  throwsWith(() => P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 84 }), "Quality certificate expired on");
  s.docs.atlas.quality = day(200);
  assert.ok(P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 84 }).id);
});

// ---------- price variance ----------
test("a PO priced well above the standard price needs a reason, and is counted", () => {
  const s = P.newState();
  const r = baseReq(s, { qty: 10, estUnit: 120 }); approveAll(s, r);          // standard price is $84, approved $1,200
  throwsWith(() => P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 95 }), "13% above the standard price");
  const po = P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 95, varianceReason: "Spot buy, the usual lot is allocated" });
  assert.strictEqual(po.varianceReason, "Spot buy, the usual lot is allocated");
  assert.strictEqual(P.metrics(s, NOW).posAboveRef, 1);
});

test("a PO inside the variance band is not blocked but still shows above reference", () => {
  const s = P.newState();
  const r = baseReq(s, { qty: 10, estUnit: 90 }); approveAll(s, r);
  P.createPO(s, "buyer", NOW, r.id, { supplierId: "atlas", unitPrice: 88 });   // 4.8% above $84
  assert.strictEqual(P.metrics(s, NOW).posAboveRef, 1);
});

// ---------- metrics ----------
test("committed spend and pipeline always list all four categories", () => {
  const m = P.metrics(P.newState(), NOW);
  assert.deepStrictEqual(Object.keys(m.spend), ["Raw materials", "Components", "Packaging", "MRO"]);
  const m2 = P.metrics(seed(NOW), NOW);
  assert.strictEqual(m2.spend["Raw materials"], 100520);
  assert.strictEqual(m2.spend.Packaging, 7700);
  assert.strictEqual(m2.spend.MRO, 7820);
  assert.strictEqual(m2.spend.Components, 0);
  assert.ok(m2.pipeline.Components > 0, "open component work shows in the pipeline");
});

test("the seed has expired and expiring supplier documents, and a tariff that reorders a bid", () => {
  const s = seed(NOW);
  const a = P.docAlerts(s, "2026-10-26");
  assert.strictEqual(a.blocking, 2);
  assert.strictEqual(a.expiring, 2);
  const x = s.rfx.find(r => r.id === "RFX-3003");
  const ranked = P.scoreRFx(x, s, NOW);
  assert.strictEqual(ranked[0].supplierId, "brightpath");
  assert.strictEqual(ranked.find(q => q.supplierId === "orbit").landed, 737.5);
  assert.strictEqual(s.rfx.find(r => r.id === "RFX-3004").quotes[0].validUntil, P.addDays("2026-10-26", -1));
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
