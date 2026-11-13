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
// The item's technical reviewer marks every quote. notOk maps a supplier to the reason its offer fails the spec.
function techOK(s, x, notOk) {
  notOk = notOk || {};
  x.quotes.forEach(q => P.techEvaluate(s, x.techRole, NOW, x.id, q.supplierId, notOk[q.supplierId] ? "Not acceptable" : "Acceptable", notOk[q.supplierId] || ""));
  P.techSubmit(s, x.techRole, NOW, x.id);
}
// The Buyer recommends, then each approver in the chain signs off.
function award(s, now, x, sup, why) {
  P.recommendAward(s, "buyer", now, x.id, sup, why);
  let st;
  while (x.status === "Award pending approval" && (st = x.awardApprovals.find(a => a.status === "Pending"))) P.decideAward(s, st.role, now, x.id, "Approved", "");
  return x;
}
// An approved contract, starting today, for tests that need one.
function contractFor(s, supplierId, lines, cap, over) {
  const c = P.createContract(s, "buyer", NOW, Object.assign({ supplierId, title: "Test contract", cap: cap || 40000,
    start: day(0), end: day(365), lines: lines.map(([itemId, price]) => ({ itemId, price })) }, over || {}));
  c.approvals.forEach(a => P.decideContract(s, a.role, NOW, c.id, "Approved", ""));
  return c;
}

function approveAll(s, r) {
  let st;
  while ((st = r.approvals.find(a => a.status === "Pending"))) P.decide(s, st.role, NOW, r.id, "Approved", "ok");
}
const W = {};

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

test("RFx needs two suppliers or a sole source reason, and adjustment values must be in range", () => {
  const { s, r } = rfxFixture();
  throwsWith(() => P.startRFx(s, "buyer", NOW, r.id, { type: "RFQ", invited: ["northfield"] }), "two suppliers");
  throwsWith(() => P.startRFx(s, "buyer", NOW, r.id, { type: "RFQ", invited: ["northfield", "helio"], capitalPct: 50 }), "Cost of capital (% a year) must be between 0 and 30");
  throwsWith(() => P.startRFx(s, "buyer", NOW, r.id, { type: "RFQ", invited: ["northfield", "meridian"] }), "does not supply");
  const x = P.startRFx(s, "buyer", NOW, r.id, { type: "RFQ", invited: ["northfield"], soleReason: "Only qualified source for this enclosure" });
  assert.strictEqual(x.status, "Open");
  assert.strictEqual(r.status, "Sourcing");
  assert.deepStrictEqual(x.adj, P.REF.adjust, "a new RFx starts from the default adjustment values");
});

test("offers rank on the adjusted price: landed cost plus bonus and malus for terms, schedule, status and rating", () => {
  const { s, r } = rfxFixture();   // 60 housings, need by 15 Nov, measured from 26 Oct while open
  const x = P.startRFx(s, "buyer", NOW, r.id, { type: "RFP", invited: ["northfield", "helio", "brightpath"] });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 212, leadDays: 28 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 205, leadDays: 40 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "brightpath", unitPrice: 219, leadDays: 24 });
  const ranked = P.scoreRFx(x, s, NOW);
  // Northfield: ready 8 days after the need date, 18 days short of the 10 day buffer: 212 x 0.5% x 18 = 19.08.
  // Brightpath: 14 days short: 219 x 0.5% x 14 = 15.33. Helio: net 30 against net 45 at 8% a year = +0.67, 30 days short = +30.75.
  assert.deepStrictEqual(ranked.map(q => [q.supplierId, q.adjusted]), [["northfield", 231.08], ["brightpath", 234.33], ["helio", 236.42]]);
  assert.ok(ranked[2].adjustments.some(l => l.kind === "Malus" && l.amount === 0.67 && l.label.indexOf("Net 30 against standard net 45") === 0));
  assert.strictEqual(ranked[0].slack, -8);
  const k = P.newState(), kr = baseReq(k, { itemId: "CP-301", qty: 200, estUnit: 76 });
  approveAll(k, kr);
  const kx = P.startRFx(k, "buyer", NOW, kr.id, { type: "RFQ", invited: ["kestrel", "northfield"] });
  P.addQuote(k, "buyer", NOW, kx.id, { supplierId: "kestrel", unitPrice: 70, leadDays: 5, terms: "Net 75" });
  const kq = P.scoreRFx(kx, k, NOW)[0];
  // Conditional: $600 over 200 units = +3.00. Rating 70 is 15 below 85: 70 x 0.2% x 15 = +2.10. Net 75: 70 x 8% x 30/365 = -0.46.
  assert.deepStrictEqual(kq.adjustments.map(l => l.amount), [-0.46, 3, 2.1]);
  assert.strictEqual(kq.adjustments[0].kind, "Bonus");
  assert.strictEqual(kq.adjusted, 74.64);
});

test("the Buyer sets adjustment values while bidding is open, and they lock when it closes", () => {
  const { s, r } = rfxFixture();
  const x = P.startRFx(s, "buyer", NOW, r.id, { type: "RFQ", invited: ["northfield", "helio"], bufferDays: 5 });
  assert.strictEqual(x.adj.bufferDays, 5);
  throwsWith(() => P.setAdjustments(s, "requester", NOW, x.id, { dayPct: 1 }), "cannot do this");
  throwsWith(() => P.setAdjustments(s, "buyer", NOW, x.id, { bufferDays: 5 }), "Nothing changed");
  throwsWith(() => P.setAdjustments(s, "buyer", NOW, x.id, { dayPct: 20 }), "between 0 and 10");
  P.setAdjustments(s, "buyer", NOW, x.id, { dayPct: 1, capitalPct: 10 });
  assert.ok(s.audit.some(a => a.entity === x.id && a.action === "Adjustment values changed" && a.note.indexOf("Cost of capital (% a year) 8 to 10") >= 0));
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 212, leadDays: 12 });
  P.closeBidding(s, "buyer", at(2), x.id);
  assert.strictEqual(x.evalDate, day(2), "offers are measured from the day bidding closed");
  assert.deepStrictEqual(x.slips, { northfield: 0 }, "the delivery record is frozen at close too");
  throwsWith(() => P.setAdjustments(s, "buyer", at(2), x.id, { dayPct: 0 }), "locked when bidding closed");
  assert.strictEqual(P.scoreRFx(x, s, at(30))[0].slack, 6, "ready 14 Nov against need 20 Nov, however late you look");
});

test("award rules: bidding must close, unqualified blocked, off ranking needs justification", () => {
  const { s, r } = rfxFixture();
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFP", invited: ["northfield", "helio", "orbit"] }, W));
  throwsWith(() => P.closeBidding(s, "buyer", NOW, x.id), "No quotes");
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 212, leadDays: 28 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 205, leadDays: 40 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "orbit", unitPrice: 150, leadDays: 10 });
  throwsWith(() => P.recommendAward(s, "buyer", NOW, x.id, "northfield", ""), "Close bidding");
  P.closeBidding(s, "buyer", NOW, x.id);
  techOK(s, x);
  throwsWith(() => P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 1, leadDays: 1 }), "closed");
  throwsWith(() => P.recommendAward(s, "buyer", NOW, x.id, "orbit", "cheapest by far"), "not qualified");
  const top = P.scoreRFx(x, s, NOW).filter(q => q.eligible)[0].supplierId;
  const other = top === "northfield" ? "helio" : "northfield";
  throwsWith(() => P.recommendAward(s, "buyer", NOW, x.id, other, ""), "justification");
  award(s, NOW, x, top, "");
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
  techOK(s, x);
  throwsWith(() => P.recommendAward(s, "buyer", NOW, x.id, "kestrel", ""), "conditional supplier, only one bid");
  award(s, NOW, x, "kestrel", "Only bidder, extra incoming inspection planned");
  assert.strictEqual(x.award.supplierId, "kestrel");
});

// ---------- technical evaluation and award approval ----------
function rfxFor(itemId, qty, estUnit, invited) {
  const s = P.newState();
  const r = baseReq(s, { itemId, qty, estUnit });
  approveAll(s, r);
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited }, W));
  return { s, r, x };
}

test("closing bidding sends the RFx to the right technical reviewer for the item", () => {
  [["CP-104", 60, 215, "engineering"], ["RM-101", 300, 42, "quality"], ["MR-203", 20, 910, "requester"]].forEach(([item, q, p, who]) => {
    const { s, x } = rfxFor(item, q, p, item === "MR-203" ? ["atlas", "meridian"] : ["northfield", "helio"]);
    x.invited.forEach(id => P.addQuote(s, "buyer", NOW, x.id, { supplierId: id, unitPrice: p, leadDays: 20 }));
    P.closeBidding(s, "buyer", NOW, x.id);
    assert.strictEqual(x.status, "Technical review", item);
    assert.strictEqual(x.techRole, who, item);
  });
});

test("only the reviewer evaluates, a failed offer needs a reason, and every quote must be done", () => {
  const { s, x } = rfxFor("CP-104", 60, 215, ["northfield", "helio"]);
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 212, leadDays: 28 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 205, leadDays: 40 });
  throwsWith(() => P.techEvaluate(s, "engineering", NOW, x.id, "helio", "Acceptable", ""), "not waiting for a technical evaluation");
  P.closeBidding(s, "buyer", NOW, x.id);
  assert.ok(P.scoreRFx(x, s, NOW).every(q => q.eligible === false && q.tech === "Pending"), "nothing can win while the review is open");
  throwsWith(() => P.recommendAward(s, "buyer", NOW, x.id, "northfield", ""), "with the Engineering");
  throwsWith(() => P.techEvaluate(s, "buyer", NOW, x.id, "helio", "Acceptable", ""), "cannot do this");
  throwsWith(() => P.techEvaluate(s, "engineering", NOW, x.id, "helio", "Not acceptable", ""), "does not meet the spec");
  P.techEvaluate(s, "engineering", NOW, x.id, "helio", "Not acceptable", "Wall thickness 2 mm, drawing needs 3 mm");
  throwsWith(() => P.techSubmit(s, "engineering", NOW, x.id), "Still open: Northfield Metals");
  P.techEvaluate(s, "engineering", NOW, x.id, "northfield", "Acceptable", "");
  P.techSubmit(s, "engineering", NOW, x.id);
  assert.strictEqual(x.status, "Evaluating");
  assert.ok(s.audit.some(a => a.action === "Technical recommendation sent to the Buyer" && a.note.indexOf("1 of 2") === 0));
});

test("an offer that fails the technical check cannot win, even if it scores best", () => {
  const { s, x } = rfxFor("CP-104", 60, 215, ["northfield", "helio"]);
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 212, leadDays: 28 });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 150, leadDays: 10 });
  P.closeBidding(s, "buyer", NOW, x.id);
  techOK(s, x, { helio: "Wrong alloy grade offered" });
  const ranked = P.scoreRFx(x, s, NOW);
  assert.strictEqual(ranked[0].supplierId, "helio", "cheapest still ranks first on score");
  assert.strictEqual(ranked[0].eligible, false);
  assert.strictEqual(ranked[0].techNote, "Wrong alloy grade offered");
  throwsWith(() => P.recommendAward(s, "buyer", NOW, x.id, "helio", "Cheapest by far, worth a look"), "not technically acceptable: Wrong alloy grade offered");
  award(s, NOW, x, "northfield", "");
  assert.strictEqual(x.status, "Awarded", "the top acceptable offer needs no justification");
});

test("award approval: Director always, Executive from $50,000 or for a risky pick, in order", () => {
  const small = rfxFor("CP-104", 60, 215, ["northfield", "helio"]);
  ["northfield", "helio"].forEach((id, i) => P.addQuote(small.s, "buyer", NOW, small.x.id, { supplierId: id, unitPrice: 212 + i * 20, leadDays: 28 }));
  P.closeBidding(small.s, "buyer", NOW, small.x.id); techOK(small.s, small.x);
  P.recommendAward(small.s, "buyer", NOW, small.x.id, "northfield", "");
  assert.deepStrictEqual(small.x.awardApprovals.map(a => a.role), ["director"], "clean $12,720 award");
  assert.strictEqual(small.r.status, "Sourcing", "not awarded until approved");
  throwsWith(() => P.createPO(small.s, "buyer", NOW, small.r.id, {}), "must be approved");

  const big = rfxFor("RM-101", 1500, 42, ["northfield", "helio"]);
  ["northfield", "helio"].forEach((id, i) => P.addQuote(big.s, "buyer", NOW, big.x.id, { supplierId: id, unitPrice: 41 + i, leadDays: 20 }));
  P.closeBidding(big.s, "buyer", NOW, big.x.id); techOK(big.s, big.x);
  P.recommendAward(big.s, "buyer", NOW, big.x.id, "northfield", "");
  assert.deepStrictEqual(big.x.awardApprovals.map(a => a.role), ["director", "executive"], "$61,500 award");
  throwsWith(() => P.decideAward(big.s, "executive", NOW, big.x.id, "Approved", ""), "belongs to the Director");
  P.decideAward(big.s, "director", NOW, big.x.id, "Approved", "");
  assert.strictEqual(big.x.status, "Award pending approval");
  P.decideAward(big.s, "executive", NOW, big.x.id, "Approved", "");
  assert.strictEqual(big.x.status, "Awarded");
  assert.strictEqual(big.x.award.approvals.length, 2);

  const single = rfxFor("CP-301", 200, 76, ["kestrel", "northfield"]);
  P.addQuote(single.s, "buyer", NOW, single.x.id, { supplierId: "kestrel", unitPrice: 70, leadDays: 20 });
  P.closeBidding(single.s, "buyer", NOW, single.x.id); techOK(single.s, single.x);
  P.recommendAward(single.s, "buyer", NOW, single.x.id, "kestrel", "Only bidder, extra incoming inspection planned");
  assert.deepStrictEqual(single.x.awardApprovals.map(a => a.role), ["director", "executive"], "single bid from a conditional supplier escalates");
  assert.deepStrictEqual(single.x.recommendation.reasons, ["conditional supplier", "only one bid"]);
});

test("a rejected award goes back to the Buyer with the reason on record", () => {
  const { s, r, x } = rfxFor("CP-104", 60, 215, ["northfield", "helio"]);
  ["northfield", "helio"].forEach((id, i) => P.addQuote(s, "buyer", NOW, x.id, { supplierId: id, unitPrice: 212 + i * 20, leadDays: 28 }));
  P.closeBidding(s, "buyer", NOW, x.id); techOK(s, x);
  P.recommendAward(s, "buyer", NOW, x.id, "northfield", "");
  throwsWith(() => P.decideAward(s, "director", NOW, x.id, "Rejected", ""), "reason");
  P.decideAward(s, "director", NOW, x.id, "Rejected", "Ask both for a firm delivery date first");
  assert.strictEqual(x.status, "Evaluating");
  assert.strictEqual(x.recommendation, null);
  assert.strictEqual(x.pastRecommendations[0].approvals[0].comment, "Ask both for a firm delivery date first");
  assert.strictEqual(r.status, "Sourcing");
  award(s, NOW, x, "northfield", "");
  assert.strictEqual(r.status, "Awarded");
});

test("queues show technical reviews and award approvals to the right role", () => {
  const { s, x } = rfxFor("CP-104", 60, 215, ["northfield", "helio"]);
  ["northfield", "helio"].forEach((id, i) => P.addQuote(s, "buyer", NOW, x.id, { supplierId: id, unitPrice: 212 + i * 20, leadDays: 28 }));
  P.closeBidding(s, "buyer", NOW, x.id);
  const count = (role, label) => (P.queueFor(s, role, NOW).find(q => q.label === label) || { count: 0 }).count;
  assert.strictEqual(count("engineering", "RFx waiting for your technical evaluation"), 1);
  assert.strictEqual(count("quality", "RFx waiting for your technical evaluation"), 0);
  techOK(s, x);
  P.recommendAward(s, "buyer", NOW, x.id, "northfield", "");
  assert.strictEqual(count("director", "Awards waiting for your approval"), 1);
  assert.strictEqual(count("executive", "Awards waiting for your approval"), 0);
});

test("an RFx saved before technical reviews existed can still be awarded", () => {
  const { s, x } = rfxFor("CP-104", 60, 215, ["northfield", "helio"]);
  ["northfield", "helio"].forEach((id, i) => P.addQuote(s, "buyer", NOW, x.id, { supplierId: id, unitPrice: 212 + i * 20, leadDays: 28 }));
  x.status = "Evaluating";   // as an older saved RFx: closed straight to Evaluating, no techRole
  assert.ok(P.scoreRFx(x, s, NOW).every(q => q.eligible));
  award(s, NOW, x, "northfield", "");
  assert.strictEqual(x.status, "Awarded");
});

// ---------- service POs ----------
// An approved crane hire request turned into a direct PO: 6 days at $1,450.
function servicePO() {
  const s = P.newState();
  const r = baseReq(s, { itemId: "SV-502", qty: 6, estUnit: 1450, costCenter: "CC-300 Maintenance" });
  approveAll(s, r);
  const po = P.createPO(s, "buyer", NOW, r.id, { supplierId: "crestline", unitPrice: 1450, leadDays: 3 });
  return { s, r, po };
}

test("the Requester records service work and the Manager releases a small entry", () => {
  const { s, po } = servicePO();
  const f = { qty: 2, period: "2026-10", note: "Set the vessel on its plinth, 2 days with operator" };
  throwsWith(() => P.postService(s, "buyer", NOW, po.id, f), "cannot do this");
  throwsWith(() => P.postService(s, "requester", NOW, po.id, Object.assign({}, f, { period: "" })), "month");
  throwsWith(() => P.postService(s, "requester", NOW, po.id, Object.assign({}, f, { note: "" })), "Describe the work");
  throwsWith(() => P.postService(s, "requester", NOW, po.id, Object.assign({}, f, { qty: 1.234 })), "two decimals");
  const e = P.postService(s, "requester", NOW, po.id, f);
  assert.strictEqual(e.status, "Submitted");
  assert.strictEqual(e.value, 2900);
  assert.deepStrictEqual(e.releases.map(x => x.role), ["manager"], "under $5,000 the Manager alone releases it");
  assert.strictEqual(P.poStatus(s, po), "In progress");
  throwsWith(() => P.decideService(s, "requester", NOW, e.id, "Accepted", ""), "cannot do this");
  throwsWith(() => P.decideService(s, "director", NOW, e.id, "Accepted", ""), "does not need to release it");
  throwsWith(() => P.decideService(s, "manager", NOW, e.id, "Rejected", ""), "what is wrong");
  P.decideService(s, "manager", NOW, e.id, "Accepted", "");
  assert.strictEqual(e.status, "Accepted");
  throwsWith(() => P.decideService(s, "manager", NOW, e.id, "Accepted", ""), "already released");
  assert.strictEqual(P.grnTotals(s, po.id).accepted, 2);
});

test("larger entries go to the Director from $5,000 and the Executive from $10,000, in order", () => {
  assert.deepStrictEqual(P.serviceChain(4999.99), ["manager"]);
  assert.deepStrictEqual(P.serviceChain(5000), ["manager", "director"]);
  assert.deepStrictEqual(P.serviceChain(10000), ["manager", "director", "executive"]);
  const s = P.newState();
  contractFor(s, "keystone", [["SV-501", 66]]);
  const r = baseReq(s, { itemId: "SV-501", qty: 300, estUnit: 68, costCenter: "CC-300 Maintenance" });
  approveAll(s, r);
  const po = P.createPO(s, "buyer", NOW, r.id, { leadDays: 3 });
  const e = P.postService(s, "requester", NOW, po.id, { qty: 160, period: "2026-10", note: "Planned shutdown, timesheets KFS-0907" });
  assert.strictEqual(e.value, 10560);
  throwsWith(() => P.decideService(s, "executive", NOW, e.id, "Accepted", ""), "belongs to the Manager");
  P.decideService(s, "manager", NOW, e.id, "Accepted", "Hours match the shutdown log");
  assert.strictEqual(P.nextReleaser(e), "director");
  throwsWith(() => P.decideService(s, "manager", NOW, e.id, "Accepted", ""), "already released this entry");
  assert.ok(P.queueFor(s, "director", NOW).some(q => q.label === "Service entries waiting for your release" && q.count === 1));
  P.decideService(s, "director", NOW, e.id, "Accepted", "");
  assert.strictEqual(e.status, "Submitted", "still waits for the Executive");
  assert.strictEqual(P.grnTotals(s, po.id).accepted, 0, "nothing is accepted until the last release");
  P.decideService(s, "executive", NOW, e.id, "Accepted", "");
  assert.strictEqual(e.status, "Accepted");
  assert.strictEqual(P.grnTotals(s, po.id).accepted, 160);
});

test("an approver can send an entry back to the Requester, and old entries get their chain", () => {
  const { s, po } = servicePO();
  const e = P.postService(s, "requester", NOW, po.id, { qty: 4, period: "2026-10", note: "Four days of lifts" });
  P.decideService(s, "manager", NOW, e.id, "Accepted", "");
  P.decideService(s, "director", NOW, e.id, "Rejected", "Gate log shows three days");
  assert.strictEqual(e.status, "Rejected");
  assert.deepStrictEqual(e.releases.map(x => x.status), ["Released", "Sent back"]);
  assert.ok(P.queueFor(s, "requester", NOW).some(q => q.label === "Service entries sent back to you" && q.count === 1));
  P.postService(s, "requester", NOW, po.id, { qty: 3, period: "2026-10", note: "Three days, corrected to the gate log" });
  assert.ok(!P.queueFor(s, "requester", NOW).some(q => q.label === "Service entries sent back to you"), "a corrected entry clears it");
  const old = { id: "SES-7999", poId: po.id, period: "2026-09", qty: 1, value: 1450, note: "Saved before releases", status: "Submitted" };
  s.ses.push(old);
  assert.strictEqual(P.nextReleaser(old), "manager");
});

test("service entries cannot take a PO past its ordered quantity, and goods receipts are refused", () => {
  const { s, po } = servicePO();
  P.postService(s, "requester", NOW, po.id, { qty: 4, period: "2026-10", note: "Four days of lifts" });
  throwsWith(() => P.postService(s, "requester", NOW, po.id, { qty: 3, period: "2026-11", note: "Three more days" }), "Only 2 days ($2,900.00) remain");
  throwsWith(() => P.postGRN(s, "warehouse", NOW, po.id, { qty: 1, result: "Accepted" }), "is a service PO");
  const e = P.postService(s, "requester", NOW, po.id, { qty: 2, period: "2026-11", note: "Two more days" });
  P.decideService(s, "manager", NOW, e.id, "Rejected", "Only one day was worked, see the gate log");
  assert.strictEqual(P.serviceStatus(s, po).leftQty, 2, "an entry sent back gives its quantity back");
});

test("service consumption shows ordered, accepted, waiting and remaining, and warns from 80%", () => {
  const { s, po } = servicePO();
  const a = P.postService(s, "requester", NOW, po.id, { qty: 3, period: "2026-09", note: "Three days" });
  P.decideService(s, "manager", NOW, a.id, "Accepted", "");
  P.postService(s, "requester", NOW, po.id, { qty: 1.5, period: "2026-10", note: "One and a half days" });
  const st = P.serviceStatus(s, po);
  assert.deepStrictEqual([st.ordered, st.accepted, st.waiting, st.remaining, st.pct, st.warn], [8700, 4350, 2175, 2175, 75, false]);
  P.postService(s, "requester", NOW, po.id, { qty: 0.5, period: "2026-10", note: "Half a day more" });
  assert.strictEqual(P.serviceStatus(s, po).warn, true);
});

test("a service invoice matches only released, not yet invoiced service, and names who must act", () => {
  const { s, po } = servicePO();
  const inv = n => P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "CL-" + n, qty: 2, unitPrice: 1450, date: day(0) });
  let i = inv(1);
  assert.strictEqual(i.match.issues[0].code, "NO_RECEIPT");
  assert.strictEqual(i.match.issues[0].owner, "requester", "nothing recorded: the Requester records it");
  const e = P.postService(s, "requester", NOW, po.id, { qty: 2, period: "2026-10", note: "Two days of lifts" });
  i = inv(2);
  assert.strictEqual(i.match.issues[0].owner, "manager", "recorded but not released: the next releaser acts");
  assert.ok(P.queueFor(s, "manager", NOW).some(q => q.label === "Invoices waiting on your service release"));
  P.decideService(s, "manager", NOW, e.id, "Accepted", "");
  P.rerunMatch(s, "ap", NOW, i.id);
  assert.strictEqual(i.status, "Matched");
  const half = P.postService(s, "requester", NOW, po.id, { qty: 0.5, period: "2026-11", note: "Half day standby" });
  P.decideService(s, "manager", NOW, half.id, "Accepted", "");
  const h = P.enterInvoice(s, "ap", NOW, { poId: po.id, invNo: "CL-9", qty: 0.5, unitPrice: 1450, date: day(0) });
  assert.strictEqual(h.status, "Matched", "service invoices can bill part of a day");
  throwsWith(() => P.enterInvoice(s, "ap", NOW, { poId: "PO-9999", invNo: "X", qty: 1, unitPrice: 1, date: day(0) }), "not found");
});

test("service POs stay out of delivery health and the expedite list", () => {
  const { s, po } = servicePO();
  assert.strictEqual(P.ctb(s, po).status, "Service");
  assert.strictEqual(P.expediteList(s, at(30)).length, 0);
  const m = P.metrics(s, NOW);
  assert.strictEqual(m.ctb.Clear + m.ctb["At Risk"] + m.ctb.Late, 0);
  assert.strictEqual(m.spend.Services, 8700);
});

test("a fully accepted service PO is consumed, and the flow finds it from a service entry", () => {
  const { s, r, po } = servicePO();
  const e = P.postService(s, "requester", NOW, po.id, { qty: 6, period: "2026-10", note: "All six days" });
  P.decideService(s, "manager", NOW, e.id, "Accepted", "");
  P.decideService(s, "director", NOW, e.id, "Accepted", "");
  assert.strictEqual(P.poStatus(s, po), "Consumed");
  const f = P.docFlow(s, e.id);
  assert.strictEqual(f.po.id, po.id);
  assert.strictEqual(f.request.id, r.id);
  assert.deepStrictEqual(f.ses.map(x => x.id), [e.id]);
  assert.strictEqual(f.service, true);
});

test("service suppliers need only a quality certificate, and services go to the right technical reviewer", () => {
  const s = P.newState();
  assert.deepStrictEqual(P.supplierDocs(s, "keystone", NOW.slice(0, 10)).map(d => d.doc), ["quality"]);
  assert.deepStrictEqual(P.supplierDocs(s, "northfield", NOW.slice(0, 10)).map(d => d.doc), ["quality", "origin", "subtier"]);
  assert.strictEqual(P.techReviewer(P.REF.items.find(i => i.id === "SV-503")), "requester");
  assert.strictEqual(P.techReviewer(P.REF.items.find(i => i.id === "SV-505")), "quality");
});

// ---------- 3. PO policy ----------
test("direct PO: contract buys allowed, large uncontracted buys blocked, supplier must be qualified", () => {
  const s = P.newState();
  contractFor(s, "meridian", [["MR-402", 9.10]]);
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
// ---------- contracts ----------
test("the Buyer drafts a contract and it is checked before it goes for approval", () => {
  const s = P.newState();
  const f = { supplierId: "meridian", title: "MRO spares", cap: 9000, start: day(0), end: day(365), lines: [{ itemId: "MR-402", price: 9.10 }] };
  const tryWith = over => () => P.createContract(s, "buyer", NOW, Object.assign({}, f, over));
  throwsWith(() => P.createContract(s, "requester", NOW, f), "cannot do this");
  throwsWith(tryWith({ title: "" }), "short title");
  throwsWith(tryWith({ supplierId: "northwind" }), "need a qualified supplier");
  throwsWith(tryWith({ lines: [{ itemId: "RM-101", price: 40 }] }), "does not supply");
  throwsWith(tryWith({ lines: [] }), "at least one item");
  throwsWith(tryWith({ lines: [{ itemId: "MR-402", price: 9.104 }] }), "to the cent");
  throwsWith(tryWith({ lines: [{ itemId: "MR-402", price: 9 }, { itemId: "MR-402", price: 9 }] }), "twice");
  throwsWith(tryWith({ end: day(0) }), "after the start");
  throwsWith(tryWith({ start: day(-400), end: day(-10) }), "already passed");
  throwsWith(tryWith({ cap: 0 }), "value cap");
  const c = P.createContract(s, "buyer", NOW, f);
  assert.strictEqual(c.status, "Pending approval");
  assert.deepStrictEqual(c.approvals.map(a => a.role), ["director"], "under $50,000 the Director alone approves");
  throwsWith(tryWith({ start: day(100) }), "already on " + c.id);
  s.docs.meridian.quality = day(-1);
  throwsWith(tryWith({ lines: [{ itemId: "MR-404", price: 92 }] }), "cannot get a contract");
});

test("contract approval follows the award ladder: Director, then the Executive from $50,000", () => {
  const s = P.newState();
  const c = P.createContract(s, "buyer", NOW, { supplierId: "crestline", title: "Crane hire next year", cap: 56000,
    start: day(5), end: day(370), lines: [{ itemId: "SV-502", price: 1400 }] });
  assert.deepStrictEqual(c.approvals.map(a => a.role), ["director", "executive"]);
  throwsWith(() => P.decideContract(s, "manager", NOW, c.id, "Approved", ""), "cannot do this");
  throwsWith(() => P.decideContract(s, "executive", NOW, c.id, "Approved", ""), "belongs to the Director");
  P.decideContract(s, "director", NOW, c.id, "Approved", "");
  assert.strictEqual(c.status, "Pending approval");
  assert.ok(P.queueFor(s, "executive", NOW).some(q => q.label === "Contracts waiting for your approval"));
  throwsWith(() => P.decideContract(s, "executive", NOW, c.id, "Rejected", ""), "Give a reason");
  P.decideContract(s, "executive", NOW, c.id, "Rejected", "Rate is above last year, renegotiate");
  assert.strictEqual(c.status, "Rejected");
  const small = P.createContract(s, "buyer", NOW, { supplierId: "truegauge", title: "Calibration", cap: 6000,
    start: day(0), end: day(365), lines: [{ itemId: "SV-505", price: 42 }] });
  throwsWith(() => P.decideContract(s, "executive", NOW, small.id, "Approved", ""), "does not approve it");
});

test("an approved request is released from an active contract at the agreed rate, up to the cap", () => {
  const s = P.newState();
  const pending = P.createContract(s, "buyer", NOW, { supplierId: "meridian", title: "MRO spares", cap: 1000,
    start: day(0), end: day(365), lines: [{ itemId: "MR-404", price: 92 }] });
  const r1 = baseReq(s, { itemId: "MR-404", qty: 5, estUnit: 96 });
  approveAll(s, r1);
  throwsWith(() => P.createPO(s, "buyer", NOW, r1.id, {}), "Choose a supplier");   // not approved yet, so no contract applies
  P.decideContract(s, "director", NOW, pending.id, "Approved", "");
  const po = P.createPO(s, "buyer", NOW, r1.id, {});
  assert.deepStrictEqual([po.source, po.contractId, po.unitPrice, po.refPrice], ["Contract", pending.id, 92, 92]);
  let st = P.contractStatus(s, pending, day(0));
  assert.deepStrictEqual([st.released, st.remaining, st.pct, st.status], [460, 540, 46, "Active"]);
  const r2 = baseReq(s, { itemId: "MR-404", qty: 6, estUnit: 96 });   // $552 against $540 left
  approveAll(s, r2);
  throwsWith(() => P.createPO(s, "buyer", NOW, r2.id, {}), "has only $540.00 left");
  const r3 = baseReq(s, { itemId: "MR-404", qty: 5, estUnit: 96 });
  approveAll(s, r3);
  P.createPO(s, "buyer", NOW, r3.id, {});
  st = P.contractStatus(s, pending, day(0));
  assert.strictEqual(st.warn, true, "92% used warns");
  assert.strictEqual(P.contractFor(s, "MR-404", day(0)).contract.id, pending.id);
});

test("a used up or expired contract no longer applies, so normal sourcing rules return", () => {
  const s = P.newState();
  const c = contractFor(s, "ridgeway", [["SV-503", 495]], 4950, { end: day(30) });
  const r = baseReq(s, { itemId: "SV-503", qty: 10, estUnit: 520 });
  approveAll(s, r);
  P.createPO(s, "buyer", NOW, r.id, {});
  assert.strictEqual(P.contractStatus(s, c, day(0)).status, "Used up");
  assert.strictEqual(P.contractFor(s, "SV-503", day(0)), null);
  const big = baseReq(s, { itemId: "SV-503", qty: 20, estUnit: 520 });   // $10,400
  approveAll(s, big);
  throwsWith(() => P.createPO(s, "buyer", NOW, big.id, { supplierId: "ridgeway", unitPrice: 520 }), "no active contract");
  const later = contractFor(s, "keystone", [["SV-501", 66]], 30000, { end: day(20) });
  assert.strictEqual(P.contractStatus(s, later, day(0)).endsSoon, true, "ends within 60 days");
  assert.ok(P.queueFor(s, "buyer", NOW).some(q => q.label === "Contracts ending within 60 days"));
  assert.strictEqual(P.contractStatus(s, later, day(21)).status, "Expired");
  assert.strictEqual(P.contractFor(s, "SV-501", day(21)), null);
  assert.strictEqual(P.refPriceAt(s, "SV-501", day(0)), 66);
  assert.strictEqual(P.refPriceAt(s, "SV-501", day(21)), 68, "after expiry the standard price is the reference again");
});

test("saved data from before contracts gets its old contract prices as approved contracts", () => {
  const s = seed(NOW);
  delete s.contracts;
  s.pos.forEach(po => { delete po.contractId; });
  assert.strictEqual(P.migrateContracts(s, NOW), true);
  assert.deepStrictEqual(s.contracts.map(c => c.supplierId), ["meridian", "keystone"]);
  assert.ok(s.pos.filter(po => po.source === "Contract" && po.itemId !== "SV-503").every(po => po.contractId), "old contract POs are linked");
  assert.strictEqual(P.migrateContracts(s, NOW), false, "runs once");
  assert.strictEqual(P.contractFor(s, "MR-402", day(0)).line.price, 9.10);
});

// ---------- projects ----------
test("the Requester creates a project with a target and a criticality, and the cost per day is optional", () => {
  const s = P.newState();
  const f = { name: "Pump P-204 overhaul", target: day(14), criticality: "High" };
  throwsWith(() => P.createProject(s, "buyer", NOW, f), "cannot do this");
  throwsWith(() => P.createProject(s, "requester", NOW, Object.assign({}, f, { name: "x" })), "name people will recognise");
  throwsWith(() => P.createProject(s, "requester", NOW, Object.assign({}, f, { target: "" })), "target date");
  throwsWith(() => P.createProject(s, "requester", NOW, Object.assign({}, f, { criticality: "Urgent" })), "High, Medium or Low");
  throwsWith(() => P.createProject(s, "requester", NOW, Object.assign({}, f, { costPerDay: -5 })), "left empty");
  const p = P.createProject(s, "requester", NOW, f);
  assert.deepStrictEqual([p.id, p.costPerDay, p.status], ["PRJ-9001", null, "Open"]);
  const st = P.projectStatus(s, p, day(0));
  assert.deepStrictEqual([st.state, st.rows.length, st.delayCost], ["Empty", 0, null]);
});

test("a request joins a project when raised or later, and its PO and receipts follow it", () => {
  const s = P.newState();
  const p = P.createProject(s, "requester", NOW, { name: "Pump P-204 overhaul", target: day(14), criticality: "High", costPerDay: 1000 });
  const a = baseReq(s, { itemId: "MR-401", qty: 4, estUnit: 58, needBy: day(10), projectId: p.id });
  assert.strictEqual(a.projectId, p.id);
  const b = baseReq(s, { itemId: "MR-203", qty: 1, estUnit: 910, needBy: day(10) });
  approveAll(s, b);
  const po = P.createPO(s, "buyer", NOW, b.id, { supplierId: "tidewater", unitPrice: 910, leadDays: 20 });
  P.linkToProject(s, "buyer", NOW, po.id, p.id);   // linked through its PO, so the request joins
  assert.strictEqual(b.projectId, p.id);
  throwsWith(() => P.linkToProject(s, "requester", NOW, b.id, p.id), "already in");
  throwsWith(() => P.linkToProject(s, "ap", NOW, b.id, p.id), "cannot do this");
  const st = P.projectStatus(s, p, day(0));
  const seal = st.rows.find(r => r.request.id === b.id);
  assert.deepStrictEqual([seal.state, seal.holder, seal.expectedShown], ["Late", "Supplier, to confirm", day(20)]);
  assert.strictEqual(st.gating.request.id, b.id, "the latest item holds the project up");
  assert.deepStrictEqual([st.readyBy, st.daysLate, st.delayCost, st.state], [day(20), 6, 6000, "Late"]);
  assert.strictEqual(st.rows.find(r => r.request.id === a.id).holder, "Manager", "an unapproved request is held by its next approver");
  P.linkToProject(s, "requester", NOW, b.id, null);
  assert.strictEqual(b.projectId, null);
  assert.strictEqual(P.projectStatus(s, p, day(0)).rows.length, 1);
});

test("project rows are ready when goods are received or a service is booked in time, blocked on a quality hold", () => {
  const s = P.newState();
  const p = P.createProject(s, "requester", NOW, { name: "Packaging line changeover", target: day(20), criticality: "Medium" });
  const g = baseReq(s, { itemId: "MR-401", qty: 10, estUnit: 58, needBy: day(15), projectId: p.id });
  approveAll(s, g);
  const po = P.createPO(s, "buyer", NOW, g.id, { supplierId: "atlas", unitPrice: 58, leadDays: 5 });
  P.confirmPO(s, "buyer", NOW, po.id, day(5));
  P.postGRN(s, "warehouse", NOW, po.id, { qty: 10, result: "Hold", note: "Check the crimp fittings" });
  let row = P.projectStatus(s, p, day(0)).rows[0];
  assert.deepStrictEqual([row.state, row.holder], ["Blocked", "Quality, receipt on hold"]);
  P.releaseHold(s, "quality", NOW, s.grns[0].id, "Accepted", "Fittings checked");
  assert.strictEqual(P.projectStatus(s, p, day(0)).rows[0].state, "Ready");
  const c = baseReq(s, { itemId: "SV-502", qty: 1, estUnit: 1450, needBy: day(15), projectId: p.id });
  approveAll(s, c);
  const crane = P.createPO(s, "buyer", NOW, c.id, { supplierId: "crestline", unitPrice: 1450, leadDays: 10 });
  P.confirmPO(s, "buyer", NOW, crane.id, day(10));
  const st = P.projectStatus(s, p, day(0));
  assert.deepStrictEqual([st.state, st.counts.Ready, st.gating, st.daysLate], ["Ready", 2, null, 0]);
});

test("a supplier's delivery record plans on its usual slip once it has three deliveries", () => {
  const s = P.newState();
  s.deliveries.push({ supplierId: "tidewater", ref: "A", promised: day(-90), received: day(-86) },
    { supplierId: "tidewater", ref: "B", promised: day(-60), received: day(-58) });
  let rec = P.deliveryRecord(s, "tidewater");
  assert.deepStrictEqual([rec.n, rec.enough, rec.typicalSlip], [2, false, 0], "two deliveries are too few to plan on");
  s.deliveries.push({ supplierId: "tidewater", ref: "C", promised: day(-30), received: day(-27) });
  rec = P.deliveryRecord(s, "tidewater");
  assert.deepStrictEqual([rec.n, rec.typicalSlip, rec.onTimePct], [3, 3, 0]);
  s.deliveries.push({ supplierId: "atlas", ref: "D", promised: day(-30), received: day(-32) },
    { supplierId: "atlas", ref: "E", promised: day(-20), received: day(-21) }, { supplierId: "atlas", ref: "F", promised: day(-10), received: day(-10) });
  assert.strictEqual(P.deliveryRecord(s, "atlas").typicalSlip, 0, "an early supplier is planned on its promise, never earlier");
  // Receipts in the app count too.
  const r = baseReq(s, { itemId: "MR-401", qty: 5, estUnit: 58 });
  approveAll(s, r);
  const po = P.createPO(s, "buyer", NOW, r.id, { supplierId: "tidewater", unitPrice: 58, leadDays: 2 });
  P.confirmPO(s, "buyer", NOW, po.id, day(2));
  P.postGRN(s, "warehouse", at(9), po.id, { qty: 5, result: "Accepted" });
  rec = P.deliveryRecord(s, "tidewater");
  assert.deepStrictEqual([rec.n, rec.slips[3], rec.typicalSlip], [4, 7, 3]);
  const r2 = baseReq(s, { itemId: "MR-203", qty: 1, estUnit: 910 });
  approveAll(s, r2);
  const po2 = P.createPO(s, "buyer", NOW, r2.id, { supplierId: "tidewater", unitPrice: 910, leadDays: 10 });
  P.confirmPO(s, "buyer", NOW, po2.id, day(10));
  const pd = P.plannedDate(s, po2);
  assert.deepStrictEqual([pd.promised, pd.planned], [day(10), day(13)]);
});

test("a project plans on supplier records and flags bookings that would stand idle", () => {
  const s = seed(NOW);
  const st = P.projectStatus(s, s.projects[0], day(0));
  const seal = st.rows.find(r => r.item.id === "MR-203");
  assert.strictEqual(P.daysBetween(seal.promised, seal.expectedShown), 3, "the seal kit is planned 3 days after its promise");
  assert.strictEqual(st.gating.item.id, "MR-203");
  assert.deepStrictEqual(st.idle.map(r => r.item.id), ["SV-502"], "the crane is booked before the seal kit can arrive");
  assert.ok(st.idle[0].idleDays > 0);
  assert.strictEqual(st.delayCost, st.daysLate * 4200);
});

test("the seed has five projects, and the pump overhaul is held up by its seal kit", () => {
  const s = seed(NOW);
  assert.strictEqual(s.projects.length, 5);
  const pump = P.projectStatus(s, s.projects[0], day(0));
  assert.strictEqual(pump.gating.item.id, "MR-203");
  assert.ok(pump.delayCost > 0, "the pump overhaul has a cost per day, so its delay has a cost");
  assert.ok(P.queueFor(s, "requester", NOW).some(q => q.label === "Your projects that are late or at risk"));
});

// ---------- item knowledge ----------
test("Engineering, Quality and the Requester log lessons, and each needs what happened, why and what to do next", () => {
  const s = P.newState();
  const f = { itemId: "MR-203", kind: "Failure in use", what: "The seal leaked after 3 weeks.", why: "O-rings rated too low.", next: "State the liquid temperature on the request." };
  throwsWith(() => P.addLesson(s, "buyer", NOW, f), "cannot do this");
  throwsWith(() => P.addLesson(s, "engineering", NOW, Object.assign({}, f, { kind: "Gossip" })), "what kind of lesson");
  throwsWith(() => P.addLesson(s, "engineering", NOW, Object.assign({}, f, { what: "Bad" })), "what happened");
  throwsWith(() => P.addLesson(s, "engineering", NOW, Object.assign({}, f, { why: "" })), "Not known yet");
  throwsWith(() => P.addLesson(s, "engineering", NOW, Object.assign({}, f, { next: "" })), "what to do next time");
  ["engineering", "quality", "requester"].forEach(role => P.addLesson(s, role, NOW, f));
  assert.deepStrictEqual(P.itemKnowledge(s, "MR-203").lessons.map(l => l.id).sort(), ["LES-1101", "LES-1102", "LES-1103"]);
  assert.ok(s.audit.some(a => a.entity === "MR-203" && a.action.indexOf("Lesson logged") === 0));
});

test("the item card picks up failed technical reviews and receipt problems on its own, and finds look alike items", () => {
  const s = seed(NOW);
  const board = P.itemKnowledge(s, "CP-202");
  assert.strictEqual(board.reviews.length, 1, "the failed offer on RFX-3003");
  assert.ok(board.reviews[0].note.indexOf("revision") >= 0);
  const film = P.itemKnowledge(s, "PK-102");
  assert.deepStrictEqual(film.receipts.map(r => r.result), ["Hold"]);
  assert.strictEqual(film.lessons.length, 1, "Quality logged one");
  assert.deepStrictEqual(P.similarItems("MR-203").map(i => i.id), ["MR-209"]);
  assert.deepStrictEqual(P.similarItems("MR-403").map(i => i.id), [], "gloves look like nothing else");
  assert.strictEqual(s.lessons.length, 4);
});

test("Engineering and Quality revise an item guide with a reason, and every version is kept", () => {
  const s = P.newState();
  const base = { what: "A kit to rebuild a pump seal.", where: "Pumps.", drawing: "<svg></svg>", specs: [["Shaft diameter", "Must match."]], ask: ["Exact replacement?"] };
  const f = { itemId: "MR-203", what: "A kit to rebuild a mechanical seal on a pump.", where: "Pumps for water and coolant.",
    specs: [["Shaft diameter", "Must match."], ["", ""], ["Liquid temperature", "O-rings rated too low harden."]], ask: "Exact replacement?\n\nO-ring rating?", reason: "Added the liquid temperature after a failure." };
  throwsWith(() => P.editGuide(s, "buyer", NOW, f, base), "cannot do this");
  throwsWith(() => P.editGuide(s, "requester", NOW, f, base), "cannot do this");
  throwsWith(() => P.editGuide(s, "engineering", NOW, Object.assign({}, f, { what: "Seal" }), base), "what the item is");
  throwsWith(() => P.editGuide(s, "engineering", NOW, Object.assign({}, f, { specs: [["Shaft diameter", ""]] }), base), "name and why it matters");
  throwsWith(() => P.editGuide(s, "engineering", NOW, Object.assign({}, f, { specs: [] }), base), "at least one spec");
  throwsWith(() => P.editGuide(s, "engineering", NOW, Object.assign({}, f, { ask: "  \n " }), base), "at least one question");
  throwsWith(() => P.editGuide(s, "engineering", NOW, Object.assign({}, f, { reason: "" }), base), "what you changed and why");
  throwsWith(() => P.editGuide(s, "engineering", NOW, Object.assign({}, base, { itemId: "MR-203", reason: "No real change here." }), base), "Nothing changed");
  const r = P.editGuide(s, "engineering", NOW, f, base);
  assert.strictEqual(r.rev, 2, "the written guide is version 1");
  assert.deepStrictEqual(r.specs.map(x => x[0]), ["Shaft diameter", "Liquid temperature"], "blank spec rows are dropped");
  assert.deepStrictEqual(r.ask, ["Exact replacement?", "O-ring rating?"]);
  const g = P.itemGuide(s, "MR-203", base);
  assert.strictEqual(g.what, f.what);
  assert.strictEqual(g.drawing, "<svg></svg>", "the drawing stays with the written guide");
  assert.strictEqual(P.editGuide(s, "quality", NOW, Object.assign({}, f, { where: "Pumps for water, coolant and oil." }), base).rev, 3);
  assert.deepStrictEqual(P.guideRevisions(s, "MR-203").map(x => x.rev), [3, 2], "newest first");
  assert.strictEqual(P.itemGuide(s, "MR-203", base).where, "Pumps for water, coolant and oil.");
  assert.ok(s.audit.some(a => a.entity === "MR-203" && a.action.indexOf("Guide revised on MR-203 (version 2)") === 0));
  const first = P.editGuide(s, "quality", NOW, f, null);
  assert.ok(first.rev === 4 && P.itemGuide(s, "MR-405", null) === null, "an item without a guide has none until one is written");
  const glove = P.editGuide(s, "quality", NOW, Object.assign({}, f, { itemId: "MR-403" }), null);
  assert.strictEqual(glove.rev, 1, "a first guide written in the app is version 1");
  assert.ok(s.audit.some(a => a.action.indexOf("Guide written for MR-403") === 0));
});

test("lessons logged after the guide last changed are flagged for the guide", () => {
  const s = seed(NOW);
  assert.strictEqual(P.guideRevisions(s, "MR-203")[0].by, "engineering", "Engineering put the March lesson into the seal guide");
  assert.strictEqual(P.lessonsSinceGuide(s, "MR-203").length, 0, "so nothing waits on it");
  assert.strictEqual(P.lessonsSinceGuide(s, "CP-202").length, 1, "the board lesson is newer than its guide");
  P.addLesson(s, "quality", "2026-10-27T10:00:00.000Z", { itemId: "MR-203", kind: "Other", what: "A spring arrived bent in one kit.", why: "Not known yet", next: "Check the springs at receipt." });
  assert.strictEqual(P.lessonsSinceGuide(s, "MR-203").length, 1);
});

test("seed builds without breaking any rule and covers every stage", () => {
  const s = seed(NOW);
  const m = P.metrics(s, NOW);
  assert.strictEqual(s.requests.length, 21);   // includes four requests for the pump overhaul project
  assert.ok(m.pending >= 2, "pending approvals");
  assert.ok(m.awaitingSourcing >= 1, "awaiting sourcing");
  assert.ok(s.rfx.some(x => x.status === "Open"));
  assert.ok(s.rfx.some(x => x.status === "Evaluating"));
  assert.ok(s.rfx.some(x => x.status === "Awarded"));
  assert.ok(s.grns.some(g => g.result === "Hold"));
  assert.strictEqual(m.exceptions, 3);
  assert.ok(s.ses.some(e => e.status === "Submitted") && s.ses.some(e => e.status === "Accepted"), "service entries waiting and accepted");
  assert.strictEqual(m.paid, 2);   // the solvent invoice and the first month of technician hours
  assert.ok(m.ctb.Late >= 1 && m.ctb["At Risk"] >= 1 && m.ctb.Clear >= 0);
  assert.ok(m.cycleDays > 0);
  assert.ok(s.requests.some(r => r.status === "Rejected"));
});

test("seed exceptions have the expected owners", () => {
  const s = seed(NOW);
  const owners = s.invoices.filter(i => i.status === "Exception").map(i => P.invOwners(i)[0]).sort();
  assert.deepStrictEqual(owners, ["buyer", "director", "warehouse"]);
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
  assert.strictEqual(c1.orderedOpen, 87950);   // includes the scaffold release from CT-8003
  assert.strictEqual(c1.requested, 19600);
  assert.strictEqual(c1.remaining, 24930);
  assert.strictEqual(c1.pct, 83);
  assert.strictEqual(by["CC-200 Engineering"].requested, 61540);   // includes the awarded RFx at its quoted value
  assert.strictEqual(by["CC-300 Maintenance"].pct, 80);   // includes the service POs and the pump overhaul
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
  techOK(s, x);
  const later = at(5);
  assert.strictEqual(P.scoreRFx(x, s, later).find(q => q.supplierId === "northfield").expired, true);
  throwsWith(() => P.recommendAward(s, "buyer", later, x.id, "northfield", ""), "expired on");
  throwsWith(() => P.extendQuote(s, "requester", later, x.id, "northfield", day(20), "Confirmed by email"), "cannot do this");
  throwsWith(() => P.extendQuote(s, "buyer", later, x.id, "northfield", day(20), ""), "how the supplier confirmed");
  throwsWith(() => P.extendQuote(s, "buyer", later, x.id, "northfield", day(1), "Confirmed by email"), "in the past");
  throwsWith(() => P.extendQuote(s, "buyer", later, x.id, "helio", day(10), "Confirmed by email"), "later than");
  P.extendQuote(s, "buyer", later, x.id, "northfield", day(20), "Confirmed by email");
  award(s, later, x, "northfield", "");
  assert.strictEqual(x.status, "Awarded");
});

test("an awarded quote that lapses before the PO blocks the PO until revalidated", () => {
  const { s, r } = rfxFixture();
  const x = P.startRFx(s, "buyer", NOW, r.id, Object.assign({ type: "RFQ", invited: ["northfield", "helio"] }, W));
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "northfield", unitPrice: 200, leadDays: 20, validUntil: day(2) });
  P.addQuote(s, "buyer", NOW, x.id, { supplierId: "helio", unitPrice: 230, leadDays: 25, validUntil: day(2) });
  P.closeBidding(s, "buyer", NOW, x.id);
  techOK(s, x);
  award(s, NOW, x, "northfield", "");
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
  techOK(s, x);
  s.docs.northfield.subtier = day(-1);
  const ranked = P.scoreRFx(x, s, NOW);
  assert.strictEqual(ranked.find(q => q.supplierId === "northfield").eligible, false);
  throwsWith(() => P.recommendAward(s, "buyer", NOW, x.id, "northfield", ""), "Sub-tier disclosure expired on");
  throwsWith(() => P.renewDoc(s, "buyer", NOW, "northfield", "subtier", day(300), "Reviewed new disclosure"), "cannot do this");
  throwsWith(() => P.renewDoc(s, "quality", NOW, "northfield", "subtier", day(-1), "Reviewed new disclosure"), "in the future");
  throwsWith(() => P.renewDoc(s, "quality", NOW, "northfield", "subtier", day(300), ""), "what was checked");
  P.renewDoc(s, "quality", NOW, "northfield", "subtier", day(300), "Reviewed new disclosure, ref SD-2291");
  assert.ok(s.audit.some(a => a.action.indexOf("Document renewed") === 0));
  // Data saved before a supplier existed has no document record for it. Renewal must still work.
  delete s.docs.keystone;
  P.renewDoc(s, "quality", NOW, "keystone", "quality", day(300), "Certificate QC-2207 checked");
  assert.strictEqual(s.docs.keystone.quality, day(300));
  award(s, NOW, x, "northfield", "");
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
test("committed spend and pipeline always list every category", () => {
  const m = P.metrics(P.newState(), NOW);
  assert.deepStrictEqual(Object.keys(m.spend), ["Raw materials", "Components", "Packaging", "MRO", "Services"]);
  const m2 = P.metrics(seed(NOW), NOW);
  assert.strictEqual(m2.spend["Raw materials"], 100520);
  assert.strictEqual(m2.spend.Packaging, 7700);
  assert.strictEqual(m2.spend.MRO, 8962);
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

// ---------- expedite list and email drafts ----------
test("the expedite list ranks overdue, then late, then at risk, then unconfirmed, and skips received POs", () => {
  const s = seed(NOW);
  const rows = P.expediteList(s, NOW);
  assert.deepStrictEqual(rows.map(r => r.po.id + ":" + r.kind), ["PO-4006:late", "PO-4011:late", "PO-4007:risk", "PO-4001:risk"]);
  assert.strictEqual(rows[0].left, 20);
  assert.strictEqual(rows[0].value, 1840);
  assert.ok(!rows.some(r => r.po.id === "PO-4002"), "a fully received PO must not be listed");
  // the same PO a week later has passed its own promise date, which outranks everything else
  const later = P.expediteList(s, "2026-11-12T14:00:00.000Z");
  assert.strictEqual(later[0].kind, "overdue");
  assert.ok(later[0].reason.indexOf("Promise date passed") === 0);
});

test("units already received or on quality hold are not counted as still due", () => {
  const s = seed(NOW);
  const row = P.expediteList(s, NOW).find(r => r.po.id === "PO-4001");
  assert.strictEqual(row.left, 800);                              // 2000 ordered, 1200 accepted
  const hold = P.expediteList(s, "2026-11-12T14:00:00.000Z").find(r => r.po.id === "PO-4003");
  assert.strictEqual(hold, undefined, "goods on quality hold are already here, so nothing is still due from the supplier");
});

test("an issued PO with no confirmation after two days is listed as not confirmed", () => {
  const s = P.newState();
  const r = baseReq(s, { qty: 10, estUnit: 90, needBy: "2026-12-31" }); approveAll(s, r);
  const po = P.createPO(s, "buyer", "2026-10-20T10:00:00.000Z", r.id, { supplierId: "atlas", unitPrice: 84, leadDays: 20 });
  assert.strictEqual(P.expediteList(s, "2026-10-21T10:00:00.000Z").length, 0);
  const row = P.expediteList(s, "2026-10-26T10:00:00.000Z")[0];
  assert.strictEqual(row.kind, "confirm");
  P.confirmPO(s, "buyer", "2026-10-26T11:00:00.000Z", po.id, po.promisedDate);
  assert.strictEqual(P.expediteList(s, "2026-10-26T12:00:00.000Z").length, 0);
});

test("the chase draft uses the PO facts and the right wording for each situation", () => {
  const s = seed(NOW);
  const d = P.chaseDraft(s, "PO-4006", "late", "Jordan Lee");
  assert.strictEqual(d.subject, "PO-4006: can the delivery date move up?");
  ["Meridian MRO team", "20 cases of Grease cartridge, 400 g", "Promised: 3 Nov 2026", "Needed by: 29 Oct 2026", "Deliver to: Plant B", "Jordan Lee"]
    .forEach(t => assert.ok(d.body.indexOf(t) >= 0, "missing: " + t));
  assert.ok(P.chaseDraft(s, "PO-4006", "confirm", "J").subject.indexOf("please confirm") > 0);
  assert.ok(P.chaseDraft(s, "PO-4006", "overdue", "J").body.indexOf("has passed") > 0);
  assert.strictEqual(d.to, "", "demo suppliers have no saved address");
});

test("supplier addresses are validated, saved by the buyer only, and used in drafts", () => {
  const s = seed(NOW);
  throwsWith(() => P.setContact(s, "ap", NOW, "meridian", "a@b.co"), "cannot do this");
  throwsWith(() => P.setContact(s, "buyer", NOW, "meridian", "not an email"), "does not look like an email");
  P.setContact(s, "buyer", NOW, "meridian", " orders@example.com ");
  assert.strictEqual(P.contactOf(s, "meridian"), "orders@example.com");
  assert.strictEqual(P.chaseDraft(s, "PO-4006", "late", "J").to, "orders@example.com");
  assert.strictEqual(P.expediteList(s, NOW)[0].email, "orders@example.com");
  P.setContact(s, "buyer", NOW, "meridian", "");
  assert.strictEqual(P.contactOf(s, "meridian"), "");
  assert.strictEqual(P.contactOf({ audit: [] }, "meridian"), "", "old saved data without contacts still works");
});

test("mail links encode the draft, and long drafts are flagged", () => {
  const l = P.mailLinks({ to: "a@b.co", subject: "PO-1: hi & bye", body: "Line one\nLine two" });
  assert.ok(l.mailto.indexOf("mailto:a@b.co?subject=PO-1%3A%20hi%20%26%20bye&body=Line%20one%0D%0ALine%20two") === 0, l.mailto);
  assert.ok(l.gmail.indexOf("https://mail.google.com/mail/?view=cm") === 0 && l.gmail.indexOf("to=a%40b.co") > 0);
  assert.ok(l.outlook.indexOf("https://outlook.office.com/mail/deeplink/compose") === 0);
  assert.strictEqual(l.tooLong, false);
  assert.strictEqual(P.mailLinks({ to: "", subject: "x", body: "word ".repeat(400) }).tooLong, true);
  const eml = P.emlText({ to: "a@b.co", subject: "S", body: "x\ny" });
  assert.ok(eml.indexOf("To: a@b.co\r\nSubject: S\r\nX-Unsent: 1") === 0 && eml.endsWith("\r\n\r\nx\r\ny"));
});

test("opening a draft is logged as drafted, never as sent, and only the buyer can do it", () => {
  const s = seed(NOW);
  throwsWith(() => P.logChase(s, "warehouse", NOW, "PO-4006", "Gmail"), "cannot do this");
  P.logChase(s, "buyer", NOW, "PO-4006", "Gmail");
  const a = s.audit[s.audit.length - 1];
  assert.ok(a.action.indexOf("Chase email drafted for Meridian MRO") === 0 && a.note.indexOf("cannot tell if it was sent") > 0);
  assert.ok(!/sent to/i.test(a.action));
  assert.strictEqual(P.lastChase(s, "PO-4006"), "2026-10-26");
  assert.strictEqual(P.expediteList(s, NOW)[0].lastChase, "2026-10-26");
});

test("the buyer queue shows how many POs need chasing", () => {
  const q = P.queueFor(seed(NOW), "buyer", NOW).find(i => i.tab === "expedite");
  assert.strictEqual(q.count, 4);
});

test("document flow links a PO to its request, PR, RFx, receipts and invoices from any of its ids", () => {
  const s = seed(NOW);
  ["REQ-1001", "PR-2001", "RFX-3001", "PO-4001", "GRN-5001", "po-4001"].forEach(id => {
    const f = P.docFlow(s, id);
    assert.ok(f, id + " should resolve");
    assert.strictEqual(f.request.id, "REQ-1001", id);
    assert.strictEqual(f.rfx.id, "RFX-3001", id);
    assert.strictEqual(f.po.id, "PO-4001", id);
    assert.deepStrictEqual(f.grns.map(g => g.id), ["GRN-5001"], id);
  });
  const paid = P.docFlow(s, "INV-6001");
  assert.strictEqual(paid.po.id, "PO-4002");
  assert.deepStrictEqual(paid.invoices.map(i => i.id), ["INV-6001"]);
});

test("document flow shows what does not exist yet, and unknown ids return nothing", () => {
  const s = seed(NOW);
  const pending = P.docFlow(s, "REQ-1012");
  assert.strictEqual(pending.rfx, null);
  assert.strictEqual(pending.po, null);
  assert.deepStrictEqual(pending.grns, []);
  const contract = P.docFlow(s, "PO-4004");
  assert.strictEqual(contract.rfx, null);
  assert.strictEqual(P.docFlow(s, "PO-9999"), null);
  assert.strictEqual(P.docFlow(s, "hello"), null);
});

test("the requester's queue counts only their own rejected requests", () => {
  const s = seed(NOW), rej = () => (P.queueFor(s, "requester", NOW).find(q => q.label.indexOf("rejected") >= 0) || { count: 0 }).count;
  assert.ok(s.requests.some(r => r.status === "Rejected" && r.requester !== "Maya Chen"), "seed has someone else's rejected request");
  assert.strictEqual(rej(), 0, "someone else's rejection should not count");
  const r = P.createRequest(s, "requester", NOW, { requester: "Maya Chen", itemId: "MR-405", qty: 2, estUnit: 84, needBy: day(10),
    site: "Plant A", costCenter: "CC-300 Maintenance", reason: "Spare kits" });
  P.decide(s, "manager", NOW, r.id, "Rejected", "Use stock on hand first");
  assert.strictEqual(rej(), 1, "her own rejection counts");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
