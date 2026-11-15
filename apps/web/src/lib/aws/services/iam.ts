/* eslint-disable @typescript-eslint/no-dynamic-delete -- the simulator state is keyed records; delete is the intended removal */
import { AwsError } from '../cli-core';
import { asJson, json, readTags, tagList, type OpContext, type ServiceSpec } from '../context';
import { evaluate, parsePolicyDocument, PolicyError, trustAllows } from '../iam-policy';
import { hash, now } from '../state';
import type { IamRole, IamUser, ManagedPolicy, PolicyDocument, Principal } from '../types';

const NAME = /^[\w+=,.@-]{1,64}$/;

function policyDoc(ctx: OpContext, name: string, kind: 'identity' | 'trust'): PolicyDocument {
  try {
    return parsePolicyDocument(ctx.req(name), kind);
  } catch (error) {
    if (error instanceof PolicyError) throw new AwsError(error.code, error.message);
    throw error;
  }
}

function checkName(value: string, field: string): void {
  if (!NAME.test(value)) throw new AwsError('ValidationError', `1 validation error detected: Value '${value}' at '${field}' failed to satisfy constraint: Member must satisfy regular expression pattern: [\\w+=,.@-]+`);
}

export function getUser(ctx: OpContext, name: string): IamUser {
  const user = ctx.state.iam.users[name];
  if (!user) throw new AwsError('NoSuchEntity', `The user with name ${name} cannot be found.`);
  return user;
}

export function getRole(ctx: OpContext, name: string): IamRole {
  const role = ctx.state.iam.roles[name];
  if (!role) throw new AwsError('NoSuchEntity', `The role with name ${name} cannot be found.`);
  return role;
}

export function policyByArn(ctx: OpContext, arn: string): ManagedPolicy {
  const policy = Object.values(ctx.state.iam.policies).find((item) => item.arn === arn);
  if (!policy) throw new AwsError('NoSuchEntity', `Policy ${arn} does not exist or is not attachable.`);
  return policy;
}

const userJson = (user: IamUser) => ({ Path: '/', UserName: user.name, UserId: user.userId, Arn: user.arn, CreateDate: user.createDate, ...(Object.keys(user.tags).length ? { Tags: tagList(user.tags) } : {}) });
const roleJson = (role: IamRole) => ({
  Path: '/', RoleName: role.name, RoleId: role.roleId, Arn: role.arn, CreateDate: role.createDate,
  AssumeRolePolicyDocument: asJson(role.assumeRolePolicy), Description: role.description, MaxSessionDuration: 3600,
});
const policyJson = (ctx: OpContext, policy: ManagedPolicy) => ({
  PolicyName: policy.name, PolicyId: policy.policyId, Arn: policy.arn, Path: policy.awsManaged && policy.arn.includes('service-role') ? '/service-role/' : '/',
  DefaultVersionId: 'v1', AttachmentCount: attachmentCount(ctx, policy.arn), PermissionsBoundaryUsageCount: 0, IsAttachable: true,
  Description: policy.description, CreateDate: policy.createDate, UpdateDate: policy.createDate,
});

function attachmentCount(ctx: OpContext, arn: string): number {
  return [...Object.values(ctx.state.iam.users), ...Object.values(ctx.state.iam.roles)].filter((entity) => entity.attachedPolicies.includes(arn)).length;
}

/** Turn an IAM ARN into a principal: user/name or role/name. */
export function principalFromArn(ctx: OpContext, arn: string): Principal {
  const match = /^arn:aws:iam::\d{12}:(user|role)\/(?:.*\/)?([\w+=,.@-]+)$/.exec(arn);
  if (!match) throw new AwsError('InvalidInput', `Invalid ARN: ${arn}`);
  if (match[1] === 'user') { getUser(ctx, match[2]!); return { kind: 'user', name: match[2]! }; }
  getRole(ctx, match[2]!);
  return { kind: 'role', name: match[2]!, session: 'simulation' };
}

function attach(ctx: OpContext, entity: IamUser | IamRole, kind: 'user' | 'role'): void {
  const arn = ctx.req('policy-arn');
  ctx.authorize(kind === 'user' ? 'iam:AttachUserPolicy' : 'iam:AttachRolePolicy', entity.arn);
  policyByArn(ctx, arn);
  if (!entity.attachedPolicies.includes(arn)) entity.attachedPolicies.push(arn);
}

function detach(ctx: OpContext, entity: IamUser | IamRole, kind: 'user' | 'role'): void {
  const arn = ctx.req('policy-arn');
  ctx.authorize(kind === 'user' ? 'iam:DetachUserPolicy' : 'iam:DetachRolePolicy', entity.arn);
  if (!entity.attachedPolicies.includes(arn)) throw new AwsError('NoSuchEntity', `Policy ${arn} was not found.`);
  entity.attachedPolicies = entity.attachedPolicies.filter((item) => item !== arn);
}

function putInline(ctx: OpContext, entity: IamUser | IamRole, kind: 'user' | 'role'): void {
  const name = ctx.req('policy-name');
  checkName(name, 'policyName');
  ctx.authorize(kind === 'user' ? 'iam:PutUserPolicy' : 'iam:PutRolePolicy', entity.arn);
  entity.inlinePolicies[name] = policyDoc(ctx, 'policy-document', 'identity');
}

function getInline(ctx: OpContext, entity: IamUser | IamRole, kind: 'user' | 'role') {
  const name = ctx.req('policy-name');
  const document = entity.inlinePolicies[name];
  if (!document) throw new AwsError('NoSuchEntity', `The ${kind} policy with name ${name} cannot be found.`);
  return json({ [kind === 'user' ? 'UserName' : 'RoleName']: entity.name, PolicyName: name, PolicyDocument: asJson(document) });
}

function deleteInline(ctx: OpContext, entity: IamUser | IamRole, kind: 'user' | 'role'): void {
  const name = ctx.req('policy-name');
  ctx.authorize(kind === 'user' ? 'iam:DeleteUserPolicy' : 'iam:DeleteRolePolicy', entity.arn);
  if (!entity.inlinePolicies[name]) throw new AwsError('NoSuchEntity', `The ${kind} policy with name ${name} cannot be found.`);
  delete entity.inlinePolicies[name];
}

export const iamService: ServiceSpec = {
  'create-user': {
    op: 'CreateUser', summary: 'Creates a new IAM user for your AWS account.',
    args: { 'user-name': 'string', tags: 'list' }, required: ['user-name'],
    run(ctx) {
      const name = ctx.req('user-name');
      checkName(name, 'userName');
      const arn = `arn:aws:iam::${ctx.state.accountId}:user/${name}`;
      ctx.authorize('iam:CreateUser', arn);
      if (ctx.state.iam.users[name]) throw new AwsError('EntityAlreadyExists', `User with name ${name} already exists.`);
      const user: IamUser = { name, arn, userId: 'AIDA' + hash('user:' + name, 17).toUpperCase(), createDate: now(ctx.state), attachedPolicies: [], inlinePolicies: {}, accessKeys: [], tags: readTags(ctx) };
      ctx.state.iam.users[name] = user;
      return json({ User: userJson(user) });
    },
  },
  'get-user': {
    op: 'GetUser', summary: 'Retrieves information about the specified IAM user.', args: { 'user-name': 'string' },
    run(ctx) {
      const name = ctx.str('user-name') ?? (ctx.principal.kind === 'user' ? ctx.principal.name : '');
      if (!name) throw new AwsError('ValidationError', 'Must specify userName when calling with non-User credentials');
      const user = getUser(ctx, name);
      ctx.authorize('iam:GetUser', user.arn);
      return json({ User: userJson(user) });
    },
  },
  'list-users': {
    op: 'ListUsers', summary: 'Lists the IAM users in the account.',
    run(ctx) {
      ctx.authorize('iam:ListUsers', `arn:aws:iam::${ctx.state.accountId}:user/`);
      return json({ Users: Object.values(ctx.state.iam.users).map(userJson) });
    },
  },
  'delete-user': {
    op: 'DeleteUser', summary: 'Deletes the specified IAM user.', args: { 'user-name': 'string' }, required: ['user-name'],
    run(ctx) {
      const user = getUser(ctx, ctx.req('user-name'));
      ctx.authorize('iam:DeleteUser', user.arn);
      if (user.attachedPolicies.length || Object.keys(user.inlinePolicies).length || user.accessKeys.length) {
        throw new AwsError('DeleteConflict', 'Cannot delete entity, must remove access keys and detach all policies first.');
      }
      delete ctx.state.iam.users[user.name];
      return null;
    },
  },
  'create-access-key': {
    op: 'CreateAccessKey', summary: 'Creates a new secret access key and access key ID for a user.', args: { 'user-name': 'string' },
    run(ctx) {
      const name = ctx.str('user-name') ?? (ctx.principal.kind === 'user' ? ctx.principal.name : '');
      const user = getUser(ctx, name);
      ctx.authorize('iam:CreateAccessKey', user.arn);
      if (user.accessKeys.length >= 2) throw new AwsError('LimitExceeded', 'Cannot exceed quota for AccessKeysPerUser: 2');
      const id = 'AKIAFDESIM' + String(Object.keys(ctx.state.iam.accessKeys).length + 1).padStart(10, '0');
      user.accessKeys.push(id);
      ctx.state.iam.accessKeys[id] = user.name;
      return json({ AccessKey: { UserName: user.name, AccessKeyId: id, Status: 'Active', SecretAccessKey: 'sim/' + hash(id, 36), CreateDate: now(ctx.state) } });
    },
  },
  'list-access-keys': {
    op: 'ListAccessKeys', summary: 'Lists the access key IDs for a user.', args: { 'user-name': 'string' },
    run(ctx) {
      const name = ctx.str('user-name') ?? (ctx.principal.kind === 'user' ? ctx.principal.name : '');
      const user = getUser(ctx, name);
      ctx.authorize('iam:ListAccessKeys', user.arn);
      return json({ AccessKeyMetadata: user.accessKeys.map((id) => ({ UserName: user.name, AccessKeyId: id, Status: 'Active', CreateDate: user.createDate })) });
    },
  },
  'create-role': {
    op: 'CreateRole', summary: 'Creates a new role for your AWS account.',
    args: { 'role-name': 'string', 'assume-role-policy-document': 'string', description: 'string', tags: 'list' }, required: ['role-name', 'assume-role-policy-document'],
    run(ctx) {
      const name = ctx.req('role-name');
      checkName(name, 'roleName');
      const arn = `arn:aws:iam::${ctx.state.accountId}:role/${name}`;
      ctx.authorize('iam:CreateRole', arn);
      if (ctx.state.iam.roles[name]) throw new AwsError('EntityAlreadyExists', `Role with name ${name} already exists.`);
      const role: IamRole = {
        name, arn, roleId: 'AROA' + hash('role:' + name, 17).toUpperCase(), createDate: now(ctx.state), description: ctx.str('description') ?? '',
        assumeRolePolicy: policyDoc(ctx, 'assume-role-policy-document', 'trust'), attachedPolicies: [], inlinePolicies: {}, tags: readTags(ctx),
      };
      ctx.state.iam.roles[name] = role;
      return json({ Role: roleJson(role) });
    },
  },
  'get-role': {
    op: 'GetRole', summary: 'Retrieves information about the specified role.', args: { 'role-name': 'string' }, required: ['role-name'],
    run(ctx) {
      const role = getRole(ctx, ctx.req('role-name'));
      ctx.authorize('iam:GetRole', role.arn);
      return json({ Role: roleJson(role) });
    },
  },
  'list-roles': {
    op: 'ListRoles', summary: 'Lists the IAM roles in the account.',
    run(ctx) {
      ctx.authorize('iam:ListRoles', `arn:aws:iam::${ctx.state.accountId}:role/`);
      return json({ Roles: Object.values(ctx.state.iam.roles).map(roleJson) });
    },
  },
  'delete-role': {
    op: 'DeleteRole', summary: 'Deletes the specified role.', args: { 'role-name': 'string' }, required: ['role-name'],
    run(ctx) {
      const role = getRole(ctx, ctx.req('role-name'));
      ctx.authorize('iam:DeleteRole', role.arn);
      if (role.attachedPolicies.length || Object.keys(role.inlinePolicies).length) throw new AwsError('DeleteConflict', 'Cannot delete entity, must detach all policies first.');
      delete ctx.state.iam.roles[role.name];
      return null;
    },
  },
  'update-assume-role-policy': {
    op: 'UpdateAssumeRolePolicy', summary: 'Updates the trust policy of a role.', args: { 'role-name': 'string', 'policy-document': 'string' }, required: ['role-name', 'policy-document'],
    run(ctx) {
      const role = getRole(ctx, ctx.req('role-name'));
      ctx.authorize('iam:UpdateAssumeRolePolicy', role.arn);
      role.assumeRolePolicy = policyDoc(ctx, 'policy-document', 'trust');
      return null;
    },
  },
  'create-policy': {
    op: 'CreatePolicy', summary: 'Creates a new managed policy for your AWS account.',
    args: { 'policy-name': 'string', 'policy-document': 'string', description: 'string', tags: 'list' }, required: ['policy-name', 'policy-document'],
    run(ctx) {
      const name = ctx.req('policy-name');
      checkName(name, 'policyName');
      const arn = `arn:aws:iam::${ctx.state.accountId}:policy/${name}`;
      ctx.authorize('iam:CreatePolicy', arn);
      if (ctx.state.iam.policies[name]) throw new AwsError('EntityAlreadyExists', `A policy called ${name} already exists. Duplicate names are not allowed.`);
      const policy: ManagedPolicy = { name, arn, policyId: 'ANPA' + hash('policy:' + name, 17).toUpperCase(), awsManaged: false, description: ctx.str('description') ?? '', createDate: now(ctx.state), document: policyDoc(ctx, 'policy-document', 'identity') };
      ctx.state.iam.policies[name] = policy;
      return json({ Policy: policyJson(ctx, policy) });
    },
  },
  'create-policy-version': {
    op: 'CreatePolicyVersion', summary: 'Creates a new version of a managed policy.',
    args: { 'policy-arn': 'string', 'policy-document': 'string', 'set-as-default': 'bool' }, required: ['policy-arn', 'policy-document'],
    run(ctx) {
      const policy = policyByArn(ctx, ctx.req('policy-arn'));
      ctx.authorize('iam:CreatePolicyVersion', policy.arn);
      if (policy.awsManaged) throw new AwsError('AccessDenied', 'You cannot change an AWS managed policy.');
      const document = policyDoc(ctx, 'policy-document', 'identity');
      if (ctx.bool('set-as-default')) policy.document = document;
      return json({ PolicyVersion: { VersionId: 'v2', IsDefaultVersion: Boolean(ctx.bool('set-as-default')), CreateDate: now(ctx.state) } });
    },
  },
  'get-policy': {
    op: 'GetPolicy', summary: 'Retrieves information about the specified managed policy.', args: { 'policy-arn': 'string' }, required: ['policy-arn'],
    run(ctx) {
      const policy = policyByArn(ctx, ctx.req('policy-arn'));
      ctx.authorize('iam:GetPolicy', policy.arn);
      return json({ Policy: policyJson(ctx, policy) });
    },
  },
  'get-policy-version': {
    op: 'GetPolicyVersion', summary: 'Retrieves the document of a managed policy version.', args: { 'policy-arn': 'string', 'version-id': 'string' }, required: ['policy-arn', 'version-id'],
    run(ctx) {
      const policy = policyByArn(ctx, ctx.req('policy-arn'));
      ctx.authorize('iam:GetPolicyVersion', policy.arn);
      return json({ PolicyVersion: { Document: asJson(policy.document), VersionId: ctx.req('version-id'), IsDefaultVersion: true, CreateDate: policy.createDate } });
    },
  },
  'list-policies': {
    op: 'ListPolicies', summary: 'Lists managed policies.', args: { scope: 'string', 'only-attached': 'bool' },
    run(ctx) {
      ctx.authorize('iam:ListPolicies', `arn:aws:iam::${ctx.state.accountId}:policy/`);
      const scope = ctx.str('scope') ?? 'All';
      if (!['All', 'AWS', 'Local'].includes(scope)) throw new AwsError('ValidationError', `1 validation error detected: Value '${scope}' at 'scope' failed to satisfy constraint: Member must satisfy enum value set: [All, AWS, Local]`);
      const policies = Object.values(ctx.state.iam.policies).filter((policy) => (scope === 'All' || (scope === 'AWS') === policy.awsManaged)
        && (!ctx.bool('only-attached') || attachmentCount(ctx, policy.arn) > 0));
      return json({ Policies: policies.map((policy) => policyJson(ctx, policy)) });
    },
  },
  'delete-policy': {
    op: 'DeletePolicy', summary: 'Deletes a customer managed policy.', args: { 'policy-arn': 'string' }, required: ['policy-arn'],
    run(ctx) {
      const policy = policyByArn(ctx, ctx.req('policy-arn'));
      ctx.authorize('iam:DeletePolicy', policy.arn);
      if (policy.awsManaged) throw new AwsError('AccessDenied', 'You cannot delete an AWS managed policy.');
      if (attachmentCount(ctx, policy.arn)) throw new AwsError('DeleteConflict', 'Cannot delete a policy attached to entities.');
      delete ctx.state.iam.policies[policy.name];
      return null;
    },
  },
  'attach-user-policy': {
    op: 'AttachUserPolicy', summary: 'Attaches a managed policy to a user.', args: { 'user-name': 'string', 'policy-arn': 'string' }, required: ['user-name', 'policy-arn'],
    run(ctx) { attach(ctx, getUser(ctx, ctx.req('user-name')), 'user'); return null; },
  },
  'detach-user-policy': {
    op: 'DetachUserPolicy', summary: 'Removes a managed policy from a user.', args: { 'user-name': 'string', 'policy-arn': 'string' }, required: ['user-name', 'policy-arn'],
    run(ctx) { detach(ctx, getUser(ctx, ctx.req('user-name')), 'user'); return null; },
  },
  'attach-role-policy': {
    op: 'AttachRolePolicy', summary: 'Attaches a managed policy to a role.', args: { 'role-name': 'string', 'policy-arn': 'string' }, required: ['role-name', 'policy-arn'],
    run(ctx) { attach(ctx, getRole(ctx, ctx.req('role-name')), 'role'); return null; },
  },
  'detach-role-policy': {
    op: 'DetachRolePolicy', summary: 'Removes a managed policy from a role.', args: { 'role-name': 'string', 'policy-arn': 'string' }, required: ['role-name', 'policy-arn'],
    run(ctx) { detach(ctx, getRole(ctx, ctx.req('role-name')), 'role'); return null; },
  },
  'list-attached-user-policies': {
    op: 'ListAttachedUserPolicies', summary: 'Lists managed policies attached to a user.', args: { 'user-name': 'string' }, required: ['user-name'],
    run(ctx) {
      const user = getUser(ctx, ctx.req('user-name'));
      ctx.authorize('iam:ListAttachedUserPolicies', user.arn);
      return json({ AttachedPolicies: user.attachedPolicies.map((arn) => ({ PolicyName: arn.split('/').pop() ?? arn, PolicyArn: arn })) });
    },
  },
  'list-attached-role-policies': {
    op: 'ListAttachedRolePolicies', summary: 'Lists managed policies attached to a role.', args: { 'role-name': 'string' }, required: ['role-name'],
    run(ctx) {
      const role = getRole(ctx, ctx.req('role-name'));
      ctx.authorize('iam:ListAttachedRolePolicies', role.arn);
      return json({ AttachedPolicies: role.attachedPolicies.map((arn) => ({ PolicyName: arn.split('/').pop() ?? arn, PolicyArn: arn })) });
    },
  },
  'put-user-policy': {
    op: 'PutUserPolicy', summary: 'Adds or updates an inline policy on a user.', args: { 'user-name': 'string', 'policy-name': 'string', 'policy-document': 'string' }, required: ['user-name', 'policy-name', 'policy-document'],
    run(ctx) { putInline(ctx, getUser(ctx, ctx.req('user-name')), 'user'); return null; },
  },
  'put-role-policy': {
    op: 'PutRolePolicy', summary: 'Adds or updates an inline policy on a role.', args: { 'role-name': 'string', 'policy-name': 'string', 'policy-document': 'string' }, required: ['role-name', 'policy-name', 'policy-document'],
    run(ctx) { putInline(ctx, getRole(ctx, ctx.req('role-name')), 'role'); return null; },
  },
  'get-user-policy': {
    op: 'GetUserPolicy', summary: 'Retrieves an inline policy on a user.', args: { 'user-name': 'string', 'policy-name': 'string' }, required: ['user-name', 'policy-name'],
    run(ctx) { return getInline(ctx, getUser(ctx, ctx.req('user-name')), 'user'); },
  },
  'get-role-policy': {
    op: 'GetRolePolicy', summary: 'Retrieves an inline policy on a role.', args: { 'role-name': 'string', 'policy-name': 'string' }, required: ['role-name', 'policy-name'],
    run(ctx) { return getInline(ctx, getRole(ctx, ctx.req('role-name')), 'role'); },
  },
  'delete-user-policy': {
    op: 'DeleteUserPolicy', summary: 'Deletes an inline policy from a user.', args: { 'user-name': 'string', 'policy-name': 'string' }, required: ['user-name', 'policy-name'],
    run(ctx) { deleteInline(ctx, getUser(ctx, ctx.req('user-name')), 'user'); return null; },
  },
  'delete-role-policy': {
    op: 'DeleteRolePolicy', summary: 'Deletes an inline policy from a role.', args: { 'role-name': 'string', 'policy-name': 'string' }, required: ['role-name', 'policy-name'],
    run(ctx) { deleteInline(ctx, getRole(ctx, ctx.req('role-name')), 'role'); return null; },
  },
  'list-user-policies': {
    op: 'ListUserPolicies', summary: 'Lists inline policy names on a user.', args: { 'user-name': 'string' }, required: ['user-name'],
    run(ctx) { const user = getUser(ctx, ctx.req('user-name')); ctx.authorize('iam:ListUserPolicies', user.arn); return json({ PolicyNames: Object.keys(user.inlinePolicies) }); },
  },
  'list-role-policies': {
    op: 'ListRolePolicies', summary: 'Lists inline policy names on a role.', args: { 'role-name': 'string' }, required: ['role-name'],
    run(ctx) { const role = getRole(ctx, ctx.req('role-name')); ctx.authorize('iam:ListRolePolicies', role.arn); return json({ PolicyNames: Object.keys(role.inlinePolicies) }); },
  },
  'simulate-principal-policy': {
    op: 'SimulatePrincipalPolicy', summary: 'Simulates how the policies attached to a user or role work with a list of actions and resources.',
    args: { 'policy-source-arn': 'string', 'action-names': 'list', 'resource-arns': 'list' }, required: ['policy-source-arn', 'action-names'],
    run(ctx) {
      const source = ctx.req('policy-source-arn');
      ctx.authorize('iam:SimulatePrincipalPolicy', source);
      const principal = principalFromArn(ctx, source);
      const resources = ctx.list('resource-arns');
      const results = ctx.list('action-names').flatMap((action) => (resources.length ? resources : ['*']).map((resource) => {
        const result = evaluate(ctx.state, principal, action, resource, resourceArnPolicy(ctx, resource));
        return {
          EvalActionName: action, EvalResourceName: resource, EvalDecision: result.decision,
          MatchedStatements: result.matched.map((id) => ({ SourcePolicyId: id, SourcePolicyType: id === 'resource-policy' ? 'resource' : 'IAM Policy' })),
          MissingContextValues: [],
        };
      }));
      return json({ EvaluationResults: results, IsTruncated: false });
    },
  },
};

/** Bucket policies are taken into account when simulating S3 actions. */
function resourceArnPolicy(ctx: OpContext, resource: string): PolicyDocument | null {
  const match = /^arn:aws:s3:::([^/]+)/.exec(resource);
  return match ? ctx.state.s3.buckets[match[1]!]?.policy ?? null : null;
}

export const stsService: ServiceSpec = {
  'get-caller-identity': {
    op: 'GetCallerIdentity', summary: 'Returns details about the IAM identity whose credentials are used to call the operation.',
    run(ctx) {
      const principal = ctx.principal;
      const userId = principal.kind === 'user' ? ctx.state.iam.users[principal.name]?.userId ?? '' : principal.kind === 'role' ? (ctx.state.iam.roles[principal.name]?.roleId ?? '') + ':' + principal.session : principal.name;
      return json({ UserId: userId, Account: ctx.state.accountId, Arn: ctx.callerArn });
    },
  },
  'assume-role': {
    op: 'AssumeRole', summary: 'Returns temporary security credentials for a role.',
    args: { 'role-arn': 'string', 'role-session-name': 'string', 'duration-seconds': 'int' }, required: ['role-arn', 'role-session-name'],
    run(ctx) {
      const arn = ctx.req('role-arn');
      const name = arn.split('/').pop() ?? '';
      const role = ctx.state.iam.roles[name];
      ctx.authorize('sts:AssumeRole', arn);
      if (!role || !trustAllows(ctx.state, role.assumeRolePolicy, ctx.principal)) {
        throw new AwsError('AccessDenied', `User: ${ctx.callerArn} is not authorized to perform: sts:AssumeRole on resource: ${arn}`);
      }
      const session = ctx.req('role-session-name');
      return json({
        Credentials: { AccessKeyId: 'ASIAFDESIM' + hash(session, 10).toUpperCase(), SecretAccessKey: 'sim/' + hash(arn, 36), SessionToken: 'FwoGZXIvYXdzE' + hash(session + arn, 40), Expiration: '2026-11-09T05:30:00+00:00' },
        AssumedRoleUser: { AssumedRoleId: role.roleId + ':' + session, Arn: `arn:aws:sts::${ctx.state.accountId}:assumed-role/${role.name}/${session}` },
      });
    },
  },
};
