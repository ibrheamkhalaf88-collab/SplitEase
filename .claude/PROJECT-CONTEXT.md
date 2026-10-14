# Project Context

- **الاسم / Name:** SplitEase — حساب الشلة
- **شو بيعمل / What it does:** تطبيق ويب (PWA) لتقاسم مصاريف الشل والعائلة: مجموعات،
  تقسيط (مساوي/مبالغ/نِسب/حصص)، ميزانية شهرية، تقارير، وشات لحظي. يعمل أوفلاين
  بالكامل، عربي RTL.
- **الجمهور / Audience:** شلّات وأصدقاء وعائلات عربية تبي تقسم الفواتير بسرعة من الموبايل.
- **الـstack:** HTML + CSS + JS خام (بدون build step، بدون framework)، PWA مع service worker،
  IndexedDB محلي، Supabase اختياري للمزامنة السحابية والشات.
- **الخدمات الخارجية:** Supabase (اختياري — بدونه يعمل محلياً فقط)، Google Fonts (Baloo Bhaijaan 2 + Cairo).
- **اللغة واللهجة:** عربي RTL بالكامل، مصري عامي بسيط في الـUI + i18n عبر `i18n.ar`.
- **القيود:** بدون dependencies وبدون npm install؛ الاختبارات `node:test` (60 اختبار)
  لازم تنجح؛ RLS أمني في Supabase migrations؛ النشر على GitHub Pages عبر CI.

## المصطلحات — Terminology
| عربي | إنجليز | ملاحظة |
|---|---|---|
| الشلة / المجموعة | group | نفس الشيء، `groupId` |
| مصروف | expense | |
| تقسيط | split | equal / exact / percent / shares |
| تسوية | settlement | |
| الميزانية | budget | شهرية، مرتبطة بالراتب |
| شخصي | personal | مصاريف فردية خارج المجموعات |
| تقارير | insights | رسوم بيانية + تصدير PDF/Excel |
| الشلة السحابية | cloud | يتطلب Supabase، يظهر فقط عند الإقلاع |
| شات لحظي | realtime chat | داخل الغرف السحابية |

## التنقّل الحالي — Navigation (index.html)
Sidebar + Bottom-nav: الرئيسية · الميزانية · شخصي · المجموعات · الشلة السحابية · التقارير · الإعدادات

## التصميم الحالي
"sticker" theme — كرتوني مسطّح: ورق كريمي `#FFF8EC`، حبر بنفسجي غامق `#221631`،
ظلال صلبة offset بدون blur، بدون تدرّجات، خطوط Baloo (عناوين) + Cairo (نص).
