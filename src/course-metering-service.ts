import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { InfraiAccountClient, InfraiError } from "./infrai-account-client.js";
import { meterCourseEvent, usageEventSchema, type MeteredEvent } from "./metering-policy.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const infrai = new InfraiAccountClient(apiKey);
const eventsById = new Map<string, MeteredEvent>();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "POST" && url.pathname === "/usage-events") {
    const parsed = usageEventSchema.safeParse(await readJson(req));
    if (!parsed.success) return json(res, 400, { error: "invalid_usage_event", issues: parsed.error.issues });
    const existing = eventsById.get(parsed.data.eventId);
    if (existing) return json(res, 200, existing);
    const metered = meterCourseEvent(parsed.data);
    eventsById.set(metered.eventId, metered);
    return json(res, 201, metered);
  }

  if (req.method === "GET" && url.pathname.startsWith("/customers/") && url.pathname.endsWith("/report")) {
    const customerId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
    const customerEvents = [...eventsById.values()].filter((event) => event.customerId === customerId);
    const [accountUsage, accountTimeseries, budget] = await Promise.all([
      infrai.accountUsage(), infrai.accountUsageTimeseries(), infrai.accountBudget()
    ]);
    return json(res, 200, {
      customerId,
      billedUnits: customerEvents.reduce((sum, event) => sum + event.units, 0),
      deliveredLessons: customerEvents.filter((event) => event.kind === "lesson_delivered").length,
      lateSubmissions: customerEvents.filter((event) => event.deadlineState === "late").length,
      infraiAccount: { usage: accountUsage, timeseries: accountTimeseries, budget }
    });
  }

  json(res, 404, { error: "route_not_found" });
}

const port = Number(process.env.PORT ?? 3000);
createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (error instanceof SyntaxError) return json(res, 400, { error: "invalid_json" });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(res, status, { error: error.code, details: error.details });
    }
    json(res, 500, { error: "service_error" });
  });
}).listen(port, () => console.log(`Course usage meter listening on http://localhost:${port}`));
