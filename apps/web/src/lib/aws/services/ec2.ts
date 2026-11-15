/* eslint-disable @typescript-eslint/no-dynamic-delete -- the simulator state is keyed records; delete is the intended removal */
import { AwsError, parseShorthand, UsageError } from '../cli-core';
import { json, readTags, tagList, type OpContext, type ServiceSpec } from '../context';
import { hash, nextId, now } from '../state';
import type { AwsState, Instance, JsonValue, RouteTable, SecurityGroup, SgRule, Subnet, Vpc } from '../types';

// ─── CIDR helpers ────────────────────────────────────────────────────────────

export interface Cidr { start: number; size: number; prefix: number }

export function parseCidr(value: string): Cidr | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(value);
  if (!match) return null;
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix > 32) return null;
  const ip = ((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!;
  const size = 2 ** (32 - prefix);
  return { start: ip - (ip % size), size, prefix };
}

export function cidrContains(outer: Cidr, inner: Cidr): boolean {
  return inner.start >= outer.start && inner.start + inner.size <= outer.start + outer.size;
}

export function cidrOverlaps(a: Cidr, b: Cidr): boolean {
  return a.start < b.start + b.size && b.start < a.start + a.size;
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function ipString(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

// ─── Lookups ────────────────────────────────────────────────────────────────

function inRegion<T extends { region: string }>(ctx: OpContext, items: Record<string, T>, id: string, code: string, label: string): T {
  const item = items[id];
  if (!item || item.region !== ctx.region) throw new AwsError(code, `The ${label} ID '${id}' does not exist`);
  return item;
}

export const findVpc = (ctx: OpContext, id: string): Vpc => inRegion(ctx, ctx.state.ec2.vpcs, id, 'InvalidVpcID.NotFound', 'vpc');
export const findSubnet = (ctx: OpContext, id: string): Subnet => inRegion(ctx, ctx.state.ec2.subnets, id, 'InvalidSubnetID.NotFound', 'subnet');
export const findGroup = (ctx: OpContext, id: string): SecurityGroup => inRegion(ctx, ctx.state.ec2.securityGroups, id, 'InvalidGroup.NotFound', 'security group');
export const findRouteTable = (ctx: OpContext, id: string): RouteTable => inRegion(ctx, ctx.state.ec2.routeTables, id, 'InvalidRouteTableID.NotFound', 'route table');

/** The route table that applies to a subnet: its explicit association, otherwise the VPC main table. */
export function routeTableFor(state: AwsState, subnet: Subnet): RouteTable | undefined {
  const tables = Object.values(state.ec2.routeTables).filter((table) => table.vpcId === subnet.vpcId);
  return tables.find((table) => table.associations.includes(subnet.subnetId)) ?? tables.find((table) => table.main);
}

/** A subnet is public when its route table sends 0.0.0.0/0 to an internet gateway. */
export function isPublicSubnet(state: AwsState, subnet: Subnet): boolean {
  return Boolean(routeTableFor(state, subnet)?.routes.some((route) => route.destinationCidrBlock === '0.0.0.0/0' && route.gatewayId?.startsWith('igw-')));
}

// ─── Filters ────────────────────────────────────────────────────────────────

interface Filter { name: string; values: string[] }

function readFilters(ctx: OpContext): Filter[] {
  return ctx.list('filters').map((raw) => {
    const match = /^Name=([^,]+),Values=(.+)$/.exec(raw.trim());
    if (match) return { name: match[1]!, values: match[2]!.replace(/^\[|\]$/g, '').split(',') };
    const parsed = parseShorthand(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.Name === 'string' && Array.isArray(parsed.Values)) {
      return { name: parsed.Name, values: parsed.Values.map(String) };
    }
    throw new UsageError(`Error parsing parameter '--filters': Expected: 'Name=...,Values=...', received: '${raw}'`);
  });
}

function matchesFilters(filters: Filter[], fields: Record<string, string | string[] | undefined>, tags: Record<string, string>): boolean {
  return filters.every((filter) => {
    const value = filter.name.startsWith('tag:') ? tags[filter.name.slice(4)] : fields[filter.name];
    const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return filter.values.some((wanted) => list.some((item) => new RegExp('^' + wanted.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(item)));
  });
}

// ─── JSON shapes ─────────────────────────────────────────────────────────────

const withTags = (tags: Record<string, string>): Record<string, JsonValue> => (Object.keys(tags).length ? { Tags: tagList(tags) } : {});

export const vpcJson = (ctx: OpContext, vpc: Vpc): JsonValue => ({
  CidrBlock: vpc.cidrBlock, DhcpOptionsId: 'dopt-0' + hash(vpc.vpcId, 16), State: vpc.state, VpcId: vpc.vpcId, OwnerId: ctx.state.accountId,
  InstanceTenancy: 'default', IsDefault: false, ...withTags(vpc.tags),
});

const subnetJson = (ctx: OpContext, subnet: Subnet): JsonValue => ({
  AvailabilityZone: subnet.availabilityZone, AvailableIpAddressCount: (parseCidr(subnet.cidrBlock)?.size ?? 5) - 5, CidrBlock: subnet.cidrBlock,
  MapPublicIpOnLaunch: subnet.mapPublicIpOnLaunch, State: 'available', SubnetId: subnet.subnetId, VpcId: subnet.vpcId, OwnerId: ctx.state.accountId,
  SubnetArn: ctx.arn('ec2', 'subnet/' + subnet.subnetId), ...withTags(subnet.tags),
});

function ruleJson(state: AwsState, rule: SgRule): JsonValue {
  return {
    IpProtocol: rule.protocol, ...(rule.protocol === '-1' ? {} : { FromPort: rule.fromPort, ToPort: rule.toPort }),
    IpRanges: rule.cidr ? [{ CidrIp: rule.cidr, ...(rule.description ? { Description: rule.description } : {}) }] : [],
    UserIdGroupPairs: rule.sourceGroupId ? [{ GroupId: rule.sourceGroupId, UserId: state.accountId }] : [],
    Ipv6Ranges: [], PrefixListIds: [],
  };
}

export const groupJson = (ctx: OpContext, group: SecurityGroup): JsonValue => ({
  Description: group.description, GroupName: group.groupName, IpPermissions: group.ingress.map((rule) => ruleJson(ctx.state, rule)),
  OwnerId: ctx.state.accountId, GroupId: group.groupId, IpPermissionsEgress: group.egress.map((rule) => ruleJson(ctx.state, rule)), VpcId: group.vpcId,
  ...withTags(group.tags),
});

const routeTableJson = (ctx: OpContext, table: RouteTable): JsonValue => ({
  Associations: [
    ...(table.main ? [{ Main: true, RouteTableAssociationId: 'rtbassoc-0' + hash(table.routeTableId, 16), RouteTableId: table.routeTableId, AssociationState: { State: 'associated' } }] : []),
    ...table.associations.map((subnetId) => ({ Main: false, RouteTableAssociationId: associationId(table.routeTableId, subnetId), RouteTableId: table.routeTableId, SubnetId: subnetId, AssociationState: { State: 'associated' } })),
  ],
  RouteTableId: table.routeTableId, VpcId: table.vpcId, OwnerId: ctx.state.accountId,
  Routes: table.routes.map((route) => ({
    DestinationCidrBlock: route.destinationCidrBlock, ...(route.gatewayId ? { GatewayId: route.gatewayId } : {}),
    ...(route.natGatewayId ? { NatGatewayId: route.natGatewayId } : {}), Origin: route.gatewayId === 'local' ? 'CreateRouteTable' : 'CreateRoute', State: 'active',
  })),
  ...withTags(table.tags),
});

const instanceJson = (ctx: OpContext, instance: Instance, state: string = instance.state): JsonValue => ({
  AmiLaunchIndex: 0, ImageId: instance.imageId, InstanceId: instance.instanceId, InstanceType: instance.instanceType, LaunchTime: instance.launchTime,
  ...(instance.keyName ? { KeyName: instance.keyName } : {}), Placement: { AvailabilityZone: ctx.state.ec2.subnets[instance.subnetId]?.availabilityZone ?? ctx.region + 'a' },
  PrivateIpAddress: instance.privateIp, ...(instance.publicIp ? { PublicIpAddress: instance.publicIp } : {}),
  State: stateJson(state), SubnetId: instance.subnetId, VpcId: instance.vpcId,
  SecurityGroups: instance.securityGroupIds.map((id) => ({ GroupId: id, GroupName: ctx.state.ec2.securityGroups[id]?.groupName ?? '' })),
  ...withTags(instance.tags),
});

const STATE_CODES: Record<string, number> = { pending: 0, running: 16, 'shutting-down': 32, terminated: 48, stopping: 64, stopped: 80 };
const stateJson = (name: string): JsonValue => ({ Code: STATE_CODES[name] ?? 0, Name: name });

const associationId = (tableId: string, subnetId: string) => 'rtbassoc-0' + hash(tableId + subnetId, 16);

// ─── Security group rules ────────────────────────────────────────────────────

const PROTOCOLS: Record<string, string> = { tcp: 'tcp', udp: 'udp', icmp: 'icmp', all: '-1', '-1': '-1', '6': 'tcp', '17': 'udp' };

function readRules(ctx: OpContext): SgRule[] {
  const permissions = ctx.str('ip-permissions');
  if (permissions !== undefined) {
    const parsed = parseShorthand(permissions);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const rules: SgRule[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const protocol = PROTOCOLS[asText(item.IpProtocol).toLowerCase()];
      if (!protocol) throw new AwsError('InvalidParameterValue', `Invalid value '${asText(item.IpProtocol)}' for IP protocol. Unknown protocol.`);
      const fromPort = protocol === '-1' ? 0 : Number(item.FromPort ?? 0);
      const toPort = protocol === '-1' ? 65535 : Number(item.ToPort ?? fromPort);
      const ranges = Array.isArray(item.IpRanges) ? item.IpRanges : [];
      for (const range of ranges) if (range && typeof range === 'object' && !Array.isArray(range)) rules.push({ protocol, fromPort, toPort, cidr: asText(range.CidrIp), ...(typeof range.Description === 'string' ? { description: range.Description } : {}) });
      const pairs = Array.isArray(item.UserIdGroupPairs) ? item.UserIdGroupPairs : [];
      for (const pair of pairs) if (pair && typeof pair === 'object' && !Array.isArray(pair)) rules.push({ protocol, fromPort, toPort, sourceGroupId: asText(pair.GroupId) });
    }
    return rules;
  }
  const protocolArg = ctx.str('protocol');
  if (protocolArg === undefined) throw new AwsError('MissingParameter', 'Either \'ipPermissions\' or \'ipProtocol\' must be specified.');
  const protocol = PROTOCOLS[protocolArg.toLowerCase()];
  if (!protocol) throw new AwsError('InvalidParameterValue', `Invalid value '${protocolArg}' for IP protocol. Unknown protocol.`);
  let fromPort = 0;
  let toPort = 65535;
  const port = ctx.str('port');
  if (protocol !== '-1') {
    if (port === undefined) throw new AwsError('InvalidParameterValue', 'Invalid value for portRange. Must specify both from and to ports with TCP/UDP.');
    const match = /^(-?\d+)(?:-(\d+))?$/.exec(port);
    if (!match) throw new UsageError(`aws: error: argument --port: invalid port value: '${port}'`);
    fromPort = Number(match[1]);
    toPort = Number(match[2] ?? match[1]);
    if (fromPort > 65535 || toPort > 65535 || fromPort > toPort) throw new AwsError('InvalidParameterValue', `Invalid value for portRange. Must specify both from and to ports with TCP/UDP.`);
  }
  const cidr = ctx.str('cidr');
  const sourceGroup = ctx.str('source-group');
  if (!cidr && !sourceGroup) throw new AwsError('MissingParameter', 'Either \'cidr\' or \'sourceGroup\' must be specified.');
  return [{ protocol, fromPort, toPort, ...(cidr ? { cidr } : {}), ...(sourceGroup ? { sourceGroupId: sourceGroup } : {}) }];
}

const sameRule = (a: SgRule, b: SgRule) => a.protocol === b.protocol && a.fromPort === b.fromPort && a.toPort === b.toPort && (a.cidr ?? '') === (b.cidr ?? '') && (a.sourceGroupId ?? '') === (b.sourceGroupId ?? '');

function describeRule(rule: SgRule): string {
  return `peer: ${rule.cidr ?? rule.sourceGroupId}, ${rule.protocol === '-1' ? 'ALL' : rule.protocol.toUpperCase()}, from port: ${rule.fromPort}, to port: ${rule.toPort}, ALLOW`;
}

function resolveGroup(ctx: OpContext): SecurityGroup {
  const id = ctx.str('group-id');
  if (id) return findGroup(ctx, id);
  const name = ctx.str('group-name');
  if (!name) throw new AwsError('MissingParameter', 'The request must contain the parameter groupId');
  const group = Object.values(ctx.state.ec2.securityGroups).find((item) => item.groupName === name && item.region === ctx.region);
  if (!group) throw new AwsError('InvalidGroup.NotFound', `The security group '${name}' does not exist in default VPC 'none'`);
  return group;
}

function changeRules(ctx: OpContext, direction: 'ingress' | 'egress', add: boolean) {
  const group = resolveGroup(ctx);
  ctx.authorize(`ec2:${add ? 'Authorize' : 'Revoke'}SecurityGroup${direction === 'ingress' ? 'Ingress' : 'Egress'}`, ctx.arn('ec2', 'security-group/' + group.groupId));
  const rules = readRules(ctx);
  for (const rule of rules) {
    if (rule.cidr !== undefined && !parseCidr(rule.cidr)) throw new AwsError('InvalidParameterValue', `CIDR block ${rule.cidr} is malformed`);
    if (rule.sourceGroupId) {
      const byName = Object.values(ctx.state.ec2.securityGroups).find((item) => item.groupName === rule.sourceGroupId && item.vpcId === group.vpcId);
      if (byName) rule.sourceGroupId = byName.groupId;
      findGroup(ctx, rule.sourceGroupId);
    }
    const list = group[direction];
    const existing = list.findIndex((item) => sameRule(item, rule));
    if (add) {
      if (existing >= 0) throw new AwsError('InvalidPermission.Duplicate', `the specified rule "${describeRule(rule)}" already exists`);
      list.push(rule);
    } else {
      if (existing < 0) throw new AwsError('InvalidPermission.NotFound', 'The specified rule does not exist in this security group.');
      list.splice(existing, 1);
    }
  }
  return json(add ? { Return: true, SecurityGroupRules: rules.map((rule, index) => ({ SecurityGroupRuleId: 'sgr-0' + hash(group.groupId + String(index) + JSON.stringify(rule), 16), GroupId: group.groupId, IsEgress: direction === 'egress', IpProtocol: rule.protocol, FromPort: rule.fromPort, ToPort: rule.toPort, ...(rule.cidr ? { CidrIpv4: rule.cidr } : { ReferencedGroupInfo: { GroupId: rule.sourceGroupId ?? '' } }) })) } : { Return: true });
}

export const INSTANCE_TYPES = ['t2.micro', 't3.nano', 't3.micro', 't3.small', 't3.medium', 't3.large', 't4g.micro', 't4g.small', 'm5.large', 'm5.xlarge', 'c5.large', 'r5.large'];

function changeInstances(ctx: OpContext, target: 'running' | 'stopped' | 'terminated', op: string, key: string) {
  const items = ctx.list('instance-ids').map((id) => {
    const instance = ctx.state.ec2.instances[id];
    if (instance?.region !== ctx.region) throw new AwsError('InvalidInstanceID.NotFound', `The instance ID '${id}' does not exist`);
    ctx.authorize('ec2:' + op, ctx.arn('ec2', 'instance/' + id));
    if (instance.state === 'terminated' && target !== 'terminated') throw new AwsError('IncorrectInstanceState', `The instance '${id}' is not in a state from which it can be ${target === 'running' ? 'started' : 'stopped'}.`);
    const previous = instance.state;
    instance.state = target;
    if (target !== 'running') instance.publicIp = null;
    else if (!instance.publicIp && ctx.state.ec2.subnets[instance.subnetId]?.mapPublicIpOnLaunch) instance.publicIp = publicIp(instance.instanceId + 'restart');
    const transitional = target === 'running' ? 'pending' : target === 'stopped' ? 'stopping' : 'shutting-down';
    return { CurrentState: stateJson(previous === target ? target : transitional), InstanceId: id, PreviousState: stateJson(previous) };
  });
  return json({ [key]: items });
}

const publicIp = (seed: string) => {
  const h = parseInt(hash(seed, 6), 16);
  return `13.${200 + (h % 35)}.${(h >> 8) % 256}.${(h >> 16) % 250 + 3}`;
};

export const ec2Service: ServiceSpec = {
  'create-vpc': {
    op: 'CreateVpc', summary: 'Creates a VPC with the specified CIDR block.',
    args: { 'cidr-block': 'string', 'tag-specifications': 'list', 'instance-tenancy': 'string', 'dry-run': 'bool' }, required: ['cidr-block'],
    run(ctx) {
      ctx.authorize('ec2:CreateVpc', '*');
      const cidrBlock = ctx.req('cidr-block');
      const cidr = parseCidr(cidrBlock);
      if (!cidr || cidr.prefix < 16 || cidr.prefix > 28) throw new AwsError('InvalidVpc.Range', `The CIDR '${cidrBlock}' is invalid.`);
      const vpcId = nextId(ctx.state, 'vpc');
      const vpc: Vpc = { vpcId, cidrBlock, region: ctx.region, state: 'available', enableDnsHostnames: false, tags: readTags(ctx) };
      ctx.state.ec2.vpcs[vpcId] = vpc;
      const tableId = nextId(ctx.state, 'rtb');
      ctx.state.ec2.routeTables[tableId] = { routeTableId: tableId, vpcId, main: true, routes: [{ destinationCidrBlock: cidrBlock, gatewayId: 'local' }], associations: [], region: ctx.region, tags: {} };
      const groupId = nextId(ctx.state, 'sg');
      ctx.state.ec2.securityGroups[groupId] = { groupId, groupName: 'default', description: 'default VPC security group', vpcId, ingress: [{ protocol: '-1', fromPort: 0, toPort: 65535, sourceGroupId: groupId }], egress: [{ protocol: '-1', fromPort: 0, toPort: 65535, cidr: '0.0.0.0/0' }], region: ctx.region, tags: {} };
      return json({ Vpc: { ...(vpcJson(ctx, vpc) as Record<string, JsonValue>), State: 'pending' } });
    },
  },
  'describe-vpcs': {
    op: 'DescribeVpcs', summary: 'Describes your VPCs.', args: { 'vpc-ids': 'list', filters: 'list' },
    run(ctx) {
      ctx.authorize('ec2:DescribeVpcs', '*');
      const ids = ctx.list('vpc-ids');
      ids.forEach((id) => findVpc(ctx, id));
      const filters = readFilters(ctx);
      const vpcs = Object.values(ctx.state.ec2.vpcs).filter((vpc) => vpc.region === ctx.region && (!ids.length || ids.includes(vpc.vpcId))
        && matchesFilters(filters, { 'vpc-id': vpc.vpcId, 'cidr-block': vpc.cidrBlock, cidr: vpc.cidrBlock, state: vpc.state }, vpc.tags));
      return json({ Vpcs: vpcs.map((vpc) => vpcJson(ctx, vpc)) });
    },
  },
  'modify-vpc-attribute': {
    op: 'ModifyVpcAttribute', summary: 'Modifies the specified attribute of the specified VPC.', args: { 'vpc-id': 'string', 'enable-dns-hostnames': 'bool', 'enable-dns-support': 'bool' }, required: ['vpc-id'],
    run(ctx) {
      const vpc = findVpc(ctx, ctx.req('vpc-id'));
      ctx.authorize('ec2:ModifyVpcAttribute', ctx.arn('ec2', 'vpc/' + vpc.vpcId));
      const value = ctx.bool('enable-dns-hostnames');
      if (value !== undefined) vpc.enableDnsHostnames = value;
      return null;
    },
  },
  'delete-vpc': {
    op: 'DeleteVpc', summary: 'Deletes the specified VPC.', args: { 'vpc-id': 'string' }, required: ['vpc-id'],
    run(ctx) {
      const vpc = findVpc(ctx, ctx.req('vpc-id'));
      ctx.authorize('ec2:DeleteVpc', ctx.arn('ec2', 'vpc/' + vpc.vpcId));
      const { ec2 } = ctx.state;
      const busy = Object.values(ec2.subnets).some((item) => item.vpcId === vpc.vpcId)
        || Object.values(ec2.internetGateways).some((item) => item.vpcId === vpc.vpcId)
        || Object.values(ec2.securityGroups).some((item) => item.vpcId === vpc.vpcId && item.groupName !== 'default')
        || Object.values(ec2.routeTables).some((item) => item.vpcId === vpc.vpcId && !item.main);
      if (busy) throw new AwsError('DependencyViolation', `The vpc '${vpc.vpcId}' has dependencies and cannot be deleted.`);
      for (const [id, table] of Object.entries(ec2.routeTables)) if (table.vpcId === vpc.vpcId) delete ec2.routeTables[id];
      for (const [id, group] of Object.entries(ec2.securityGroups)) if (group.vpcId === vpc.vpcId) delete ec2.securityGroups[id];
      delete ec2.vpcs[vpc.vpcId];
      return null;
    },
  },
  'create-subnet': {
    op: 'CreateSubnet', summary: 'Creates a subnet in the specified VPC.',
    args: { 'vpc-id': 'string', 'cidr-block': 'string', 'availability-zone': 'string', 'tag-specifications': 'list' }, required: ['vpc-id', 'cidr-block'],
    run(ctx) {
      ctx.authorize('ec2:CreateSubnet', '*');
      const vpc = findVpc(ctx, ctx.req('vpc-id'));
      const cidrBlock = ctx.req('cidr-block');
      const cidr = parseCidr(cidrBlock);
      const vpcCidr = parseCidr(vpc.cidrBlock)!;
      if (!cidr || cidr.prefix > 28 || !cidrContains(vpcCidr, cidr)) throw new AwsError('InvalidSubnet.Range', `The CIDR '${cidrBlock}' is invalid.`);
      const clash = Object.values(ctx.state.ec2.subnets).find((item) => item.vpcId === vpc.vpcId && cidrOverlaps(parseCidr(item.cidrBlock)!, cidr));
      if (clash) throw new AwsError('InvalidSubnet.Conflict', `The CIDR '${cidrBlock}' conflicts with another subnet`);
      const zones = ['a', 'b', 'c'].map((suffix) => ctx.region + suffix);
      const zone = ctx.str('availability-zone') ?? zones[0]!;
      if (!zones.includes(zone)) throw new AwsError('InvalidParameterValue', `Value (${zone}) for parameter availabilityZone is invalid. Subnets can currently only be created in the following availability zones: ${zones.join(', ')}.`);
      const subnetId = nextId(ctx.state, 'subnet');
      const subnet: Subnet = { subnetId, vpcId: vpc.vpcId, cidrBlock, availabilityZone: zone, mapPublicIpOnLaunch: false, region: ctx.region, tags: readTags(ctx) };
      ctx.state.ec2.subnets[subnetId] = subnet;
      return json({ Subnet: { ...(subnetJson(ctx, subnet) as Record<string, JsonValue>), State: 'pending' } });
    },
  },
  'describe-subnets': {
    op: 'DescribeSubnets', summary: 'Describes your subnets.', args: { 'subnet-ids': 'list', filters: 'list' },
    run(ctx) {
      ctx.authorize('ec2:DescribeSubnets', '*');
      const ids = ctx.list('subnet-ids');
      ids.forEach((id) => findSubnet(ctx, id));
      const filters = readFilters(ctx);
      const subnets = Object.values(ctx.state.ec2.subnets).filter((subnet) => subnet.region === ctx.region && (!ids.length || ids.includes(subnet.subnetId))
        && matchesFilters(filters, { 'vpc-id': subnet.vpcId, 'subnet-id': subnet.subnetId, 'cidr-block': subnet.cidrBlock, 'availability-zone': subnet.availabilityZone }, subnet.tags));
      return json({ Subnets: subnets.map((subnet) => subnetJson(ctx, subnet)) });
    },
  },
  'modify-subnet-attribute': {
    op: 'ModifySubnetAttribute', summary: 'Modifies a subnet attribute.', args: { 'subnet-id': 'string', 'map-public-ip-on-launch': 'bool' }, required: ['subnet-id'],
    run(ctx) {
      const subnet = findSubnet(ctx, ctx.req('subnet-id'));
      ctx.authorize('ec2:ModifySubnetAttribute', ctx.arn('ec2', 'subnet/' + subnet.subnetId));
      const value = ctx.bool('map-public-ip-on-launch');
      if (value === undefined) throw new AwsError('MissingParameter', 'The request must contain exactly one attribute to modify.');
      subnet.mapPublicIpOnLaunch = value;
      return null;
    },
  },
  'delete-subnet': {
    op: 'DeleteSubnet', summary: 'Deletes the specified subnet.', args: { 'subnet-id': 'string' }, required: ['subnet-id'],
    run(ctx) {
      const subnet = findSubnet(ctx, ctx.req('subnet-id'));
      ctx.authorize('ec2:DeleteSubnet', ctx.arn('ec2', 'subnet/' + subnet.subnetId));
      const { state } = ctx;
      const busy = Object.values(state.ec2.instances).some((item) => item.subnetId === subnet.subnetId && item.state !== 'terminated')
        || Object.values(state.ec2.natGateways).some((item) => item.subnetId === subnet.subnetId && item.state !== 'deleted')
        || Object.values(state.rds.subnetGroups).some((item) => item.subnetIds.includes(subnet.subnetId));
      if (busy) throw new AwsError('DependencyViolation', `The subnet '${subnet.subnetId}' has dependencies and cannot be deleted.`);
      for (const table of Object.values(state.ec2.routeTables)) table.associations = table.associations.filter((id) => id !== subnet.subnetId);
      delete state.ec2.subnets[subnet.subnetId];
      return null;
    },
  },
  'create-internet-gateway': {
    op: 'CreateInternetGateway', summary: 'Creates an internet gateway for use with a VPC.', args: { 'tag-specifications': 'list' },
    run(ctx) {
      ctx.authorize('ec2:CreateInternetGateway', '*');
      const id = nextId(ctx.state, 'igw');
      const tags = readTags(ctx);
      ctx.state.ec2.internetGateways[id] = { internetGatewayId: id, vpcId: null, region: ctx.region, tags };
      return json({ InternetGateway: { Attachments: [], InternetGatewayId: id, OwnerId: ctx.state.accountId, ...withTags(tags) } });
    },
  },
  'attach-internet-gateway': {
    op: 'AttachInternetGateway', summary: 'Attaches an internet gateway to a VPC.', args: { 'internet-gateway-id': 'string', 'vpc-id': 'string' }, required: ['internet-gateway-id', 'vpc-id'],
    run(ctx) {
      const gateway = inRegion(ctx, ctx.state.ec2.internetGateways, ctx.req('internet-gateway-id'), 'InvalidInternetGatewayID.NotFound', 'internet gateway');
      const vpc = findVpc(ctx, ctx.req('vpc-id'));
      ctx.authorize('ec2:AttachInternetGateway', ctx.arn('ec2', 'internet-gateway/' + gateway.internetGatewayId));
      if (gateway.vpcId) throw new AwsError('Resource.AlreadyAssociated', `resource ${gateway.internetGatewayId} is already attached to network ${gateway.vpcId}`);
      if (Object.values(ctx.state.ec2.internetGateways).some((item) => item.vpcId === vpc.vpcId)) throw new AwsError('Resource.AlreadyAssociated', `Network ${vpc.vpcId} already has an internet gateway attached`);
      gateway.vpcId = vpc.vpcId;
      return null;
    },
  },
  'detach-internet-gateway': {
    op: 'DetachInternetGateway', summary: 'Detaches an internet gateway from a VPC.', args: { 'internet-gateway-id': 'string', 'vpc-id': 'string' }, required: ['internet-gateway-id', 'vpc-id'],
    run(ctx) {
      const gateway = inRegion(ctx, ctx.state.ec2.internetGateways, ctx.req('internet-gateway-id'), 'InvalidInternetGatewayID.NotFound', 'internet gateway');
      ctx.authorize('ec2:DetachInternetGateway', ctx.arn('ec2', 'internet-gateway/' + gateway.internetGatewayId));
      if (gateway.vpcId !== ctx.req('vpc-id')) throw new AwsError('Gateway.NotAttached', `resource ${gateway.internetGatewayId} is not attached to network ${ctx.req('vpc-id')}`);
      gateway.vpcId = null;
      return null;
    },
  },
  'delete-internet-gateway': {
    op: 'DeleteInternetGateway', summary: 'Deletes the specified internet gateway.', args: { 'internet-gateway-id': 'string' }, required: ['internet-gateway-id'],
    run(ctx) {
      const gateway = inRegion(ctx, ctx.state.ec2.internetGateways, ctx.req('internet-gateway-id'), 'InvalidInternetGatewayID.NotFound', 'internet gateway');
      ctx.authorize('ec2:DeleteInternetGateway', ctx.arn('ec2', 'internet-gateway/' + gateway.internetGatewayId));
      if (gateway.vpcId) throw new AwsError('DependencyViolation', `The internetGateway '${gateway.internetGatewayId}' has dependencies and cannot be deleted.`);
      delete ctx.state.ec2.internetGateways[gateway.internetGatewayId];
      return null;
    },
  },
  'describe-internet-gateways': {
    op: 'DescribeInternetGateways', summary: 'Describes your internet gateways.', args: { 'internet-gateway-ids': 'list', filters: 'list' },
    run(ctx) {
      ctx.authorize('ec2:DescribeInternetGateways', '*');
      const filters = readFilters(ctx);
      const ids = ctx.list('internet-gateway-ids');
      const items = Object.values(ctx.state.ec2.internetGateways).filter((item) => item.region === ctx.region && (!ids.length || ids.includes(item.internetGatewayId))
        && matchesFilters(filters, { 'attachment.vpc-id': item.vpcId ?? undefined, 'internet-gateway-id': item.internetGatewayId }, item.tags));
      return json({ InternetGateways: items.map((item) => ({ Attachments: item.vpcId ? [{ State: 'available', VpcId: item.vpcId }] : [], InternetGatewayId: item.internetGatewayId, OwnerId: ctx.state.accountId, ...withTags(item.tags) })) });
    },
  },
  'allocate-address': {
    op: 'AllocateAddress', summary: 'Allocates an Elastic IP address to your account.', args: { domain: 'string', 'tag-specifications': 'list' },
    run(ctx) {
      ctx.authorize('ec2:AllocateAddress', '*');
      const allocationId = nextId(ctx.state, 'eipalloc');
      const ip = publicIp(allocationId);
      ctx.state.ec2.addresses[allocationId] = { allocationId, publicIp: ip, region: ctx.region, natGatewayId: null, instanceId: null };
      return json({ PublicIp: ip, AllocationId: allocationId, PublicIpv4Pool: 'amazon', NetworkBorderGroup: ctx.region, Domain: 'vpc' });
    },
  },
  'release-address': {
    op: 'ReleaseAddress', summary: 'Releases the specified Elastic IP address.', args: { 'allocation-id': 'string' }, required: ['allocation-id'],
    run(ctx) {
      const address = inRegion(ctx, ctx.state.ec2.addresses, ctx.req('allocation-id'), 'InvalidAllocationID.NotFound', 'allocation');
      ctx.authorize('ec2:ReleaseAddress', '*');
      if (address.natGatewayId || address.instanceId) throw new AwsError('InvalidIPAddress.InUse', 'Address is in use');
      delete ctx.state.ec2.addresses[address.allocationId];
      return null;
    },
  },
  'describe-addresses': {
    op: 'DescribeAddresses', summary: 'Describes your Elastic IP addresses.',
    run(ctx) {
      ctx.authorize('ec2:DescribeAddresses', '*');
      return json({ Addresses: Object.values(ctx.state.ec2.addresses).filter((item) => item.region === ctx.region).map((item) => ({
        PublicIp: item.publicIp, AllocationId: item.allocationId, Domain: 'vpc', ...(item.instanceId ? { InstanceId: item.instanceId } : {}),
        ...(item.natGatewayId ? { AssociationId: 'eipassoc-0' + hash(item.natGatewayId, 16), NetworkInterfaceOwnerId: ctx.state.accountId } : {}),
      })) });
    },
  },
  'create-nat-gateway': {
    op: 'CreateNatGateway', summary: 'Creates a NAT gateway in the specified subnet.', args: { 'subnet-id': 'string', 'allocation-id': 'string', 'connectivity-type': 'string', 'tag-specifications': 'list' }, required: ['subnet-id'],
    run(ctx) {
      ctx.authorize('ec2:CreateNatGateway', '*');
      const subnet = findSubnet(ctx, ctx.req('subnet-id'));
      const allocationId = ctx.str('allocation-id');
      if (!allocationId) throw new AwsError('MissingParameter', 'The request must include the AllocationId parameter. Add the required parameter and retry the request.');
      const address = inRegion(ctx, ctx.state.ec2.addresses, allocationId, 'InvalidAllocationID.NotFound', 'allocation');
      if (address.natGatewayId || address.instanceId) throw new AwsError('Resource.AlreadyAssociated', `Elastic IP address [${allocationId}] is already associated`);
      if (!Object.values(ctx.state.ec2.internetGateways).some((item) => item.vpcId === subnet.vpcId)) throw new AwsError('Gateway.NotAttached', `Network ${subnet.vpcId} has no Internet gateway attached`);
      const id = nextId(ctx.state, 'nat');
      const tags = readTags(ctx);
      ctx.state.ec2.natGateways[id] = { natGatewayId: id, subnetId: subnet.subnetId, vpcId: subnet.vpcId, allocationId, state: 'available', region: ctx.region, tags };
      address.natGatewayId = id;
      return json({ NatGateway: { CreateTime: now(ctx.state), NatGatewayAddresses: [{ AllocationId: allocationId, PublicIp: address.publicIp }], NatGatewayId: id, State: 'pending', SubnetId: subnet.subnetId, VpcId: subnet.vpcId, ConnectivityType: 'public', ...withTags(tags) } });
    },
  },
  'describe-nat-gateways': {
    op: 'DescribeNatGateways', summary: 'Describes your NAT gateways.', args: { 'nat-gateway-ids': 'list', filter: 'list' },
    run(ctx) {
      ctx.authorize('ec2:DescribeNatGateways', '*');
      const items = Object.values(ctx.state.ec2.natGateways).filter((item) => item.region === ctx.region);
      return json({ NatGateways: items.map((item) => ({ NatGatewayId: item.natGatewayId, State: item.state, SubnetId: item.subnetId, VpcId: item.vpcId, NatGatewayAddresses: [{ AllocationId: item.allocationId, PublicIp: ctx.state.ec2.addresses[item.allocationId]?.publicIp ?? '' }], ...withTags(item.tags) })) });
    },
  },
  'delete-nat-gateway': {
    op: 'DeleteNatGateway', summary: 'Deletes the specified NAT gateway.', args: { 'nat-gateway-id': 'string' }, required: ['nat-gateway-id'],
    run(ctx) {
      const gateway = inRegion(ctx, ctx.state.ec2.natGateways, ctx.req('nat-gateway-id'), 'NatGatewayNotFound', 'NAT gateway');
      ctx.authorize('ec2:DeleteNatGateway', '*');
      gateway.state = 'deleted';
      const address = ctx.state.ec2.addresses[gateway.allocationId];
      if (address) address.natGatewayId = null;
      return json({ NatGatewayId: gateway.natGatewayId });
    },
  },
  'create-route-table': {
    op: 'CreateRouteTable', summary: 'Creates a route table for the specified VPC.', args: { 'vpc-id': 'string', 'tag-specifications': 'list' }, required: ['vpc-id'],
    run(ctx) {
      ctx.authorize('ec2:CreateRouteTable', '*');
      const vpc = findVpc(ctx, ctx.req('vpc-id'));
      const id = nextId(ctx.state, 'rtb');
      const table: RouteTable = { routeTableId: id, vpcId: vpc.vpcId, main: false, routes: [{ destinationCidrBlock: vpc.cidrBlock, gatewayId: 'local' }], associations: [], region: ctx.region, tags: readTags(ctx) };
      ctx.state.ec2.routeTables[id] = table;
      return json({ RouteTable: routeTableJson(ctx, table) });
    },
  },
  'describe-route-tables': {
    op: 'DescribeRouteTables', summary: 'Describes your route tables.', args: { 'route-table-ids': 'list', filters: 'list' },
    run(ctx) {
      ctx.authorize('ec2:DescribeRouteTables', '*');
      const filters = readFilters(ctx);
      const ids = ctx.list('route-table-ids');
      const tables = Object.values(ctx.state.ec2.routeTables).filter((table) => table.region === ctx.region && (!ids.length || ids.includes(table.routeTableId))
        && matchesFilters(filters, { 'vpc-id': table.vpcId, 'route-table-id': table.routeTableId, 'association.subnet-id': table.associations, 'association.main': String(table.main) }, table.tags));
      return json({ RouteTables: tables.map((table) => routeTableJson(ctx, table)) });
    },
  },
  'delete-route-table': {
    op: 'DeleteRouteTable', summary: 'Deletes the specified route table.', args: { 'route-table-id': 'string' }, required: ['route-table-id'],
    run(ctx) {
      const table = findRouteTable(ctx, ctx.req('route-table-id'));
      ctx.authorize('ec2:DeleteRouteTable', '*');
      if (table.main || table.associations.length) throw new AwsError('DependencyViolation', `The routeTable '${table.routeTableId}' has dependencies and cannot be deleted.`);
      delete ctx.state.ec2.routeTables[table.routeTableId];
      return null;
    },
  },
  'create-route': {
    op: 'CreateRoute', summary: 'Creates a route in a route table within a VPC.',
    args: { 'route-table-id': 'string', 'destination-cidr-block': 'string', 'gateway-id': 'string', 'nat-gateway-id': 'string' }, required: ['route-table-id', 'destination-cidr-block'],
    run(ctx) { return json({ Return: upsertRoute(ctx, false) }); },
  },
  'replace-route': {
    op: 'ReplaceRoute', summary: 'Replaces an existing route within a route table.',
    args: { 'route-table-id': 'string', 'destination-cidr-block': 'string', 'gateway-id': 'string', 'nat-gateway-id': 'string' }, required: ['route-table-id', 'destination-cidr-block'],
    run(ctx) { upsertRoute(ctx, true); return null; },
  },
  'delete-route': {
    op: 'DeleteRoute', summary: 'Deletes the specified route from the specified route table.', args: { 'route-table-id': 'string', 'destination-cidr-block': 'string' }, required: ['route-table-id', 'destination-cidr-block'],
    run(ctx) {
      const table = findRouteTable(ctx, ctx.req('route-table-id'));
      ctx.authorize('ec2:DeleteRoute', '*');
      const destination = ctx.req('destination-cidr-block');
      const index = table.routes.findIndex((route) => route.destinationCidrBlock === destination && route.gatewayId !== 'local');
      if (index < 0) throw new AwsError('InvalidRoute.NotFound', `no route with destination-cidr-block ${destination} in route table ${table.routeTableId}`);
      table.routes.splice(index, 1);
      return null;
    },
  },
  'associate-route-table': {
    op: 'AssociateRouteTable', summary: 'Associates a subnet with a route table.', args: { 'route-table-id': 'string', 'subnet-id': 'string' }, required: ['route-table-id', 'subnet-id'],
    run(ctx) {
      const table = findRouteTable(ctx, ctx.req('route-table-id'));
      const subnet = findSubnet(ctx, ctx.req('subnet-id'));
      ctx.authorize('ec2:AssociateRouteTable', '*');
      if (subnet.vpcId !== table.vpcId) throw new AwsError('InvalidParameterValue', `Route table ${table.routeTableId} and subnet ${subnet.subnetId} belong to different networks`);
      const existing = Object.values(ctx.state.ec2.routeTables).find((item) => item.associations.includes(subnet.subnetId));
      if (existing) throw new AwsError('Resource.AlreadyAssociated', `the specified association for route table ${existing.routeTableId} conflicts with an existing association`);
      table.associations.push(subnet.subnetId);
      return json({ AssociationId: associationId(table.routeTableId, subnet.subnetId), AssociationState: { State: 'associated' } });
    },
  },
  'disassociate-route-table': {
    op: 'DisassociateRouteTable', summary: 'Disassociates a subnet from a route table.', args: { 'association-id': 'string' }, required: ['association-id'],
    run(ctx) {
      const id = ctx.req('association-id');
      ctx.authorize('ec2:DisassociateRouteTable', '*');
      for (const table of Object.values(ctx.state.ec2.routeTables)) {
        const subnetId = table.associations.find((item) => associationId(table.routeTableId, item) === id);
        if (subnetId) { table.associations = table.associations.filter((item) => item !== subnetId); return null; }
      }
      throw new AwsError('InvalidAssociationID.NotFound', `The association ID '${id}' does not exist`);
    },
  },
  'create-security-group': {
    op: 'CreateSecurityGroup', summary: 'Creates a security group.', args: { 'group-name': 'string', description: 'string', 'vpc-id': 'string', 'tag-specifications': 'list' }, required: ['group-name', 'description'],
    run(ctx) {
      ctx.authorize('ec2:CreateSecurityGroup', '*');
      const name = ctx.req('group-name');
      const vpcId = ctx.str('vpc-id');
      if (!vpcId) throw new AwsError('VPCIdNotSpecified', 'No default VPC for this user. GroupName is only supported for EC2-Classic and default VPC.');
      const vpc = findVpc(ctx, vpcId);
      if (name.toLowerCase().startsWith('sg-')) throw new AwsError('InvalidParameterValue', 'Group names may not be in the format sg-*.');
      if (Object.values(ctx.state.ec2.securityGroups).some((item) => item.vpcId === vpc.vpcId && item.groupName === name)) throw new AwsError('InvalidGroup.Duplicate', `The security group '${name}' already exists for VPC '${vpc.vpcId}'`);
      const groupId = nextId(ctx.state, 'sg');
      ctx.state.ec2.securityGroups[groupId] = { groupId, groupName: name, description: ctx.req('description'), vpcId: vpc.vpcId, ingress: [], egress: [{ protocol: '-1', fromPort: 0, toPort: 65535, cidr: '0.0.0.0/0' }], region: ctx.region, tags: readTags(ctx) };
      return json({ GroupId: groupId, SecurityGroupArn: ctx.arn('ec2', 'security-group/' + groupId) });
    },
  },
  'describe-security-groups': {
    op: 'DescribeSecurityGroups', summary: 'Describes the specified security groups.', args: { 'group-ids': 'list', 'group-names': 'list', filters: 'list' },
    run(ctx) {
      ctx.authorize('ec2:DescribeSecurityGroups', '*');
      const ids = ctx.list('group-ids');
      ids.forEach((id) => findGroup(ctx, id));
      const names = ctx.list('group-names');
      const filters = readFilters(ctx);
      const groups = Object.values(ctx.state.ec2.securityGroups).filter((group) => group.region === ctx.region && (!ids.length || ids.includes(group.groupId)) && (!names.length || names.includes(group.groupName))
        && matchesFilters(filters, { 'vpc-id': group.vpcId, 'group-name': group.groupName, 'group-id': group.groupId }, group.tags));
      return json({ SecurityGroups: groups.map((group) => groupJson(ctx, group)) });
    },
  },
  'delete-security-group': {
    op: 'DeleteSecurityGroup', summary: 'Deletes a security group.', args: { 'group-id': 'string', 'group-name': 'string' },
    run(ctx) {
      const group = resolveGroup(ctx);
      ctx.authorize('ec2:DeleteSecurityGroup', ctx.arn('ec2', 'security-group/' + group.groupId));
      if (group.groupName === 'default') throw new AwsError('CannotDelete', `the specified group: "${group.groupId}" name: "default" cannot be deleted by a user`);
      const { state } = ctx;
      const used = Object.values(state.ec2.instances).some((item) => item.state !== 'terminated' && item.securityGroupIds.includes(group.groupId))
        || Object.values(state.rds.instances).some((item) => item.vpcSecurityGroupIds.includes(group.groupId))
        || Object.values(state.ec2.securityGroups).some((item) => item.groupId !== group.groupId && [...item.ingress, ...item.egress].some((rule) => rule.sourceGroupId === group.groupId));
      if (used) throw new AwsError('DependencyViolation', `resource ${group.groupId} has a dependent object`);
      delete state.ec2.securityGroups[group.groupId];
      return json({ Return: true, GroupId: group.groupId });
    },
  },
  'authorize-security-group-ingress': {
    op: 'AuthorizeSecurityGroupIngress', summary: 'Adds inbound rules to a security group.',
    args: { 'group-id': 'string', 'group-name': 'string', protocol: 'string', port: 'string', cidr: 'string', 'source-group': 'string', 'ip-permissions': 'string' },
    run(ctx) { return changeRules(ctx, 'ingress', true); },
  },
  'revoke-security-group-ingress': {
    op: 'RevokeSecurityGroupIngress', summary: 'Removes inbound rules from a security group.',
    args: { 'group-id': 'string', 'group-name': 'string', protocol: 'string', port: 'string', cidr: 'string', 'source-group': 'string', 'ip-permissions': 'string' },
    run(ctx) { return changeRules(ctx, 'ingress', false); },
  },
  'authorize-security-group-egress': {
    op: 'AuthorizeSecurityGroupEgress', summary: 'Adds outbound rules to a security group.',
    args: { 'group-id': 'string', protocol: 'string', port: 'string', cidr: 'string', 'source-group': 'string', 'ip-permissions': 'string' }, required: ['group-id'],
    run(ctx) { return changeRules(ctx, 'egress', true); },
  },
  'revoke-security-group-egress': {
    op: 'RevokeSecurityGroupEgress', summary: 'Removes outbound rules from a security group.',
    args: { 'group-id': 'string', protocol: 'string', port: 'string', cidr: 'string', 'source-group': 'string', 'ip-permissions': 'string' }, required: ['group-id'],
    run(ctx) { return changeRules(ctx, 'egress', false); },
  },
  'run-instances': {
    op: 'RunInstances', summary: 'Launches the specified number of instances using an AMI.',
    args: { 'image-id': 'string', 'instance-type': 'string', count: 'string', 'subnet-id': 'string', 'security-group-ids': 'list', 'key-name': 'string', 'associate-public-ip-address': 'bool', 'tag-specifications': 'list', 'user-data': 'string' },
    required: ['image-id'],
    run(ctx) {
      ctx.authorize('ec2:RunInstances', ctx.arn('ec2', 'instance/*'));
      const imageId = ctx.req('image-id');
      if (!/^ami-[0-9a-f]{8,17}$/.test(imageId)) throw new AwsError('InvalidAMIID.Malformed', `Invalid id: "${imageId}" (expecting "ami-...")`);
      const type = ctx.str('instance-type') ?? 'm1.small';
      if (!INSTANCE_TYPES.includes(type)) throw new AwsError('InvalidParameterValue', `Invalid value '${type}' for InstanceType.`);
      const subnetId = ctx.str('subnet-id');
      if (!subnetId) throw new AwsError('VPCIdNotSpecified', 'No default VPC for this user. Specify a subnet with --subnet-id.');
      const subnet = findSubnet(ctx, subnetId);
      let groups = ctx.list('security-group-ids');
      for (const id of groups) {
        const group = findGroup(ctx, id);
        if (group.vpcId !== subnet.vpcId) throw new AwsError('InvalidParameter', `Security group ${id} and subnet ${subnet.subnetId} belong to different networks.`);
      }
      if (!groups.length) groups = Object.values(ctx.state.ec2.securityGroups).filter((item) => item.vpcId === subnet.vpcId && item.groupName === 'default').map((item) => item.groupId);
      const countText = ctx.str('count') ?? '1';
      const count = Number(countText.split(':').pop());
      if (!Number.isInteger(count) || count < 1 || count > 20) throw new AwsError('InvalidParameterValue', `Invalid value '${countText}' for MinCount.`);
      const wantsPublic = ctx.bool('associate-public-ip-address') ?? subnet.mapPublicIpOnLaunch;
      const cidr = parseCidr(subnet.cidrBlock)!;
      const used = Object.values(ctx.state.ec2.instances).filter((item) => item.subnetId === subnet.subnetId).length;
      const tags = readTags(ctx);
      const launched: Instance[] = [];
      for (let i = 0; i < count; i++) {
        const instanceId = nextId(ctx.state, 'i');
        const instance: Instance = {
          instanceId, imageId, instanceType: type, state: 'running', subnetId: subnet.subnetId, vpcId: subnet.vpcId, securityGroupIds: groups,
          privateIp: ipString(cidr.start + 10 + used + i), publicIp: wantsPublic ? publicIp(instanceId) : null, keyName: ctx.str('key-name') ?? null,
          launchTime: now(ctx.state), region: ctx.region, tags: { ...tags },
        };
        ctx.state.ec2.instances[instanceId] = instance;
        launched.push(instance);
      }
      return json({ Groups: [], Instances: launched.map((instance) => instanceJson(ctx, instance, 'pending')), OwnerId: ctx.state.accountId, ReservationId: 'r-0' + hash(launched[0]!.instanceId, 16) });
    },
  },
  'describe-instances': {
    op: 'DescribeInstances', summary: 'Describes the specified instances or all instances.', args: { 'instance-ids': 'list', filters: 'list' },
    run(ctx) {
      ctx.authorize('ec2:DescribeInstances', '*');
      const ids = ctx.list('instance-ids');
      for (const id of ids) if (!ctx.state.ec2.instances[id]) throw new AwsError('InvalidInstanceID.NotFound', `The instance ID '${id}' does not exist`);
      const filters = readFilters(ctx);
      const items = Object.values(ctx.state.ec2.instances).filter((item) => item.region === ctx.region && (!ids.length || ids.includes(item.instanceId))
        && matchesFilters(filters, { 'instance-state-name': item.state, 'instance-type': item.instanceType, 'subnet-id': item.subnetId, 'vpc-id': item.vpcId, 'instance-id': item.instanceId }, item.tags));
      return json({ Reservations: items.map((item) => ({ Groups: [], Instances: [instanceJson(ctx, item)], OwnerId: ctx.state.accountId, ReservationId: 'r-0' + hash(item.instanceId, 16) })) });
    },
  },
  'start-instances': {
    op: 'StartInstances', summary: 'Starts an Amazon EBS-backed instance that you previously stopped.', args: { 'instance-ids': 'list' }, required: ['instance-ids'],
    run(ctx) { return changeInstances(ctx, 'running', 'StartInstances', 'StartingInstances'); },
  },
  'stop-instances': {
    op: 'StopInstances', summary: 'Stops an Amazon EBS-backed instance.', args: { 'instance-ids': 'list' }, required: ['instance-ids'],
    run(ctx) { return changeInstances(ctx, 'stopped', 'StopInstances', 'StoppingInstances'); },
  },
  'terminate-instances': {
    op: 'TerminateInstances', summary: 'Shuts down the specified instances.', args: { 'instance-ids': 'list' }, required: ['instance-ids'],
    run(ctx) { return changeInstances(ctx, 'terminated', 'TerminateInstances', 'TerminatingInstances'); },
  },
  'modify-instance-attribute': {
    op: 'ModifyInstanceAttribute', summary: 'Modifies the specified attribute of the specified instance.', args: { 'instance-id': 'string', 'instance-type': 'string', groups: 'list' }, required: ['instance-id'],
    run(ctx) {
      const instance = ctx.state.ec2.instances[ctx.req('instance-id')];
      if (instance?.region !== ctx.region) throw new AwsError('InvalidInstanceID.NotFound', `The instance ID '${ctx.req('instance-id')}' does not exist`);
      ctx.authorize('ec2:ModifyInstanceAttribute', ctx.arn('ec2', 'instance/' + instance.instanceId));
      const type = ctx.str('instance-type');
      if (type) {
        const value = /^Value=(.+)$/.exec(type)?.[1] ?? type;
        if (!INSTANCE_TYPES.includes(value)) throw new AwsError('InvalidParameterValue', `Invalid value '${value}' for InstanceType.`);
        if (instance.state !== 'stopped') throw new AwsError('IncorrectInstanceState', `The instance '${instance.instanceId}' is not in the 'stopped' state.`);
        instance.instanceType = value;
      }
      const groups = ctx.list('groups');
      if (groups.length) { groups.forEach((id) => findGroup(ctx, id)); instance.securityGroupIds = groups; }
      return null;
    },
  },
  'create-tags': {
    op: 'CreateTags', summary: 'Adds or overwrites tags for the specified resources.', args: { resources: 'list', tags: 'list' }, required: ['resources', 'tags'],
    run(ctx) {
      ctx.authorize('ec2:CreateTags', '*');
      const tags = readTags(ctx);
      const { ec2 } = ctx.state;
      for (const id of ctx.list('resources')) {
        const target = ec2.vpcs[id] ?? ec2.subnets[id] ?? ec2.securityGroups[id] ?? ec2.instances[id] ?? ec2.internetGateways[id] ?? ec2.natGateways[id] ?? ec2.routeTables[id];
        if (!target) throw new AwsError('InvalidID', `The ID '${id}' is not valid`);
        Object.assign(target.tags, tags);
      }
      return null;
    },
  },
};

function upsertRoute(ctx: OpContext, replace: boolean): boolean {
  const table = findRouteTable(ctx, ctx.req('route-table-id'));
  ctx.authorize(replace ? 'ec2:ReplaceRoute' : 'ec2:CreateRoute', ctx.arn('ec2', 'route-table/' + table.routeTableId));
  const destination = ctx.req('destination-cidr-block');
  if (!parseCidr(destination)) throw new AwsError('InvalidParameterValue', `Value (${destination}) for parameter destinationCidrBlock is invalid. This is not a valid CIDR block.`);
  const gatewayId = ctx.str('gateway-id');
  const natGatewayId = ctx.str('nat-gateway-id');
  if (!gatewayId && !natGatewayId) throw new AwsError('InvalidParameterCombination', 'The request must contain exactly one of gatewayId, natGatewayId, networkInterfaceId, vpcPeeringConnectionId or instanceId');
  if (gatewayId) {
    const gateway = ctx.state.ec2.internetGateways[gatewayId];
    if (gateway?.region !== ctx.region) throw new AwsError('InvalidGatewayID.NotFound', `The gateway ID '${gatewayId}' does not exist`);
    if (gateway.vpcId !== table.vpcId) throw new AwsError('InvalidParameterValue', `route table ${table.routeTableId} and network gateway ${gatewayId} belong to different networks`);
  }
  if (natGatewayId) {
    const nat = ctx.state.ec2.natGateways[natGatewayId];
    if (!nat || nat.state === 'deleted' || nat.region !== ctx.region) throw new AwsError('InvalidNatGatewayID.NotFound', `The natGateway ID '${natGatewayId}' does not exist`);
  }
  const index = table.routes.findIndex((route) => route.destinationCidrBlock === destination);
  const route = { destinationCidrBlock: destination, ...(gatewayId ? { gatewayId } : {}), ...(natGatewayId ? { natGatewayId } : {}) };
  if (replace) {
    if (index < 0) throw new AwsError('InvalidRoute.NotFound', `no route with destination-cidr-block ${destination} in route table ${table.routeTableId}`);
    table.routes[index] = route;
  } else {
    if (index >= 0) throw new AwsError('RouteAlreadyExists', `The route identified by ${destination} already exists.`);
    table.routes.push(route);
  }
  return true;
}
