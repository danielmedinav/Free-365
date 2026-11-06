import { createCommandRegistry, type CommandRegistry } from '@free360/commands';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Bold, Save } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { ColorMenu } from './ColorMenu';
import { CommandSelect } from './CommandSelect';
import { Ribbon } from './Ribbon';
import type { RibbonTab } from './types';

const tabs: RibbonTab[] = [
  {
    id: 'file',
    label: 'File',
    groups: [
      { id: 'f', label: 'File', items: [{ type: 'command', command: 'file.save', icon: Save }] },
    ],
  },
  {
    id: 'home',
    label: 'Home',
    groups: [
      { id: 'font', label: 'Font', items: [{ type: 'command', command: 'text.bold', icon: Bold }] },
    ],
  },
];

function renderRibbon(registry: CommandRegistry) {
  return render(
    <CommandProvider registry={registry}>
      <Ribbon tabs={tabs} />
    </CommandProvider>,
  );
}

describe('Ribbon', () => {
  it('shows the second tab by default and switches tabs', async () => {
    const registry = createCommandRegistry();
    registry.register([
      { id: 'file.save', label: 'Save', run: () => {} },
      { id: 'text.bold', label: 'Bold', run: () => {} },
    ]);
    renderRibbon(registry);

    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Bold' })).toBeVisible();

    await userEvent.click(screen.getByRole('tab', { name: 'File' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it('reflects command state and runs commands on click', async () => {
    const registry = createCommandRegistry();
    let bold = false;
    const save = vi.fn();
    registry.register([
      { id: 'file.save', label: 'Save', run: save, isEnabled: () => false },
      { id: 'text.bold', label: 'Bold', run: () => void (bold = !bold), isActive: () => bold },
    ]);
    renderRibbon(registry);

    const boldButton = screen.getByRole('button', { name: 'Bold' });
    expect(boldButton).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(boldButton);
    expect(boldButton).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('tab', { name: 'File' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('hides buttons for unregistered commands', () => {
    renderRibbon(createCommandRegistry());
    expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument();
  });
});

describe('CommandSelect', () => {
  function setup(active: string | null) {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register(
      ['a', 'b'].map((id) => ({
        id,
        label: id,
        run: () => run(id),
        isActive: () => active === id,
      })),
    );
    render(
      <CommandProvider registry={registry}>
        <CommandSelect
          label="Choice"
          currentLabel={() => 'Other value'}
          options={[
            { command: 'a', label: 'Option A' },
            { command: 'b', label: 'Option B' },
          ]}
        />
      </CommandProvider>,
    );
    return { run, select: screen.getByRole('combobox', { name: 'Choice' }) };
  }

  it('shows the active command and runs the chosen one', async () => {
    const { run, select } = setup('a');
    expect(select).toHaveValue('a');
    expect(screen.queryByRole('option', { name: 'Other value' })).not.toBeInTheDocument();

    await userEvent.selectOptions(select, 'Option B');
    expect(run).toHaveBeenCalledWith('b');
  });

  it('shows the current value when no option matches it', () => {
    const { select } = setup(null);
    expect(select).toHaveDisplayValue('Other value');
  });
});

describe('ColorMenu', () => {
  it('runs the chosen swatch or the clear command', async () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register([
      { id: 'clear', label: 'No color', run: () => run('clear') },
      { id: 'red', label: 'Red', run: () => run('red') },
    ]);
    render(
      <CommandProvider registry={registry}>
        <ColorMenu
          label="Color"
          icon={Bold}
          clearCommand="clear"
          current={() => undefined}
          swatches={[{ command: 'red', color: '#ff0000' }]}
        />
      </CommandProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Color' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Red' }));
    expect(run).toHaveBeenCalledWith('red');

    await userEvent.click(screen.getByRole('button', { name: 'Color' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'No color' }));
    expect(run).toHaveBeenCalledWith('clear');
  });
});
