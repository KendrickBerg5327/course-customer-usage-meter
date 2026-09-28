import assert from "node:assert/strict";
import test from "node:test";
import { meterCourseEvent } from "../src/metering-policy.js";

test("a late assignment contributes two units and is visible as late", () => {
  const result = meterCourseEvent({
    customerId: "school-north",
    courseId: "algebra-1",
    learnerId: "learner-42",
    eventId: "submission-001",
    kind: "assignment_submitted",
    occurredAt: "2026-09-27T09:15:00.000Z",
    deadlineAt: "2026-09-27T09:00:00.000Z"
  });

  assert.equal(result.units, 2);
  assert.equal(result.deadlineState, "late");
});
