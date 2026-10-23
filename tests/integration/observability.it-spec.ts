/**
 * Verifies the observability pipeline itself, end to end:
 *   one HTTP request  ->  ONE trace spanning api-gateway -> auth-service -> kafka -> notifications-service,
 *   the same trace id in Loki logs, metrics in Mimir, and Grafana provisioning (datasources, dashboards, alerts).
 */
import { GRAFANA_AUTH, URLS, api, eventually, registerAndLogin, uniqueEmail } from './helpers';

const servicesInTrace = (trace: any): Set<string> => {
  const found = new Set<string>();
  for (const batch of trace.batches ?? trace.resourceSpans ?? []) {
    for (const attr of batch.resource?.attributes ?? []) {
      if (attr.key === 'service.name') found.add(attr.value?.stringValue);
    }
  }
  return found;
};
const spanNames = (trace: any): string[] =>
  (trace.batches ?? trace.resourceSpans ?? []).flatMap((b: any) =>
    (b.scopeSpans ?? b.instrumentationLibrarySpans ?? []).flatMap((s: any) => (s.spans ?? []).map((sp: any) => sp.name)),
  );

describe('distributed tracing + context propagation', () => {
  let traceId: string;
  let email: string;

  beforeAll(async () => {
    email = uniqueEmail('trace');
    const res = await api('POST', '/auth/register', { body: { email, password: 'Passw0rd!123', name: 'Trace Test' } });
    expect(res.status).toBe(201);
    expect(res.traceId).toMatch(/^[0-9a-f]{32}$/); // x-trace-id header set by libs/observability
    traceId = res.traceId!;
  });

  it('one trace contains spans from gateway (HTTP), auth-service (HTTP+DB+Kafka produce) and notifications-service (Kafka consume)', async () => {
    const trace = await eventually(async () => {
      const r = await fetch(`${URLS.tempo}/api/traces/${traceId}`, { headers: { accept: 'application/json' } });
      if (r.status !== 200) return undefined;
      const t = await r.json();
      const svc = servicesInTrace(t);
      return svc.has('api-gateway') && svc.has('auth-service') && svc.has('notifications-service') ? t : undefined;
    }, { what: `trace ${traceId} to include all 3 services`, timeoutMs: 90_000 });

    const names = spanNames(trace).join(' | ');
    expect(names).toContain('auth.register');   // manual business span
    expect(names).toMatch(/user\.registered/);  // kafkajs producer + consumer spans (propagated via message headers)
    expect(names).toContain('email.send');      // manual span in notifications-service
  });

  it('structured logs for the same trace are searchable in Loki (log -> trace correlation)', async () => {
    const lines = await eventually(async () => {
      const q = encodeURIComponent(`{service_name="auth-service"} |= "${traceId}"`);
      const r = await fetch(`${URLS.loki}/loki/api/v1/query_range?query=${q}&limit=10&since=1h`);
      const j = await r.json();
      const values = (j.data?.result ?? []).flatMap((s: any) => s.values);
      return values.length ? values : undefined;
    }, { what: 'auth-service logs carrying the trace id' });
    const parsed = JSON.parse(lines[0][1]);
    expect(parsed).toMatchObject({ service: 'auth-service', trace_id: traceId });
  });
});

describe('metrics in Mimir', () => {
  const query = async (promql: string) => {
    const r = await fetch(`${URLS.mimir}/prometheus/api/v1/query?query=${encodeURIComponent(promql)}`);
    return (await r.json()).data?.result ?? [];
  };

  it('has HTTP RED metrics for the gateway', async () => {
    await registerAndLogin('metrics');
    const result = await eventually(async () => {
      const r = await query('sum(app_http_requests_total{job="api-gateway"})');
      return r.length ? r : undefined;
    }, { what: 'app_http_requests_total' });
    expect(Number(result[0].value[1])).toBeGreaterThan(0);
  });

  it('has business KPI metrics', async () => {
    const r = await eventually(async () => {
      const x = await query('sum(eventflow_users_registered_total)');
      return x.length ? x : undefined;
    }, { what: 'eventflow_users_registered_total' });
    expect(Number(r[0].value[1])).toBeGreaterThan(0);
  });

  it.each([
    ['cAdvisor (containers)', 'count(container_memory_working_set_bytes{name=~"eventflowapp-.*"})'],
    ['node_exporter', 'count(node_cpu_seconds_total)'],
    ['postgres_exporter', 'pgx_connections_used{job="postgres"}'],
    ['pgbouncer_exporter', 'pgbouncer_pools_client_active_connections'],
    ['redis_exporter', 'redis_connected_clients'],
    ['kafka_exporter', 'kafka_brokers'],
    ['kafka JMX', 'kafka_server_replicamanager_partitioncount'],
    ['blackbox uptime probes', 'probe_success{job="blackbox-http"}'],
  ])('is receiving data from %s', async (_name, promql) => {
    const r = await eventually(async () => {
      const x = await query(promql);
      return x.length ? x : undefined;
    }, { what: promql, timeoutMs: 90_000 });
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('Grafana provisioning', () => {
  const g = (path: string) => fetch(`${URLS.grafana}${path}`, { headers: { authorization: GRAFANA_AUTH } });

  it('is healthy', async () => {
    expect((await fetch(`${URLS.grafana}/api/health`)).status).toBe(200);
  });

  it('has Mimir, Loki and Tempo datasources', async () => {
    const ds = (await (await g('/api/datasources')).json()).map((d: any) => d.uid);
    expect(ds).toEqual(expect.arrayContaining(['mimir', 'loki', 'tempo']));
  });

  it('provisions the EventFlow dashboards', async () => {
    const found = await (await g('/api/search?type=dash-db&tag=eventflow')).json();
    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  it('provisions the CPU/memory > 40% alert rules and the e-mail contact point', async () => {
    const rules = await (await g('/api/v1/provisioning/alert-rules')).json();
    const titles = rules.map((r: any) => r.title);
    expect(titles).toEqual(expect.arrayContaining(['Container CPU > 40%', 'Container memory > 40%', 'Node CPU > 40%', 'Node memory > 40%']));
    const cps = await (await g('/api/v1/provisioning/contact-points')).json();
    expect(cps.some((c: any) => c.type === 'email')).toBe(true);
  });
});
