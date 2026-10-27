export const nf = new Intl.NumberFormat('en');

export const esc = (s: string | number): string =>
  String(s).replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[c] ?? c;
  });

/** Lower-case letters and digits only, for forgiving name matching. */
export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
