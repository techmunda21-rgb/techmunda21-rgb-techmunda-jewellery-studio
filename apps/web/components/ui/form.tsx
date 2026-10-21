import * as React from 'react';
import { cn } from '@/lib/utils';

export const Label = ({ className, children, required, ...p }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) => (
  <label className={cn('mb-1.5 block text-[13px] font-medium text-ink', className)} {...p}>
    {children}
    {required && <span className="ml-0.5 text-royal" aria-hidden>*</span>}
  </label>
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn('field', className)} {...p} />);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn('field min-h-[88px] resize-y', className)} {...p} />);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn('field appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23B88A36' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>")` }} {...p}>
    {children}
  </select>
));
Select.displayName = 'Select';

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} type="checkbox" className={cn('mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gold/70 accent-[rgb(var(--royal))]', className)} {...p} />
));
Checkbox.displayName = 'Checkbox';

export const FieldError = ({ id, message }: { id?: string; message?: string }) =>
  message ? (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-status-rejected">
      {message}
    </p>
  ) : null;

/** Label + control + error wiring in one place for RHF forms. */
export function Field({ label, htmlFor, error, required, hint, children, className }: { label: string; htmlFor: string; error?: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} required={required}>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      <FieldError id={`${htmlFor}-error`} message={error} />
    </div>
  );
}
