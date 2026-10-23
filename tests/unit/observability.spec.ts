import { EventEmitter } from 'events';
import { context, trace } from '@opentelemetry/api';
import {
  OtelLogger,
  httpObservabilityMiddleware,
  withSpan,
} from '@app/observability';

const TRACE_ID = 'a'.repeat(32);
const SPAN_ID = 'b'.repeat(16);

function captureStdout() {
  const lines: string[] = [];
  jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  return () => lines.map((l) => JSON.parse(l));
}

describe('OtelLogger', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes one JSON line containing trace_id / span_id of the active span', () => {
    jest.spyOn(trace, 'getSpanContext').mockReturnValue({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: 1,
    });
    const read = captureStdout();

    new OtelLogger('unit-svc').log('hello world', 'MyContext');

    const [line] = read();
    expect(line).toMatchObject({
      level: 'info',
      service: 'unit-svc',
      context: 'MyContext',
      message: 'hello world',
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
    });
  });

  it('extracts stack and context from Nest-style error() arguments', () => {
    const read = captureStdout();
    new OtelLogger('unit-svc').error('boom', 'Error: boom\n  at x', 'TicketsService');
    const [line] = read();
    expect(line).toMatchObject({ level: 'error', message: 'boom', context: 'TicketsService' });
    expect(line.stack).toContain('Error: boom');
  });

  it('flattens object messages into fields', () => {
    const read = captureStdout();
    new OtelLogger('unit-svc').warn({ message: 'http_request', status_code: 404, route: '/events/:id' });
    const [line] = read();
    expect(line).toMatchObject({ level: 'warn', message: 'http_request', status_code: 404, route: '/events/:id' });
  });
});

describe('withSpan', () => {
  it('returns the callback result', async () => {
    await expect(withSpan('t', {}, async () => 42)).resolves.toBe(42);
  });

  it('re-throws errors unchanged', async () => {
    const err = new Error('nope');
    await expect(withSpan('t', {}, async () => { throw err; })).rejects.toBe(err);
  });
});

describe('httpObservabilityMiddleware', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sets x-trace-id, calls next and logs the request on finish using the route template', () => {
    jest.spyOn(trace, 'getSpanContext').mockReturnValue({ traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 });
    jest.spyOn(context, 'active');
    const read = captureStdout();

    const res: any = Object.assign(new EventEmitter(), { statusCode: 201, setHeader: jest.fn() });
    const req: any = { method: 'POST', originalUrl: '/tickets/purchase?token=secret', baseUrl: '', route: { path: '/tickets/purchase' } };
    const next = jest.fn();

    httpObservabilityMiddleware()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('x-trace-id', TRACE_ID);

    res.emit('finish');

    const [line] = read();
    expect(line).toMatchObject({
      message: 'http_request',
      method: 'POST',
      route: '/tickets/purchase',
      path: '/tickets/purchase', // query string stripped
      status_code: 201,
      level: 'info',
      trace_id: TRACE_ID,
    });
  });

  it('logs 5xx as errors and unmatched routes as "unmatched"', () => {
    const read = captureStdout();
    const res: any = Object.assign(new EventEmitter(), { statusCode: 503, setHeader: jest.fn() });
    const req: any = { method: 'GET', originalUrl: '/nope', baseUrl: '' };
    httpObservabilityMiddleware()(req, res, jest.fn());
    res.emit('finish');
    const [line] = read();
    expect(line).toMatchObject({ level: 'error', route: 'unmatched', status_code: 503 });
  });
});
