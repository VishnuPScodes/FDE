import { UNKNOWN, isUnknown } from './hcl';

/** Schema for one simulated resource type. */
export interface ResourceSchema {
  required: string[];
  /** Optional arguments and their defaults (undefined = no default). */
  optional: Record<string, unknown>;
  /** Nested block types, stored as lists of objects. */
  blocks: string[];
  /** Changing one of these destroys and recreates the resource. */
  forceNew: string[];
  /** Computed attributes. `rid` is the random id (null while planning). */
  computed: Record<string, (a: Record<string, unknown>, rid: string | null, region: string) => unknown>;
}

const ACCOUNT = '123456789012';
const known = (...values: unknown[]) => values.every((v) => !isUnknown(v));
const s = (v: unknown) => String(v);
const withId = (prefix: string) => (_a: Record<string, unknown>, rid: string | null) => (rid ? prefix + rid : UNKNOWN);

export const INSTANCE_TYPES = ['t2.micro', 't2.small', 't3.micro', 't3.small', 't3.medium', 'm5.large', 'c5.large'];
/** Bucket names other people already own (S3 names are global). */
export const TAKEN_BUCKETS = ['my-bucket', 'test', 'logs', 'data', 'terraform', 'mybucket', 'backup'];

export const SCHEMAS: Record<string, ResourceSchema> = {
  aws_s3_bucket: {
    required: ['bucket'], optional: { force_destroy: false, tags: {} }, blocks: [], forceNew: ['bucket'],
    computed: {
      id: (a) => (known(a.bucket) ? a.bucket : UNKNOWN),
      arn: (a) => (known(a.bucket) ? 'arn:aws:s3:::' + s(a.bucket) : UNKNOWN),
      bucket_domain_name: (a) => (known(a.bucket) ? s(a.bucket) + '.s3.amazonaws.com' : UNKNOWN),
      region: (_a, _r, region) => region,
    },
  },
  aws_s3_bucket_versioning: {
    required: ['bucket'], optional: {}, blocks: ['versioning_configuration'], forceNew: ['bucket'],
    computed: { id: (a) => (known(a.bucket) ? a.bucket : UNKNOWN) },
  },
  aws_s3_bucket_public_access_block: {
    required: ['bucket'],
    optional: { block_public_acls: false, block_public_policy: false, ignore_public_acls: false, restrict_public_buckets: false },
    blocks: [], forceNew: ['bucket'],
    computed: { id: (a) => (known(a.bucket) ? a.bucket : UNKNOWN) },
  },
  aws_vpc: {
    required: ['cidr_block'], optional: { tags: {}, enable_dns_hostnames: false }, blocks: [], forceNew: ['cidr_block'],
    computed: { id: withId('vpc-0'), arn: (_a, r, region) => (r ? 'arn:aws:ec2:' + region + ':' + ACCOUNT + ':vpc/vpc-0' + r : UNKNOWN) },
  },
  aws_subnet: {
    required: ['vpc_id', 'cidr_block'], optional: { availability_zone: 'ap-south-1a', tags: {} }, blocks: [], forceNew: ['vpc_id', 'cidr_block', 'availability_zone'],
    computed: { id: withId('subnet-0') },
  },
  aws_security_group: {
    required: ['name'], optional: { description: 'Managed by Terraform', vpc_id: null, tags: {} }, blocks: ['ingress', 'egress'], forceNew: ['name', 'description', 'vpc_id'],
    computed: { id: withId('sg-0'), arn: (_a, r, region) => (r ? 'arn:aws:ec2:' + region + ':' + ACCOUNT + ':security-group/sg-0' + r : UNKNOWN) },
  },
  aws_instance: {
    required: ['ami', 'instance_type'], optional: { subnet_id: null, key_name: null, user_data: null, vpc_security_group_ids: [], tags: {} }, blocks: [], forceNew: ['ami', 'subnet_id', 'key_name'],
    computed: {
      id: withId('i-0'),
      arn: (_a, r, region) => (r ? 'arn:aws:ec2:' + region + ':' + ACCOUNT + ':instance/i-0' + r : UNKNOWN),
      private_ip: (_a, r) => (r ? `10.0.1.${parseInt(r.slice(0, 2), 16) % 200 + 10}` : UNKNOWN),
    },
  },
  aws_iam_role: {
    required: ['name', 'assume_role_policy'], optional: { description: null, tags: {}, max_session_duration: 3600 }, blocks: [], forceNew: ['name'],
    computed: {
      id: (a) => (known(a.name) ? a.name : UNKNOWN),
      arn: (a) => (known(a.name) ? 'arn:aws:iam::' + ACCOUNT + ':role/' + s(a.name) : UNKNOWN),
    },
  },
  aws_iam_role_policy_attachment: {
    required: ['role', 'policy_arn'], optional: {}, blocks: [], forceNew: ['role', 'policy_arn'],
    computed: { id: (a) => (known(a.role) ? s(a.role) + '-attachment' : UNKNOWN) },
  },
};

/** Provider-side checks that only fail while applying. Returns an error message or null. */
export function applyError(type: string, a: Record<string, unknown>, existingBuckets: string[]): string | null {
  if (type === 'aws_s3_bucket') {
    const name = s(a.bucket);
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) return 'creating S3 Bucket (' + name + '): InvalidBucketName: The specified bucket is not valid. Use 3-63 lowercase letters, numbers, dots or hyphens.';
    if (TAKEN_BUCKETS.includes(name) && !existingBuckets.includes(name)) return 'creating S3 Bucket (' + name + '): BucketAlreadyExists: The requested bucket name is not available. The bucket namespace is shared by all users of the system. Please select a different name and try again.';
  }
  if (type === 'aws_instance' && !INSTANCE_TYPES.includes(s(a.instance_type))) {
    return 'creating EC2 Instance: InvalidParameterValue: Invalid value \'' + s(a.instance_type) + '\' for InstanceType.';
  }
  if (type === 'aws_iam_role') {
    try { JSON.parse(s(a.assume_role_policy)); } catch { return 'creating IAM Role (' + s(a.name) + '): MalformedPolicyDocument: Syntax errors in policy.'; }
  }
  return null;
}
