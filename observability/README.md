# Observability stack

```
 Nest services ──OTLP/HTTP──► OpenTelemetry Collector ──traces──► Tempo ──┐
 (traces, metrics, logs)            │      ▲                   (S3)        │
                                    │      │ scrape 15s                    │ metrics-generator
                                    │      └── cAdvisor, node, postgres(+replica), pgbouncer,
                                    │          redis, kafka-exporter, kafka JMX, blackbox
                                    ├──metrics─► Mimir (S3) ◄──────────────┘ (service graph, span metrics)
                                    └──logs────► Loki  (S3)
                                                   ▲
                                        Grafana (datasources + dashboards + alerts, all provisioned)
```

`docker compose up -d --build` starts everything. Grafana: <http://localhost:3030> (`admin` / `admin`).

| Folder | Purpose |
|---|---|
| `mimir/mimir.yaml`, `loki/loki.yaml`, `tempo/tempo.yaml` | Backends, **blocks / chunks / traces stored in S3** (MinIO container, volume `minio-data`) |
| `otel-collector/otel-collector.yaml` | Single ingestion point + scrape config for every exporter |
| `grafana/provisioning/datasources` | Mimir, Loki, Tempo with cross-links (below) |
| `grafana/provisioning/alerting` | Grafana-managed alert rules, SMTP e-mail contact point, notification policy |
| `grafana/dashboards` | 8 dashboards (provisioned into folder *EventFlow*) |
| `blackbox/`, `postgres-exporter/` | exporter configs |

All config files are bind-mounted read-only; nothing is baked into images.

## Correlation (what to click)
* **Log → trace**: Logs are JSON containing `trace_id`; click a line in *Logs & Traces* (or Explore → Loki) → **View trace** → Tempo opens every span across services.
* **Trace → logs / metrics**: in a Tempo span use *Logs for this span* / *Request rate…* links.
* **Metric → trace**: latency graphs show exemplar dots; click one to open the trace.
* **Service map**: Tempo metrics-generator → Mimir → *Logs & Traces* dashboard / Explore → Tempo → Service Graph.

## Instrumentation (`libs/observability`)
* `import '@app/observability/tracing'` is the **first line** of every `main.ts` (must run before `http`, `express`, `pg`, `kafkajs`… are loaded).
* Auto-instrumentation: http, express, nestjs-core, pg (drizzle), ioredis (rate limiter), **kafkajs** (injects/extracts `traceparent` in Kafka message headers ⇒ one trace spans gateway → service → Kafka → notifications-service). Redis has no context-propagation concept: its commands appear as child spans of the request that issued them.
* Manual spans/metrics on business logic: `tickets.purchase`, `tickets.cancel`, `tickets.check_in`, `events.*`, `auth.register/login`, `email.send`, Kafka handlers. KPI counters are in `business-metrics.ts` (`eventflow_*`).
* HTTP RED metrics (`app_http_requests_total`, `app_http_request_duration_seconds`) use the route **template** as a label, so cardinality stays bounded.
* `GET /health` on every service (used by docker healthchecks and the uptime probe).

## Alerts (Grafana-managed, e-mail via SMTP)
`Container CPU > 40%`, `Container memory > 40%` (of the container limit; limits are set in compose for the 5 app services), `Node CPU > 40%`, `Node memory > 40%`, plus `Service down` and `High HTTP 5xx ratio`.
SMTP defaults to MailHog (<http://localhost:8025>); for real SMTP set `SMTP_*` / `ALERT_EMAIL_TO` (see `.env.example`).
Quick test: `docker exec eventflowapp-api-gateway sh -c 'yes > /dev/null & sleep 150'` (or run the k6 load test) → mail appears in MailHog after ~3 min.

## Using real AWS S3
Set `S3_ENDPOINT` (e.g. `s3.eu-west-1.amazonaws.com`), `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_INSECURE=false`, bucket names; remove `minio`/`minio-init`. Config files stay unchanged.

## Things to know
* Postgres schema + admin user are created by `docker/postgres/init/*` **only on the first start of an empty volume** (`docker compose down -v` to re-run).
* Container CPU/memory panels use cAdvisor's `name` label. On Docker Desktop (Mac/Windows) cAdvisor sometimes cannot resolve container names; node/app/OTel data is unaffected.
* Dashboard panels for third-party exporters (pgbouncer, kafka JMX…) depend on the pinned exporter versions' metric names; if a panel shows *No data*, check the metric name in Explore → Mimir.
