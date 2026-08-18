const API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

export class ApiTokenMissingError extends Error {
  constructor() {
    super("CLOUDFLARE_API_TOKEN is not configured");
    this.name = "ApiTokenMissingError";
  }
}

type ApiEnvelope<T> = {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
};

export type Zone = { id: string; name: string; status: string };

export type EmailRoutingStatus = {
  enabled: boolean;
  name: string;
  status: string;
  created?: string;
};

export type EmailRoutingDnsRecord = {
  type: string;
  name: string;
  content: string;
  priority?: number;
  ttl?: number;
};

export type EmailRoutingRule = {
  tag: string;
  name: string;
  enabled: boolean;
  matchers: Array<{ type: string; field?: string; value?: string }>;
  actions: Array<{ type: string; value: string[] }>;
};

export class CloudflareApi {
  constructor(
    private readonly token: string | undefined,
    readonly accountId: string | undefined,
  ) {}

  get configured(): boolean {
    return Boolean(this.token);
  }

  async findZone(domain: string): Promise<Zone | null> {
    const zones = await this.request<Zone[]>(`/zones?name=${encodeURIComponent(domain)}`);
    return zones[0] ?? null;
  }

  async emailRoutingStatus(zoneId: string): Promise<EmailRoutingStatus> {
    return this.request<EmailRoutingStatus>(`/zones/${zoneId}/email/routing`);
  }

  async enableEmailRouting(zoneId: string): Promise<void> {
    await this.request(`/zones/${zoneId}/email/routing/enable`, { method: "POST" });
  }

  async requiredDnsRecords(zoneId: string): Promise<EmailRoutingDnsRecord[]> {
    return this.request<EmailRoutingDnsRecord[]>(`/zones/${zoneId}/email/routing/dns`);
  }

  async listRules(zoneId: string): Promise<EmailRoutingRule[]> {
    return this.request<EmailRoutingRule[]>(`/zones/${zoneId}/email/routing/rules`);
  }

  /** Points an address at the Worker that owns this deployment. */
  async routeAddressToWorker(
    zoneId: string,
    address: string,
    workerName: string,
  ): Promise<EmailRoutingRule> {
    return this.request<EmailRoutingRule>(`/zones/${zoneId}/email/routing/rules`, {
      method: "POST",
      body: JSON.stringify({
        name: `workers-mail: ${address}`,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: address }],
        actions: [{ type: "worker", value: [workerName] }],
      }),
    });
  }

  async setCatchAllToWorker(zoneId: string, workerName: string): Promise<void> {
    await this.request(`/zones/${zoneId}/email/routing/rules/catch_all`, {
      method: "PUT",
      body: JSON.stringify({
        name: "workers-mail catch-all",
        enabled: true,
        matchers: [{ type: "all" }],
        actions: [{ type: "worker", value: [workerName] }],
      }),
    });
  }

  async deleteRule(zoneId: string, tag: string): Promise<void> {
    await this.request(`/zones/${zoneId}/email/routing/rules/${tag}`, { method: "DELETE" });
  }

  async listDnsRecords(zoneId: string, type: string): Promise<Array<{ name: string; content: string; type: string }>> {
    return this.request(`/zones/${zoneId}/dns_records?type=${encodeURIComponent(type)}&per_page=100`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.token) throw new ApiTokenMissingError();

    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });

    const payload = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || !payload.success) {
      const detail = payload.errors?.map((error) => error.message).join("; ");
      throw new CloudflareApiError(detail || `Cloudflare API returned ${response.status}`, response.status);
    }
    return payload.result;
  }
}

export function cloudflareApi(env: CloudflareEnv): CloudflareApi {
  return new CloudflareApi(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID);
}
