import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiError, createAiClient, deltaFromEvent, getAiClient, parseRetryAfter, parseSseEvents } from '../ai/client';
import { estimateCost, estimateRequestTokens, estimateTokens, formatInr, formatUsd } from '../ai/estimate';
import { clearAiSettings, loadAiSettings, saveAiSettings, type AiSettings } from '../ai/settings-store';

const groq: AiSettings = { providerId: 'groq', baseUrl: 'https://api.groq.com/openai/v1/', model: 'llama-3.1-8b-instant', apiKey: 'gsk_test' };
const claude: AiSettings = { providerId: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5', apiKey: 'sk-ant-test' };

async function failure(promise: Promise<unknown>): Promise<AiError> {
  try { await promise; } catch (caught) { return caught as AiError; }
  throw new Error('expected the call to fail');
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(async () => {
  await clearAiSettings();
});

describe('OpenAI-compatible client', () => {
  it('posts a chat completions request with the key as a bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'Namaste' } }] }));
    const client = createAiClient(groq, { fetchImpl });
    const text = await client.complete({ system: 'Be brief.', messages: [{ role: 'user', content: 'Hi' }], temperature: 0.2, json: true });
    expect(text).toBe('Namaste');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer gsk_test');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.messages).toEqual([{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }]);
    expect(body.temperature).toBe(0.2);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('explains a bad key (401)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Invalid API Key' } }, 401));
    const error = await failure(createAiClient(groq, { fetchImpl }).complete({ messages: [{ role: 'user', content: 'Hi' }] }));
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe('auth');
    expect(error.message).toMatch(/rejected your API key \(401\)/);
    expect(error.message).toContain('Invalid API Key');
  });

  it('shows the provider message when the error body is a JSON array (Gemini)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ error: { code: 404, message: 'models/foo is not found', status: 'NOT_FOUND' } }], 404));
    const error = await failure(createAiClient(groq, { fetchImpl }).complete({ messages: [{ role: 'user', content: 'Hi' }] }));
    expect(error.kind).toBe('http');
    expect(error.message).toContain('Provider said: models/foo is not found');
  });

  it('shows the raw body when a JSON error has no message field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ detail: 'Not Found' }, 404));
    const error = await failure(createAiClient(groq, { fetchImpl }).complete({ messages: [{ role: 'user', content: 'Hi' }] }));
    expect(error.message).toContain('Provider said: {"detail":"Not Found"}');
  });

  it('trims spaces around the model name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await createAiClient({ ...groq, model: ' llama-3.1-8b-instant \n' }, { fetchImpl }).complete({ messages: [{ role: 'user', content: 'Hi' }] });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((JSON.parse(init.body as string) as { model: string }).model).toBe('llama-3.1-8b-instant');
  });

  it('retries a 429 once after Retry-After, then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'slow down' } }, 429, { 'retry-after': '3' }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(createAiClient(groq, { fetchImpl, sleep }).complete({ messages: [{ role: 'user', content: 'Hi' }] })).resolves.toBe('ok');
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('reports a rate limit with the wait time when retries run out', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 429, { 'retry-after': '120' }));
    const sleep = vi.fn();
    const error = await failure(createAiClient(groq, { fetchImpl, sleep }).complete({ messages: [{ role: 'user', content: 'Hi' }] }));
    expect(error.kind).toBe('rate_limit');
    expect(error.retryAfterSeconds).toBe(120);
    expect(error.message).toMatch(/Wait about 120 seconds/);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('turns a fetch TypeError (CORS / offline) into a readable network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await failure(createAiClient(groq, { fetchImpl }).complete({ messages: [{ role: 'user', content: 'Hi' }] }));
    expect(error.kind).toBe('network');
    expect(error.message).toMatch(/CORS/);
  });

  it('does not need a key for local Ollama and mentions OLLAMA_ORIGINS on failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createAiClient({ providerId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', apiKey: '' }, { fetchImpl });
    const error = await failure(client.complete({ messages: [{ role: 'user', content: 'Hi' }] }));
    expect(error.message).toMatch(/OLLAMA_ORIGINS/);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('streams deltas from SSE chunks split mid-line', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"GST "}}]}\n\nda',
      'ta: {"choices":[{"delta":{"content":"is 18%"}}]}\n\n',
      'data: [DONE]\n\n',
    ]));
    const deltas: string[] = [];
    const text = await createAiClient(groq, { fetchImpl }).stream({ messages: [{ role: 'user', content: 'GST?' }] }, (delta) => deltas.push(delta));
    expect(text).toBe('GST is 18%');
    expect(deltas).toEqual(['GST ', 'is 18%']);
  });
});

describe('Anthropic client', () => {
  it('sends the Messages API headers and reads text blocks', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'Priya' }] }));
    const text = await createAiClient(claude, { fetchImpl }).complete({ system: 'Be kind.', messages: [{ role: 'user', content: 'Hi' }], temperature: 0.5 });
    expect(text).toBe('Hello Priya');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.system).toBe('Be kind.');
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBe(1024);
  });

  it('streams content_block_delta events', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"₹499"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]));
    await expect(createAiClient(claude, { fetchImpl }).stream({ messages: [{ role: 'user', content: 'Price?' }] }, () => undefined)).resolves.toBe('₹499');
  });

  it('asks for the key before calling when it is missing', async () => {
    const fetchImpl = vi.fn();
    const error = await failure(createAiClient({ ...claude, apiKey: '' }, { fetchImpl }).complete({ messages: [{ role: 'user', content: 'Hi' }] }));
    expect(error.kind).toBe('config');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('parses SSE events and keeps partial text', () => {
    const { events, rest } = parseSseEvents(': ping\n\nevent: a\ndata: 1\n\ndata: par');
    expect(events).toEqual([{ event: 'a', data: '1' }]);
    expect(rest).toBe('data: par');
    expect(deltaFromEvent('openai', { data: '[DONE]' })).toBe('');
  });

  it('parses Retry-After in seconds and as a date', () => {
    expect(parseRetryAfter('7')).toBe(7);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10);
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('estimates tokens at about four characters each and prices them', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abcdefghi')).toBe(3);
    expect(estimateRequestTokens({ system: 'abcd', messages: [{ role: 'user', content: 'abcdefgh' }] })).toBe(1 + 4 + 2 + 4);
    const cost = estimateCost(1_000_000, 200_000, { inputPerMTok: 0.1, outputPerMTok: 0.5 }, 88);
    expect(cost.usd).toBeCloseTo(0.2);
    expect(cost.inr).toBeCloseTo(17.6);
    expect(formatUsd(0)).toBe('$0');
    expect(formatInr(17.6)).toBe('₹17.60');
  });
});

describe('settings store and getAiClient', () => {
  it('returns null without settings and a client after a key is saved', async () => {
    await expect(getAiClient()).resolves.toBeNull();
    await saveAiSettings({ ...groq, apiKey: '  gsk_saved  ' });
    expect((await loadAiSettings())?.apiKey).toBe('gsk_saved');
    const client = await getAiClient();
    expect(client?.label).toContain('Groq');
    await clearAiSettings();
    await expect(getAiClient()).resolves.toBeNull();
  });
});
