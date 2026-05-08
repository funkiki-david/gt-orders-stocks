import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'normal' | 'small';
};

export function Button({
  children,
  variant = 'secondary',
  size = 'normal',
  className = '',
  ...props
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'bg-primaryButton text-white'
      : 'bg-secondaryButton text-primaryText';
  const sizeClass = size === 'small' ? 'h-7 px-3 text-[13px]' : 'h-8 px-4 text-[13px]';

  return (
    <button
      className={`inline-flex items-center justify-center rounded-full font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
