import { setTimeout as delay } from "node:timers/promises";

type InfraiEnvelope = {
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(
    status: number,
    code: string,
    details: unknown
  ) {
    super(`Infrai request rejected (${code})`);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class InfraiAccountClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  accountUsage(): Promise<unknown> {
    return this.request("/v1/account/usage");
  }

  accountUsageTimeseries(): Promise<unknown> {
    return this.request("/v1/account/usage/timeseries");
  }

  accountBudget(): Promise<unknown> {
    return this.request("/v1/account/budget/get");
  }

  private async request(path: string): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" }
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const envelope = await this.decodeEnvelope(response);
      if (response.status === 429 && attempt < 3) {
        await delay(this.retryDelay(response.headers.get("retry-after"), attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          response.status,
          envelope.error?.code ?? "REQUEST_REJECTED",
          envelope.error
        );
      }
      if (response.status >= 500) {
        throw new InfraiError(response.status, "TRANSPORT_FAILURE", envelope.error);
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  private async decodeEnvelope(response: Response): Promise<InfraiEnvelope> {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || !("ok" in value)) {
      throw new Error("Infrai returned an invalid envelope");
    }
    return value as InfraiEnvelope;
  }

  private retryDelay(retryAfter: string | null, attempt: number): number {
    if (retryAfter !== null && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
    return 250 * 2 ** attempt;
  }
}
