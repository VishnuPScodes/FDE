import type { AwsState, PolicyDocument, PolicyStatement, Principal } from './types';

export type Decision = 'allowed' | 'explicitDeny' | 'implicitDeny';

export interface EvaluationResult {
  decision: Decision;
  /** Policy names whose statements matched the request (deny statements when denied). */
  matched: string[];
}

export class PolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function globToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$', caseInsensitive ? 'i' : '');
}

/** IAM wildcard match. Actions compare case-insensitively, resources case-sensitively. */
export function wildcardMatch(pattern: string, value: string, caseInsensitive = false): boolean {
  return globToRegExp(pattern, caseInsensitive).test(value);
}

function statementMatches(statement: PolicyStatement, action: string, resource: string): boolean {
  const actionOk = statement.NotAction !== undefined
    ? !asList(statement.NotAction).some((pattern) => wildcardMatch(pattern, action, true))
    : asList(statement.Action).some((pattern) => wildcardMatch(pattern, action, true));
  if (!actionOk) return false;
  if (statement.NotResource !== undefined) return !asList(statement.NotResource).some((pattern) => wildcardMatch(pattern, resource));
  return asList(statement.Resource).some((pattern) => wildcardMatch(pattern, resource));
}

export function principalArn(state: AwsState, principal: Principal): string {
  if (principal.kind === 'user') return `arn:aws:iam::${state.accountId}:user/${principal.name}`;
  if (principal.kind === 'role') return `arn:aws:sts::${state.accountId}:assumed-role/${principal.name}/${principal.session}`;
  return principal.name;
}

function principalMatches(state: AwsState, statement: PolicyStatement, principal: Principal): boolean {
  const value = statement.Principal;
  if (value === undefined) return false;
  if (value === '*') return true;
  if (typeof value === 'string') return false;
  const candidates: string[] = [];
  for (const [kind, entries] of Object.entries(value)) {
    for (const entry of asList(entries)) candidates.push(kind + ':' + entry);
  }
  const roleArn = principal.kind === 'role' ? `arn:aws:iam::${state.accountId}:role/${principal.name}` : '';
  return candidates.some((candidate) => {
    const [kind, ...rest] = candidate.split(':');
    const entry = rest.join(':');
    if (kind === 'Service') return principal.kind === 'service' && principal.name === entry;
    if (kind !== 'AWS') return false;
    if (entry === '*') return true;
    if (entry === state.accountId || entry === `arn:aws:iam::${state.accountId}:root`) return principal.kind !== 'service';
    return entry === principalArn(state, principal) || entry === roleArn;
  });
}

/** All identity-based policies for a principal, as [label, document] pairs. */
export function identityPolicies(state: AwsState, principal: Principal): [string, PolicyDocument][] {
  const entity = principal.kind === 'user' ? state.iam.users[principal.name] : principal.kind === 'role' ? state.iam.roles[principal.name] : undefined;
  if (!entity) return [];
  const result: [string, PolicyDocument][] = [];
  for (const arn of entity.attachedPolicies) {
    const policy = Object.values(state.iam.policies).find((item) => item.arn === arn);
    if (policy) result.push([policy.name, policy.document]);
  }
  for (const [name, document] of Object.entries(entity.inlinePolicies)) result.push([name, document]);
  return result;
}

/**
 * Evaluate a request the way IAM does (without conditions or boundaries):
 * an explicit Deny anywhere wins, then any Allow, otherwise an implicit deny.
 */
export function evaluate(state: AwsState, principal: Principal, action: string, resource: string, resourcePolicy?: PolicyDocument | null): EvaluationResult {
  const denies: string[] = [];
  const allows: string[] = [];
  for (const [label, document] of identityPolicies(state, principal)) {
    for (const statement of document.Statement) {
      if (!statementMatches(statement, action, resource)) continue;
      (statement.Effect === 'Deny' ? denies : allows).push(label);
    }
  }
  if (resourcePolicy) {
    for (const statement of resourcePolicy.Statement) {
      if (!principalMatches(state, statement, principal) || !statementMatches(statement, action, resource)) continue;
      (statement.Effect === 'Deny' ? denies : allows).push('resource-policy');
    }
  }
  if (denies.length) return { decision: 'explicitDeny', matched: [...new Set(denies)] };
  if (allows.length) return { decision: 'allowed', matched: [...new Set(allows)] };
  return { decision: 'implicitDeny', matched: [] };
}

/** True when a resource policy grants an Allow to everyone. */
export function isPublicPolicy(document: PolicyDocument | null): boolean {
  if (!document) return false;
  return document.Statement.some((statement) => {
    if (statement.Effect !== 'Allow') return false;
    const value = statement.Principal;
    if (value === '*') return true;
    if (value && typeof value === 'object') return asList(value.AWS).includes('*');
    return false;
  });
}

/** Can this principal assume the role, judged by the role's trust policy? */
export function trustAllows(state: AwsState, document: PolicyDocument, principal: Principal): boolean {
  return document.Statement.some((statement) => statement.Effect === 'Allow'
    && asList(statement.Action).some((pattern) => wildcardMatch(pattern, 'sts:AssumeRole', true))
    && principalMatches(state, statement, principal));
}

/**
 * Parse and validate a policy document the way IAM does, with IAM's error wording.
 * `kind` decides whether a Principal is required (resource/trust) or forbidden (identity).
 */
export function parsePolicyDocument(text: string, kind: 'identity' | 'resource' | 'trust'): PolicyDocument {
  const code = kind === 'resource' ? 'MalformedPolicy' : 'MalformedPolicyDocument';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PolicyError(code, kind === 'resource' ? 'Policies must be valid JSON and the first byte must be \'{\'' : 'This policy contains invalid Json');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new PolicyError(code, 'Syntax errors in policy.');
  const record = raw as Record<string, unknown>;
  if (record.Version !== undefined && record.Version !== '2012-10-17' && record.Version !== '2008-10-17') {
    throw new PolicyError(code, 'The policy failed legacy parsing');
  }
  const rawStatements = Array.isArray(record.Statement) ? record.Statement : record.Statement ? [record.Statement] : [];
  if (!rawStatements.length) throw new PolicyError(code, 'Syntax errors in policy.');
  const statements: PolicyStatement[] = [];
  for (const item of rawStatements) {
    if (typeof item !== 'object' || item === null) throw new PolicyError(code, 'Syntax errors in policy.');
    const statement = item as Record<string, unknown>;
    if (statement.Effect !== 'Allow' && statement.Effect !== 'Deny') throw new PolicyError(code, 'Syntax errors in policy.');
    const actions = statement.Action ?? statement.NotAction;
    if (actions === undefined) throw new PolicyError(code, kind === 'resource' ? 'Missing required field Action' : 'Syntax errors in policy.');
    const actionList = typeof actions === 'string' ? [actions] : Array.isArray(actions) ? actions : null;
    if (!actionList || actionList.some((action) => typeof action !== 'string')) throw new PolicyError(code, 'Syntax errors in policy.');
    for (const action of actionList as string[]) {
      if (action !== '*' && !/^[a-z0-9*-]+:[A-Za-z0-9*?]+$/.test(action)) {
        throw new PolicyError(code, `Actions/Conditions must be prefaced by a vendor, e.g., iam, sdb, ec2, etc. (${action})`);
      }
    }
    if (kind !== 'trust' && statement.Resource === undefined && statement.NotResource === undefined) {
      throw new PolicyError(code, kind === 'resource' ? 'Missing required field Resource' : 'Syntax errors in policy.');
    }
    if (kind === 'identity' && statement.Principal !== undefined) throw new PolicyError(code, 'Policy document should not specify a principal.');
    if (kind !== 'identity' && statement.Principal === undefined) throw new PolicyError(code, kind === 'resource' ? 'Missing required field Principal' : 'Syntax errors in policy.');
    statements.push(statement as unknown as PolicyStatement);
  }
  return { Version: typeof record.Version === 'string' ? record.Version : '2012-10-17', Statement: statements };
}
