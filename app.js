/* PMO Control Tower - UI. Vanilla JS, no build step. */
(function () {
  "use strict";
  const KEY = "pmo-control-tower-v1";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const COLORS = { Red: "#f43f5e", Amber: "#fbbf24", Green: "#22c55e" };

  const TABS = [
    ["tower", "Control Tower"], ["projects", "Projects"], ["raid", "RAID Log"],
    ["capacity", "Capacity"], ["changes", "Change Control"], ["report", "Status Report"],
  ];

  let state = load();
  let view = (location.hash || "#tower").slice(1);
  if (!TABS.some((t) => t[0] === view)) view = "tower";
  const filters = { project: "all", type: "all", status: "Open" };
  let reportProject = "all";

  // ---------- persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.projects && s.items && s.changes && s.allocations) return s;
      }
    } catch (e) { /* fall through to demo data */ }
    return SampleData.make(today());
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } }
  const cur = () => (state.meta && state.meta.currency) || "$";
  const money = (n) => Core.fmtMoney(n, cur());
  const nextId = (key, prefix, pad) => {
    state.seq = state.seq || { p: 0, r: 0, c: 0 };
    state.seq[key] = (state.seq[key] || 0) + 1;
    return prefix + String(state.seq[key]).padStart(pad, "0");
  };
  const pName = (id) => { const p = state.projects.find((x) => x.id === id); return p ? p.name : "(deleted)"; };
  const projOptions = () => state.projects.map((p) => ({ value: p.id, label: p.name }));

  // ---------- shell ----------
  function renderNav() {
    $("#nav").innerHTML = TABS.map(([id, label]) =>
      `<a href="#${id}" class="${id === view ? "on" : ""}">${label}</a>`).join("");
    $("#cur").value = cur();
  }
  function render() {
    renderNav();
    const v = { tower, projects, raid, capacity, changes, report }[view];
    $("#app").innerHTML = v();
    if (view === "report") bindReport();
  }
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (TABS.some((t) => t[0] === h)) { view = h; render(); window.scrollTo(0, 0); }
  });

  // ---------- views ----------
  function kpi(label, value, sub, cls) {
    return `<div class="card kpi"><div class="k">${label}</div><div class="v ${cls || ""}">${value}</div><div class="s">${sub || ""}</div></div>`;
  }
  function donut(c) {
    const tot = c.Red + c.Amber + c.Green || 1, R = 52, C = 2 * Math.PI * R;
    let off = 0;
    const seg = (n, col) => {
      const len = (n / tot) * C;
      const s = n ? `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${col}" stroke-width="16"
        stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>` : "";
      off += len;
      return s;
    };
    return `<div class="donut"><svg viewBox="0 0 140 140" role="img" aria-label="Portfolio health">
      <circle r="${R}" cx="70" cy="70" fill="none" stroke="#1b2742" stroke-width="16"/>
      ${seg(c.Red, COLORS.Red)}${seg(c.Amber, COLORS.Amber)}${seg(c.Green, COLORS.Green)}
      <text x="70" y="76" text-anchor="middle" fill="#e8eef9" font-size="26" font-weight="800">${c.Red + c.Amber + c.Green}</text></svg>
      <div class="legend">${["Red", "Amber", "Green"].map((k) =>
        `<div><i style="background:${COLORS[k]}"></i>${c[k]} ${k}</div>`).join("")}</div></div>`;
  }
  function heatmap(heat) {
    let h = '<div class="heat">';
    for (let im = 4; im >= 0; im--) {
      h += `<div class="ax">${im + 1}</div>`;
      for (let li = 0; li < 5; li++) {
        const score = (im + 1) * (li + 1), n = heat[im][li];
        const col = score >= 15 ? "244,63,94" : score >= 8 ? "251,191,36" : "34,197,94";
        h += `<div style="background:rgba(${col},${n ? 0.55 : 0.12});color:${n ? "#fff" : "transparent"}"
          title="Impact ${im + 1} x Likelihood ${li + 1}: ${n} open">${n || "."}</div>`;
      }
    }
    h += '<div class="ax"></div>' + [1, 2, 3, 4, 5].map((x) => `<div class="ax">${x}</div>`).join("") + "</div>";
    return h + '<div class="muted" style="margin-top:8px;font-size:12px">Rows: impact. Columns: likelihood. Open risks and issues only.</div>';
  }

  function tower() {
    const t = today(), s = Core.portfolioSummary(state, t);
    const hot = s.rows.filter((r) => r.rag !== "Green").sort((a, b) => (a.rag === b.rag ? 0 : a.rag === "Red" ? -1 : 1));
    const mx = Math.max(1, ...state.projects.map((p) => Math.max(p.budget, p.forecast)));
    const vp = s.variancePct;
    return `
    <h1>Control Tower</h1><p class="sub">One view of portfolio health, risk, money and people. Today is ${Core.fmtDate(Core.iso(t))}.</p>
    <div class="row r6">
      ${kpi("Projects", state.projects.length, `${s.counts.Red} red, ${s.counts.Amber} amber`)}
      ${kpi("Budget", money(s.budget), `${money(s.actual)} spent`)}
      ${kpi("Forecast", money(s.forecast), `${vp >= 0 ? "+" : ""}${vp.toFixed(1)}% vs budget`, vp > 10 ? "red" : vp > 5 ? "amb" : "grn")}
      ${kpi("High risks open", s.openHigh, "score 15 or more", s.openHigh ? "red" : "grn")}
      ${kpi("Overdue RAID", s.overdue, "open items past due", s.overdue ? "amb" : "grn")}
      ${kpi("Decisions pending", s.pending, `${s.overloaded} people over 100%`, s.pending ? "amb" : "grn")}
    </div>
    <div class="row r2">
      <div class="card"><h2>Portfolio health</h2>${donut(s.counts)}
        <h2 style="margin-top:22px">By stage</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${["Initiate", "Plan", "Execute", "Close", "Closed"].map((st) =>
          `<span class="chip neutral">${st}: ${state.projects.filter((p) => p.stage === st).length}</span>`).join("")}</div>
        <h2 style="margin-top:22px">Finishing next</h2>
        <table>${[...state.projects].filter((p) => p.stage !== "Closed" && p.percentComplete < 100)
          .sort((a, b) => a.end.localeCompare(b.end)).slice(0, 4).map((p) => {
            const left = Math.round((Core.toDate(p.end) - t) / 864e5);
            return `<tr><td>${esc(p.name)}</td><td class="n ${left < 0 ? "late" : "muted"}">${Core.fmtDate(p.end)}</td>
              <td class="n ${left < 0 ? "late" : "muted"}">${left < 0 ? Math.abs(left) + " days late" : left + " days"}</td></tr>`;
          }).join("")}</table></div>
      <div class="card"><h2>Needs attention</h2>${hot.length ? `<div class="attn">${hot.map((r) => `
        <div class="it ${r.rag}"><div class="t"><span>${esc(r.p.name)}</span><span class="chip ${r.rag}">${r.rag}</span></div>
        <div class="r">${esc(r.reasons.join(" · "))}</div></div>`).join("")}</div>` : '<div class="empty">All projects are green.</div>'}</div>
    </div>
    <div class="row r2b">
      <div class="card"><h2>Budget vs forecast</h2><div class="bv">${s.rows.map((r) => {
        const p = r.p, col = r.over > 10 ? COLORS.Red : r.over > 5 ? COLORS.Amber : COLORS.Green;
        return `<div class="nm" title="${esc(p.name)}">${esc(p.name)}</div>
          <div class="tr"><i class="b" style="width:${(p.budget / mx) * 100}%"></i><i class="f" style="width:${(p.forecast / mx) * 100}%;background:${col}"></i></div>
          <div class="vv">${r.over >= 0 ? "+" : ""}${r.over.toFixed(1)}%</div>`;
      }).join("")}</div>
        <div class="muted" style="margin-top:10px;font-size:12px">Grey = budget. Colour = forecast.</div></div>
      <div class="card"><h2>Risk heat map</h2>${heatmap(s.heat)}</div>
    </div>`;
  }

  function projects() {
    const t = today(), s = Core.portfolioSummary(state, t);
    const rows = s.rows.map((r) => {
      const p = r.p, planned = Core.plannedPercent(p, t);
      return `<tr>
        <td><b>${esc(p.name)}</b><div class="muted">${esc(p.owner)} · ${esc(p.sponsor)}</div></td>
        <td><span class="chip neutral">${esc(p.stage)}</span></td>
        <td><span class="chip ${r.rag}" title="${esc(r.reasons.join("; "))}">${r.rag}</span></td>
        <td style="min-width:150px"><div class="bar"><i style="width:${p.percentComplete}%"></i><b style="left:${planned}%" title="Planned ${planned}%"></b></div>
          <div class="muted" style="font-size:12px;margin-top:4px">${p.percentComplete}% done · ${planned}% planned</div></td>
        <td class="n">${money(p.budget)}</td><td class="n">${money(p.forecast)}</td>
        <td class="n ${r.over > 10 ? "late" : ""}">${r.over >= 0 ? "+" : ""}${r.over.toFixed(1)}%</td>
        <td class="n">${Core.fmtDate(p.end)}</td>
        <td class="n"><button class="btn sm" data-act="edit-project" data-id="${p.id}">Edit</button>
          <button class="btn sm danger" data-act="del-project" data-id="${p.id}">Delete</button></td></tr>`;
    }).join("");
    return `<h1>Projects</h1><p class="sub">Status is calculated from schedule, cost and open risks. Hover a status chip to see why. The white tick on the bar marks where the plan says you should be.</p>
      <div class="filters"><button class="btn primary" data-act="add-project">+ New project</button></div>
      <div class="card scroll">${state.projects.length ? `<table><tr><th>Project</th><th>Stage</th><th>Status</th><th>Progress</th>
      <th class="n">Budget</th><th class="n">Forecast</th><th class="n">Var</th><th class="n">End</th><th></th></tr>${rows}</table>` : '<div class="empty">No projects yet.</div>'}</div>`;
  }

  function raid() {
    const t = today();
    const list = state.items.filter((i) =>
      (filters.project === "all" || i.projectId === filters.project) &&
      (filters.type === "all" || i.type === filters.type) &&
      (filters.status === "all" || i.status === filters.status))
      .sort((a, b) => Core.riskScore(b) - Core.riskScore(a));
    const sel = (id, opts, val) => `<select class="btn" data-filter="${id}">${opts.map((o) =>
      `<option value="${esc(o[0])}" ${String(val) === String(o[0]) ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
    const chipFor = (sc) => `<span class="chip ${sc >= 15 ? "Red" : sc >= 8 ? "Amber" : "Green"}">${sc}</span>`;
    return `<h1>RAID Log</h1><p class="sub">Risks, assumptions, issues and dependencies. Score = likelihood x impact (1 to 25).</p>
      <div class="filters"><button class="btn primary" data-act="add-item">+ New item</button>
        ${sel("project", [["all", "All projects"], ...state.projects.map((p) => [p.id, p.name])], filters.project)}
        ${sel("type", [["all", "All types"], ["Risk", "Risk"], ["Assumption", "Assumption"], ["Issue", "Issue"], ["Dependency", "Dependency"]], filters.type)}
        ${sel("status", [["Open", "Open"], ["Closed", "Closed"], ["all", "All"]], filters.status)}</div>
      <div class="card scroll">${list.length ? `<table><tr><th>ID</th><th>Item</th><th>Project</th><th>Type</th><th class="n">Score</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr>
      ${list.map((i) => `<tr><td class="muted">${esc(i.id)}</td>
        <td><b>${esc(i.title)}</b>${i.response ? `<div class="muted" style="font-size:12.5px">${esc(i.response)}</div>` : ""}</td>
        <td>${esc(pName(i.projectId))}</td><td>${esc(i.type)}</td>
        <td class="n">${Core.isRiskLike(i) ? chipFor(Core.riskScore(i)) : '<span class="muted">n/a</span>'}</td>
        <td>${esc(i.owner)}</td>
        <td class="${Core.isOverdue(i, t) ? "late" : ""}">${Core.fmtDate(i.due)}${Core.isOverdue(i, t) ? " (overdue)" : ""}</td>
        <td><span class="chip neutral">${esc(i.status)}</span></td>
        <td class="n"><button class="btn sm" data-act="toggle-item" data-id="${i.id}">${i.status === "Open" ? "Close" : "Reopen"}</button>
          <button class="btn sm" data-act="edit-item" data-id="${i.id}">Edit</button>
          <button class="btn sm danger" data-act="del-item" data-id="${i.id}">Delete</button></td></tr>`).join("")}</table>` : '<div class="empty">Nothing matches these filters.</div>'}</div>`;
  }

  function capacity() {
    const t = today(), months = Core.monthLabels(t), loads = Core.personLoads(state.allocations);
    return `<h1>Capacity</h1><p class="sub">Total allocation per person per month across all projects. Over 100% is overloaded; over 85% is stretched.</p>
      <div class="filters"><button class="btn primary" data-act="add-alloc">+ New allocation</button></div>
      <div class="card scroll cap">${loads.length ? `<table><tr><th>Person</th>${months.map((m) => `<th class="c">${m}</th>`).join("")}</tr>
      ${loads.map((l) => `<tr><td><b>${esc(l.person)}</b><div class="muted">${esc(l.role)} · ${l.rows.map((r) => esc(pName(r.projectId))).join(", ")}</div></td>
        ${l.months.map((v) => `<td class="c"><span class="cell ${Core.loadFlag(v)}">${v}%</span></td>`).join("")}</tr>`).join("")}</table>` : '<div class="empty">No allocations yet.</div>'}</div>
      <div class="card scroll" style="margin-top:16px"><h2>Allocation lines</h2>${state.allocations.length ? `<table><tr><th>Person</th><th>Project</th>${months.map((m) => `<th class="c">${m}</th>`).join("")}<th></th></tr>
      ${state.allocations.map((a, i) => `<tr><td>${esc(a.person)}</td><td>${esc(pName(a.projectId))}</td>
        ${a.monthly.map((v) => `<td class="c muted">${v}</td>`).join("")}
        <td class="n"><button class="btn sm" data-act="edit-alloc" data-i="${i}">Edit</button>
        <button class="btn sm danger" data-act="del-alloc" data-i="${i}">Delete</button></td></tr>`).join("")}</table>` : ""}</div>`;
  }

  function changes() {
    const list = [...state.changes].reverse();
    const approved = state.changes.filter((c) => c.status === "Approved");
    const cost = approved.reduce((t, c) => t + Number(c.costDelta || 0), 0);
    const days = approved.reduce((t, c) => t + Number(c.daysDelta || 0), 0);
    return `<h1>Change Control</h1><p class="sub">Every change to scope, cost or schedule goes through here. Approving a change updates the project forecast and end date.</p>
      <div class="filters"><button class="btn primary" data-act="add-change">+ New change request</button>
        <span class="muted">Approved so far: ${money(cost)} and ${days >= 0 ? "+" : ""}${days} days across the portfolio</span></div>
      <div class="card scroll">${list.length ? `<table><tr><th>ID</th><th>Change</th><th>Project</th><th class="n">Cost</th><th class="n">Days</th><th>By</th><th>Raised</th><th>Status</th><th></th></tr>
      ${list.map((c) => `<tr><td class="muted">${esc(c.id)}</td><td><b>${esc(c.title)}</b></td><td>${esc(pName(c.projectId))}</td>
        <td class="n">${money(c.costDelta)}</td><td class="n">${c.daysDelta > 0 ? "+" : ""}${c.daysDelta}</td>
        <td>${esc(c.requestedBy)}</td><td>${Core.fmtDate(c.date)}</td><td><span class="chip ${c.status}">${esc(c.status)}</span></td>
        <td class="n">${c.status === "Pending" ? `<button class="btn sm" data-act="approve" data-id="${c.id}">Approve</button>
          <button class="btn sm danger" data-act="reject" data-id="${c.id}">Reject</button>` : ""}
          <button class="btn sm danger" data-act="del-change" data-id="${c.id}">Delete</button></td></tr>`).join("")}</table>` : '<div class="empty">No change requests.</div>'}</div>`;
  }

  function report() {
    return `<h1>Status Report</h1><p class="sub">A ready-to-send summary built from live data. Copy it into an email, Teams or Slack.</p>
      <div class="filters"><select class="btn" id="repProj"><option value="all">Whole portfolio</option>
        ${state.projects.map((p) => `<option value="${p.id}" ${p.id === reportProject ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
        <button class="btn primary" id="copyRep">Copy</button><button class="btn" id="dlRep">Download .md</button></div>
      <textarea class="rep" id="repText" spellcheck="false">${esc(Core.statusReport(state, today(), reportProject, cur()))}</textarea>`;
  }
  function bindReport() {
    const sel = $("#repProj"), ta = $("#repText");
    sel.onchange = () => { reportProject = sel.value; ta.value = Core.statusReport(state, today(), reportProject, cur()); };
    $("#copyRep").onclick = async (e) => {
      try { await navigator.clipboard.writeText(ta.value); } catch (err) { ta.select(); document.execCommand("copy"); }
      e.target.textContent = "Copied"; setTimeout(() => { e.target.textContent = "Copy"; }, 1200);
    };
    $("#dlRep").onclick = () => download("status-report.md", ta.value, "text/markdown");
  }

  // ---------- forms ----------
  function fieldHtml(f, val) {
    const v = val == null ? "" : val, cls = f.wide ? "wide" : "";
    if (f.type === "select") {
      const opts = f.options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
      return `<label class="${cls}">${f.label}<select name="${f.key}">${opts.map((o) =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`;
    }
    if (f.type === "textarea") return `<label class="${cls}">${f.label}<textarea name="${f.key}" rows="2">${esc(v)}</textarea></label>`;
    const extra = f.type === "number" ? ` step="any"${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""}` : "";
    return `<label class="${cls}">${f.label}<input name="${f.key}" type="${f.type || "text"}" value="${esc(v)}"${extra} ${f.required ? "required" : ""}></label>`;
  }
  function openForm(title, fields, values, onSave) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<form class="modal"><h3>${esc(title)}</h3><div class="fgrid">${fields.map((f) => fieldHtml(f, values[f.key])).join("")}</div>
      <div class="factions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`;
    document.body.appendChild(ov);
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.querySelector("[data-close]").onclick = () => ov.remove();
    const first = ov.querySelector("input,select,textarea"); if (first) first.focus();
    ov.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach((f) => {
        let v = ov.querySelector(`[name="${f.key}"]`).value;
        if (f.type === "number") v = v === "" ? 0 : Number(v);
        out[f.key] = v;
      });
      onSave(out); ov.remove(); save(); render();
    };
  }

  const STAGES = ["Initiate", "Plan", "Execute", "Close", "Closed"];
  const projectFields = () => [
    { key: "name", label: "Project name", required: true, wide: true },
    { key: "owner", label: "Project manager" }, { key: "sponsor", label: "Sponsor" },
    { key: "stage", label: "Stage", type: "select", options: STAGES },
    { key: "percentComplete", label: "% complete", type: "number", min: 0, max: 100 },
    { key: "start", label: "Start", type: "date", required: true }, { key: "end", label: "End", type: "date", required: true },
    { key: "budget", label: "Budget", type: "number", min: 0 }, { key: "actual", label: "Spent to date", type: "number", min: 0 },
    { key: "forecast", label: "Forecast at completion", type: "number", min: 0 },
  ];
  const itemFields = () => [
    { key: "title", label: "Title", required: true, wide: true },
    { key: "projectId", label: "Project", type: "select", options: projOptions() },
    { key: "type", label: "Type", type: "select", options: ["Risk", "Assumption", "Issue", "Dependency"] },
    { key: "likelihood", label: "Likelihood (1-5)", type: "number", min: 1, max: 5 },
    { key: "impact", label: "Impact (1-5)", type: "number", min: 1, max: 5 },
    { key: "owner", label: "Owner" }, { key: "due", label: "Due", type: "date" },
    { key: "status", label: "Status", type: "select", options: ["Open", "Closed"] },
    { key: "response", label: "Response / next step", type: "textarea", wide: true },
  ];
  const changeFields = () => [
    { key: "title", label: "What is changing?", required: true, wide: true },
    { key: "projectId", label: "Project", type: "select", options: projOptions() },
    { key: "requestedBy", label: "Requested by" },
    { key: "costDelta", label: "Cost impact (+/-)", type: "number" },
    { key: "daysDelta", label: "Schedule impact in days (+/-)", type: "number" },
  ];
  const allocFields = () => {
    const m = Core.monthLabels(today());
    return [
      { key: "person", label: "Person", required: true }, { key: "role", label: "Role" },
      { key: "projectId", label: "Project", type: "select", options: projOptions() },
      ...m.map((l, i) => ({ key: "m" + i, label: l + " %", type: "number", min: 0, max: 200 })),
    ];
  };

  // ---------- actions ----------
  const find = (arr, id) => arr.find((x) => x.id === id);
  const ACTIONS = {
    "add-project": () => openForm("New project", projectFields(), {
      stage: "Plan", percentComplete: 0, budget: 0, actual: 0, forecast: 0,
      start: Core.iso(today()), end: Core.iso(new Date(today().getTime() + 90 * 864e5)),
    }, (v) => { v.id = nextId("p", "P", 1); state.projects.push(v); }),
    "edit-project": (el) => { const p = find(state.projects, el.dataset.id);
      openForm("Edit project", projectFields(), p, (v) => Object.assign(p, v)); },
    "del-project": (el) => {
      const p = find(state.projects, el.dataset.id);
      if (!confirm(`Delete "${p.name}" and its RAID items, changes and allocations?`)) return;
      state.projects = state.projects.filter((x) => x.id !== p.id);
      state.items = state.items.filter((x) => x.projectId !== p.id);
      state.changes = state.changes.filter((x) => x.projectId !== p.id);
      state.allocations = state.allocations.filter((x) => x.projectId !== p.id);
      save(); render();
    },
    "add-item": () => {
      if (!state.projects.length) return alert("Create a project first.");
      openForm("New RAID item", itemFields(), { type: "Risk", likelihood: 3, impact: 3, status: "Open", projectId: state.projects[0].id },
        (v) => { v.id = nextId("r", "R-", 3); state.items.push(v); });
    },
    "edit-item": (el) => { const i = find(state.items, el.dataset.id); openForm("Edit RAID item", itemFields(), i, (v) => Object.assign(i, v)); },
    "toggle-item": (el) => { const i = find(state.items, el.dataset.id); i.status = i.status === "Open" ? "Closed" : "Open"; save(); render(); },
    "del-item": (el) => { if (confirm("Delete this item?")) { state.items = state.items.filter((x) => x.id !== el.dataset.id); save(); render(); } },
    "add-change": () => {
      if (!state.projects.length) return alert("Create a project first.");
      openForm("New change request", changeFields(), { costDelta: 0, daysDelta: 0, projectId: state.projects[0].id },
        (v) => { v.id = nextId("c", "CR-", 3); v.status = "Pending"; v.date = Core.iso(today()); state.changes.push(v); });
    },
    approve: (el) => {
      const c = find(state.changes, el.dataset.id), p = find(state.projects, c.projectId);
      if (c.status !== "Pending") return;
      if (p) Core.applyChange(p, c);
      c.status = "Approved"; save(); render();
    },
    reject: (el) => { const c = find(state.changes, el.dataset.id); c.status = "Rejected"; save(); render(); },
    "del-change": (el) => { if (confirm("Delete this change request? (Does not undo its effect on the forecast.)")) { state.changes = state.changes.filter((x) => x.id !== el.dataset.id); save(); render(); } },
    "add-alloc": () => {
      if (!state.projects.length) return alert("Create a project first.");
      const v = { projectId: state.projects[0].id }; for (let i = 0; i < 6; i++) v["m" + i] = 0;
      openForm("New allocation", allocFields(), v, (o) => state.allocations.push(allocFromForm(o)));
    },
    "edit-alloc": (el) => {
      const a = state.allocations[+el.dataset.i], v = { person: a.person, role: a.role, projectId: a.projectId };
      a.monthly.forEach((x, i) => { v["m" + i] = x; });
      openForm("Edit allocation", allocFields(), v, (o) => { state.allocations[+el.dataset.i] = allocFromForm(o); });
    },
    "del-alloc": (el) => { state.allocations.splice(+el.dataset.i, 1); save(); render(); },
    export: () => download("pmo-control-tower.json", JSON.stringify(state, null, 2), "application/json"),
    import: () => $("#file").click(),
    reset: () => { if (confirm("Replace all data with the synthetic demo portfolio?")) { state = SampleData.make(today()); save(); render(); } },
  };
  function allocFromForm(o) {
    return { person: o.person, role: o.role, projectId: o.projectId, monthly: [0, 1, 2, 3, 4, 5].map((i) => Number(o["m" + i]) || 0) };
  }
  function download(name, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el);
  });
  document.addEventListener("change", (e) => {
    if (e.target.dataset && e.target.dataset.filter) { filters[e.target.dataset.filter] = e.target.value; render(); }
  });
  $("#cur").addEventListener("change", (e) => { state.meta = state.meta || {}; state.meta.currency = e.target.value; save(); render(); });
  $("#file").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const s = JSON.parse(rd.result);
        if (!(s.projects && s.items && s.changes && s.allocations)) throw new Error("Missing sections");
        state = s; save(); render();
      } catch (err) { alert("Could not import: " + err.message); }
    };
    rd.readAsText(f); e.target.value = "";
  });

  render();
})();
