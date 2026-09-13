/**
 * performance-loader.js
 * Shows a brief loading animation while critical assets initialize,
 * then fades it out. Falls back to a hard timeout so the loader can
 * never get stuck covering the page.
 */
(function () {
  function hideLoader() {
    const loader = document.getElementById('page-loader');
    if (!loader) return;
    loader.classList.add('hidden');
    window.setTimeout(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 600);
  }

  window.addEventListener('load', hideLoader);
  // Safety net: never block the page for more than 2.5s
  window.setTimeout(hideLoader, 2500);
})();
