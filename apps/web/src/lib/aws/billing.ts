import type { AwsState } from './types';

/** Approximate ap-south-1 (Mumbai) on-demand prices in rupees per hour. */
export const HOURLY_INR: Record<string, number> = {
  't2.micro': 1.1, 't3.nano': 0.45, 't3.micro': 0.9, 't3.small': 1.8, 't3.medium': 3.6, 't3.large': 7.2,
  't4g.micro': 0.75, 't4g.small': 1.5, 'm5.large': 8.6, 'm5.xlarge': 17.2, 'c5.large': 7.6, 'r5.large': 11.3,
};
const HOURS_PER_MONTH = 730;
const EBS_8GB_INR = 61;
const NAT_GATEWAY_INR_PER_HOUR = 4.7;
const IDLE_ELASTIC_IP_INR_PER_HOUR = 0.42;
const S3_INR_PER_GB = 2;

export interface BillLine { item: string; inr: number }

export function estimateBill(state: AwsState): { lines: BillLine[]; total: number } {
  const lines: BillLine[] = [];
  for (const instance of Object.values(state.ec2.instances)) {
    if (instance.state === 'terminated') continue;
    const name = instance.tags.Name ?? instance.instanceId;
    if (instance.state === 'running') lines.push({ item: `EC2 ${instance.instanceType} (${name}) running`, inr: (HOURLY_INR[instance.instanceType] ?? 2) * HOURS_PER_MONTH });
    lines.push({ item: `EBS disk for ${name}${instance.state === 'stopped' ? ' (stopped, disk still billed)' : ''}`, inr: EBS_8GB_INR });
  }
  for (const nat of Object.values(state.ec2.natGateways)) {
    if (nat.state !== 'deleted') lines.push({ item: `NAT gateway ${nat.natGatewayId}`, inr: NAT_GATEWAY_INR_PER_HOUR * HOURS_PER_MONTH });
  }
  for (const address of Object.values(state.ec2.addresses)) {
    if (!address.instanceId && !address.natGatewayId) lines.push({ item: `Idle Elastic IP ${address.publicIp}`, inr: IDLE_ELASTIC_IP_INR_PER_HOUR * HOURS_PER_MONTH });
  }
  for (const bucket of Object.values(state.s3.buckets)) {
    const bytes = Object.values(bucket.objects).reduce((sum, object) => sum + object.size, 0);
    if (bytes) lines.push({ item: `S3 ${bucket.name}`, inr: (bytes / 1024 ** 3) * S3_INR_PER_GB });
  }
  const total = Math.round(lines.reduce((sum, line) => sum + line.inr, 0));
  return { lines: lines.map((line) => ({ ...line, inr: Math.round(line.inr) })), total };
}
