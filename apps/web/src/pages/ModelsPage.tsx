import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../components/Toast';
import ModelForm from '../components/ModelForm';
import {
  getRegistry,
  addModel,
  deleteModel,
  type RegistryData,
  type RegistryProvider,
  type ModelEntry,
} from '../lib/api';

export default function ModelsPage() {
  const [registry, setRegistry] = useState<RegistryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState<{
    provider: string;
    model?: ModelEntry;
  } | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await getRegistry();
      setRegistry(data);
      setError(null);
      // Auto-expand all providers on first load
      if (expanded.size === 0) {
        setExpanded(new Set(data.providers.map((p) => p.name)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load registry');
    }
  }, [expanded.size]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAdd = (provider: string) => {
    setFormOpen({ provider });
  };

  const handleEdit = (provider: string, model: ModelEntry) => {
    setFormOpen({ provider, model });
  };

  const handleDelete = async (provider: string, modelId: string) => {
    if (!confirm(`Delete model "${modelId}" from ${provider}?`)) return;
    try {
      await deleteModel(provider, modelId);
      toast(`Deleted ${modelId}`, 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleFormSubmit = async (providerName: string, model: ModelEntry) => {
    try {
      await addModel(providerName, model);
      toast(`${formOpen?.model ? 'Updated' : 'Added'} ${model.id}`, 'success');
      setFormOpen(null);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const filteredProviders = registry?.providers.filter((p) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.label.toLowerCase().includes(q) ||
      p.models.some(
        (m) =>
          m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
      )
    );
  });

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Models Registry</h1>
        <input
          type="text"
          placeholder="Filter models..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 bg-bg-tertiary border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50 w-56"
        />
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger-muted border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {filteredProviders?.map((provider) => (
          <ProviderSection
            key={provider.name}
            provider={provider}
            isExpanded={expanded.has(provider.name)}
            onToggle={() => toggleExpand(provider.name)}
            onAdd={() => handleAdd(provider.name)}
            onEdit={(m) => handleEdit(provider.name, m)}
            onDelete={(modelId) => handleDelete(provider.name, modelId)}
          />
        ))}
      </div>

      {formOpen && (
        <ModelForm
          providerName={formOpen.provider}
          existingModel={formOpen.model}
          onSubmit={handleFormSubmit}
          onClose={() => setFormOpen(null)}
        />
      )}
    </div>
  );
}

function ProviderSection({
  provider,
  isExpanded,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}: {
  provider: RegistryProvider;
  isExpanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (m: ModelEntry) => void;
  onDelete: (modelId: string) => void;
}) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-hover transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className={`text-text-tertiary transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          >
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
          <span className="font-medium text-sm">{provider.label}</span>
          <span className="text-xs text-text-tertiary font-mono">{provider.name}</span>
        </div>
        <span className="text-xs text-text-tertiary">
          {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-border">
          {provider.models.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-bg-hover transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-mono">{model.id}</span>
                <span className="text-xs text-text-tertiary truncate">
                  {model.label}
                </span>
                {model.note && (
                  <span className="text-[10px] text-accent/60 bg-accent-muted px-1.5 py-0.5 rounded">
                    {model.note}
                  </span>
                )}
                {model.realId && (
                  <span className="text-[10px] text-text-tertiary">
                    → {model.realId}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(model)}
                  className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(model.id)}
                  className="px-2 py-1 text-xs text-danger/70 hover:text-danger hover:bg-danger-muted rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={onAdd}
            className="w-full px-4 py-2.5 text-xs text-accent hover:text-accent-hover hover:bg-bg-hover transition-colors border-t border-border text-left"
          >
            + Add model
          </button>
        </div>
      )}
    </div>
  );
}
