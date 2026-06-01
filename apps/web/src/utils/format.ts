import type { MailAddress } from '@jmail/shared';

/** "Alice <alice@x.com>" → display name when present, else the address. */
export function formatAddress(addr: MailAddress): string {
  return addr.name && addr.name.length > 0 ? addr.name : addr.address;
}

export function formatAddressList(addrs: MailAddress[]): string {
  return addrs.map(formatAddress).join(', ');
}

export function formatAddressFull(addr: MailAddress): string {
  return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
}

/** Compact date for the message list: time today, weekday this week, else date. */
export function formatListDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const diffDays = (now.getTime() - d.getTime()) / 86_400_000;
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
