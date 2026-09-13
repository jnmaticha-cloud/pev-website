(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const toggle = document.getElementById('mobileMenuToggle');
    const links = document.getElementById('navLinks');

    if (toggle && links) {
      toggle.addEventListener('click', function () {
        const isOpen = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.innerHTML = isOpen
          ? '<i class="fa-solid fa-xmark"></i>'
          : '<i class="fa-solid fa-bars"></i>';
      });

      // Close mobile menu after clicking a plain link
      links.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          links.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
        });
      });
    }

    // Dropdown toggles — click-based for mobile, hover already handled by CSS on desktop
    document.querySelectorAll('.nav-item-dropdown').forEach(function (item) {
      const btn = item.querySelector('button');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        if (window.innerWidth > 900) return; // desktop uses hover
        e.preventDefault();
        const isOpen = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(isOpen));
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
      document.querySelectorAll('.nav-item-dropdown.open').forEach(function (item) {
        if (!item.contains(e.target)) {
          item.classList.remove('open');
        }
      });
    });
  });
})();
