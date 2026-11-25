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
const monthFmt = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthLongFmt = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt =new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

export const formatPeso = (n: number): string => peso.format(n);
export const formatPesoCompact = (n: number): string => pesoCompact.format(n);
export const formatNumber = (n: number): string => whole.format(n);
/** 09171234567 -> 0917 123 4567 */
export const formatPhone = (n: string): string =>
  /^\d{11}$/.test(n) ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : n;
export const formatPercent = (share: number): string => `${Math.round(share * 100)}%`;
/** For calendar dates stored as UTC midnight (visit dates). */
export const formatDate = (iso: string): string => dateFmt.format(new Date(iso));
/** "2026-10-01" -> "Oct 2026" */
export const formatMonth = (iso: string): string => monthFmt.format(new Date(iso));
/** "2026-10-01" -> "October 2026" */
export const formatMonthLong = (iso: string): string => monthLongFmt.format(new Date(iso));
/** 0.6173 -> "+62%", -0.33 -> "−33%" */
export const formatChange = (share: number | null): string =>
  share === null ? 'new' : `${share >= 0 ? '+' : '−'}${Math.abs(Math.round(share * 100))}%`;
/** Today's date on this device as YYYY-MM-DD. */
export const todayIso = (): string => new Intl.DateTimeFormat('en-CA').format(new Date());
/** For real timestamps, shown in the viewer's local time. */
export const formatDateTime = (iso: string): string => dateTimeFmt.format(new Date(iso));
