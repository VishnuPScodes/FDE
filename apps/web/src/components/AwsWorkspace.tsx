import { useTerminalInput } from '../hooks/useTerminalInput';
import { AWS_COMMANDS } from '../lib/terminal-vocab';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLevelSubmission } from '../hooks/useLevelSubmission';
import { estimateBill } from '../lib/aws/billing';
import { createLevelState, runAwsCommand } from '../lib/aws/run';
import { isPublicSubnet } from '../lib/aws/services/ec2';
import type { AwsState } from '../lib/aws/types';
import { gradeAwsLevel } from '../lib/aws-grader';
import type { LevelMeta } from '../lib/content-loader';
import CheckResultsPanel from './CheckResultsPanel';
import styles from './AwsWorkspace.module.css';
import { useSubmitShortcut, submitButtonProps } from '../hooks/useSubmitShortcut';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }

interface Saved { state: AwsState; transcript: string; commands: string[] }

const WELCOME = 'AWS CloudShell (simulated) - region ap-south-1 (Mumbai)\nType an aws command, for example: aws sts get-caller-identity\nNothing here touches a real AWS account.\n';
const inr = (value: number) => '₹' + value.toLocaleString('en-IN');
const tagName = (tags: Record<string, string>) => tags.Name ? ` (${tags.Name})` : '';

function starterFiles(level: LevelMeta): Record<string, string> {
  return Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? '']));
}

export default function AwsWorkspace({ level, hintsUsed, onPassed }: Props) {
  const { user } = useAuth();
  const storageKey = `fde-aws:${user?.id ?? 'guest'}:${level.id}`;
  const { submit, status, passStats, results, clearResults } = useLevelSubmission({ levelId: level.id, hintsUsed, onPassed });
  const [aws, setAws] = useState<AwsState>(() => createLevelState(starterFiles(level)));
  const [transcript, setTranscript] = useState(WELCOME);
  const [command, setCommand] = useState('');
  const [commands, setCommands] = useState<string[]>([]);
  const { onKeyDown, reset: resetHistory } = useTerminalInput({ value: command, setValue: setCommand, phrases: AWS_COMMANDS, history: commands });
  const [error, setError] = useState('');
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let next: Saved | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) next = JSON.parse(raw) as Saved;
    } catch { /* A missing or corrupt save just starts the level fresh. */ }
    try {
      setAws(next?.state ?? createLevelState(starterFiles(level)));
      setTranscript(next?.transcript ?? WELCOME);
      setCommands(next?.commands ?? []);
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
    resetHistory();
  }, [level, storageKey]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [transcript]);

  const persist = useCallback((saved: Saved) => {
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* Storage can be full or blocked; the session still works. */ }
  }, [storageKey]);

  const run = () => {
    const line = command.trim();
    if (!line) return;
    const result = runAwsCommand(aws, line);
    const printed = '$ ' + line + '\n' + (result.stdout || '') + (result.stderr || '');
    const nextTranscript = (transcript + printed).split('\n').slice(-400).join('\n');
    const nextCommands = [...commands, line].slice(-100);
    setAws(result.state);
    setTranscript(nextTranscript);
    setCommands(nextCommands);
    setCommand('');
    resetHistory();
    clearResults();
    persist({ state: result.state, transcript: nextTranscript, commands: nextCommands });
  };

  const reset = () => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setAws(createLevelState(starterFiles(level)));
    setTranscript(WELCOME);
    setCommands([]);
    setCommand('');
    resetHistory();
    clearResults();
  };

  const submitChecks = () => { void submit(gradeAwsLevel(level.checks, aws)); };
  const bill = useMemo(() => estimateBill(aws), [aws]);
  const files = Object.keys(aws.files).filter((name) => !name.startsWith('.'));

  useSubmitShortcut(submitChecks, true);
  if (error) return <div className={styles.loading} role="alert">Could not start this level: {error}</div>;

  return (
    <section className={styles.workspace} aria-label="AWS simulator workspace">
      <div className={styles.toolbar}>
        <strong>AWS · simulated account in ap-south-1 (Mumbai)</strong>
        <div className={styles.actions}>
          <button className="btn btn-secondary" type="button" onClick={reset}>Reset level</button>
          <button className="btn btn-primary" {...submitButtonProps} type="button" onClick={submitChecks}>Submit</button>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.terminalPane}>
          <pre ref={outputRef} className={styles.transcript} aria-label="AWS terminal output" aria-live="polite">{transcript}</pre>
          <form className={styles.commandRow} onSubmit={(event) => { event.preventDefault(); run(); }}>
            <label htmlFor="aws-command">$</label>
            <input id="aws-command" aria-label="AWS command" value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={onKeyDown} placeholder="aws s3 ls" autoComplete="off" spellCheck={false} />
            <button className={styles.run} type="submit">Run</button>
          </form>
          {files.length > 0 && <p className={styles.fileNote}>Files you can use with file://: {files.join(', ')}. Run <code>cat {files[0]}</code> to read one.</p>}
        </div>
        <aside className={styles.console} aria-label="Resource console">
          <h3 className={styles.consoleTitle}>Console</h3>
          <div className={styles.bill} aria-live="polite"><span>Estimated bill</span><strong>{inr(bill.total)}/month</strong></div>
          {bill.lines.length > 0 && <ul className={styles.billLines}>{bill.lines.map((line, index) => <li key={index}><span>{line.item}</span><span>{inr(line.inr)}</span></li>)}</ul>}
          <Section title="VPCs" items={Object.values(aws.ec2.vpcs).map((vpc) => `${vpc.vpcId} ${vpc.cidrBlock}${tagName(vpc.tags)}`)} />
          <Section title="Subnets" items={Object.values(aws.ec2.subnets).map((subnet) => `${subnet.subnetId} ${subnet.cidrBlock} ${isPublicSubnet(aws, subnet) ? 'public' : 'private'}${tagName(subnet.tags)}`)} />
          <Section title="Security groups" items={Object.values(aws.ec2.securityGroups).filter((group) => group.groupName !== 'default').map((group) => `${group.groupName} ${group.groupId}: ${group.ingress.map((rule) => `${rule.protocol === '-1' ? 'all' : rule.fromPort}${rule.cidr ? ' from ' + rule.cidr : ''}`).join(', ') || 'no inbound rules'}`)} />
          <Section title="EC2 instances" items={Object.values(aws.ec2.instances).map((item) => `${item.instanceId} ${item.instanceType} ${item.state}${tagName(item.tags)}`)} />
          <Section title="S3 buckets" items={Object.values(aws.s3.buckets).map((bucket) => `${bucket.name} ${bucket.publicAccessBlock && Object.values(bucket.publicAccessBlock).every(Boolean) ? 'private (public access blocked)' : 'public access not fully blocked'}`)} />
          <Section title="IAM users" items={Object.values(aws.iam.users).map((item) => `${item.name}: ${[...item.attachedPolicies.map((arn) => arn.split('/').pop()), ...Object.keys(item.inlinePolicies)].join(', ') || 'no policies'}`)} />
        </aside>
      </div>
      <CheckResultsPanel results={results} status={status} stats={passStats} />
    </section>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className={styles.section}>
      <h4>{title} <span>{items.length}</span></h4>
      {items.length === 0 ? <p className={styles.empty}>None yet</p> : <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    </div>
  );
}
