const test = require("node:test");
const assert = require("node:assert");
const Core = require("../js/core.js");

const TODAY = new Date("2026-06-15T00:00:00");
const base = (o = {}) => ({
  id: "P1", name: "Test", owner: "A", sponsor: "B", stage: "Execute",
  start: "2026-05-16", end: "2026-07-15", // 60 days, today is day 30 => 50% planned
  budget: 1000, actual: 400, forecast: 1000, percentComplete: 50, ...o,
});
const item = (o = {}) => ({
  id: "R-1", projectId: "P1", type: "Risk", title: "t", likelihood: 2, impact: 2,
  owner: "A", due: "", status: "Open", response: "", ...o,
});

test("plannedPercent is time-based and clamped", () => {
  assert.strictEqual(Core.plannedPercent(base(), TODAY), 50);
  assert.strictEqual(Core.plannedPercent(base({ start: "2027-01-01", end: "2027-02-01" }), TODAY), 0);
  assert.strictEqual(Core.plannedPercent(base({ start: "2025-01-01", end: "2025-02-01" }), TODAY), 100);
});

test("on-track project is Green", () => {
  const r = Core.projectRag(base(), [], TODAY);
  assert.strictEqual(r.rag, "Green");
  assert.deepStrictEqual(r.reasons, ["On track"]);
});

test("schedule thresholds: >5 Amber, >15 Red, exactly 5 stays Green", () => {
  assert.strictEqual(Core.projectRag(base({ percentComplete: 45 }), [], TODAY).rag, "Green");
  assert.strictEqual(Core.projectRag(base({ percentComplete: 44 }), [], TODAY).rag, "Amber");
  assert.strictEqual(Core.projectRag(base({ percentComplete: 34 }), [], TODAY).rag, "Red");
});

test("cost thresholds: >5% Amber, >10% Red", () => {
  assert.strictEqual(Core.projectRag(base({ forecast: 1060 }), [], TODAY).rag, "Amber");
  assert.strictEqual(Core.projectRag(base({ forecast: 1110 }), [], TODAY).rag, "Red");
});

test("risk score drives RAG; closed risks are ignored", () => {
  assert.strictEqual(Core.projectRag(base(), [item({ likelihood: 4, impact: 5 })], TODAY).rag, "Red");
  assert.strictEqual(Core.projectRag(base(), [item({ likelihood: 3, impact: 4 })], TODAY).rag, "Amber");
  assert.strictEqual(Core.projectRag(base(), [item({ likelihood: 5, impact: 5, status: "Closed" })], TODAY).rag, "Green");
});

test("assumptions and dependencies do not turn a project Red", () => {
  const r = Core.projectRag(base(), [item({ type: "Assumption", likelihood: 5, impact: 5 })], TODAY);
  assert.strictEqual(r.rag, "Green");
});

test("overdue open RAID item makes project Amber", () => {
  const r = Core.projectRag(base(), [item({ due: "2026-06-01" })], TODAY);
  assert.strictEqual(r.rag, "Amber");
  assert.match(r.reasons.join(), /overdue/);
});

test("worst signal wins and all reasons are listed", () => {
  const r = Core.projectRag(base({ percentComplete: 40, forecast: 1120 }), [], TODAY);
  assert.strictEqual(r.rag, "Red");
  assert.strictEqual(r.reasons.length, 2);
});

test("completed projects are Green regardless of history", () => {
  const r = Core.projectRag(base({ percentComplete: 100, forecast: 2000 }), [item({ likelihood: 5, impact: 5 })], TODAY);
  assert.strictEqual(r.rag, "Green");
  assert.strictEqual(r.complete, true);
});

test("applyChange moves forecast and end date", () => {
  const p = Core.applyChange(base(), { costDelta: 100, daysDelta: 10 });
  assert.strictEqual(p.forecast, 1100);
  assert.strictEqual(p.end, "2026-07-25");
  const q = Core.applyChange(base(), { costDelta: -50, daysDelta: -5 });
  assert.strictEqual(q.forecast, 950);
  assert.strictEqual(q.end, "2026-07-10");
});

test("capacity: loads sum across projects and flag correctly", () => {
  const allocs = [
    { person: "X", role: "Dev", projectId: "P1", monthly: [60, 50, 0, 0, 0, 0] },
    { person: "X", role: "Dev", projectId: "P2", monthly: [50, 40, 0, 0, 0, 0] },
    { person: "Y", role: "QA", projectId: "P1", monthly: [30, 30, 30, 30, 30, 30] },
  ];
  const loads = Core.personLoads(allocs);
  assert.strictEqual(loads[0].person, "X");
  assert.deepStrictEqual(loads[0].months.slice(0, 2), [110, 90]);
  assert.strictEqual(Core.loadFlag(110), "over");
  assert.strictEqual(Core.loadFlag(90), "stretched");
  assert.strictEqual(Core.loadFlag(70), "ok");
  assert.strictEqual(Core.loadFlag(20), "low");
});

test("portfolioSummary counts and totals", () => {
  const data = {
    projects: [base({ id: "P1" }), base({ id: "P2", percentComplete: 30 }), base({ id: "P3", forecast: 1070 })],
    items: [item({ projectId: "P1", likelihood: 4, impact: 4 })],
    changes: [{ id: "CR-1", projectId: "P1", status: "Pending", costDelta: 0, daysDelta: 0, title: "x" }],
    allocations: [{ person: "X", role: "d", projectId: "P1", monthly: [120, 0, 0, 0, 0, 0] }],
  };
  const s = Core.portfolioSummary(data, TODAY);
  assert.deepStrictEqual(s.counts, { Red: 1, Amber: 2, Green: 0 });
  assert.strictEqual(s.budget, 3000);
  assert.strictEqual(s.pending, 1);
  assert.strictEqual(s.openHigh, 1);
  assert.strictEqual(s.overloaded, 1);
  assert.strictEqual(s.heat[3][3], 1); // impact 4, likelihood 4
});

test("status reports mention the essentials", () => {
  const data = {
    projects: [base({ percentComplete: 30 })],
    items: [item({ title: "Supplier delay", likelihood: 5, impact: 4, owner: "Sam" })],
    changes: [{ id: "CR-9", projectId: "P1", status: "Pending", costDelta: 5000, daysDelta: 3, title: "Extra scope" }],
    allocations: [],
  };
  const port = Core.statusReport(data, TODAY, "all");
  assert.match(port, /1 Red/);
  assert.match(port, /Supplier delay/);
  assert.match(port, /CR-9/);
  const one = Core.statusReport(data, TODAY, "P1");
  assert.match(one, /Test: status/);
  assert.match(one, /30% complete vs 50% planned/);
  assert.match(one, /Sponsor to confirm recovery plan/);
});

test("fmtMoney compacts values", () => {
  assert.strictEqual(Core.fmtMoney(1500000), "$1.50M");
  assert.strictEqual(Core.fmtMoney(25000, "₹"), "₹25K");
  assert.strictEqual(Core.fmtMoney(-120000), "-$120K");
});
