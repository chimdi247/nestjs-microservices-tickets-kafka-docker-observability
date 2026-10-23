// STRESS: push beyond normal load in steps to see how the system degrades and recovers (~14 min).
import { bootstrap, userJourney } from './lib/api.js';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '3m', target: 200 },
    { duration: '3m', target: 300 },
    { duration: '3m', target: 0 },   // recovery
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
  tags: { test: 'stress' },
};

export const setup = bootstrap;
export default (ctx) => userJourney(ctx);
