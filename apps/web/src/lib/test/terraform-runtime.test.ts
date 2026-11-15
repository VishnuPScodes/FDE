import { describe, expect, it } from 'vitest';
import { createTfState, runTerraformCommand, type TfState } from '../terraform/engine';
import { gradeTerraformLevel } from '../terraform-grader';

function run(state: TfState, ...lines: string[]) {
  let current = state;
  let last = runTerraformCommand(state, 'terraform version');
  for (const line of lines) { last = runTerraformCommand(current, line); current = last.state; }
  return { ...last, state: current };
}

const BUCKET = 'provider "aws" {\n  region = "ap-south-1"\n}\n\nresource "aws_s3_bucket" "logs" {\n  bucket = "fde-logs-blr"\n  tags = {\n    Env = "dev"\n  }\n}\n';

describe('Terraform simulator', () => {
  it('requires init, then plans and applies a bucket', () => {
    const fresh = createTfState({ 'main.tf': BUCKET });
    expect(run(fresh, 'terraform plan').stderr).toContain('terraform init');
    const planned = run(fresh, 'terraform init', 'terraform plan');
    expect(planned.stdout).toContain('# aws_s3_bucket.logs will be created');
    expect(planned.stdout).toMatch(/\+ bucket\s+= "fde-logs-blr"/);
    expect(planned.stdout).toContain('Plan: 1 to add, 0 to change, 0 to destroy.');
    expect(run(fresh, 'terraform init', 'terraform apply').stderr).toContain('-auto-approve');
    const applied = run(fresh, 'terraform init', 'terraform apply -auto-approve', 'terraform state list');
    expect(applied.stdout).toBe('aws_s3_bucket.logs\n');
    expect(gradeTerraformLevel([{ kind: 'sim_state', path: 'resource:aws_s3_bucket.logs', contains: '"arn":"arn:aws:s3:::fde-logs-blr"' }, { kind: 'sim_state', path: 'plan_clean' }], applied.state).every((c) => c.passed)).toBe(true);
  });

  it('parses variables, locals, interpolation, outputs and tfvars', () => {
    const files = {
      'main.tf': 'variable "env" {\n  type = string\n  default = "dev"\n}\nlocals {\n  prefix = "fde-${var.env}"\n}\nresource "aws_s3_bucket" "a" {\n  bucket = "${local.prefix}-assets"\n}\noutput "arn" {\n  value = aws_s3_bucket.a.arn\n}\n',
      'terraform.tfvars': 'env = "staging"\n',
    };
    const out = run(createTfState(files), 'terraform init', 'terraform apply -auto-approve', 'terraform output arn');
    expect(out.stdout).toContain('"arn:aws:s3:::fde-staging-assets"');
    expect(run(createTfState({ 'main.tf': files['main.tf'] }), 'terraform init', 'terraform apply -auto-approve -var env=prod').stdout).toContain('Apply complete! Resources: 1 added');
  });

  it('shows in-place updates, replacement and no-op plans', () => {
    const base = { 'main.tf': 'resource "aws_instance" "web" {\n  ami = "ami-0aaa"\n  instance_type = "t3.micro"\n  tags = { Name = "web" }\n}\n' };
    const first = run(createTfState(base), 'terraform init', 'terraform apply -auto-approve');
    const id = first.state.resources[0]!.attrs.id;
    expect(run(first.state, 'terraform plan').stdout).toContain('No changes.');
    const small = { ...first.state, files: { ...first.state.files, 'main.tf': base['main.tf'].replace('t3.micro', 't3.small') } };
    const update = run(small, 'terraform plan');
    expect(update.stdout).toContain('~ instance_type = "t3.micro" -> "t3.small"');
    expect(update.stdout).toContain('Plan: 0 to add, 1 to change, 0 to destroy.');
    expect(run(small, 'terraform apply -auto-approve').state.resources[0]!.attrs.id).toBe(id);
    const swapped = { ...first.state, files: { ...first.state.files, 'main.tf': base['main.tf'].replace('ami-0aaa', 'ami-0bbb') } };
    const replace = run(swapped, 'terraform plan');
    expect(replace.stdout).toContain('must be replaced');
    expect(replace.stdout).toContain('# forces replacement');
    expect(replace.stdout).toContain('Plan: 1 to add, 0 to change, 1 to destroy.');
    expect(run(swapped, 'terraform apply -auto-approve').state.resources[0]!.attrs.id).not.toBe(id);
  });

  it('orders dependencies, supports for_each and destroys in reverse', () => {
    const files = { 'main.tf': 'resource "aws_s3_bucket" "team" {\n  for_each = toset(["billing", "orders"])\n  bucket = "fde-${each.key}"\n}\nresource "aws_s3_bucket_public_access_block" "team" {\n  for_each = aws_s3_bucket.team\n  bucket = each.value.id\n  block_public_acls = true\n}\n' };
    const chained = run(createTfState(files), 'terraform init', 'terraform plan');
    expect(chained.stdout).toContain('Plan: 4 to add, 0 to change, 0 to destroy.');
    const unknownKeys = run(createTfState({ 'main.tf': 'resource "aws_instance" "a" {\n  ami = "ami-1"\n  instance_type = "t3.micro"\n}\nresource "aws_s3_bucket" "x" {\n  for_each = toset([aws_instance.a.id])\n  bucket = "fde-${each.key}"\n}\n' }), 'terraform init', 'terraform plan');
    expect(unknownKeys.stderr).toContain('for_each');
    const simple = { 'main.tf': 'resource "aws_s3_bucket" "team" {\n  for_each = toset(["billing", "orders"])\n  bucket = "fde-${each.key}"\n}\nresource "aws_s3_bucket_versioning" "v" {\n  bucket = aws_s3_bucket.team["billing"].id\n  versioning_configuration {\n    status = "Enabled"\n  }\n}\n' };
    const applied = run(createTfState(simple), 'terraform init', 'terraform apply -auto-approve');
    expect(applied.stdout).toContain('aws_s3_bucket.team["billing"]: Creation complete');
    expect(applied.stdout.indexOf('team["billing"]: Creating')).toBeLessThan(applied.stdout.indexOf('aws_s3_bucket_versioning.v: Creating'));
    const destroyed = run(applied.state, 'terraform destroy -auto-approve');
    expect(destroyed.stdout).toContain('Destroy complete! Resources: 3 destroyed.');
    expect(destroyed.stdout.indexOf('aws_s3_bucket_versioning.v: Destroying')).toBeLessThan(destroyed.stdout.indexOf('aws_s3_bucket.team["billing"]: Destroying'));
  });

  it('reports drift, honours prevent_destroy and surfaces apply-time errors', () => {
    const files = { 'main.tf': 'resource "aws_s3_bucket" "b" {\n  bucket = "fde-drift"\n  tags = { Env = "dev" }\n  lifecycle {\n    prevent_destroy = true\n  }\n}\n' };
    const applied = run(createTfState(files), 'terraform init', 'terraform apply -auto-approve');
    const drift = run(applied.state, 'aws-console edit aws_s3_bucket.b tags=\'{"Env":"hacked"}\'', 'terraform plan');
    expect(drift.stdout).toContain('Objects have changed outside of Terraform');
    expect(drift.stdout).toContain('~ "Env" = "hacked" -> "dev"');
    expect(run(applied.state, 'terraform destroy -auto-approve').stderr).toContain('prevent_destroy');
    const taken = run(createTfState({ 'main.tf': 'resource "aws_s3_bucket" "b" {\n  bucket = "test"\n}\n' }), 'terraform init', 'terraform apply -auto-approve');
    expect(taken.stderr).toContain('BucketAlreadyExists');
    expect(taken.state.resources).toHaveLength(0);
  });

  it('validates arguments, references and variable rules', () => {
    const typo = run(createTfState({ 'main.tf': 'resource "aws_s3_bucket" "b" {\n  bucket = "x-bucket"\n  acl = "private"\n}\n' }), 'terraform validate');
    expect(typo.stderr).toContain('Unsupported argument');
    const ref = run(createTfState({ 'main.tf': 'output "o" {\n  value = aws_s3_bucket.none.id\n}\n' }), 'terraform validate');
    expect(ref.stderr).toContain('Reference to undeclared resource');
    const rule = 'variable "n" {\n  default = "ab"\n  validation {\n    condition = length(var.n) > 3\n    error_message = "Name too short."\n  }\n}\n';
    expect(run(createTfState({ 'main.tf': rule }), 'terraform init', 'terraform plan').stderr).toContain('Name too short.');
    expect(run(createTfState({ 'main.tf': 'resource "aws_s3_bucket" "b" {\n  bucket = "oops"\n' }), 'terraform validate').stderr).toContain('Error');
  });

  it('seeds state from terraform.tfstate and supports taint, saved plans and state rm', () => {
    const seed = JSON.stringify({ resources: [{ address: 'aws_s3_bucket.b', type: 'aws_s3_bucket', name: 'b', attrs: { bucket: 'fde-seed', force_destroy: false, tags: {}, id: 'fde-seed', arn: 'arn:aws:s3:::fde-seed', bucket_domain_name: 'fde-seed.s3.amazonaws.com', region: 'ap-south-1' } }] });
    const files = { 'main.tf': 'resource "aws_s3_bucket" "b" {\n  bucket = "fde-seed"\n}\n', 'terraform.tfstate': seed };
    const s = run(createTfState(files), 'terraform init', 'terraform plan');
    expect(s.stdout).toContain('No changes.');
    const tainted = run(s.state, 'terraform taint aws_s3_bucket.b', 'terraform plan -out=tfplan');
    expect(tainted.stdout).toContain('is tainted, so must be replaced');
    expect(run(tainted.state, 'terraform apply tfplan').stdout).toContain('Apply complete! Resources: 1 added, 0 changed, 1 destroyed.');
    const stale = { ...tainted.state, files: { ...tainted.state.files, 'main.tf': `${tainted.state.files['main.tf'] ?? ''}\n# edit\n` } };
    expect(run(stale, 'terraform apply tfplan').stderr).toContain('stale');
    expect(run(s.state, 'terraform state rm aws_s3_bucket.b').state.resources).toHaveLength(0);
  });
});
