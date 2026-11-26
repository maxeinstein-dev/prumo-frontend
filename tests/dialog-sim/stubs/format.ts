const two = (n: number) => String(n).padStart(2, '0');
const localDay = (x: Date) => `${x.getFullYear()}-${two(x.getMonth() + 1)}-${two(x.getDate())}`;
export const formatCurrency = (v: number, _c?: string) => `R$ ${Number(v).toFixed(2)}`;
// Like the real one it prints the day the BROWSER sees: a Date (or an ISO instant) by its local parts, so a day parsed as UTC
// midnight shows as the day before in a zone behind UTC. A plain YYYY-MM-DD string is printed as written (scenarios feed those).
export const formatDate = (d: Date | string) =>
  typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : localDay(d instanceof Date ? d : new Date(d));
// Like the real one: the day part of an API string (YYYY-MM-DD or ISO), as a LOCAL date.
export const parseDateFromAPI = (s: string | Date) => {
  if (s instanceof Date) return s;
  const [year, month, day] = s.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
};
