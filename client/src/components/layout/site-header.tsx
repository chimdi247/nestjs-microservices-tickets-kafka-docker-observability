'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ticket } from 'lucide-react';
import { useAuthHydrated, useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/features/auth/hooks/use-auth';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SiteHeader() {
  const pathname = usePathname();
  const hydrated = useAuthHydrated();
  // gate on `hydrated` so the first client render matches the server-rendered (logged-out) HTML
  const storedUser = useAuthStore((s) => s.user);
  const storedAuth = useAuthStore((s) => s.isAuthenticated);
  const user = hydrated ? storedUser : null;
  const isAuthenticated = hydrated && storedAuth;
  const { logout } = useLogout();

  const canOrganize = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';

  const links = [
    { href: '/events', label: 'Events' },
    ...(isAuthenticated ? [{ href: '/tickets', label: 'My tickets' }] : []),
    ...(canOrganize ? [{ href: '/organizer', label: 'Organizer' }] : []),
  ];

  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Ticket className="size-4" aria-hidden />
          </span>
          EventFlow
        </Link>

        <nav aria-label="Main" className="flex flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent',
                active(l.href) ? 'bg-accent text-foreground' : 'text-muted-foreground',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!hydrated ? (
            <div className="h-9 w-24" />
          ) : isAuthenticated && user ? (
            <>
              <span className="hidden text-sm text-muted-foreground md:inline">
                {user.name}
              </span>
              <Button variant="outline" size="sm" onClick={logout}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Sign in
              </Link>
              <Link href="/register" className={buttonVariants({ size: 'sm' })}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
