'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthHydrated, useAuthStore } from '@/stores/auth-store';
import { PageSpinner, EmptyState } from '@/components/state';
import { buttonVariants } from '@/components/ui/button';
import type { Role } from '@/types';

/** Client-side route guard (the token lives in localStorage, so it cannot be checked by middleware). */
export function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, isAuthenticated, pathname, router]);

  if (!hydrated || !isAuthenticated || !user) return <PageSpinner />;

  if (roles && !roles.includes(user.role)) {
    return (
      <EmptyState
        title="This area is for organizers"
        action={
          <Link href="/events" className={buttonVariants()}>
            Browse events
          </Link>
        }
      >
        Your account is not set up to organize events. Create a new account and tick
        &quot;I want to organize events&quot; to get access.
      </EmptyState>
    );
  }

  return <>{children}</>;
}
