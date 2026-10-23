# Tests

| Kind | Tool | Where | Run |
|---|---|---|---|
| Unit | Jest (+ mocks of Drizzle/Kafka) | `tests/unit` | `pnpm test:unit` (from project root) |
| Integration (live stack, incl. trace propagation, Loki, Mimir, Grafana provisioning, MailHog) | Jest + fetch | `tests/integration` | `cd tests && npm i && npm run test:integration` |
| UI / e2e | Playwright (chromium, firefox, mobile) | `tests/e2e/playwright` | `npm run test:e2e:install` once, then `npm run test:e2e` |
| UI | Selenium WebDriver | `tests/e2e/selenium` | `npm run test:selenium` |
| Smoke / Load / Stress / Spike / Soak / Breakpoint | k6 (in docker) | `tests/k6` | `npm run perf:smoke` … `perf:breakpoint` (or `bash scripts/run-k6.sh <name>`) |
| Kafka consumer-lag burst | kafkajs | `tests/performance/kafka-burst.js` | `npm run perf:kafka-burst -- 5000` |

Prerequisites
* `docker compose up -d --build` is healthy, and the client runs on :4000 (`cd client && pnpm dev`) for UI tests.
* The gateway rate-limits per IP (10 req/min, login 5, register 3). For integration / UI / perf runs relax it:
  `docker compose -f docker-compose.yaml -f tests/docker-compose.tests.yaml up -d api-gateway`
  (`run-k6.sh` does this automatically). Restore with `docker compose up -d api-gateway`.
* Perf runs stream to Mimir: watch **EventFlow - k6 Load Test**, *Service Overview*, *PostgreSQL & PgBouncer*, *Kafka* and *Containers* while they run; the 40% CPU/memory alerts should fire under `load`/`spike`.
