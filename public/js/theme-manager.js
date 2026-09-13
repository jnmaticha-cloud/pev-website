/**
 * themeManager — global object for programmatic theme control.
 * Persists choice in-memory for the session (no localStorage dependency
 * required, but will use it opportunistically if available so the
 * preference survives a reload).
 */
(function () {
  const STORAGE_KEY = 'pev-theme';

  function getStoredTheme() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* storage unavailable — theme just won't persist across reloads */
    }
  }

  function systemPrefersLight() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  const themeManager = {
    current: 'dark',
    init() {
      const stored = getStoredTheme();
      this.current = stored || (systemPrefersLight() ? 'light' : 'dark');
      this.apply(this.current, { persist: false });
    },
    apply(theme, opts) {
      const options = opts || { persist: true };
      this.current = theme;
      document.documentElement.setAttribute('data-theme', theme);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f3ea' : '#0b1220');
      if (options.persist) storeTheme(theme);
      document.dispatchEvent(new CustomEvent('pev:theme-changed', { detail: { theme } }));
    },
    toggle() {
      this.apply(this.current === 'dark' ? 'light' : 'dark');
    },
    set(theme) {
      if (theme !== 'dark' && theme !== 'light') return;
      this.apply(theme);
    },
  };

  window.themeManager = themeManager;
  themeManager.init();

  document.addEventListener('DOMContentLoaded', function () {
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        themeManager.toggle();
      });
    }
  });
})();
