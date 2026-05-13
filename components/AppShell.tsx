'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AUTH_COOKIE } from '@/lib/auth';
import { Button } from './Button';

const navItems = [
  { href: '/inventory', label: 'Inventory' },
  { href: '/customers', label: 'Customer' },
  { href: '/sales-orders', label: 'Sales Order' },
];

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState('');

  useEffect(() => {
    const roleCookie = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${AUTH_COOKIE}=`));
    setRole(roleCookie ? decodeURIComponent(roleCookie.split('=')[1]) : '');
  }, []);

  async function handleLogout() {
    await fetch('/api/logout', {
      method: 'POST',
    });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-page text-primaryText">
      <header className="sticky top-0 z-20 border-b border-border bg-white px-6 pt-3">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="font-title text-[22px] font-semibold text-primaryText">
              GT Orders & Stocks <span className="font-body text-xs font-normal text-helperText">front-end MVP</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-successBg px-3 py-1.5 text-xs text-successText">
                {role ? `Role: ${role}` : 'Role loading'}
              </div>
              <Button size="small" onClick={handleLogout}>Logout</Button>
            </div>
          </div>
          <nav className="flex gap-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (pathname === '/' && item.href === '/inventory');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`rounded-t-xl px-4 py-2 text-sm ${
                    isActive
                      ? 'border border-b-page border-border bg-page font-semibold text-primaryText'
                      : 'text-secondaryText hover:bg-page'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
