/**
 * AWS simulator state model.
 *
 * One serialisable object holds every simulated resource. The CLI, the console UI,
 * and Terraform all read and write this same object.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface PolicyStatement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Action?: string | string[];
  NotAction?: string | string[];
  Resource?: string | string[];
  NotResource?: string | string[];
  Principal?: string | Record<string, string | string[]>;
  Condition?: JsonValue;
}

export interface PolicyDocument {
  Version?: string;
  Statement: PolicyStatement[];
}

export type Tags = Record<string, string>;

export interface IamUser {
  name: string;
  arn: string;
  userId: string;
  createDate: string;
  attachedPolicies: string[];
  inlinePolicies: Record<string, PolicyDocument>;
  accessKeys: string[];
  tags: Tags;
}

export interface IamRole {
  name: string;
  arn: string;
  roleId: string;
  createDate: string;
  description: string;
  assumeRolePolicy: PolicyDocument;
  attachedPolicies: string[];
  inlinePolicies: Record<string, PolicyDocument>;
  tags: Tags;
}

export interface ManagedPolicy {
  name: string;
  arn: string;
  policyId: string;
  awsManaged: boolean;
  description: string;
  createDate: string;
  document: PolicyDocument;
}

export interface Vpc {
  vpcId: string;
  cidrBlock: string;
  region: string;
  state: 'available';
  enableDnsHostnames: boolean;
  tags: Tags;
}

export interface Subnet {
  subnetId: string;
  vpcId: string;
  cidrBlock: string;
  availabilityZone: string;
  mapPublicIpOnLaunch: boolean;
  region: string;
  tags: Tags;
}

export interface InternetGateway {
  internetGatewayId: string;
  vpcId: string | null;
  region: string;
  tags: Tags;
}

export interface NatGateway {
  natGatewayId: string;
  subnetId: string;
  vpcId: string;
  allocationId: string;
  state: 'available' | 'deleted';
  region: string;
  tags: Tags;
}

export interface ElasticIp {
  allocationId: string;
  publicIp: string;
  region: string;
  natGatewayId: string | null;
  instanceId: string | null;
}

export interface Route {
  destinationCidrBlock: string;
  gatewayId?: string;
  natGatewayId?: string;
}

export interface RouteTable {
  routeTableId: string;
  vpcId: string;
  main: boolean;
  routes: Route[];
  associations: string[];
  region: string;
  tags: Tags;
}

export interface SgRule {
  protocol: string;
  fromPort: number;
  toPort: number;
  cidr?: string;
  sourceGroupId?: string;
  description?: string;
}

export interface SecurityGroup {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
  ingress: SgRule[];
  egress: SgRule[];
  region: string;
  tags: Tags;
}

export interface Instance {
  instanceId: string;
  imageId: string;
  instanceType: string;
  state: 'running' | 'stopped' | 'terminated';
  subnetId: string;
  vpcId: string;
  securityGroupIds: string[];
  privateIp: string;
  publicIp: string | null;
  keyName: string | null;
  launchTime: string;
  region: string;
  tags: Tags;
}

export interface PublicAccessBlock {
  BlockPublicAcls: boolean;
  IgnorePublicAcls: boolean;
  BlockPublicPolicy: boolean;
  RestrictPublicBuckets: boolean;
}

export interface S3Object {
  size: number;
  etag: string;
  lastModified: string;
  versions: number;
  content: string;
}

export interface S3Bucket {
  name: string;
  region: string;
  creationDate: string;
  versioning: 'Disabled' | 'Enabled' | 'Suspended';
  publicAccessBlock: PublicAccessBlock | null;
  policy: PolicyDocument | null;
  objects: Record<string, S3Object>;
  tags: Tags;
}

export interface DbSubnetGroup {
  name: string;
  description: string;
  vpcId: string;
  subnetIds: string[];
  region: string;
}

export interface DbInstance {
  identifier: string;
  arn: string;
  engine: string;
  engineVersion: string;
  instanceClass: string;
  allocatedStorage: number;
  masterUsername: string;
  status: 'available' | 'stopped';
  publiclyAccessible: boolean;
  subnetGroupName: string;
  vpcId: string;
  vpcSecurityGroupIds: string[];
  storageEncrypted: boolean;
  multiAz: boolean;
  backupRetentionPeriod: number;
  endpoint: string;
  masterUserSecretArn: string | null;
  region: string;
}

export interface LambdaInvocation {
  statusCode: number;
  functionError: string | null;
  payload: string;
}

export interface LambdaFunction {
  name: string;
  arn: string;
  runtime: string;
  role: string;
  handler: string;
  environment: Record<string, string>;
  timeout: number;
  memorySize: number;
  codeSize: number;
  region: string;
  lastModified: string;
  lastInvoke: LambdaInvocation | null;
  invocations: number;
}

export interface Secret {
  name: string;
  arn: string;
  description: string;
  secretString: string;
  versionId: string;
  createdDate: string;
  region: string;
}

export interface AwsProfile {
  region?: string;
  output?: string;
  accessKeyId?: string;
  roleArn?: string;
  sourceProfile?: string;
}

export interface AwsState {
  accountId: string;
  files: Record<string, string>;
  profiles: Record<string, AwsProfile>;
  iam: {
    users: Record<string, IamUser>;
    roles: Record<string, IamRole>;
    policies: Record<string, ManagedPolicy>;
    accessKeys: Record<string, string>;
  };
  ec2: {
    vpcs: Record<string, Vpc>;
    subnets: Record<string, Subnet>;
    internetGateways: Record<string, InternetGateway>;
    natGateways: Record<string, NatGateway>;
    routeTables: Record<string, RouteTable>;
    securityGroups: Record<string, SecurityGroup>;
    instances: Record<string, Instance>;
    addresses: Record<string, ElasticIp>;
  };
  s3: { buckets: Record<string, S3Bucket> };
  rds: { subnetGroups: Record<string, DbSubnetGroup>; instances: Record<string, DbInstance> };
  lambda: { functions: Record<string, LambdaFunction> };
  secretsmanager: { secrets: Record<string, Secret> };
  /** Commands typed into CloudShell, in order. */
  history: string[];
  /** Actions performed through the console UI, recorded as equivalent CLI commands. */
  consoleHistory: string[];
  stdout: string;
  stderr: string;
  lastError: string;
  /** Monotonic counter for deterministic IDs and timestamps. */
  seq: number;
}

export type Principal =
  | { kind: 'user'; name: string }
  | { kind: 'role'; name: string; session: string }
  | { kind: 'service'; name: string };

export interface AwsCommandResult {
  state: AwsState;
  stdout: string;
  stderr: string;
  exitCode: number;
}
