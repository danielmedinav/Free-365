import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from '../controls/IconButton';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <IconButton label={`Switch to ${next} theme`} onClick={toggle}>
      {resolved === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </IconButton>
  );
}
