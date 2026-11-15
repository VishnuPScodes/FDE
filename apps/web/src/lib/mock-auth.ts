import type { Session } from '@supabase/supabase-js';

/**
 * Local-development / E2E-only mocked sign-in (spec Part 10: "Playwright E2E
 * for sign-in (mocked)"). Never active in production builds because
 * `import.meta.env.DEV` is statically false there.
 */
export const MOCK_AUTH_ENABLED = import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === 'true';

export const MOCK_ACCESS_TOKEN = 'mock-access-token';

export function createMockSession(): Session {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'learner@example.test',
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Test Learner' },
    created_at: new Date(0).toISOString(),
  };
  return {
    access_token: MOCK_ACCESS_TOKEN,
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
}
