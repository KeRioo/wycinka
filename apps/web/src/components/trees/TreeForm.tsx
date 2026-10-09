import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { DEFAULT_SPECIES } from '@/db/schema';
import { useTreeStore, treeDraftSchema } from '@/stores/treeStore';

type TreeFormValues = z.infer<typeof treeDraftSchema>;

interface TreeFormProps {
  defaultSpecies?: string;
}

function resolveSpecies(
  pendingSpecies: string | undefined,
  defaultSpecies: string | undefined,
): string {
  if (pendingSpecies !== undefined && pendingSpecies !== '') {
    return pendingSpecies;
  }
  if (defaultSpecies !== undefined && defaultSpecies !== '') {
    return defaultSpecies;
  }
  return '';
}

export default function TreeForm({ defaultSpecies }: TreeFormProps): JSX.Element {
  const pending = useTreeStore((s) => s.pending);
  const editingTreeId = useTreeStore((s) => s.editingTreeId);
  const setSpecies = useTreeStore((s) => s.setSpecies);
  const setCircumference = useTreeStore((s) => s.setCircumference);
  const setNotes = useTreeStore((s) => s.setNotes);

  const formKey =
    editingTreeId ??
    (pending !== null ? `placing-${pending.lat.toFixed(6)}-${pending.lng.toFixed(6)}` : 'idle');

  const initialSpecies = resolveSpecies(pending?.species, defaultSpecies);
  const initialCircumference = pending?.circumference ?? 0;
  const initialNotes = pending?.notes ?? '';

  const {
    register,
    handleSubmit,
    reset,
    trigger,
    setValue,
    formState: { errors, isValid },
    watch,
  } = useForm<TreeFormValues>({
    resolver: zodResolver(treeDraftSchema),
    defaultValues: {
      species: initialSpecies,
      circumference: initialCircumference,
      notes: initialNotes,
    },
    mode: 'all',
  });

  useEffect(() => {
    reset({
      species: resolveSpecies(pending?.species, defaultSpecies),
      circumference: pending?.circumference ?? 0,
      notes: pending?.notes ?? '',
    });
    void trigger();
  }, [formKey, pending, defaultSpecies, reset, trigger]);

  useEffect(() => {
    if (initialSpecies !== '') {
      setValue('species', initialSpecies, { shouldDirty: false });
    }
  }, [initialSpecies, setValue]);

  useEffect(() => {
    const sub = watch((values) => {
      if (values.species !== undefined && values.species !== pending?.species) {
        setSpecies(values.species);
      }
      if (
        values.circumference !== undefined &&
        Number.isFinite(values.circumference) &&
        values.circumference !== pending?.circumference
      ) {
        setCircumference(values.circumference);
      }
      const notesValue = values.notes ?? '';
      if (notesValue !== (pending?.notes ?? '')) {
        setNotes(notesValue);
      }
    });
    return () => {
      sub.unsubscribe();
    };
  }, [
    watch,
    setSpecies,
    setCircumference,
    setNotes,
    pending?.species,
    pending?.circumference,
    pending?.notes,
  ]);

  return (
    <form
      data-testid="tree-form"
      className="space-y-3"
      onSubmit={handleSubmit(() => {
        // validation-only; actual save handled by panel button
      })}
    >
      <div>
        <label htmlFor="tree-species" className="mb-1 block text-sm font-medium text-forest-900">
          Gatunek
        </label>
        <select
          id="tree-species"
          data-testid="tree-species"
          aria-invalid={errors.species !== undefined}
          className="block h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500"
          defaultValue={initialSpecies}
          {...register('species')}
        >
          <option value="">-- wybierz --</option>
          {DEFAULT_SPECIES.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        {errors.species !== undefined && (
          <p data-testid="tree-species-error" className="mt-1 text-xs text-red-700">
            {errors.species.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="tree-circumference"
          className="mb-1 block text-sm font-medium text-forest-900"
        >
          Obwód (cm)
        </label>
        <input
          id="tree-circumference"
          data-testid="tree-circumference"
          type="number"
          inputMode="decimal"
          step="0.1"
          min={1}
          max={1000}
          aria-invalid={errors.circumference !== undefined}
          className="block h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500"
          {...register('circumference', { valueAsNumber: true })}
        />
        {errors.circumference !== undefined && (
          <p data-testid="tree-circumference-error" className="mt-1 text-xs text-red-700">
            {errors.circumference.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="tree-notes" className="mb-1 block text-sm font-medium text-forest-900">
          Notatki
        </label>
        <textarea
          id="tree-notes"
          data-testid="tree-notes"
          rows={2}
          maxLength={500}
          className="block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500"
          {...register('notes')}
        />
        {errors.notes !== undefined && (
          <p data-testid="tree-notes-error" className="mt-1 text-xs text-red-700">
            {errors.notes.message}
          </p>
        )}
      </div>
      <span data-testid="tree-form-valid" data-valid={isValid ? 'true' : 'false'} hidden />
    </form>
  );
}
