const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});
const pesoCompact = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat('en-PH');
const dateFmt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

export const formatPeso = (n: number): string => peso.format(n);
export const formatPesoCompact = (n: number): string => pesoCompact.format(n);
export const formatNumber = (n: number): string => whole.format(n);
export const formatPercent = (share: number): string => `${Math.round(share * 100)}%`;
/** For calendar dates stored as UTC midnight (visit dates). */
export const formatDate = (iso: string): string => dateFmt.format(new Date(iso));
/** For real timestamps, shown in the viewer's local time. */
export const formatDateTime = (iso: string): string => dateTimeFmt.format(new Date(iso));
