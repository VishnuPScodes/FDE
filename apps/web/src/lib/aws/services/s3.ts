/* eslint-disable @typescript-eslint/no-dynamic-delete -- the simulator state is keyed records; delete is the intended removal */
import { AwsError, UsageError, truthy } from '../cli-core';
import { asJson, json, text, type OpContext, type ServiceSpec } from '../context';
import { isPublicPolicy, parsePolicyDocument, PolicyError } from '../iam-policy';
import { hash, now } from '../state';
import type { PublicAccessBlock, S3Bucket } from '../types';

/** Names that "someone else" already owns in the global bucket namespace. */
const TAKEN = new Set(['test', 'backup', 'backups', 'data', 'logs', 'my-bucket', 'invoices', 'uploads', 'images', 'static']);

export const BLOCK_ALL: PublicAccessBlock = { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true };

export function validBucketName(name: string): boolean {
  return /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name) && !name.includes('..') && !/^\d+\.\d+\.\d+\.\d+$/.test(name);
}

export function bucketIsPublic(bucket: S3Bucket): boolean {
  return isPublicPolicy(bucket.policy) && !bucket.publicAccessBlock?.RestrictPublicBuckets;
}

export function getBucket(ctx: OpContext, name: string): S3Bucket {
  const bucket = ctx.state.s3.buckets[name];
  if (!bucket) throw new AwsError('NoSuchBucket', 'The specified bucket does not exist');
  return bucket;
}

/** Shared by `s3 mb`, `s3api create-bucket`, the console form, and Terraform. */
export function createBucket(ctx: OpContext, name: string, region: string): S3Bucket {
  ctx.authorize('s3:CreateBucket', 'arn:aws:s3:::' + name);
  if (!validBucketName(name)) throw new AwsError('InvalidBucketName', 'The specified bucket is not valid.');
  if (ctx.state.s3.buckets[name]) throw new AwsError('BucketAlreadyOwnedByYou', 'Your previous request to create the named bucket succeeded and you already own it.');
  if (TAKEN.has(name)) throw new AwsError('BucketAlreadyExists', 'The requested bucket name is not available. The bucket namespace is shared by all users of the system. Please select a different name and try again.');
  const bucket: S3Bucket = { name, region, creationDate: now(ctx.state), versioning: 'Disabled', publicAccessBlock: { ...BLOCK_ALL }, policy: null, objects: {}, tags: {} };
  ctx.state.s3.buckets[name] = bucket;
  return bucket;
}

function parseS3Uri(value: string): { bucket: string; key: string } | null {
  const match = /^s3:\/\/([^/]+)\/?(.*)$/.exec(value);
  return match ? { bucket: match[1]!, key: match[2] ?? '' } : null;
}

function putObject(ctx: OpContext, bucket: S3Bucket, key: string, content: string): string | undefined {
  ctx.authorize('s3:PutObject', `arn:aws:s3:::${bucket.name}/${key}`, bucket.policy);
  const existing = bucket.objects[key];
  const versions = bucket.versioning === 'Enabled' ? (existing?.versions ?? 0) + 1 : 1;
  bucket.objects[key] = { size: content.length, etag: '"' + hash(content + key, 32) + '"', lastModified: now(ctx.state), versions, content };
  return bucket.versioning === 'Enabled' ? hash(key + String(versions), 32) : undefined;
}

function getObjectContent(ctx: OpContext, bucket: S3Bucket, key: string): string {
  ctx.authorize('s3:GetObject', `arn:aws:s3:::${bucket.name}/${key}`, bucket.policy);
  const object = bucket.objects[key];
  if (!object) throw new AwsError('NoSuchKey', 'The specified key does not exist.');
  return object.content;
}

function deleteObject(ctx: OpContext, bucket: S3Bucket, key: string): void {
  ctx.authorize('s3:DeleteObject', `arn:aws:s3:::${bucket.name}/${key}`, bucket.policy);
  delete bucket.objects[key];
}

function readPolicy(ctx: OpContext, bucket: S3Bucket) {
  let document;
  try {
    document = parsePolicyDocument(ctx.req('policy'), 'resource');
  } catch (error) {
    if (error instanceof PolicyError) throw new AwsError(error.code, error.message);
    throw error;
  }
  for (const statement of document.Statement) {
    const resources = statement.Resource === undefined ? [] : Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
    if (resources.some((resource) => !resource.startsWith('arn:aws:s3:::' + bucket.name))) throw new AwsError('MalformedPolicy', 'Policy has invalid resource');
  }
  return document;
}

/** The friendly `aws s3` commands. Errors print like the real high-level commands. */
export const s3Service: ServiceSpec = {
  mb: {
    op: 'CreateBucket', summary: 'Creates an S3 bucket.',
    run(ctx) {
      const target = parseS3Uri(ctx.args.positionals[0] ?? '');
      if (!target?.bucket) throw new UsageError('<S3Uri>\nError: Invalid argument type');
      try {
        createBucket(ctx, target.bucket, ctx.region);
      } catch (error) {
        if (error instanceof AwsError) throw new HighLevelError(`make_bucket failed: s3://${target.bucket} An error occurred (${error.code}) when calling the CreateBucket operation: ${error.message}`);
        throw error;
      }
      return text(`make_bucket: ${target.bucket}\n`);
    },
  },
  rb: {
    op: 'DeleteBucket', summary: 'Deletes an empty S3 bucket.', args: { force: 'bool' },
    run(ctx) {
      const target = parseS3Uri(ctx.args.positionals[0] ?? '');
      if (!target?.bucket) throw new UsageError('<S3Uri>\nError: Invalid argument type');
      try {
        const bucket = getBucket(ctx, target.bucket);
        ctx.authorize('s3:DeleteBucket', 'arn:aws:s3:::' + bucket.name, bucket.policy);
        const keys = Object.keys(bucket.objects);
        if (keys.length && !ctx.bool('force')) throw new AwsError('BucketNotEmpty', 'The bucket you tried to delete is not empty');
        const lines = keys.map((key) => `delete: s3://${bucket.name}/${key}`);
        keys.forEach((key) => deleteObject(ctx, bucket, key));
        delete ctx.state.s3.buckets[bucket.name];
        return text([...lines, `remove_bucket: ${bucket.name}`].join('\n') + '\n');
      } catch (error) {
        if (error instanceof AwsError) throw new HighLevelError(`remove_bucket failed: s3://${target.bucket} An error occurred (${error.code}) when calling the DeleteBucket operation: ${error.message}`);
        throw error;
      }
    },
  },
  ls: {
    op: 'ListObjectsV2', summary: 'Lists buckets, or objects under a prefix.', args: { recursive: 'bool' },
    run(ctx) {
      const uri = ctx.args.positionals[0];
      if (!uri) {
        ctx.authorize('s3:ListAllMyBuckets', '*');
        return text(Object.values(ctx.state.s3.buckets).map((bucket) => bucket.creationDate.replace('T', ' ').slice(0, 19) + ' ' + bucket.name).join('\n') + (Object.keys(ctx.state.s3.buckets).length ? '\n' : ''));
      }
      const target = parseS3Uri(uri);
      if (!target) throw new UsageError(`Error: Invalid argument type`);
      const bucket = getBucket(ctx, target.bucket);
      ctx.authorize('s3:ListBucket', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      const keys = Object.keys(bucket.objects).filter((key) => key.startsWith(target.key)).sort();
      const lines: string[] = [];
      const prefixes = new Set<string>();
      for (const key of keys) {
        const rest = key.slice(target.key.length);
        if (!ctx.bool('recursive') && rest.includes('/')) { prefixes.add((rest.split('/')[0] ?? '') + '/'); continue; }
        const object = bucket.objects[key]!;
        lines.push(object.lastModified.replace('T', ' ').slice(0, 19) + ' ' + String(object.size).padStart(10) + ' ' + (ctx.bool('recursive') ? key : rest));
      }
      return text([...[...prefixes].map((prefix) => '                           PRE ' + prefix), ...lines].join('\n') + (lines.length || prefixes.size ? '\n' : ''));
    },
  },
  cp: {
    op: 'PutObject', summary: 'Copies a local file to S3, S3 to a local file, or S3 to S3.', args: { recursive: 'bool', sse: 'string' },
    run(ctx) {
      const [source = '', destination = ''] = ctx.args.positionals;
      if (!source || !destination) throw new UsageError('usage: aws s3 cp <LocalPath> <S3Uri> or <S3Uri> <LocalPath> or <S3Uri> <S3Uri>\nError: the following arguments are required: paths');
      const from = parseS3Uri(source);
      const to = parseS3Uri(destination);
      try {
        if (!from && to) {
          const local = source.replace(/^\.\//, '');
          const content = ctx.state.files[local];
          if (content === undefined) throw new HighLevelError(`The user-provided path ${source} does not exist.`);
          const bucket = getBucket(ctx, to.bucket);
          const key = !to.key || to.key.endsWith('/') ? to.key + (local.split('/').pop() ?? '') : to.key;
          putObject(ctx, bucket, key, content);
          return text(`upload: ${source} to s3://${bucket.name}/${key}\n`);
        }
        if (from && !to) {
          const bucket = getBucket(ctx, from.bucket);
          const content = getObjectContent(ctx, bucket, from.key);
          const local = destination === '.' || destination.endsWith('/') ? destination.replace(/^\.\/?/, '') + (from.key.split('/').pop() ?? '') : destination.replace(/^\.\//, '');
          ctx.state.files[local] = content;
          return text(`download: s3://${bucket.name}/${from.key} to ${local}\n`);
        }
        if (from && to) {
          const content = getObjectContent(ctx, getBucket(ctx, from.bucket), from.key);
          const key = !to.key || to.key.endsWith('/') ? to.key + (from.key.split('/').pop() ?? '') : to.key;
          putObject(ctx, getBucket(ctx, to.bucket), key, content);
          return text(`copy: ${source} to s3://${to.bucket}/${key}\n`);
        }
      } catch (error) {
        if (error instanceof AwsError) {
          const op = from && !to ? 'GetObject' : 'PutObject';
          throw new HighLevelError(`${from && !to ? 'download' : 'upload'} failed: ${source} to ${destination} An error occurred (${error.code}) when calling the ${op} operation: ${error.message}`);
        }
        throw error;
      }
      throw new UsageError('Error: Invalid argument type');
    },
  },
  rm: {
    op: 'DeleteObject', summary: 'Deletes an S3 object.', args: { recursive: 'bool' },
    run(ctx) {
      const target = parseS3Uri(ctx.args.positionals[0] ?? '');
      if (!target) throw new UsageError('Error: Invalid argument type');
      const bucket = getBucket(ctx, target.bucket);
      const keys = ctx.bool('recursive') ? Object.keys(bucket.objects).filter((key) => key.startsWith(target.key)) : bucket.objects[target.key] ? [target.key] : [];
      keys.forEach((key) => deleteObject(ctx, bucket, key));
      return text(keys.map((key) => `delete: s3://${bucket.name}/${key}`).join('\n') + (keys.length ? '\n' : ''));
    },
  },
};

/** High-level s3 commands print their own one-line failures and exit 1. */
export class HighLevelError extends Error {}

export const s3apiService: ServiceSpec = {
  'create-bucket': {
    op: 'CreateBucket', summary: 'Creates a new S3 bucket.', args: { bucket: 'string', 'create-bucket-configuration': 'string', acl: 'string' }, required: ['bucket'],
    run(ctx) {
      const config = ctx.struct('create-bucket-configuration');
      const location = typeof config?.LocationConstraint === 'string' ? config.LocationConstraint : undefined;
      if (ctx.region !== 'us-east-1' && !location) throw new AwsError('IllegalLocationConstraintException', 'The unspecified location constraint is incompatible for the region specific endpoint this request was sent to.');
      if (location && location !== ctx.region) throw new AwsError('IllegalLocationConstraintException', `The ${location} location constraint is incompatible for the region specific endpoint this request was sent to.`);
      if (ctx.str('acl')?.startsWith('public')) throw new AwsError('InvalidBucketAclWithBlockPublicAccessError', 'Bucket cannot have public ACLs set with BlockPublicAccess enabled');
      const bucket = createBucket(ctx, ctx.req('bucket'), ctx.region);
      return json({ Location: ctx.region === 'us-east-1' ? '/' + bucket.name : `http://${bucket.name}.s3.amazonaws.com/` });
    },
  },
  'delete-bucket': {
    op: 'DeleteBucket', summary: 'Deletes an empty S3 bucket.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:DeleteBucket', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      if (Object.keys(bucket.objects).length) throw new AwsError('BucketNotEmpty', 'The bucket you tried to delete is not empty');
      delete ctx.state.s3.buckets[bucket.name];
      return null;
    },
  },
  'head-bucket': {
    op: 'HeadBucket', summary: 'Checks whether a bucket exists and you can access it.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = ctx.state.s3.buckets[ctx.req('bucket')];
      if (!bucket) throw new AwsError('404', 'Not Found');
      ctx.authorize('s3:ListBucket', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      return json({ BucketRegion: bucket.region, AccessPointAlias: false });
    },
  },
  'list-buckets': {
    op: 'ListBuckets', summary: 'Lists all buckets owned by the caller.',
    run(ctx) {
      ctx.authorize('s3:ListAllMyBuckets', '*');
      return json({ Buckets: Object.values(ctx.state.s3.buckets).map((bucket) => ({ Name: bucket.name, CreationDate: bucket.creationDate })), Owner: { DisplayName: 'fde-learner', ID: hash(ctx.state.accountId, 64) } });
    },
  },
  'put-public-access-block': {
    op: 'PutPublicAccessBlock', summary: 'Sets the Block Public Access configuration for a bucket.', args: { bucket: 'string', 'public-access-block-configuration': 'string' }, required: ['bucket', 'public-access-block-configuration'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:PutBucketPublicAccessBlock', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      const config = ctx.struct('public-access-block-configuration') ?? {};
      bucket.publicAccessBlock = { BlockPublicAcls: truthy(config.BlockPublicAcls), IgnorePublicAcls: truthy(config.IgnorePublicAcls), BlockPublicPolicy: truthy(config.BlockPublicPolicy), RestrictPublicBuckets: truthy(config.RestrictPublicBuckets) };
      return null;
    },
  },
  'get-public-access-block': {
    op: 'GetPublicAccessBlock', summary: 'Retrieves the Block Public Access configuration for a bucket.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:GetBucketPublicAccessBlock', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      if (!bucket.publicAccessBlock) throw new AwsError('NoSuchPublicAccessBlockConfiguration', 'The public access block configuration was not found');
      return json({ PublicAccessBlockConfiguration: asJson(bucket.publicAccessBlock) });
    },
  },
  'delete-public-access-block': {
    op: 'DeletePublicAccessBlock', summary: 'Removes the Block Public Access configuration for a bucket.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:PutBucketPublicAccessBlock', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      bucket.publicAccessBlock = null;
      return null;
    },
  },
  'put-bucket-versioning': {
    op: 'PutBucketVersioning', summary: 'Sets the versioning state of a bucket.', args: { bucket: 'string', 'versioning-configuration': 'string' }, required: ['bucket', 'versioning-configuration'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:PutBucketVersioning', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      const status = ctx.struct('versioning-configuration')?.Status;
      if (status !== 'Enabled' && status !== 'Suspended') throw new AwsError('MalformedXML', 'The XML you provided was not well-formed or did not validate against our published schema');
      bucket.versioning = status;
      return null;
    },
  },
  'get-bucket-versioning': {
    op: 'GetBucketVersioning', summary: 'Returns the versioning state of a bucket.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:GetBucketVersioning', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      return bucket.versioning === 'Disabled' ? json({}) : json({ Status: bucket.versioning, MFADelete: 'Disabled' });
    },
  },
  'put-bucket-policy': {
    op: 'PutBucketPolicy', summary: 'Applies a bucket policy to a bucket.', args: { bucket: 'string', policy: 'string' }, required: ['bucket', 'policy'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:PutBucketPolicy', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      const document = readPolicy(ctx, bucket);
      if (isPublicPolicy(document) && bucket.publicAccessBlock?.BlockPublicPolicy) {
        throw new AwsError('AccessDenied', `User: ${ctx.callerArn} is not authorized to perform: s3:PutBucketPolicy on resource: "arn:aws:s3:::${bucket.name}" because public policies are blocked by the BlockPublicPolicy block public access setting.`);
      }
      bucket.policy = document;
      return null;
    },
  },
  'get-bucket-policy': {
    op: 'GetBucketPolicy', summary: 'Returns the policy of a bucket.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:GetBucketPolicy', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      if (!bucket.policy) throw new AwsError('NoSuchBucketPolicy', 'The bucket policy does not exist');
      return json({ Policy: JSON.stringify(bucket.policy) });
    },
  },
  'get-bucket-policy-status': {
    op: 'GetBucketPolicyStatus', summary: 'Says whether the bucket is public.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:GetBucketPolicyStatus', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      if (!bucket.policy) throw new AwsError('NoSuchBucketPolicy', 'The bucket policy does not exist');
      return json({ PolicyStatus: { IsPublic: bucketIsPublic(bucket) } });
    },
  },
  'delete-bucket-policy': {
    op: 'DeleteBucketPolicy', summary: 'Deletes the policy of a bucket.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:DeleteBucketPolicy', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      bucket.policy = null;
      return null;
    },
  },
  'get-bucket-encryption': {
    op: 'GetBucketEncryption', summary: 'Returns the default encryption configuration of a bucket.', args: { bucket: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:GetEncryptionConfiguration', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      return json({ ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' }, BucketKeyEnabled: false }] } });
    },
  },
  'put-object': {
    op: 'PutObject', summary: 'Adds an object to a bucket.', args: { bucket: 'string', key: 'string', body: 'string' }, required: ['bucket', 'key'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      const bodyPath = ctx.args.values.body;
      const content = typeof bodyPath === 'string' ? ctx.state.files[bodyPath.replace(/^\.\//, '')] : '';
      if (content === undefined) throw new UsageError(`Error parsing parameter '--body': Blob values must be a path to a file.`);
      const key = ctx.req('key');
      const versionId = putObject(ctx, bucket, key, content);
      return json({ ETag: bucket.objects[key]!.etag, ServerSideEncryption: 'AES256', ...(versionId ? { VersionId: versionId } : {}) });
    },
  },
  'get-object': {
    op: 'GetObject', summary: 'Retrieves an object and writes it to a local file.', args: { bucket: 'string', key: 'string' }, required: ['bucket', 'key'],
    run(ctx) {
      const outfile = ctx.args.positionals[0];
      if (!outfile) throw new UsageError('aws: error: the following arguments are required: outfile');
      const bucket = getBucket(ctx, ctx.req('bucket'));
      const key = ctx.req('key');
      ctx.state.files[outfile] = getObjectContent(ctx, bucket, key);
      const object = bucket.objects[key]!;
      return json({ AcceptRanges: 'bytes', LastModified: object.lastModified, ContentLength: object.size, ETag: object.etag, ContentType: 'binary/octet-stream', ServerSideEncryption: 'AES256' });
    },
  },
  'delete-object': {
    op: 'DeleteObject', summary: 'Removes an object from a bucket.', args: { bucket: 'string', key: 'string' }, required: ['bucket', 'key'],
    run(ctx) {
      deleteObject(ctx, getBucket(ctx, ctx.req('bucket')), ctx.req('key'));
      return null;
    },
  },
  'list-objects-v2': {
    op: 'ListObjectsV2', summary: 'Lists objects in a bucket.', args: { bucket: 'string', prefix: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:ListBucket', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      const prefix = ctx.str('prefix') ?? '';
      const keys = Object.keys(bucket.objects).filter((key) => key.startsWith(prefix)).sort();
      return json({
        ...(keys.length ? { Contents: keys.map((key) => ({ Key: key, LastModified: bucket.objects[key]!.lastModified, ETag: bucket.objects[key]!.etag, Size: bucket.objects[key]!.size, StorageClass: 'STANDARD' })) } : {}),
        RequestCharged: null, Prefix: prefix, KeyCount: keys.length,
      });
    },
  },
  'list-object-versions': {
    op: 'ListObjectVersions', summary: 'Lists object versions in a bucket.', args: { bucket: 'string', prefix: 'string' }, required: ['bucket'],
    run(ctx) {
      const bucket = getBucket(ctx, ctx.req('bucket'));
      ctx.authorize('s3:ListBucketVersions', 'arn:aws:s3:::' + bucket.name, bucket.policy);
      const versions = Object.entries(bucket.objects).flatMap(([key, object]) => Array.from({ length: object.versions }, (_, index) => ({
        ETag: object.etag, Size: object.size, StorageClass: 'STANDARD', Key: key,
        VersionId: bucket.versioning === 'Disabled' ? 'null' : hash(key + String(index + 1), 32), IsLatest: index === object.versions - 1, LastModified: object.lastModified,
      })));
      return json({ Versions: versions, Name: bucket.name, Prefix: ctx.str('prefix') ?? '' });
    },
  },
};
