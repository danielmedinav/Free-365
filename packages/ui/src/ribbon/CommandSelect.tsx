import { useCommandState, useRegistry } from '../commands/CommandProvider';
import styles from './Ribbon.module.css';

export type CommandSelectOption = {
  /** Id of a registered command; the option is selected while that command is active. */
  command: string;
  label: string;
};

type CommandSelectProps = {
  label: string;
  options: CommandSelectOption[];
  /** Shown when no option is active, e.g. a font from an imported file that isn't in the list. */
  currentLabel?: () => string | undefined;
  width?: number;
};

const OTHER_VALUE = '__other';

/** A dropdown where choosing an option runs its command. */
export function CommandSelect({ label, options, currentLabel, width }: CommandSelectProps) {
  const registry = useRegistry();
  // Re-renders with the registry, which covers every option's state.
  const { enabled } = useCommandState(options[0]?.command ?? '');
  const active = options.find((o) => registry.get(o.command)?.isActive?.());
  const other = active ? undefined : currentLabel?.();

  return (
    <select
      className={styles.select}
      style={{ width }}
      aria-label={label}
      title={label}
      disabled={!enabled}
      value={active?.command ?? OTHER_VALUE}
      onChange={(event) => registry.execute(event.target.value)}
    >
      {!active && <option value={OTHER_VALUE}>{other ?? ''}</option>}
      {options.map((option) => (
        <option key={option.command} value={option.command}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
