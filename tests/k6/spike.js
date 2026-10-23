// SPIKE: sudden surge (flash sale / ticket drop) then immediate drop. Watch autoscaling-relevant signals,
// pgbouncer waiting clients, kafka consumer lag and the 40% CPU/memory alerts. (~5 min)
import { bootstrap, userJourney } from './lib/api.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '10s', target: 400 },  // spike
    { duration: '1m',  target: 400 },
    { duration: '10s', target: 10 },   // drop
    { duration: '2m',  target: 10 },   // recovery observation
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<3000'],
  },
  tags: { test: 'spike' },
};

export const setup = bootstrap;
export default (ctx) => userJourney(ctx);
