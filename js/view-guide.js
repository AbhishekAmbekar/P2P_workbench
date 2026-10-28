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
          "<b>RFx.</b> The Buyer invites suppliers, records quotes and ranks them on a weighted score of price, lead time and supplier quality, then awards.",
          "<b>PO.</b> The Buyer issues the purchase order from the award, from a contract, or as a direct buy. Then the Buyer confirms the supplier date and manages changes.",
          "<b>GRN.</b> The Warehouse posts what arrived: accepted, rejected or on quality hold. Quality decides what happens to held goods.",
          "<b>Invoice.</b> Accounts Payable enters the supplier invoice. The system matches it exactly against the PO and the accepted receipts. Matches can be paid. Gaps go to the person who can fix them."
        ])) +
      section("The rules built in",
        list([
          "<b>Approval route.</b> The Manager approves every request. Raw materials and packaging that need inspection also need Quality. Engineered components also need Engineering. " +
            money(T.director).replace(/\.00$/, "") + " or more adds the Director. " + money(T.executive).replace(/\.00$/, "") + " or more adds the Executive. Approvals happen in order.",
          "<b>When an RFx is required.</b> A request of " + money(T.rfx).replace(/\.00$/, "") + " or more with no contract has to go through an RFx. Items with a contract can be ordered directly at any value.",
          "<b>Inviting suppliers.</b> Only suppliers that sell the item's category can be invited. Invite at least two, or give a written sole source reason.",
          "<b>Awarding.</b> A supplier that is not qualified cannot receive an award. A conditional supplier, a single bid, or a pick that is not the top score needs a written justification.",
          "<b>Direct buys.</b> Only qualified suppliers. A PO cannot run more than " + Math.round(T.poOverrun * 100) + "% over the approved PR value. Past that the request has to be revised and approved again.",
          "<b>Receiving.</b> You cannot receive more than is open on the PO. Rejected units are recorded but do not use up the open quantity. Held units count as received until Quality decides.",
          "<b>Exact match.</b> Quantity must equal what is accepted and not yet invoiced. Price must equal the PO price to the cent. A repeated invoice number from the same supplier is flagged as a duplicate.",
          "<b>Budgets.</b> Each cost center has an annual budget. Used budget is issued POs at landed cost plus requests that are pending, approved or in sourcing. A request that would take a cost center past its budget needs the Executive too, whatever its value.",
          "<b>Landed cost.</b> Quotes carry a tariff percentage and freight per unit. Price is scored on landed cost, so a supplier with the lowest sticker price can lose once a tariff is added. Invoices still match on the supplier price, because duty is paid separately.",
          "<b>Quote validity.</b> Every quote has a valid until date. An expired quote cannot be awarded or ordered until the Buyer records that the supplier has revalidated it.",
          "<b>Supplier documents.</b> A current quality certificate and origin declaration are required for every supplier, plus a sub tier disclosure for raw materials and components. An expired or missing document blocks awards and POs until Quality records the renewal on the Suppliers tab. A document expiring within 30 days only warns.",
          "<b>Price against reference.</b> Each item has a contract or standard price. A PO more than 10% above it needs a written reason. Any PO above it is counted on the dashboard.",
          "<b>Fix owners.</b> Price gaps go to the Buyer. Quantity over billing and missing receipts go to the Warehouse. Short billing and duplicates stay with Accounts Payable."
        ])) +
      section("Delivery health",
        "<p>For every open PO, slack is the need by date minus the supplier promise date. Under 5 days is At Risk. Below zero is Late. Move a promise date on the PO screen to see the status change.</p>") +
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
        "<li>Act as <b>Buyer</b>. The value is over the RFx limit, so start an RFx, invite three suppliers and record quotes. Close bidding, compare, and award.</li>" +
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
