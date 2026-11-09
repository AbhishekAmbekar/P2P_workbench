/* Guide: how the workflow runs, what each control does, and how to try the demo. */
(function () {
  "use strict";
  var App = window.App, REF = App.REF, esc = App.esc, money = App.money;
  var T = REF.thresholds;

  function section(title, body) { return '<div class="card" style="margin-bottom:12px"><h3>' + title + "</h3>" + body + "</div>"; }
  function list(items) { return '<ul style="margin:6px 0;padding-left:20px">' + items.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>"; }

  App.views.guide = function () {
    var roles = '<div class="wrap" style="border:0"><table><tr><th>Role</th><th>Persona</th><th>What they can do</th></tr>' + REF.roles.map(function (r) {
      return "<tr><td>" + esc(r.label) + "</td><td>" + esc(r.persona) + "</td><td>" + esc(r.can) + "</td></tr>";
    }).join("") + "</table></div>";

    return "<h2>Guide</h2>" +
      section("What this is",
        "<p>A working model of the procure to pay cycle for a manufacturer buying raw materials, components, packaging and MRO supplies. Six stages are linked, so a record you create in one stage shows up in the next. " +
        "Switch the role at the top to act as each person in the chain. All names, suppliers, prices and quantities are fictional.</p>") +
      section("The six stages",
        list([
          "<b>Request.</b> A requester asks for an item with a quantity, price estimate, need by date, site, cost center and reason. The approval route is worked out from the value and the item.",
          "<b>PR.</b> After the last approval the request becomes a numbered purchase requisition. Until then it is only a request.",
          "<b>RFx.</b> The Buyer invites suppliers and records quotes. When bidding closes, the user side checks each offer against the spec: Engineering for engineered components, Quality for items flagged for inspection, the Requester for everything else. The Buyer then ranks the acceptable offers on a weighted score of landed price, lead time and supplier quality, and recommends one. The Director approves the award, and the Executive too for large or risky awards.",
          "<b>PO.</b> The Buyer issues the purchase order from the award, as a release from an active contract, or as a direct buy. Then the Buyer confirms the supplier date and manages changes.",
          "<b>GRN.</b> The Warehouse posts what arrived: accepted, rejected or on quality hold. Quality decides what happens to held goods.",
          "<b>Service entry.</b> Services such as technician hours, crane hire or a monthly maintenance contract are ordered as a quantity of hours, days, weeks or months at a rate, and used up over time. Each month the Requester, who sees the work on site, records it from the site log and the supplier's timesheet or day sheet. The Manager releases it. From $5,000 the Director releases it too, and from $10,000 the Executive as well, in that order. Any of them can send it back with a reason. This is the service version of a goods receipt.",
          "<b>Invoice.</b> Accounts Payable enters the supplier invoice. The system matches it exactly against the PO and the accepted receipts or accepted service. Matches can be paid. Gaps go to the person who can fix them."
        ])) +
      section("The rules built in",
        list([
          "<b>Approval route.</b> The Manager approves every request. Raw materials and packaging that need inspection also need Quality. Engineered components also need Engineering. " +
            money(T.director).replace(/\.00$/, "") + " or more adds the Director. " + money(T.executive).replace(/\.00$/, "") + " or more adds the Executive. Approvals happen in order.",
          "<b>When an RFx is required.</b> A request of " + money(T.rfx).replace(/\.00$/, "") + " or more with no active contract has to go through an RFx. An item on an active contract is released from it at any value, as long as the release fits in what is left of the cap.",
          "<b>Contracts.</b> A rate contract fixes the supplier and price for some items, from a start date to an end date, up to a value cap. The Buyer drafts it after sourcing the supplier. The Director approves it, and the Executive too from " + money(T.executive).replace(/\.00$/, "") + ", the same ladder as an award. A rejection needs a reason. The supplier must be qualified with current documents, and one item can be on only one contract at a time. Each PO from a contract is a release that uses up part of the cap. Above " + (REF.serviceWarnPct || 80) + "% used, or within 60 days of the end, the contract warns the Buyer to renew it. When it ends or the cap is used up, new requests for its items go through normal sourcing.",
          "<b>Inviting suppliers.</b> Only suppliers that sell the item's category can be invited. Invite at least two, or give a written sole source reason.",
          "<b>Technical evaluation.</b> Each offer is marked acceptable or not against the spec, with a reason when it fails. The reviewer does not see prices. An offer that fails cannot be recommended, however good its price.",
          "<b>Awarding.</b> The Buyer recommends. A supplier that is not qualified cannot be recommended. A conditional supplier, a single bid, or a pick that is not the top acceptable offer needs a written justification. The Director approves every award. The Executive also approves from " +
            money(T.executive).replace(/\.00$/, "") + ", or for any of those risky picks. A rejected award goes back to the Buyer with the reason. No PO until the award is approved.",
          "<b>Direct buys.</b> Only qualified suppliers. A PO cannot run more than " + Math.round(T.poOverrun * 100) + "% over the approved PR value. Past that the request has to be revised and approved again.",
          "<b>Receiving.</b> You cannot receive more than is open on the PO. Rejected units are recorded but do not use up the open quantity. Held units count as received until Quality decides.",
          "<b>Services.</b> A service entry cannot take a PO past its ordered quantity. When more is needed, the Requester raises a new request. Above " + (REF.serviceWarnPct || 80) + "% used, the PO warns that it is running out. Work waiting for release uses up the PO but cannot be invoiced yet. Work sent back does not count. The person who records an entry does not release it.",
          "<b>Exact match.</b> Quantity must equal what is accepted and not yet invoiced. Price must equal the PO price to the cent. A repeated invoice number from the same supplier is flagged as a duplicate.",
          "<b>Budgets.</b> Each cost center has an annual budget. Used budget is issued POs at landed cost plus requests that are pending, approved or in sourcing. A request that would take a cost center past its budget needs the Executive too, whatever its value.",
          "<b>Landed cost.</b> Quotes carry a tariff percentage and freight per unit. Price is scored on landed cost, so a supplier with the lowest sticker price can lose once a tariff is added. Invoices still match on the supplier price, because duty is paid separately.",
          "<b>Quote validity.</b> Every quote has a valid until date. An expired quote cannot be awarded or ordered until the Buyer records that the supplier has revalidated it.",
          "<b>Supplier documents.</b> A current quality certificate and origin declaration are required for every supplier, plus a sub tier disclosure for raw materials and components. An expired or missing document blocks awards and POs until Quality records the renewal on the Suppliers tab. A document expiring within 30 days only warns.",
          "<b>Price against reference.</b> Each item has a contract or standard price. A PO more than 10% above it needs a written reason. Any PO above it is counted on the dashboard.",
          "<b>Fix owners.</b> Price gaps go to the Buyer. Quantity over billing and missing receipts go to the Warehouse, or for a service, to whoever releases next when work is waiting and to the Requester when nothing has been recorded. Short billing and duplicates stay with Accounts Payable."
        ])) +
      section("Projects",
        "<p>Some work needs several purchases to come together by one date: a pump overhaul, a shutdown, a product launch. A project groups those requests and shows them as one job. Everyday buying needs no project.</p>" +
        "<p>The Requester creates a project with a name, a target date and a criticality: High if a slip stops a line or a customer date, Medium or Low otherwise. A downtime cost per day is optional, because it usually comes from production planning or plant finance. Without it the app shows the delay in days and never makes up a figure.</p>" +
        "<p>A request joins a project when it is raised, or later from its panel. Its RFx, PO, receipts, service entries and invoices follow it. The project shows each item's step, who holds it, how long since it last moved, and the date it should be in place. An item is late if that date is after the target, at risk within 5 days of it, and blocked on a quality hold or a rejection. Items not yet ordered use their need by date. The latest item that is not ready is the one holding the project up.</p>" +
        "<p>Promised dates are not taken at face value. Each supplier has a delivery record: its past deliveries, promised against received, from receipts here and history brought in from before. Once a supplier has 3 or more, the project plans on its usual slip and shows both dates. A service booked before the rest can be ready, such as a crane, is flagged as standing idle. The Buyer can open a chase draft for the item holding the project up. The Suppliers screen shows each record.</p>") +
      section("Delivery health",
        "<p>For every open PO, slack is the need by date minus the supplier promise date. Under 5 days is At Risk. Below zero is Late. Move a promise date on the PO screen to see the status change.</p>") +
      section("Expedite and email drafts",
        "<p>The Expedite tab lists open POs that need a nudge, worst first: overdue, late, at risk, then not confirmed. As the Buyer, pick one and the app writes a short chase message from the PO record. You can edit it, then open it in your own mail program, Gmail or Outlook, copy it, or download it as a draft file. The app never sends mail itself and cannot tell whether you sent it, so the audit trail records only that a draft was opened. Demo suppliers have no email address, so type one in and the app can remember it for that supplier.</p>") +
      section("Your work and view only",
        "<p>The sidebar is grouped for the role you are working as. Your work lists the screens where that role acts. View only lists the screens it follows. More screens holds the rest, one click away. A view only screen says so under its title and names who works there. " +
        "Some screens open on the role's own slice, such as your own requests, what waits on you, or what is still due in, and every other filter, including All, is one click away. Switching roles starts each screen on the new role's default. " +
        "The Manager, Director and VP follow every screen but only act on approvals. None of this changes who can do what: the rules still decide that.</p>") +
      section("Dashboard charts and oversight",
        "<p>The dashboard shows budget by cost center, spend by category, delivery health and invoices by status. Committed means issued POs at landed cost. Pipeline means requests not yet ordered. The black line on each budget bar is the budget. Hover over a bar, tab to it, or tap it to see the exact value. Click a delivery or invoice state to open that list. " +
        "Working as the Manager, Director or VP, the home screen is Oversight: approvals waiting on you first, then the charts and the open invoice exceptions by value, with who can fix each one.</p>") +
      section("Search",
        "<p>Use the search box at the top, or press Ctrl K (Cmd K on a Mac) or the / key. Type a record number such as PO-4001 or PR-2001, part of one such as po-40, the supplier's own invoice number, a supplier, an item, a status such as late, at risk or hold, or a screen such as receipts. " +
        "Every word you type must match, so adding words narrows the list. Use the arrow keys and Enter, or click. With the box empty it shows the records you opened last on this device.</p>") +
      section("Record pages and links",
        "<p>Every request, PR, RFx, PO, receipt and invoice has its own page. Open one by clicking its number in any table, with the Full record button on its screen, from search, or with a link such as #PO-4001 at the end of the address. Clicking elsewhere on a row still opens the quick panel on that screen. " +
        "The page shows the key facts, the document flow from request to invoice, and the details, price, approvals, receipts, invoices and history. Each step in the flow opens that record. " +
        "Record pages are for reading. Press Work on it to open the record on its own screen and act on it. The browser Back button takes you back.</p>") +
      section("CSV import and export",
        "<p>Every screen with records has Export CSV at the top. It downloads what sits behind that screen as a file a spreadsheet can open. The audit trail file has every entry, not only the latest 200.</p>" +
        "<p>Some screens also have Import CSV, for data that usually arrives in a spreadsheet: requests, supplier quotes, supplier date confirmations, goods receipts, supplier invoices, supplier emails and document renewals. Switch to the role that does that job, open Import CSV, download the template and fill it in. " +
        "Each row runs through the same rules as the form. If any row fails, nothing is imported and every problem is listed by row, so you can fix the file and try again. Import only adds. It does not change or delete records, and POs, awards and approvals are still done on the screen.</p>") +
      section("Industry problems this addresses, and where it stops",
        list([
          "<b>Invoice exceptions.</b> One benchmark (Ardent Partners 2025, as quoted by Tellius) puts the average exception rate at 18.4% of invoices, mostly from missing receipts and quantity or price gaps. Here every exception names a fix owner, and the dashboard shows the first time match rate.",
          "<b>Slow supplier deliveries.</b> Slack against the need by date is tracked on every open PO, and an RFx scores lead time, so a late supplier shows up before the build date.",
          "<b>Tariffs and price swings.</b> Landed cost drives the ranking, quotes expire, and a PO priced well above the contract or standard price needs a reason.",
          "<b>Supplier compliance paperwork.</b> Documents have expiry dates that block awards and POs until renewed.",
          "<b>Budget control.</b> Spend is tracked against each cost center, and going over budget escalates to the Executive.",
          "<b>Where it stops.</b> It tracks documents but does not verify them, and sees only the direct supplier, not sub suppliers. It has no tolerance rules on invoices, no currency, no customs classification and no long lead time planning. A real system would need all of those."
        ])) +
      section("Try this walk through",
        '<ol style="margin:6px 0;padding-left:20px"><li>Act as <b>Requester</b>, raise a request for the Motor control board with a quantity of 100. Watch the preview add Engineering, Director and Executive.</li>' +
        "<li>Act as each approver in order until a PR number appears.</li>" +
        "<li>Act as <b>Buyer</b>. The value is over the RFx limit, so start an RFx, invite three suppliers and record quotes. Close bidding.</li>" +
        "<li>Act as <b>Engineering</b> and mark each offer acceptable or not, then send it to the Buyer. Back as <b>Buyer</b>, compare and recommend. Then act as the <b>Director</b> and the <b>Executive</b> to approve the award.</li>" +
        "<li>Still as Buyer, create the PO, then record the supplier confirmation.</li>" +
        "<li>Act as <b>Warehouse</b> and receive part of the order, then the rest. Try receiving more than is open.</li>" +
        "<li>Act as <b>Accounts Payable</b>. Enter an invoice with a price one cent off and read the exception. Then enter a clean one and pay it.</li></ol>") +
      section("Roles", roles) +
      section("About the data and limits",
        list([
          "Everything is fictional. This is a teaching and portfolio model, not a copy of any company's system or process.",
          "Data lives in your browser only. It is saved on this device and nobody else can see it. The Reset demo button restores the starting data.",
          "There is no real approval authentication. Switching roles is how you play each person.",
          "Matching is exact on purpose. Real systems often allow tolerances. That would be a natural next change."
        ]));
  };
})();
