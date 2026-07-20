import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'default' | 'subtle';
  className?: string;
}

export default function ThemeToggle({ variant = 'default', className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  if (variant === 'subtle') {
    return (
      <button
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
        className={`p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-2 transition-colors ${className}`}
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        theme === 'dark'
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-surface-2 dark:text-gray-200 dark:hover:bg-surface-3'
      } ${className}`}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span className="hidden sm:inline">{theme === 'dark' ? 'Jour' : 'Nuit'}</span>
    </button>
  );
}
