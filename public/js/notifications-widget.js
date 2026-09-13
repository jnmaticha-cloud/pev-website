/**
 * notifications-widget.js — a bell icon + dropdown that shows a logged-in
 * user's in-app notifications (service/project request updates, email
 * request decisions, etc.). Self-contained: does nothing if the person
 * isn't logged in, and injects itself into any element with
 * id="notifBellContainer" found on the page.
 */
(function () {
  const POLL_INTERVAL_MS = 30000;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  async function init() {
    const container = document.getElementById('notifBellContainer');
    if (!container || !window.PEVApi || !window.PEVApi.isAuthed()) return;

    container.innerHTML = `
      <div class="notif-bell-wrap">
        <button class="theme-toggle notif-bell-btn" id="notifBellBtn" aria-label="Notifications">
          <i class="fa-solid fa-bell"></i>
          <span class="notif-badge" id="notifBadge" style="display:none">0</span>
        </button>
        <div class="notif-dropdown" id="notifDropdown">
          <div class="notif-dropdown-header">
            <span>Notifications</span>
            <button type="button" id="notifMarkAllRead">Mark all read</button>
          </div>
          <div class="notif-list" id="notifList"><div class="notif-empty">Loading…</div></div>
        </div>
      </div>
    `;

    const btn = document.getElementById('notifBellBtn');
    const dropdown = document.getElementById('notifDropdown');
    const badge = document.getElementById('notifBadge');
    const list = document.getElementById('notifList');

    async function refresh() {
      try {
        const { notifications, unreadCount } = await window.PEVApi.getNotifications();
        if (unreadCount > 0) {
          badge.style.display = 'flex';
          badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
        } else {
          badge.style.display = 'none';
        }

        if (!notifications.length) {
          list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
          return;
        }

        list.innerHTML = notifications.slice(0, 20).map((n) => `
          <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
            <div class="notif-item-title">${escapeHtml(n.title)}</div>
            <div class="notif-item-body">${escapeHtml(n.body.split('\n').filter(Boolean)[1] || n.body.slice(0, 80))}</div>
            <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
          </div>
        `).join('');

        list.querySelectorAll('.notif-item.unread').forEach((el) => {
          el.addEventListener('click', async () => {
            try {
              await window.PEVApi.markNotificationRead(el.dataset.id);
              el.classList.remove('unread');
              refresh();
            } catch (e) { /* ignore */ }
          });
        });
      } catch (e) {
        list.innerHTML = '<div class="notif-empty">Could not load notifications.</div>';
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
      if (dropdown.classList.contains('open')) refresh();
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.classList.remove('open');
      }
    });

    document.getElementById('notifMarkAllRead').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await window.PEVApi.markAllNotificationsRead();
        refresh();
      } catch (err) { /* ignore */ }
    });

    refresh();
    setInterval(refresh, POLL_INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
