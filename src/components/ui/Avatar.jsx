// =============================================================
// Avatar — image or initials fallback. Uses colorFromString to
// produce a stable HSL background tied to the name.
// =============================================================
import { useState } from 'react';
import { cn } from '@utils/classNames';
import { initials, colorFromString } from '@utils/format';

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
  '2xl': 'w-20 h-20 text-xl',
};

export function Avatar({
  name = '',
  src,
  size = 'md',
  className = '',
  ring = false,
  ...rest
}) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;
  const bg = colorFromString(name);

  return (
    <div
      aria-label={name || 'avatar'}
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden font-bold text-white shrink-0',
        SIZES[size] || SIZES.md,
        ring && 'ring-2 ring-white shadow-soft',
        className,
      )}
      style={{ background: showImage ? undefined : bg }}
      {...rest}
    >
      {showImage ? (
        <img
          src={src}
          alt={name || 'avatar'}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </div>
  );
}

export default Avatar;
