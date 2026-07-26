'use client';

import { useState } from 'react';
import { Star, Trash2, Pencil, X } from 'lucide-react';
import { SubmitButton } from './submit-button';

type Entity = { id: number; name: string; keywords: string[]; isOwnBrand: number };

/** Riga di un'entità di Benchmark, con modifica in-place: prima si poteva solo
 *  cancellare e ricreare per cambiare le keyword, il che perdeva lo storico
 *  di mention già attribuite all'id. */
export function EditableEntity({
  entity, projectId, inputCls,
  updateEntity, setOwnBrand, deleteEntity,
}: {
  entity: Entity; projectId: number; inputCls: string;
  updateEntity: (formData: FormData) => void | Promise<void>;
  setOwnBrand: (formData: FormData) => void | Promise<void>;
  deleteEntity: (formData: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={async (fd) => { await updateEntity(fd); setEditing(false); }}
        className="flex flex-col gap-2 rounded-lg bg-white/5 px-3 py-2 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="id" value={entity.id} />
        <input name="name" defaultValue={entity.name} className={inputCls} required />
        <input name="keywords" defaultValue={entity.keywords.join(', ')} placeholder="keywords" className={inputCls} />
        <div className="flex shrink-0 gap-1.5">
          <SubmitButton pendingLabel="Saving…" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
            Save
          </SubmitButton>
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-slate-500 hover:text-slate-300" aria-label="Cancel">
            <X className="size-3.5" />
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${entity.isOwnBrand === 1 ? 'bg-amber-500/10 ring-1 ring-amber-500/30' : 'bg-white/5'}`}>
      <span className="font-medium">{entity.name}</span>
      {entity.isOwnBrand === 1 && (
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">Your brand</span>
      )}
      <span className="truncate text-xs text-slate-500">{entity.keywords.join(', ')}</span>
      <button type="button" onClick={() => setEditing(true)} className="ml-auto shrink-0 text-slate-600 hover:text-sky-400" aria-label={`Edit ${entity.name}`}>
        <Pencil className="size-3.5" />
      </button>
      <form action={setOwnBrand} className="shrink-0" title={entity.isOwnBrand === 1 ? 'Unset as your brand' : 'Set as your brand'}>
        <input type="hidden" name="id" value={entity.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="makeBrand" value={entity.isOwnBrand === 1 ? '0' : '1'} />
        <button type="submit" className={entity.isOwnBrand === 1 ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-amber-400'} aria-label={entity.isOwnBrand === 1 ? `Unset ${entity.name} as your brand` : `Set ${entity.name} as your brand`}>
          <Star className="size-4" fill={entity.isOwnBrand === 1 ? 'currentColor' : 'none'} />
        </button>
      </form>
      <form action={deleteEntity} className="shrink-0" title={`Delete ${entity.name}`}>
        <input type="hidden" name="id" value={entity.id} />
        <button type="submit" className="text-slate-600 hover:text-red-400" aria-label={`Delete ${entity.name}`}>
          <Trash2 className="size-4" />
        </button>
      </form>
    </div>
  );
}
