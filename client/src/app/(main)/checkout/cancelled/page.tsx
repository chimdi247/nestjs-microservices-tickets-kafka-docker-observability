'use client';

import Link from 'next/link';
import { RequireAuth } from '@/components/auth/require-auth';
import { buttonVariants } from '@/components/ui/button';

export default function CheckoutCancelledPage() {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-md rounded-xl border p-8">
        <h1 className="text-xl font-semibold">Payment not completed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You were not charged. Your seats stay reserved for a short time, so you can still
          finish the payment from My tickets. After that they are released automatically.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/tickets" className={buttonVariants()}>
            Go to My tickets
          </Link>
          <Link href="/events" className={buttonVariants({ variant: 'outline' })}>
            Browse events
          </Link>
        </div>
      </div>
    </RequireAuth>
  );
}
