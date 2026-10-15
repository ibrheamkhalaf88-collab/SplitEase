/* ============================================================
   Onboarding — Interactive Hands-On Coachmarks
   ------------------------------------------------------------
   بدلاً من نصوص بس، الجولة دي بتقود المستخدم خطوة بخطوة:
   1. يكتب اسمه
   2. يعمل أول مجموعة
   3. يضيف أعضاء
   4. يسجل أول مصروف
   كل خطوة بتتأكد إن المستخدم أنجزها قبل ما تكمل.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'splitease-onboarding-v2';
  const EDGE = 16;
  const GAP = 14;
  const RING_PAD = 10;
  const SETTLE_MS = 300;

  function tr(key, fallback) {
    try {
      if (typeof window.t === 'function') {
        const v = window.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) { /* i18n not ready */ }
    return fallback;
  }

  /* ── Step Definitions ──
     Each step can be:
     - centered: modal in middle (welcome, name input, done)
     - targeted: spotlights an element, waits for user action
     - action: waits for a specific user action (click, input, etc.)
  */
  const STEPS = [
    {
      id: 'welcome',
      type: 'centered',
      title: tr('tour_step_welcome_title', 'أهلاً بيك في SplitEase! 👋'),
      body: tr('tour_step_welcome_body', 'بتطبيق يقسّم مصاريف الشلة ويقولك مين عليه مين — من غير ما تحسب بإيدك. هنتعلّم سوا في دقيقة.'),
      cta: tr('tour_start', 'يلا نبدأ'),
    },
    {
      id: 'name',
      type: 'input',
      title: tr('tour_step_name_title', 'أولاً: اسمك؟'),
      body: tr('tour_step_name_body', 'اكتب اسمك عشان يظهر في المجموعات والمصاريف. هيتحفظ محلياً على جهازك.'),
      placeholder: tr('tour_step_name_placeholder', 'مثال: أحمد'),
      validate: (val) => val.trim().length >= 2,
      onComplete: (val) => { window.setLocalUserName?.(val.trim()); },
      successMsg: tr('tour_step_name_done', 'تمام، اسمك محفوظ ✅'),
    },
    {
      id: 'create-group',
      type: 'action',
      title: tr('tour_step_create_group_title', 'الخطوة التانية: اصنع أول شلة'),
      body: tr('tour_step_create_group_body', 'اضغط «مجموعة جديدة» وسمّي شلتك (مثلاً: شقة الطلاب، رحلة الغردقة).'),
      trigger: 'groups',           // navigate to groups page
      targetSel: '#groupsGrid .group-card, .empty-state button', // first group card OR create button
      actionText: tr('create_group', 'مجموعة جديدة'),
      successMsg: tr('tour_step_create_group_done', 'ممتاز! شلتك جاهزة ✅'),
      waitFor: () => window.state?.groups?.length > 0,
    },
    {
      id: 'add-members',
      type: 'action',
      title: tr('tour_step_add_member_title', 'الخطوة التالتة: ضيف أصحابك'),
      body: tr('tour_step_add_member_body', 'اكتب أسماء اللي في الشلة. كل واحد هيتحفظ معه رصيده.'),
      trigger: 'group-edit',       // will be set dynamically to the new group's edit page
      targetSel: '#newMemberName',
      actionText: tr('add_member', 'إضافة'),
      successMsg: tr('tour_step_add_member_done', 'أصحابك اتضافوا ✅'),
      waitFor: () => {
        const g = window.state?.groups?.[0];
        return g?.members && g.members.length >= 2;
      },
    },
    {
      id: 'add-expense',
      type: 'action',
      title: tr('tour_step_add_expense_title', 'الخطوة الأخيرة: سجّل أول مصروف'),
      body: tr('tour_step_add_expense_body', 'اضغط زر + بالأسفل، اكتب المبلغ والفئة، اختار مين دفع، واضغط حفظ.'),
      trigger: 'group-detail',     // navigate to the group page
      targetSel: '#fab',
      actionText: tr('add_expense', 'مصروف جديد'),
      successMsg: tr('tour_step_add_expense_done', 'برافو! أول مصروف اتسجّل ✅ — هتلاقيه في المجموعة والتقارير.'),
      waitFor: () => {
        // Check if any expense exists in the first group
        return window.__onboardingExpenseAdded === true;
      },
    },
    {
      id: 'done',
      type: 'centered',
      title: tr('tour_step_all_done_title', 'خلّصنا! 🎉'),
      body: tr('tour_step_all_done_body', 'دلوقتي تقدر: تضيف مصاريف، تشوف مين عليه مين، تعمل تسويات، وتصدر تقارير. كل حاجة بتتتحفظ أوتوماتيك.'),
      cta: tr('tour_step_all_done_cta', 'ابدأ دلوقتي'),
      finish: true,
    },
  ];

  let ui = null;
  let index = 0;
  let running = false;
  let restoreFocus = null;
  let tourTarget = null;
  let navToken = 0;
  let centeredStep = true;
  let currentStepData = null; // for action steps: { resolve, startTime }

  const prefersReduced = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

  /* ── Storage ── */
  function hasCompleted() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch (e) { return false; }
  }
  function markCompleted() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* private mode */ }
  }
  function clearCompleted() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  /* ── DOM ── */
  function build() {
    if (ui) return ui;

    const wrap = document.createElement('div');
    wrap.className = 'tour';
    wrap.hidden = true;

    const bands = ['top', 'bottom', 'start', 'end'].map(() => {
      const el = document.createElement('div');
      el.className = 'tour-band';
      el.setAttribute('aria-hidden', 'true');
      return el;
    });

    const ring = document.createElement('div');
    ring.className = 'tour-ring';
    ring.setAttribute('aria-hidden', 'true');

    const card = document.createElement('div');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'tourTitle');
    card.setAttribute('aria-describedby', 'tourBody');
    card.tabIndex = -1;
    card.innerHTML = [
      '<p class="tour-count" id="tourCount" aria-live="polite"></p>',
      '<h2 class="tour-title" id="tourTitle"></h2>',
      '<p class="tour-body" id="tourBody"></p>',
      '<div id="tourInputWrap" style="display:none;margin:12px 0"></div>',
      '<div class="tour-dots" id="tourDots" aria-hidden="true"></div>',
      '<div class="tour-actions">',
      '  <button type="button" class="btn btn-ghost" data-tour-act="skip" id="tourSkip"></button>',
      '  <div class="tour-actions-main">',
      '    <button type="button" class="btn btn-ghost" data-tour-act="back" id="tourBack"></button>',
      '    <button type="button" class="btn btn-primary" data-tour-act="next" id="tourNext"></button>',
      '  </div>',
      '</div>',
    ].join('');

    wrap.append(...bands, ring, card);
    document.body.appendChild(wrap);

    ui = {
      wrap, card, ring,
      bands,
      count: card.querySelector('#tourCount'),
      title: card.querySelector('#tourTitle'),
      body: card.querySelector('#tourBody'),
      inputWrap: card.querySelector('#tourInputWrap'),
      dots: card.querySelector('#tourDots'),
      skip: card.querySelector('#tourSkip'),
      back: card.querySelector('#tourBack'),
      next: card.querySelector('#tourNext'),
    };

    ui.skip.textContent = tr('tour_skip', 'تخطي');
    ui.back.textContent = tr('tour_back', 'رجوع');

    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tour-act]');
      if (!btn) return;
      if (btn.dataset.tourAct === 'next') next();
      else if (btn.dataset.tourAct === 'back') prev();
      else finish();
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); prev(); }
      else if (e.key === 'Tab') trapFocus(e);
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT') next();
    });

    return ui;
  }

  function focusables() {
    return [...ui.card.querySelectorAll('button:not([hidden]), input:not([hidden])')];
  }

  function trapFocus(e) {
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  /* ── Geometry ── */
  function resolveTarget(step) {
    for (const sel of step.targetSel ? [step.targetSel] : (step.targets || [])) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { el, selector: sel };
    }
    return null;
  }

  function scrollIntoView(target) {
    return new Promise((resolve) => {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReduced() ? 'auto' : 'smooth' });
      if (prefersReduced()) { requestAnimationFrame(resolve); return; }
      let settled = false, lastY = -1, still = 0;
      const onScroll = () => {
        const y = Math.round(window.scrollY);
        if (y === lastY) { if (++still > 3) done(); }
        else { still = 0; lastY = y; }
      };
      const done = () => { if (settled) return; settled = true; window.removeEventListener('scroll', onScroll, true); resolve(); };
      window.addEventListener('scroll', onScroll, true);
      setTimeout(done, SETTLE_MS + 400);
    });
  }

  function paintBands(rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const [top, bottom, start, end] = ui.bands;
    if (!rect) {
      top.style.cssText = 'top:0;left:0;width:100%;height:100%';
      bottom.style.cssText = end.style.cssText = start.style.cssText = 'display:none';
      return;
    }
    const x = clamp(rect.left - RING_PAD, 0, vw);
    const y = clamp(rect.top - RING_PAD, 0, vh);
    const right = clamp(rect.right + RING_PAD, 0, vw);
    const bottomEdge = clamp(rect.bottom + RING_PAD, 0, vh);
    const midHeight = Math.max(0, bottomEdge - y);
    top.style.cssText = `top:0;left:0;width:${vw}px;height:${y}px`;
    bottom.style.cssText = `top:${bottomEdge}px;left:0;width:${vw}px;height:${Math.max(0, vh - bottomEdge)}px`;
    start.style.cssText = `top:${y}px;left:0;width:${x}px;height:${midHeight}px`;
    end.style.cssText = `top:${y}px;right:0;width:${Math.max(0, vw - right)}px;height:${midHeight}px`;
  }

  function paintRing(rect) {
    if (!rect) { ui.ring.hidden = true; return; }
    ui.ring.hidden = false;
    ui.ring.style.cssText = `top:${rect.top - RING_PAD}px;left:${rect.left - RING_PAD}px;width:${rect.width + RING_PAD * 2}px;height:${rect.height + RING_PAD * 2}px`;
  }

  function placeCard(rect) {
    const card = ui.card, vw = window.innerWidth, vh = window.innerHeight;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left, top;
    if (!rect) { left = (vw - cw) / 2; top = (vh - ch) / 2; }
    else {
      const below = rect.bottom + GAP, above = rect.top - GAP - ch;
      if (below + ch + EDGE <= vh) top = below;
      else if (above >= EDGE) top = above;
      else top = (vh - ch) / 2;
      const beside = rect.left - GAP - cw, other = rect.right + GAP;
      if (beside >= EDGE) left = beside;
      else if (other + cw + EDGE <= vw) left = other;
      else left = rect.left + rect.width / 2 - cw / 2;
    }
    card.style.left = Math.round(clamp(left, EDGE, vw - cw - EDGE)) + 'px';
    card.style.top = Math.round(clamp(top, EDGE, vh - ch - EDGE)) + 'px';
  }

  function reposition() {
    if (!running) return;
    if (!tourTarget && !centeredStep) return;
    const rect = tourTarget ? tourTarget.getBoundingClientRect() : null;
    const live = rect && rect.width ? rect : null;
    paintBands(live);
    paintRing(live);
    placeCard(live);
  }

  /* ── Step Renderers ── */
  function renderCentered(step) {
    ui.inputWrap.style.display = 'none';
    ui.inputWrap.innerHTML = '';
    centeredStep = true;
    tourTarget = null;
    ui.card.classList.add('is-center');
    ui.count.style.direction = 'ltr';
    ui.count.style.display = 'inline-block';
    ui.count.textContent = '';
    ui.title.textContent = step.title;
    ui.body.textContent = step.body;
    ui.next.textContent = step.cta || tr('tour_next', 'التالي');
    ui.back.hidden = index === 0;
    updateDots();
    paintBands(null);
    paintRing(null);
    placeCard(null);
    ui.wrap.hidden = false;
    ui.card.focus({ preventScroll: true });
  }

  function renderInput(step) {
    centeredStep = true;
    tourTarget = null;
    ui.card.classList.add('is-center');
    ui.count.style.direction = 'ltr';
    ui.count.style.display = 'inline-block';
    ui.count.textContent = `${index + 1} / ${STEPS.length}`;
    ui.title.textContent = step.title;
    ui.body.textContent = step.body;
    ui.inputWrap.style.display = 'block';
    ui.inputWrap.innerHTML = `
      <input type="text" id="tourInput" class="form-input" placeholder="${step.placeholder || ''}" autocomplete="off" aria-label="${step.title}">
    `;
    ui.next.textContent = tr('tour_next', 'التالي');
    ui.next.disabled = true;
    ui.back.hidden = index === 0;
    updateDots();
    paintBands(null); paintRing(null); placeCard(null);
    ui.wrap.hidden = false;

    const input = document.getElementById('tourInput');
    input.focus({ preventScroll: true });
    input.addEventListener('input', () => {
      const ok = step.validate ? step.validate(input.value) : input.value.trim().length > 0;
      ui.next.disabled = !ok;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !ui.next.disabled) next();
    });
  }

  async function renderAction(step) {
    ui.inputWrap.style.display = 'none';
    ui.inputWrap.innerHTML = '';
    centeredStep = false;
    ui.card.classList.remove('is-center');

    // Navigate if needed
    if (step.trigger && location.hash.slice(1) !== step.trigger) {
      location.hash = step.trigger;
      await wait(prefersReduced() ? 60 : 420);
    }

    ui.count.style.direction = 'ltr';
    ui.count.style.display = 'inline-block';
    ui.count.textContent = `${index + 1} / ${STEPS.length}`;
    ui.title.textContent = step.title;
    ui.body.textContent = step.body;
    ui.next.textContent = step.actionText || tr('tour_next', 'التالي');
    ui.next.disabled = true; // wait for action
    ui.back.hidden = index === 0;
    updateDots();

    // Find and highlight target
    const hit = resolveTarget(step);
    if (!hit) {
      // Target not found, skip to next
      if (index < STEPS.length - 1) return go(index + 1);
      return finish();
    }
    tourTarget = hit.el;
    await scrollIntoView(tourTarget);
    const rect = tourTarget.getBoundingClientRect();
    paintBands(rect);
    paintRing(rect);
    placeCard(rect);
    ui.wrap.hidden = false;
    ui.card.focus({ preventScroll: true });

    // Set up action listener
    currentStepData = { step, startTime: Date.now() };
    setupActionListener(step, tourTarget);
  }

  function setupActionListener(step, target) {
    // Remove any previous listeners
    target.removeEventListener('click', currentStepData?.handler);
    target.removeEventListener('input', currentStepData?.handler);

    const handler = (e) => {
      if (step.waitFor && step.waitFor()) {
        // Action completed!
        cleanupActionListener();
        onActionComplete(step);
      }
    };

    // For FAB/button clicks
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      const btn = target.tagName === 'BUTTON' ? target : target.closest('button');
      btn.addEventListener('click', handler, { once: true });
    }
    // For input fields
    if (target.tagName === 'INPUT') {
      target.addEventListener('input', handler);
    }

    currentStepData.handler = handler;
    currentStepData.target = target;
  }

  function cleanupActionListener() {
    if (currentStepData?.target && currentStepData?.handler) {
      currentStepData.target.removeEventListener('click', currentStepData.handler);
      currentStepData.target.removeEventListener('input', currentStepData.handler);
    }
    currentStepData = null;
  }

  function onActionComplete(step) {
    ui.next.disabled = false;
    if (step.successMsg && typeof window.toast === 'function') {
      window.toast(step.successMsg, 'success');
    }
    if (step.onComplete) step.onComplete();
    // Auto-advance after a short delay
    setTimeout(() => next(), 1200);
  }

  function updateDots() {
    ui.dots.innerHTML = STEPS.map((_, i) =>
      `<span class="tour-dot${i === index ? ' is-on' : ''}"></span>`).join('');
  }

  /* ── Flow ── */
  async function go(nextIndex) {
    if (currentStepData) cleanupActionListener();
    index = nextIndex;
    const step = STEPS[index];
    if (!step) { finish(); return; }

    const token = ++navToken;

    if (step.type === 'centered') renderCentered(step);
    else if (step.type === 'input') renderInput(step);
    else if (step.type === 'action') await renderAction(step);

    if (token !== navToken) return;
  }

  async function swap(update) {
    ui.card.classList.add('is-swapping');
    await wait(prefersReduced() ? 0 : 130);
    await update();
    requestAnimationFrame(() => ui.card.classList.remove('is-swapping'));
  }

  function next() { swap(() => go(index + 1)); }
  function prev() { if (index > 0) { if (currentStepData) cleanupActionListener(); swap(() => go(index - 1)); } }

  function start(options) {
    options = options || {};
    if (running && !options.force) return;
    build();
    if (running) finish({ silent: true });
    running = true;
    index = 0;
    restoreFocus = document.activeElement;

    document.body.classList.add('tour-open');
    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    go(0);
  }

  function finish(options) {
    if (!running) return;
    if (currentStepData) cleanupActionListener();
    options = options || {};
    running = false;
    ui.wrap.hidden = true;
    tourTarget = null;
    document.body.classList.remove('tour-open');
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    markCompleted();

    if (restoreFocus && restoreFocus.isConnected && restoreFocus !== document.body) {
      restoreFocus.focus({ preventScroll: true });
    }
    if (options.silent) return;

    const last = STEPS[index];
    if (last && last.finish && typeof window.toast === 'function') {
      window.toast(tr('tour_finished_toast', 'يلا نبدأ بالشلّة الأولى'), 'success');
    } else if (last && last.id === 'welcome' && typeof window.toast === 'function') {
      window.toast(tr('tour_skipped_toast', 'تقدر ترجّع الشرح وقت ما تحب من الإعدادات'), 'info');
    }
  }

  function maybeStart() {
    if (hasCompleted()) return;
    const route = location.hash.slice(1);
    if (route === 'login' || route === 'register') return;
    setTimeout(start, 800);
  }

  // Expose for settings replay
  window.Onboarding = { start, finish, maybeStart, reset: clearCompleted, hasCompleted, STEPS };

  // Hook into app events for action steps
  window.addEventListener('hashchange', () => {
    if (!running) return;
    const step = STEPS[index];
    if (step?.type === 'action') {
      // Re-render action step on route change
      setTimeout(() => go(index), 100);
    }
  });

  // Listen for expense added to complete the last step
  const originalShowExpenseDetail = window.showExpenseDetail;
  window.showExpenseDetail = function(...args) {
    window.__onboardingExpenseAdded = true;
    return originalShowExpenseDetail?.apply(this, args);
  };

  // Auto-start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeStart);
  } else {
    maybeStart();
  }
})();