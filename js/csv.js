/* CSV import and export for the P2P Workbench.
 * Pure functions with no page code, so the same code runs in the browser and in the tests.
 * Export turns the records behind each screen into rows. Import never writes records directly:
 * every row runs through the same engine action and role check as the form on that screen.
 * Import is all or nothing. It runs on a copy of the data, and if any row breaks a rule,
 * nothing is kept and every problem is listed by row. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./logic.js"));
  else root.P2P.csv = factory(root.P2P);
})(typeof self !== "undefined" ? self : this, function (P) {
  "use strict";

  var REF = P.REF;
  var MAX_ROWS = 1000;
  var fail = function (m) { throw new Error(m); };

  // ---------- reading CSV text ----------
  // Handles quoted values, doubled quotes, commas and line breaks inside quotes, CRLF and a leading BOM.
  // Files saved with semicolons or tabs between values (some spreadsheet locales do this) are read too.
  function parse(text) {
    text = String(text === null || text === undefined ? "" : text);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var first = text.split(/\r?\n/)[0];
    var sep = first.indexOf(",") < 0 && first.indexOf("\t") >= 0 ? "\t" : first.indexOf(",") < 0 && first.indexOf(";") >= 0 ? ";" : ",";
    var rows = [], row = [], cell = "", quoted = false, inQuotes = false;
    function endCell() { row.push(cell); cell = ""; quoted = false; }
    function endRow() { endCell(); rows.push(row); row = []; }
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
        } else cell += c;
      } else if (c === '"' && cell === "" && !quoted) { inQuotes = true; quoted = true; }
      else if (c === sep) endCell();
      else if (c === "\r") { if (text[i + 1] === "\n") i++; endRow(); }
      else if (c === "\n") endRow();
      else cell += c;
    }
    if (inQuotes) fail("A quoted value is never closed. Look for a stray quote mark in the file.");
    if (cell !== "" || row.length) endRow();
    return rows;
  }

  // ---------- writing CSV text ----------
  // A text value that starts with = + - or @ could run as a formula in a spreadsheet, so it gets a leading apostrophe.
  // Plain numbers, including negative ones, are left alone.
  function cellText(v) {
    if (v === null || v === undefined) return "";
    var t = String(v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(t) && !/^[-+]?\d+(\.\d+)?$/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) || /^\s|\s$/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function stringify(rows) {
    return rows.map(function (r) { return r.map(cellText).join(","); }).join("\r\n") + "\r\n";
  }

  // ---------- small helpers ----------
  var m2 = function (n) { return (Math.round(Number(n) * 100) / 100).toFixed(2); };
  var yes = function (b) { return b ? "Yes" : "No"; };
  var key = function (t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
  var clean = function (v) { return String(v === null || v === undefined ? "" : v).trim(); };
  var item = function (id) { return REF.items.find(function (i) { return i.id === id; }); };
  var supplier = function (id) { return REF.suppliers.find(function (x) { return x.id === id; }); };
  var supName = function (id) { var sp = supplier(id); return sp ? sp.name : id; };

  // Money and percent cells often come back from a spreadsheet as "$1,234.50" or "12%".
  function num(v) {
    var t = clean(v).replace(/[$,\s%]/g, "");
    return t === "" ? "" : Number(t);
  }
  // Dates as 2026-12-15, or 12/15/2026 (month first) as US spreadsheets save them.
  function date(v, label) {
    var t = clean(v);
    if (!t) return "";
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
    if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (m) return m[3] + "-" + ("0" + m[1]).slice(-2) + "-" + ("0" + m[2]).slice(-2);
    return fail(label + " \"" + t + "\" is not a date. Use 2026-12-15 or 12/15/2026.");
  }

  // Lookups accept the code or the full name, in any letter case.
  function findItem(v) {
    var k = key(v);
    if (!k) fail("Item is blank.");
    return REF.items.find(function (i) { return key(i.id) === k || key(i.name) === k; }) ||
      fail("Unknown item \"" + clean(v) + "\". Use an item code such as " + REF.items[0].id + ".");
  }
  function findSupplier(v) {
    var k = key(v);
    if (!k) fail("Supplier is blank.");
    return REF.suppliers.find(function (x) { return key(x.id) === k || key(x.name) === k; }) ||
      fail("Unknown supplier \"" + clean(v) + "\". Use the supplier name or ID from the Suppliers screen.");
  }
  function findCostCenter(v) {
    var k = key(v);
    if (!k) fail("Cost center is blank.");
    return REF.costCenters.find(function (c) { return key(c) === k || key(c.split(" ")[0]) === k; }) ||
      fail("Unknown cost center \"" + clean(v) + "\". Use one of: " + REF.costCenters.join(", ") + ".");
  }
  function findSite(v) {
    var k = key(v);
    if (!k) fail("Site is blank.");
    return REF.sites.find(function (x) { return key(x) === k; }) ||
      fail("Unknown site \"" + clean(v) + "\". Use one of: " + REF.sites.join(", ") + ".");
  }
  function findDocType(v) {
    var k = key(v);
    var hit = Object.keys(REF.docTypes).find(function (d) { return key(d) === k || key(REF.docTypes[d]) === k; });
    return hit || fail("Unknown document \"" + clean(v) + "\". Use one of: " + Object.keys(REF.docTypes).map(function (d) { return REF.docTypes[d]; }).join(", ") + ".");
  }
  function findPO(s, v) {
    var id = clean(v).toUpperCase();
    if (!id) fail("PO is blank.");
    return s.pos.find(function (p) { return p.id === id; }) || fail(id + " was not found.");
  }
  function grnResult(v) {
    var k = key(v);
    if (!k || k === "accepted" || k === "accept") return "Accepted";
    if (k === "rejected" || k === "reject") return "Rejected";
    if (k === "hold" || k === "onhold" || k === "qualityhold") return "Hold";
    return fail("Result \"" + clean(v) + "\" must be Accepted, Rejected or Hold.");
  }

  // ---------- exports, one per screen ----------
  var KIND_LABEL = { overdue: "Overdue", late: "Late", risk: "At risk", confirm: "Not confirmed" };
  var docCell = function (d) { return d ? (d.status === "Missing" ? "Missing" : d.expires) : "Not needed"; };

  var EXPORTS = {
    dashboard: { file: "budget", label: "budget by cost center", build: function (s) {
      return [["Cost center", "Budget", "Paid", "Ordered not paid", "Requested", "Used", "Remaining", "Percent used"]].concat(
        P.budgetStatus(s).map(function (b) {
          return [b.name, m2(b.budget), m2(b.paid), m2(b.orderedOpen), m2(b.requested), m2(b.used), m2(b.remaining), b.pct];
        }));
    } },

    requests: { file: "requests", label: "requests and PRs", build: function (s) {
      return [["Request", "PR", "Status", "Item", "Item name", "Category", "Quantity", "UoM", "Est unit price", "Est total", "Need by",
        "Site", "Cost center", "Requester", "Reason", "Approvals", "Over budget", "Created", "RFx", "PO"]].concat(
        s.requests.map(function (r) {
          var it = item(r.itemId) || {};
          return [r.id, r.prNo, r.status, r.itemId, it.name, it.category, r.qty, r.uom, m2(r.estUnit), m2(P.requestTotal(r)), r.needBy,
            r.site, r.costCenter, r.requester, r.reason,
            r.approvals.map(function (a) { return P.roleLabel(a.role) + ": " + a.status; }).join("; "),
            yes(r.overBudget), P.dateOf(r.createdAt), r.rfxId, r.poId];
        }));
    } },

    // One row per invited supplier, with the score for those who quoted.
    rfx: { file: "rfx-quotes", label: "RFx quotes", build: function (s, now) {
      var rows = [["RFx", "Type", "RFx status", "Request", "PR", "Item", "Quantity", "Weights price/lead/quality", "Supplier", "Supplier status",
        "Quote", "Unit price", "Tariff %", "Freight per unit", "Landed unit", "Lead days", "Valid until", "Terms", "Score", "Rank", "Can win", "Awarded",
        "Technical", "Technical note"]];
      s.rfx.forEach(function (x) {
        var r = s.requests.find(function (q) { return q.id === x.requestId; }) || {};
        var base = [x.id, x.type, x.status, x.requestId, r.prNo, r.itemId, r.qty, x.weights.price + "/" + x.weights.lead + "/" + x.weights.quality];
        var ranked = P.scoreRFx(x, s, now);
        ranked.forEach(function (q, i) {
          var why = q.eligible ? (q.expired ? "Quote expired" : "Yes") : q.tech === "Pending" ? "Waiting for the technical review" : !q.techOk ? "No, fails the technical check" :
            q.supplierStatus === "Not qualified" ? "No, not qualified" : "No, document expired or missing";
          rows.push(base.concat([supName(q.supplierId), q.supplierStatus, "Quoted", m2(q.unitPrice), q.tariffPct, m2(q.freight), m2(q.landed), q.leadDays,
            q.validUntil, q.terms, q.total, i + 1, why, yes(x.award && x.award.supplierId === q.supplierId), q.tech, q.techNote]));
        });
        x.invited.filter(function (id) { return !x.quotes.some(function (q) { return q.supplierId === id; }); }).forEach(function (id) {
          rows.push(base.concat([supName(id), (supplier(id) || {}).status, "No quote", "", "", "", "", "", "", "", "", "", "", "No", "", ""]));
        });
      });
      return rows;
    } },

    pos: { file: "purchase-orders", label: "purchase orders", build: function (s) {
      return [["PO", "Request", "PR", "Source", "RFx", "Supplier", "Item", "Item name", "Quantity", "UoM", "Unit price", "PO value", "Landed value",
        "Tariff %", "Freight per unit", "Reference price", "Price reason", "Site", "Need by", "Promised", "Confirmed", "Status",
        "Accepted", "On hold", "Rejected", "Invoiced", "Delivery health", "Slack days", "Created"]].concat(
        s.pos.map(function (po) {
          var it = item(po.itemId) || {}, r = s.requests.find(function (q) { return q.id === po.requestId; }) || {};
          var t = P.grnTotals(s, po.id), c = P.ctb(s, po);
          return [po.id, po.requestId, r.prNo, po.source, po.rfxId, supName(po.supplierId), po.itemId, it.name, po.qty, it.uom,
            m2(po.unitPrice), m2(P.poTotal(po)), m2(P.poLanded(po)), po.tariffPct || 0, m2(po.freight || 0), m2(po.refPrice), po.varianceReason,
            po.site, po.needBy, po.promisedDate, yes(po.confirmed), P.poStatus(s, po),
            t.accepted, t.hold, t.rejected, P.invoicedQty(s, po.id, null, ["Matched", "Paid"]), c.status, c.slack, P.dateOf(po.createdAt)];
        }));
    } },

    expedite: { file: "expedite", label: "POs to chase", build: function (s, now) {
      return [["PO", "Supplier", "Supplier email", "Item", "Item name", "Why", "Detail", "Still due", "UoM", "Value still due", "Need by", "Promised", "Last draft"]].concat(
        P.expediteList(s, now).map(function (r) {
          var it = item(r.po.itemId) || {};
          return [r.po.id, r.supplier.name, r.email, r.po.itemId, it.name, KIND_LABEL[r.kind], r.reason, r.left, it.uom, m2(r.value),
            r.po.needBy, r.po.promisedDate, r.lastChase];
        }));
    } },

    grn: { file: "receipts", label: "goods receipts", build: function (s) {
      return [["GRN", "PO", "Supplier", "Item", "Item name", "Date", "Quantity", "Result", "Note", "Quality decision note"]].concat(
        s.grns.map(function (g) {
          var po = s.pos.find(function (p) { return p.id === g.poId; }) || {}, it = item(po.itemId) || {};
          return [g.id, g.poId, supName(po.supplierId), po.itemId, it.name, g.date, g.qty, g.result, g.note, g.releaseNote];
        }));
    } },

    contracts: { file: "contracts", label: "contracts", build: function (s, now) {
      var today = P.dateOf(now);
      return [["Contract", "Supplier", "Title", "Item", "Agreed rate", "Start", "End", "Cap", "Released", "Remaining", "Status", "Basis"]].concat(
        [].concat.apply([], (s.contracts || []).map(function (c) {
          var st = P.contractStatus(s, c, today);
          return c.lines.map(function (l) {
            return [c.id, supName(c.supplierId), c.title, l.itemId, m2(l.price), c.start, c.end, m2(c.cap), m2(st.released), m2(Math.max(0, st.remaining)), st.status, c.basis];
          });
        })));
    } },
    services: { file: "service-entries", label: "service entries", build: function (s) {
      return [["Entry", "PO", "Supplier", "Service", "Unit", "Month", "Quantity", "Rate", "Value", "Work done", "Status", "Release", "Release note"]].concat(
        (s.ses || []).map(function (e) {
          var po = s.pos.find(function (p) { return p.id === e.poId; }) || {}, it = item(po.itemId) || {};
          return [e.id, e.poId, supName(po.supplierId), it.name, it.uom, e.period, e.qty, m2(po.unitPrice), m2(e.value), e.note, e.status,
            (e.releases || []).map(function (x) { return P.roleLabel(x.role) + " " + x.status.toLowerCase(); }).join(", "), e.decisionNote];
        }));
    } },

    invoices: { file: "invoices", label: "invoices", build: function (s) {
      return [["Invoice", "Supplier invoice no", "PO", "Supplier", "Quantity", "Unit price", "Amount", "Invoice date", "Due date", "Status",
        "Matched first time", "Issues", "Fix owner", "Paid on"]].concat(
        s.invoices.map(function (i) {
          var issues = i.status === "Exception" && i.match ? i.match.issues : [];
          return [i.id, i.invNo, i.poId, supName(i.supplierId), i.qty, m2(i.unitPrice), m2(i.qty * i.unitPrice), i.date, i.dueDate, i.status,
            yes(i.firstPass), issues.map(function (x) { return x.msg; }).join(" "),
            P.invOwners(i).map(P.roleLabel).join("; "), i.paidAt];
        }));
    } },

    suppliers: { file: "suppliers", label: "suppliers", build: function (s, now) {
      var today = P.dateOf(now);
      return [["Supplier ID", "Supplier", "Sells", "Status", "Rating", "Payment terms days", "Email",
        REF.docTypes.quality, REF.docTypes.origin, REF.docTypes.subtier, "Documents", "Can be awarded"]].concat(
        REF.suppliers.map(function (sp) {
          var docs = P.supplierDocs(s, sp.id, today), by = {};
          docs.forEach(function (d) { by[d.doc] = d; });
          var blocked = docs.some(function (d) { return d.status === "Expired" || d.status === "Missing"; });
          var expiring = docs.some(function (d) { return d.status === "Expiring"; });
          return [sp.id, sp.name, sp.categories.join("; "), sp.status, sp.quality, sp.terms, P.contactOf(s, sp.id),
            docCell(by.quality), docCell(by.origin), docCell(by.subtier), blocked ? "Blocked" : expiring ? "Expiring soon" : "Valid",
            sp.status === "Not qualified" ? "No, not qualified" : blocked ? "No, document expired or missing" : "Yes"];
        }));
    } },

    // The whole trail, oldest first. The screen shows the latest 200, the file has every entry.
    audit: { file: "audit-trail", label: "audit trail", build: function (s) {
      return [["When", "Role", "Record", "Action", "Detail"]].concat(
        s.audit.map(function (a) { return [String(a.at).slice(0, 16).replace("T", " "), P.roleLabel(a.role), a.entity, a.action, a.note]; }));
    } }
  };

  function exportCSV(s, tab, now) {
    var ex = EXPORTS[tab] || fail("Nothing to export on this screen.");
    var rows = ex.build(s, now);
    return { name: "p2p-" + ex.file + "-" + P.dateOf(now) + ".csv", text: stringify(rows), rows: rows.length - 1 };
  }

  // ---------- imports ----------
  // Each import names the screen it sits on, the role that may run it, its columns, and the engine action for one row.
  // A column is found by its label or an alias, ignoring case, spaces and punctuation. Extra columns are ignored.
  var IMPORTS = [
    { id: "requests", tab: "requests", role: "requester", title: "Import requests", noun: "request",
      intro: "Each row raises one purchase request, with the same approval route the form would set.",
      cols: [
        { k: "item", label: "Item", req: true, help: "Item code such as RM-101, or the item name", alias: ["itemid", "itemcode"] },
        { k: "qty", label: "Quantity", req: true, help: "Whole number above zero", alias: ["qty"] },
        { k: "est", label: "Est unit price", req: true, help: "Estimated price per unit", alias: ["estimatedunitprice", "estunit", "unitprice", "price"] },
        { k: "needBy", label: "Need by", req: true, help: "Date, today or later", alias: ["needbydate", "needdate"] },
        { k: "site", label: "Site", req: true, help: REF.sites.join(", ") },
        { k: "cc", label: "Cost center", req: true, help: "Code such as CC-100, or the full name", alias: ["costcentre"] },
        { k: "reason", label: "Reason", req: true, help: "Why it is needed, at least 5 characters" }
      ],
      run: function (s, role, now, r, o) {
        var x = P.createRequest(s, role, now, {
          requester: o.requester || "Requester", itemId: findItem(r.item).id, qty: num(r.qty), estUnit: num(r.est),
          needBy: date(r.needBy, "Need by"), site: findSite(r.site), costCenter: findCostCenter(r.cc), reason: r.reason
        });
        return x.id + " raised for " + P.fmt(P.requestTotal(x)) + ", needs " + x.approvals.map(function (a) { return P.roleLabel(a.role); }).join(", ");
      } },

    { id: "quotes", tab: "rfx", role: "buyer", title: "Import quotes", noun: "quote",
      intro: "Each row adds a supplier quote to an open RFx. A second row for the same supplier replaces its quote, the same as the form.",
      cols: [
        { k: "rfx", label: "RFx", req: true, help: "RFx number such as RFX-3001", alias: ["rfxid", "rfxno", "rfxnumber"] },
        { k: "supplier", label: "Supplier", req: true, help: "Supplier name or ID. It must be invited.", alias: ["supplierid", "suppliername"] },
        { k: "price", label: "Unit price", req: true, help: "Quoted price per unit", alias: ["price", "quotedprice"] },
        { k: "lead", label: "Lead days", req: true, help: "Whole number of days, at least 1", alias: ["leadtime", "leadtimedays", "lead"] },
        { k: "tariff", label: "Tariff %", req: false, help: "0 to 100. Blank means 0", alias: ["tariff", "tariffpct", "tariffpercent"] },
        { k: "freight", label: "Freight per unit", req: false, help: "Blank means 0", alias: ["freight"] },
        { k: "valid", label: "Valid until", req: false, help: "Date. Blank means 30 days from today", alias: ["validity", "quotevalidity"] },
        { k: "terms", label: "Terms", req: false, help: "Free text, such as Net 45" }
      ],
      run: function (s, role, now, r) {
        var sp = findSupplier(r.supplier), id = clean(r.rfx).toUpperCase();
        if (!id) fail("RFx is blank.");
        P.addQuote(s, role, now, id, { supplierId: sp.id, unitPrice: num(r.price), leadDays: num(r.lead), tariffPct: num(r.tariff),
          freight: num(r.freight), validUntil: date(r.valid, "Valid until"), terms: r.terms });
        return "Quote from " + sp.name + " added to " + id;
      } },

    { id: "confirmations", tab: "pos", role: "buyer", title: "Import supplier confirmations", noun: "confirmation",
      intro: "Each row records the delivery date a supplier gave for a PO. The first date confirms the PO. Moving a date that was already confirmed needs a note, the same as on the screen.",
      cols: [
        { k: "po", label: "PO", req: true, help: "PO number such as PO-4001", alias: ["poid", "pono", "ponumber"] },
        { k: "date", label: "Promised date", req: true, help: "Date the supplier committed to", alias: ["promised", "confirmeddate", "deliverydate"] },
        { k: "note", label: "Note", req: false, help: "Why the date moved. Needed only when it changes after confirmation" }
      ],
      run: function (s, role, now, r) {
        var po = findPO(s, r.po), d = date(r.date, "Promised date");
        if (!d) fail("Promised date is blank.");
        if (!po.confirmed) { P.confirmPO(s, role, now, po.id, d); return po.id + " confirmed for " + d; }
        if (po.promisedDate === d) return po.id + " already confirmed for " + d + ", no change";
        P.updatePromise(s, role, now, po.id, d, r.note);
        return po.id + " date moved to " + d;
      } },

    { id: "receipts", tab: "grn", role: "warehouse", title: "Import receipts", noun: "receipt",
      intro: "Each row posts one goods receipt against a PO. Over receipt is blocked, the same as on the screen.",
      cols: [
        { k: "po", label: "PO", req: true, help: "PO number such as PO-4001", alias: ["poid", "pono", "ponumber"] },
        { k: "qty", label: "Quantity", req: true, help: "Whole number above zero", alias: ["qty", "receivedqty", "quantityreceived"] },
        { k: "result", label: "Result", req: false, help: "Accepted, Rejected or Hold. Blank means Accepted", alias: ["status"] },
        { k: "note", label: "Note", req: false, help: "Needed for Rejected or Hold" }
      ],
      run: function (s, role, now, r) {
        var po = findPO(s, r.po);
        var g = P.postGRN(s, role, now, po.id, { qty: num(r.qty), result: grnResult(r.result), note: r.note });
        return g.id + " posted on " + po.id + ": " + g.qty + " " + g.result.toLowerCase();
      } },

    { id: "invoices", tab: "invoices", role: "ap", title: "Import invoices", noun: "invoice",
      intro: "Each row enters one supplier invoice and runs the three way match. An invoice that does not match is still entered, as an exception with a fix owner, the same as the form.",
      cols: [
        { k: "no", label: "Invoice number", req: true, help: "The supplier's own invoice number", alias: ["invoiceno", "supplierinvoiceno", "supplierinvoicenumber", "invno", "invoice"] },
        { k: "po", label: "PO", req: true, help: "PO number such as PO-4001", alias: ["poid", "pono", "ponumber"] },
        { k: "qty", label: "Quantity", req: true, help: "Units billed", alias: ["qty"] },
        { k: "price", label: "Unit price", req: true, help: "Price per unit on the invoice", alias: ["price"] },
        { k: "date", label: "Invoice date", req: true, help: "Date on the invoice", alias: ["date"] }
      ],
      run: function (s, role, now, r) {
        var po = findPO(s, r.po);
        var i = P.enterInvoice(s, role, now, { poId: po.id, invNo: r.no, qty: num(r.qty), unitPrice: num(r.price), date: date(r.date, "Invoice date") });
        return i.id + " (" + i.invNo + ") " + (i.status === "Matched" ? "matched" : "entered as an exception: " + i.match.issues.map(function (x) { return x.msg; }).join(" "));
      } },

    { id: "contacts", tab: "suppliers", role: "buyer", title: "Import supplier emails", noun: "email",
      intro: "Each row saves the email address used in chase drafts on the Expedite screen. A row with a blank email is skipped.",
      cols: [
        { k: "supplier", label: "Supplier", req: true, help: "Supplier name or ID", alias: ["supplierid", "suppliername"] },
        { k: "email", label: "Email", req: true, help: "Address to send chase drafts to", alias: ["emailaddress", "supplieremail"] }
      ],
      run: function (s, role, now, r) {
        var sp = findSupplier(r.supplier);
        if (!r.email) return sp.name + " skipped, no email given";
        P.setContact(s, role, now, sp.id, r.email);
        return "Email saved for " + sp.name;
      } },

    { id: "documents", tab: "suppliers", role: "quality", title: "Import document renewals", noun: "renewal",
      intro: "Each row records a renewed supplier document, the same as the renewal form. The new expiry must be later than the current one.",
      cols: [
        { k: "supplier", label: "Supplier", req: true, help: "Supplier name or ID", alias: ["supplierid", "suppliername"] },
        { k: "doc", label: "Document", req: true, help: Object.keys(REF.docTypes).map(function (d) { return REF.docTypes[d]; }).join(", "), alias: ["documenttype", "doctype"] },
        { k: "expiry", label: "New expiry", req: true, help: "Date in the future", alias: ["expiry", "expires", "expirydate", "validuntil"] },
        { k: "note", label: "What was checked", req: true, help: "Certificate number, issuing body, reviewer", alias: ["note", "notes"] }
      ],
      run: function (s, role, now, r) {
        var sp = findSupplier(r.supplier), d = findDocType(r.doc);
        P.renewDoc(s, role, now, sp.id, d, date(r.expiry, "New expiry"), r.note);
        return REF.docTypes[d] + " for " + sp.name + " valid until " + date(r.expiry, "New expiry");
      } }
  ];

  var importById = function (id) { return IMPORTS.find(function (x) { return x.id === id; }) || fail("Unknown import " + id + "."); };
  var importsFor = function (tab) { return IMPORTS.filter(function (x) { return x.tab === tab; }); };

  // A file with just the headings, ready to fill in.
  function template(id) {
    var spec = importById(id);
    return { name: "p2p-" + spec.id + "-template.csv", text: stringify([spec.cols.map(function (c) { return c.label; })]) };
  }

  // Runs every row on a copy of the state. Returns { ok, state, rows, errors, total }.
  // ok is true only when every row passed. state is the copy with the rows applied, ready to keep.
  function runImport(state, id, text, role, now, opts) {
    var spec = importById(id);
    opts = opts || {};
    if (role !== spec.role) fail(spec.title + " is for the " + P.roleLabel(spec.role) + " role. Switch roles at the top.");
    var all = parse(text).map(function (cells, i) { return { cells: cells, row: i + 1 }; })
      .filter(function (r) { return r.cells.some(function (c) { return clean(c) !== ""; }); });
    if (!all.length) fail("The file is empty.");
    var head = all[0].cells.map(key), idx = {}, missing = [];
    spec.cols.forEach(function (c) {
      var names = [key(c.label), key(c.k)].concat(c.alias || []);
      idx[c.k] = head.findIndex(function (h) { return names.indexOf(h) >= 0; });
      if (idx[c.k] < 0 && c.req) missing.push(c.label);
    });
    if (missing.length) fail("Missing column" + (missing.length > 1 ? "s" : "") + ": " + missing.join(", ") + ". Download the template to see the headings.");
    var data = all.slice(1);
    if (!data.length) fail("The file has headings but no rows.");
    if (data.length > MAX_ROWS) fail("The file has " + data.length.toLocaleString("en-US") + " rows. Import up to " + MAX_ROWS.toLocaleString("en-US") + " at a time.");

    var work = JSON.parse(JSON.stringify(state)), done = [], errors = [];
    data.forEach(function (d) {
      var rec = {};
      spec.cols.forEach(function (c) { rec[c.k] = idx[c.k] >= 0 ? clean(d.cells[idx[c.k]]) : ""; });
      try { done.push({ row: d.row, text: spec.run(work, role, now, rec, opts) }); }
      catch (e) { errors.push({ row: d.row, text: e.message }); }
    });
    if (errors.length) return { ok: false, errors: errors, rows: done, total: data.length };
    work.audit.push({ at: now, role: role, entity: "CSV import", action: "Imported " + data.length + " " + spec.noun + (data.length === 1 ? "" : "s") +
      (opts.fileName ? " from " + opts.fileName : ""), note: "Each row passed the same checks as the form." });
    return { ok: true, state: work, rows: done, errors: [], total: data.length };
  }

  return {
    parse: parse, stringify: stringify, exports: EXPORTS, exportCSV: exportCSV,
    imports: IMPORTS, importsFor: importsFor, template: template, runImport: runImport, MAX_ROWS: MAX_ROWS
  };
});
