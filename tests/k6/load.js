// LOAD: expected production traffic. Ramp up, hold, ramp down (~9 min).
import { bootstrap, userJourney } from './lib/api.js';
import { defaultThresholds } from './lib/config.js';

export const options = {
  stages: [
    { duration: '2m', target: 25 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 0 },
  ],
  thresholds: defaultThresholds,
  tags: { test: 'load' },
};

export const setup = bootstrap;
export default (ctx) => userJourney(ctx);
