// Shared helpers for tests that run against the LIVE docker compose stack.
export const URLS = {
  api: process.env.API_URL ?? 'http://localhost:3000',
  mailhog: process.env.MAILHOG_URL ?? 'http://localhost:8025',
  tempo: process.env.TEMPO_URL ?? 'http://localhost:3200',
  loki: process.env.LOKI_URL ?? 'http://localhost:3100',
  mimir: process.env.MIMIR_URL ?? 'http://localhost:9009',
  grafana: process.env.GRAFANA_URL ?? 'http://localhost:3030',
};
export const GRAFANA_AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.GRAFANA_ADMIN_USER ?? 'admin'}:${process.env.GRAFANA_ADMIN_PASSWORD ?? 'admin'}`,
  ).toString('base64');

export const ADMIN = { email: 'admin@example.com', password: 'password123' };

export const uniqueEmail = (prefix = 'it') =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

export interface ApiResult<T = any> {
  status: number;
  body: any;
  data: T;
  traceId: string | null;
}

export async function api<T = any>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${URLS.api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: res.status, body, data: body?.data, traceId: res.headers.get('x-trace-id') };
}

export async function registerAndLogin(prefix = 'it', role: 'USER' | 'ORGANIZER' = 'USER') {
  const email = uniqueEmail(prefix);
  const password = 'Passw0rd!123';
  const reg = await api('POST', '/auth/register', { body: { email, password, name: `User ${prefix}`, role } });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', { body: { email, password } });
  if (login.status !== 201) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  return { email, password, token: login.data.access_token as string, userId: login.data.user.id as string, registerTraceId: reg.traceId };
}

export async function createPublishedEvent(token: string, over: Record<string, unknown> = {}) {
  const created = await api('POST', '/events', {
    token,
    body: {
      title: `Integration event ${Date.now()}`,
      description: 'created by integration test',
      date: '2030-06-01T18:00:00.000Z',
      location: 'Test Hall',
      capacity: 50,
      price: 0, // free by default: paid events need Stripe (see the "paid events" test)
      ...over,
    },
  });
  if (created.status !== 201) throw new Error(`create event failed: ${created.status} ${JSON.stringify(created.body)}`);
  const published = await api('POST', `/events/${created.data.id}/publish`, { token });
  if (published.status !== 201) throw new Error(`publish failed: ${published.status}`);
  return created.data as { id: string; capacity: number; price: number };
}

/** Polls `fn` until it returns a truthy value (or throws on timeout). */
export async function eventually<T>(
  fn: () => Promise<T | undefined | null | false>,
  { timeoutMs = 60_000, intervalMs = 2_000, what = 'condition' } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timed out waiting for ${what}${last ? `: ${String(last)}` : ''}`);
}
