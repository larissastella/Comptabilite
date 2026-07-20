interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gray';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  default: 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300',
  success: 'bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300',
  warning: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-300',
  danger: 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300',
  info: 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300',
  gray: 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-400',
};

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
