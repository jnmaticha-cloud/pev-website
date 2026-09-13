(function () {
  document.addEventListener('DOMContentLoaded', function () {
    initHeroHeadline();
    initAtAGlance();
    initScrollReveal();
    initStats();
    initServices();
    initProjects();
    initGallery();
    initTeam();
    initCareers();
    initResources();
    initContactForm();
    initPartnerForm();
    initLangSelect();
    initSiteSettings();
    initAboutAndFooter();
    document.getElementById('year').textContent = new Date().getFullYear();
  });

  /* ---------- Hero (rotating headline) ---------- */
  async function initHeroHeadline() {
    const el = document.getElementById('heroHeadline');
    const sub = document.getElementById('heroSub');
    if (!el) return;

    let headlines = [{ text: 'Transform Your Business with Data-Driven Solutions', accentWord: 'Data-Driven' }];
    let subtext = "We pair board-level strategy with hands-on execution — the financial modelling, operations redesign, and technology roadmaps that turn a plan into a quarter's results.";

    try {
      const copy = await window.PEVApi.getSiteCopy();
      if (Array.isArray(copy.heroHeadlines) && copy.heroHeadlines.length) headlines = copy.heroHeadlines;
      if (copy.heroSubtext) subtext = copy.heroSubtext;
    } catch (e) {
      // Fall back to the defaults above if the API is unreachable.
    }

    if (sub) sub.textContent = subtext;

    function renderHeadline(headline, animate) {
      el.innerHTML = '';
      const words = headline.text.split(' ');
      words.forEach((word, i) => {
        const isAccent = headline.accentWord && word.replace(/[.,!]$/, '') === headline.accentWord;
        const span = document.createElement('span');
        span.className = 'word' + (isAccent ? ' accent-word' : '');
        if (animate) {
          span.style.animationDelay = (i * 120) + 'ms';
        } else {
          // No animation on rotation — but the base CSS rule for .word
          // starts at opacity:0 (so the *first* render can animate in via
          // the word-reveal keyframes). Disabling the animation here
          // removes that "forwards" fill along with it, so without this
          // the word would revert to the base opacity:0 and never reappear.
          span.style.animation = 'none';
          span.style.opacity = '1';
          span.style.transform = 'none';
        }
        // Spacing comes from CSS (margin-right on .word), not a trailing
        // space character — a literal trailing space inside an
        // inline-block can get silently trimmed by the browser at
        // certain line-wrap points, which is what made words look
        // crowded together.
        span.textContent = word;
        el.appendChild(span);
      });
    }

    let idx = 0;
    renderHeadline(headlines[0], true);

    if (headlines.length > 1) {
      setInterval(() => {
        idx = (idx + 1) % headlines.length;
        el.style.transition = 'opacity 500ms ease';
        el.style.opacity = '0';
        setTimeout(() => {
          renderHeadline(headlines[idx], false);
          el.style.opacity = '1';
        }, 500);
      }, 5000);
    }
  }

  /* ---------- About + Core Values + Footer tagline ---------- */
  async function initAboutAndFooter() {
    try {
      const copy = await window.PEVApi.getSiteCopy();
      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el && value !== undefined) el.textContent = value;
      };
      setText('aboutEyebrow', copy.aboutEyebrow);
      setText('aboutHeadline', copy.aboutHeadline);
      setText('aboutParagraph1', copy.aboutParagraph1);
      setText('aboutParagraph2', copy.aboutParagraph2);
      setText('aboutStat1Value', copy.aboutStat1Value);
      setText('aboutStat1Label', copy.aboutStat1Label);
      setText('aboutStat2Value', copy.aboutStat2Value);
      setText('aboutStat2Label', copy.aboutStat2Label);
      setText('footerTagline', copy.footerTagline);
    } catch (e) {
      // Static fallback text already in the HTML/left blank is acceptable if this fails.
    }

    const grid = document.getElementById('coreValuesGrid');
    if (grid) {
      try {
        const values = await window.PEVApi.getCoreValues();
        grid.innerHTML = '';
        values.forEach((v) => {
          const card = document.createElement('div');
          card.className = 'glass-card value-card';
          card.setAttribute('data-reveal', '');
          card.innerHTML = `<span class="value-index">${escapeHtml(v.title)}</span><h4>${escapeHtml(v.title)}</h4><p>${escapeHtml(v.description)}</p>`;
          grid.appendChild(card);
        });
        initScrollReveal();
      } catch (e) {
        grid.innerHTML = '<p>Could not load our values right now.</p>';
      }
    }
  }

  /* ---------- "PEV at a glance" — a single synced rotation driving both
     the hero visual panel and its caption: open roles, active projects,
     recent announcements, and (if configured) live external business-news
     headlines. Each item shows a real gallery photo when one exists for
     its category; otherwise a themed gradient fallback (so this looks
     right today with an empty gallery, and automatically starts showing
     real photos the moment any are uploaded in Admin -> Gallery). ---------- */
  const GLANCE_FALLBACKS = {
    career: 'linear-gradient(135deg,#2a3a5c,#121b2e)',
    project: 'linear-gradient(135deg,#1b2740,#0b1220)',
    announcement: 'linear-gradient(135deg,#a06f2c,#0b1220)',
    news: 'linear-gradient(135deg,#3a2a5c,#0b1220)',
  };
  const GLANCE_GALLERY_CATEGORY = {
    career: 'Team',
    project: 'Projects',
    announcement: 'Events',
    news: 'Events',
  };

  async function initAtAGlance() {
    const caption = document.getElementById('ledgerCaption');
    const slideBg = document.getElementById('heroSlideBg');
    if (!caption) return;

    const items = [];
    let galleryByCategory = {};
    try {
      const gallery = await window.PEVApi.getGallery();
      gallery.forEach((g) => {
        if (g.photoUrl && !galleryByCategory[g.category]) galleryByCategory[g.category] = g.photoUrl;
      });
    } catch (e) {
      // Gallery is optional context here — a missing photo just means we
      // fall back to a themed gradient, so a failed fetch isn't fatal.
    }

    try {
      const glance = await fetch('/api/at-a-glance').then((r) => r.json());
      glance.openRoles.forEach((title) => items.push({ text: `Now hiring — ${title}`, kind: 'career' }));
      glance.activeProjects.forEach((title) => items.push({ text: `Active engagement — ${title}`, kind: 'project' }));
      glance.announcements.forEach((text) => items.push({ text, kind: 'announcement' }));
    } catch (e) {
      console.error('Failed to load "at a glance" data', e);
    }

    try {
      const news = await fetch('/api/news/external').then((r) => r.json());
      if (news.configured) {
        news.articles.forEach((a) => items.push({ text: `In the news — ${a.title}${a.source ? ` (${a.source})` : ''}`, kind: 'news' }));
      }
    } catch (e) {
      // External news is optional — fail silently.
    }

    if (!items.length) {
      caption.textContent = 'Strategy, capital, and operations advisory for East Africa\u2019s most ambitious businesses.';
      return;
    }

    let idx = 0;
    function show() {
      const item = items[idx];
      const photo = galleryByCategory[GLANCE_GALLERY_CATEGORY[item.kind]];
      caption.style.transition = 'opacity 400ms ease';
      caption.style.opacity = '0';
      if (slideBg) slideBg.style.opacity = '0';
      setTimeout(() => {
        caption.textContent = item.text;
        caption.style.opacity = '1';
        if (slideBg) {
          slideBg.style.background = photo ? `center / cover no-repeat url("${photo}")` : GLANCE_FALLBACKS[item.kind];
          slideBg.style.opacity = '1';
        }
        idx = (idx + 1) % items.length;
      }, 400);
    }
    show();
    if (items.length > 1) setInterval(show, 5000);
  }


  /* ---------- Scroll reveal ---------- */
  function initScrollReveal() {
    const targets = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window) || !targets.length) {
      targets.forEach((t) => t.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    targets.forEach((t) => io.observe(t));
  }

  /* ---------- Stats ---------- */
  async function initStats() {
    const cards = document.querySelectorAll('#heroStats .stat-card');
    if (!cards.length) return;
    try {
      const stats = await window.PEVApi.getStats();
      const values = [stats.successRate, stats.clientsServed, stats.support, stats.certified];
      cards.forEach((card, i) => {
        const value = card.querySelector('.stat-value');
        value.classList.remove('skeleton');
        value.style.minHeight = '';
        value.textContent = values[i] || '—';
      });
    } catch (e) {
      cards.forEach((card) => {
        const value = card.querySelector('.stat-value');
        value.classList.remove('skeleton');
        value.textContent = '—';
      });
      console.error('Failed to load stats', e);
    }
  }

  /* ---------- Services / Projects (shared "apply" flow) ---------- */
  function renderApplyCard(item, type) {
    const card = document.createElement('article');
    card.className = 'glass-card service-card';
    card.setAttribute('data-reveal', '');
    card.innerHTML = `
      <div class="service-icon"><i class="${escapeAttr(item.icon)}"></i></div>
      <span class="service-cat">${escapeHtml(item.category)}</span>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.summary)}</p>
      <button type="button" class="btn btn-ghost btn-sm apply-toggle" style="margin-top:.5rem; align-self:flex-start">Apply</button>
      <form class="apply-item-form" novalidate style="display:none; margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border-hairline)">
        <div class="form-row">
          <label>What do you need?</label>
          <textarea name="details" required placeholder="Briefly describe what you're looking for…"></textarea>
          <span class="field-error"></span>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Submit</button>
        <div class="form-status apply-item-status"></div>
      </form>
    `;

    const toggleBtn = card.querySelector('.apply-toggle');
    const form = card.querySelector('.apply-item-form');

    toggleBtn.addEventListener('click', () => {
      if (!window.PEVApi.isAuthed()) {
        window.location.href = '/login';
        return;
      }
      const user = window.PEVApi.getUser();
      if (user && user.role === 'admin') {
        alert('Staff accounts can\'t submit requests — log in as a client or company to apply.');
        return;
      }
      const isOpen = form.style.display !== 'none';
      form.style.display = isOpen ? 'none' : 'block';
      toggleBtn.textContent = isOpen ? 'Apply' : 'Cancel';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = form.querySelector('.apply-item-status');
      const errEl = form.querySelector('.field-error');
      const submitBtn = form.querySelector('button[type="submit"]');
      errEl.textContent = '';
      status.className = 'form-status apply-item-status';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        await window.PEVApi.submitRequest({
          service: item.title,
          details: form.querySelector('[name="details"]').value.trim(),
          type,
        });
        status.textContent = 'Request submitted — check your portal for status updates.';
        status.className = 'form-status apply-item-status success show';
        form.reset();
      } catch (err) {
        let msg = err.message || 'Something went wrong.';
        if (err.fields) {
          errEl.textContent = Object.values(err.fields)[0] || '';
          msg = 'Please fix the highlighted field.';
        }
        status.textContent = msg;
        status.className = 'form-status apply-item-status error show';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    });

    return card;
  }

  async function initServices() {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;
    try {
      const services = await window.PEVApi.getServices();
      grid.innerHTML = '';
      services.forEach((svc) => {
        const card = renderApplyCard(svc, 'service');
        card.id = 'service-' + svc.id.replace(/^svc-/, '');
        grid.appendChild(card);
      });
      initScrollReveal();
      scrollToHashTarget();
    } catch (e) {
      grid.innerHTML = '<p>Services are temporarily unavailable. Please try again shortly.</p>';
      console.error('Failed to load services', e);
    }
  }

  // Services are rendered async, so a plain #service-finance link in the
  // URL loads before the target element exists — the browser's native
  // anchor jump has nothing to scroll to yet. This re-does that jump once
  // the card is actually on the page, and gives it a brief highlight so
  // it's obvious which one you clicked.
  function scrollToHashTarget() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const target = document.querySelector(hash);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('target-highlight');
    setTimeout(() => target.classList.remove('target-highlight'), 1800);
  }

  // Same-page dropdown clicks: scroll smoothly instead of relying on the
  // browser's instant native jump, and re-run the highlight even if the
  // hash string doesn't change (clicking the same service twice in a row).
  document.addEventListener('click', (e) => {
    const link = e.target.closest('#servicesMenu a[href^="#"]');
    if (!link) return;
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    history.replaceState(null, '', link.getAttribute('href'));
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('target-highlight');
    void target.offsetWidth; // restart the animation if it's already mid-flight
    target.classList.add('target-highlight');
    setTimeout(() => target.classList.remove('target-highlight'), 1800);
  });

  async function initProjects() {
    const grid = document.getElementById('projectsGrid');
    if (!grid) return;
    try {
      const projects = await window.PEVApi.getProjects();
      grid.innerHTML = '';
      projects.forEach((proj) => grid.appendChild(renderApplyCard(proj, 'project')));
      initScrollReveal();
    } catch (e) {
      grid.innerHTML = '<p>Projects are temporarily unavailable. Please try again shortly.</p>';
      console.error('Failed to load projects', e);
    }
  }

  /* ---------- Partner application ---------- */
  function initPartnerForm() {
    const form = document.getElementById('partnerForm');
    if (!form) return;
    const status = document.getElementById('partnerStatus');
    const submitBtn = document.getElementById('partnerSubmit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('err-pf-message').textContent = '';
      status.className = 'form-status';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        const res = await window.PEVApi.applyAsPartner({
          name: document.getElementById('pf-name').value.trim(),
          email: document.getElementById('pf-email').value.trim(),
          organization: document.getElementById('pf-org').value.trim(),
          partnershipType: document.getElementById('pf-type').value,
          message: document.getElementById('pf-message').value.trim(),
        });
        status.textContent = res.message;
        status.className = 'form-status success show';
        form.reset();
      } catch (err) {
        if (err.fields) {
          Object.entries(err.fields).forEach(([field, msg]) => {
            const el = document.getElementById('err-pf-' + field);
            if (el) el.textContent = msg;
          });
        }
        status.textContent = err.message || 'Something went wrong. Please try again.';
        status.className = 'form-status error show';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit application';
      }
    });
  }

  /* ---------- Gallery + Lightbox ---------- */
  let galleryItems = [];
  let lightboxIndex = 0;

  async function initGallery() {
    const grid = document.getElementById('galleryGrid');
    const filters = document.getElementById('galleryFilters');
    if (!grid) return;

    async function load(category) {
      grid.innerHTML = '<div class="gallery-item skeleton"></div><div class="gallery-item skeleton"></div><div class="gallery-item skeleton"></div>';
      try {
        const items = await window.PEVApi.getGallery(category);
        galleryItems = items;
        grid.innerHTML = '';
        items.forEach((item, i) => {
          const fig = document.createElement('figure');
          fig.className = 'gallery-item';
          fig.tabIndex = 0;
          fig.setAttribute('role', 'button');
          fig.setAttribute('aria-label', 'Open image: ' + item.title);
          const bg = item.photoUrl
            ? `<img src="${escapeAttr(item.photoUrl)}" alt="${escapeAttr(item.title)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
            : `<div class="tile-bg">${escapeHtml(item.category)}</div>`;
          fig.innerHTML = `${bg}<figcaption>${escapeHtml(item.title)}</figcaption>`;
          fig.addEventListener('click', () => openLightbox(i));
          fig.addEventListener('keypress', (e) => { if (e.key === 'Enter') openLightbox(i); });
          grid.appendChild(fig);
        });
      } catch (e) {
        grid.innerHTML = '<p>Gallery is temporarily unavailable.</p>';
        console.error('Failed to load gallery', e);
      }
    }

    if (filters) {
      filters.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        filters.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        load(btn.dataset.filter);
      });
    }

    load('All');

    const lightbox = document.getElementById('lightbox');
    const closeBtn = document.getElementById('lightboxClose');
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (prevBtn) prevBtn.addEventListener('click', () => stepLightbox(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => stepLightbox(1));
    if (lightbox) {
      lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    }
    document.addEventListener('keydown', (e) => {
      if (!lightbox || !lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    });
  }

  function openLightbox(i) {
    lightboxIndex = i;
    renderLightbox();
    document.getElementById('lightbox').classList.add('open');
  }
  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
  }
  function stepLightbox(dir) {
    if (!galleryItems.length) return;
    lightboxIndex = (lightboxIndex + dir + galleryItems.length) % galleryItems.length;
    renderLightbox();
  }
  function renderLightbox() {
    const item = galleryItems[lightboxIndex];
    const caption = document.getElementById('lightboxCaption');
    if (item && caption) caption.textContent = `${item.title} — ${item.category}`;
  }

  /* ---------- Team ---------- */
  async function initTeam() {
    const teamGrid = document.getElementById('teamGrid');
    const dirGrid = document.getElementById('directorsGrid');
    if (teamGrid) {
      try {
        const team = await window.PEVApi.getTeam();
        teamGrid.innerHTML = '';
        team.forEach((p) => teamGrid.appendChild(personCard(p)));
      } catch (e) {
        teamGrid.innerHTML = '<p>Team information is temporarily unavailable.</p>';
      }
    }
    if (dirGrid) {
      try {
        const directors = await window.PEVApi.getDirectors();
        dirGrid.innerHTML = '';
        directors.forEach((p) => dirGrid.appendChild(personCard(p)));
      } catch (e) {
        dirGrid.innerHTML = '<p>Board information is temporarily unavailable.</p>';
      }
    }
  }

  function personCard(p) {
    const card = document.createElement('div');
    card.className = 'glass-card person-card';
    card.setAttribute('data-reveal', '');
    const initials = p.name.split(' ').map((n) => n[0]).join('').slice(0, 2);
    const photo = p.photoUrl
      ? `<img src="${escapeAttr(p.photoUrl)}" alt="${escapeAttr(p.name)}" class="person-photo" style="object-fit:cover">`
      : `<div class="person-photo">${escapeHtml(initials)}</div>`;
    card.innerHTML = `
      ${photo}
      <span class="person-role">${escapeHtml(p.role)}</span>
      <h4 style="margin-bottom:.35em">${escapeHtml(p.name)}</h4>
      ${p.bio ? `<p style="font-size:var(--step--1)">${escapeHtml(p.bio)}</p>` : ''}
    `;
    return card;
  }

  /* ---------- Careers ---------- */
  async function initCareers() {
    const grid = document.getElementById('careersGrid');
    if (!grid) return;
    try {
      const jobs = await window.PEVApi.getCareers();
      grid.innerHTML = '';
      jobs.forEach((job) => {
        const card = document.createElement('div');
        card.className = 'glass-card';
        card.setAttribute('data-reveal', '');
        card.innerHTML = `
          <div class="job-card">
            <div>
              <h4 style="margin-bottom:.25em">${escapeHtml(job.title)}</h4>
              <span class="job-meta">${escapeHtml(job.location)} · ${escapeHtml(job.type)}</span>
            </div>
            <button type="button" class="btn btn-ghost btn-sm apply-toggle">Apply</button>
          </div>
          <form class="apply-form" novalidate style="display:none; margin-top:1.25rem; padding-top:1.25rem; border-top:1px solid var(--border-hairline)">
            <div class="form-row">
              <label>Full name</label>
              <input type="text" name="name" required>
            </div>
            <div class="form-row">
              <label>Email</label>
              <input type="email" name="email" required>
            </div>
            <div class="form-row">
              <label>Phone (optional)</label>
              <input type="tel" name="phone">
            </div>
            <div class="form-row">
              <label>Years of experience</label>
              <input type="number" name="yearsExperience" min="0" step="0.5" required>
            </div>
            <div class="form-row">
              <label>Education level</label>
              <select name="education" required>
                <option value="">Select…</option>
                <option value="high_school">High school</option>
                <option value="diploma">Diploma</option>
                <option value="bachelors">Bachelor's degree</option>
                <option value="masters">Master's degree</option>
                <option value="phd">PhD</option>
              </select>
            </div>
            <div class="form-row">
              <label>Cover message</label>
              <textarea name="coverMessage" required placeholder="Tell us why you're a fit for this role…"></textarea>
            </div>
            <div class="form-row">
              <label>Resume / CV (PDF or Word, max 5MB)</label>
              <input type="file" name="resume" accept=".pdf,.doc,.docx" required>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Submit application</button>
            <div class="form-status apply-status"></div>
          </form>
        `;

        const toggleBtn = card.querySelector('.apply-toggle');
        const form = card.querySelector('.apply-form');
        toggleBtn.addEventListener('click', () => {
          const isOpen = form.style.display !== 'none';
          form.style.display = isOpen ? 'none' : 'block';
          toggleBtn.textContent = isOpen ? 'Apply' : 'Cancel';
        });

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const status = form.querySelector('.apply-status');
          const submitBtn = form.querySelector('button[type="submit"]');
          status.className = 'form-status apply-status';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submitting…';
          try {
            const formData = new FormData(form);
            const res = await window.PEVApi.applyForJob(job.id, formData);
            status.textContent = res.message;
            status.className = 'form-status apply-status success show';
            form.reset();
          } catch (err) {
            let msg = err.message || 'Something went wrong.';
            if (err.fields) msg = Object.values(err.fields).join(' ');
            status.textContent = msg;
            status.className = 'form-status apply-status error show';
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit application';
          }
        });

        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = '<p>Openings are temporarily unavailable.</p>';
    }
  }

  /* ---------- Resources ---------- */
  async function initResources() {
    const grid = document.getElementById('resourcesGrid');
    if (!grid) return;
    try {
      const resources = await window.PEVApi.getResources();
      if (!resources.length) {
        grid.innerHTML = '<p>No resources published yet — check back soon.</p>';
        return;
      }
      grid.innerHTML = '';
      resources.forEach((r) => {
        const link = r.fileUrl || r.linkUrl;
        const card = document.createElement('div');
        card.className = 'glass-card';
        card.setAttribute('data-reveal', '');
        card.innerHTML = `
          <span class="service-cat">${escapeHtml(r.category || 'Resource')}</span>
          <h4 style="margin:.4em 0">${escapeHtml(r.title)}</h4>
          <p style="font-size:var(--step--1)">${escapeHtml(r.description)}</p>
          ${link ? `<a href="${escapeAttr(link)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Download <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : '<span style="font-size:var(--step--1); color:var(--text-muted)">Coming soon</span>'}
        `;
        grid.appendChild(card);
      });
      initScrollReveal();
    } catch (e) {
      grid.innerHTML = '<p>Resources are temporarily unavailable.</p>';
    }
  }

  /* ---------- Site settings (contact info, socials) ---------- */
  async function initSiteSettings() {
    try {
      const settings = await window.PEVApi.getSettings();
      const list = document.querySelector('.contact-info-list');
      if (list) {
        const items = list.querySelectorAll('li');
        if (items[0]) items[0].innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(settings.address)}`;
        if (items[1]) items[1].innerHTML = `<i class="fa-solid fa-phone"></i> ${escapeHtml(settings.phone)}`;
        if (items[2]) items[2].innerHTML = `<i class="fa-solid fa-envelope"></i> ${escapeHtml(settings.email)}`;
      }
      const socialLinks = document.querySelectorAll('.social-row a');
      if (socialLinks[0] && settings.linkedin) socialLinks[0].href = settings.linkedin;
      if (socialLinks[1] && settings.twitter) socialLinks[1].href = settings.twitter;
      if (socialLinks[2] && settings.instagram) socialLinks[2].href = settings.instagram;
    } catch (e) {
      // Static fallback content already in the HTML is fine if this fails.
    }
  }

  /* ---------- Contact form ---------- */
  function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    const status = document.getElementById('contactStatus');
    const submitBtn = document.getElementById('contactSubmit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      status.className = 'form-status';

      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        message: form.message.value.trim(),
      };

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      try {
        const res = await window.PEVApi.sendContact(payload);
        status.textContent = res.message;
        status.className = 'form-status success show';
        form.reset();
      } catch (err) {
        if (err.fields) {
          Object.entries(err.fields).forEach(([field, msg]) => {
            const errEl = document.getElementById('err-' + field);
            const input = form.querySelector(`[name="${field}"]`);
            if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
            if (input) input.style.borderColor = 'var(--signal-red)';
          });
          status.textContent = 'Please fix the highlighted fields.';
        } else {
          status.textContent = err.message || 'Something went wrong. Please try again.';
        }
        status.className = 'form-status error show';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send message';
      }
    });
  }

  function clearFieldErrors(form) {
    form.querySelectorAll('.field-error').forEach((el) => el.classList.remove('show'));
    form.querySelectorAll('input, textarea').forEach((el) => (el.style.borderColor = ''));
  }

  /* ---------- Language selector (lightweight i18n placeholder) ---------- */
  function initLangSelect() {
    const select = document.getElementById('langSelect');
    if (!select) return;
    select.addEventListener('change', () => {
      document.documentElement.setAttribute('lang', select.value);
      // Full translation catalog is a follow-up; UI is wired end-to-end today.
    });
  }

  /* ---------- utils ---------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }
})();
