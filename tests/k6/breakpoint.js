// BREAKPOINT: ramp the ARRIVAL RATE until the system breaks; the test aborts when thresholds fail.
// The last passing request rate is your capacity. (open model: arrivals do not slow down when the system does)
import { bootstrap, userJourney } from './lib/api.js';

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
      stages: [{ duration: '10m', target: 500 }],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
    http_req_duration: [{ threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '30s' }],
  },
  tags: { test: 'breakpoint' },
};

export const setup = bootstrap;
export default (ctx) => userJourney(ctx);
