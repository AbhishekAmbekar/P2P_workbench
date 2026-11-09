/* Projects: the requests that must come together by one date, such as a pump overhaul or a shutdown, seen as one job.
 * A request joins a project when it is raised or later; its RFx, PO, receipts, service entries and invoices follow it.
 * Most buying has no project. App.sel.projects holds the selected project. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;
  var STAGES = P.PROJECT_STAGES;
  var KIND = { Late: "bad", Blocked: "bad", "At risk": "warn", "On track": "info", Ready: "ok", Empty: "mut" };
  var CRIT = { High: "bad", Medium: "warn", Low: "mut" };
  var RANK = { Late: 0, Blocked: 1, "At risk": 2, "On track": 3, Ready: 4, Empty: 5 };
  var day = function (d) { return d ? P.longDate(d) : ""; };
  var findP = function (id) { return (App.state.projects || []).find(function (p) { return p.id === id; }); };

  App.actions.prjSelect = function (el) { App.sel.projects = el.dataset.id; App.render(); };
  App.actions.prjNew = function () { App.sel.prjNew = !App.sel.prjNew; App.render(); };
  App.actions.prjCreate = function (data) {
    var p = App.run(function (s, role, now) { return P.createProject(s, role, now, data); },
      function (p) { return p.id + " created. Add requests to it here, or pick it when raising a request."; });
    if (p) { App.sel.projects = p.id; App.sel.prjNew = false; App.render(); }
  };
  App.actions.prjLink = function (el) {
    var rec = el.dataset.id, sel = document.getElementById("prjPick-" + rec), pid = el.dataset.project || (sel ? sel.value : "");
    if (!pid) { App.toast("Choose a project first.", true); return; }
    App.run(function (s, role, now) { return P.linkToProject(s, role, now, rec, pid); }, function (p) { return rec + " is now part of " + p.id + "."; });
  };
  App.actions.prjAdd = function (el) {
    var pid = el.dataset.id, sel = document.getElementById("prjAdd-" + pid);
    if (!sel || !sel.value) { App.toast("Choose a request to add.", true); return; }
    var rec = sel.value;
    App.run(function (s, role, now) { return P.linkToProject(s, role, now, rec, pid); }, rec + " added to " + pid + ".");
  };
  // Open the gating PO's chase draft on Expedite.
  App.actions.prjChase = function (el) {
    var row = P.expediteList(App.state, App.now()).find(function (x) { return x.po.id === el.dataset.id; });
    App.sel.chase = { poId: el.dataset.id, kind: row ? row.kind : "risk" };
    App.sel.chaseDraft = null;
    App.go("expedite");
  };
  App.actions.prjUnlink = function (el) {
    var rec = el.dataset.id;
    App.run(function (s, role, now) { return P.linkToProject(s, role, now, rec, null); }, rec + " removed from the project.");
  };

  // The project control shown on a request's panel: which project it is in, and for the roles that can, a way to change it.
  App.projectPicker = function (recordId, current) {
    var can = App.role === "requester" || App.role === "buyer";
    var open = (App.state.projects || []).filter(function (p) { return p.status === "Open" && p.id !== current; });
    var cur = current ? findP(current) : null;
    var h = '<div class="note" style="margin-top:10px">' + (cur ? "Part of " + App.recLink(cur.id) + ", " + esc(cur.name) + "." : "Not part of a project. Everyday buying needs none.");
    if (can && open.length) {
      h += '<div class="svcdecide" style="margin-top:8px"><select id="prjPick-' + recordId + '" aria-label="Project"><option value="">' + (cur ? "Move to another project" : "Add to a project") + "</option>" +
        open.map(function (p) { return '<option value="' + p.id + '">' + esc(p.id + "  " + p.name) + "</option>"; }).join("") + "</select>" +
        '<button class="small" data-act="prjLink" data-id="' + recordId + '">' + (cur ? "Move" : "Add") + "</button>" +
        (cur ? '<button class="small ghost" data-act="prjUnlink" data-id="' + recordId + '">Remove from project</button>' : "") + "</div>";
    } else if (can && cur) {
      h += ' <button class="small ghost" data-act="prjUnlink" data-id="' + recordId + '">Remove from project</button>';
    }
    return h + "</div>";
  };

  // One request's progress through the six steps: filled when done, ringed where it waits now.
  function steps(row) {
    return STAGES.map(function (name, i) {
      var cls = row.ready || i < row.stage ? "stg done" : i === row.stage ? "stg cur " + (KIND[row.state] || "info") : "stg";
      var label = row.ready || i < row.stage ? name + ": done" : i === row.stage ? name + ": waiting here" : name + ": not yet";
      return '<td class="stgcell"><span class="' + cls + '" title="' + label + '" aria-label="' + label + '"></span></td>';
    }).join("");
  }

  function rowsTable(p, st) {
    if (!st.rows.length) return '<p class="empty pad">No requests in this project yet. Add one below, or pick this project when raising a request.</p>';
    var canEdit = App.role === "requester" && p.status === "Open";
    return '<div class="wrap flat"><table class="pmap"><tr><th>Item or service</th>' + STAGES.map(function (n) { return '<th class="stgcell">' + n + "</th>"; }).join("") +
      "<th>Held by</th><th>Expected</th><th>State</th>" + (canEdit ? "<th></th>" : "") + "</tr>" +
      st.rows.map(function (row) {
        var r = row.request, ref = r.poId || r.prNo || r.id;
        return "<tr" + (st.gating && st.gating.request.id === r.id ? ' class="gate"' : "") + "><td><b>" + App.itemLink(row.item.id, row.item.name) + '</b><div class="muted">' +
          App.recLink(ref) + " · " + r.qty + " " + esc(r.uom) + (row.service && r.qty !== 1 ? "s" : "") + (row.po ? " · " + esc(App.supplier(row.po.supplierId).name) : "") + "</div></td>" +
          steps(row) + "<td>" + esc(row.holder) + (row.ready ? "" : '<div class="muted">' + row.since + " day" + (row.since === 1 ? "" : "s") + " since it last moved</div>") + "</td>" +
          '<td class="nowrap">' + (row.ready ? (row.note ? '<span style="white-space:normal">' + esc(row.note) + "</span>" : "In place") :
            day(row.expectedShown) + (row.promised ? '<div class="muted">promised ' + day(row.promised) + ", usually " + row.slip + " d late</div>" :
            row.note ? '<div class="muted" style="white-space:normal">' + esc(row.note) + "</div>" : "")) + "</td>" +
          "<td>" + App.pill(row.state, KIND[row.state]) + (st.gating && st.gating.request.id === r.id ? " " + App.pill("Gating", "bad") : "") +
            (row.idleDays ? " " + App.pill("Idle " + row.idleDays + " d", "warn") : "") + "</td>" +
          (canEdit ? '<td><button class="small ghost" data-act="prjUnlink" data-id="' + r.id + '">Remove</button></td>' : "") + "</tr>";
      }).join("") + "</table></div>";
  }

  // A plain bar per request from when it was raised to when it should be in place, with the target date as a line.
  function timeline(p, st) {
    if (!st.rows.length) return '<p class="empty pad">Nothing to draw until the project has requests.</p>';
    var today = App.today();
    var ends = st.rows.map(function (r) { return r.ready ? today : r.expectedShown; }).concat([p.target, today]);
    var start = st.rows.map(function (r) { return r.request.createdAt.slice(0, 10); }).sort()[0];
    var end = ends.sort().pop(), span = Math.max(1, P.daysBetween(start, end) + 2);
    var x = function (d) { return Math.max(0, Math.min(100, 100 * P.daysBetween(start, d) / span)); };
    return '<div class="pad tline"><div class="tl-axis"><span>' + day(start) + "</span><span>" + day(end) + "</span></div>" +
      '<div class="tl-rows"><i class="tl-target" style="left:calc(var(--tln) + (100% - var(--tln)) * ' + (x(p.target) / 100) + ')" title="Target ' + day(p.target) + '"></i>' +
      '<i class="tl-today" style="left:calc(var(--tln) + (100% - var(--tln)) * ' + (x(today) / 100) + ')" title="Today"></i>' +
      st.rows.map(function (row) {
        var a = x(row.request.createdAt.slice(0, 10)), b = x(row.ready ? today : row.expectedShown);
        return '<div class="tl-row"><span class="tl-name">' + esc(row.item.name) + '</span><span class="tl-track"><i class="tl-bar ' + (KIND[row.state] || "info") +
          '" style="left:' + a + "%;width:" + Math.max(1.5, b - a) + '%" data-tip="' + esc(row.item.name + ": " + row.state + (row.ready ? "" : ", expected " + row.expectedShown)) + '" tabindex="0"></i></span></div>';
      }).join("") + '</div><p class="barnote">The dark line is the target date, ' + day(p.target) + '. The dashed line is today. Each bar runs from the request to when it should be in place.</p></div>';
  }

  // The facts, gating note and cards for one project. Shared by this screen and the project's record page.
  App.projectBody = function (p) {
    var s = App.state, st = P.projectStatus(s, p, App.today());
    var cost = st.delayCost !== null ? App.money(st.delayCost).replace(/\.00$/, "") : null;
    var facts = [
      ["Target date", day(p.target)],
      ["Ready at the earliest", st.readyBy ? day(st.readyBy) : "No requests yet", st.daysLate ? "bad" : ""],
      [cost !== null ? "Cost of the delay" : "Days behind", cost !== null ? cost : String(st.daysLate), st.daysLate ? "bad" : ""],
      ["Items ready", st.counts.Ready + " of " + st.rows.length],
      ["Criticality", p.criticality],
      ["Value", App.money(st.value).replace(/\.00$/, "")]
    ];
    var gate = "";
    if (st.gating) {
      var g = st.gating, ref = g.request.poId || g.request.prNo || g.request.id;
      gate = '<div class="note ' + (g.state === "At risk" ? "warn" : "bad") + ' gatenote"><b>Holding the project up: ' + esc(g.item.name) + " (" + App.recLink(ref) + ")</b><br>" +
        esc(g.holder) + ". Expected " + day(g.expectedShown) + (st.daysLate ? ", " + st.daysLate + " day" + (st.daysLate === 1 ? "" : "s") + " after the target" : "") + "." +
        (st.delayCost ? " At " + App.money(p.costPerDay).replace(/\.00$/, "") + " a day of downtime, that costs " + cost + "." :
          st.daysLate && p.costPerDay === null ? " No downtime cost per day is set, so the delay is shown in days." : "") +
        (g.promised ? "<br>Promised " + day(g.promised) + ". " + esc(App.supplier(g.po.supplierId).name) + " usually delivers " + g.slip + " day" + (g.slip === 1 ? "" : "s") +
          " late (last " + g.recN + " deliveries), so the plan uses " + day(g.expectedShown) + "." : "") +
        (st.idle.length ? "<br>Knock on effect: " + st.idle.map(function (r) {
          return esc(r.item.name) + " is booked for " + day(r.po.promisedDate) + ", " + r.idleDays + " days before the rest can be ready. Move it, or it stands idle";
        }).join(". ") + "." : "") +
        (g.po && !g.service && App.role === "buyer" ? '<div class="actions" style="margin:8px 0 0"><button class="small" data-act="prjChase" data-id="' + g.po.id + '">Draft a chase to ' +
          esc(App.supplier(g.po.supplierId).name) + "</button></div>" : g.po && !g.service ? '<div class="hint" style="margin-top:6px">The Buyer can draft a chase to the supplier from here.</div>' : "") + "</div>";
    }
    var addable = s.requests.filter(function (r) { return r.projectId !== p.id && r.status !== "Cancelled" && r.status !== "Rejected"; });
    var add = App.role === "requester" && p.status === "Open" && addable.length ?
      '<div class="svcdecide pad"><select id="prjAdd-' + p.id + '" aria-label="Request to add"><option value="">Add a request to this project</option>' +
      addable.map(function (r) {
        return '<option value="' + r.id + '">' + esc(r.id + "  " + App.item(r.itemId).name + ", " + r.status.toLowerCase() + (r.projectId ? ", now in " + r.projectId : "")) + "</option>";
      }).join("") + '</select><button class="small" data-act="prjAdd" data-id="' + p.id + '">Add</button></div>' : "";
    var about = '<dl class="kv pad">' + [["Owner", esc(p.owner)], ["Site", esc(p.site) || '<span class="muted">Not set</span>'],
      ["Target", day(p.target)], ["Criticality", App.status(p.criticality) + ' <span class="muted">if this slips, how much does it hurt</span>'],
      ["Downtime cost", p.costPerDay !== null ? App.money(p.costPerDay).replace(/\.00$/, "") + " a day" : '<span class="muted">Not set. Production planning or plant finance usually knows it.</span>'],
      ["Note", esc(p.note) || '<span class="muted">None</span>'], ["Created", day(p.createdAt) + " by the " + esc(P.roleLabel(p.by))]]
      .map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl>";
    var counts = ["Ready", "On track", "At risk", "Late", "Blocked"].filter(function (k) { return st.counts[k]; })
      .map(function (k) { return App.pill(st.counts[k] + " " + k.toLowerCase(), KIND[k]); }).join(" ");
    return { st: st, facts: facts, gate: gate,
      cards: App.card("Where each item stands", (counts ? '<div class="pad pcounts">' + counts + "</div>" : "") + rowsTable(p, st) + add, "Filled step done, ringed step is where it waits", true) +
        App.card("Timeline to the target date", timeline(p, st), "From request to in place", true) +
        App.card("About this project", about) +
        App.card("What a project covers", '<div class="pad"><p style="margin:0 0 8px">A project groups the requests that must come together by one date. Their RFx, POs, receipts, service entries and invoices follow them, so nobody tags each document.</p>' +
          '<p style="margin:0 0 8px" class="muted">States compare each item\'s expected date with the target: late after it, at risk within 5 days of it, blocked on a quality hold or a rejection. Items not yet ordered use their need by date.</p>' +
          '<p style="margin:0" class="muted">Expected dates for goods use the supplier\'s delivery record, not only its promise: once a supplier has 3 or more past deliveries, its usual slip is added. A booking made before the rest can be ready is flagged as idle.</p></div>') };
  };

  function newForm() {
    return '<div class="card" style="margin-bottom:12px"><h3>New project</h3>' +
      '<p class="hint">For work where several purchases must come together by one date. Everyday buying needs no project.</p>' +
      '<form data-form="prjCreate" class="form">' +
      '<label class="wide">Name<input name="name" placeholder="The equipment and the work, such as Line 2 pump P-204 overhaul"></label>' +
      '<label>Target date<input type="date" name="target" value="' + P.addDays(App.today(), 21) + '"></label>' +
      '<label>Criticality<select name="criticality"><option>High</option><option selected>Medium</option><option>Low</option></select></label>' +
      '<label>Downtime cost per day (optional)<input type="number" name="costPerDay" min="0" step="1" placeholder="Leave empty if unknown"></label>' +
      '<label>Site<select name="site">' + REF.sites.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select></label>" +
      '<label>Owner<input name="owner" value="' + esc(App.roleInfo("requester").persona.split(",")[0]) + '"></label>' +
      '<label class="wide">Note<input name="note" placeholder="Anything people should know, such as why the date matters"></label>' +
      '<p class="hint wide" style="margin:0">Criticality: High means the line or a customer date stops if this slips. The cost per day usually comes from production planning or plant finance. Without it the app shows the delay in days.</p>' +
      '<div class="wide actions"><button type="submit">Create the project</button></div></form></div>';
  }

  function detail(p) {
    var b = App.projectBody(p);
    return '<div class="card"><h3>' + p.id + " " + App.pill(b.st.state === "Empty" ? "No requests" : b.st.state, KIND[b.st.state]) + " " + App.pill(p.criticality + " criticality", CRIT[p.criticality]) + App.recBtn(p.id) + "</h3>" +
      '<p class="hint" style="margin:0">' + esc(p.name) + " · " + esc(p.owner) + (p.site ? " · " + esc(p.site) : "") + "</p>" +
      '<div class="facts">' + b.facts.map(function (f) { return "<div><span>" + esc(f[0]) + "</span><b" + (f[2] ? ' class="' + f[2] + '"' : "") + ">" + esc(f[1]) + "</b></div>"; }).join("") + "</div>" +
      b.gate + "</div>" + '<div class="secs" style="margin-top:12px">' + b.cards + "</div>";
  }

  App.views.projects = function () {
    var s = App.state, today = App.today();
    var list = (s.projects || []).map(function (p) { return { p: p, st: P.projectStatus(s, p, today) }; })
      .sort(function (a, b) { return RANK[a.st.state] - RANK[b.st.state] || (b.st.delayCost || 0) - (a.st.delayCost || 0) || b.st.daysLate - a.st.daysLate || (a.p.target < b.p.target ? -1 : 1); });
    var html = "<h2>Projects</h2>" +
      '<p class="hint">The requests that must come together by one date, such as an overhaul or a shutdown, seen as one job. Worst first. Everyday buying needs no project.</p>';
    if (App.role === "requester") html += '<div style="margin-bottom:12px"><button data-act="prjNew">' + (App.sel.prjNew ? "Close the form" : "New project") + "</button></div>";
    if (App.role === "requester" && App.sel.prjNew) html += newForm();
    if (!list.length) return html + '<div class="card"><p class="empty">No projects yet.' + (App.role === "requester" ? " Create one for work where several purchases must land by one date." : "") + "</p></div>";
    html += '<div class="wrap"><table><tr><th>Project</th><th>Name</th><th>Target</th><th>Ready at the earliest</th><th>Items</th><th>Holding it up</th><th class="num">Delay</th><th>State</th></tr>' +
      list.map(function (o) {
        var p = o.p, st = o.st, n = st.rows.length || 1;
        var bar = '<div class="pbar" aria-hidden="true">' + ["Ready", "On track", "At risk", "Late", "Blocked"].map(function (k) {
          return st.counts[k] ? '<i class="' + KIND[k] + '" style="width:' + (100 * st.counts[k] / n) + '%"></i>' : "";
        }).join("") + "</div>";
        return '<tr class="clickable ' + (p.id === App.sel.projects ? "sel" : "") + '" data-act="prjSelect" data-id="' + p.id + '"><td>' + p.id + "</td><td><b>" + esc(p.name) + '</b><div class="muted">' +
          esc(p.criticality) + " criticality · " + esc(p.owner) + '</div></td><td class="nowrap">' + day(p.target) + '</td><td class="nowrap">' + (st.readyBy ? day(st.readyBy) : "") +
          "</td><td>" + bar + '<div class="muted">' + st.counts.Ready + " of " + st.rows.length + " ready</div></td><td>" + (st.gating ? esc(st.gating.item.name) + '<div class="muted">' + esc(st.gating.holder) + "</div>" : '<span class="muted">Nothing</span>') +
          '</td><td class="num">' + (st.delayCost ? App.money(st.delayCost).replace(/\.00$/, "") : st.daysLate ? st.daysLate + " d" : "") +
          "</td><td>" + App.pill(st.state === "Empty" ? "No requests" : st.state, KIND[st.state]) + "</td></tr>";
      }).join("") + "</table></div>";
    var sel = findP(App.sel.projects);
    html += '<div style="margin-top:12px">' + (sel ? detail(sel) : '<p class="hint">Select a project to see where each item stands.</p>') + "</div>";
    return html;
  };
})();
