import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: CardProps): JSX.Element {
  return (
    <div
      className={cn('rounded-lg border border-stone-200 bg-white shadow-sm', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardHeader({ className, children, ...rest }: CardHeaderProps): JSX.Element {
  return (
    <div className={cn('border-b border-stone-200 p-4', className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export function CardTitle({ className, children, ...rest }: CardTitleProps): JSX.Element {
  return (
    <h2 className={cn('text-lg font-semibold text-forest-900', className)} {...rest}>
      {children}
    </h2>
  );
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardContent({ className, children, ...rest }: CardContentProps): JSX.Element {
  return (
    <div className={cn('p-4', className)} {...rest}>
      {children}
    </div>
  );
}
