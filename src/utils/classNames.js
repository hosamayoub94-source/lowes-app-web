// Tiny className concatenator — replaces clsx without the dep.
// Accepts: strings, falsy values (skipped), or objects { className: bool }.
export function cn(...inputs) {
  const out = [];
  for (const item of inputs) {
    if (!item) continue;
    if (typeof item === 'string') {
      out.push(item);
    } else if (typeof item === 'object') {
      for (const [key, value] of Object.entries(item)) {
        if (value) out.push(key);
      }
    }
  }
  return out.join(' ');
}
