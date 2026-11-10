/* Item card: one page per item that explains what is being bought, for a buyer who is not the engineer, and keeps what
 * was learned about it. Written guides come from item-guides.js; lessons, failed technical reviews, receipt problems and
 * buying history come from the workspace, so the card keeps learning. Opened like a record: #MR-203. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;
  var GUIDES = window.P2P_ITEM_GUIDES || {};
  var ITEM = /^(RM|PK|CP|MR|SV)-\d{3}$/;
  var day = function (d) { return d ? P.longDate(d) : ""; };
  var money = function (v) { return App.money(v); };

  App.isItemId = function (id) { return ITEM.test(String(id || "")); };
  App.itemLink = function (id, label) {
    return '<a class="rec" href="#' + id + '" data-act="rec" data-id="' + id + '">' + esc(label || id) + "</a>";
  };
  App.itemBtn = function (id) { return ' <button type="button" class="small ghost" data-act="rec" data-id="' + id + '">Item card</button>'; };
  // A short line for screens: how many lessons and past problems an item has, linking to its card.
  App.itemLessonsNote = function (itemId) {
    var k = P.itemKnowledge(App.state, itemId), n = k.lessons.length + k.reviews.length + k.receipts.length;
    return n ? '<div class="note warn">This item has ' + n + " lesson" + (n === 1 ? "" : "s") + " from past problems. " + App.itemLink(itemId, "Read them on the item card") + " before you write the spec or check the offers.</div>" : "";
  };

  App.actions.lesAdd = function (data) {
    App.run(function (s, role, now) { return P.addLesson(s, role, now, data); }, function (l) { return "Lesson " + l.id + " saved. It now shows on the item card for everyone."; });
  };

  App.actions.guideEdit = function (el) { App.sel.guideEdit = el.dataset.id; App.render(); };
  App.actions.guideCancel = function () { App.sel.guideEdit = null; App.render(); };
  App.actions.guideSave = function (data) {
    var specs = [];
    for (var i = 0; ("specA" + i) in data; i++) specs.push([data["specA" + i], data["specB" + i]]);
    App.run(function (s, role, now) {
      var r = P.editGuide(s, role, now, { itemId: data.itemId, what: data.what, where: data.where, specs: specs, ask: data.ask, reason: data.reason }, GUIDES[data.itemId] || null);
      App.sel.guideEdit = null;
      return r;
    }, function (r) { return "Guide for " + r.itemId + " saved as version " + r.rev + ". Everyone sees it now."; });
  };

  function list(items, empty) { return items.length ? items.join("") : '<p class="empty pad">' + empty + "</p>"; }
  function entry(head, body, foot) {
    return '<div class="lesson"><div class="lhead">' + head + '</div><div class="lbody">' + body + '</div><div class="muted">' + foot + "</div></div>";
  }

  function lessonForm(it) {
    if (P.LESSON_ROLES.indexOf(App.role) < 0) {
      return '<p class="hint pad" style="margin:0">Engineering, Quality and the Requester log lessons, because they see the failures. Switch roles at the top to add one.</p>';
    }
    return '<form data-form="lesAdd" class="form pad lessonform"><input type="hidden" name="itemId" value="' + it.id + '">' +
      '<label>Kind<select name="kind">' + P.LESSON_KINDS.map(function (k) { return "<option>" + esc(k) + "</option>"; }).join("") + "</select></label>" +
      '<label>Source (optional)<input name="source" placeholder="Record number, such as RFX-3003"></label>' +
      '<label class="wide">What happened<input name="what" placeholder="The seal leaked after 3 weeks"></label>' +
      '<label class="wide">Why<input name="why" placeholder="O-rings rated too low for the heat. Or: not known yet"></label>' +
      '<label class="wide">What to do next time<input name="next" placeholder="State the liquid temperature on the request"></label>' +
      '<div class="wide actions"><button type="submit">Log the lesson</button></div></form>';
  }

  // The guide's versions, and the form Engineering and Quality use to revise it.
  function guideCard(it, g) {
    var s = App.state, can = P.GUIDE_ROLES.indexOf(App.role) >= 0, base = GUIDES[it.id];
    if (can && App.sel.guideEdit === it.id) {
      var rows = (g ? g.specs : []).concat([["", ""], ["", ""]]);
      return '<form data-form="guideSave" class="form pad guideform"><input type="hidden" name="itemId" value="' + it.id + '">' +
        '<label class="wide">What it is<textarea name="what" rows="3">' + esc(g ? g.what : "") + "</textarea></label>" +
        '<label class="wide">Where it is used<input name="where" value="' + esc(g ? g.where : "") + '"></label>' +
        '<div class="wide"><b>Specs that matter, and why</b><span class="muted"> Leave a row blank to remove it.</span>' +
        rows.map(function (x, i) {
          return '<div class="specrow"><input name="specA' + i + '" aria-label="Spec ' + (i + 1) + '" placeholder="Spec" value="' + esc(x[0]) + '">' +
            '<input name="specB' + i + '" aria-label="Why spec ' + (i + 1) + ' matters" placeholder="Why it matters" value="' + esc(x[1]) + '"></div>';
        }).join("") + "</div>" +
        '<label class="wide">What to ask the supplier, one question per line<textarea name="ask" rows="4">' + esc(g ? g.ask.join("\n") : "") + "</textarea></label>" +
        '<label class="wide">What you changed and why<input name="reason" placeholder="Added the liquid temperature after the P-204 seal failure (LES-1101)"></label>' +
        '<div class="wide actions"><button type="submit">Save as a new version</button> <button type="button" class="ghost" data-act="guideCancel">Cancel</button></div></form>';
    }
    var since = g ? P.lessonsSinceGuide(s, it.id).length : 0;
    var top = can ? '<div class="pad guidetop"><button type="button" class="small" data-act="guideEdit" data-id="' + it.id + '">' + (g ? "Edit the guide" : "Write the guide") + "</button>" +
      ' <span class="muted">Every change is kept, with who made it and why.</span></div>'
      : '<p class="hint pad" style="margin:0">Engineering and Quality keep the guide current, because they know the part. Switch roles at the top to edit it.</p>';
    var note = since ? '<div class="note warn" style="margin:10px 16px">' + since + " lesson" + (since === 1 ? " was" : "s were") + " logged after the guide last changed. " +
      (can ? "Check whether the guide needs " + (since === 1 ? "it" : "them") + "." : "Engineering or Quality should check whether the guide needs " + (since === 1 ? "it" : "them") + ".") + "</div>" : "";
    var revs = P.guideRevisions(s, it.id).map(function (r) {
      return entry(App.pill("Version " + r.rev, r === P.guideRevisions(s, it.id)[0] ? "ok" : "mut"), esc(r.reason), "Changed by " + esc(P.roleLabel(r.by)) + ", " + day(r.at));
    });
    if (base) revs.push(entry(App.pill("Version 1", revs.length ? "mut" : "ok"), "The written guide that came with the workspace.", "Written with the item master"));
    return top + note + list(revs, "No guide written yet.");
  }

  App.itemPage = function (id) {
    var s = App.state, it = REF.items.find(function (x) { return x.id === id; });
    if (!it) return '<div class="band"><h2>' + esc(id) + ' not found</h2><p class="bandsub">There is no item with that number in this workspace.</p></div>';
    var g = P.itemGuide(s, it.id, GUIDES[it.id] || null), k = P.itemKnowledge(s, it.id), ct = P.contractFor(s, it.id, App.today());
    var reviewer = it.needsEngineering ? "Engineering" : it.needsQuality ? "Quality" : "The Requester";
    var noGuide = '<p class="empty pad">No written guide for this item yet. Engineering or Quality can write one under Guide versions. Its lessons, review results and buying history still build up on this card.</p>';
    var rev = g && g.revision ? "Version " + g.revision.rev + ", changed by " + P.roleLabel(g.revision.by) + " " + day(g.revision.at) : "";

    var what = g ? '<div class="pad"><p style="margin:0 0 10px;line-height:1.55">' + esc(g.what) + '</p><p class="muted" style="margin:0;line-height:1.55">Where it is used: ' + esc(g.where) + "</p></div>" : noGuide;
    var drawing = g && g.drawing ? '<div class="pad drawing">' + g.drawing + '<p class="barnote">Simplified schematic, not to scale. A drawing, not a photo, so it cannot show the wrong part.</p></div>'
      : '<p class="empty pad">' + (g ? "No drawing for this item. For a service or a made to drawing part, the specs and the supplier questions matter more." : "No drawing for this item yet.") + "</p>";
    var specs = g ? '<div class="wrap flat"><table><tr><th>Spec</th><th>Why it matters</th></tr>' + g.specs.map(function (x) {
      return "<tr><td><b>" + esc(x[0]) + "</b></td><td>" + esc(x[1]) + "</td></tr>";
    }).join("") + "</table></div>" : noGuide;
    var ask = g ? '<ul class="asklist">' + g.ask.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul>" : noGuide;

    var lessons = lessonForm(it) + list(k.lessons.map(function (l) {
      return entry(App.pill(l.kind, "info") + (l.source ? " " + (App.isRecordId(l.source) ? App.recLink(l.source) : esc(l.source)) : ""),
        "<b>What happened.</b> " + esc(l.what) + "<br><b>Why.</b> " + esc(l.why) + "<br><b>Next time.</b> " + esc(l.next),
        "Logged by the " + esc(P.roleLabel(l.by)) + ", " + day(l.at));
    }), "No lessons logged yet.");

    var auto = k.reviews.map(function (r) {
      return entry(App.pill("Failed technical review", "bad") + " " + App.recLink(r.rfxId), esc(App.supplier(r.supplierId).name) + ": " + esc(r.note), "Marked by the " + esc(P.roleLabel(r.by)) + ", " + day(r.at));
    }).concat(k.receipts.map(function (r) {
      return entry(App.pill("Receipt " + r.result.toLowerCase(), r.result === "Rejected" ? "bad" : "warn") + " " + App.recLink(r.grnId),
        esc(App.supplier(r.supplierId).name) + ": " + esc(r.note || "No note"), "From " + App.recLink(r.poId) + ", " + day(r.at));
    }));

    var similar = P.similarItems(it.id, g && g.sameAs);
    var dup = similar.length ? '<div class="pad">' + similar.map(function (o) {
      return '<div class="lesson"><div class="lhead">' + App.itemLink(o.id, o.id + "  " + o.name) + '</div><div class="muted">' + esc(o.category) + " · standard " + money(o.stdPrice) +
        " per " + esc(o.uom) + "</div></div>";
    }).join("") + '<p class="barnote">These look like the same part under another number. Check the shelf and the item master before buying. The app has no stock levels, so it cannot say what is on hand.</p></div>'
      : '<p class="empty pad">No other item in the master looks like this one.</p>';

    var hist = k.pos.length ? '<div class="wrap flat"><table><tr><th>PO</th><th>Supplier</th><th class="num">Quantity</th><th class="num">Unit price</th><th>Ordered</th><th>Status</th></tr>' +
      k.pos.map(function (po) {
        return "<tr><td>" + App.recLink(po.id) + "</td><td>" + esc(App.supplier(po.supplierId).name) + '</td><td class="num">' + po.qty + '</td><td class="num">' + money(po.unitPrice) +
          "</td><td>" + day(po.createdAt) + "</td><td>" + App.status(P.poStatus(s, po)) + "</td></tr>";
      }).join("") + "</table></div>" : '<p class="empty pad">Not bought in this workspace yet.</p>';

    var n = k.lessons.length + k.reviews.length + k.receipts.length;
    return '<div class="band rec"><div class="crumb"><a href="#requests" data-act="tab" data-arg="requests">Requests and PRs</a> / Item ' + esc(it.id) + "</div>" +
      '<div class="bandrow"><div class="trow"><h2>' + esc(it.name) + "</h2>" + App.pill(it.category, "mut") + (n ? " " + App.pill(n + " lesson" + (n === 1 ? "" : "s"), "warn") : "") + "</div></div>" +
      '<p class="bandsub">' + esc(it.id) + " · what you are buying, in plain words, and what went wrong before, so the spec and the supplier questions are right the first time.</p>" +
      '<div class="facts">' + [["Standard price", money(it.stdPrice) + " per " + it.uom], ["Technical reviewer", reviewer], ["Contract", ct ? ct.contract.id + " at " + money(ct.line.price) : "None active"],
        ["Bought before", k.pos.length + " PO" + (k.pos.length === 1 ? "" : "s")], ["Lessons", String(n)], ["Written guide", g ? (g.revision ? "Version " + g.revision.rev : "Version 1") : "Not yet"]]
        .map(function (f) { return "<div><span>" + esc(f[0]) + "</span><b>" + esc(f[1]) + "</b></div>"; }).join("") + "</div></div>" +
      '<div class="page"><div class="secs">' +
      App.card("What it is", what, rev) + App.card("How it fits together", drawing) +
      App.card("Specs that matter, and why", specs) + App.card("What to ask the supplier", ask) +
      App.card("Guide versions", guideCard(it, g), "Kept current by Engineering and Quality", true) +
      App.card("Lessons learned", lessons, "Logged by Engineering, Quality and the Requester", true) +
      App.card("From technical reviews and receipts", list(auto, "No failed reviews or receipt problems yet."), "Added on their own") +
      App.card("You may already have this", dup) +
      App.card("Buying history", hist, "Every PO for this item", true) +
      "</div></div>";
  };
})();
