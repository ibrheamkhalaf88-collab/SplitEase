/* SplitEase — Cloud UI (الشات + المصاريف اللحظية + الصلاحيات)
 * Provides an online, real-time collaborative experience on top of Cloud.js
 */
(function () {
  'use strict';
  if (!window.Cloud || !Cloud.enabled) return;

  const state = { current: null, unsub: null, members: [], tab: 'expenses' };

  const C = {
    CURRENCY: 'EGP',
  };

  /* ── utility ── */
  function esc(s) { const d = document.createElement('div'); d.appendChild(document.createTextNode(s || '')); return d.innerHTML; }
  function money(n, cur) {
    cur = cur || C.CURRENCY;
    try {
      return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n || 0);
    } catch (e) { return (n || 0) + ' ' + cur; }
  }
  function shortTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }
  function content() { return document.getElementById('appContent'); }
  function toastMsg(m, type) { if (window.toast) toast(m, type); }
  function roomTypeLabel(t) { return t === 'family' ? 'عائلة' : 'شلة'; }
  function roomTypeBadge(t) {
    const family = t === 'family';
    return `<span class="badge" style="background:${family ? 'var(--primary)' : 'var(--border-light)'};
      color:${family ? '#fff' : 'var(--text)'};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">
      ${family ? '🏠' : '👥'} ${roomTypeLabel(t)}</span>`;
  }

  function requireAuth() {
    if (!Cloud.user) { renderLogin(); return false; }
    return true;
  }

  function renderLogin() {
    content().innerHTML = `
      <div class="auth-page">
        <div class="auth-box">
          <div class="auth-logo">S</div>
          <h1 class="auth-title">الشلة السحابية</h1>
          <p class="auth-subtitle">سجّل دخولك للمشاركة اللحظية</p>
          <div class="auth-form">
            <div class="form-group"><label class="form-label">البريد الإلكتروني</label>
              <input class="form-input" id="cEmail" type="email" dir="ltr" placeholder="you@email.com"></div>
            <div class="form-group"><label class="form-label">كلمة المرور</label>
              <input class="form-input" id="cPass" type="password" dir="ltr" placeholder="●●●●●●"></div>
            <div id="cErr" style="color:#EF4444;font-size:13px;display:none;margin-bottom:8px"></div>
            <button class="btn btn-primary btn-block btn-lg" onclick="CloudUI.login()">تسجيل الدخول</button>
            <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="CloudUI.register()">إنشاء حساب جديد</button>
            <button class="btn btn-ghost btn-block" onclick="navigate('groups')">رجوع للمجموعات المحلية</button>
          </div>
        </div>
      </div>`;
  }

  const UI = {
    /* ── routing (called by app.js handleRoute) ── */
    async route(parts) {
      if (!Cloud.user) { renderLogin(); return; }
      if (parts[0] === 'cloudgroup' && parts[1]) { await this.renderGroup(parts[1]); return; }
      await this.renderGroups();
    },

    /* Deep link entry point: <app>#join=CODE */
    async acceptInvite(code) {
      const clean = (code || '').trim().toUpperCase();
      if (!Cloud.user) {
        showModalSafe('دعوة لشلة', `
          <p style="margin-bottom:12px">سجّل دخولك الأول عشان توصل الدعوة دي.</p>
          <input class="form-input" id="aiCode" dir="ltr" value="${esc(clean)}" readonly>
          <button class="btn btn-primary btn-block btn-lg" style="margin-top:12px" onclick="navigate('login')">تسجيل الدخول</button>`);
        return;
      }
      try {
        const res = await Cloud.joinGroup(clean);
        closeModalSafe();
        toastMsg('تم الدخول للشلة!', 'success');
        location.hash = 'cloudgroup/' + res.groupId;
      } catch (e) {
        showModalSafe('دعوة لشلة', `
          <p style="color:var(--negative);margin-bottom:12px">${esc(e.message || 'كود غير صالح')}</p>
          <button class="btn btn-ghost btn-block" onclick="closeModal(); CloudUI.showJoin()">جرب كود تاني</button>`);
      }
    },

    /* ── auth ── */
    async login() {
      const email = document.getElementById('cEmail').value.trim();
      const pass = document.getElementById('cPass').value;
      const err = document.getElementById('cErr');
      const { error } = await Cloud.sb.auth.signInWithPassword({ email, password: pass });
      if (error) { err.textContent = 'بيانات الدخول غير صحيحة'; err.style.display = 'block'; return; }
      await Cloud.upsertMyProfile();
      location.hash = 'cloud';
    },
    async register() {
      const email = document.getElementById('cEmail').value.trim();
      const pass = document.getElementById('cPass').value;
      const err = document.getElementById('cErr');
      if (pass.length < 6) { err.textContent = 'كلمة المرور 6 أحرف على الأقل'; err.style.display = 'block'; return; }
      const { error } = await Cloud.sb.auth.signUp({ email, password: pass });
      if (error) { err.textContent = error.message; err.style.display = 'block'; return; }
      // If email confirmation is required, no session yet
      const { data } = await Cloud.sb.auth.getSession();
      if (!data.session) {
        err.textContent = 'تم إنشاء الحساب — لو وصلتك رسالة تأكيد، أكّد بريدك ثم سجّل دخول';
        err.style.display = 'block'; err.style.color = 'var(--positive)';
        return;
      }
      await Cloud.upsertMyProfile();
      location.hash = 'cloud';
    },

    /* ── groups list ── */
    async renderGroups() {
      if (!requireAuth()) return;
      content().innerHTML = `<div style="text-align:center;padding:40px">جاري التحميل…</div>`;
      const groups = await Cloud.myGroups();
      const myCode = await Cloud.getMyCode();
      content().innerHTML = `
        <div class="page-header">
          <h1>غرفي السحابية 🏠</h1>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="CloudUI.showCreate()">+ غرفة جديدة</button>
            <button class="btn btn-ghost btn-sm" onclick="CloudUI.showJoin()">دخول لغرفة</button>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;border:1px dashed var(--primary)">
          <div class="card-header"><h2>كودك (ID) — ده اللي أصحابك بيضيفوك بيه</h2></div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div class="qr-link" style="font-size:22px;font-weight:800;letter-spacing:2px">${esc(myCode || '…')}</div>
            ${myCode ? `<button class="btn btn-ghost btn-sm" onclick="CloudUI.copyCode('${myCode}')">📋 نسخ</button>` : ''}
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:8px">الكود محفوظ على حسابك في السيرفر، فبيشتغل من أي جهاز تسجّل منه. أصحابك يضيفوك من لوحة الأدمن بالكود ده.</p>
        </div>

        ${groups.length === 0 ? `
          <div class="card"><div class="empty-state">
            <h3>لسه مفيش غرف</h3>
            <p>اعمل غرفة جديدة أو ادخل بـ اسمها وكلمة مرورها</p>
          </div></div>` : `
        <div class="group-grid">
          ${groups.map(g => `
            <div class="group-card" onclick="CloudUI.open('${g.id}')">
              <div style="font-size:32px">${g.icon || '👥'}</div>
              <div class="group-card-name">${esc(g.name)}</div>
              <div class="group-card-meta">${roomTypeLabel(g.room_type)} · ${g.currency}</div>
            </div>`).join('')}
        </div>`}
      `;
    },

    showCreate() {
      showModalSafe('غرفة جديدة', `
        <div class="form-group"><label class="form-label">اسم الغرفة</label>
          <input class="form-input" id="cgName" placeholder="مثال: شلة المعهد"></div>
        <div class="form-group"><label class="form-label">النوع</label>
          <div style="display:flex;gap:8px">
            <label class="btn btn-ghost" style="flex:1;cursor:pointer">
              <input type="radio" name="cgType" value="friends" checked> 👥 شلة</label>
            <label class="btn btn-ghost" style="flex:1;cursor:pointer">
              <input type="radio" name="cgType" value="family"> 🏠 عائلة</label>
          </div>
        </div>
        <div class="form-group"><label class="form-label">كلمة مرور الدخول</label>
          <input class="form-input" id="cgPass" type="password" placeholder="6 أحرف على الأقل">
          <p style="font-size:12px;color:var(--text-muted);margin-top:6px">ابعتها لأصحابك — من غيرها ما حد يقدر يدخل.</p></div>
        <div class="form-group"><label class="form-label">اسمك جوه الغرفة</label>
          <input class="form-input" id="cgMe" placeholder="مثال: شادي"></div>
        <div class="form-group"><label class="form-label">العملة</label>
          <select class="form-select" id="cgCur">
            <option>EGP</option><option>USD</option><option>SAR</option><option>AED</option><option>EUR</option>
          </select></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="CloudUI.create()">إنشاء الغرفة</button>
      `);
    },
    async create() {
      const name = document.getElementById('cgName').value.trim();
      const password = document.getElementById('cgPass').value;
      const type = (document.querySelector('input[name="cgType"]:checked') || {}).value || 'friends';
      const me = document.getElementById('cgMe').value.trim();
      if (!name) return toastMsg('اكتب اسم الغرفة', 'error');
      if (password.length < 6) return toastMsg('كلمة المرور 6 أحرف على الأقل', 'error');
      try {
        const g = await Cloud.createRoom({
          name, password, roomType: type,
          currency: document.getElementById('cgCur').value,
          displayName: me || null,
        });
        closeModalSafe();
        toastMsg('تم إنشاء الغرفة!', 'success');
        location.hash = 'cloudgroup/' + g.id;
      } catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },

    showJoin() {
      showModalSafe('دخول لغرفة', `
        <div class="form-group"><label class="form-label">اسم الغرفة</label>
          <input class="form-input" id="cjName" placeholder="اسم الغرفة زي ما هو"></div>
        <div class="form-group"><label class="form-label">كلمة المرور</label>
          <input class="form-input" id="cjPass" type="password" placeholder="●●●●●●"></div>
        <div class="form-group"><label class="form-label">اسمك جوه الغرفة</label>
          <input class="form-input" id="cjMe" placeholder="الاسم اللي هتظهر بيه للباقي">
          <p style="font-size:12px;color:var(--text-muted);margin-top:6px">اسمك جوه الغرفة مختلف عن اسم حسابك، وتقدر تغيّره بعدين.</p></div>
        <div id="cjErr" style="color:#EF4444;font-size:13px;display:none;margin-bottom:8px"></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="CloudUI.join()">دخول</button>
        <p style="font-size:12px;color:var(--text-muted);margin-top:10px;text-align:center">
          معاك كود دعوة؟ <a href="#" onclick="CloudUI.showJoinCode();return false" style="color:var(--primary)">ادخل بالكود</a></p>
      `);
    },
    showJoinCode() {
      showModalSafe('دخول بكود دعوة', `
        <div class="form-group"><label class="form-label">كود الشلة أو الرابط</label>
          <input class="form-input" id="cjCode" dir="ltr" placeholder="كود الدعوة"></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="CloudUI.join()">دخول</button>`);
    },
    async join() {
      const codeEl = document.getElementById('cjCode');
      // The invite-code form and the name+password form share this handler.
      if (codeEl) {
        const code = codeEl.value.trim();
        if (!code) return toastMsg('اكتب كود الدعوة', 'error');
        try {
          const res = await Cloud.joinGroup(code);
          closeModalSafe();
          toastMsg('تم الدخول للشلة!', 'success');
          location.hash = 'cloudgroup/' + (res.groupId || code);
        } catch (e) { toastMsg(e.message || 'كود غير صالح', 'error'); }
        return;
      }

      const name = document.getElementById('cjName').value.trim();
      const password = document.getElementById('cjPass').value;
      const me = document.getElementById('cjMe').value.trim();
      const err = document.getElementById('cjErr');
      const fail = (msg) => { if (err) { err.textContent = msg; err.style.display = 'block'; } else toastMsg(msg, 'error'); };
      if (!name) return fail('اكتب اسم الغرفة');
      if (!password) return fail('اكتب كلمة المرور');
      try {
        const res = await Cloud.joinRoom({ name, password, displayName: me || null });
        closeModalSafe();
        toastMsg('أهلاً في الغرفة!', 'success');
        location.hash = 'cloudgroup/' + res.roomId;
      } catch (e) { fail(e.message || 'اسم الغرفة أو كلمة المرور غير صحيحة'); }
    },

    /* ── group page ── */
    async open(gid) {
      state.current = gid;
      location.hash = 'cloudgroup/' + gid;
    },

    async renderGroup(gid) {
      if (!requireAuth()) return;
      state.current = gid;
      const [members, isAdmin] = await Promise.all([Cloud.members(gid), Cloud.isAdmin(gid)]);
      state.members = members;
      const group = await getGroup(gid);
      state._group = group;
      if (!group) { content().innerHTML = `<p style="padding:40px">المجموعة غير موجودة أو ما قدرتش تفتح.</p>`; return; }
      const meRow = members.find(m => m.user_id === Cloud.user.id);
      const canEdit = !!(meRow && (meRow.role === 'admin' || meRow.can_edit));
      state._canEdit = canEdit;

      content().innerHTML = `
        <button class="back-btn" onclick="navigate('cloud')">← رجوع</button>
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:36px">${group.icon || '👥'}</div>
            <div>
              <h1>${esc(group.name)} ${roomTypeBadge(group.room_type)}</h1>
              <div class="group-meta" style="font-size:13px;color:var(--text-muted)">
                ${members.length} عضو · ${group.currency}
                ${meRow ? ` · اسمك هنا: <strong>${esc(meRow.display_name || '—')}</strong>` : ''}
                ${meRow && meRow.role === 'admin' ? ' · <span style="color:var(--primary);font-weight:700">أنت الأدمن</span>' : ''}
                ${meRow && meRow.role !== 'admin' && !meRow.can_edit ? ' · <span style="color:var(--negative)">صلاحية مشاهدة فقط</span>' : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="CloudUI.showMyName('${gid}')">✏️ اسمي هنا</button>
            <button class="btn btn-ghost btn-sm" onclick="CloudUI.showInvite('${gid}')">🔗 دعوة</button>
            ${isAdmin ? `<button class="btn btn-ghost btn-sm" onclick="CloudUI.showAdmin('${gid}')">⚙️ إدارة الأعضاء</button>` : ''}
            ${canEdit ? `<button class="btn btn-accent btn-sm" onclick="CloudUI.showAddExpense('${gid}')">+ مصروف</button>` : ''}
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">إجمالي المصاريف</div>
            <div class="stat-value" id="ccTotal">…</div></div>
          <div class="stat-card"><div class="stat-label">عدد المصاريف</div>
            <div class="stat-value" id="ccCount">0</div></div>
        </div>

        <div class="tabs" style="margin-top:16px">
          <button class="tab ${state.tab === 'expenses' ? 'active' : ''}" data-ctab="expenses" onclick="CloudUI.setTab('expenses')">المصاريف</button>
          <button class="tab ${state.tab === 'chat' ? 'active' : ''}" data-ctab="chat" onclick="CloudUI.setTab('chat')">💬 الشات</button>
          <button class="tab ${state.tab === 'balances' ? 'active' : ''}" data-ctab="balances" onclick="CloudUI.setTab('balances')">الأرصدة</button>
        </div>
        <div id="cloudTab"></div>
      `;

      // realtime subscriptions
      this._subscribe(gid);
      // initial content
      this.setTab(state.tab, true);
    },

    _subscribe(gid) {
      if (state.unsub) state.unsub();
      state.unsub = Cloud.subscribe(gid, {
        onMessage: (m) => { if (state.current === gid) this._appendMessage(m); },
        onExpense: (p) => {
          if (state.current !== gid) return;
          if (p.eventType === 'INSERT') this._upsertExpense(p.new, true);
          else if (p.eventType === 'DELETE') this._removeExpense(p.old.id);
          else if (p.eventType === 'UPDATE') this._upsertExpense(p.new, false);
        },
        onSettlement: () => { if (state.current === gid) this.setTab('balances', true); },
        onMembers: () => { if (state.current === gid) this.renderGroup(gid); },
      });
    },

    setTab(tab, noScroll) {
      state.tab = tab;
      const gid = state.current;
      document.querySelectorAll('[data-ctab]').forEach(t => t.classList.toggle('active', t.dataset.ctab === tab));
      const el = document.getElementById('cloudTab');
      if (!el) return;
      if (tab === 'expenses') this._renderExpenses(gid, el);
      else if (tab === 'chat') this._renderChat(gid, el, noScroll);
      else this._renderBalances(gid, el);
    },

    /* ── expenses tab (live) ── */
    async _renderExpenses(gid, el) {
      const expenses = await Cloud.listExpenses(gid);
      state._expenses = expenses;
      const group = await getGroup(gid);
      const cur = group?.currency;
      const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
      const tEl = document.getElementById('ccTotal'); if (tEl) tEl.textContent = money(total, cur);
      const cEl = document.getElementById('ccCount'); if (cEl) cEl.textContent = expenses.length;

      if (expenses.length === 0) {
        el.innerHTML = `<div class="card"><div class="empty-state">
          <h3>مفيش مصاريف لسه</h3><p>أول واحد يضيف مصروف، هيظهر لحظي عند الكل</p></div></div>`;
        return;
      }
      el.innerHTML = `<div class="expense-list">${expenses.map(e => this._expenseRow(e, state.members, cur)).join('')}</div>`;
    },

    _expenseRow(e, members, cur) {
      const who = (arr) => (arr || []).map(p => {
        const m = members.find(mm => mm.user_id === p.userId);
        return `${esc(m ? (m.display_name || 'عضو') : 'عضو')} ${money(p.amount, cur)}`;
      }).join(' + ');
      const mine = Cloud.user && e.created_by === Cloud.user.id;
      return `
        <div class="expense-item">
          <div class="expense-info">
            <div class="expense-description">${esc(e.description)}</div>
            <div class="expense-meta">${e.date} · ${who(e.paid_by)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="expense-amount">${money(e.amount, cur)}</div>
            ${mine ? `<button class="btn btn-ghost btn-sm" title="تعديل"
                onclick="CloudUI.showAddExpense('${state.current}','${e.id}')">✏️</button>` : ''}
            ${state._canEdit ? `<button class="btn btn-ghost btn-sm" title="حذف"
                onclick="CloudUI.deleteExpense('${state.current}','${e.id}')">🗑</button>` : ''}
          </div>
        </div>`;
    },
    async deleteExpense(gid, eid) {
      if (!confirm('تحذف المصروف ده؟')) return;
      try { await Cloud.deleteExpense(gid, eid); toastMsg('تم الحذف', 'success'); }
      catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },

    _upsertExpense(e, isNew) {
      if (!state._expenses) state._expenses = [];
      const i = state._expenses.findIndex(x => x.id === e.id);
      if (i >= 0) state._expenses[i] = e; else state._expenses.unshift(e);
      if (state.tab === 'expenses') {
        const total = state._expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
        const tEl = document.getElementById('ccTotal'); if (tEl) tEl.textContent = money(total, getGroupCache()?.currency);
        const cEl = document.getElementById('ccCount'); if (cEl) cEl.textContent = state._expenses.length;
        if (isNew) { /* flash re-render */ this._renderExpenses(state.current, document.getElementById('cloudTab')); }
      }
    },
    _removeExpense(id) {
      if (!state._expenses) return;
      state._expenses = state._expenses.filter(x => x.id !== id);
      if (state.tab === 'expenses') this._renderExpenses(state.current, document.getElementById('cloudTab'));
    },

    /* ── add / edit expense (live) ── */
    async showAddExpense(gid, editId) {
      const members = state.members;
      const e = editId ? (state._expenses || []).find(x => x.id === editId) : null;
      const paid = {};
      (e ? e.paid_by : []).forEach(p => { paid[p.userId] = p.amount; });
      showModalSafe(e ? 'تعديل المصروف' : 'مصروف جديد', `
        <div class="form-group"><label class="form-label">الوصف</label>
          <input class="form-input" id="ceDesc" value="${esc(e ? e.description : '')}" placeholder="مثال: عشاء"></div>
        <div class="form-group"><label class="form-label">المبلغ</label>
          <input class="form-input" id="ceAmount" type="number" step="0.01" min="0" placeholder="0.00"
            value="${e ? Number(e.amount) : ''}"></div>
        <div class="form-group"><label class="form-label">من دفع؟ (ممكن أكتر من واحد)</label>
          <div id="cePayers">
            ${members.map(m => `
              <div class="member-split-item">
                <span class="member-name">${esc(m.display_name || 'عضو')}</span>
                <input class="form-input payer-input" data-uid="${m.user_id}" type="number" step="0.01" min="0"
                  placeholder="0" value="${paid[m.user_id] != null ? paid[m.user_id] : ''}">
              </div>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-block btn-lg" onclick="CloudUI.addExpense('${gid}','${editId || ''}')">
          ${e ? 'حفظ التعديل' : 'حفظ المصروف'}</button>
      `);
    },
    async addExpense(gid, editId) {
      const desc = document.getElementById('ceDesc').value.trim();
      const amount = parseFloat(document.getElementById('ceAmount').value);
      if (!desc || !amount || amount <= 0) return toastMsg('أدخل وصف ومبلغ صحيح', 'error');
      const paidBy = [];
      document.querySelectorAll('.payer-input').forEach(inp => {
        const v = parseFloat(inp.value) || 0;
        if (v > 0) paidBy.push({ userId: inp.dataset.uid, amount: v });
      });
      if (paidBy.length === 0) return toastMsg('حدد من دفع', 'error');
      // equal split across members
      const per = Math.round((amount / state.members.length) * 100) / 100;
      const shares = state.members.map(m => ({ userId: m.user_id, amount: per }));
      const date = new Date().toISOString().slice(0, 10);
      try {
        if (editId) {
          await Cloud.updateExpense(gid, editId, {
            description: desc, amount, date,
            paid_by: paidBy, shares,
          });
        } else {
          await Cloud.addExpense(gid, {
            description: desc, amount, category: 'other',
            date, splitType: 'equal', paidBy, shares,
          });
        }
        closeModalSafe();
        toastMsg(editId ? 'تم تعديل المصروف ✅' : 'تم إضافة المصروف ✅', 'success');
      } catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },

    /* ── chat tab ── */
    async _renderChat(gid, el, noScroll) {
      const messages = await Cloud.listMessages(gid);
      el.innerHTML = `
        <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;height:60vh">
          <div id="chatBox" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px">
            ${messages.length === 0 ? '<p style="text-align:center;color:var(--text-muted)">ابدأ المحادثة 👋</p>' : ''}
            ${messages.map(m => this._msgRow(m, gid)).join('')}
          </div>
          <div style="display:flex;gap:8px;padding:12px;border-top:1px solid var(--border)">
            <input class="form-input" id="chatInput" placeholder="اكتب رسالة..." onkeydown="if(event.key==='Enter')CloudUI.send('${gid}')">
            <button class="btn btn-primary" onclick="CloudUI.send('${gid}')">إرسال</button>
          </div>
        </div>`;
      const box = document.getElementById('chatBox');
      if (box) box.scrollTop = box.scrollHeight;
    },
    _msgRow(m) {
      const mine = Cloud.user && m.user_id === Cloud.user.id;
      return `
        <div style="display:flex;${mine ? 'justify-content:flex-start' : 'justify-content:flex-end'}">
          <div style="max-width:75%;padding:8px 12px;border-radius:14px;
            background:${mine ? 'var(--primary)' : 'var(--border-light)'};
            color:${mine ? '#fff' : 'var(--text)'};">
            ${!mine ? `<div style="font-size:11px;opacity:.7;font-weight:700">${esc(m.user_name)}</div>` : ''}
            <div>${esc(m.text)}</div>
            <div style="font-size:10px;opacity:.6;margin-top:2px;text-align:left">${shortTime(m.created_at)}</div>
          </div>
        </div>`;
    },
    async send(gid) {
      const inp = document.getElementById('chatInput');
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      try { await Cloud.sendMessage(gid, text); } catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },
    _appendMessage(m) {
      const box = document.getElementById('chatBox');
      if (!box) return;
      if (box.querySelector('[data-mid="' + m.id + '"]')) return;
      const div = document.createElement('div');
      div.innerHTML = this._msgRow(m);
      div.dataset.mid = m.id;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    },

    /* ── balances tab ── */
    async _renderBalances(gid, el) {
      const [expenses, settlements] = await Promise.all([Cloud.listExpenses(gid), Cloud.listSettlements(gid)]);
      const group = await getGroup(gid); const cur = group?.currency;
      const members = state.members;
      const bal = {};
      members.forEach(m => bal[m.user_id] = 0);
      expenses.forEach(e => {
        (e.paid_by || []).forEach(p => { if (bal[p.userId] !== undefined) bal[p.userId] += Number(p.amount); });
        (e.shares || []).forEach(s => { if (bal[s.userId] !== undefined) bal[s.userId] -= Number(s.amount); });
      });
      settlements.forEach(s => {
        if (s.status === 'paid') {
          if (bal[s.from_user] !== undefined) bal[s.from_user] += Number(s.amount);
          if (bal[s.to_user] !== undefined) bal[s.to_user] -= Number(s.amount);
        }
      });
      el.innerHTML = `<div class="card"><div class="card-header"><h2>الأرصدة</h2></div>
        <div class="balance-list">
          ${members.map(m => {
            const b = bal[m.user_id] || 0;
            const isMe = m.user_id === Cloud.user.id;
            return `<div class="balance-item">
              <span class="balance-name">${esc(m.display_name || 'عضو')}${isMe ? ' (أنت)' : ''}</span>
              <span style="display:flex;align-items:center;gap:8px">
                <span class="balance-amount ${b >= 0 ? 'positive' : 'negative'}">${money(b, cur)}</span>
                ${!isMe && state._canEdit ? `<button class="btn btn-ghost btn-sm"
                  onclick="CloudUI.showSettle('${gid}','${m.user_id}')">سدد</button>` : ''}
              </span>
            </div>`;
          }).join('')}
        </div></div>`;
    },

    async showSettle(gid, toUserId) {
      const m = state.members.find(x => x.user_id === toUserId);
      showModalSafe('تسجيل دفعة', `
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:10px">
          سجّل إنك دفعت لـ <strong>${esc(m ? m.display_name : 'العضو')}</strong>.</p>
        <div class="form-group"><label class="form-label">المبلغ</label>
          <input class="form-input" id="stAmount" type="number" step="0.01" min="0" placeholder="0.00"></div>
        <div class="form-group"><label class="form-label">الطريقة</label>
          <select class="form-select" id="stMethod">
            <option value="cash">كاش</option><option value="transfer">تحويل</option><option value="instapay">إنستاباي</option>
          </select></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="CloudUI.saveSettle('${gid}','${toUserId}')">تسجيل</button>
      `);
    },
    async saveSettle(gid, toUserId) {
      const amount = parseFloat(document.getElementById('stAmount').value);
      if (!amount || amount <= 0) return toastMsg('أدخل مبلغ صحيح', 'error');
      try {
        await Cloud.addSettlement(gid, {
          from: Cloud.user.id, to: toUserId, amount,
          method: document.getElementById('stMethod').value,
          status: 'paid',
          date: new Date().toISOString().slice(0, 10),
        });
        closeModalSafe();
        toastMsg('تم تسجيل الدفعة ✅', 'success');
        this.setTab('balances', true);
      } catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },

    /* ── my name inside this room ── */
    async showMyName(gid) {
      const me = state.members.find(m => m.user_id === Cloud.user?.id);
      showModalSafe('اسمك في الغرفة', `
        <div class="form-group"><label class="form-label">الاسم اللي هتظهر بيه</label>
          <input class="form-input" id="mnName" value="${esc(me ? me.display_name : '')}" placeholder="مثال: شادي">
          <p style="font-size:12px;color:var(--text-muted);margin-top:6px">اسمك جوه الغرفة دي بس — مش اسم حسابك العام.</p></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="CloudUI.saveMyName('${gid}')">حفظ</button>
      `);
    },
    async saveMyName(gid) {
      const name = document.getElementById('mnName').value.trim();
      if (!name) return toastMsg('اكتب الاسم', 'error');
      if (name.length > 40) return toastMsg('الاسم 40 حرف على الأقل', 'error');
      try {
        await Cloud.setMyRoomName(gid, name);
        closeModalSafe();
        toastMsg('تم تحديث اسمك ✅', 'success');
        this.renderGroup(gid);
      } catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },

    /* ── admin panel (add by code + permission toggles + room settings) ── */
    async showAdmin(gid) {
      const members = await Cloud.members(gid);
      const group = await getGroup(gid);
      const isFamily = group && group.room_type === 'family';
      showModalSafe('إدارة الغرفة', `
        <div class="form-group">
          <label class="form-label">إضافة عضو بالكود (ID)</label>
          <div style="display:flex;gap:8px">
            <input class="form-input" id="amCode" dir="ltr" placeholder="كود العضو">
            <button class="btn btn-primary" onclick="CloudUI.addByCode('${gid}')">إضافة</button>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-header"><h2>إعدادات الغرفة</h2></div>
          <div class="form-group"><label class="form-label">نوع الغرفة</label>
            <select class="form-select" id="arType">
              <option value="friends" ${!isFamily ? 'selected' : ''}>👥 شلة</option>
              <option value="family" ${isFamily ? 'selected' : ''}>🏠 عائلة</option>
            </select></div>
          <div class="form-group"><label class="form-label">كلمة مرور جديدة</label>
            <input class="form-input" id="arPass" type="password" placeholder="اتركها فاضية عشان ما تتغيرش"></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="CloudUI.saveRoomSettings('${gid}')">حفظ الإعدادات</button>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="card-header"><h2>الأعضاء والصلاحيات</h2></div>
          <div class="balance-list">
            ${members.map(m => `
              <div class="balance-item" style="align-items:center">
                <span class="balance-name">
                  ${esc(m.display_name || 'عضو')}
                  ${m.role === 'admin' ? '<span class="badge" style="background:var(--primary);color:#fff;padding:1px 6px;border-radius:6px;font-size:10px;margin-inline-start:6px">أدمن</span>' : ''}
                  ${m.user_id === Cloud.user.id ? ' <span style="font-size:11px;color:var(--text-muted)">(أنت)</span>' : ''}
                </span>
                <span style="display:flex;gap:6px;align-items:center">
                  ${m.role === 'admin' ? `
                    <button class="btn btn-ghost btn-sm" onclick="CloudUI.setRole('${gid}','${m.user_id}','member')">شيل الأدمنية</button>
                  ` : `
                    <button class="btn btn-ghost btn-sm" onclick="CloudUI.setRole('${gid}','${m.user_id}','admin')">امسك أدمن</button>
                    <button class="btn ${m.can_edit ? 'btn-ghost' : 'btn-danger'} btn-sm" onclick="CloudUI.togglePerm('${gid}','${m.user_id}',${!m.can_edit})">
                      ${m.can_edit ? 'يقدر يعدّل ✅' : 'مشاهدة فقط ⛔'}
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="CloudUI.removeMember('${gid}','${m.user_id}')">إزالة</button>
                  `}
                </span>
              </div>`).join('')}
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:12px">الأعضاء القادرين يضيفوا مصاريفهم لحظياً. الأدمن يقدر يخلي أي عضو «مشاهدة فقط»، ويمنع الغرفة من إنها تفضل من غير أدمن.</p>
      `, true);
    },
    async saveRoomSettings(gid) {
      const type = document.getElementById('arType').value;
      const pass = document.getElementById('arPass').value;
      try {
        if (pass && pass.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
        const group = await getGroup(gid);
        if (type !== group.room_type) await Cloud.setRoomType(gid, type);
        if (pass) await Cloud.setRoomPassword(gid, pass);
        closeModalSafe();
        toastMsg('تم حفظ إعدادات الغرفة ✅', 'success');
        this.renderGroup(gid);
      } catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },
    async setRole(gid, uid, role) {
      if (role === 'member' && !confirm('تشيل الأدمنية عن العضو ده؟')) return;
      if (role === 'admin' && !confirm('تمسك أدمن للعضو ده؟')) return;
      try {
        await Cloud.changeMemberRole(gid, uid, role);
        this.showAdmin(gid);
      } catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },
    async addByCode(gid) {
      const code = document.getElementById('amCode').value.trim();
      if (!code) return;
      try {
        await Cloud.addMemberByCode(gid, code);
        toastMsg('تمت إضافة العضو ✅', 'success');
        closeModalSafe();
        this.renderGroup(gid);
      } catch (e) { toastMsg(e.message || 'خطأ', 'error'); }
    },
    async togglePerm(gid, uid, canEdit) {
      try { await Cloud.setMemberPermission(gid, uid, canEdit); this.showAdmin(gid); }
      catch (e) { toastMsg('خطأ', 'error'); }
    },
    async removeMember(gid, uid) {
      if (!confirm('إزالة العضو من الشلة؟')) return;
      try { await Cloud.removeMember(gid, uid); this.showAdmin(gid); }
      catch (e) { toastMsg('خطأ', 'error'); }
    },

    /* ── invite ──
     * Shares a revocable invite code, not the group id. The old version put the
     * group UUID straight into the URL, which meant anyone who ever saw the
     * link stayed a member forever with no way to kick them out.
     */
    async showInvite(gid) {
      showModalSafe('دعوة الأصدقاء', `<div style="text-align:center">
        <p style="font-size:13px;color:var(--text-muted)">بتجهّز كود دعوة…</p></div>`);
      let code;
      try {
        const inv = await Cloud.createInvite(gid, { expiresInHours: 168, maxUses: 20 });
        code = inv.code;
      } catch (e) {
        showModalSafe('دعوة الأصدقاء', `<p style="color:var(--negative)">${esc(e.message || 'مقدرناش نعمل كود دعوة')}</p>`);
        return;
      }
      const link = Cloud.inviteLink(code);
      showModalSafe('دعوة الأصدقاء', `
        <div style="text-align:center">
          <p style="font-size:13px;color:var(--text-muted)">ابعت الكود ده لأصحابك — صالح أسبوع، أو ٢٠ واحد، ولينفع تلغيه</p>
          <div class="qr-link" id="invCode" style="font-size:28px;font-weight:800;letter-spacing:4px;margin:12px 0">${esc(code)}</div>
          <button class="btn btn-primary" onclick="CloudUI.copyCode('${code}')">📋 نسخ الكود</button>
          <button class="btn btn-ghost" onclick="CloudUI.copyLink('${esc(link)}')">🔗 نسخ الرابط</button>
        </div>`);
    },
    copyLink(link) {
      const text = link || (document.getElementById('invLink') || {}).textContent || '';
      navigator.clipboard?.writeText(text).then(() => toastMsg('تم نسخ الرابط', 'success')).catch(() => {});
    },
    copyCode(c) { navigator.clipboard?.writeText(c).then(() => toastMsg('تم نسخ الكود', 'success')).catch(() => {}); },
  };

  /* group cache */
  async function getGroup(gid) {
    const { data } = await Cloud.sb.from('groups').select('*').eq('id', gid).maybeSingle();
    return data;
  }
  function getGroupCache() { return state._group; }
  function showModalSafe(title, body, large) { if (window.showModal) { window.showModal(title, body, large); } else { document.getElementById('modalTitle').textContent = title; document.getElementById('modalBody').innerHTML = body; document.getElementById('modalOverlay').classList.add('open'); } }
  function closeModalSafe() { if (window.closeModal) closeModal(); else document.getElementById('modalOverlay').classList.remove('open'); }

  window.CloudUI = UI;
})();
