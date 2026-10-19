// Thin Submify REST client: logs in with the configured account, keeps the
// access token fresh, and retries once on 401.

export class SubmifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class SubmifyClient {
  private access = "";
  private refresh = "";

  constructor(
    private base: string,
    private email: string,
    private password: string,
  ) {
    this.base = base.replace(/\/+$/, "");
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(this.base + path, { ...init, signal: AbortSignal.timeout(30_000) });
  }

  private async login(): Promise<void> {
    const res = await this.raw("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) throw new SubmifyError(res.status, `Submify login failed (${res.status}) — check SUBMIFY_EMAIL / SUBMIFY_PASSWORD`);
    const j = (await res.json()) as { access_token: string; refresh_token: string };
    this.access = j.access_token;
    this.refresh = j.refresh_token;
  }

  private async refreshToken(): Promise<void> {
    if (this.refresh) {
      const res = await this.raw("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refresh }),
      });
      if (res.ok) {
        const j = (await res.json()) as { access_token: string; refresh_token: string };
        this.access = j.access_token;
        this.refresh = j.refresh_token;
        return;
      }
    }
    await this.login();
  }

  /** Authenticated call; returns the raw Response (caller decides how to read it). */
  async authed(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.access) await this.login();
    const send = () =>
      this.raw("/api/v1" + path, {
        ...init,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers as Record<string, string> | undefined),
          authorization: `Bearer ${this.access}`,
        },
      });
    let res = await send();
    if (res.status === 401) {
      await this.refreshToken();
      res = await send();
    }
    return res;
  }

  async json<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.authed(path, init);
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? text;
      } catch {
        /* keep raw text */
      }
      throw new SubmifyError(res.status, `Submify API ${res.status}: ${msg}`);
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  /** Public form submission (no login; uses a project's public key). */
  async submit(apiKey: string, body: unknown): Promise<unknown> {
    const res = await this.raw("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new SubmifyError(res.status, `Submify submit ${res.status}: ${text}`);
    return JSON.parse(text);
  }

  async publicJson<T = unknown>(path: string): Promise<T> {
    const res = await this.raw("/api/v1" + path);
    const text = await res.text();
    if (!res.ok) throw new SubmifyError(res.status, `Submify API ${res.status}: ${text}`);
    return JSON.parse(text) as T;
  }
}
