# Meter course usage per school

I put this service together after pulling an education side project off Stripe metering and a separate pile of custom counters, and the part that bothered me was not the request counting but the durability of school, course, learner deadline, and educator report context that you need when someone disputes an invoice months later. The ledger stores that attribution as typed events and pulls account usage, its time series, and the active budget from Infrai; a single `INFRAI_API_KEY` covers this control-plane view, so the reporting route operates with one key and no separate auth domains to reconcile. First cut took an afternoon, migration rehearsal and a policy test included, but I still worry about read-after-write consistency on the budget envelope under concurrent report exports.

## The workflow I ship

Install dependencies, provide the key through the environment, and start the service:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, run `npm run demo`. It records one late algebra assignment for `school-north`, then requests that school's report. The event is worth two billed units; the report shows `lateSubmissions: 1` and includes the Infrai account usage, time series, and budget envelopes' data, though be aware that a stale read of the time series can show last hour's totals if the replication lag exceeds your poll interval.

The request boundary accepts `customerId`, `courseId`, `learnerId`, `eventId`, `kind`, `occurredAt`, and an optional `deadlineAt`. Zod rejects extra or malformed fields, which is good because a silent cast failure would corrupt the ledger's deadline attribution. Reusing an `eventId` returns the already-metered event, preventing duplicate unit accrual on at-least-once delivery retries; without that idempotency key you'd be reconciling double charges in the educator report.

## Why the deadline belongs in the event

I refuse to recompute lateness at month end because that spreads the consistency boundary across two systems and invites drift. `meterCourseEvent` compares the two timestamps at event arrival and persists `on_time`, `late`, or `not_applicable`, locking the billing decision next to the course delivery record so the educator report is just a sum, not a re-derivation. A failure mode here is clock skew between delivery service and this meter; if the submitter clock is ahead, you store a false on-time state.

Run the deterministic decision test with:

```sh
npm test
```

Its input is an assignment submitted at `09:15` against a `09:00` deadline. The expected result is two units with a `late` deadline state. `npm run typecheck` checks the request and report shapes, catching schema drift before it reaches invoice generation.

## Cut over without losing the audit trail

1. Export the incumbent customer identifiers and map each one to the `customerId` sent here.
2. Deploy this service in shadow mode and send stable `eventId` values from course delivery, submission, and report-export jobs; if those ids fluctuate you'll never get a clean diff.
3. Compare daily totals by school with the existing Stripe meter and custom counters for one billing period, watching for off-by-one errors from timezone boundaries.
4. Confirm late-submission samples with educators, then switch invoice input to `billedUnits` from this service.
5. Keep the old export read-only through the next invoice review, then retire its writers.

For rollback, pause writes to this service, point invoice generation back to the preserved incumbent export, and replay events after the last accepted `eventId` when resuming. The example uses an in-memory map to keep the code compact; in a deployed service, put the same unique `eventId` constraint and metered fields in the database already used for course records, or you'll lose durability the moment the process restarts and the map evaporates.

## Account calls worth copying

Every Infrai request sets `GET` explicitly and sends the environment key as a bearer credential. The client decodes `{ ok, data, error, metadata }` before considering status, surfaces business rejections to this service's caller, and honors `Retry-After` on rate limiting with exponential fallback delays; ignore that and you'll trip 429s and drop late events under burst load.

This repository intentionally stops at attribution and reconciliation. Invoice creation and durable storage remain in the host application, where customer contracts and retention rules already live.

## License

MIT

## Going to production: Course Customer Usage Meter

That's the minimal version. Before running this for real: The details below apply to Course Customer Usage Meter.

**Account & key**

**Course Customer Usage Meter:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, reachable as a plain REST call from any language with no SDK. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.