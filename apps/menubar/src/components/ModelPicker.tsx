import { useEffect, useState } from "react";
import { getProviders, type ProviderInfo } from "../lib/api";

interface ModelPickerProps {
  currentProvider: string | null;
  currentModel: string | null;
  onSwitch: (provider: string, model: string) => void;
  onRevert: () => void;
  switched: boolean;
  disabled: boolean;
}

export function ModelPicker({
  currentProvider,
  currentModel,
  onSwitch,
  onRevert,
  switched,
  disabled,
}: ModelPickerProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  useEffect(() => {
    getProviders().then(setProviders).catch(console.error);
  }, []);

  return (
    <div className="space-y-1.5">
      {providers.map((provider) => (
        <div key={provider.name}>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 px-1 mb-0.5">
            {provider.name}
          </div>
          <div className="space-y-0.5">
            {provider.models.map((model) => {
              const isActive =
                switched && currentProvider === provider.name && currentModel === model.id;
              return (
                <button
                  key={`${provider.name}-${model.id}`}
                  onClick={() => onSwitch(provider.name, model.id)}
                  disabled={disabled || isActive}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors
                    ${
                      isActive
                        ? "bg-accent/20 text-accent cursor-default"
                        : "hover:bg-white/5 text-gray-300 hover:text-white"
                    }
                    ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  {model.label}
                  {isActive && (
                    <span className="ml-1.5 text-[10px] text-accent/70">active</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {switched && (
        <button
          onClick={onRevert}
          disabled={disabled}
          className="w-full text-left px-2.5 py-1.5 rounded text-sm text-orange-300 hover:bg-orange-900/20 transition-colors mt-2"
        >
          Revert to Claude
        </button>
      )}
    </div>
  );
}
