import { TERRAFORM_COMMANDS } from '../lib/terminal-vocab';
import type { LevelMeta } from '../lib/content-loader';
import { STATE_FILE, createTfState, runTerraformCommand, showValue, type TfState } from '../lib/terraform/engine';
import { gradeTerraformLevel } from '../lib/terraform-grader';
import SimTerminalWorkspace, { type SimEngine } from './SimTerminalWorkspace';
import styles from './SimTerminalWorkspace.module.css';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }

const engine: SimEngine<TfState> = {
  phrases: TERRAFORM_COMMANDS,
  label: 'Terraform',
  create: createTfState,
  run: runTerraformCommand,
  grade: gradeTerraformLevel,
  readOnlyFiles: [STATE_FILE],
  firstFile: /^main\.tf$/,
  placeholder: 'terraform plan',
  intro: 'Terraform simulator ready. Try: terraform init, terraform plan, terraform apply -auto-approve. Type help for commands.',
  footnote: 'This is a pretend AWS account in your browser. Nothing real is created and nothing costs money.',
};

function StateView({ state }: { state: TfState }) {
  const outputs = Object.entries(state.outputs);
  return (
    <>
      <div className={styles.group}>
        <h4>Resources in state ({state.resources.length})</h4>
        {state.resources.length === 0 ? <p className={styles.empty}>Nothing created yet. Run terraform apply.</p> : (
          <ul className={styles.rows}>
            {state.resources.map((resource) => (
              <li key={resource.address} className={styles.row}>
                <span>{resource.address}</span>
                <span className={resource.tainted ? styles.warn : styles.badge}>{resource.tainted ? 'tainted' : typeof resource.attrs.id === 'string' ? resource.attrs.id : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.group}>
        <h4>Outputs</h4>
        {outputs.length === 0 ? <p className={styles.empty}>No outputs.</p> : (
          <ul className={styles.rows}>
            {outputs.map(([name, output]) => <li key={name} className={styles.row}><span>{name}</span><span className={styles.badge}>{output.sensitive ? '<sensitive>' : showValue(output.value)}</span></li>)}
          </ul>
        )}
      </div>
      <div className={styles.group}>
        <h4>Setup</h4>
        <p className={state.initialized ? styles.good : styles.warn}>{state.initialized ? 'terraform init done' : 'Run terraform init first'}</p>
      </div>
    </>
  );
}

/** Terraform level workspace: HCL editor, simulated terraform CLI, and a live view of state. */
export default function TerraformWorkspace({ level, hintsUsed, onPassed }: Props) {
  return <SimTerminalWorkspace level={level} hintsUsed={hintsUsed} onPassed={onPassed} engine={engine} kind="terraform" sideTitle="Infrastructure" side={(state) => <StateView state={state} />} />;
}
