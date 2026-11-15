import { AwsError, UsageError, parseShorthand, type ArgType, type ParsedArgs } from './cli-core';
import { evaluate, principalArn } from './iam-policy';
import type { AwsState, JsonValue, PolicyDocument, Principal, Tags } from './types';

export type OpOutput = { json: JsonValue } | { text: string } | null;

/** Everything an operation needs: mutable state, the caller, the region, and parsed arguments. */
export class OpContext {
  constructor(
    public readonly state: AwsState,
    public readonly region: string,
    public readonly principal: Principal,
    public readonly args: ParsedArgs,
  ) {}

  get callerArn(): string {
    return principalArn(this.state, this.principal);
  }

  str(name: string): string | undefined {
    const value = this.args.values[name];
    return typeof value === 'string' ? this.readParam(value) : undefined;
  }

  req(name: string): string {
    const value = this.str(name);
    if (value === undefined) throw new UsageError(`aws: error: the following arguments are required: --${name}`);
    return value;
  }

  list(name: string): string[] {
    const value = this.args.values[name];
    if (Array.isArray(value)) return value.map((item) => this.readParam(item));
    return typeof value === 'string' ? [this.readParam(value)] : [];
  }

  bool(name: string): boolean | undefined {
    const value = this.args.values[name];
    return typeof value === 'boolean' ? value : undefined;
  }

  int(name: string): number | undefined {
    const value = this.args.values[name];
    return typeof value === 'string' ? Number(value) : undefined;
  }

  /** Shorthand or JSON structure argument. */
  struct(name: string): Record<string, JsonValue> | undefined {
    const value = this.str(name);
    if (value === undefined) return undefined;
    let parsed: JsonValue;
    try {
      parsed = parseShorthand(value);
    } catch (error) {
      if (error instanceof UsageError) throw error;
      throw new UsageError(`Error parsing parameter '--${name}': Invalid JSON: ${(error as Error).message}\nJSON received: ${value}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new UsageError(`Error parsing parameter '--${name}': Expected a structure.`);
    return parsed;
  }

  /** Resolve file:// and fileb:// references against the CloudShell home directory. */
  readParam(value: string): string {
    const match = /^fileb?:\/\/(.+)$/.exec(value);
    if (!match) return value;
    const path = match[1]!.replace(/^\.\//, '').replace(/^~\//, '').replace(/^\/home\/cloudshell-user\//, '');
    const content = this.state.files[path];
    if (content === undefined) throw new UsageError(`Error parsing parameter: Unable to load paramfile ${value}: [Errno 2] No such file or directory: '${path}'`);
    return content;
  }

  /** Check IAM and throw the service's own AccessDenied error when the call is not allowed. */
  authorize(action: string, resource: string, resourcePolicy?: PolicyDocument | null): void {
    const result = evaluate(this.state, this.principal, action, resource, resourcePolicy);
    if (result.decision === 'allowed') return;
    const service = action.split(':')[0];
    const code = service === 'ec2' ? 'UnauthorizedOperation' : service === 'lambda' || service === 'secretsmanager' ? 'AccessDeniedException' : 'AccessDenied';
    const reason = result.decision === 'explicitDeny'
      ? `with an explicit deny in ${result.matched.includes('resource-policy') ? 'a resource-based policy' : 'an identity-based policy'}`
      : `because no identity-based policy allows the ${action} action`;
    const prefix = service === 'ec2' ? 'You are not authorized to perform this operation. ' : '';
    throw new AwsError(code, `${prefix}User: ${this.callerArn} is not authorized to perform: ${action} on resource: ${resource} ${reason}`);
  }

  arn(service: string, resource: string, region = this.region): string {
    return `arn:aws:${service}:${region}:${this.state.accountId}:${resource}`;
  }
}

export interface OpSpec {
  /** API operation name used in error messages, e.g. CreateBucket. */
  op: string;
  summary: string;
  args?: Record<string, ArgType>;
  required?: string[];
  run: (ctx: OpContext) => OpOutput;
}

export type ServiceSpec = Record<string, OpSpec>;

export const json = (value: JsonValue): OpOutput => ({ json: value });
export const text = (value: string): OpOutput => ({ text: value });

/** Parse `--tags Key=a,Value=b ...` or `--tag-specifications ResourceType=x,Tags=[{Key=a,Value=b}]`. */
export function readTags(ctx: OpContext): Tags {
  const tags: Tags = {};
  for (const raw of ctx.list('tags')) {
    const parsed = parseShorthand(raw);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.Key === 'string') tags[entry.Key] = typeof entry.Value === 'string' ? entry.Value : '';
    }
  }
  for (const raw of ctx.list('tag-specifications')) {
    const parsed = parseShorthand(raw);
    const specs = Array.isArray(parsed) ? parsed : [parsed];
    for (const spec of specs) {
      if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !Array.isArray(spec.Tags)) continue;
      for (const entry of spec.Tags) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.Key === 'string') tags[entry.Key] = typeof entry.Value === 'string' ? entry.Value : '';
      }
    }
  }
  return tags;
}

export function tagList(tags: Tags): JsonValue {
  return Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
}

/** Convert a typed model object to a plain JSON value for output. */
export function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
