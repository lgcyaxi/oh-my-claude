import { useState } from 'react';
import type { ModelEntry } from '../lib/api';

interface ModelFormProps {
  providerName: string;
  existingModel?: ModelEntry;
  onSubmit: (providerName: string, model: ModelEntry) => Promise<void>;
  onClose: () => void;
}

export default function ModelForm({
  providerName,
  existingModel,
  onSubmit,
  onClose,
}: ModelFormProps) {
  const [id, setId] = useState(existingModel?.id ?? '');
  const [label, setLabel] = useState(existingModel?.label ?? '');
  const [note, setNote] = useState(existingModel?.note ?? '');
  const [realId, setRealId] = useState(existingModel?.realId ?? '');
  const [saving, setSaving] = useState(false);

  const isEdit = !!existingModel;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !label.trim()) return;

    setSaving(true);
    try {
      const model: ModelEntry = { id: id.trim(), label: label.trim() };
      if (note.trim()) model.note = note.trim();
      if (realId.trim()) model.realId = realId.trim();
      await onSubmit(providerName, model);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-bg-elevated border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-1">
          {isEdit ? 'Edit Model' : 'Add Model'}
        </h2>
        <p className="text-xs text-text-tertiary mb-5">
          Provider: <span className="font-mono text-text-secondary">{providerName}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Model ID" required>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. glm-5-turbo"
              disabled={isEdit}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm font-mono text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50 disabled:opacity-50"
            />
          </Field>

          <Field label="Display Label" required>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. GLM-5 Turbo"
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50"
            />
          </Field>

          <Field label="Note" hint="Optional description shown as a tag">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. supports vision"
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50"
            />
          </Field>

          <Field label="Real ID" hint="Optional alias → actual model ID mapping">
            <input
              type="text"
              value={realId}
              onChange={(e) => setRealId(e.target.value)}
              placeholder="e.g. glm-5"
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm font-mono text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!id.trim() || !label.trim() || saving}
              className="px-4 py-2 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Add Model'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary mb-1 block">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-text-tertiary mt-0.5 block">{hint}</span>}
    </label>
  );
}
