/**
 * Minimal in-memory stand-in for the supabase-js query builder, covering the
 * calls used by the real-world routes: select/eq/gte/order/limit/maybeSingle,
 * insert, upsert, update and rpc.
 */
type Row = Record<string, unknown>;
interface Filter { col: string; op: 'eq' | 'gte'; value: unknown }

export interface FakeDb {
  tables: Record<string, Row[]>;
  /** Columns that must be unique per table (simulates unique indexes). */
  unique: Record<string, string[]>;
  rpcs: Record<string, (args: Record<string, unknown>) => unknown>;
}

export function createFakeDb(initial: Partial<FakeDb> = {}): FakeDb {
  return { tables: initial.tables ?? {}, unique: initial.unique ?? {}, rpcs: initial.rpcs ?? {} };
}

class Query implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null; count?: number | null }> {
  private op: 'select' | 'insert' | 'upsert' | 'update' = 'select';
  private filters: Filter[] = [];
  private payload: Row[] = [];
  private onConflict: string[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private head = false;
  private wantCount = false;
  private single = false;

  constructor(private db: FakeDb, private table: string) {}

  private rows(): Row[] {
    return (this.db.tables[this.table] ??= []);
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.head = true;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(col: string, value: unknown) { this.filters.push({ col, op: 'eq', value }); return this; }
  gte(col: string, value: unknown) { this.filters.push({ col, op: 'gte', value }); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  private offset = 0;
  range(from: number, to: number) { this.offset = from; this.max = to - from + 1; return this; }
  insert(row: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(row) ? row : [row]; return this; }
  upsert(row: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = Array.isArray(row) ? row : [row];
    this.onConflict = (opts?.onConflict ?? 'id').split(',');
    return this;
  }
  update(values: Row) { this.op = 'update'; this.payload = [values]; return this; }
  maybeSingle() { this.single = true; return this; }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const v = row[f.col];
      if (f.op === 'eq') return v === f.value;
      return String(v) >= String(f.value);
    });
  }

  private execute() {
    const rows = this.rows();
    if (this.op === 'insert') {
      for (const row of this.payload) {
        for (const col of this.db.unique[this.table] ?? []) {
          if (row[col] !== undefined && row[col] !== null && rows.some((r) => r[col] === row[col])) {
            return { data: null, error: { message: 'duplicate key', code: '23505' } };
          }
        }
        rows.push({ created_at: new Date().toISOString(), ...row });
      }
      return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      for (const row of this.payload) {
        const existing = rows.find((r) => this.onConflict.every((col) => r[col] === row[col]));
        if (existing) Object.assign(existing, row);
        else rows.push({ ...row });
      }
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      rows.filter((r) => this.matches(r)).forEach((r) => Object.assign(r, this.payload[0]));
      return { data: null, error: null };
    }
    let result = rows.filter((r) => this.matches(r));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      result = [...result].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.max !== null) result = result.slice(this.offset, this.offset + this.max);
    else if (this.offset) result = result.slice(this.offset);
    const count = this.wantCount ? result.length : null;
    if (this.head) return { data: null, error: null, count };
    if (this.single) return { data: result[0] ?? null, error: null, count };
    return { data: result, error: null, count };
  }

  then<A = unknown, B = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string; code?: string } | null; count?: number | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function fakeClient(db: FakeDb) {
  return {
    from: (table: string) => new Query(db, table),
    rpc: (name: string, args: Record<string, unknown>) => {
      const handler = db.rpcs[name];
      if (!handler) return Promise.resolve({ data: null, error: { message: `no rpc ${name}` } });
      return Promise.resolve({ data: handler(args), error: null });
    },
  };
}

// ─── JWT helper ───────────────────────────────────────────────────────────────

export const TEST_JWT_SECRET = 'test-jwt-secret-for-realworld-routes';

function b64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let bin = '';
  for (const b of data) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function makeJwt(sub: string, secret = TEST_JWT_SECRET): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub, email: `${sub}@learners.test`, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}

export const TEST_ENV = {
  ENVIRONMENT: 'test',
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fake',
  SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
  CHECKER_KEY_SECRET: 'a-very-long-test-secret-for-checker-keys-0123456789',
};

/** Rows of a fake table (empty when the table was never written). */
export function rowsOf(db: FakeDb, table: string): Record<string, unknown>[] {
  const rows: unknown = db.tables[table];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}
