interface StatusBadgeProps {
  switched: boolean;
  provider?: string | null;
  model?: string | null;
  healthy: boolean;
}

export function StatusBadge({ switched, provider, model, healthy }: StatusBadgeProps) {
  if (!healthy) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-300">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Offline
      </span>
    );
  }

  if (!switched) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-700/50 text-gray-300">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Claude (native)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-accent/20 text-accent">
      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
      {provider}/{model}
    </span>
  );
}
