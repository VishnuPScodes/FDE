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

export type HttpScenario = 'basics' | 'pagination' | 'rate-limit' | 'flaky' | 'webhook' | 'idempotency';
export const MOCK_WEBHOOK_SECRET = 'whsec_fde_training_demo';

export function scenarioForHttpLevel(levelId: string): HttpScenario {
  if (levelId.includes('-wh-')) return 'webhook';
  if (levelId.endsWith('005')) return 'idempotency';
  if (levelId.endsWith('002')) return 'pagination';
  if (levelId.endsWith('003')) return 'rate-limit';
  if (levelId.endsWith('004')) return 'flaky';
  if (levelId.endsWith('005') || levelId.endsWith('006')) return 'webhook';
  return 'basics';
}

export async function signWebhookBody(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(MOCK_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `sha256=${Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
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
  } else if (scenario === 'webhook' && method === 'POST' && path === '/api/webhooks/orders') {
    const supplied = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'x-fde-signature')?.[1] ?? '';
    const validSignature = supplied === await signWebhookBody(request.body);
    let payload: { delivery_id?: string; event?: string } = {};
    try { payload = JSON.parse(request.body) as typeof payload; } catch { /* Return a helpful 400 below. */ }
    const duplicate = history.some((exchange) => {
      if (exchange.request.method !== 'POST' || new URL(exchange.request.path, 'https://api.fde.test').pathname !== path || exchange.response.status !== 202) return false;
      try { return (JSON.parse(exchange.request.body) as typeof payload).delivery_id === payload.delivery_id; } catch { return false; }
    });
    response = !request.body ? jsonResponse(400, { error: 'A JSON event body is required' })
      : !validSignature ? jsonResponse(401, { error: 'Invalid webhook signature' })
        : duplicate ? jsonResponse(409, { error: 'Duplicate delivery', delivery_id: payload.delivery_id })
          : jsonResponse(202, { received: true, event: payload.event, delivery_id: payload.delivery_id });
  } else if (scenario === 'idempotency' && method === 'POST' && path === '/api/payments') {
    const key = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'idempotency-key')?.[1] ?? '';
    if (!key.trim()) response = jsonResponse(400, { error: 'Idempotency-Key header is required' });
    else {
      const previous = history.find((exchange) => exchange.request.method === 'POST'
        && new URL(exchange.request.path, 'https://api.fde.test').pathname === path
        && Object.entries(exchange.request.headers).some(([name, value]) => name.toLowerCase() === 'idempotency-key' && value === key)
        && exchange.response.status === 201);
      if (previous) response = previous.response;
      else {
        let payload: { amount?: number; currency?: string } = {};
        try { payload = JSON.parse(request.body) as typeof payload; } catch { /* Return a 400 for malformed JSON. */ }
        response = typeof payload.amount === 'number' && payload.amount > 0
          ? jsonResponse(201, { payment_id: `pay-demo-${history.filter((item) => item.request.path === request.path && item.response.status === 201).length + 1}`, amount: payload.amount, currency: payload.currency ?? 'USD' })
          : jsonResponse(400, { error: 'A positive numeric amount is required' });
      }
    }
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
  const labels: Record<number, string> = { 200: 'OK', 201: 'Created', 202: 'Accepted', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 409: 'Conflict', 429: 'Too Many Requests', 500: 'Internal Server Error' };
  return { status, statusText: labels[status] ?? 'Response', headers: { 'content-type': 'application/json' }, body };
}
