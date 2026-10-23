// Shared k6 configuration. From inside the compose network the gateway is http://api-gateway:3000;
// from the host use BASE_URL=http://localhost:3000.
export const BASE_URL = __ENV.BASE_URL || 'http://api-gateway:3000';

// SLO-derived thresholds reused by every scenario (override per test where it makes sense)
export const defaultThresholds = {
  http_req_failed: ['rate<0.01'],            // < 1% failed requests
  http_req_duration: ['p(95)<800', 'p(99)<1500'],
  checks: ['rate>0.99'],
};
