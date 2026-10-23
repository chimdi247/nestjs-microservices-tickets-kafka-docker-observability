// SOAK: moderate load for a long time to surface leaks (memory, connections, file handles, consumer lag).
// Default 30 min; e.g. `-e SOAK_DURATION=4h`.
import { bootstrap, userJourney } from './lib/api.js';
import { defaultThresholds } from './lib/config.js';

export const options = {
  stages: [
    { duration: '2m', target: 20 },
    { duration: __ENV.SOAK_DURATION || '30m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: defaultThresholds,
  tags: { test: 'soak' },
};

export const setup = bootstrap;
export default (ctx) => userJourney(ctx);
