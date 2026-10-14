# SplitEase

غرف مشتركة (شلة / عائلة) بدخول بالاسم وكلمة المرور + شات لحظي + تقاسم
مصاريف جماعي. تطبيق ويب تقدمي (PWA) يعمل أوفلاين، عربي RTL بالكامل، بدون أي
build step.

## التشغيل محلياً

```bash
# أي سيرفر ملفات ثابت يكفي
npx serve .
```

ثم افتح `http://localhost:3000`. لا يوجد `npm install` — المشروع بلا أي
اعتمادية (dependencies).

## تفعيل المزامنة السحابية (Supabase)

التطبيق يعمل بالكامل بدون Supabase (البيانات في IndexedDB على الجهاز). ميزات
الشِلال المشتركة، الشات، والمصاريف الحقيقية تحتاج مشروع Supabase.

> ⚠️ المشروع القديم `mwfbgucayjgbbvcyelbo` **مستبعد نهائياً**. أنشئ مشروعاً
> جديداً واربطه.

**1) طبّق الـ schema:**

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # يقرأ كل ملفات supabase/migrations/ بالترتيب
```

> لا تشغّل `supabase/schema.sql` يدوياً — الملف قديم وغير آمن، ومكتوب فيه
> تحذير بالتفصيل. الـ migration هي المصدر الوحيد للحقيقة.

**2) فعّل التطبيق:** أنشئ `js/supabase-config.local.js` (مُستثنى من Git):

```js
window.SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_ANON_PUBLIC_KEY'
};
```

يُحمّل بعد `js/supabase-config.js` ويتجاوزه. **لا تضع `service_role` key في
أي ملف** — الحماية كلها على مستوى RLS، ومفتاح `anon` عام بالتصميم.

**3) إشعارات Push (اختياري):** في Supabase Dashboard → Edge Functions → Environment Variables، أضف:
- `VAPID_PUBLIC_KEY` = `BHgbrA4mKkxoCW_US7RtsTGQ_ZAXPGL8pbG0TJ1-Jm2jM5e09LZiaB6_Pmt93rnsTAzs48jQ8LjSCmUa2FnexKE` (نفس اللي في `sw.js`)
- `VAPID_PRIVATE_KEY` = `GitEEIscI7IML1z8zHjtdNBmtfi_Ih5lYXkv8O79oDo` (من `npx web-push generate-vapid-keys`)
- `VAPID_SUBJECT` = `mailto:your-email@domain.com`

ثم انشر الـ Edge Functions:
```bash
supabase functions deploy send-push push-subscribe
```

عند الإقلاع سيظهر عنصر "السحابة" في القائمة تلقائياً. بدونه التطبيق يعمل
محلياً فقط.

## الاختبارات

```bash
npm test
```

60 اختبار على `node:test` بلا اعتمادية. تغطي: سلامة الـ service worker و
manifest، توافق أسماء RPC بين العميل والـ migration، عقود Accessibility،
وخصائص RLS الحساسة (profiles المقروءة للذات فقط، منع الانضمام الذاتي لكل
مجموعة، تثبيت `search_path` لكل دالة `SECURITY DEFINER`، ومنع الكتابة
المباشرة على جدول الدعوات) — إضافة إلى `tests/rooms.test.mjs` التي تحرس
نظام الغرف: `room_secrets` مقفولة على `SECURITY DEFINER` بس، كلمة السر
bcrypt، و`join_room` بتردّ بمồn واحد لكل من «الغرفة مش موجودة» و«كلمة السر
غلط» عشان ما يبقاش فيه طريقة لتكهن بأسماء الغرف.

> على Windows، شغّل `node --test` **بدون** مسار مجلد؛ تمرير `tests` يفشل تحت
> المسار غير-ASCII فيظهر `MODULE_NOT_FOUND`.

لتأكيد أن الاختبارات الأمنية ليست صورية، عدّل الـ migration عمداً وشاهدها
تفشل قبل الإصلاح.

## النشر (GitHub Pages)

`.github/workflows/ci.yml` يشغّل الاختبارات ثم ينشر على Pages بعد نجاحها.
الموقع ثابت بالكامل، فيُرفع جذر المستودع كما هو.

## التثبيت على الجوال (PWA) — يعمل أوفلاين 100%

التطبيق **Progressive Web App** مكتمل:
- **Service Worker** يخزن كل الملفات (HTML, CSS, JS, الأيقونات) — يفتح بدون إنترنت
- **IndexedDB** يخزن كل بياناتك محلياً (المجموعات، المصاريف، الميزانيات، الإعدادات)
- **Manifest** مع أيقونات `maskable` و `shortcuts` للوصول السريع
- **إشعارات Push** عبر Web Push API (VAPID)

**طريقة التثبيت:**
1. افتح الموقع في المتصفح (Chrome/Edge على أندرويد، Safari على iOS)
2. **أندرويد:** سيظهر بار "ثبت التطبيق" أو اذهب لإعدادات المتصفح → "تثبيت التطبيق"
3. **iOS:** اضغط زر المشاركة ← "إضافة إلى الشاشة الرئيسية"
4. الأيقونة تظهر على الشاشة الرئيسية، تفتح بملء الشاشة (standalone)، وتعمل أوفلاين بالكامل

في الإعدادات هتلاقي قسم **"التطبيق على جهازك"** مع زر تثبيت مباشر أو تعليمات iOS.

## البنية

| المسار | الدور |
| --- | --- |
| `index.html` | نقطة الدخول الوحيدة (SPA بسيط) |
| `js/app.js` | التوجيه، الواجهة الأساسية، الـ modals |
| `js/cloud.js` | طبقة Supabase: RPCs، الأدوار، الدعوات |
| `js/cloud-ui.js` | واجهات الشِلال والمحادثة |
| `js/store.js` | IndexedDB + المزامنة المحلية |
| `sw.js` | العمل أوفلاين |
| `supabase/migrations/` | مصدر الحقيقة الوحيد للـ schema |
| `tests/smoke.test.mjs` | اختبارات الانحدار |

## الرخصة

جميع الحقوق محفوظة.
