'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  children: React.ReactNode;
  as?: 'div' | 'li' | 'section';
  className?: string;
  delay?: number;
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>;

/**
 * Fades content in as it scrolls into view. Content is fully visible without JavaScript, in
 * environments without IntersectionObserver, and when the user prefers reduced motion (CSS).
 */
export function Reveal({ children, as = 'div', className = '', delay = 0, style, ...rest }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={`reveal${shown ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      style={delay ? { ...style, ['--reveal-delay' as string]: `${delay}ms` } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
