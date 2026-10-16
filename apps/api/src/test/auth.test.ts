import { describe, it, expect } from 'vitest';
import { authMiddleware } from '../middleware/auth';

describe('JWT auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    // Create a minimal mock Hono context
    const mockReq = {
      header: (name: string) => {
        if (name === 'Authorization') return undefined;
        return '';
      },
    };

    let responseStatus = 0;
    let responseBody: unknown = null;

    const mockC = {
      req: mockReq,
      env: { SUPABASE_JWT_SECRET: 'test-secret' },
      json: (body: unknown, status?: number) => {
        responseBody = body;
        responseStatus = status ?? 200;
        return new Response(JSON.stringify(body), { status: responseStatus });
      },
      set: () => {},
      get: () => '',
    };

    const result = await authMiddleware(
      mockC as unknown as Parameters<typeof authMiddleware>[0],
      async () => {},
    );

    expect(result).toBeDefined();
    expect(responseStatus).toBe(401);
    expect((responseBody as { error: string }).error).toContain('Missing');
  });

  it('rejects requests with invalid JWT', async () => {
    const mockReq = {
      header: (name: string) => {
        if (name === 'Authorization') return 'Bearer invalid.jwt.token';
        return '';
      },
    };

    let responseStatus = 0;

    const mockC = {
      req: mockReq,
      env: { SUPABASE_JWT_SECRET: 'test-secret' },
      json: (body: unknown, status?: number) => {
        responseStatus = status ?? 200;
        return new Response(JSON.stringify(body), { status: responseStatus });
      },
      set: () => {},
      get: () => '',
    };

    await authMiddleware(
      mockC as unknown as Parameters<typeof authMiddleware>[0],
      async () => {},
    );

    expect(responseStatus).toBe(401);
  });
});
