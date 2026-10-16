import { PGlite } from '@electric-sql/pglite';
import pgliteWasmUrl from '../../node_modules/@electric-sql/pglite/dist/pglite.wasm?url';
import initdbWasmUrl from '../../node_modules/@electric-sql/pglite/dist/initdb.wasm?url';
import fsBundleUrl from '../../node_modules/@electric-sql/pglite/dist/pglite.data?url';
import type { SqlColumn, SqlQueryResult, SqlTable } from '../lib/sql-runtime';

type SqlRequest =
  | { id: number; type: 'init'; setupSql: string }
  | { id: number; type: 'query'; sql: string }
  | { id: number; type: 'inspect' };

let database: PGlite | undefined;
const workerScope = self as DedicatedWorkerGlobalScope;

function send(message: Record<string, unknown>): void {
  workerScope.postMessage(message);
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item)) as T;
}

async function inspectSchema(db: PGlite): Promise<SqlTable[]> {
  const tableRows = await db.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const tables: SqlTable[] = [];
  for (const tableRow of tableRows.rows) {
    const columnRows = await db.query<{ column_name: string; data_type: string; is_nullable: string }>(
      'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      ['public', tableRow.table_name],
    );
    const columns: SqlColumn[] = columnRows.rows.map((column) => ({
      name: column.column_name,
      dataType: column.data_type,
      nullable: column.is_nullable === 'YES',
    }));
    tables.push({ name: tableRow.table_name, columns });
  }
  return tables;
}

async function loadPGliteAssets(): Promise<{ pgliteWasmModule: WebAssembly.Module; initdbWasmModule: WebAssembly.Module; fsBundle: Blob }> {
  const [pgliteWasmModule, initdbWasmModule, fsBundleResponse] = await Promise.all([
    fetch(pgliteWasmUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load PostgreSQL WASM (${response.status}).`);
      return WebAssembly.compile(await response.arrayBuffer());
    }),
    fetch(initdbWasmUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load database setup WASM (${response.status}).`);
      return WebAssembly.compile(await response.arrayBuffer());
    }),
    fetch(fsBundleUrl),
  ]);
  if (!fsBundleResponse.ok) throw new Error(`Could not load the SQL dataset (${fsBundleResponse.status}).`);
  return { pgliteWasmModule, initdbWasmModule, fsBundle: await fsBundleResponse.blob() };
}

workerScope.addEventListener('message', async (event: MessageEvent<SqlRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'init') {
      send({ type: 'status', status: 'Starting PostgreSQL in your browser…' });
      const assets = await loadPGliteAssets();
      database = await PGlite.create(assets);
      if (request.setupSql.trim()) await database.exec(request.setupSql);
      send({ id: request.id, type: 'ready' });
      return;
    }
    if (!database) throw new Error('The SQL database is still starting.');
    if (request.type === 'inspect') {
      send({ id: request.id, type: 'schema', tables: await inspectSchema(database) });
      return;
    }
    const statements = await database.exec(request.sql);
    const result = [...statements].reverse().find((statement) => statement.rows !== undefined);
    const columns = result?.fields?.map((field) => field.name) ?? [];
    const rows = jsonSafe((result?.rows ?? []) as Record<string, unknown>[]);
    const rowCount = columns.length > 0 ? rows.length : (result?.affectedRows ?? 0);
    const queryResult: SqlQueryResult = { columns, rows, rowCount };
    send({ id: request.id, type: 'result', result: queryResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send({ id: request.id, type: 'error', message });
  }
});
