import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, type = 'text', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid}
      className={cn(
        'block h-11 w-full rounded-md border bg-white px-3 text-base',
        'focus:outline-none focus:ring-2 focus:ring-offset-0',
        invalid
          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
          : 'border-stone-300 focus:border-forest-500 focus:ring-forest-500',
        'disabled:cursor-not-allowed disabled:bg-stone-100',
        className,
      )}
      {...rest}
    />
  );
});
