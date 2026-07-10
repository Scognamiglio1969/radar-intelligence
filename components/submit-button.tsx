'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

/** Bottone di submit con spinner automatico mentre la server action lavora. */
export function SubmitButton({ children, pendingLabel, className, formAction }: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" formAction={formAction} disabled={pending}
      className={`${className} disabled:opacity-60`}>
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {pendingLabel ?? 'Please wait…'}
        </span>
      ) : children}
    </button>
  );
}
