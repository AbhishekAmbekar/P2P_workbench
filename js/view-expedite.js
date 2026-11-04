/* Expedite: open POs that need a nudge, ranked, with an editable email draft.
 * The app never sends mail. It opens the draft in the user's own mail program or webmail, or copies it.
 * App.sel.chase holds { poId, kind }. App.sel.chaseDraft holds the edited { to, subject, body }. */
(function () {
  "use strict";
  var App = window.App, P = App.P, esc = App.esc;

  var KIND_LABEL = { overdue: "Overdue", late: "Late", risk: "At risk", confirm: "Not confirmed" };
  var KIND_PILL = { overdue: "bad", late: "bad", risk: "warn", confirm: "info" };
  var KIND_CHOICES = [
    { id: "confirm", label: "Ask for confirmation" },
    { id: "risk", label: "Ask to move the date up" },
    { id: "late", label: "Date is later than needed" },
    { id: "overdue", label: "Past the promised date" }
  ];

  function fromName() { return App.roleInfo("buyer").persona.split(",")[0]; }
  function rowFor(poId) {
    return P.expediteList(App.state, App.now()).filter(function (r) { return r.po.id === poId; })[0];
  }
  function currentDraft() {
    var c = App.sel.chase;
    if (!c) return null;
    if (!App.sel.chaseDraft) App.sel.chaseDraft = P.chaseDraft(App.state, c.poId, c.kind, fromName());
    return App.sel.chaseDraft;
  }

  App.actions.chasePick = function (el) {
    var row = rowFor(el.dataset.id);
    App.sel.chase = { poId: el.dataset.id, kind: row ? row.kind : "risk" };
    App.sel.chaseDraft = null;
    App.render();
  };
  App.actions.chaseClose = function () { App.sel.chase = null; App.sel.chaseDraft = null; App.render(); };
  // Keep what the buyer types, so a redraw never loses it. Changing the message type starts a fresh draft.
  App.actions.chaseEdit = function (target) {
    if (target.name === "kind") {
      App.sel.chase.kind = target.value; App.sel.chaseDraft = null; App.render(); return;
    }
    if (target.name === "remember") return;
    var d = currentDraft();
    if (d && (target.name === "to" || target.name === "subject" || target.name === "body")) d[target.name] = target.value;
  };

  // Reads the draft as it is on screen, checks the address, and remembers it for the supplier if asked.
  function readDraft() {
    var f = document.querySelector('form[data-change="chaseEdit"]');
    var d = { to: f.elements.to.value.trim(), subject: f.elements.subject.value, body: f.elements.body.value };
    if (d.to && !P.emailOk(d.to)) throw new Error("That does not look like an email address. Fix it or leave it blank.");
    App.sel.chaseDraft = d;
    var po = App.state.pos.filter(function (x) { return x.id === App.sel.chase.poId; })[0];
    if (d.to && f.elements.remember.checked && d.to !== P.contactOf(App.state, po.supplierId)) {
      P.setContact(App.state, App.role, App.now(), po.supplierId, d.to);
    }
    return d;
  }

  function done(via, msg) {
    P.logChase(App.state, App.role, App.now(), App.sel.chase.poId, via);
    App.save(); App.render();
    App.toast(msg);
  }

  App.actions.chaseOpen = function (el) {
    try {
      var d = readDraft(), l = P.mailLinks(d), via = el.dataset.via;
      if (via === "gmail") window.open(l.gmail, "_blank", "noopener");
      else if (via === "outlook") window.open(l.outlook, "_blank", "noopener");
      else window.location.href = l.mailto;
      var label = via === "gmail" ? "Gmail" : via === "outlook" ? "Outlook on the web" : "your mail app";
      done(label, "Draft opened in " + label + ". Check it there and press send." +
        (via === "mail" && l.tooLong ? " This one is long, so if your mail app cuts it off, use Copy text." : ""));
    } catch (e) { App.toast(e.message, true); }
  };

  App.actions.chaseCopy = function () {
    try {
      var d = readDraft(), text = "To: " + d.to + "\nSubject: " + d.subject + "\n\n" + d.body;
      var ok = function () { done("copy", "Copied. Paste it into your mail program."); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { App.toast("Copy was blocked by the browser. Select the text and copy it by hand.", true); });
      else { var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); ok(); }
    } catch (e) { App.toast(e.message, true); }
  };

  App.actions.chaseFile = function () {
    try {
      var d = readDraft(), blob = new Blob([P.emlText(d)], { type: "message/rfc822" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = App.sel.chase.poId + "-chase.eml";
      document.body.appendChild(a); a.click(); a.remove();
      done("a draft file", "Draft file downloaded. Open it to get an unsent message.");
    } catch (e) { App.toast(e.message, true); }
  };

  function draftCard(isBuyer) {
    var c = App.sel.chase, po = App.state.pos.filter(function (x) { return x.id === c.poId; })[0];
    if (!po) return "";
    var sp = App.supplier(po.supplierId), d = currentDraft();
    var kinds = KIND_CHOICES.map(function (k) {
      return '<option value="' + k.id + '"' + (k.id === c.kind ? " selected" : "") + ">" + esc(k.label) + "</option>";
    }).join("");
    var saved = P.contactOf(App.state, po.supplierId);
    return '<div class="card" style="margin-bottom:12px"><h3>Email draft for ' + esc(po.id) + ", " + esc(sp.name) + "</h3>" +
      '<p class="hint">This opens the draft in your own mail program. Nothing is sent from here, and the app cannot tell if you sent it. The audit trail records that a draft was opened.</p>' +
      '<form data-change="chaseEdit" class="form" onsubmit="return false">' +
      '<label>Message type<select name="kind">' + kinds + "</select></label>" +
      '<label>To<input name="to" type="text" value="' + esc(d.to) + '" placeholder="supplier@example.com" autocomplete="off"></label>' +
      '<label class="wide">Subject<input name="subject" value="' + esc(d.subject) + '"></label>' +
      '<label class="wide">Message<textarea name="body" style="min-height:290px">' + esc(d.body) + "</textarea></label>" +
      '<label class="wide" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="remember" style="width:auto;margin:0"' +
        (saved ? "" : " checked") + '> Remember this address for ' + esc(sp.name) + "</label>" +
      '<div class="wide actions">' +
        '<button type="button" data-act="chaseOpen" data-via="mail">Open in mail app</button>' +
        '<button type="button" class="ghost" data-act="chaseOpen" data-via="gmail">Open in Gmail</button>' +
        '<button type="button" class="ghost" data-act="chaseOpen" data-via="outlook">Open in Outlook</button>' +
        '<button type="button" class="ghost" data-act="chaseCopy">Copy text</button>' +
        '<button type="button" class="ghost" data-act="chaseFile">Download draft file</button>' +
        '<button type="button" class="small ghost" data-act="chaseClose">Close</button>' +
      "</div></form></div>";
  }

  App.views.expedite = function () {
    var s = App.state, isBuyer = App.role === "buyer", rows = P.expediteList(s, App.now());
    var html = "<h2>Expedite</h2>" +
      '<p class="hint">Open POs that need a nudge, worst first. Overdue means the supplier\'s own date has passed. Late means the promised date is after the need by date. ' +
      "At risk means under 5 days of slack. Not confirmed means the PO went out more than 2 days ago with no reply.</p>";
    if (isBuyer && App.sel.chase) html += draftCard(isBuyer);
    if (!rows.length) return html + '<div class="card"><p class="empty">Nothing needs chasing right now.</p></div>';
    html += '<div class="wrap"><table><tr><th>PO</th><th>Item</th><th>Supplier</th><th>Why</th><th class="num">Still due</th><th class="num">Value</th><th>Needed by</th><th>Promised</th><th>Last draft</th><th></th></tr>' +
      rows.map(function (r) {
        return "<tr><td>" + esc(r.po.id) + "</td><td>" + esc(App.item(r.po.itemId).name) + "</td><td>" + esc(r.supplier.name) +
          (r.email ? "" : ' <span class="muted">no email saved</span>') + "</td><td>" + App.pill(KIND_LABEL[r.kind], KIND_PILL[r.kind]) + " " + esc(r.reason) +
          '</td><td class="num">' + r.left + " " + esc(r.po.uom) + '</td><td class="num">' + App.money(r.value).replace(/\.\d\d$/, "") + "</td><td>" + r.po.needBy +
          "</td><td>" + r.po.promisedDate + "</td><td>" + (r.lastChase || '<span class="muted">none</span>') + "</td><td>" +
          (isBuyer ? '<button class="small" data-act="chasePick" data-id="' + r.po.id + '">Draft email</button>' : "") + "</td></tr>";
      }).join("") + "</table></div>";
    return html;
  };
})();
