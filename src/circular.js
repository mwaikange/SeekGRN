export function displayDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-NA',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Windhoek'}).format(new Date(value+'T12:00:00+02:00'));
}
export const cutoff = circular => Date.parse(circular.closes + 'T00:00:00+02:00');
export const expired = circular => Date.now() >= cutoff(circular);
export const retired = circular => Date.now() >= cutoff(circular) + 2*86400000;
