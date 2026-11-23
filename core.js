/* PMO Control Tower - core logic (pure functions, no DOM). Works in browser and Node. */
(function (root) {
  "use strict";

  const toDate = (s) => new Date(s + "T00:00:00");
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---------- project health ----------
  function plannedPercent(p, today) {
    const s = toDate(p.start), e = toDate(p.end);
    const span = e - s;
    if (span <= 0) return 100;
    return Math.round(clamp((today - s) / span, 0, 1) * 100);
  }
  // positive = behind plan, in percentage points
  const scheduleGap = (p, today) => plannedPercent(p, today) - Number(p.percentComplete || 0);
  const costOverPct = (p) => (p.budget > 0 ? ((p.forecast - p.budget) / p.budget) * 100 : 0);

  const riskScore = (r) => Number(r.likelihood) * Number(r.impact);
  const isOpen = (r) => r.status !== "Closed";
  const isRiskLike = (r) => r.type === "Risk" || r.type === "Issue";
  const isOverdue = (r, today) => isOpen(r) && !!r.due && toDate(r.due) < today;

  const ORDER = { Green: 0, Amber: 1, Red: 2 };
  const worst = (a, b) => (ORDER[a] >= ORDER[b] ? a : b);

  /**
   * RAG rules (documented in the README):
   *  Schedule: >15 pts behind = Red, >5 = Amber
   *  Cost:     forecast >10% over budget = Red, >5% = Amber
   *  Risk:     open risk/issue score >=20 = Red, >=12 = Amber
   *  Hygiene:  any overdue open RAID item = Amber
   */
  function projectRag(p, items, today) {
    const gap = scheduleGap(p, today);
    const over = costOverPct(p);
    if (Number(p.percentComplete) >= 100 || p.stage === "Closed") {
      return { rag: "Green", reasons: ["Complete"], gap: 0, over, complete: true };
    }
    let rag = "Green";
    const reasons = [];

    if (gap > 15) { rag = "Red"; reasons.push(`Schedule ${gap} pts behind plan`); }
    else if (gap > 5) { rag = worst(rag, "Amber"); reasons.push(`Schedule ${gap} pts behind plan`); }

    if (over > 10) { rag = "Red"; reasons.push(`Forecast ${over.toFixed(1)}% over budget`); }
    else if (over > 5) { rag = worst(rag, "Amber"); reasons.push(`Forecast ${over.toFixed(1)}% over budget`); }

    const mine = items.filter((i) => i.projectId === p.id && isOpen(i));
    const top = mine.filter(isRiskLike).reduce((m, i) => Math.max(m, riskScore(i)), 0);
    if (top >= 20) { rag = "Red"; reasons.push(`Severe open risk or issue (score ${top})`); }
    else if (top >= 12) { rag = worst(rag, "Amber"); reasons.push(`High open risk or issue (score ${top})`); }

    const od = mine.filter((i) => isOverdue(i, today)).length;
    if (od > 0) { rag = worst(rag, "Amber"); reasons.push(`${od} overdue RAID item${od > 1 ? "s" : ""}`); }

    if (!reasons.length) reasons.push("On track");
    return { rag, reasons, gap, over, complete: false };
  }

  // ---------- change control ----------
  function applyChange(project, change) {
    project.forecast = Number(project.forecast) + (Number(change.costDelta) || 0);
    const days = Number(change.daysDelta) || 0;
    if (days) {
      const e = toDate(project.end);
      e.setDate(e.getDate() + days);
      project.end = iso(e);
    }
    return project;
  }

  // ---------- capacity ----------
  function monthLabels(today, n = 6) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(MONTHS[(today.getMonth() + i) % 12]);
    return out;
  }
  function personLoads(allocs, n = 6) {
    const map = new Map();
    for (const a of allocs) {
      if (!map.has(a.person)) map.set(a.person, { person: a.person, role: a.role, months: Array(n).fill(0), rows: [] });
      const rec = map.get(a.person);
      a.monthly.forEach((v, i) => { rec.months[i] += Number(v) || 0; });
      rec.rows.push(a);
    }
    return [...map.values()].sort((x, y) => Math.max(...y.months) - Math.max(...x.months));
  }
  const loadFlag = (v) => (v > 100 ? "over" : v > 85 ? "stretched" : v >= 50 ? "ok" : "low");

  // ---------- portfolio ----------
  function portfolioSummary(data, today) {
    const rows = data.projects.map((p) => ({ p, ...projectRag(p, data.items, today) }));
    const counts = { Red: 0, Amber: 0, Green: 0 };
    rows.forEach((r) => { counts[r.rag]++; });
    const sum = (k) => data.projects.reduce((t, p) => t + Number(p[k] || 0), 0);
    const budget = sum("budget"), forecast = sum("forecast"), actual = sum("actual");
    const open = data.items.filter(isOpen);
    const heat = Array.from({ length: 5 }, () => Array(5).fill(0)); // [impact-1][likelihood-1]
    open.filter(isRiskLike).forEach((r) => {
      const li = clamp(Number(r.likelihood), 1, 5) - 1, im = clamp(Number(r.impact), 1, 5) - 1;
      heat[im][li]++;
    });
    const loads = personLoads(data.allocations);
    return {
      rows, counts, budget, forecast, actual,
      variancePct: budget ? ((forecast - budget) / budget) * 100 : 0,
      openHigh: open.filter((r) => isRiskLike(r) && riskScore(r) >= 15).length,
      overdue: open.filter((r) => isOverdue(r, today)).length,
      pending: data.changes.filter((c) => c.status === "Pending").length,
      overloaded: loads.filter((l) => Math.max(...l.months) > 100).length,
      heat, loads,
    };
  }

  // ---------- formatting ----------
  function fmtMoney(n, cur = "$") {
    const a = Math.abs(n), s = n < 0 ? "-" : "";
    if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(0)}K`;
    return `${s}${cur}${a.toFixed(0)}`;
  }
  const fmtDate = (s) => {
    if (!s) return "";
    const d = toDate(s);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  // ---------- status report (markdown) ----------
  function statusReport(data, today, projectId, cur = "$") {
    const L = [];
    const nameOf = (id) => (data.projects.find((p) => p.id === id) || {}).name || "Unknown";
    const itemsFor = (fn) => data.items.filter((i) => isOpen(i) && fn(i))
      .sort((a, b) => riskScore(b) - riskScore(a));

    if (projectId && projectId !== "all") {
      const p = data.projects.find((x) => x.id === projectId);
      if (!p) return "";
      const h = projectRag(p, data.items, today);
      L.push(`# ${p.name}: status ${fmtDate(iso(today))}`);
      L.push("");
      L.push(`**Overall:** ${h.rag}${h.complete ? "" : ": " + h.reasons.join("; ")}`);
      L.push(`**Stage:** ${p.stage}  |  **Owner:** ${p.owner}  |  **Sponsor:** ${p.sponsor}`);
      L.push(`**Progress:** ${p.percentComplete}% complete vs ${plannedPercent(p, today)}% planned  |  **End date:** ${fmtDate(p.end)}`);
      L.push(`**Budget:** ${fmtMoney(p.budget, cur)}  |  **Spent:** ${fmtMoney(p.actual, cur)}  |  **Forecast:** ${fmtMoney(p.forecast, cur)} (${costOverPct(p) >= 0 ? "+" : ""}${costOverPct(p).toFixed(1)}%)`);
      const risks = itemsFor((i) => i.projectId === p.id && isRiskLike(i)).slice(0, 5);
      L.push("", "## Top risks and issues");
      if (!risks.length) L.push("- None open");
      risks.forEach((r) => L.push(`- [${riskScore(r)}] ${r.title}. Owner: ${r.owner}${r.due ? ", due " + fmtDate(r.due) : ""}${isOverdue(r, today) ? " (OVERDUE)" : ""}`));
      const pend = data.changes.filter((c) => c.projectId === p.id && c.status === "Pending");
      L.push("", "## Decisions needed");
      if (!pend.length && h.rag === "Green") L.push("- None");
      pend.forEach((c) => L.push(`- Decide on ${c.id}: ${c.title} (${fmtMoney(c.costDelta, cur)}, ${c.daysDelta} days)`));
      if (h.rag === "Red") L.push("- Sponsor to confirm recovery plan or re-baseline");
      return L.join("\n");
    }

    const s = portfolioSummary(data, today);
    L.push(`# Portfolio status: ${fmtDate(iso(today))}`, "");
    L.push(`**Overall:** ${s.counts.Red} Red, ${s.counts.Amber} Amber, ${s.counts.Green} Green across ${data.projects.length} projects`);
    L.push(`**Budget:** ${fmtMoney(s.budget, cur)}  |  **Forecast:** ${fmtMoney(s.forecast, cur)} (${s.variancePct >= 0 ? "+" : ""}${s.variancePct.toFixed(1)}%)  |  **Spent:** ${fmtMoney(s.actual, cur)}`);
    L.push("", "## Needs attention");
    const hot = s.rows.filter((r) => r.rag !== "Green").sort((a, b) => ORDER[b.rag] - ORDER[a.rag]);
    if (!hot.length) L.push("- Nothing: all projects are green");
    hot.forEach((r) => L.push(`- **${r.p.name}** (${r.rag}): ${r.reasons.join("; ")}`));
    L.push("", "## Top risks");
    const top = itemsFor(isRiskLike).slice(0, 5);
    if (!top.length) L.push("- None open");
    top.forEach((r) => L.push(`- [${riskScore(r)}] ${r.title} (${nameOf(r.projectId)}). Owner: ${r.owner}`));
    L.push("", "## Decisions needed");
    const pend = data.changes.filter((c) => c.status === "Pending");
    if (!pend.length) L.push("- None");
    pend.forEach((c) => L.push(`- ${c.id} (${nameOf(c.projectId)}): ${c.title}, ${fmtMoney(c.costDelta, cur)} / ${c.daysDelta} days`));
    if (s.overloaded) L.push(`- Resolve capacity: ${s.overloaded} ${s.overloaded > 1 ? "people are" : "person is"} allocated above 100%`);
    return L.join("\n");
  }

  const api = {
    toDate, iso, plannedPercent, scheduleGap, costOverPct, riskScore, isOpen, isRiskLike, isOverdue,
    projectRag, applyChange, monthLabels, personLoads, loadFlag, portfolioSummary, fmtMoney, fmtDate, statusReport,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== "undefined" ? window : globalThis);
