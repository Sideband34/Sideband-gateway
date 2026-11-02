'use client';

import { IconMoon, IconSun } from './Icons';

export const THEME_KEY = 'sideband-theme';

// Runs before paint (inlined in <head>) so a saved choice never flashes the wrong theme.
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}document.documentElement.classList.add('js');})();`;

function effectiveTheme(): 'light' | 'dark' {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle() {
  const toggle = () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this page view.
    }
  };
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={toggle}
      aria-label="Toggle colour theme"
    >
      <IconSun className="when-dark" size={20} />
      <IconMoon className="when-light" size={20} />
    </button>
  );
}
