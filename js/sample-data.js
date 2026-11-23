/* Fully synthetic demo portfolio. Dates are relative to today so the demo always looks alive. */
(function (root) {
  "use strict";
  function make(today) {
    const d = (off) => {
      const x = new Date(today);
      x.setDate(x.getDate() + off);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    };
    const P = (id, name, owner, sponsor, stage, s, e, budget, actual, forecast, pct) =>
      ({ id, name, owner, sponsor, stage, start: d(s), end: d(e), budget, actual, forecast, percentComplete: pct });

    const projects = [
      P("P1", "ERP Upgrade", "Priya N.", "CFO", "Execute", -120, 60, 1200000, 780000, 1230000, 58),
      P("P2", "Warehouse Automation", "Marcus L.", "COO", "Execute", -200, 30, 2500000, 2300000, 2900000, 80),
      P("P3", "Customer Portal Revamp", "Aisha K.", "CMO", "Execute", -60, 90, 600000, 220000, 610000, 40),
      P("P4", "Data Centre Migration", "Tom R.", "CIO", "Execute", -90, 45, 1800000, 1300000, 1900000, 60),
      P("P5", "New Plant Commissioning", "Elena V.", "COO", "Execute", -300, 120, 5200000, 3300000, 5250000, 66),
      P("P6", "HR Shared Services", "Daniel O.", "CHRO", "Plan", -30, 150, 450000, 60000, 450000, 12),
      P("P7", "Compliance Programme", "Sofia M.", "General Counsel", "Close", -150, -10, 300000, 290000, 305000, 92),
      P("P8", "Mobile App Launch", "Raj S.", "CMO", "Initiate", -20, 100, 350000, 40000, 350000, 15),
    ];

    const R = (id, projectId, type, title, likelihood, impact, owner, due, status, response) =>
      ({ id, projectId, type, title, likelihood, impact, owner, due: due === null ? "" : d(due), status, response });
    const items = [
      R("R-001", "P1", "Risk", "Key business users unavailable for UAT", 4, 3, "Priya N.", 10, "Open", "Reduce: book UAT slots now and get sponsor sign-off on backfill"),
      R("R-002", "P1", "Dependency", "Data cleansing must finish before migration rehearsal", 3, 4, "Aisha K.", -3, "Open", "Weekly checkpoint with data owners"),
      R("R-003", "P2", "Issue", "Conveyor supplier delivery slipped 6 weeks", 5, 4, "Marcus L.", 7, "Open", "Resequence install; seek expedite fee approval"),
      R("R-004", "P2", "Risk", "Safety certification may delay go-live", 3, 5, "Marcus L.", 20, "Open", "Pre-audit with certifier next month"),
      R("R-005", "P3", "Risk", "Third-party API rate limits under peak load", 3, 3, "Aisha K.", 30, "Open", "Load test in sprint 6"),
      R("R-006", "P4", "Risk", "Cutover window overlaps quarter-end freeze", 3, 4, "Tom R.", 14, "Open", "Negotiate alternate window with Finance"),
      R("R-007", "P4", "Issue", "Legacy storage firmware blocks replication", 4, 3, "Tom R.", -5, "Open", "Vendor patch promised; test in lab first"),
      R("R-008", "P5", "Risk", "Long-lead transformer held at customs", 4, 5, "Elena V.", 5, "Open", "Escalate to customs broker; line up temporary supply"),
      R("R-009", "P5", "Assumption", "Utility connection approved by end of quarter", 3, 4, "Elena V.", 25, "Open", "Confirm with utility in writing"),
      R("R-010", "P6", "Risk", "Union consultation could extend design phase", 2, 4, "Daniel O.", 40, "Open", "Start consultation early"),
      R("R-011", "P7", "Issue", "Two audit findings still open", 3, 3, "Sofia M.", -8, "Open", "Evidence pack due to auditor"),
      R("R-012", "P8", "Risk", "App store review could slip launch", 2, 3, "Raj S.", 60, "Open", "Submit beta build early"),
      R("R-013", "P3", "Risk", "Design system not finalised", 2, 2, "Aisha K.", -20, "Closed", "Approved last sprint"),
    ];

    const C = (id, projectId, title, costDelta, daysDelta, requestedBy, status, date) =>
      ({ id, projectId, title, costDelta, daysDelta, requestedBy, status, date: d(date) });
    const changes = [
      C("CR-001", "P2", "Add expedite freight for conveyor modules", 120000, -14, "Marcus L.", "Pending", -4),
      C("CR-002", "P1", "Add Finance reporting module to scope", 90000, 21, "CFO office", "Pending", -2),
      C("CR-003", "P4", "Extra weekend cutover rehearsal", 35000, 0, "Tom R.", "Approved", -25),
      C("CR-004", "P3", "Drop legacy browser support", -25000, -7, "Aisha K.", "Approved", -18),
      C("CR-005", "P5", "Upgrade control-room software licence", 60000, 0, "Elena V.", "Rejected", -40),
    ];

    const A = (person, role, projectId, monthly) => ({ person, role, projectId, monthly });
    const allocations = [
      A("Tom R.", "Technical Lead", "P4", [60, 60, 50, 40, 20, 10]),
      A("Tom R.", "Technical Lead", "P1", [40, 40, 40, 30, 30, 20]),
      A("Tom R.", "Technical Lead", "P3", [20, 20, 20, 20, 20, 20]),
      A("Aisha K.", "Business Analyst", "P3", [50, 50, 50, 50, 40, 30]),
      A("Aisha K.", "Business Analyst", "P1", [30, 30, 30, 30, 20, 20]),
      A("Elena V.", "Architect", "P5", [70, 70, 60, 50, 40, 30]),
      A("Elena V.", "Architect", "P4", [30, 30, 30, 20, 10, 10]),
      A("Elena V.", "Architect", "P8", [10, 20, 30, 40, 40, 40]),
      A("Raj S.", "Analyst", "P8", [40, 50, 60, 60, 50, 40]),
      A("Raj S.", "Analyst", "P6", [20, 20, 30, 40, 40, 40]),
      A("Sofia M.", "QA Lead", "P1", [40, 50, 60, 60, 40, 20]),
      A("Sofia M.", "QA Lead", "P7", [30, 10, 0, 0, 0, 0]),
      A("Sofia M.", "QA Lead", "P3", [10, 20, 30, 40, 50, 50]),
      A("Daniel O.", "Change Lead", "P6", [30, 40, 50, 60, 60, 60]),
      A("Daniel O.", "Change Lead", "P1", [20, 20, 20, 20, 20, 20]),
    ];

    return {
      meta: { currency: "$" },
      seq: { p: 8, r: 13, c: 5 },
      projects, items, changes, allocations,
    };
  }
  root.SampleData = { make };
})(window);
