import type { Check } from '@fde/content-schema';
import { estimateBill } from './aws/billing';
import { evaluate } from './aws/iam-policy';
import { isPublicSubnet } from './aws/services/ec2';
import type { AwsState, SgRule, Tags } from './aws/types';

export interface AwsCheckResult {
  kind: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
}

const tagText = (tags: Tags) => Object.entries(tags).map(([key, value]) => `${key}=${value}`).join(',');
const ruleText = (rule: SgRule) => `${rule.protocol}:${rule.fromPort}-${rule.toPort}:${rule.cidr ?? rule.sourceGroupId ?? ''}`;

/**
 * Readable text for a state path. Level checks use `contains`, `not_contains`, `equals`,
 * `exists`, `max` or `min` against this text.
 *
 * Paths: s3.buckets, s3.bucket:NAME, iam.users, iam.user:NAME, iam.can|USER|ACTION|RESOURCE,
 * ec2.vpcs, ec2.subnets, ec2.security-groups, ec2.instances, bill.total, history, __stdout__, __stderr__.
 */
export function readAwsPath(state: AwsState, path: string): string {
  if (path === 'history') return state.history.join('\n');
  if (path === '__stdout__') return state.stdout;
  if (path === '__stderr__') return state.lastError;
  if (path === 'bill.total') return String(estimateBill(state).total);
  if (path === 's3.buckets') {
    return Object.values(state.s3.buckets).map((bucket) => {
      const block = bucket.publicAccessBlock;
      const blockText = block ? `block_public_access=${block.BlockPublicAcls && block.IgnorePublicAcls && block.BlockPublicPolicy && block.RestrictPublicBuckets ? 'all' : 'partial'}` : 'block_public_access=none';
      return `${bucket.name} region=${bucket.region} versioning=${bucket.versioning} ${blockText} policy=${bucket.policy ? 'yes' : 'no'} objects=${Object.keys(bucket.objects).length} tags=${tagText(bucket.tags)}`;
    }).join('\n');
  }
  if (path.startsWith('s3.bucket:')) {
    const bucket = state.s3.buckets[path.slice('s3.bucket:'.length)];
    return bucket ? JSON.stringify({ ...bucket, objects: Object.keys(bucket.objects) }) : '';
  }
  if (path === 'iam.users') {
    return Object.values(state.iam.users).map((user) => `${user.name} attached=${user.attachedPolicies.map((arn) => arn.split('/').pop()).join(',')} inline=${Object.keys(user.inlinePolicies).join(',')} tags=${tagText(user.tags)}`).join('\n');
  }
  if (path.startsWith('iam.user:')) {
    const user = state.iam.users[path.slice('iam.user:'.length)];
    return user ? JSON.stringify(user) : '';
  }
  if (path.startsWith('iam.can|')) {
    const [, name = '', action = '', resource = '*'] = path.split('|');
    if (!state.iam.users[name]) return 'no such user';
    return evaluate(state, { kind: 'user', name }, action, resource).decision;
  }
  if (path === 'ec2.vpcs') return Object.values(state.ec2.vpcs).map((vpc) => `${vpc.vpcId} ${vpc.cidrBlock} tags=${tagText(vpc.tags)}`).join('\n');
  if (path === 'ec2.subnets') {
    return Object.values(state.ec2.subnets).map((subnet) => `${subnet.subnetId} vpc=${state.ec2.vpcs[subnet.vpcId]?.cidrBlock ?? subnet.vpcId} ${subnet.cidrBlock} az=${subnet.availabilityZone} ${isPublicSubnet(state, subnet) ? 'public' : 'private'} tags=${tagText(subnet.tags)}`).join('\n');
  }
  if (path === 'ec2.security-groups') {
    return Object.values(state.ec2.securityGroups).filter((group) => group.groupName !== 'default').map((group) => `${group.groupId} name=${group.groupName} ingress=[${group.ingress.map(ruleText).join(' ')}] tags=${tagText(group.tags)}`).join('\n');
  }
  if (path === 'ec2.instances') {
    return Object.values(state.ec2.instances).map((item) => `${item.instanceId} type=${item.instanceType} state=${item.state} subnet=${item.subnetId} sgs=${item.securityGroupIds.join(',')} tags=${tagText(item.tags)}`).join('\n');
  }
  return '';
}

export function gradeAwsLevel(checks: Check[], state: AwsState): AwsCheckResult[] {
  return checks.map((check) => {
    const kind = check.kind;
    const label = typeof check.label === 'string' ? check.label : kind.replaceAll('_', ' ');
    let actual = '';
    let expected = '';
    let passed = false;

    if (kind === 'sim_command_used') {
      expected = readString(check.command ?? check.expected);
      actual = state.history.join('\n');
      passed = state.history.some((line) => line.trim() === expected || line.trim().startsWith(expected + ' ') || line.includes('$(' + expected));
    } else if (kind === 'sim_state') {
      actual = readAwsPath(state, readString(check.path));
      if (check.max !== undefined || check.min !== undefined) {
        const value = Number(actual);
        expected = [check.min !== undefined ? '>= ' + readString(check.min) : '', check.max !== undefined ? '<= ' + readString(check.max) : ''].filter(Boolean).join(' and ');
        passed = actual !== '' && Number.isFinite(value) && (check.max === undefined || value <= Number(check.max)) && (check.min === undefined || value >= Number(check.min));
      } else if (check.not_contains !== undefined) {
        expected = 'no ' + readString(check.not_contains);
        passed = !actual.includes(readString(check.not_contains)) && (check.contains === undefined || actual.includes(readString(check.contains)));
        if (check.contains !== undefined) expected = readString(check.contains) + ' and ' + expected;
      } else if (check.exists === true || check.assert === 'exists') {
        expected = 'something to exist';
        passed = actual.length > 0;
      } else if (check.assert === 'equals' || check.equals !== undefined) {
        expected = readString(check.equals ?? check.expected);
        passed = actual === expected;
      } else {
        expected = readString(check.contains ?? check.expected);
        passed = actual.includes(expected);
      }
    } else {
      actual = 'Unsupported check: ' + kind;
      expected = 'sim_state or sim_command_used';
    }
    return { kind, label, passed, actual, expected };
  });
}

function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
