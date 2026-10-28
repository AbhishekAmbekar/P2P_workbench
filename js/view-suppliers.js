/* Suppliers: qualification status, rating, terms, and the documents that gate awards and POs.
 * An expired or missing document blocks new awards and POs. Quality records renewals. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;

  App.actions.docRenew = function (data) {
    App.run(function (s, role, now) { return P.renewDoc(s, role, now, data.supplierId, data.docType, data.expiry, data.note); },
      "Renewal recorded. The supplier can be awarded and ordered from again.");
  };

  function docPill(d) {
    var txt = d.label + ": " + (d.status === "Missing" ? "missing" : d.status === "Valid" ? "valid to " + d.expires : d.status === "Expiring" ? "expires " + d.expires : "expired " + d.expires);
    return App.pill(txt, d.status === "Valid" ? "ok" : d.status === "Expiring" ? "warn" : "bad");
  }

  function renewForm() {
    var sups = REF.suppliers.map(function (sp) { return '<option value="' + sp.id + '">' + esc(sp.name) + "</option>"; }).join("");
    var types = Object.keys(REF.docTypes).map(function (k) { return '<option value="' + k + '">' + esc(REF.docTypes[k]) + "</option>"; }).join("");
    return '<div class="card" style="margin-bottom:12px"><h3>Record a document renewal</h3>' +
      '<form data-form="docRenew" class="form">' +
      '<label>Supplier<select name="supplierId">' + sups + "</select></label>" +
      '<label>Document<select name="docType">' + types + "</select></label>" +
      '<label>New expiry date<input type="date" name="expiry" value="' + P.addDays(App.today(), 365) + '"></label>' +
      '<label class="wide">What was checked<input name="note" placeholder="Certificate number, issuing body, who reviewed it"></label>' +
      '<div class="wide actions"><button type="submit">Record renewal</button></div></form></div>';
  }

  App.views.suppliers = function () {
    var s = App.state, today = App.today(), a = P.docAlerts(s, today);
    var html = "<h2>Suppliers</h2>" +
      '<p class="hint">Every supplier needs a current quality certificate and origin declaration. Suppliers of raw materials and components also need a sub tier disclosure. ' +
      "An expired or missing document blocks new awards and POs until Quality records the renewal. A document expiring within " + REF.docWarnDays + " days only warns.</p>";
    if (a.blocking || a.expiring) {
      html += '<div class="note ' + (a.blocking ? "warn" : "") + '"><b>' + a.blocking + "</b> supplier" + (a.blocking === 1 ? " is" : "s are") + " blocked by an expired or missing document. <b>" +
        a.expiring + "</b> more " + (a.expiring === 1 ? "has" : "have") + " a document expiring soon.</div>";
    }
    html += App.role === "quality" ? renewForm() : '<div class="note">Quality records document renewals. Switch roles at the top to do it.</div>';

    var rows = REF.suppliers.map(function (sp) {
      var docs = P.supplierDocs(s, sp.id, today);
      var blocked = docs.some(function (d) { return d.status === "Expired" || d.status === "Missing"; });
      return { sp: sp, docs: docs, blocked: blocked };
    }).sort(function (x, y) { return (y.blocked - x.blocked) || (x.sp.name < y.sp.name ? -1 : 1); });

    html += '<div class="wrap"><table><tr><th>Supplier</th><th>Sells</th><th>Status</th><th class="num">Rating</th><th class="num">Terms</th><th>Documents</th><th>Can be awarded</th></tr>' +
      rows.map(function (r) {
        var can = r.sp.status === "Not qualified" ? App.pill("No, not qualified", "bad") : r.blocked ? App.pill("No, document expired", "bad") : App.pill("Yes", "ok");
        return "<tr><td>" + esc(r.sp.name) + "</td><td>" + esc(r.sp.categories.join(", ")) + "</td><td>" + App.status(r.sp.status) + '</td><td class="num">' + r.sp.quality +
          '</td><td class="num">Net ' + r.sp.terms + '</td><td><div style="display:flex;gap:4px;flex-wrap:wrap">' + r.docs.map(docPill).join("") + "</div></td><td>" + can + "</td></tr>";
      }).join("") + "</table></div>";
    return html;
  };
})();
