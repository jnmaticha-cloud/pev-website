/**
 * auth-widget.js — controls the navbar login button / "logged in" dropdown.
 * The dropdown with "My Portal" / "Logout" stays hidden until a session exists.
 */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const trigger = document.getElementById('loginTrigger');
    const menu = document.getElementById('userMenu');
    const label = document.getElementById('authLabel');
    const logoutBtn = document.getElementById('logoutBtn');
    if (!trigger || !window.PEVApi) return;

    function render() {
      const authed = window.PEVApi.isAuthed();
      const user = window.PEVApi.getUser();
      if (authed && user) {
        label.textContent = user.name.split(' ')[0];
        trigger.querySelector('i').className = 'fa-solid fa-circle-user';
        const portalLink = menu.querySelector('a');
        if (portalLink) portalLink.href = window.PEVApi.portalPathForRole(user.role);
      } else {
        label.textContent = 'Log in';
        trigger.querySelector('i').className = 'fa-solid fa-user';
        menu.classList.remove('open');
      }
    }

    trigger.addEventListener('click', function (e) {
      const authed = window.PEVApi.isAuthed();
      if (!authed) {
        window.location.href = '/login';
        return;
      }
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    document.addEventListener('click', function (e) {
      if (menu && !menu.contains(e.target) && e.target !== trigger) {
        menu.classList.remove('open');
      }
    });

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        window.PEVApi.logout();
        render();
        window.location.href = '/';
      });
    }

    render();
  });
})();
