import { useRegisterCommands, useTheme } from '@free360/ui';

/** Commands available everywhere in the app, regardless of route. */
export function GlobalCommands() {
  const { toggle } = useTheme();
  useRegisterCommands([
    {
      id: 'view.toggleTheme',
      label: 'Toggle dark theme',
      description: 'Switch between light and dark themes',
      shortcut: 'Alt+Shift+D',
      allowInInputs: true,
      run: toggle,
    },
  ]);
  return null;
}
