import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TitleInput } from './TitleInput';

describe('TitleInput', () => {
  it('commits on Enter', async () => {
    const onCommit = vi.fn();
    render(<TitleInput value="Draft" onCommit={onCommit} />);
    const input = screen.getByRole('textbox', { name: 'Document title' });
    await userEvent.click(input);
    await userEvent.keyboard('Final{Enter}');
    expect(onCommit).toHaveBeenCalledWith('Final');
  });

  it('reverts on Escape without committing', async () => {
    const onCommit = vi.fn();
    render(<TitleInput value="Draft" onCommit={onCommit} />);
    const input = screen.getByRole('textbox', { name: 'Document title' });
    await userEvent.click(input);
    await userEvent.keyboard('Changed{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('Draft');
  });

  it('does not commit when unchanged', async () => {
    const onCommit = vi.fn();
    render(<TitleInput value="Same" onCommit={onCommit} />);
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
