/* SplitEase — حساب الشلة */
(function() {
'use strict';

const DB_NAME = 'SplitEaseDB';
const DB_VER = 3;

/* ── IndexedDB ── */
const db = {
  _db: null,
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('groups')) {
          const gs = d.createObjectStore('groups', { keyPath: 'id' });
          gs.createIndex('name', 'name', { unique: false });
        }
        if (!d.objectStoreNames.contains('expenses')) {
          const es = d.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
          es.createIndex('groupId', 'groupId', { unique: false });
          es.createIndex('date', 'date', { unique: false });
        }
        if (!d.objectStoreNames.contains('settlements')) {
          const ss = d.createObjectStore('settlements', { keyPath: 'id', autoIncrement: true });
          ss.createIndex('groupId', 'groupId', { unique: false });
        }
        if (!d.objectStoreNames.contains('budgets')) {
          d.createObjectStore('budgets', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('budgetTransactions')) {
          const bt = d.createObjectStore('budgetTransactions', { keyPath: 'id', autoIncrement: true });
          bt.createIndex('budgetId', 'budgetId', { unique: false });
          bt.createIndex('categoryId', 'categoryId', { unique: false });
        }
        if (!d.objectStoreNames.contains('personalTxs')) {
          const pt = d.createObjectStore('personalTxs', { keyPath: 'id', autoIncrement: true });
          pt.createIndex('date', 'date', { unique: false });
          pt.createIndex('category', 'category', { unique: false });
        }
      };
      req.onsuccess = e => { this._db = e.target.result; resolve(); };
      req.onerror = e => reject(e.target.error);
    });
  },
  _tx(store, mode) { return this._db.transaction(store, mode).objectStore(store); },
  getAll(store) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  get(store, id) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readonly').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  getAllByIndex(store, index, value) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readonly').index(index).getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  put(store, data) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  delete(store, id) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
};

function esc(str) { var d=document.createElement('div'); d.appendChild(document.createTextNode(str||'')); return d.innerHTML; }

/* ── Supabase ── */
let supabaseClient = null;
try {
  if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url && SUPABASE_CONFIG.url.includes('YOUR_PROJECT') === false) {
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }
} catch(e) { /* Supabase not configured — local mode only */ }

/* ── Auth ── */
const authState = { user: null, session: null, initialized: false };

async function initAuth() {
  if (!supabaseClient) { authState.initialized = true; return; }
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (!error && session) {
    authState.session = session;
    authState.user = session.user;
  }
  supabaseClient.auth.onAuthStateChange((event, session) => {
    authState.session = session;
    authState.user = session?.user || null;
    if (event === 'SIGNED_IN') { toast('تم تسجيل الدخول', 'success'); handleRoute(); }
    if (event === 'SIGNED_OUT') { handleRoute(); }
  });
  authState.initialized = true;
}

function isLoggedIn() { return !!(supabaseClient && authState.user); }

function renderAuthPage(mode) {
  const modeText = mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب';
  const modeLink = mode === 'login' ? 'register' : 'login';
  const modeLinkText = mode === 'login' ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب؟ سجل دخول';
  const submitFn = mode === 'login' ? 'authLogin' : 'authRegister';
  document.getElementById('appContent').innerHTML = `
    <div class="auth-page">
      <div class="auth-box">
        <div class="auth-logo">S</div>
        <h1 class="auth-title">SplitEase</h1>
        <p class="auth-subtitle">${mode === 'login' ? 'مرحباً بعودتك' : 'أنشئ حسابك الجديد'}</p>
        <div class="auth-form">
          ${mode === 'register' ? `
          <div class="form-group">
            <label class="form-label">الاسم</label>
            <input class="form-input" id="authName" placeholder="اسمك">
          </div>` : ''}
          <div class="form-group">
            <label class="form-label">البريد الإلكتروني</label>
            <input class="form-input" id="authEmail" type="email" placeholder="your@email.com" dir="ltr">
          </div>
          <div class="form-group">
            <label class="form-label">كلمة المرور</label>
            <input class="form-input" id="authPassword" type="password" placeholder="●●●●●●" dir="ltr">
          </div>
          <div id="authError" style="color:#EF4444;font-size:13px;margin-bottom:8px;display:none"></div>
          <button class="btn btn-primary btn-block btn-lg" onclick="${submitFn}()">${modeText}</button>
          <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="renderAuthPage('${modeLink}')">${modeLinkText}</button>
          ${mode === 'login' ? '<button class="btn btn-ghost btn-block" onclick="useLocalMode()">تخطي — استخدام محلي</button>' : ''}
        </div>
      </div>
    </div>
  `;
}

async function authRegister() {
  const email = document.getElementById('authEmail')?.value?.trim();
  const password = document.getElementById('authPassword')?.value;
  const name = document.getElementById('authName')?.value?.trim() || email?.split('@')[0];
  const errEl = document.getElementById('authError');
  if (!email || !password) { errEl.textContent = 'يرجى تعبئة جميع الحقول'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
    toast('تم التسجيل! تحقق من بريدك الإلكتروني', 'success');
  } catch(e) { errEl.textContent = 'حدث خطأ في الاتصال'; errEl.style.display = 'block'; }
}

async function authLogin() {
  const email = document.getElementById('authEmail')?.value?.trim();
  const password = document.getElementById('authPassword')?.value;
  const errEl = document.getElementById('authError');
  if (!email || !password) { errEl.textContent = 'يرجى إدخال البريد وكلمة المرور'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
    navigate('home');
  } catch(e) { errEl.textContent = 'حدث خطأ في الاتصال'; errEl.style.display = 'block'; }
}

async function authLogout() {
  await supabaseClient?.auth.signOut();
  navigate('home');
}

function useLocalMode() { navigate('home'); }

/* ── I18n ── */
const i18n = {
  ar: {
    app_name: 'حساب الشلة',
    home: 'الرئيسية',
    groups: 'المجموعات',
    insights: 'التقارير',
    settings: 'الإعدادات',
    no_groups: 'لا توجد مجموعات بعد',
    no_groups_desc: 'أنشئ أول مجموعة لبدء تقاسم المصاريف',
    create_group: 'مجموعة جديدة',
    group_name: 'اسم المجموعة',
    group_icon: 'أيقونة المجموعة',
    add_members: 'إضافة أعضاء',
    member_name: 'اسم العضو',
    add_member: 'إضافة',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    total_balance: 'إجمالي الرصيد',
    total_expenses: 'إجمالي المصاريف',
    active_groups: 'المجموعات النشطة',
    members: 'أعضاء',
    expenses: 'مصاريف',
    add_expense: 'مصروف جديد',
    expense_desc: 'وصف المصروف',
    amount: 'المبلغ',
    category: 'الفئة',
    date: 'التاريخ',
    paid_by: 'دفع بواسطة',
    split_type: 'نوع التقسيط',
    split_equal: 'بالتساوي',
    split_exact: 'مبالغ محددة',
    split_percent: 'نسبة مئوية',
    split_shares: 'حصص',
    food: 'طعام',
    transport: 'مواصلات',
    shopping: 'تسوق',
    entertainment: 'ترفيه',
    bills: 'فواتير',
    housing: 'سكن',
    health: 'صحة',
    rent: 'إيجار',
    internet: 'انترنت',
    kids: 'أولاد',
    electricity: 'كهرباء',
    water: 'مياه',
    gas: 'غاز',
    maintenance: 'صيانة',
    custom: 'أخرى',
    other: 'أخرى',
    owes: 'مديون لـ',
    gets_back: 'يستحق من',
    settle: 'تسوية',
    mark_paid: 'تحديد كمدفوع',
    settlement_history: 'سجل التسويات',
    no_settlements: 'لا توجد تسويات',
    monthly_chart: 'المصروفات الشهرية',
    category_chart: 'توزيع الفئات',
    trend_chart: 'اتجاه المصروفات',
    export_pdf: 'تصدير PDF',
    export_excel: 'تصدير Excel',
    dark_mode: 'الوضع الليلي',
    light_mode: 'الوضع النهاري',
    high_contrast: 'تباين عالي',
    currency: 'العملة',
    language: 'اللغة',
    about: 'حول التطبيق',
    version: 'الإصدار',
    invite_members: 'دعوة أعضاء',
    share_link: 'مشاركة الرابط',
    copy_link: 'نسخ الرابط',
    total_owes: 'إجمالي المديونية',
    total_owed: 'إجمالي المستحق',
    you_owe: 'عليك',
    you_are_owed: 'لك',
    balanced: 'متوازن',
    home_title: 'ملخص المصاريف',
    recent_expenses: 'آخر المصاريف',
    view_all: 'عرض الكل',
    no_expenses: 'لا توجد مصاريف بعد',
    simplify_debts: 'تبسيط الديون',
    original_debts: 'الديون الأصلية',
    simplified_debts: 'ديون مبسطة',
    group_dashboard: 'لوحة المجموعة',
    members_count: 'عدد الأعضاء',
    expense_added: 'تم إضافة المصروف',
    group_created: 'تم إنشاء المجموعة',
    settlement_marked: 'تم تأكيد التسوية',
    delete_confirm: 'هل أنت متأكد من الحذف؟',
    eGP: 'جنيه مصري',
    USD: 'دولار أمريكي',
    EUR: 'يورو',
    SAR: 'ريال سعودي',
    AED: 'درهم إماراتي',
    KWD: 'دينار كويتي',
    QAR: 'ريال قطري',
    ILS: 'شيكل',
    per_person: 'للفرد',
    total: 'الإجمالي',
    search: 'بحث...',
    add: 'إضافة',
    home_group: 'المنزل',
    trip_group: 'رحلة',
    friends_group: 'أصدقاء',
    custom_group: 'مخصص',
    summary_title: 'ملخص المجموعة',
    budget: 'الميزانية',
    income: 'الراتب',
    monthly_income: 'الراتب الشهري',
    budget_month: 'شهر الميزانية',
    budget_name: 'اسم الميزانية',
    budget_remaining: 'المتبقي',
    budget_spent: 'المصروف',
    budget_allocated: 'مخصص',
    budget_status: 'الحالة',
    budget_on_track: 'ضمن الميزانية',
    budget_over: 'تجاوز',
    budget_surplus: 'وفر',
    add_budget: 'ميزانية جديدة',
    add_transaction: 'إضافة مصروف',
    add_category: 'إضافة بند جديد',
    budget_saved: 'تم حفظ الميزانية',
    budget_deleted: 'تم حذف الميزانية',
    budget_empty: 'لا توجد ميزانيات بعد',
    budget_empty_desc: 'أنشئ أول ميزانية شهرية لإدارة راتبك',
    budget_details: 'تفاصيل الميزانية',
    budget_income: 'دخل',
    budget_total_spent: 'إجمالي المصروف',
    budget_balance: 'الرصيد المتبقي',
    category_alloc: 'توزيع الميزانية',
    budget_transactions: 'المعاملات',
    no_transactions: 'لا توجد معاملات',
    income_label: 'اسم الراتب',
    category_placeholder: 'اسم الفئة',
    alloc_amount: 'المبلغ المخصص',
    remaining: 'متبقٍ',
    overspent: 'تجاوز',
    spent_of: 'من أصل'
  }
};
let lang = 'ar';
function t(key) { return i18n[lang]?.[key] || key; }

/* ── Utils ── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function today() { return new Date().toISOString().slice(0, 10); }

const CATEGORIES = [
  { id: 'food', icon: '🍔', color: '#F97066' },
  { id: 'transport', icon: '🚗', color: '#F59E0B' },
  { id: 'shopping', icon: '🛍️', color: '#6366F1' },
  { id: 'entertainment', icon: '🎮', color: '#8B5CF6' },
  { id: 'bills', icon: '📄', color: '#EC4899' },
  { id: 'housing', icon: '🏠', color: '#0D9488' },
  { id: 'health', icon: '💊', color: '#10B981' },
  { id: 'rent', icon: '🏢', color: '#E11D48' },
  { id: 'internet', icon: '🌐', color: '#3B82F6' },
  { id: 'kids', icon: '🧒', color: '#F472B6' },
  { id: 'electricity', icon: '⚡', color: '#FBBF24' },
  { id: 'water', icon: '💧', color: '#38BDF8' },
  { id: 'gas', icon: '🔥', color: '#FB923C' },
  { id: 'maintenance', icon: '🔧', color: '#A78BFA' },
  { id: 'custom', icon: '✏️', color: '#94A3B8' }
];

const GROUP_ICONS = ['🏠','✈️','🎓','👥','❤️','💼','🎉','🏖️','🎵','⚽'];
const GROUP_COLORS = ['#0D9488','#F97066','#6366F1','#F59E0B','#EC4899','#10B981','#8B5CF6','#E11D48'];

const CURRENCIES = ['EGP','USD','EUR','SAR','AED','KWD','QAR','ILS'];
const CURRENCY_SYMBOLS = { EGP:'ج.م', USD:'$', EUR:'€', SAR:'﷼', AED:'د.إ', KWD:'د.ك', QAR:'﷼', ILS:'₪' };

function getPayersDisplay(payers, members, cur) {
  if (!Array.isArray(payers)) {
    const m = members?.find(x => x.id === payers);
    return m?.name || '';
  }
  return payers.map(p => {
    const m = members?.find(x => x.id === p.memberId);
    return m ? `${esc(m.name)} ${fmt(p.amount, cur)}` : fmt(p.amount, cur);
  }).join('، ');
}

function fmt(n, cur) {
  const sym = CURRENCY_SYMBOLS[cur || state.currency] || cur || 'ج.م';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + sym;
}

function fmtShort(n, cur) {
  const sym = CURRENCY_SYMBOLS[cur || state.currency] || 'ج.م';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + sym;
}

function categoryIcon(id) {
  const c = CATEGORIES.find(x => x.id === id);
  return c ? c.icon : '📌';
}

function categoryColor(id) {
  const c = CATEGORIES.find(x => x.id === id);
  return c ? c.color : '#94A3B8';
}

/* ── State ── */
const state = {
  groups: [],
  currentPage: 'home',
  currentGroupId: null,
  theme: localStorage.getItem('splitease-theme') || 'light',
  currency: localStorage.getItem('splitease-currency') || 'EGP',
  lang: localStorage.getItem('splitease-lang') || 'ar'
};

async function loadState() {
  state.groups = await db.getAll('groups') || [];
  applyTheme(state.theme);
}

/* ── Calculations ── */
function calcBalances(groupId, expenses, settlements) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return {};
  const members = group.members || [];
  const balances = {};
  members.forEach(m => { balances[m.id] = 0; });

  (expenses || []).forEach(ex => {
    const payers = Array.isArray(ex.paidBy) ? ex.paidBy : [{ memberId: ex.paidBy, amount: ex.amount }];
    payers.forEach(p => {
      if (balances[p.memberId] !== undefined) balances[p.memberId] += p.amount;
    });
    (ex.shares || []).forEach(sh => {
      if (balances[sh.memberId] !== undefined) balances[sh.memberId] -= sh.amount;
    });
  });

  (settlements || []).forEach(s => {
    if (s.status === 'paid') {
      if (balances[s.from] !== undefined) balances[s.from] += s.amount;
      if (balances[s.to] !== undefined) balances[s.to] -= s.amount;
    }
  });

  return balances;
}

function simplifyDebts(balances) {
  const debtors = [], creditors = [];
  for (const [id, bal] of Object.entries(balances)) {
    if (bal < -0.01) debtors.push({ id, amount: -bal });
    else if (bal > 0.01) creditors.push({ id, amount: bal });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  const transactions = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amount, creditors[j].amount);
    if (amt > 0.01) transactions.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(amt * 100) / 100 });
    debtors[i].amount -= amt;
    creditors[j].amount -= amt;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return transactions;
}

function calcShares(amount, type, members, values) {
  const m = members.filter(mm => !mm._deleted);
  const n = m.length;
  if (n === 0) return [];
  if (type === 'equal') {
    const per = Math.round((amount / n) * 100) / 100;
    return m.map(mm => ({ memberId: mm.id, amount: per }));
  }
  if (type === 'exact') {
    return m.map(mm => ({ memberId: mm.id, amount: Number(values?.[mm.id]) || 0 }));
  }
  if (type === 'percent') {
    return m.map(mm => ({ memberId: mm.id, amount: Math.round(amount * (Number(values?.[mm.id]) || 0) / 100 * 100) / 100 }));
  }
  if (type === 'shares') {
    const totalShares = m.reduce((s, mm) => s + (Number(values?.[mm.id]) || 1), 0);
    if (totalShares === 0) return m.map(mm => ({ memberId: mm.id, amount: 0 }));
    return m.map(mm => ({ memberId: mm.id, amount: Math.round(amount * (Number(values?.[mm.id]) || 1) / totalShares * 100) / 100 }));
  }
  return [];
}

/* ── Charts ── */

/* ── Render Functions ── */
async function renderDashboard() {
  const allExpenses = [];
  for (const g of state.groups) {
    const exs = await db.getAllByIndex('expenses', 'groupId', g.id);
    exs.forEach(e => { if (e) allExpenses.push({ ...e, groupName: g.name, groupId: g.id }); });
  }
  const pTxs = await db.getAll('personalTxs') || [];
  const budgets = await db.getAll('budgets');
  const thisMonth = today().slice(0, 7);

  let totalIncome = 0, totalSpent = 0;
  for (const b of budgets) {
    totalIncome += b.income || 0;
    const txs = await db.getAllByIndex('budgetTransactions', 'budgetId', b.id);
    totalSpent += (txs || []).reduce((s, t) => s + (t.amount || 0), 0);
  }

  const pMonthTxs = pTxs.filter(t => (t.date||'').startsWith(thisMonth));
  const pMonthTotal = pMonthTxs.reduce((s, t) => s + (t.amount || 0), 0);
  const gMonthExps = allExpenses.filter(e => (e.date||'').startsWith(thisMonth));
  const gMonthTotal = gMonthExps.reduce((s, e) => s + (e.amount || 0), 0);

  const dayTotals = {};
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, label: d.toLocaleDateString('ar-EG', { weekday:'short', day:'numeric' }) });
    dayTotals[key] = 0;
  }
  allExpenses.forEach(e => { if (dayTotals[e.date] !== undefined) dayTotals[e.date] += e.amount || 0; });
  pTxs.forEach(t => { if (dayTotals[t.date] !== undefined) dayTotals[t.date] += t.amount || 0; });

  const pCats = { food:0, transport:0, shopping:0, bills:0, health:0, entertainment:0, other:0 };
  pMonthTxs.forEach(t => { const c = t.category || 'other'; if (pCats[c] !== undefined) pCats[c] += t.amount || 0; });
  const pCatEntries = Object.entries(pCats).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);

  const gCats = {};
  gMonthExps.forEach(e => { const c = e.category || 'other'; gCats[c] = (gCats[c] || 0) + e.amount; });
  const gCatEntries = Object.entries(gCats).sort((a,b) => b[1]-a[1]);

  const recentAll = [
    ...allExpenses.map(e => ({ ...e, source: 'group', label: e.groupName || '' })),
    ...pMonthTxs.map(t => ({ ...t, source: 'personal', label: 'شخصي' })),
  ].sort((a, b) => ((b.date||'') + ' ' + (b.createdAt||'')).localeCompare((a.date||'') + ' ' + (a.createdAt||''))).slice(0, 8);

  document.getElementById('appContent').innerHTML = `
    <div class="page-header" style="margin-bottom:20px">
      <div>
        <h1 style="font-size:22px">الرئيسية</h1>
        <div style="font-size:13px;color:var(--text-muted)">${new Date().toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h2>الملخص</h2></div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
        <div style="background:var(--border-light);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="color:var(--primary);font-size:11px">دخل الميزانية</div>
          <div style="font-size:22px;font-weight:700;direction:ltr;margin-top:4px">${fmt(totalIncome)}</div>
        </div>
        <div style="background:var(--border-light);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="color:var(--negative);font-size:11px">متبقي الميزانية</div>
          <div style="font-size:22px;font-weight:700;direction:ltr;margin-top:4px">${fmt(Math.max(0, totalIncome - totalSpent))}</div>
        </div>
        <div style="background:var(--border-light);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="color:var(--chart-2);font-size:11px">شخصي هذا الشهر</div>
          <div style="font-size:22px;font-weight:700;direction:ltr;margin-top:4px">${fmt(pMonthTotal)}</div>
        </div>
        <div style="background:var(--border-light);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="color:var(--chart-3);font-size:11px">مجموعات هذا الشهر</div>
          <div style="font-size:22px;font-weight:700;direction:ltr;margin-top:4px">${fmt(gMonthTotal)}</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h2>📊 آخر 7 أيام</h2></div>
      <div class="chart-container"><canvas class="chart-canvas" id="dashWeekChart" height="90"></canvas></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="card">
        <div class="card-header"><h2>🍔 شخصي</h2></div>
        ${pCatEntries.length === 0 ? '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">ما في مصاريف شخصية هالشهر</div>' : `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${pCatEntries.map(([c, v]) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px"><span>${PERSONAL_CATS[c]?.icon||'📌'} ${PERSONAL_CATS[c]?.label||c}</span><span style="font-weight:600;direction:ltr">${fmt(v)}</span></div>`).join('')}
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;border-top:1px solid var(--border);padding-top:6px;margin-top:2px;font-weight:700"><span>المجموع</span><span style="direction:ltr">${fmt(pMonthTotal)}</span></div>
        </div>
        `}
      </div>
      <div class="card">
        <div class="card-header"><h2>👥 مجموعات</h2></div>
        ${gCatEntries.length === 0 ? '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">ما في مصاريف مجموعات هالشهر</div>' : `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${gCatEntries.map(([c, v]) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px"><span>${categoryIcon(c)} ${t(c)}</span><span style="font-weight:600;direction:ltr">${fmt(v)}</span></div>`).join('')}
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;border-top:1px solid var(--border);padding-top:6px;margin-top:2px;font-weight:700"><span>المجموع</span><span style="direction:ltr">${fmt(gMonthTotal)}</span></div>
        </div>
        `}
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h2>🕐 آخر المصاريف</h2></div>
      ${recentAll.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-muted)">ما في مصاريف بعد</div>' : `
      <div style="display:flex;flex-direction:column;gap:6px">
        ${recentAll.map(r => `
          <div class="recent-row" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--border-light);border-radius:var(--radius-sm);cursor:pointer" onclick="location.hash='#${r.source === 'personal' ? 'personal' : 'group/'+r.groupId}'">
            <div style="width:6px;height:6px;border-radius:50%;background:${r.source === 'personal' ? 'var(--accent)' : 'var(--primary)'};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.description||'مصروف')}</div>
              <div style="font-size:11px;color:var(--text-muted)">${r.label} · ${r.date||''}</div>
            </div>
            <div style="font-weight:700;font-size:14px;direction:ltr;color:var(--negative)">${fmt(r.amount)}</div>
          </div>
        `).join('')}
      </div>
      `}
    </div>

    <div class="home-sections" style="margin-top:8px">
      <div class="home-card home-card-family" onclick="location.hash='#budget'">
        <div class="home-card-bg"></div>
        <div class="home-card-content">
          <div class="home-card-icon">💰</div>
          <h2>الميزانية</h2>
          <div class="home-card-desc">${budgets.length} ميزانية مفعلة · ${fmt(totalIncome)} دخل</div>
          <div class="home-card-action">تصفح ←</div>
        </div>
      </div>
      <div class="home-card home-card-friends" onclick="location.hash='#personal'">
        <div class="home-card-bg"></div>
        <div class="home-card-content">
          <div class="home-card-icon">🧑</div>
          <h2>مصاريف شخصية</h2>
          <div class="home-card-desc">${pMonthTxs.length} مصروف هذا الشهر · ${fmt(pMonthTotal)}</div>
          <div class="home-card-action">فتح ←</div>
        </div>
      </div>
    </div>
  `;

  const canvas = document.getElementById('dashWeekChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 90 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '90px';
  ctx.scale(dpr, dpr);
  const W = rect.width, H = 90, pad = { t: 8, r: 8, b: 20, l: 8 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const vals = days.map(d => dayTotals[d.key] || 0);
  const max = Math.max(...vals, 1);
  const barW = chartW / days.length * 0.65;
  const gap = chartW / days.length * 0.35;
  ctx.clearRect(0, 0, W, H);
  days.forEach((d, i) => {
    const h = (vals[i] / max) * chartH;
    const x = pad.l + (chartW / days.length) * i + gap / 2;
    const y = pad.t + chartH - h;
    const grad = ctx.createLinearGradient(x, y, x, pad.t + chartH);
    grad.addColorStop(0, '#0D9488');
    grad.addColorStop(1, '#14B8A6');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, h, [2, 2, 0, 0]);
    ctx.fill();
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label.slice(0, 3), x + barW / 2, H - 4);
  });
}

/* ── Personal Expenses ── */
const PERSONAL_CATS = {
  food: { icon:'🍔', label:'طعام' }, transport:{ icon:'🚗', label:'مواصلات' },
  shopping:{ icon:'🛍️', label:'تسوق' }, bills:{ icon:'💡', label:'فواتير' },
  health:{ icon:'❤️', label:'صحة' }, entertainment:{ icon:'🎮', label:'ترفيه' },
  other:{ icon:'📌', label:'أخرى' }
};

async function renderPersonal() {
  const txs = await db.getAll('personalTxs') || [];
  txs.sort((a, b) => ((b.date||'') + ' ' + (b.createdAt||'')).localeCompare((a.date||'') + ' ' + (a.createdAt||'')));
  const thisMonth = today().slice(0, 7);
  const monthTxs = txs.filter(t => (t.date||'').startsWith(thisMonth));
  const monthTotal = monthTxs.reduce((s, t) => s + (t.amount || 0), 0);
  const allTotal = txs.reduce((s, t) => s + (t.amount || 0), 0);

  const cats = { food:0, transport:0, shopping:0, bills:0, health:0, entertainment:0, other:0 };
  monthTxs.forEach(t => { const c = t.category || 'other'; if (cats[c]!==undefined) cats[c] += t.amount||0; });

  document.getElementById('appContent').innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="font-size:22px">🧑 مصاريف شخصية</h1>
        <div style="font-size:13px;color:var(--text-muted)">هذا الشهر: ${fmt(monthTotal)} · الإجمالي: ${fmt(allTotal)}</div>
      </div>
      <button class="btn btn-primary" onclick="showAddPersonal()">+ إضافة</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h2>📊 توزيع المصاريف</h2></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
        ${Object.entries(PERSONAL_CATS).map(([id, c]) => {
          const val = cats[id] || 0;
          const pct = monthTotal > 0 ? Math.round(val / monthTotal * 100) : 0;
          return `
            <div style="background:var(--border-light);border-radius:var(--radius-md);padding:12px;text-align:center">
              <div style="font-size:20px">${c.icon}</div>
              <div style="font-size:11px;color:var(--text-muted);margin:2px 0">${c.label}</div>
              <div style="font-size:15px;font-weight:700;direction:ltr">${fmt(val)}</div>
              <div style="font-size:10px;color:var(--text-muted)">${pct}%</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:8px">
      ${txs.length === 0 ? '<div style="text-align:center;padding:48px 24px;color:var(--text-muted);font-size:14px">ما في مصاريف شخصية بعد<br><button class="btn btn-primary" style="margin-top:12px" onclick="showAddPersonal()">+ أضف أول مصروف</button></div>' : ''}
      ${txs.map((t, i) => `
        <div class="budget-item" style="animation-delay:${(i*0.05).toFixed(2)}s">
          <div class="bi-marker" style="background:${t.category ? 'var(--chart-1)' : 'var(--negative)'}"></div>
          <div style="font-size:18px;flex-shrink:0">${(PERSONAL_CATS[t.category]||PERSONAL_CATS.other).icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.description||'مصروف')}</div>
            <div style="font-size:11px;color:var(--text-muted)">${t.date||''} · ${(PERSONAL_CATS[t.category]||PERSONAL_CATS.other).label}</div>
          </div>
          <div class="bi-amt" style="color:var(--negative)">${fmt(t.amount)}</div>
          <button class="btn btn-ghost bi-del" onclick="deletePersonal('${t.id}')">✕</button>
        </div>
      `).join('')}
    </div>
    <div style="height:40px"></div>
  `;
}

window._pCat = 'food';
function selectPersonalCat(id) {
  window._pCat = id;
  document.querySelectorAll('.cat-btn[data-pcat]').forEach(b => b.classList.toggle('active', b.dataset.pcat === id));
}

function showAddPersonal() {
  showModal('إضافة مصروف شخصي', `
    <div class="form-group">
      <label class="form-label">الوصف</label>
      <input class="form-input" id="pDesc" placeholder="مثال: غداء">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">المبلغ</label>
        <input class="form-input" id="pAmt" type="number" step="0.01" min="0" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">التاريخ</label>
        <input class="form-input" id="pDate" type="date" value="${today()}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">التصنيف</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${Object.entries(PERSONAL_CATS).map(([id, c]) => `<button class="cat-btn ${id === 'food' ? 'active' : ''}" data-pcat="${id}" onclick="selectPersonalCat('${id}')">${c.icon} ${c.label}</button>`).join('')}
      </div>
    </div>
    <button class="btn btn-primary btn-block btn-lg" onclick="savePersonal()">💾 حفظ</button>
  `, true);
  window._pCat = 'food';
}

async function savePersonal() {
  const desc = document.getElementById('pDesc')?.value?.trim() || 'مصروف';
  const amt = parseFloat(document.getElementById('pAmt')?.value);
  if (!amt || amt <= 0) { toast('اكتب المبلغ', 'error'); return; }
  const date = document.getElementById('pDate')?.value || today();
  const tx = { id: uid(), description: desc, amount: amt, date, category: window._pCat || 'other', createdAt: new Date().toISOString() };
  await db.put('personalTxs', tx);
  closeModal();
  toast('✅ تمت الإضافة', 'success');
  renderPersonal();
}

async function deletePersonal(id) {
  if (!confirm('حذف هذا المصروف؟')) return;
  await db.delete('personalTxs', id);
  renderPersonal();
}

function renderGroups() {
  document.getElementById('appContent').innerHTML = `
    <div class="page-header">
      <h1>${t('groups')}</h1>
      <button class="btn btn-primary" onclick="showCreateGroup()">+ ${t('create_group')}</button>
    </div>
    ${state.groups.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <h3>${t('no_groups')}</h3>
          <p>${t('no_groups_desc')}</p>
          <button class="btn btn-primary" onclick="showCreateGroup()">${t('create_group')}</button>
        </div>
      </div>
    ` : `
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="${t('search')}" id="groupSearch" oninput="filterGroups(this.value)">
      </div>
      <div class="groups-grid" id="groupsGrid">
        ${state.groups.map(g => renderGroupCard(g)).join('')}
      </div>
    `}
  `;
}

function renderGroupCard(g) {
  return `
    <div class="group-card" onclick="location.hash='#group/${g.id}'">
      <div class="group-icon" style="background:${g.color}22;font-size:28px">${g.icon || '👥'}</div>
      <h3>${esc(g.name)}</h3>
      <div class="group-meta">${g.members?.length || 0} ${t('members')} · ${g.currency || state.currency}</div>
      <div class="group-balance ${(g.balance || 0) >= 0 ? 'positive' : 'negative'}">${fmt(g.balance || 0)}</div>
      <div class="group-members">
        ${(g.members || []).slice(0, 5).map((m, i) => `
          <div class="member-avatar" style="background:${GROUP_COLORS[i % GROUP_COLORS.length]}">${m.name.charAt(0)}</div>
        `).join('')}
        ${(g.members?.length || 0) > 5 ? `<div class="member-avatar more">+${g.members.length - 5}</div>` : ''}
      </div>
    </div>
  `;
}

function filterGroups(q) {
  const grid = document.getElementById('groupsGrid');
  if (!grid) return;
  grid.innerHTML = state.groups.filter(g => g.name.includes(q)).map(g => renderGroupCard(g)).join('');
}

async function showCreateGroup(groupId) {
  const editGroup = groupId ? state.groups.find(g => g.id === groupId) : null;
  const isEdit = !!editGroup;
  showModal(isEdit ? t('edit') + ' ' + t('group_name') : t('create_group'), `
    <div class="form-group">
      <label class="form-label">${t('group_name')}</label>
      <input class="form-input" id="gName" value="${isEdit ? esc(editGroup.name) : ''}" placeholder="مثال: شقة الطلاب">
    </div>
    <div class="form-group">
      <label class="form-label">${t('group_icon')}</label>
      <div class="icon-options">
        ${GROUP_ICONS.map(ic => `
          <button class="icon-option ${isEdit && editGroup.icon === ic ? 'active' : ''}" data-icon="${ic}" onclick="document.querySelectorAll('.icon-option').forEach(x=>x.classList.remove('active'));this.classList.add('active')">${ic}</button>
        `).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">${t('color') || 'اللون'}</label>
      <div class="color-options">
        ${GROUP_COLORS.map(c => `
          <button class="color-option ${isEdit && editGroup.color === c ? 'active' : ''}" data-color="${c}" style="background:${c}" onclick="document.querySelectorAll('.color-option').forEach(x=>x.classList.remove('active'));this.classList.add('active')"></button>
        `).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">${t('currency')}</label>
      <select class="form-select" id="gCurrency">
        ${CURRENCIES.map(c => `<option value="${c}" ${isEdit && editGroup.currency === c ? 'selected' : c === state.currency ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">${t('add_members')}</label>
      <div class="form-row" style="margin-bottom:8px">
        <input class="form-input" id="newMemberName" placeholder="${t('member_name')}">
        <button class="btn btn-primary" onclick="addMemberToList()">${t('add')}</button>
      </div>
      <div class="member-list" id="memberList"></div>
    </div>
    <button class="btn btn-primary btn-block btn-lg" onclick="${isEdit ? `saveGroupEdit('${editGroup.id}')` : 'saveNewGroup()'}">${t('save')}</button>
  `, true);
  window._tempMembers = isEdit ? [...(editGroup.members || [])] : [];
  renderMemberTags();
}

function addMemberToList() {
  const inp = document.getElementById('newMemberName');
  const name = inp.value.trim();
  if (!name) return;
  if (!window._tempMembers) window._tempMembers = [];
  window._tempMembers.push({ id: uid(), name });
  inp.value = '';
  renderMemberTags();
}

function removeMemberFromList(id) {
  window._tempMembers = window._tempMembers.filter(m => m.id !== id);
  renderMemberTags();
}

function renderMemberTags() {
  const el = document.getElementById('memberList');
  if (!el) return;
  el.innerHTML = (window._tempMembers || []).map(m => `
    <span class="member-tag">
      <span>${esc(m.name)}</span>
      <button class="remove-member" onclick="removeMemberFromList('${m.id}')">✕</button>
    </span>
  `).join('');
}

async function saveNewGroup() {
  const name = document.getElementById('gName').value.trim();
  if (!name) { toast(t('group_name'), 'error'); return; }
  const icon = document.querySelector('.icon-option.active')?.dataset?.icon || '👥';
  const color = document.querySelector('.color-option.active')?.dataset?.color || '#0D9488';
  const currency = document.getElementById('gCurrency').value || state.currency;
  const members = window._tempMembers || [];
  if (members.length < 2) { toast('يجب إضافة عضوين على الأقل', 'error'); return; }
  const group = { id: uid(), name, icon, color, currency, members, balance: 0, createdAt: new Date().toISOString() };
  await db.put('groups', group);
  state.groups.push(group);
  closeModal();
  toast(t('group_created'), 'success');
  updateBadge();
  navigate('groups');
}

async function saveGroupEdit(id) {
  const name = document.getElementById('gName').value.trim();
  if (!name) return;
  const group = state.groups.find(g => g.id === id);
  if (!group) return;
  group.name = name;
  group.icon = document.querySelector('.icon-option.active')?.dataset?.icon || group.icon;
  group.color = document.querySelector('.color-option.active')?.dataset?.color || group.color;
  group.currency = document.getElementById('gCurrency').value || group.currency;
  group.members = window._tempMembers || group.members;
  await db.put('groups', group);
  closeModal();
  toast('تم التحديث', 'success');
  navigate('groups');
}

async function renderGroupPage(groupId) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) { navigate('groups'); return; }
  state.currentGroupId = groupId;

  const expenses = (await db.getAllByIndex('expenses', 'groupId', groupId)) || [];
  const settlements = (await db.getAllByIndex('settlements', 'groupId', groupId)) || [];
  const balances = calcBalances(groupId, expenses, settlements);
  group.balance = Object.values(balances).reduce((s, v) => s + v, 0);
  const debts = simplifyDebts(balances);

  const memberTotals = {};
  (group.members || []).forEach(m => { memberTotals[m.id] = { paid: 0, share: 0 }; });
  expenses.forEach(ex => {
    const payers = Array.isArray(ex.paidBy) ? ex.paidBy : [{ memberId: ex.paidBy, amount: ex.amount }];
    payers.forEach(p => { if (memberTotals[p.memberId]) memberTotals[p.memberId].paid += p.amount; });
    (ex.shares || []).forEach(sh => { if (memberTotals[sh.memberId]) memberTotals[sh.memberId].share += sh.amount; });
  });
  if (!state._memberTotals) state._memberTotals = {};
  state._memberTotals[groupId] = memberTotals;

  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const recentExps = expenses.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20);

  document.getElementById('appContent').innerHTML = `
    <button class="back-btn" onclick="navigate('groups')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
      ${t('groups')}
    </button>
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:36px">${group.icon || '👥'}</div>
        <div>
          <h1>${esc(group.name)}</h1>
          <div class="group-meta" style="font-size:13px;color:var(--text-muted)">${group.members?.length || 0} ${t('members')} · ${group.currency}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="showInviteModal('${group.id}')">${t('invite_members')}</button>
        <button class="btn btn-ghost btn-sm" onclick="showCreateGroup('${group.id}')">${t('edit')}</button>
        <button class="btn btn-accent btn-sm" onclick="showAddExpense('${group.id}')">+ ${t('add_expense')}</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">${t('total_expenses')}</div>
        <div class="stat-value">${fmt(totalExp, group.currency)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('total_balance')}</div>
        <div class="stat-value ${group.balance >= 0 ? 'positive' : 'negative'}">${fmt(group.balance, group.currency)}</div>
      </div>
    </div>

    <div class="tabs" style="margin-top:16px">
      <button class="tab active" data-tab="expenses" onclick="switchGroupTab('expenses', '${group.id}')">${t('expenses')}</button>
      <button class="tab" data-tab="balances" onclick="switchGroupTab('balances', '${group.id}')">${t('total_balance')}</button>
      <button class="tab" data-tab="settlements" onclick="switchGroupTab('settlements', '${group.id}')">${t('settlement_history')}</button>
    </div>

    <div id="groupTabContent">
      ${renderExpensesTab(group, recentExps, balances)}
    </div>
  `;
}

function renderExpensesTab(group, expenses, balances) {
  if (expenses.length === 0) {
    return `
      <div class="card">
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <h3>${t('no_expenses')}</h3>
          <p>${t('no_expenses_desc') || 'أضف أول مصروف لبدء التقاسم'}</p>
          <button class="btn btn-primary" onclick="showAddExpense('${group.id}')">+ ${t('add_expense')}</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="expense-list">
      ${expenses.map((e, i) => {
        const payerNames = getPayersDisplay(e.paidBy, group.members, group.currency);
        return `
          <div class="expense-item" onclick="showExpenseDetail('${group.id}','${e.id}')" style="animation:expenseIn 0.3s var(--ease-out) both;animation-delay:${(i * 0.04).toFixed(2)}s">
            <div class="expense-category-icon" style="background:${categoryColor(e.category)}22;color:${categoryColor(e.category)};font-size:18px">${categoryIcon(e.category)}</div>
            <div class="expense-info">
              <div class="expense-description">${esc(e.description)}</div>
              <div class="expense-meta">${e.date} · ${payerNames}</div>
            </div>
            <div class="expense-amount" style="font-size:14px">${fmt(e.amount, group.currency)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBalancesTab(group, balances) {
  const debts = simplifyDebts(balances);
  const members = group.members || [];
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h2>${t('total_balance')}</h2></div>
      <div class="balance-list">
        ${members.map(m => {
          const bal = balances[m.id] || 0;
          return `
            <div class="balance-item">
              <span class="balance-name">${esc(m.name)}</span>
              <span class="balance-amount ${bal >= 0 ? 'positive' : 'negative'}">${fmt(bal, group.currency)}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h2>ملخص كل عضو — كم دفع وكم عليه</h2></div>
      <div class="balance-list">
        ${members.map(m => {
          const bal = balances[m.id] || 0;
          const paid = (state._memberTotals?.[group.id]?.[m.id]?.paid) || 0;
          const share = (state._memberTotals?.[group.id]?.[m.id]?.share) || 0;
          return `
            <div style="padding:12px 16px;background:var(--border-light);border-radius:var(--radius-sm);margin-bottom:6px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-weight:600">${esc(m.name)}</span>
                <span class="balance-amount ${bal >= 0 ? 'positive' : 'negative'}">${fmt(bal, group.currency)}</span>
              </div>
              <div style="display:flex;gap:12px;font-size:12px;color:var(--text-muted);flex-wrap:wrap">
                <span>💵 دفع: <strong style="color:var(--positive)">${fmt(paid, group.currency)}</strong></span>
                <span>📊 نصيبه: <strong>${fmt(share, group.currency)}</strong></span>
                <span>${bal >= 0 ? '💰 له: ' : '💸 عليه: '}<strong style="color:${bal >= 0 ? 'var(--positive)' : 'var(--negative)'}">${fmt(Math.abs(bal), group.currency)}</strong></span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h2>${t('simplify_debts')}</h2>
        <button class="btn btn-sm btn-primary" onclick="showSettleModal('${group.id}')">${t('settle')}</button>
      </div>
      ${debts.length === 0 ? `
        <p style="text-align:center;padding:24px;color:var(--text-muted)">${t('balanced')}</p>
      ` : debts.map(d => {
        const from = members.find(m => m.id === d.from);
        const to = members.find(m => m.id === d.to);
        return `
          <div class="settlement-item" style="margin-bottom:8px">
            <span style="font-size:14px;font-weight:500">${esc(from?.name || '')}</span>
            <span class="settlement-arrow">⬅️</span>
            <div class="settlement-info">
              <div class="settlement-from-to">${t('owes')}</div>
              <div class="settlement-amount">${fmt(d.amount, group.currency)}</div>
            </div>
            <span style="font-size:14px;font-weight:500">${esc(to?.name || '')}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function renderSettlementsTab(group) {
  const settlements = await db.getAllByIndex('settlements', 'groupId', group.id) || [];
  const members = group.members || [];
  return `
    <div class="card">
      <div class="card-header"><h2>${t('settlement_history')}</h2></div>
      ${settlements.length === 0 ? `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <h3>${t('no_settlements')}</h3>
        </div>
      ` : settlements.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(s => {
        const from = members.find(m => m.id === s.from);
        const to = members.find(m => m.id === s.to);
        return `
          <div class="settlement-item">
            <span style="font-size:14px;font-weight:500">${esc(from?.name || '')}</span>
            <span class="settlement-arrow">⬅️</span>
            <div class="settlement-info">
              <div class="settlement-from-to">${t('owes')} ${esc(to?.name || '')}</div>
              <div class="settlement-amount">${fmt(s.amount, group.currency)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${s.date} · ${s.method || ''}</div>
            </div>
            <span class="settlement-status ${s.status}">${s.status === 'paid' ? t('mark_paid') : t('pending') || 'معلق'}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function switchGroupTab(tab, groupId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;
  db.getAllByIndex('expenses', 'groupId', groupId).then(expenses => {
    db.getAllByIndex('settlements', 'groupId', groupId).then(settlements => {
      const balances = calcBalances(groupId, expenses, settlements);
      const el = document.getElementById('groupTabContent');
      if (tab === 'expenses') el.innerHTML = renderExpensesTab(group, expenses, balances);
      else if (tab === 'balances') el.innerHTML = renderBalancesTab(group, balances);
      else if (tab === 'settlements') renderSettlementsTab(group).then(h => el.innerHTML = h);
    }).catch(() => {});
  }).catch(() => {});
}

async function showAddExpense(groupId) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;
  const members = group.members || [];
  if (members.length === 0) return;

  showModal(t('add_expense'), `
    <div class="form-group">
      <label class="form-label">${t('expense_desc')}</label>
      <input class="form-input" id="eDesc" placeholder="مثال: عشاء">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${t('amount')}</label>
        <input class="form-input" id="eAmount" type="number" step="0.01" min="0" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">${t('category')}</label>
        <div class="split-types" style="grid-template-columns:repeat(4,1fr)">
          ${CATEGORIES.map(c => `
            <button type="button" class="split-type-btn cat-btn" data-cat="${c.id}" style="font-size:11px;padding:8px 4px" onclick="selectCategory('${c.id}')">
              <span style="font-size:20px;display:block">${c.icon}</span>
              <span>${t(c.id)}</span>
            </button>
          `).join('')}
        </div>
        <input class="form-input" id="eCategoryCustom" style="display:none;margin-top:8px" placeholder="اكتب اسم الفئة...">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">${t('date')}</label>
      <input class="form-input" id="eDate" type="date" value="${today()}">
    </div>
    <div class="form-group">
      <label class="form-label">من دفع؟ (يمكن اختيار أكثر من واحد)</label>
      <div id="payersContainer">
        ${members.map(m => `
          <div class="member-split-item">
            <span class="member-name">${esc(m.name)}</span>
            <input class="form-input payer-input" type="number" step="0.01" min="0" data-mid="${m.id}" value="" placeholder="المبلغ اللي دفعه">
          </div>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:4px">
        <span id="payersTotal">المجموع: 0</span>
        <span id="payersRemain" style="color:var(--negative)">متبقي: 0</span>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">${t('split_type')}</label>
      <div class="split-types">
        <button class="split-type-btn active" data-split="equal" onclick="selectSplit('equal')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ${t('split_equal')}
        </button>
        <button class="split-type-btn" data-split="exact" onclick="selectSplit('exact')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          ${t('split_exact')}
        </button>
        <button class="split-type-btn" data-split="percent" onclick="selectSplit('percent')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
          ${t('split_percent')}
        </button>
        <button class="split-type-btn" data-split="shares" onclick="selectSplit('shares')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
          ${t('split_shares')}
        </button>
      </div>
    </div>
    <div class="member-split" id="memberSplit">
      ${members.map(m => {
        const val = m._val || '';
        return `
          <div class="member-split-item">
            <span class="member-name">${esc(m.name)}</span>
            <input class="form-input split-input" type="number" step="0.01" min="0" data-mid="${m.id}" value="${val}" placeholder="0">
          </div>
        `;
      }).join('')}
    </div>
    <button class="btn btn-primary btn-block btn-lg" onclick="saveExpense('${group.id}')">${t('save')}</button>
  `, true);
  window._splitType = 'equal';
  window._selectedCategory = 'food';
  const firstCat = document.querySelector('[data-cat="food"]');
  if (firstCat) firstCat.classList.add('active');
}

function selectCategory(id) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-cat="${id}"]`)?.classList.add('active');
  window._selectedCategory = id;
  const customInput = document.getElementById('eCategoryCustom');
  if (customInput) customInput.style.display = id === 'custom' ? 'block' : 'none';
}

function selectSplit(type) {
  window._splitType = type;
  document.querySelectorAll('.split-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-split="${type}"]`)?.classList.add('active');
  const container = document.getElementById('memberSplit');
  if (!container) return;
  const inputs = container.querySelectorAll('.split-input');
  const amt = parseFloat(document.getElementById('eAmount')?.value) || 0;
  const n = inputs.length;

  if (type === 'equal') {
    const per = n > 0 ? Math.round((amt / n) * 100) / 100 : 0;
    inputs.forEach(inp => { inp.value = per; inp.disabled = true; });
  } else {
    inputs.forEach(inp => { inp.disabled = false; if (!inp.value) inp.value = '0'; });
  }
}

function updatePayersTotal() {
  const inputs = document.querySelectorAll('.payer-input');
  let total = 0;
  inputs.forEach(inp => { total += parseFloat(inp.value) || 0; });
  const totalEl = document.getElementById('payersTotal');
  const remainEl = document.getElementById('payersRemain');
  const expenseAmt = parseFloat(document.getElementById('eAmount')?.value) || 0;
  if (totalEl) totalEl.textContent = `المجموع: ${fmt(total)}`;
  if (remainEl) {
    const diff = expenseAmt - total;
    if (Math.abs(diff) < 0.01) remainEl.textContent = '✅ متطابق';
    else remainEl.innerHTML = `متبقي: ${fmt(diff)}`;
  }
}

document.addEventListener('input', function(e) {
  if (e.target.id === 'eAmount') {
    const type = window._splitType;
    if (type === 'equal') {
      const inputs = document.querySelectorAll('.split-input');
      const amt = parseFloat(e.target.value) || 0;
      const per = inputs.length > 0 ? Math.round((amt / inputs.length) * 100) / 100 : 0;
      inputs.forEach(inp => { inp.value = per; });
    }
    updatePayersTotal();
  }
  if (e.target.classList?.contains('payer-input')) {
    updatePayersTotal();
  }
});

async function saveExpense(groupId) {
  const desc = document.getElementById('eDesc').value.trim();
  const amount = parseFloat(document.getElementById('eAmount').value);
  let category = window._selectedCategory || 'other';
  if (category === 'custom') {
    const customVal = document.getElementById('eCategoryCustom')?.value?.trim();
    if (customVal) category = customVal;
  }
  const date = document.getElementById('eDate').value;
  if (!desc || !amount || amount <= 0) { toast('يرجى إدخال بيانات صحيحة', 'error'); return; }

  const group = state.groups.find(g => g.id === groupId);
  const members = group?.members || [];
  const type = window._splitType || 'equal';

  const paidBy = [];
  document.querySelectorAll('.payer-input').forEach(inp => {
    const val = parseFloat(inp.value) || 0;
    if (val > 0) paidBy.push({ memberId: inp.dataset.mid, amount: val });
  });
  if (paidBy.length === 0) { toast('يرجى تحديد من دفع', 'error'); return; }

  const values = {};
  document.querySelectorAll('.split-input').forEach(inp => {
    values[inp.dataset.mid] = parseFloat(inp.value) || 0;
  });
  const shares = calcShares(amount, type, members, values);

  const expense = {
    id: uid(), groupId, description: desc, amount, category, date, paidBy,
    splitType: type, shares, createdAt: new Date().toISOString()
  };
  await db.put('expenses', expense);
  closeModal();
  toast(t('expense_added'), 'success');
  navigate(`group/${groupId}`);
}

async function showExpenseDetail(groupId, expenseId) {
  const expense = await db.get('expenses', expenseId);
  if (!expense) return;
  const group = state.groups.find(g => g.id === groupId);
  const members = group?.members || [];
  const payerNames = getPayersDisplay(expense.paidBy, members, group?.currency);

  showModal(expense.description, `
    <div style="text-align:center;padding:16px 0">
      <div style="font-size:40px;margin-bottom:8px">${categoryIcon(expense.category)}</div>
      <div style="font-size:28px;font-weight:700">${fmt(expense.amount, group?.currency)}</div>
      <div style="color:var(--text-muted);margin-top:4px">${expense.date} · دفع: ${payerNames}</div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-header"><h2>من دفع</h2></div>
      ${(Array.isArray(expense.paidBy) ? expense.paidBy : [{ memberId: expense.paidBy, amount: expense.amount }]).map(p => {
        const m = members.find(mm => mm.id === p.memberId);
        return `
          <div class="balance-item">
            <span class="balance-name">${esc(m?.name || '')}</span>
            <span class="balance-amount positive">${fmt(p.amount, group?.currency)}</span>
          </div>
        `;
      }).join('')}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h2>${t('split_type')}: ${t('split_' + expense.splitType)}</h2></div>
      ${(expense.shares || []).map(sh => {
        const m = members.find(mm => mm.id === sh.memberId);
        return `
          <div class="balance-item">
            <span class="balance-name">${esc(m?.name || '')}</span>
            <span class="balance-amount">${fmt(sh.amount, group?.currency)}</span>
          </div>
        `;
      }).join('')}
      <div class="balance-item" style="margin-top:8px;border-top:1px solid var(--border)">
        <span class="balance-name" style="font-weight:700">${t('total')}</span>
        <span class="balance-amount">${fmt(expense.amount, group?.currency)}</span>
      </div>
    </div>
    <button class="btn btn-danger btn-block" onclick="deleteExpense('${groupId}','${expense.id}')">${t('delete')}</button>
  `, true);
}

async function deleteExpense(groupId, expenseId) {
  if (!confirm(t('delete_confirm'))) return;
  await db.delete('expenses', expenseId);
  closeModal();
  toast('تم الحذف', 'success');
  navigate(`group/${groupId}`);
}

function showSettleModal(groupId) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;
  db.getAllByIndex('expenses', 'groupId', groupId).then(expenses => {
    db.getAllByIndex('settlements', 'groupId', groupId).then(settlements => {
      const balances = calcBalances(groupId, expenses, settlements);
      const debts = simplifyDebts(balances);
      const members = group.members || [];
      showModal(t('settle'), `
        <div class="form-group">
          <label class="form-label">${t('paid_by')}</label>
          <select class="form-select" id="sFrom">
            ${members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${t('owes')}</label>
          <select class="form-select" id="sTo">
            ${members.filter(m => (balances[m.id] || 0) > 0.01).map(m => `<option value="${m.id}">${esc(m.name)} (${fmt(balances[m.id], group.currency)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${t('amount')}</label>
          <input class="form-input" id="sAmount" type="number" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">طريقة الدفع</label>
          <select class="form-select" id="sMethod">
            <option value="cash">نقداً</option>
            <option value="bank">تحويل بنكي</option>
            <option value="wallet">محفظة إلكترونية</option>
            <option value="other">أخرى</option>
          </select>
        </div>
        <button class="btn btn-primary btn-block btn-lg" onclick="saveSettlement('${group.id}')">${t('settle')}</button>
      `, true);
    }).catch(() => {});
  }).catch(() => {});
}

async function saveSettlement(groupId) {
  const from = document.getElementById('sFrom').value;
  const to = document.getElementById('sTo').value;
  const amount = parseFloat(document.getElementById('sAmount').value);
  const method = document.getElementById('sMethod').value;
  if (!amount || amount <= 0 || !from || !to) { toast('يرجى إدخال بيانات صحيحة', 'error'); return; }
  const settlement = { id: uid(), groupId, from, to, amount, method, status: 'paid', date: today() };
  await db.put('settlements', settlement);
  closeModal();
  toast(t('settlement_marked'), 'success');
  navigate(`group/${groupId}`);
}

function showInviteModal(groupId) {
  const link = `${window.location.origin}${window.location.pathname}?join=${groupId}`;
  showModal(t('invite_members'), `
    <div class="qr-container">
      <div class="qr-code" id="qrCode"></div>
      <div class="qr-link" id="inviteLink">${link}</div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="copyInviteLink()">${t('copy_link')}</button>
      <p style="margin-top:12px;font-size:12px;color:var(--text-muted)">${t('share_link')}</p>
    </div>
  `, true);
  generateQR(link);
}

function generateQR(text) {
  const el = document.getElementById('qrCode');
  if (!el) return;
  const size = 200;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, size, size);
  const cells = 21;
  const cellSize = size / cells;
  const hash = text.split('').reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0), 0);
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const posEnc = r * cells + c + hash;
      const rand = Math.sin(posEnc) * 10000;
      if (rand % 1 > 0.5) {
        ctx.fillStyle = '#0D9488';
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }
  for (let i = 0; i < 7; i++) { for (let j = 0; j < 7; j++) {
    if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
      ctx.fillStyle = '#0D9488';
      ctx.fillRect((i + 1) * cellSize, (j + 1) * cellSize, cellSize, cellSize);
    } else {
      ctx.fillStyle = 'white';
      ctx.fillRect((i + 1) * cellSize, (j + 1) * cellSize, cellSize, cellSize);
    }
  }}
  for (let i = 0; i < 7; i++) { for (let j = 0; j < 7; j++) {
    if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
      ctx.fillStyle = '#0D9488';
      ctx.fillRect((i + 13) * cellSize, (j + 1) * cellSize, cellSize, cellSize);
    } else {
      ctx.fillStyle = 'white';
      ctx.fillRect((i + 13) * cellSize, (j + 1) * cellSize, cellSize, cellSize);
    }
  }}
  for (let i = 0; i < 7; i++) { for (let j = 0; j < 7; j++) {
    if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
      ctx.fillStyle = '#0D9488';
      ctx.fillRect((i + 1) * cellSize, (j + 13) * cellSize, cellSize, cellSize);
    } else {
      ctx.fillStyle = 'white';
      ctx.fillRect((i + 1) * cellSize, (j + 13) * cellSize, cellSize, cellSize);
    }
  }}
  el.innerHTML = '';
  el.appendChild(canvas);
}

function copyInviteLink() {
  const link = document.getElementById('inviteLink');
  if (!link) return;
  navigator.clipboard?.writeText(link.textContent).then(() => {
    toast('تم نسخ الرابط', 'success');
  }).catch(() => {});
}

/* renderInsights removed — replaced by renderDashboard */

function renderSettings() {
  document.getElementById('appContent').innerHTML = `
    <div class="page-header"><h1>${t('settings')}</h1></div>
    <div class="settings-group">
      <h3>المظهر</h3>
      <div class="settings-item">
        <div class="settings-item-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <div class="settings-item-text">
            <h4>${state.theme === 'dark' ? t('dark_mode') : t('light_mode')}</h4>
            <p>${state.theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}</p>
          </div>
        </div>
        <div class="toggle ${state.theme === 'dark' ? 'active' : ''}" onclick="toggleTheme()"><div class="toggle-knob"></div></div>
      </div>
      <div class="settings-item">
        <div class="settings-item-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <div class="settings-item-text">
            <h4>${t('high_contrast')}</h4>
            <p>تباين عالي للرؤية الواضحة</p>
          </div>
        </div>
        <div class="toggle ${state.theme === 'high-contrast' ? 'active' : ''}" onclick="toggleHighContrast()"><div class="toggle-knob"></div></div>
      </div>
    </div>
    <div class="settings-group">
      <h3>${t('currency')}</h3>
      <div class="currency-list">
        ${CURRENCIES.map(c => `
          <button class="currency-option ${state.currency === c ? 'active' : ''}" onclick="setCurrency('${c}')">
            <div class="currency-code">${CURRENCY_SYMBOLS[c] || c}</div>
            <div class="currency-name">${c}</div>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="settings-group">
      <h3>${t('about')}</h3>
      <div class="settings-item">
        <div class="settings-item-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div class="settings-item-text">
            <h4>${t('version')}</h4>
            <p>1.0.0</p>
          </div>
        </div>
      </div>
      <div class="settings-item">
        <div class="settings-item-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          <div class="settings-item-text">
            <h4>SplitEase</h4>
            <p>حساب الشلة • تقاسم المصاريف</p>
          </div>
        </div>
      </div>
      ${supabaseClient && authState.user ? `
      <div class="settings-item" style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px">
        <div class="settings-item-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <div class="settings-item-text">
            <h4>${authState.user?.email || 'مستخدم'}</h4>
            <p>${isLoggedIn() ? 'متصل' : 'غير متصل'}</p>
          </div>
        </div>
      </div>
      <div style="padding:8px 0;text-align:center">
        <button class="btn btn-danger" onclick="authLogout()">تسجيل الخروج</button>
      </div>` : ''}
      <div style="padding:16px 0;text-align:center">
        <button class="btn btn-danger" onclick="clearAllData()">مسح جميع البيانات</button>
      </div>
    </div>
  `;
}

/* ── Theme ── */
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('splitease-theme', state.theme);
  applyTheme(state.theme);
  const el = document.querySelector('.toggle');
  if (el) el.classList.toggle('active');
  renderSettings();
}

function toggleHighContrast() {
  state.theme = state.theme === 'high-contrast' ? 'light' : 'high-contrast';
  localStorage.setItem('splitease-theme', state.theme);
  applyTheme(state.theme);
  renderSettings();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F172A' : '#0D9488');
}

function setCurrency(cur) {
  state.currency = cur;
  localStorage.setItem('splitease-currency', cur);
  renderSettings();
  toast('تم تغيير العملة', 'success');
}

async function clearAllData() {
  if (!confirm('سيتم مسح جميع البيانات! هل أنت متأكد؟')) return;
  const stores = ['groups', 'expenses', 'settlements', 'budgets', 'budgetTransactions'];
  for (const s of stores) {
    const all = await db.getAll(s);
    for (const item of all) await db.delete(s, item.id || item.key);
  }
  state.groups = [];
  toast('تم مسح جميع البيانات', 'success');
  navigate('home');
}

/* ── Navigation ── */
function navigate(page) {
  location.hash = '#' + page;
}

async function handleRoute() {
  const hash = location.hash.slice(1) || 'home';
  const parts = hash.split('/');
  const page = parts[0];
  state.currentPage = page;

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page || (page === 'group' && el.dataset.page === 'groups'));
  });

  const fab = document.getElementById('fab');
  if (!fab) return;
  if (page === 'group' && parts[1]) {
    fab.style.display = 'flex';
  } else if (page === 'home' || page === 'groups' || page === 'personal' || page === 'budget') {
    fab.style.display = 'flex';
  } else {
    fab.style.display = 'none';
  }

  if (supabaseClient && !authState.user && !['login','register'].includes(page)) {
    if (page === 'home') { renderAuthPage('login'); return; }
    document.getElementById('appContent').innerHTML = `<div style="text-align:center;padding:80px 20px"><h2>الرجاء تسجيل الدخول</h2><button class="btn btn-primary" style="margin-top:16px" onclick="navigate('login')">تسجيل الدخول</button></div>`;
    return;
  }
  switch (page) {
    case 'home': await renderDashboard(); break;
    case 'personal': await renderPersonal(); break;
    case 'budget': await renderBudgetList(); break;
    case 'budgetDetail': await renderBudgetDetail(parts[1]); break;
    case 'groups': renderGroups(); break;
    case 'group': await renderGroupPage(parts[1]); break;
    case 'settings': renderSettings(); break;
    case 'login': renderAuthPage('login'); break;
    case 'register': renderAuthPage('register'); break;
    default: await renderDashboard();
  }
  updateBadge();
}

function updateBadge() {
  const badge = document.getElementById('groupsBadge');
  if (badge) {
    const count = state.groups.length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
}

/* ── Modal ── */
function showModal(title, body, large) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalOverlay').classList.add('open');
  if (large) document.querySelector('.modal')?.classList.add('modal-lg');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

/* ── Toast ── */
function toast(msg, type) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'success' ? ' toast-success' : type === 'error' ? ' toast-error' : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
}

/* ── Export ── */
function exportReport(type) {
  const allExpenses = [];
  state.groups.forEach(g => {
    db.getAllByIndex('expenses', 'groupId', g.id).then(exs => {
      exs.forEach(e => { if (e) allExpenses.push(e); });
      if (type === 'pdf') generatePDF(allExpenses);
      else generateExcel(allExpenses);
    });
  });
  setTimeout(() => {
    if (allExpenses.length === 0) toast('لا توجد بيانات للتصدير', 'error');
    else if (type === 'pdf') generatePDF(allExpenses);
    else generateExcel(allExpenses);
  }, 500);
}

function generatePDF(expenses) {
  let html = `
    <html dir="rtl"><head><meta charset="UTF-8"><title>تقرير المصاريف</title>
    <style>body{font-family:Tajawal,sans-serif;padding:40px}h1{color:#0D9488}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:8px 12px;border:1px solid #ddd;text-align:right}th{background:#0D9488;color:white}</style></head>
    <body><h1>تقرير المصاريف - SplitEase</h1>
    <table><thead><tr><th>التاريخ</th><th>الوصف</th><th>الفئة</th><th>المبلغ</th></tr></thead><tbody>
  `;
  expenses.forEach(e => {
    html += `<tr><td>${e.date || ''}</td><td>${esc(e.description)}</td><td>${t(e.category || 'other')}</td><td>${fmt(e.amount)}</td></tr>`;
  });
  html += `</tbody></table>
    <p style="margin-top:20px;color:#666">إجمالي المصاريف: ${fmt(expenses.reduce((s, e) => s + (e.amount || 0), 0))}</p>
    <p style="color:#666;font-size:12px">تم الإنشاء بواسطة SplitEase - ${new Date().toLocaleDateString('ar-EG')}</p>
    </body></html>
  `;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  toast('تم فتح التقرير للطباعة', 'success');
}

function generateExcel(expenses) {
  let csv = 'التاريخ,الوصف,الفئة,المبلغ\n';
  expenses.forEach(e => {
    const desc = (e.description || '').replace(/,/g, '،');
    csv += `${e.date || ''},${desc},${t(e.category || 'other')},${e.amount || 0}\n`;
  });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `SplitEase_${today()}.csv`;
  link.click();
  toast('تم تحميل التقرير', 'success');
}

/* ── Budget / الميزانية ── */

async function renderBudgetList() {
  const budgets = await db.getAll('budgets');
  budgets.sort((a, b) => b.month?.localeCompare(a.month) || 0);
  // Calculate spent for each budget
  const spentMap = {};
  for (const b of budgets) {
    const txs = await db.getAllByIndex('budgetTransactions', 'budgetId', b.id);
    spentMap[b.id] = (txs || []).reduce((s, t) => s + (t.amount || 0), 0);
  }
  document.getElementById('appContent').innerHTML = `
    <div class="page-header">
      <h1>${t('budget')}</h1>
      <button class="btn btn-primary" onclick="showAddBudget()">+ ${t('add_budget')}</button>
    </div>
    ${budgets.length === 0 ? `
      <div class="empty-state">
        <div style="font-size:64px;margin-bottom:16px">💰</div>
        <h3>${t('budget_empty')}</h3>
        <p style="color:var(--text-muted)">${t('budget_empty_desc')}</p>
      </div>
    ` : `
      <div class="budget-grid">
        ${budgets.map((b, i) => renderBudgetCard(b, spentMap[b.id] || 0, i)).join('')}
      </div>
    `}
  `;
}

function renderBudgetCard(b, spent, idx) {
  spent = spent || 0;
  const income = b.income || 0;
  const remaining = income - spent;
  const pct = income > 0 ? Math.round((spent / income) * 100) : 0;
  const remPct = income > 0 ? Math.round((remaining / income) * 100) : 0;
  const isOver = pct > 100;
  return `
    <div class="budget-card" onclick="location.hash='budgetDetail/${b.id}'" style="animation-delay:${((idx||0) * 0.07).toFixed(2)}s">
      <div class="bc-top">
        <span class="bc-month">${b.month || ''}</span>
        <span class="bc-name">${esc(b.name || '')}</span>
      </div>
      <div class="bc-remaining ${remaining < 0 ? 'neg' : ''}">
        <span class="bc-rem-val">${fmt(Math.max(0, remaining))}</span>
        <span class="bc-rem-pct">${isOver ? '0%' : remPct + '%'}</span>
      </div>
      <div class="bc-bar">
        <div class="bc-bar-fill" style="width:${Math.min(pct, 100)}%"></div>
      </div>
      <div class="bc-bottom">
        <span>${t('budget_income')} ${fmt(income)}</span>
        <span style="color:var(--danger)">${fmt(spent)} ${t('budget_spent')}</span>
      </div>
    </div>
  `;
}

async function renderBudgetDetail(budgetId) {
  const b = await db.get('budgets', budgetId);
  if (!b) { location.hash = 'budget'; return; }
  const btxs = await db.getAllByIndex('budgetTransactions', 'budgetId', budgetId);
  b.transactions = btxs || [];
  const spent = b.transactions.reduce((s, t) => s + (t.amount || 0), 0);
  const income = b.income || 0;
  const remaining = Math.max(0, income - spent);
  const pct = income > 0 ? Math.round((remaining / income) * 100) : 0;

  document.getElementById('appContent').innerHTML = `
    <div class="page-header" style="margin-bottom:4px">
      <button class="btn btn-ghost" onclick="location.hash='budget'">←</button>
      <div class="bd-title">${esc(b.month || b.name || '')}</div>
      <div>
        <button class="btn btn-ghost btn-sm" onclick="showEditBudget('${b.id}')" style="margin-left:4px">⚙️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBudget('${b.id}')">🗑</button>
      </div>
    </div>

    <div class="budget-summary">
      <div class="budget-income-card">
        <div class="bs-label">${t('budget_income')}</div>
        <div class="bs-value">${fmt(income)}</div>
      </div>
      <div class="budget-remaining-card ${remaining <= 0 ? 'is-empty' : ''}">
        <div class="bs-label">المتبقي</div>
        <div class="bs-value">${fmt(remaining)}</div>
        <div class="bs-pct">${pct}% ${t('budget_remaining')}</div>
      </div>
    </div>

    <div class="budget-add-row">
      <input class="form-input" id="bAddDesc" placeholder="مصروف (مثال: إيجار البيت)" style="flex:1;font-size:14px" onkeydown="if(event.key==='Enter')document.getElementById('bAddAmt').focus()">
      <input class="form-input" id="bAddAmt" type="number" step="0.01" min="0" placeholder="المبلغ" style="width:90px;font-size:14px;text-align:center" onkeydown="if(event.key==='Enter')budgetAddTx('${b.id}')">
      <button class="btn btn-primary bd-add-btn" onclick="budgetAddTx('${b.id}')">+</button>
    </div>

    <div class="budget-items" id="budgetItems">
      ${b.transactions.length === 0 ? '<div class="bd-empty">ما في مصاريف بعد</div>' : ''}
      ${b.transactions.sort((a, d) => (d.createdAt || '').localeCompare(a.createdAt || '')).map((tx, i) => `
        <div class="budget-item" style="animation-delay:${(i * 0.06).toFixed(2)}s">
          <div class="bi-marker"></div>
          <div class="bi-desc">${esc(tx.description || 'مصروف')}</div>
          <div class="bi-amt">${fmt(tx.amount)}</div>
          <button class="btn btn-ghost bi-del" onclick="budgetDelTx('${tx.id}','${b.id}')">✕</button>
        </div>
      `).join('')}
    </div>
    <div style="height:40px"></div>
  `;
  setTimeout(() => document.getElementById('bAddDesc')?.focus(), 300);
}

async function budgetAddTx(budgetId) {
  try {
    const descEl = document.getElementById('bAddDesc');
    const amtEl = document.getElementById('bAddAmt');
    if (!descEl || !amtEl) { toast('خطأ في تحميل الصفحة، حاول مرة أخرى', 'error'); return; }
    const desc = descEl.value?.trim() || 'مصروف';
    const amt = parseFloat(amtEl.value);
    if (!amt || amt <= 0) { toast('اكتب المبلغ', 'error'); return; }
    const tx = { id: uid(), budgetId, description: desc, amount: amt, categoryId: 'general', date: today(), createdAt: new Date().toISOString() };
    await db.put('budgetTransactions', tx);
    descEl.value = '';
    amtEl.value = '';
    descEl.focus();
    toast('✅ تمت الإضافة', 'success');
    await renderBudgetDetail(budgetId);
  } catch(e) {
    toast('خطأ: ' + e.message, 'error');
  }
}

async function budgetDelTx(txId, budgetId) {
  await db.delete('budgetTransactions', txId);
  await renderBudgetDetail(budgetId);
}

function showAddBudget() {
  const months = [];
  const d = new Date();
  for (let i = -2; i <= 2; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const val = m.toISOString().slice(0, 7);
    const label = m.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
    months.push({ val, label });
  }
  showModal(t('add_budget'), `
    <div class="form-group">
      <label class="form-label">${t('income_label')}</label>
      <input class="form-input" id="bName" value="راتب ${months[2]?.label || ''}" placeholder="مثال: راتب يوليو">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${t('budget_month')}</label>
        <select class="form-select" id="bMonth">${months.map(m => `<option value="${m.val}" ${m.val === months[2].val ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('monthly_income')}</label>
        <input class="form-input" id="bIncome" type="number" step="0.01" min="0" placeholder="0.00">
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="saveBudget()">${t('save')}</button>
  `, true);
}

function saveBudget(editId) {
  const name = document.getElementById('bName')?.value?.trim();
  const month = document.getElementById('bMonth')?.value;
  const income = parseFloat(document.getElementById('bIncome')?.value) || 0;
  if (!name || !month || income <= 0) { toast('يرجى تعبئة جميع الحقول', 'error'); return; }
  const id = editId || uid();
  const budget = { id, name, month, income, categories: [], createdAt: new Date().toISOString() };
  db.put('budgets', budget).then(() => {
    closeModal();
    toast('تم حفظ الميزانية ✅', 'success');
    renderBudgetList();
    location.hash = `budgetDetail/${id}`;
  });
}

async function showEditBudget(budgetId) {
  const b = await db.get('budgets', budgetId);
  if (!b) return;
  const months = [];
  const d = new Date();
  for (let i = -2; i <= 2; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    months.push({ val: m.toISOString().slice(0, 7), label: m.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' }) });
  }
  showModal(t('edit'), `
    <div class="form-group">
      <label class="form-label">${t('income_label')}</label>
      <input class="form-input" id="bName" value="${(b.name || '').replace(/[&<>"']/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; })}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${t('budget_month')}</label>
        <select class="form-select" id="bMonth">${months.map(m => `<option value="${m.val}" ${m.val === b.month ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('monthly_income')}</label>
        <input class="form-input" id="bIncome" type="number" step="0.01" min="0" value="${b.income || 0}">
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="saveBudget('${b.id}')">${t('save')}</button>
  `, true);
}

async function deleteBudget(budgetId) {
  if (!confirm(t('delete_confirm'))) return;
  const txs = await db.getAllByIndex('budgetTransactions', 'budgetId', budgetId);
  for (const tx of txs) { if (tx?.id) await db.delete('budgetTransactions', tx.id); }
  await db.delete('budgets', budgetId);
  toast(t('budget_deleted'), 'success');
  location.hash = 'budget';
}

/* ── PWA ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(() => {
    if (deferredPrompt) {
      toast('📲 يمكنك تثبيت التطبيق على جهازك', 'success');
    }
  }, 5000);
});

/* ── Init ── */
async function init() {
  await db.init();
  await loadState();
  await initAuth();

  // Request persistent storage so browser never auto-clears our data
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      navigator.storage.persist().catch(() => {});
    }
  }

  document.getElementById('loadingScreen').classList.add('hidden');
  setTimeout(() => { document.getElementById('loadingScreen').style.display = 'none'; }, 500);

  handleRoute();
  window.addEventListener('hashchange', handleRoute);

  const mc = document.getElementById('modalClose');
  if (mc) mc.addEventListener('click', closeModal);
  const mo = document.getElementById('modalOverlay');
  if (mo) mo.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  const fabBtn = document.getElementById('fab');
  if (fabBtn) {
    fabBtn.addEventListener('click', () => {
      if (state.currentPage === 'group' && state.currentGroupId) {
        showAddExpense(state.currentGroupId);
      } else if (state.currentPage === 'personal') {
        showAddPersonal();
      } else if (state.currentPage === 'budget') {
        showAddBudget();
      } else if (state.groups.length > 0) {
        showAddExpense(state.groups[0].id);
      } else {
        showAddBudget();
      }
    });
  }

  document.querySelectorAll('.nav-item[data-page], .bottom-nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.page;
      if (page) navigate(page);
    });
  });

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  updateBadge();
}

document.addEventListener('DOMContentLoaded', init);
window.navigate = navigate;
window.showCreateGroup = showCreateGroup;
window.addMemberToList = addMemberToList;
window.removeMemberFromList = removeMemberFromList;
window.saveNewGroup = saveNewGroup;
window.saveGroupEdit = saveGroupEdit;
window.showAddExpense = showAddExpense;
window.selectCategory = selectCategory;
window.selectSplit = selectSplit;
window.saveExpense = saveExpense;
window.showExpenseDetail = showExpenseDetail;
window.deleteExpense = deleteExpense;
window.showSettleModal = showSettleModal;
window.saveSettlement = saveSettlement;
window.showInviteModal = showInviteModal;
window.copyInviteLink = copyInviteLink;
window.switchGroupTab = switchGroupTab;
window.filterGroups = filterGroups;
window.toggleTheme = toggleTheme;
window.toggleHighContrast = toggleHighContrast;
window.setCurrency = setCurrency;
window.clearAllData = clearAllData;
window.exportReport = exportReport;
window.closeModal = closeModal;
window.toast = toast;
window.showAddBudget = showAddBudget;
window.saveBudget = saveBudget;
window.showEditBudget = showEditBudget;
window.deleteBudget = deleteBudget;
window.budgetAddTx = budgetAddTx;
window.budgetDelTx = budgetDelTx;
window.renderAuthPage = renderAuthPage;
window.authLogin = authLogin;
window.authRegister = authRegister;
window.authLogout = authLogout;
window.useLocalMode = useLocalMode;
window.showAddPersonal = showAddPersonal;
window.selectPersonalCat = selectPersonalCat;
window.savePersonal = savePersonal;
window.deletePersonal = deletePersonal;
})();
