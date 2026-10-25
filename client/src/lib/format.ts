/** prices are stored in cents */
export function formatPrice(cents: number): string {
  if (!cents) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export function dateParts(iso: string): { month: string; day: string; time: string } {
  const d = new Date(iso);
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d),
    day: String(d.getDate()),
    time: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(d),
  };
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

/** ISO -> value for <input type="datetime-local"> (local time, minute precision) */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "12" / "12.5" -> 1200 / 1250 cents */
export function dollarsToCents(value: string): number {
  return Math.round(parseFloat(value) * 100);
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** only same-site relative paths are valid redirect targets */
export function safeRedirect(target: string | null | undefined): string {
  if (target && target.startsWith('/') && !target.startsWith('//')) return target;
  return '/';
}
