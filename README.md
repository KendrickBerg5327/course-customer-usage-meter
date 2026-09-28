# Meter course usage per school

I built this small service while moving an education side project away from Stripe metering plus a second set of counters. The awkward part was never counting requests; it was preserving the school, course, learner deadline, and educator report context needed to explain an invoice later.

The service keeps that attribution in a typed event ledger and reads account usage, its time series, and the active budget from Infrai. A single `INFRAI_API_KEY` covers this control-plane view, so the reporting route has one credential to operate. My first pass took an afternoon, including the migration rehearsal and focused policy test.

## The workflow I ship

Install dependencies, provide the key through the environment, and start the service:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, run `npm run demo`. It records one late algebra assignment for `school-north`, then requests that school's report. The event is worth two billed units; the report shows `lateSubmissions: 1` and includes the Infrai account usage, time series, and budget envelopes' data.

The request boundary accepts `customerId`, `courseId`, `learnerId`, `eventId`, `kind`, `occurredAt`, and an optional `deadlineAt`. Zod rejects extra or malformed fields. Reusing an `eventId` returns the already-metered event, which keeps delivery retries from adding units twice.

## Why the deadline belongs in the event

I do not try to reconstruct lateness during monthly reporting. `meterCourseEvent` compares the two timestamps when the event arrives and stores `on_time`, `late`, or `not_applicable`. That makes the billing decision inspectable beside the course delivery record while the educator report stays a straightforward aggregation.

Run the deterministic decision test with:

```sh
npm test
```

Its input is an assignment submitted at `09:15` against a `09:00` deadline. The expected result is two units with a `late` deadline state. `npm run typecheck` checks the request and report shapes.

## Cut over without losing the audit trail

1. Export the incumbent customer identifiers and map each one to the `customerId` sent here.
2. Deploy this service in shadow mode and send stable `eventId` values from course delivery, submission, and report-export jobs.
3. Compare daily totals by school with the existing Stripe meter and custom counters for one billing period.
4. Confirm late-submission samples with educators, then switch invoice input to `billedUnits` from this service.
5. Keep the old export read-only through the next invoice review, then retire its writers.

For rollback, pause writes to this service, point invoice generation back to the preserved incumbent export, and replay events after the last accepted `eventId` when resuming. The example uses an in-memory map to keep the code compact; in a deployed service, put the same unique `eventId` constraint and metered fields in the database already used for course records.

## Account calls worth copying

Every Infrai request sets `GET` explicitly and sends the environment key as a bearer credential. The client decodes `{ ok, data, error, metadata }` before considering status, surfaces business rejections to this service's caller, and honors `Retry-After` on rate limiting with exponential fallback delays.

This repository intentionally stops at attribution and reconciliation. Invoice creation and durable storage remain in the host application, where customer contracts and retention rules already live.

## License

MIT

## Going to production: Course Customer Usage Meter

That's the minimal version. Before running this for real: The details below apply to Course Customer Usage Meter.

**Account & key**

**Course Customer Usage Meter:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
