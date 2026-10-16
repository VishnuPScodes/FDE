export interface MockHttpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export interface MockHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockHttpExchange {
  request: MockHttpRequest;
  response: MockHttpResponse;
  createdAt: number;
}

export type HttpScenario = 'basics' | 'pagination' | 'rate-limit' | 'flaky';

export function scenarioForHttpLevel(levelId: string): HttpScenario {
  if (levelId.endsWith('002')) return 'pagination';
  if (levelId.endsWith('003')) return 'rate-limit';
  if (levelId.endsWith('004')) return 'flaky';
  return 'basics';
}

export async function mockHttpRequest(
  scenario: HttpScenario,
  request: MockHttpRequest,
  history: MockHttpExchange[],
): Promise<MockHttpExchange> {
  const url = new URL(request.path, 'https://api.fde.test');
  const method = request.method.toUpperCase();
  const path = url.pathname;
  let response: MockHttpResponse;

  if (scenario === 'pagination' && method === 'GET' && path === '/api/items') {
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const perPage = Math.min(5, Math.max(1, Number(url.searchParams.get('per_page') ?? 2)));
    const items = [
      { id: 101, name: 'Northwind Cafe' }, { id: 102, name: 'Maple Workshop' },
      { id: 103, name: 'Cedar Clinic' }, { id: 104, name: 'Harbor Books' },
      { id: 105, name: 'Juniper Market' }, { id: 106, name: 'Summit Bikes' },
    ];
    const data = items.slice((page - 1) * perPage, page * perPage);
    response = page > Math.ceil(items.length / perPage)
      ? jsonResponse(404, { error: 'Page not found', page })
      : jsonResponse(200, { data, page, per_page: perPage, total: items.length, total_pages: Math.ceil(items.length / perPage), next_page: page * perPage < items.length ? page + 1 : null });
  } else if (scenario === 'rate-limit' && method === 'GET' && path === '/api/rate-limited') {
    const requests = history.filter((item) => new URL(item.request.path, 'https://api.fde.test').pathname === path);
    const lastRequest = requests.at(-1);
    const waiting = lastRequest ? Date.now() - lastRequest.createdAt < 1000 : false;
    response = requests.length === 0 || waiting
      ? { status: 429, statusText: 'Too Many Requests', headers: { 'content-type': 'application/json', 'retry-after': '1' }, body: { error: 'Rate limit exceeded', retry_after_seconds: 1 } }
      : jsonResponse(200, { data: ['request accepted'], attempts: requests.length + 1 });
  } else if (scenario === 'flaky' && method === 'GET' && path === '/api/flaky') {
    const count = history.filter((item) => new URL(item.request.path, 'https://api.fde.test').pathname === path).length;
    response = count === 0
      ? jsonResponse(500, { error: 'Temporary upstream failure', request_id: 'req_demo_500' })
      : jsonResponse(200, { data: { service: 'inventory', status: 'available' }, request_id: 'req_demo_200' });
  } else if (method === 'GET' && path === '/api/health') {
    response = jsonResponse(200, { status: 'ok', service: 'fde-demo-api' });
  } else if (method === 'GET' && path.startsWith('/api/items/')) {
    const id = Number(path.split('/').at(-1));
    const item = [{ id: 101, name: 'Northwind Cafe' }, { id: 102, name: 'Maple Workshop' }, { id: 103, name: 'Cedar Clinic' }, { id: 104, name: 'Harbor Books' }, { id: 105, name: 'Juniper Market' }, { id: 106, name: 'Summit Bikes' }].find((entry) => entry.id === id);
    response = item ? jsonResponse(200, item) : jsonResponse(404, { error: 'Item not found' });
  } else {
    response = jsonResponse(404, { error: `No mock route for ${method} ${path}` });
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
  return { request, response, createdAt: Date.now() };
}

function jsonResponse(status: number, body: unknown): MockHttpResponse {
  const labels: Record<number, string> = { 200: 'OK', 404: 'Not Found', 429: 'Too Many Requests', 500: 'Internal Server Error' };
  return { status, statusText: labels[status] ?? 'Response', headers: { 'content-type': 'application/json' }, body };
}
