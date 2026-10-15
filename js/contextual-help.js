/* ============================================================
   Contextual Help System — "صديقك في SplitEase"
   ------------------------------------------------------------
   Help Mode يفعّل طبقة شرح سياقية:
   - أيقونة مساعدة عائمة (أسفل يمين)
   - لما تضغط عليها → تدخل "وضع الشرح"
   - كل زر/حقل عليه هالة خفيفة، تضغط عليه → تطلع بطاقة شرح
   - شرح بصيغة شخصية: "أهلاً! هنا تحط راتبك الشهري..."
   - يتذكر شو شفت وما يعيد الشرح إلا لو طلبت
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'splitease-help-seen';
  const HELP_MODE_KEY = 'splitease-help-mode';

  /* ── Help Content: شخصية ودية تشرح كل عنصر ── */
  const HELP_CARDS = {
    // Dashboard / Home
    'fab': {
      title: '➕ زر إضافة مصروف',
      body: 'أهلاً! هذا الزر السحري — تضغط عليه عشان تسجل أي مصروف جديد. '
        + 'بتكتب المبلغ، تختار الفئة (أكل، مواصلات، تسوق...)، '
        + 'تختار مين دفع، وتقسمه على الباقي لو كان لمجموعة. '
        + 'بخطوة وحدة خلصنا! 🎯',
      icon: '➕'
    },
    'dash-income': {
      title: '💰 دخل الميزانية',
      body: 'هنا شايف إجمالي رواتبك/دخلك للشهر. '
        + 'لما تضيف ميزانية جديدة (من صفحة الميزانية)، المجموع يتحدّث أوتوماتيك. '
        + 'يساعدك تعرف كم معاك بالأساس قبل ما تصرف. 💡',
      icon: '💰'
    },
    'dash-remaining': {
      title: '✅ متبقي الميزانية',
      body: 'هذا الفرق بين دخلك وإجمالي مصاريف الميزانيات. '
        + 'لو أخضر = أنت ضمن الميزانية، لو أحمر = تجاوزت. '
        + 'هدفك دايمًا إن هالرقم يكون أخضر! 🟢',
      icon: '✅'
    },
    'dash-personal': {
      title: '🧑 شخصي هذا الشهر',
      body: 'مجموع مصاريفك الشخصية (مش للمجموعات) للشهر الحالي. '
        + 'تضاف من زر + في صفحة "مصاريف شخصية". مفيد عشان تفصل مصاريفك عن مصاريف الشلة. 📝',
      icon: '🧑'
    },
    'dash-groups': {
      title: '👥 مجموعات هذا الشهر',
      body: 'إجمالي مصاريف كل المجموعات اللي أنت فيها. '
        + 'كل مصروف تسجله في مجموعة بيوصل لهون. '
        + 'اضغط على بطاقة مجموعة عشان تشوف التفاصيل والتسويات. 📊',
      icon: '👥'
    },
    'home-budget-card': {
      title: '💳 بطاقة الميزانية',
      body: 'اختصار سريع لصفحة الميزانيات. '
        + 'تعرض كم ميزانية مفعلة وإجمالي الدخل. '
        + 'اضغط عليها ← تدخل تصنع ميزانيات، تضيف بنود، وتتابع صرفك يومياً. 🗓️',
      icon: '💳'
    },
    'home-personal-card': {
      title: '🧾 بطاقة مصاريف شخصية',
      body: 'توصلك لصفحة مصاريفك الشخصية بسرعة. '
        + 'تعرض عدد المصاريف هذا الشهر والمجموع. '
        + 'مناسبة للمصاريف اللي بس تخصك (قهوة، بنزين، هدية لنفسك...). ☕',
      icon: '🧾'
    },

    // Bottom Nav / Sidebar
    'nav-home': {
      title: '🏠 الرئيسية',
      body: 'لوحة التحكم الرئيسية — ملخص كل شي: ميزانيات، مجموعات، مصاريف شخصية، '
        + 'آخر ٧ أيام، وآخر المصاريف. دايماً ابدأ من هون! 🚀',
      icon: '🏠'
    },
    'nav-budget': {
      title: '💰 الميزانية',
      body: 'هنا تدير راتبك الشهري بذكاء: '
        + '1️⃣ تضيف "ميزانية جديدة" → تكتب اسم الراتب والمبلغ\n'
        + '2️⃣ تضيف "أبنود" (أكل، إيجار، فواتير، توفير...)\n'
        + '3️⃣ كل يوم تضيف مصاريفك → التطبيق يوري لك كم صرفت وكم ضايق\n'
        + '4️⃣ تشوف تقارير مرئية وتصderr Excel/PDF\n'
        + 'النتيجة: ما في مفاجآت آخر الشهر! 📈',
      icon: '💰'
    },
    'nav-personal': {
      title: '🧑 مصاريف شخصية',
      body: 'مصروفاتك بس — ما حد يراها غيرك. '
        + 'مثالية للقهوة الصباحية، بنزين السيارة، هدية لصديق، إلخ. '
        + 'تضاف من زر +، وتظهر لك تقارير فئات ومرئية. 🫣',
      icon: '🧑'
    },
    'nav-groups': {
      title: '👥 المجموعات (الشلل)',
      body: 'قلب التطبيق! هنا تصنع "شلة" مع أصحابك:\n'
        + '• شقة طلاب • رحلة • عائلة • مشروع\n'
        + 'تضيف الأعضاء، تسجل مصاريف مشتركة، '
        + 'التطبيق يحسب مين عليه مين أوتوماتيك ✨\n'
        + 'في الآخر تضغط "تسوية" وتصير الحسابات واضحة. 🤝',
      icon: '👥'
    },
    'nav-cloud': {
      title: '☁️ الشلة السحابية',
      body: 'ميزة Pro: شلتك على السحابة = تشتغل من أي جهاز!\n'
        + '• شات لحظي مع المجموعة\n'
        + '• مصاريف تتحدث لحظي للجميع\n'
        + '• دعوات برمز قصير (مش لينك طويل)\n'
        + '• إشعارات Push لما حد يضيف مصروف عليك\n'
        + 'محتاج حساب Supabase (مجاني) وتفعيله من الإعدادات. 🌐',
      icon: '☁️'
    },
    'nav-insights': {
      title: '📊 التقارير',
      body: 'مكانتك تفهم فلوسك: '
        + '• رسم بياني شهري للمصاريف\n'
        + '• توزيع الفئات (دائري/أعمدة)\n'
        + '• اتجاه الصرف مع الوقت\n'
        + '• تصدير PDF/Excel للمحاسبة\n'
        + 'البيانات = قرارات مالية أفضل! 📉',
      icon: '📊'
    },
    'nav-settings': {
      title: '⚙️ الإعدادات',
      body: 'مركز التحكم:\n'
        + '• 🎨 المظهر: ليلي/نهاري/تباين عالي\n'
        + '• 💱 العملة: جنيه/دولار/ريال/يورو...\n'
        + '• 🔔 الإشعارات: تفعيل/إلغاء\n'
        + '• 👤 اسمك في التطبيق\n'
        + '• 📱 تثبيت التطبيق على الجوال (PWA)\n'
        + '• 🔁 إعادة الجولة التعليمية\n'
        + '• 🗑️ مسح كل البيانات (بحذر!) 🔧',
      icon: '⚙️'
    },

    // Budget Page
    'budget-add': {
      title: '➕ ميزانية جديدة',
      body: 'الخطوة الأولى: اضغط هون تصنع ميزانية شهرية.\n'
        + 'تكتب: اسم الراتب (مثلاً: "راتب يوليو")، المبلغ، '
        + 'الشهر، وتختار العملة. '
        + 'بعدين بتضيف بنود (أكل، إيجار، توفير...) لكل ميزانية. 🗓️',
      icon: '➕'
    },
    'budget-card': {
      title: '📋 بطاقة ميزانية',
      body: 'كل ميزانية بتظهر ك بطاقة فيها:\n'
        + '• الاسم والشهر\n'
        + '• الدخل الكلي\n'
        + '• المصروف الكلي\n'
        + '• المتبقي (أخضر=ماشي، أحمر=تجاوز)\n'
        + 'اضغط عليها ← تدخل تشوف البنود وتضيف مصاريف. 📂',
      icon: '📋'
    },
    'budget-category': {
      title: '🏷️ بند مصاريف',
      body: 'البنود هي "أكياس" مصاريفك: أكل، إيجار، فواتير، توفير، ترفيه...\n'
        + 'لكل بند تخصص مبلغ من راتبك. '
        + 'لما تصرف، تختار البند → التطبيق يخصم منه ويوري لك المتبقي. '
        + 'لو تجاوزت البند → يطلع أحمر ⚠️. نظام الظرف (Envelope System) الكلاسيكي! 💼',
      icon: '🏷️'
    },
    'budget-add-transaction': {
      title: '➕ إضافة مصروف للميزانية',
      body: 'من داخل الميزانية، تضغط هون تسجل مصروف يخص بند معين.\n'
        + 'تكتب: الوصف، المبلغ، التاريخ، تختار البند. '
        + 'المبلغ يخصم من البند تلقائياً. '
        + 'هكذا تدري وين راحت كل قرش! 💸',
      icon: '➕'
    },

    // Groups Page
    'group-create': {
      title: '🆕 مجموعة جديدة',
      body: 'اضغط هون تبدا شلة جديدة:\n'
        + '1️⃣ اسم الشلة (شقة، رحلة، عائلة...)\n'
        + '2️⃣ أيقونة ولون يميزها\n'
        + '3️⃣ العملة\n'
        + '4️⃣ تضيف الأعضاء (الحد الأدنى 2)\n'
        + '5️⃣ احفظ → صرت جاهز تسجل مصاريف! 🎉',
      icon: '🆕'
    },
    'group-card': {
      title: '🃏 بطاقة المجموعة',
      body: 'كل شلة بتظهر ك بطاقة فيها:\n'
        + '• الأيقونة والاسم\n'
        + '• عدد الأعضاء\n'
        + '• الرصيد الكلي (أخضر=مستحق لك، أحمر=عليك)\n'
        + '• صور الأعضاء الأوائل\n'
        + 'اضغط ← تدخل تشوف مصاريف، تسويات، شات. 🚪',
      icon: '🃏'
    },
    'group-search': {
      title: '🔍 بحث المجموعات',
      body: 'لما تصير عندك مجموعات كتير، اكتب هنا اسم الشلة '
        + 'وتطلع لك على طول. مريح جداً! 🔎',
      icon: '🔍'
    },

    // Group Detail Page
    'group-fab': {
      title: '➕ مصروف جديد في الشلة',
      body: 'هون تسجل مصروف للمجموعة:\n'
        + '• الوصف: "غداء جماعي"، "بنزين الرحلة"\n'
        + '• المبلغ والفئة\n'
        + '• مين دفع (ممكن أكتر من واحد)\n'
        + '• نوع التقسيم: بالتساوي / مبالغ / نسبة / حصص\n'
        + 'التطبيق يحسب حصة كل واحد ويحدث الرصيد! ⚖️',
      icon: '➕'
    },
    'group-tab-expenses': {
      title: '📝 تبويب المصاريف',
      body: 'قائمة كل مصاريف الشلة (الأحدث فوق). '
        + 'كل مصروف يوري: الوصف، التاريخ، مين دفع، المبلغ. '
        + 'اضغط على مصروف ← تشوف التفاصيل وتعدل/تحذف. 📋',
      icon: '📝'
    },
    'group-tab-balances': {
      title: '⚖️ تبويب الرصيد (مين عليه مين)',
      body: 'أهم صفحة! هنا تشوف:\n'
        + '• رصيد كل عضو: كم دفع، كم حصته، الفرق\n'
        + '• إيجابي = يستحق فلوس، سالب = عليه فلوس\n'
        + '• "ديون مبسطة": أقل عدد تحويلات لتصفية الحساب\n'
        + 'مثال: أحمد دفع ١٠٠، محمد دفع ٠، حصتهما ٥٠ لكل واحد\n'
        + '→ محمد يسلم أحمد ٥٠ وخلصنا! ✅',
      icon: '⚖️'
    },
    'group-tab-settlements': {
      title: '💸 تبويب التسويات',
      body: 'سجل كل مرة حد سلم فلوس لحد:\n'
        + '• من → لـ، المبلغ، الطريقة (كاش/تحويل)\n'
        + '• التاريخ والحالة (مدفوع/ملغي)\n'
        + 'تقدر تضيف تسوية جديدة أو تلغي قديمة. '
        + 'الهدف: الحسابات تكون صفراء دايماً! 🟢',
      icon: '💸'
    },
    'group-invite': {
      title: '📨 دعوة أعضاء',
      body: 'الطريقة الآمنة لدعوة ناس:\n'
        + '1️⃣ تضغط "دعوة أعضاء" ← يولد رمز قصير (مثل: ABCD1234)\n'
        + '2️⃣ ترسل الرمز لصاحبك (واتساب، رسالة...)\n'
        + '3️⃣ هو يفتح التطبيق → يلصق الرمز → يدخل الشلة!\n'
        + 'الرمز يقدر تلغيه أو تحدد استخدامات/مدة. '
        + 'أمان أكتر من اللينكات الدائمة! 🔐',
      icon: '📨'
    },
    'group-edit': {
      title: '✏️ تعديل المجموعة',
      body: 'تغير: الاسم، الأيقونة، اللون، العملة، '
        + 'تضيف/تحذف أعضاء، تغير صلاحيات (منع تعديل). '
        + 'سهل ومرن! ✏️',
      icon: '✏️'
    },

    // Personal Expenses
    'personal-add': {
      title: '➕ مصروف شخصي جديد',
      body: 'مصروف يخصك بس — ما حد يشوفه:\n'
        + '• الوصف: "كابتشينو صباحية"\n'
        + '• المبلغ، التاريخ\n'
        + '• الفئة: أكل، مواصلات، تسوق، فواتير، صحة، ترفيه، أخرى\n'
        + 'بتظهر في تقاريرك الشخصية وبتساعدك تفهم نمط صرفك. ☕',
      icon: '➕'
    },
    'personal-category': {
      title: '🏷️ فئات شخصية',
      body: 'أيقونات سريعة لاختيار فئة المصروف. '
        + 'الألوان موحدة مع المجموعات عشان العين تعتاد. '
        + 'الفئة "أخرى" للأشياء اللي ما تنفع مع الباقي. 🎨',
      icon: '🏷️'
    },
    'personal-item': {
      title: '📄 عنصر مصروف شخصي',
      body: 'كل مصروف بتظهر سطر فيه:\n'
        + '• أيقونة الفئة + الوصف\n'
        + '• التاريخ + الفئة\n'
        + '• المبلغ باللون الأحمر\n'
        + '• زر حذف (×) لو غلطت\n'
        + 'الكل مرتب: الأحدث فوق. 📅',
      icon: '📄'
    },

    // Settings
    'settings-profile': {
      title: '👤 ملفك الشخصي',
      body: 'اسمك اللي بيظهر في المجموعات والمصاريف. '
        + 'يتحفظ محلياً على جهازك (localStorage) — ما يروح للسحابة إلا لو فعلت المزامنة. '
        + 'اضغط "تعديل" وغيره أي وقت. 🏷️',
      icon: '👤'
    },
    'settings-theme': {
      title: '🌙/☀️ المظهر',
      body: 'ثلاثة أوضاع:\n'
        + '• النهاري (افتراضي) — ألوان فاتحة مريحة\n'
        + '• الليلي — خلفية داكنة، توفر بطارية OLED\n'
        + '• تباين عالي — للأشخاص ذوي الاحتياجات البصرية\n'
        + 'الاختيار يتحفظ ويتطبق فوراً. 🎨',
      icon: '🌙'
    },
    'settings-notifications': {
      title: '🔔 الإشعارات',
      body: 'تفعيل الإشعارات = تصلك تنبيهات فورية:\n'
        + '• حد أضاف مصروف عليك في مجموعة\n'
        + '• حد سلم عليك فلوس\n'
        + '• دعوة لمجموعة جديدة\n'
        + '• رسائل الشات السحابي\n'
        + 'محتاج إذن المتصفح + خدمة Push (مجانية). 📲',
      icon: '🔔'
    },
    'settings-currency': {
      title: '💱 العملة',
      body: 'اختر عملتك المفضلة — بتتطبق على كلشي:\n'
        + 'مجموعات، ميزانيات، مصاريف شخصية، تقارير.\n'
        + 'العملات المدعومة: جنيه مصري، دولار، يورو، ريال سعودي، درهم، دينار، ريال قطري، شيكل. 🌍',
      icon: '💱'
    },
    'settings-install': {
      title: '📱 تثبيت على الجوال',
      body: 'SplitEase PWA — يثبت زي أي تطبيق:\n'
        + '• **أندرويد**: اضغط "تثبيت" أو من قائمة المتصفح\n'
        + '• **iOS**: مشاركة ← "إضافة إلى الشاشة الرئيسية"\n'
        + 'بعد التثبيت: يفتح بملء الشاشة، يعمل أوفلاين 100%، أيقونة على الشاشة. 📲',
      icon: '📱'
    },
    'settings-tour': {
      title: '🔁 إعادة الجولة',
      body: 'تشغل الجولة التعليمية التفاعلية من الأول:\n'
        + '1️⃣ تكتب اسمك\n'
        + '2️⃣ تصنع أول شلة\n'
        + '3️⃣ تضيف أعضاء\n'
        + '4️⃣ تسجل أول مصروف\n'
        + 'مفيدة لو نسيت شي أو جت لك ميزة جديدة! 🔄',
      icon: '🔁'
    },

    // Expense Form (Modal)
    'expense-desc': {
      title: '📝 وصف المصروف',
      body: 'اكتب شي وصفي مختصر: "غداء فريق"، "بنزين"، "سوبرماركت". '
        + 'بيساعدك تتذكر وش صرفت عليه لما تراجع لاحقاً. ✍️',
      icon: '📝'
    },
    'expense-amount': {
      title: '💵 المبلغ',
      body: 'المبلغ بالعملة المختارة. اكتب الأرقام بس (مثال: 150.50). '
        + 'لو غلطت تقدر تعدل بعدين من قائمة المصاريف. 🔢',
      icon: '💵'
    },
    'expense-date': {
      title: '📅 التاريخ',
      body: 'تاريخ المصروف (الافتراضي: اليوم). '
        + 'لو بتسجل مصروف قديم، غير التاريخ. '
        + 'مهم للتقارير الشهرية تكون دقيقة. 📆',
      icon: '📅'
    },
    'expense-category': {
      title: '🏷️ الفئة',
      body: 'اختر الفئة اللي تناسب المصروف. '
        + 'الفئات بتساعد في التقارير: تعرف كم صرفت على أكل، مواصلات، إلخ. '
        + 'الألوان موحدة في كل التطبيق. 🎨',
      icon: '🏷️'
    },
    'expense-paidby': {
      title: '👤 مين دفع؟',
      body: 'هنا تختار العضو (أو الأعضاء) اللي دفعوا الفلوس:\n'
        + '• عضو واحد → اختره\n'
        + '• أكتر من واحد → اختر "مبالغ محددة" وادخل كم دفع كل واحد\n'
        + 'التطبيق يحسب الباقي ويوزع على الأعضاء التانيين. 💳',
      icon: '👤'
    },
    'expense-split': {
      title: '⚖️ نوع التقسيم',
      body: '4 طرق ذكية:\n'
        + '1️⃣ **بالتساوي** — الكل يدفع نفس المبلغ (الافتراضي)\n'
        + '2️⃣ **مبالغ محددة** — أنت تحدد كم يدفع كل واحد\n'
        + '3️⃣ **نسبة مئوية** — مثلاً: أحمد ٦٠٪، محمد ٤٠٪\n'
        + '4️⃣ **حصص** — أحمد ٣ حصص، محمد حصة واحدة = أحمد يدفع ٣/٤\n'
        + 'الخيار ١ ينفع ٩٠٪ من الحالات! ✨',
      icon: '⚖️'
    },
    'expense-save': {
      title: '💾 حفظ',
      body: 'اضغط هون تحفظ المصروف. '
        + 'بيتحفظ فوراً في IndexedDB (أوفلاين) '
        + 'وإن كنت على السحابة → يتزامن لحظياً للجميع. ⚡',
      icon: '💾'
    },

    // Generic
    'modal-close': {
      title: '✖️ إغلاق',
      body: 'اضغط هون تقفل النافذة وترجع للصفحة. '
        + 'كمان تقدر تضغط خارج الكرتونة أو تضغط Escape. ⌨️',
      icon: '✖️'
    },
    'toast': {
      title: '🔔 التنبيهات (Toasts)',
      body: 'الرسائل اللي تطلع تحت الشاشة:\n'
        + '• ✅ أخضر = نجاح (تم الحفظ، تم الإضافة)\n'
        + '• ❌ أحمر = خطأ (مبلغ ناقص، شبكة)\n'
        + '• ℹ️ أزرق = معلومة\n'
        + '• ⚠️ برتقالي = تحذير\n'
        + 'تختفي لوحدها بعد ثواني. ⏱️',
      icon: '🔔'
    }
  };

  /* ── State ── */
  let helpMode = false;
  let helpFab = null;
  let activeCard = null;
  let highlightedEls = new Set();
  let seenHelp = new Set();

  /* ── Load/Save Seen ── */
  function loadSeen() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      seenHelp = new Set(raw ? JSON.parse(raw) : []);
    } catch { seenHelp = new Set(); }
  }
  function saveSeen() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenHelp])); } catch {}
  }
  function markSeen(id) { seenHelp.add(id); saveSeen(); }
  function hasSeen(id) { return seenHelp.has(id); }

  function loadHelpMode() {
    try { helpMode = localStorage.getItem(HELP_MODE_KEY) === '1'; } catch { helpMode = false; }
  }
  function saveHelpMode() {
    try { localStorage.setItem(HELP_MODE_KEY, helpMode ? '1' : '0'); } catch {}
  }

  /* ── DOM Builders ── */
  function createHelpFab() {
    if (helpFab) return helpFab;
    const fab = document.createElement('button');
    fab.id = 'helpFab';
    fab.className = 'help-fab';
    fab.setAttribute('aria-label', 'وضع الشرح');
    fab.setAttribute('aria-pressed', 'false');
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      <span class="help-fab-pulse" aria-hidden="true"></span>
    `;
    fab.addEventListener('click', toggleHelpMode);
    document.body.appendChild(fab);
    helpFab = fab;
    updateFabState();
    return fab;
  }

  function createHelpCard(helpId, targetEl) {
    const data = HELP_CARDS[helpId];
    if (!data) return null;

    const card = document.createElement('div');
    card.className = 'help-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', `helpTitle-${helpId}`);
    card.innerHTML = `
      <div class="help-card-header">
        <span class="help-card-icon" aria-hidden="true">${data.icon}</span>
        <h3 id="helpTitle-${helpId}">${data.title}</h3>
        <button class="help-card-close" aria-label="إغلاق الشرح">&times;</button>
      </div>
      <div class="help-card-body">${data.body}</div>
      <div class="help-card-footer">
        <label class="help-dont-show">
          <input type="checkbox" id="helpDontShow-${helpId}" ${hasSeen(helpId) ? 'checked' : ''}>
          <span>ما تظهرلي هالشرح تاني</span>
        </label>
        <button class="btn btn-primary help-card-gotit">فهمت ✅</button>
      </div>
    `;

    // Position near target
    positionHelpCard(card, targetEl);

    // Events
    card.querySelector('.help-card-close').addEventListener('click', () => closeHelpCard(card, helpId));
    card.querySelector('.help-card-gotit').addEventListener('click', () => closeHelpCard(card, helpId));
    card.querySelector(`#helpDontShow-${helpId}`).addEventListener('change', (e) => {
      if (e.target.checked) markSeen(helpId);
      else seenHelp.delete(helpId), saveSeen();
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (!card.contains(e.target) && !targetEl.contains(e.target)) {
          closeHelpCard(card, helpId);
          document.removeEventListener('click', outside);
        }
      });
    }, 100);

    return card;
  }

  function positionHelpCard(card, targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const gap = 12;
    const cardRect = { width: 320, height: 280 }; // approximate

    // Prefer right side, then left, then top, then bottom
    let left = rect.right + gap;
    let top = rect.top + (rect.height - cardRect.height) / 2;

    if (left + cardRect.width > vw - 16) {
      left = rect.left - gap - cardRect.width;
    }
    if (left < 16) {
      left = 16;
    }
    if (top < 16) {
      top = 16;
    }
    if (top + cardRect.height > vh - 16) {
      top = vh - cardRect.height - 16;
    }

    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function showHelpCard(helpId, targetEl) {
    if (activeCard) closeHelpCard(activeCard.element, activeCard.id);
    const card = createHelpCard(helpId, targetEl);
    if (!card) return;
    document.body.appendChild(card);
    requestAnimationFrame(() => card.classList.add('visible'));
    activeCard = { element: card, id: helpId, target: targetEl };
  }

  function closeHelpCard(card, helpId) {
    if (!card || !card.parentNode) return;
    card.classList.remove('visible');
    setTimeout(() => { if (card.parentNode) card.parentNode.removeChild(card); }, 200);
    if (activeCard?.id === helpId) activeCard = null;
  }

  /* ── Help Mode ── */
  function toggleHelpMode() {
    helpMode = !helpMode;
    saveHelpMode();
    updateFabState();
    if (helpMode) enterHelpMode();
    else exitHelpMode();
  }

  function enterHelpMode() {
    createHelpFab();
    helpFab.classList.add('active');
    helpFab.setAttribute('aria-pressed', 'true');
    helpFab.querySelector('svg').innerHTML = `
      <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    `;

    // Highlight all helpable elements
    highlightHelpableElements();

    // Show welcome toast
    if (window.toast) window.toast('💡 وضع الشرح مفعل — اضغط أي عنصر برتقالي لشرحه', 'info');
  }

  function exitHelpMode() {
    if (helpFab) {
      helpFab.classList.remove('active');
      helpFab.setAttribute('aria-pressed', 'false');
      helpFab.querySelector('svg').innerHTML = `
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      `;
    }
    unhighlightAll();
    if (activeCard) closeHelpCard(activeCard.element, activeCard.id);
  }

  function updateFabState() {
    if (!helpFab) return;
    if (helpMode) {
      helpFab.classList.add('active');
      helpFab.setAttribute('aria-pressed', 'true');
    } else {
      helpFab.classList.remove('active');
      helpFab.setAttribute('aria-pressed', 'false');
    }
  }

  /* ── Highlighting ── */
  function highlightHelpableElements() {
    // Find all elements with data-help-id
    document.querySelectorAll('[data-help-id]').forEach(el => {
      if (!highlightedEls.has(el)) {
        highlightedEls.add(el);
        el.classList.add('help-highlighted');
        // Add click handler
        el._helpClickHandler = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = el.getAttribute('data-help-id');
          showHelpCard(id, el);
        };
        el.addEventListener('click', el._helpClickHandler);
      }
    });
  }

  function unhighlightAll() {
    highlightedEls.forEach(el => {
      el.classList.remove('help-highlighted');
      if (el._helpClickHandler) {
        el.removeEventListener('click', el._helpClickHandler);
        delete el._helpClickHandler;
      }
    });
    highlightedEls.clear();
  }

  /* ── Auto-attach help IDs to key elements ── */
  function attachHelpIds() {
    // This runs after each page render
    const mappings = [
      // Dashboard
      { sel: '#fab', id: 'fab' },
      { sel: '.home-card-family', id: 'home-budget-card' },
      { sel: '.home-card-friends', id: 'home-personal-card' },
      { sel: '[data-page="home"]', id: 'nav-home' },
      { sel: '[data-page="budget"]', id: 'nav-budget' },
      { sel: '[data-page="personal"]', id: 'nav-personal' },
      { sel: '[data-page="groups"]', id: 'nav-groups' },
      { sel: '#cloudNavItem', id: 'nav-cloud' },
      { sel: '[data-page="insights"]', id: 'nav-insights' },
      { sel: '[data-page="settings"]', id: 'nav-settings' },

      // Dashboard stat cards (need to wait for render)
      { sel: '.card:nth-child(1) > div:nth-child(2) > div:nth-child(1)', id: 'dash-income' },
      { sel: '.card:nth-child(1) > div:nth-child(2) > div:nth-child(2)', id: 'dash-remaining' },
      { sel: '.card:nth-child(1) > div:nth-child(2) > div:nth-child(3)', id: 'dash-personal' },
      { sel: '.card:nth-child(1) > div:nth-child(2) > div:nth-child(4)', id: 'dash-groups' },

      // Budget page
      { sel: '.page-header .btn-primary', id: 'budget-add' },
      { sel: '.budget-item', id: 'budget-card' },
      { sel: '.bi-marker', id: 'budget-category' },
      { sel: '.card-header button[onclick*="showAddPersonal"]', id: 'budget-add-transaction' },

      // Groups page
      { sel: '.page-header .btn-primary', id: 'group-create' },
      { sel: '.group-card', id: 'group-card' },
      { sel: '#groupSearch', id: 'group-search' },

      // Group detail page
      { sel: '#fab', id: 'group-fab' },
      { sel: '.tab[data-tab="expenses"]', id: 'group-tab-expenses' },
      { sel: '.tab[data-tab="balances"]', id: 'group-tab-balances' },
      { sel: '.tab[data-tab="settlements"]', id: 'group-tab-settlements' },
      { sel: 'button[onclick*="showInviteModal"]', id: 'group-invite' },
      { sel: 'button[onclick*="showCreateGroup"]', id: 'group-edit' },

      // Personal page
      { sel: '.page-header .btn-primary', id: 'personal-add' },
      { sel: '.cat-btn', id: 'personal-category' },
      { sel: '.budget-item', id: 'personal-item' },

      // Settings
      { sel: 'button[onclick="editLocalProfile()"]', id: 'settings-profile' },
      { sel: '.toggle[onclick="toggleTheme()"]', id: 'settings-theme' },
      { sel: '.toggle[onclick="togglePush()"]', id: 'settings-notifications' },
      { sel: '.currency-option', id: 'settings-currency' },
      { sel: '#installBtn', id: 'settings-install' },
      { sel: 'button[onclick="replayTour()"]', id: 'settings-tour' },

      // Expense modal (when open)
      { sel: '#pDesc, #gDesc, #expenseDesc', id: 'expense-desc' },
      { sel: '#pAmt, #gAmt, #expenseAmt', id: 'expense-amount' },
      { sel: '#pDate, #gDate, #expenseDate', id: 'expense-date' },
      { sel: '.cat-btn, .split-type-btn', id: 'expense-category' },
      { sel: 'select[name="paidBy"], .member-option', id: 'expense-paidby' },
      { sel: 'input[name="splitType"], .split-option', id: 'expense-split' },
      { sel: '.modal .btn-primary', id: 'expense-save' },
      { sel: '.modal-close', id: 'modal-close' },
    ];

    mappings.forEach(({ sel, id }) => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.hasAttribute('data-help-id')) {
            el.setAttribute('data-help-id', id);
          }
        });
      } catch (e) { /* selector might be invalid */ }
    });

    // Re-highlight if in help mode
    if (helpMode) {
      highlightHelpableElements();
    }
  }

  /* ── Public API ── */
  function init() {
    loadSeen();
    loadHelpMode();
    createHelpFab();
    updateFabState();

    // Re-attach help IDs after route changes
    const originalNavigate = window.navigate;
    if (originalNavigate) {
      window.navigate = function(...args) {
        const result = originalNavigate.apply(this, args);
        setTimeout(attachHelpIds, 100);
        return result;
      };
    }

    // Also attach on hash change
    window.addEventListener('hashchange', () => setTimeout(attachHelpIds, 100));

    // Initial attach
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachHelpIds);
    } else {
      attachHelpIds();
    }

    // Expose for settings toggle
    window.ContextualHelp = {
      toggle: toggleHelpMode,
      isActive: () => helpMode,
      showFor: showHelpCard,
      resetSeen: () => { seenHelp.clear(); saveSeen(); }
    };
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();