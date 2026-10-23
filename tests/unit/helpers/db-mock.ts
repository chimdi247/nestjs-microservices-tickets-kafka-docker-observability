/**
 * Minimal fluent mock of the Drizzle query builder.
 * Every `db.select()/insert()/update()` call consumes the next queued result; any chain
 * (from/where/limit/innerJoin/values/set/returning/orderBy) is awaitable and resolves to it.
 */
type Kind = 'select' | 'insert' | 'update';

export function createDbMock(
  results: Partial<Record<Kind, unknown[][]>>,
) {
  const queues: Record<Kind, unknown[][]> = {
    select: [...(results.select ?? [])],
    insert: [...(results.insert ?? [])],
    update: [...(results.update ?? [])],
  };

  const chain = (kind: Kind) => {
    const result = queues[kind].shift();
    if (result === undefined) {
      throw new Error(`db mock: no queued result for ${kind}()`);
    }
    const c: Record<string, unknown> = {};
    for (const m of [
      'from',
      'where',
      'limit',
      'innerJoin',
      'orderBy',
      'values',
      'set',
      'returning',
    ]) {
      c[m] = jest.fn(() => c);
    }
    c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return c;
  };

  const db = {
    select: jest.fn(() => chain('select')),
    insert: jest.fn(() => chain('insert')),
    update: jest.fn(() => chain('update')),
  };
  return { db };
}
