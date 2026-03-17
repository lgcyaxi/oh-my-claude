type Variant = 'success' | 'warning' | 'danger' | 'neutral';

interface StatusBadgeProps {
  variant: Variant;
  label: string;
  pulse?: boolean;
}

const variantStyles: Record<Variant, string> = {
  success: 'bg-success text-success',
  warning: 'bg-warning text-warning',
  danger: 'bg-danger text-danger',
  neutral: 'bg-text-tertiary text-text-tertiary',
};

export default function StatusBadge({ variant, label, pulse }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`w-1.5 h-1.5 rounded-full ${variantStyles[variant]} ${
          pulse ? 'animate-pulse-slow' : ''
        }`}
      />
      <span className={variantStyles[variant].split(' ')[1]}>{label}</span>
    </span>
  );
}
