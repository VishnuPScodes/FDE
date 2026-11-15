import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../index';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';
import { SsrfError, readJsonPath, safeFetch } from '../lib/ssrf';
import { LEVEL_ID_RE, consumeRateLimit, realworldEnv, recordRun, type RealworldCheckResult } from '../lib/realworld';

export const checksRouter = new Hono<AppEnv>();

/** Per-user limit shared by live-url and github checks. */
export const CHECKS_PER_HOUR = 20;

const LiveUrlSchema = z.object({
  url: z.string().min(8).max(2048),
  level_id: z.string().regex(LEVEL_ID_RE).optional(),
  method: z.enum(['GET', 'HEAD']).default('GET'),
  expected_status: z.number().int().min(100).max(599).default(200),
  contains: z.string().min(1).max(500).optional(),
  json_path: z.string().min(1).max(200).optional(),
  json_equals: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]).optional(),
});

const GithubSchema = z.object({
  repo: z.string().min(3).max(200),
  level_id: z.string().regex(LEVEL_ID_RE).optional(),
  file: z.string().min(1).max(300).regex(/^[A-Za-z0-9._\-/]+$/).refine((p) => !p.split('/').includes('..'), 'no ..').optional(),
  workflow_success: z.boolean().optional(),
  /** Workflow file name, e.g. "ci.yml". When omitted, the latest completed run of any workflow is used. */
  workflow: z.string().regex(/^[A-Za-z0-9._-]{1,100}\.ya?ml$/).optional(),
  branch: z.string().regex(/^[A-Za-z0-9._\-/]{1,100}$/).optional(),
});

async function limitChecks(c: Parameters<typeof authMiddleware>[0]) {
  const result = await consumeRateLimit(getSupabaseAdmin(c), c.get('userId'), 'checks', CHECKS_PER_HOUR, 3600).catch((err: unknown) => {
    console.error(err);
    return null;
  });
  if (!result) return c.json({ error: 'Could not run checks right now. Try again in a minute.' }, 500);
  if (!result.allowed) {
    c.header('Retry-After', String(result.retryAfterSec));
    return c.json({ error: `You can run ${String(CHECKS_PER_HOUR)} checks per hour. Take a break and try again later.` }, 429);
  }
  return null;
}

function preview(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

checksRouter.post('/live-url', authMiddleware, async (c) => {
  const parsed = LiveUrlSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid live URL check request.', details: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const limited = await limitChecks(c);
  if (limited) return limited;

  let response;
  try {
    response = await safeFetch(input.url, { method: input.method });
  } catch (err) {
    if (err instanceof SsrfError) return c.json({ passed: false, error: err.message, checks: [] }, 422);
    console.error('live-url check failed:', err);
    return c.json({ passed: false, error: 'Could not reach the site.', checks: [] }, 422);
  }

  const checks: RealworldCheckResult[] = [
    {
      name: `Responds with HTTP ${String(input.expected_status)}`,
      passed: response.status === input.expected_status,
      expected: String(input.expected_status),
      actual: String(response.status),
    },
  ];
  if (input.contains !== undefined) {
    checks.push({
      name: `Response contains "${input.contains}"`,
      passed: response.body.includes(input.contains),
      expected: input.contains,
      actual: preview(response.body) || '(empty body)',
    });
  }
  if (input.json_path !== undefined) {
    let value: unknown;
    let parsedOk = true;
    try {
      value = readJsonPath(JSON.parse(response.body), input.json_path);
    } catch {
      parsedOk = false;
    }
    const exists = parsedOk && value !== undefined;
    const matches = input.json_equals === undefined ? exists : exists && JSON.stringify(value) === JSON.stringify(input.json_equals);
    checks.push({
      name: input.json_equals === undefined ? `JSON has ${input.json_path}` : `JSON ${input.json_path} equals ${JSON.stringify(input.json_equals)}`,
      passed: matches,
      expected: input.json_equals === undefined ? 'path exists' : JSON.stringify(input.json_equals),
      actual: !parsedOk ? 'response is not JSON' : value === undefined ? 'path not found' : preview(JSON.stringify(value)),
    });
  }

  const passed = checks.every((check) => check.passed);
  if (input.level_id) {
    await recordRun(getSupabaseAdmin(c), {
      user_id: c.get('userId'),
      level_id: input.level_id,
      source: 'live_url',
      passed,
      result: { url: response.finalUrl, status: response.status, redirects: response.redirects, checks },
    });
  }
  return c.json({ passed, final_url: response.finalUrl, status: response.status, redirects: response.redirects, truncated: response.truncated, checks });
});

/** Accept "owner/repo" or "https://github.com/owner/repo(.git)". */
export function normalizeRepo(raw: string): { owner: string; name: string } | null {
  const trimmed = raw.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(trimmed);
  const [, owner, name] = match ?? [];
  if (!owner || !name || name === '.' || name === '..') return null;
  return { owner, name };
}

class GithubRateLimited extends Error {
  constructor(public resetAt: number | null) {
    super('GitHub rate limit');
  }
}

async function githubGet(path: string, token: string | undefined): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'fde-platform-checker',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(5000) });
  if ((response.status === 403 || response.status === 429) && (response.headers.get('x-ratelimit-remaining') === '0' || response.status === 429)) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    throw new GithubRateLimited(Number.isFinite(reset) && reset > 0 ? reset : null);
  }
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body };
}

checksRouter.post('/github', authMiddleware, async (c) => {
  const parsed = GithubSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid GitHub check request.', details: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const repo = normalizeRepo(input.repo);
  if (!repo) return c.json({ passed: false, error: 'Enter the repository as owner/name, for example priya-dev/clinic-api.', checks: [] }, 422);
  const limited = await limitChecks(c);
  if (limited) return limited;

  const token = realworldEnv(c).GITHUB_TOKEN;
  const base = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  const checks: RealworldCheckResult[] = [];
  try {
    const repoRes = await githubGet(base, token);
    const repoBody = repoRes.body as { private?: boolean; default_branch?: string; full_name?: string } | null;
    const exists = repoRes.status === 200 && repoBody?.private === false;
    checks.push({
      name: `Public repository ${repo.owner}/${repo.name} exists`,
      passed: exists,
      expected: 'public repository',
      actual: repoRes.status === 404 ? 'not found (is it public?)' : repoRes.status === 200 ? (repoBody?.private ? 'private' : 'public') : `HTTP ${String(repoRes.status)}`,
    });

    if (exists && input.file) {
      const path = input.file.split('/').map(encodeURIComponent).join('/');
      const ref = input.branch ? `?ref=${encodeURIComponent(input.branch)}` : '';
      const fileRes = await githubGet(`${base}/contents/${path}${ref}`, token);
      checks.push({
        name: `File ${input.file} exists`,
        passed: fileRes.status === 200,
        expected: input.file,
        actual: fileRes.status === 200 ? 'found' : 'not found',
      });
    }

    if (exists && input.workflow_success) {
      const params = new URLSearchParams({ per_page: '1', status: 'completed' });
      if (input.branch) params.set('branch', input.branch);
      const runsPath = input.workflow ? `${base}/actions/workflows/${encodeURIComponent(input.workflow)}/runs` : `${base}/actions/runs`;
      const runsRes = await githubGet(`${runsPath}?${params.toString()}`, token);
      const run = (runsRes.body as { workflow_runs?: { conclusion: string | null; name?: string; html_url?: string }[] } | null)?.workflow_runs?.[0];
      checks.push({
        name: input.workflow ? `Latest ${input.workflow} run succeeded` : 'Latest GitHub Actions run succeeded',
        passed: run?.conclusion === 'success',
        expected: 'success',
        actual: runsRes.status === 404 ? 'workflow not found' : run ? `${run.conclusion ?? 'unknown'}${run.name ? ` (${run.name})` : ''}` : 'no completed runs yet',
      });
    }
  } catch (err) {
    if (err instanceof GithubRateLimited) {
      const wait = err.resetAt ? Math.max(60, err.resetAt - Math.floor(Date.now() / 1000)) : 600;
      c.header('Retry-After', String(wait));
      return c.json({ passed: false, error: `GitHub's free API limit was reached. Try again in about ${String(Math.ceil(wait / 60))} minutes.`, checks }, 503);
    }
    console.error('github check failed:', err);
    return c.json({ passed: false, error: 'Could not reach GitHub right now.', checks }, 502);
  }

  const passed = checks.length > 0 && checks.every((check) => check.passed);
  if (input.level_id) {
    await recordRun(getSupabaseAdmin(c), {
      user_id: c.get('userId'),
      level_id: input.level_id,
      source: 'github',
      passed,
      result: { repo: `${repo.owner}/${repo.name}`, checks },
    });
  }
  return c.json({ passed, repo: `${repo.owner}/${repo.name}`, checks });
});
