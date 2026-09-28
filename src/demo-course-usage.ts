const baseUrl = process.env.SERVICE_URL ?? "http://localhost:3000";

const event = {
  customerId: "school-north",
  courseId: "algebra-1",
  learnerId: "learner-42",
  eventId: "submission-demo-001",
  kind: "assignment_submitted",
  occurredAt: "2026-09-27T09:15:00.000Z",
  deadlineAt: "2026-09-27T09:00:00.000Z"
};

const recorded = await fetch(`${baseUrl}/usage-events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event)
});
console.log("Recorded:", await recorded.json());

const report = await fetch(`${baseUrl}/customers/school-north/report`, { method: "GET" });
console.log("Report:", await report.json());
