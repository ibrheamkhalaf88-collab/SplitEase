/* ============================================================
   Help Buddy — "صديقك زين" 🧑‍🏫
   ------------------------------------------------------------
   شخصية 2D متحركة تعيش في الزاوية، تراقبك، تحكي معك،
   وتشير بأصبعها للأشياء. شخصية عربية ودية بتتكلم عامية.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'splitease-buddy';
  const BUDDY_NAME = 'زين'; // اسم الصديق

  /* ── Personality Lines ── */
  const LINES = {
    greetings: [
      `أهلاً! أنا ${BUDDY_NAME}، صديقك في SplitEase 👋`,
      `يا هلا! كيفك؟ أنا ${BUDDY_NAME}، هساعدك تفهم كل شي 😊`,
      `أهلاً بك! ${BUDDY_NAME} موجود لخدمتك — اضغط عليَّ أبدأ أشرح 🤝`,
      `مرحباً! ${BUDDY_NAME} هنا عشان ما تضيع... ابدأ؟ 🚀`,
    ],
    idle: [
      `بس ألعب بأصبعي... 🎯`,
      `عينِي على زر الإضافة + ... مهم هاد! ➕`,
      `شو رأيك نعمل ميزانية جديدة؟ 💰`,
      `المجموعات هون مليانة أسرار... اضغط تشوف 👥`,
      `نسيت تضيف مصروف الصبح؟ ما تقلق، هون نسجل 📝`,
      `الرصيد أخضر؟ مبروك! أحمر؟ خلينا نصلح ⚖️`,
      `الإشعارات مفيدة... فعلها عشان تعرف مين عليك 🔔`,
      `عملة جديدة؟ غيّرها من الإعدادات 💱`,
      `تثبت التطبيق على الجوال؟ بيشتغل أوفلاين 100% 📱`,
    ],
    helpModeStart: [
      `تمام! دخلت وضع الشرح — كل شي بيلمع برتقالي، اضغط عليه أشرحلك 🧡`,
      `أهلاً بالوضع الشرح! أنا دليلك اليوم — شوف العناصر المضيئة؟ اضغط أي وحدة 🎯`,
      `وضع الشرح شغال! عيني على كل زر... اضغط وأحكيلو شو يفعل 👁️`,
    ],
    helpModeEnd: [
      `خلصنا الشرح! رجعتلو مكاني... استدعيني أي وقت 👋`,
      `ماشي، طفيت وضع الشرح. أنا هون لو احتجتني 😴`,
      `بطلت أشرح... لكن عيني ما بتركك! استدعيني بأي وقت 🤝`,
    ],
    pointing: [
      `شوف هون! هاد ${'{name}'} — ${'{desc}'} 👈`,
      `هاي مهمة: ${'{name}'} — ${'{desc}'} ✨`,
      `انتبه لهون: ${'{name}'} — ${'{desc}'} 🎯`,
      `هاد الزر/الحقل: ${'{name}'} — ${'{desc}'} 💡`,
    ],
    featureHints: {
      fab: { name: 'زر إضافة مصروف', desc: 'القلب النابض للتطبيق — اضغطه تسجل أي مصروف في ثواني' },
      'nav-budget': { name: 'الميزانية', desc: 'هنا تحط راتبك، تقسمه بنود (أكل، إيجار، توفير)، وتتابع صرفك يومياً' },
      'nav-groups': { name: 'المجموعات', desc: 'قلب التطبيق — تصنع شلة مع أصحابك، تسجل مصاريف مشتركة، التطبيق يحسب مين عليه مين' },
      'nav-personal': { name: 'مصاريف شخصية', desc: 'مصروفاتك السرية — قهوة، بنزين، هدايا... ما حد يراها غيرك' },
      'nav-cloud': { name: 'الشلة السحابية', desc: 'ميزة Pro: شلتك على السحابة تشتغل من أي جهاز، مع شات وإشعارات لحظية' },
      'nav-insights': { name: 'التقارير', desc: 'رسوم بيانية، توزيع فئات، تصدير PDF/Excel — بيانات = قرارات أفضل' },
      'nav-settings': { name: 'الإعدادات', desc: 'مركز التحكم: مظهر، عملة، إشعارات، اسمك، تثبيت التطبيق، إعادة الجولة' },
      'group-fab': { name: 'مصروف جديد في الشلة', desc: 'تسجل مصروف للمجموعة: وصف، مبلغ، مين دفع، تقسيم ذكي (تساوي/مبالغ/نسبة/حصص)' },
      'group-tab-balances': { name: 'الرصيد (مين عليه مين)', desc: 'أهم صفحة! تشوف رصيد كل واحد، و"ديون مبسطة" = أقل تحويلات لتصفية الحساب' },
      'group-invite': { name: 'دعوة أعضاء', desc: 'ترسل رمز قصير لصاحبك (مش لينك طويل)، هو يلصقه يدخل الشلة — آمن وقابل للإلغاء' },
      'budget-add': { name: 'ميزانية جديدة', desc: 'الخطوة الأولى: تسمي الراتب، تحط المبلغ، الشهر، العملة — بعدين تضيف بنود' },
      'expense-split': { name: 'نوع التقسيم', desc: '4 طرق: بالتساوي (الأكثر شيوعاً)، مبالغ محددة، نسبة مئوية، أو حصص — اختر اللي يناسبك' },
      'settings-install': { name: 'تثبيت على الجوال', desc: 'PWA يثبت زي أي تطبيق: أندرويد من القائمة، آيفون من مشاركة → إضافة للشاشة الرئيسية' },
      'settings-theme': { name: 'المظهر', desc: '3 أوضاع: نهاري (افتراضي)، ليلي (يوفر بطارية OLED)، تباين عالي (للإمكانية البصرية)' },
    },
    celebrations: [
      `ممتاز! أول مصروف مسجل 🎉`,
      `برافو! الشلة جاهزة ✨`,
      `أحلى! ميزانية مضافة 💰`,
      `يا سلام! الأعضاء أضيفوا 👥`,
      `كل شي تمام! الحسابات صفّرت 🟢`,
    ],
    encourage: [
      `مشكلة بسيطة، نحلها سوا 💪`,
      `ما تقلق، كل شي له حل 😊`,
      `خطوة بخطوة، ما في مستحيل 🚀`,
      `أنت بتتعلم بسرعة! استمري 🌟`,
    ],
    sleep: [
      `...*ززز*... أنا نائم هون لو احتجتني 😴`,
      `عينِي مقفولة لكن أذني مفتوحة... ناديني! 👂`,
    ],
  };

  /* ── State ── */
  let buddy = null;
  let bubble = null;
  let state = 'idle'; // idle, talking, pointing, listening, celebrating, sleeping, hidden
  let currentTarget = null;
  let helpMode = false;
  let idleTimer = null;
  let blinkTimer = null;
  let breatheTimer = null;
  let lookTimer = null;
  let currentLine = '';
  let lineQueue = [];
  let isUserInteracting = false;
  let mousePos = { x: 0, y: 0 };
  let buddyRect = { x: 0, y: 0, width: 0, height: 0 };

  /* ── Load/Save ── */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        state = data.state || 'idle';
      }
    } catch {}
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, lastSeen: Date.now() })); } catch {}
  }

  /* ── DOM Creation ── */
  function createBuddy() {
    if (buddy) return buddy;

    buddy = document.createElement('div');
    buddy.id = 'helpBuddy';
    buddy.className = 'help-buddy';
    buddy.innerHTML = `
      <!-- Shadow -->
      <div class="buddy-shadow" aria-hidden="true"></div>

      <!-- Body -->
      <div class="buddy-body">
        <!-- Head -->
        <div class="buddy-head">
          <!-- Ears -->
          <div class="buddy-ear buddy-ear-left" aria-hidden="true"></div>
          <div class="buddy-ear buddy-ear-right" aria-hidden="true"></div>

          <!-- Face -->
          <div class="buddy-face">
            <!-- Eyes -->
            <div class="buddy-eyes">
              <div class="buddy-eye buddy-eye-left">
                <div class="buddy-eye-white">
                  <div class="buddy-pupil" id="pupilLeft"></div>
                  <div class="buddy-glint" aria-hidden="true"></div>
                </div>
                <div class="buddy-eyelid buddy-eyelid-top" id="eyelidTopLeft"></div>
                <div class="buddy-eyelid buddy-eyelid-bottom" id="eyelidBottomLeft"></div>
              </div>
              <div class="buddy-eye buddy-eye-right">
                <div class="buddy-eye-white">
                  <div class="buddy-pupil" id="pupilRight"></div>
                  <div class="buddy-glint" aria-hidden="true"></div>
                </div>
                <div class="buddy-eyelid buddy-eyelid-top" id="eyelidTopRight"></div>
                <div class="buddy-eyelid buddy-eyelid-bottom" id="eyelidBottomRight"></div>
              </div>
            </div>

            <!-- Eyebrows -->
            <div class="buddy-eyebrow buddy-eyebrow-left" id="eyebrowLeft" aria-hidden="true"></div>
            <div class="buddy-eyebrow buddy-eyebrow-right" id="eyebrowRight" aria-hidden="true"></div>

            <!-- Mouth -->
            <div class="buddy-mouth" id="buddyMouth">
              <div class="buddy-mouth-inner"></div>
            </div>

            <!-- Blush -->
            <div class="buddy-blush buddy-blush-left" aria-hidden="true"></div>
            <div class="buddy-blush buddy-blush-right" aria-hidden="true"></div>
          </div>

          <!-- Hair -->
          <div class="buddy-hair" aria-hidden="true"></div>
        </div>

        <!-- Torso -->
        <div class="buddy-torso">
          <!-- Arms -->
          <div class="buddy-arm buddy-arm-left" id="armLeft">
            <div class="buddy-hand" id="handLeft">
              <div class="buddy-finger"></div>
              <div class="buddy-finger"></div>
              <div class="buddy-finger"></div>
              <div class="buddy-thumb"></div>
            </div>
          </div>
          <div class="buddy-arm buddy-arm-right" id="armRight">
            <div class="buddy-hand" id="handRight">
              <div class="buddy-finger"></div>
              <div class="buddy-finger"></div>
              <div class="buddy-finger"></div>
              <div class="buddy-thumb"></div>
            </div>
          </div>

          <!-- Clothes -->
          <div class="buddy-outfit" aria-hidden="true">
            <div class="buddy-collar"></div>
            <div class="buddy-shirt"></div>
            <div class="buddy-badge">ز</div>
          </div>
        </div>

        <!-- Legs -->
        <div class="buddy-legs">
          <div class="buddy-leg buddy-leg-left" aria-hidden="true"></div>
          <div class="buddy-leg buddy-leg-right" aria-hidden="true"></div>
          <div class="buddy-shoe buddy-shoe-left" aria-hidden="true"></div>
          <div class="buddy-shoe buddy-shoe-right" aria-hidden="true"></div>
        </div>
      </div>

      <!-- Speech Bubble -->
      <div class="buddy-bubble" id="buddyBubble" role="status" aria-live="polite" hidden>
        <div class="buddy-bubble-tail" aria-hidden="true"></div>
        <div class="buddy-bubble-content" id="bubbleContent"></div>
        <div class="buddy-bubble-avatar" aria-hidden="true">${BUDDY_NAME[0]}</div>
      </div>

      <!-- Interaction hint -->
      <div class="buddy-hint" id="buddyHint" hidden>
        <kbd>اضغط عليَّ</kbd> أشرحلك كل شي
      </div>

      <!-- Name label -->
      <div class="buddy-name-label" aria-hidden="true">${BUDDY_NAME}</div>
    `;

    document.body.appendChild(buddy);

    // Cache elements
    buddy.elements = {
      body: buddy.querySelector('.buddy-body'),
      head: buddy.querySelector('.buddy-head'),
      pupilLeft: buddy.querySelector('#pupilLeft'),
      pupilRight: buddy.querySelector('#pupilRight'),
      eyelidTopLeft: buddy.querySelector('#eyelidTopLeft'),
      eyelidBottomLeft: buddy.querySelector('#eyelidBottomLeft'),
      eyelidTopRight: buddy.querySelector('#eyelidTopRight'),
      eyelidBottomRight: buddy.querySelector('#eyelidBottomRight'),
      eyebrowLeft: buddy.querySelector('#eyebrowLeft'),
      eyebrowRight: buddy.querySelector('#eyebrowRight'),
      mouth: buddy.querySelector('#buddyMouth'),
      mouthInner: buddy.querySelector('.buddy-mouth-inner'),
      armLeft: buddy.querySelector('#armLeft'),
      armRight: buddy.querySelector('#armRight'),
      handLeft: buddy.querySelector('#handLeft'),
      handRight: buddy.querySelector('#handRight'),
      bubble: buddy.querySelector('#buddyBubble'),
      bubbleContent: buddy.querySelector('#bubbleContent'),
      hint: buddy.querySelector('#buddyHint'),
    };

    // Events
    buddy.addEventListener('click', onBuddyClick);
    buddy.addEventListener('mouseenter', () => { isUserInteracting = true; pauseIdle(); });
    buddy.addEventListener('mouseleave', () => { isUserInteracting = false; resumeIdle(); });

    // Touch support
    buddy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isUserInteracting = true;
      pauseIdle();
      onBuddyClick(e);
    }, { passive: false });

    return buddy;
  }

  /* ── Eye Tracking ── */
  function updateEyeTracking() {
    if (!buddy || state === 'hidden') return;

    const rect = buddy.getBoundingClientRect();
    buddyRect = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };

    // Calculate angle to mouse
    const dx = mousePos.x - buddyRect.x;
    const dy = mousePos.y - buddyRect.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 150; // max distance for full pupil movement

    const angle = Math.atan2(dy, dx);
    const radius = Math.min(dist / maxDist, 1) * 4; // max 4px pupil offset

    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius;

    // Apply to pupils
    buddy.elements.pupilLeft.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    buddy.elements.pupilRight.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

    // Slight head turn
    if (state !== 'pointing') {
      const headTurn = Math.max(-15, Math.min(15, angle * 180 / Math.PI * 0.15));
      buddy.elements.head.style.transform = `rotate(${headTurn}deg)`;
    }
  }

  function onMouseMove(e) {
    mousePos.x = e.clientX;
    mousePos.y = e.clientY;
    updateEyeTracking();
  }

  function onTouchMove(e) {
    if (e.touches[0]) {
      mousePos.x = e.touches[0].clientX;
      mousePos.y = e.touches[0].clientY;
      updateEyeTracking();
    }
  }

  /* ── Blinking ── */
  function blink() {
    if (state === 'hidden' || state === 'sleeping') return;

    const duration = 150;
    const eyes = [buddy.elements.eyelidTopLeft, buddy.elements.eyelidBottomLeft,
                  buddy.elements.eyelidTopRight, buddy.elements.eyelidBottomRight];

    eyes.forEach(el => { el.style.transform = 'scaleY(1)'; el.style.transition = `transform ${duration}ms ease-in-out`; });

    setTimeout(() => {
      eyes.forEach(el => { el.style.transform = 'scaleY(0)'; });
    }, duration);

    // Random next blink (2-6 seconds)
    const nextBlink = 2000 + Math.random() * 4000;
    blinkTimer = setTimeout(blink, nextBlink);
  }

  /* ── Breathing ── */
  function breathe() {
    if (state === 'hidden') return;
    buddy.elements.body.style.transform = 'scale(1.015)';
    buddy.elements.body.style.transition = 'transform 2.5s ease-in-out';

    setTimeout(() => {
      buddy.elements.body.style.transform = 'scale(1)';
      breatheTimer = setTimeout(breathe, 5000);
    }, 2500);
  }

  /* ── Looking Around ── */
  function lookAround() {
    if (state !== 'idle' || isUserInteracting) {
      lookTimer = setTimeout(lookAround, 3000);
      return;
    }

    const directions = ['left', 'right', 'up', 'center'];
    const dir = directions[Math.floor(Math.random() * directions.length)];

    let targetX = 0, targetY = 0;
    switch (dir) {
      case 'left': targetX = -8; break;
      case 'right': targetX = 8; break;
      case 'up': targetY = -6; break;
      case 'center': targetX = 0; targetY = 0; break;
    }

    buddy.elements.pupilLeft.style.transition = 'transform 1s ease-in-out';
    buddy.elements.pupilRight.style.transition = 'transform 1s ease-in-out';
    buddy.elements.pupilLeft.style.transform = `translate(${targetX}px, ${targetY}px)`;
    buddy.elements.pupilRight.style.transform = `translate(${targetX}px, ${targetY}px)`;

    // Slight head turn
    buddy.elements.head.style.transition = 'transform 1s ease-in-out';
    buddy.elements.head.style.transform = `rotate(${targetX * 1.5}deg)`;

    setTimeout(() => {
      buddy.elements.pupilLeft.style.transform = 'translate(0, 0)';
      buddy.elements.pupilRight.style.transform = 'translate(0, 0)';
      buddy.elements.head.style.transform = 'rotate(0deg)';
    }, 2000);

    lookTimer = setTimeout(lookAround, 4000 + Math.random() * 6000);
  }

  /* ── Speech Bubble ── */
  function showBubble(text, duration = 4000) {
    if (!buddy) return;

    buddy.elements.bubbleContent.innerHTML = text.replace(/\n/g, '<br>');
    buddy.elements.bubble.hidden = false;
    requestAnimationFrame(() => {
      buddy.elements.bubble.classList.add('visible');
    });

    // Auto-hide
    if (duration > 0) {
      setTimeout(hideBubble, duration);
    }
  }

  function hideBubble() {
    if (!buddy) return;
    buddy.elements.bubble.classList.remove('visible');
    setTimeout(() => { buddy.elements.bubble.hidden = true; }, 300);
  }

  function queueLines(lines) {
    lineQueue = [...lines];
    processQueue();
  }

  function processQueue() {
    if (lineQueue.length === 0) {
      setState('idle');
      return;
    }
    const line = lineQueue.shift();
    say(line, () => processQueue());
  }

  function say(text, callback) {
    setState('talking');
    currentLine = text;
    showBubble(text, 0); // Don't auto-hide, wait for callback

    // Animate mouth while talking
    animateMouth(text.length * 50); // Rough duration based on text length

    const duration = Math.max(2000, Math.min(8000, text.length * 80));
    setTimeout(() => {
      hideBubble();
      if (callback) callback();
    }, duration);
  }

  function animateMouth(duration) {
    const mouth = buddy.elements.mouthInner;
    let start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= duration) {
        mouth.style.transform = 'scaleX(1) scaleY(0.3)';
        return;
      }
      // Wobble mouth
      const phase = (elapsed / 120) % (Math.PI * 2);
      const openness = 0.3 + Math.abs(Math.sin(phase)) * 0.5;
      const width = 1 + Math.sin(phase * 1.5) * 0.1;
      mouth.style.transform = `scaleX(${width}) scaleY(${openness})`;
      requestAnimationFrame(animate);
    };
    animate();
  }

  /* ── Pointing Animation ── */
  function pointAt(element, helpId) {
    if (!buddy || !element) return;

    const targetRect = element.getBoundingClientRect();
    const buddyRect = buddy.getBoundingClientRect();

    // Calculate direction
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const buddyCenterX = buddyRect.left + buddyRect.width / 2;
    const buddyCenterY = buddyRect.top + buddyRect.height / 2;

    const dx = targetCenterX - buddyCenterX;
    const dy = targetCenterY - buddyCenterY;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    // Determine which arm to use
    const useRight = dx > 0;
    const arm = useRight ? buddy.elements.armRight : buddy.elements.armLeft;
    const hand = useRight ? buddy.elements.handRight : buddy.elements.handLeft;
    const otherArm = useRight ? buddy.elements.armLeft : buddy.elements.armRight;

    setState('pointing');

    // Reset other arm
    otherArm.style.transform = 'rotate(-20deg) translateY(0)';
    otherArm.style.transition = 'transform 0.5s ease-out';

    // Point with chosen arm
    const pointAngle = Math.max(-60, Math.min(60, angle));
    arm.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
    arm.style.transform = `rotate(${pointAngle}deg) translateY(-10px)`;
    hand.style.transform = 'rotate(-90deg) scale(1.1)'; // Pointing finger up

    // Lean body towards target
    buddy.elements.body.style.transition = 'transform 0.5s ease-out';
    buddy.elements.body.style.transform = `translateX(${dx * 0.08}px) rotate(${pointAngle * 0.1}deg)`;

    // Head looks at target
    buddy.elements.head.style.transition = 'transform 0.5s ease-out';
    buddy.elements.head.style.transform = `rotate(${pointAngle * 0.3}deg)`;

    // Show spotlight (4-band scrim) on target
    showSpotlight(element);

    // Say the pointing line
    const feature = LINES.featureHints[helpId] || { name: 'هذا العنصر', desc: 'ميزة مهمة في التطبيق' };
    const template = LINES.pointing[Math.floor(Math.random() * LINES.pointing.length)];
    const text = template.replace('{name}', feature.name).replace('{desc}', feature.desc);
    say(text);

    currentTarget = { element, helpId, arm, hand, otherArm };
  }

  function stopPointing() {
    if (!buddy || !currentTarget) return;

    const { arm, hand, otherArm } = currentTarget;

    arm.style.transition = 'transform 0.5s ease-out';
    arm.style.transform = 'rotate(-20deg) translateY(0)';
    hand.style.transform = 'rotate(0) scale(1)';

    otherArm.style.transition = 'transform 0.5s ease-out';
    otherArm.style.transform = 'rotate(20deg) translateY(0)';

    buddy.elements.body.style.transform = 'translateX(0) rotate(0deg)';
    buddy.elements.head.style.transform = 'rotate(0deg)';

    hideSpotlight();
    currentTarget = null;

    setTimeout(() => setState('idle'), 500);
  }

  /* ── Spotlight System (4-band scrim like tour) ── */
  let spotlight = null;
  let spotlightBands = null;
  let spotlightRing = null;

  function createSpotlight() {
    if (spotlight) return spotlight;

    spotlight = document.createElement('div');
    spotlight.className = 'buddy-spotlight';
    spotlight.hidden = true;
    spotlight.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 450;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease-out;
    `;

    // Four bands: top, bottom, left, right
    const bandNames = ['top', 'bottom', 'left', 'right'];
    spotlightBands = bandNames.map(name => {
      const band = document.createElement('div');
      band.className = `buddy-spotlight-band buddy-spotlight-${name}`;
      band.style.cssText = `
        position: absolute;
        background: rgba(15, 23, 42, 0.55);
        -webkit-backdrop-filter: blur(4px);
        backdrop-filter: blur(4px);
        opacity: 0;
        transition: opacity 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out, top 0.3s ease-out, left 0.3s ease-out;
      `;
      spotlight.appendChild(band);
      return band;
    });

    // Ring around target
    spotlightRing = document.createElement('div');
    spotlightRing.className = 'buddy-spotlight-ring';
    spotlightRing.style.cssText = `
      position: absolute;
      border: 3px solid var(--primary);
      border-radius: var(--radius-lg);
      box-shadow:
        0 0 0 4px rgba(13, 148, 136, 0.3),
        0 0 20px 4px rgba(13, 148, 136, 0.2);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out, top 0.3s ease-out, left 0.3s ease-out;
      animation: buddySpotlightPulse 2s ease-in-out infinite;
    `;
    spotlight.appendChild(spotlightRing);

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes buddySpotlightPulse {
        0%, 100% { box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.3), 0 0 20px 4px rgba(13, 148, 136, 0.2); }
        50% { box-shadow: 0 0 0 8px rgba(13, 148, 136, 0.4), 0 0 30px 8px rgba(13, 148, 136, 0.3); }
      }
      @media (prefers-reduced-motion: reduce) {
        .buddy-spotlight-ring { animation: none; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(spotlight);
    return spotlight;
  }

  function showSpotlight(targetEl) {
    if (!targetEl) return;
    
    // Only target visible elements
    const style = window.getComputedStyle(targetEl);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
    
    const rect = targetEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Scroll element into view so coordinates are accurate
    targetEl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    
    // Re-measure after scroll
    const newRect = targetEl.getBoundingClientRect();
    
    // Boost z-index of target so it stays above scrim
    targetEl.style.position = targetEl.style.position || 'relative';
    targetEl.style.zIndex = '500';
    targetEl.classList.add('buddy-spotlight-target');

    createSpotlight();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;

    const left = Math.max(0, newRect.left - pad);
    const top = Math.max(0, newRect.top - pad);
    const right = Math.min(vw, newRect.right + pad);
    const bottom = Math.min(vh, newRect.bottom + pad);
    const width = right - left;
    const height = bottom - top;

    const [bandTop, bandBottom, bandLeft, bandRight] = spotlightBands;

    bandTop.style.cssText = `top: 0; left: 0; width: ${vw}px; height: ${top}px; opacity: 1;`;
    bandBottom.style.cssText = `top: ${bottom}px; left: 0; width: ${vw}px; height: ${vh - bottom}px; opacity: 1;`;
    bandLeft.style.cssText = `top: ${top}px; left: 0; width: ${left}px; height: ${height}px; opacity: 1;`;
    bandRight.style.cssText = `top: ${top}px; left: ${right}px; width: ${vw - right}px; height: ${height}px; opacity: 1;`;

    spotlightRing.style.cssText = `
      top: ${top}px; left: ${left}px; width: ${width}px; height: ${height}px; opacity: 1;
    `;

    spotlight.hidden = false;
    requestAnimationFrame(() => { spotlight.style.opacity = '1'; });
  }

  function hideSpotlight() {
    if (!spotlight) return;
    spotlight.style.opacity = '0';
    if (spotlightBands) {
      spotlightBands.forEach(b => b.style.opacity = '0');
    }
    if (spotlightRing) spotlightRing.style.opacity = '0';
    
    // Clean up target z-index
    document.querySelectorAll('.buddy-spotlight-target').forEach(el => {
      el.style.zIndex = '';
      el.classList.remove('buddy-spotlight-target');
    });

    setTimeout(() => { if (spotlight) spotlight.hidden = true; }, 300);
  }

  /* ── Pointing Line (SVG) - kept for reference but spotlight replaces it ── */
  let pointingLine = null;
  function showPointingLine(x1, y1, x2, y2, useRight) {
    // Deprecated - spotlight handles visual guidance
  }

  function hidePointingLine() {
    if (pointingLine) {
      pointingLine.remove();
      pointingLine = null;
    }
  }

  /* ── State Management ── */
  function setState(newState) {
    if (state === newState) return;
    state = newState;
    saveState();
    applyState();
  }

  function applyState() {
    if (!buddy) return;

    // Remove all state classes
    buddy.classList.remove('idle', 'talking', 'pointing', 'listening', 'celebrating', 'sleeping', 'hidden');

    // Add new state class
    buddy.classList.add(state);

    // State-specific behavior
    switch (state) {
      case 'idle':
        resumeIdle();
        break;
      case 'talking':
        pauseIdle();
        break;
      case 'pointing':
        pauseIdle();
        break;
      case 'celebrating':
        pauseIdle();
        triggerCelebration();
        break;
      case 'sleeping':
        pauseIdle();
        goToSleep();
        break;
      case 'hidden':
        pauseIdle();
        buddy.hidden = true;
        break;
    }
  }

  /* ── Idle Behaviors ── */
  function pauseIdle() {
    clearTimeout(idleTimer);
    clearTimeout(blinkTimer);
    clearTimeout(breatheTimer);
    clearTimeout(lookTimer);
  }

  function resumeIdle() {
    if (state !== 'idle') return;
    blink();
    breathe();
    lookAround();
    scheduleRandomIdleLine();
  }

  function scheduleRandomIdleLine() {
    idleTimer = setTimeout(() => {
      if (state === 'idle' && !isUserInteracting && Math.random() < 0.3) {
        const line = LINES.idle[Math.floor(Math.random() * LINES.idle.length)];
        say(line);
      }
      scheduleRandomIdleLine();
    }, 15000 + Math.random() * 20000); // Every 15-35 seconds
  }

  /* ── Celebration ── */
  function triggerCelebration() {
    buddy.classList.add('celebrate');
    const line = LINES.celebrations[Math.floor(Math.random() * LINES.celebrations.length)];
    say(line, () => {
      setTimeout(() => {
        buddy.classList.remove('celebrate');
        setState('idle');
      }, 2000);
    });
  }

  function celebrate(achievement) {
    setState('celebrating');
  }

  /* ── Sleep ── */
  function goToSleep() {
    buddy.classList.add('sleeping');
    buddy.elements.mouthInner.style.transform = 'scaleX(1) scaleY(0.1)';
    buddy.elements.eyelidTopLeft.style.transform = 'scaleY(1)';
    buddy.elements.eyelidTopRight.style.transform = 'scaleY(1)';
    buddy.elements.eyelidBottomLeft.style.transform = 'scaleY(1)';
    buddy.elements.eyelidBottomRight.style.transform = 'scaleY(1)';

    // Zzz animation
    showSleepZzz();
  }

  function showSleepZzz() {
    if (state !== 'sleeping') return;

    const zzz = document.createElement('div');
    zzz.className = 'buddy-zzz';
    zzz.textContent = '💤';
    zzz.style.cssText = `
      position: absolute;
      top: -30px; right: -20px;
      font-size: 20px;
      animation: zzzFloat 3s ease-in-out infinite;
      pointer-events: none;
    `;
    buddy.elements.head.appendChild(zzz);

    setTimeout(() => {
      if (zzz.parentNode) zzz.parentNode.removeChild(zzz);
      showSleepZzz();
    }, 3000);
  }

  function wakeUp() {
    setState('idle');
    const line = LINES.greetings[Math.floor(Math.random() * LINES.greetings.length)];
    say(line);
  }

  /* ── Interactions ── */
  function onBuddyClick(e) {
    if (state === 'sleeping') {
      wakeUp();
      return;
    }

    if (state === 'hidden') {
      show();
      return;
    }

    // Cycle through greetings/idle lines
    const lines = [...LINES.greetings, ...LINES.idle.slice(0, 3)];
    const line = lines[Math.floor(Math.random() * lines.length)];
    say(line);
  }

  function onBuddyDoubleClick() {
    // Toggle help mode
    toggleHelpMode();
  }

  /* ── Help Mode Integration ── */
  function toggleHelpMode() {
    helpMode = !helpMode;
    if (window.ContextualHelp) {
      window.ContextualHelp.toggle();
    }
    if (helpMode) {
      setState('talking');
      const line = LINES.helpModeStart[Math.floor(Math.random() * LINES.helpModeStart.length)];
      say(line, () => setState('idle'));
    } else {
      setState('talking');
      const line = LINES.helpModeEnd[Math.floor(Math.random() * LINES.helpModeEnd.length)];
      say(line, () => setState('idle'));
    }
  }

  function onHelpTargetClicked(helpId, element) {
    if (!helpMode) return;
    pointAt(element, helpId);
  }

  function onHelpModeExited() {
    helpMode = false;
    if (currentTarget) stopPointing();
  }

  /* ── Public API ── */
  function show() {
    if (!buddy) createBuddy();
    buddy.hidden = false;
    setState('idle');
    buddy.elements.hint.hidden = false;
    setTimeout(() => buddy.elements.hint.hidden = true, 3000);
  }

  function hide() {
    if (!buddy) return;
    setState('hidden');
  }

  function setHelpMode(enabled) {
    if (enabled && !helpMode) toggleHelpMode();
    else if (!enabled && helpMode) toggleHelpMode();
  }

  function triggerCelebrationPublic(type) {
    celebrate(type);
  }

  /* ── Init ── */
  function init() {
    loadState();
    createBuddy();

    // Track mouse for eye tracking
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', onTouchMove, { passive: true });

    // Listen for help mode changes
    window.addEventListener('helpModeChange', (e) => {
      helpMode = e.detail.enabled;
      if (!helpMode && currentTarget) stopPointing();
    });

    // Listen for help target clicks
    window.addEventListener('helpTargetClick', (e) => {
      onHelpTargetClicked(e.detail.helpId, e.detail.element);
    });

    // Listen for celebrations from app
    window.addEventListener('buddyCelebrate', (e) => {
      celebrate(e.detail.type);
    });

    // Expose API
    window.HelpBuddy = {
      show,
      hide,
      toggleHelpMode: () => toggleHelpMode(),
      setHelpMode,
      celebrate: triggerCelebrationPublic,
      say: (text) => say(text),
      getState: () => state,
      getName: () => BUDDY_NAME,
    };

    // Show hint on first visit
    const hasSeen = localStorage.getItem('splitease-buddy-seen');
    if (!hasSeen) {
      setTimeout(() => {
        show();
        const line = LINES.greetings[0];
        say(line);
        localStorage.setItem('splitease-buddy-seen', '1');
      }, 1500);
    } else {
      // Random greeting on return
      setTimeout(() => {
        show();
        const line = LINES.greetings[Math.floor(Math.random() * LINES.greetings.length)];
        say(line);
      }, 2000);
    }
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();