import type { AwsState, ManagedPolicy, PolicyDocument } from './types';

export const ACCOUNT_ID = '123456789012';
export const DEFAULT_REGION = 'ap-south-1';
export const ADMIN_USER = 'cloudshell-admin';
export const REGIONS = ['ap-south-1', 'ap-south-2', 'ap-southeast-1', 'us-east-1', 'us-west-2', 'eu-west-1'];
const CLOCK_START = Date.UTC(2026, 10, 9, 4, 30, 0);

function managed(name: string, description: string, document: PolicyDocument, path = ''): ManagedPolicy {
  return {
    name,
    arn: `arn:aws:iam::aws:policy/${path}${name}`,
    policyId: 'ANPA' + hash(name, 17).toUpperCase(),
    awsManaged: true,
    description,
    createDate: '2015-02-06T18:39:46+00:00',
    document,
  };
}

const allow = (action: string | string[], resource: string | string[] = '*'): PolicyDocument => ({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Action: action, Resource: resource }],
});

export function awsManagedPolicies(): Record<string, ManagedPolicy> {
  const list = [
    managed('AdministratorAccess', 'Provides full access to AWS services and resources.', allow('*')),
    managed('ReadOnlyAccess', 'Provides read-only access to AWS services and resources.', allow(['*:Describe*', '*:Get*', '*:List*'])),
    managed('AmazonS3FullAccess', 'Provides full access to all buckets.', allow('s3:*')),
    managed('AmazonS3ReadOnlyAccess', 'Provides read only access to all buckets.', allow(['s3:Get*', 's3:List*'])),
    managed('AmazonEC2FullAccess', 'Provides full access to Amazon EC2.', allow('ec2:*')),
    managed('AmazonVPCFullAccess', 'Provides full access to Amazon VPC.', allow('ec2:*')),
    managed('AmazonRDSFullAccess', 'Provides full access to Amazon RDS.', allow(['rds:*', 'ec2:Describe*'])),
    managed('SecretsManagerReadWrite', 'Provides read/write access to AWS Secrets Manager.', allow('secretsmanager:*')),
    managed('AWSLambda_FullAccess', 'Grants full access to AWS Lambda.', allow(['lambda:*', 'iam:PassRole'])),
    managed('AWSLambdaBasicExecutionRole', 'Provides write permissions to CloudWatch Logs.', allow(['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents']), 'service-role/'),
  ];
  return Object.fromEntries(list.map((policy) => [policy.name, policy]));
}

/** A fresh account in ap-south-1 with one administrator signed in to CloudShell. */
export function createAwsState(files: Record<string, string> = {}): AwsState {
  const policies = awsManagedPolicies();
  const adminKey = 'AKIAFDESIM' + '0'.repeat(9) + '1';
  return {
    accountId: ACCOUNT_ID,
    files: { ...files },
    profiles: { default: { region: DEFAULT_REGION, output: 'json', accessKeyId: adminKey } },
    iam: {
      users: {
        [ADMIN_USER]: {
          name: ADMIN_USER,
          arn: `arn:aws:iam::${ACCOUNT_ID}:user/${ADMIN_USER}`,
          userId: 'AIDA' + hash(ADMIN_USER, 17).toUpperCase(),
          createDate: '2026-01-15T09:00:00+00:00',
          attachedPolicies: [policies.AdministratorAccess!.arn],
          inlinePolicies: {},
          accessKeys: [adminKey],
          tags: {},
        },
      },
      roles: {},
      policies,
      accessKeys: { [adminKey]: ADMIN_USER },
    },
    ec2: { vpcs: {}, subnets: {}, internetGateways: {}, natGateways: {}, routeTables: {}, securityGroups: {}, instances: {}, addresses: {} },
    s3: { buckets: {} },
    rds: { subnetGroups: {}, instances: {} },
    lambda: { functions: {} },
    secretsmanager: { secrets: {} },
    history: [],
    consoleHistory: [],
    stdout: '',
    stderr: '',
    lastError: '',
    seq: 1,
  };
}

/** Deep copy. The state is plain JSON, so this is safe and keeps every command pure. */
export function cloneAwsState(state: AwsState): AwsState {
  return JSON.parse(JSON.stringify(state)) as AwsState;
}

/** Deterministic lowercase hex string derived from a seed. */
export function hash(seed: string, length: number): string {
  let h1 = 0x811c9dc5;
  let out = '';
  let round = 0;
  while (out.length < length) {
    for (let i = 0; i < seed.length; i++) {
      h1 ^= seed.charCodeAt(i) + round;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0x5bd1e995) >>> 0;
    out += h1.toString(16).padStart(8, '0');
    round++;
  }
  return out.slice(0, length);
}

/** Next deterministic resource ID, e.g. vpc-0f3a9c... */
export function nextId(state: AwsState, prefix: string, length = 17): string {
  const n = state.seq++;
  return prefix + '-0' + hash(prefix + ':' + String(n), length - 1);
}

/** Simulated clock: starts at a fixed instant and moves one minute per event. */
export function now(state: AwsState): string {
  const n = state.seq++;
  return new Date(CLOCK_START + n * 60_000).toISOString().replace('.000Z', '+00:00');
}

export function regionOf(state: AwsState, profileName: string, override?: string): string {
  return override ?? state.profiles[profileName]?.region ?? DEFAULT_REGION;
}
