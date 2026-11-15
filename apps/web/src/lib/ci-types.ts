/** Shared state types for the simulated GitHub Actions / CI-CD runtime. */

export type CiConclusion = 'success' | 'failure' | 'cancelled' | 'skipped';
export type CiJobStatus = 'queued' | 'waiting' | 'completed';
export type CiRunStatus = 'queued' | 'waiting' | 'completed';

export interface CiCommit { sha: string; parents: string[]; message: string; tree: Record<string, string> }

export interface CiStepRecord { name: string; conclusion: CiConclusion; log: string[]; seconds: number }

export interface CiJobRecord {
  id: number;
  key: string;
  name: string;
  status: CiJobStatus;
  conclusion: CiConclusion | null;
  steps: CiStepRecord[];
  seconds: number;
  environment: string | null;
  matrix: Record<string, string> | null;
  outputs: Record<string, string>;
  annotations: string[];
}

export interface CiRunRecord {
  id: number;
  number: number;
  workflowName: string;
  workflowFile: string;
  event: string;
  /** Branch name, tag name, or PR head branch. */
  branch: string;
  ref: string;
  sha: string;
  title: string;
  status: CiRunStatus;
  conclusion: CiConclusion | null;
  attempt: number;
  jobs: CiJobRecord[];
  inputs: Record<string, string>;
  prNumber: number | null;
  annotations: string[];
  approvedEnvironments: string[];
  leaks: string[];
}

export interface CiDeployment { environment: string; version: string; runId: number | null; status: 'success' | 'failed' | 'rollback' }

export interface CiEnvironment {
  name: string;
  url: string;
  reviewers: string[];
  secrets: Record<string, string>;
  current: string | null;
  health: 'healthy' | 'unhealthy' | 'unknown';
}

export interface CiPullRequest { number: number; title: string; body: string; head: string; base: string; state: 'open' | 'merged' | 'closed'; headSha: string }

export interface CiRelease { tag: string; title: string; sha: string }

export interface CiState {
  repo: string;
  actor: string;
  image: string;
  files: Record<string, string>;
  index: Record<string, string>;
  commits: Record<string, CiCommit>;
  branches: Record<string, string>;
  currentBranch: string;
  upstream: string[];
  remoteBranches: Record<string, string>;
  tags: Record<string, string>;
  remoteTags: Record<string, string>;
  pullRequests: CiPullRequest[];
  runs: CiRunRecord[];
  secrets: Record<string, string>;
  vars: Record<string, string>;
  environments: Record<string, CiEnvironment>;
  deployments: CiDeployment[];
  unhealthy: Record<string, string[]>;
  registry: string[];
  releases: CiRelease[];
  caches: Record<string, string>;
  branchProtection: Record<string, string[]>;
  history: string[];
  stdout: string;
  stderr: string;
  lastError: string;
  counter: number;
  nextRunId: number;
  nextJobId: number;
}

export interface CiResult { state: CiState; stdout: string; stderr: string; exitCode: number; notice?: string }
