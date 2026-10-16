export interface SqlColumn { name: string; dataType: string; nullable: boolean }
export interface SqlTable { name: string; columns: SqlColumn[] }
export interface SqlQueryResult { columns: string[]; rows: Record<string, unknown>[]; rowCount: number }

type WorkerReply =
  | { id: number; type: 'ready' }
  | { id: number; type: 'schema'; tables: SqlTable[] }
  | { id: number; type: 'result'; result: SqlQueryResult }
  | { id: number; type: 'error'; message: string };
type WorkerRequest =
  | { id: number; type: 'init'; setupSql: string }
  | { id: number; type: 'query'; sql: string }
  | { id: number; type: 'inspect' };
type WorkerCommand =
  | { type: 'init'; setupSql: string }
  | { type: 'query'; sql: string }
  | { type: 'inspect' };

export interface SqlRuntime {
  initialize(setupSql: string): Promise<void>;
  run(sql: string): Promise<SqlQueryResult>;
  inspect(): Promise<SqlTable[]>;
  terminate(): void;
}

export function createSqlRuntime(onStatus: (status: string) => void): SqlRuntime {
  const worker = new Worker(new URL('../workers/sql.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 0;
  const pending = new Map<number, { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }>();
  worker.addEventListener('message', (event: MessageEvent<WorkerReply | { type: 'status'; status: string }>) => {
    const message = event.data;
    if (message.type === 'status') { onStatus(message.status); return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.type === 'error') request.reject(new Error(message.message));
    else request.resolve(message);
  });
  worker.addEventListener('error', (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message || 'SQL worker failed.'));
    pending.clear();
  });

  function request(message: WorkerCommand): Promise<WorkerReply> {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id } satisfies WorkerRequest);
    });
  }

  return {
    async initialize(setupSql) {
      const reply = await request({ type: 'init', setupSql });
      if (reply.type !== 'ready') throw new Error('SQL database did not initialize.');
    },
    async run(sql) {
      const reply = await request({ type: 'query', sql });
      if (reply.type !== 'result') throw new Error('SQL query did not return a result.');
      return reply.result;
    },
    async inspect() {
      const reply = await request({ type: 'inspect' });
      if (reply.type !== 'schema') throw new Error('Could not inspect the SQL schema.');
      return reply.tables;
    },
    terminate() {
      worker.terminate();
      for (const request of pending.values()) request.reject(new Error('SQL worker was stopped.'));
      pending.clear();
    },
  };
}
