// A labelled form field with an error line that screen readers read together with it.
// `children` is a function that gets { id, invalid, describedBy } to put on the real input.
//
//   <Field label="Pincode" error={error}>
//     {({ id, invalid, describedBy }) => <input id={id} aria-invalid={invalid} aria-describedby={describedBy} />}
//   </Field>

import { useId } from 'react';

export function Field({ label, error, optional = false, hint, children }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="text-nav-link text-ink">
        {label}
        {optional && <span className="font-normal text-ink-muted"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-small text-ink-muted">
          {hint}
        </p>
      )}
      <div className="mt-1">{children({ id, invalid: Boolean(error), describedBy })}</div>
      {error && (
        <p id={errorId} className="mt-1 text-small font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// The look of a text input or textarea. `invalid` turns the border red.
export const inputClass = (invalid = false) =>
  `w-full rounded-md border bg-surface-card px-3 text-body text-ink placeholder:text-ink-muted ${invalid ? 'border-danger' : 'border-green-accent'}`;
