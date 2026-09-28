import { z } from "zod";

export const usageEventSchema = z.object({
  customerId: z.string().min(1),
  courseId: z.string().min(1),
  learnerId: z.string().min(1),
  eventId: z.string().min(1),
  kind: z.enum(["lesson_delivered", "assignment_submitted", "educator_report_exported"]),
  occurredAt: z.string().datetime(),
  deadlineAt: z.string().datetime().optional()
}).strict();

export type UsageEvent = z.infer<typeof usageEventSchema>;

export type MeteredEvent = UsageEvent & {
  units: number;
  deadlineState: "on_time" | "late" | "not_applicable";
};

const unitsByKind: Record<UsageEvent["kind"], number> = {
  lesson_delivered: 1,
  assignment_submitted: 2,
  educator_report_exported: 5
};

export function meterCourseEvent(event: UsageEvent): MeteredEvent {
  const deadlineState = event.deadlineAt === undefined
    ? "not_applicable"
    : Date.parse(event.occurredAt) <= Date.parse(event.deadlineAt) ? "on_time" : "late";

  return { ...event, units: unitsByKind[event.kind], deadlineState };
}
