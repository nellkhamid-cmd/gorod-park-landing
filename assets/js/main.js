/* =====================================================================
   ЖК «Город-Парк» — логика и движение
   Движение по мотивам LUCE: почти всё привязано к скроллу (scrub),
   межсекционные переходы висят на уходящей секции, триггер — следующая.
   Интерфейс (кнопки, табы, квиз) — пружины ui-motion на CSS.
   ===================================================================== */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const cfg = window.GP_CONFIG || {};
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HAS_GSAP = !!(window.gsap && window.ScrollTrigger);
  const MOTION = HAS_GSAP && !REDUCED;
  const MOBILE_MQ = '(max-width: 767px)';
  const DESKTOP_MQ = '(min-width: 1024px)';

  root.classList.add(MOTION ? 'motion' : 'no-motion');

  /* ---------------------------------------------------------------
     0. UTM-метки: сохраняем на сессию, чтобы передать с заявкой
     --------------------------------------------------------------- */
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'];
  const utm = (() => {
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('gp_utm') || '{}'); } catch (e) { /* хранилище недоступно */ }
    const q = new URLSearchParams(location.search);
    UTM_KEYS.forEach((k) => { if (q.get(k)) saved[k] = q.get(k); });
    try { sessionStorage.setItem('gp_utm', JSON.stringify(saved)); } catch (e) { /* ничего */ }
    return saved;
  })();

  function goal(name) {
    const id = cfg.metrikaId;
    const g = cfg.goals && cfg.goals[name];
    if (id && g && typeof window.ym === 'function') window.ym(id, 'reachGoal', g);
  }

  /* ---------------------------------------------------------------
     1. Плавный скролл: Lenis только на десктопе с мышью
        (LUCE: инерция только ≥600px, на тач-устройствах — нативный скролл)
     --------------------------------------------------------------- */
  let lenis = null;
  function initLenis() {
    if (!(MOTION && matchMedia('(pointer: fine)').matches && matchMedia(DESKTOP_MQ).matches)) return;
    const s = document.createElement('script');                 // на телефонах библиотека не грузится вовсе
    s.src = 'assets/js/vendor/lenis.min.js';
    s.onload = () => {
      lenis = new window.Lenis({ duration: 1.5, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
      lenis.on('scroll', window.ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    };
    document.head.appendChild(s);
  }

  const lockScroll = (on) => {
    if (lenis) on ? lenis.stop() : lenis.start();
    document.body.style.overflow = on ? 'hidden' : '';
  };

  function scrollToTarget(sel) {
    const el = sel === '#top' ? document.body : $(sel);
    if (!el) return;
    const offset = sel === '#top' ? 0 : -($('#hdr').offsetHeight - 1);
    if (lenis) lenis.scrollTo(sel === '#top' ? 0 : el, { offset, duration: 1.6 });
    else window.scrollTo({ top: sel === '#top' ? 0 : el.getBoundingClientRect().top + window.scrollY + offset, behavior: REDUCED ? 'auto' : 'smooth' });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-scroll]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.charAt(0) !== '#') return;
    e.preventDefault();
    if (menu.classList.contains('is-open')) toggleMenu(false);
    scrollToTarget(href);
  });

  $$('[data-goal="call"]').forEach((a) => a.addEventListener('click', () => goal('call')));

  /* ---------------------------------------------------------------
     2. Шапка: прозрачная над первым экраном, прячется при скролле вниз
        Нижняя панель на телефоне появляется после первого экрана
     --------------------------------------------------------------- */
  const hdr = $('#hdr');
  const hero = $('.hero');
  const mbar = $('#mbar');
  const finalSec = $('.final');
  let lastY = window.scrollY;
  let finalInView = false;

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { finalInView = en.isIntersecting; onScroll(); }, { threshold: 0.25 }).observe(finalSec);
  }

  let heroH = hero.offsetHeight, hdrH = hdr.offsetHeight;
  window.addEventListener('resize', () => { heroH = hero.offsetHeight; hdrH = hdr.offsetHeight; }, { passive: true });
  function onScroll() {
    const y = window.scrollY;
    const heroEnd = heroH - hdrH;
    hdr.classList.toggle('is-solid', y > 40);
    const down = y > lastY + 4;
    const up = y < lastY - 4;
    if (y > heroEnd && down) hdr.classList.add('is-hidden');
    else if (up || y <= heroEnd) hdr.classList.remove('is-hidden');
    mbar.classList.toggle('is-shown', y > heroH * 0.7 && !finalInView);
    lastY = y;
  }
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  onScroll();

  /* ---------------------------------------------------------------
     3. Меню: выезжает снизу, пункты — лесенкой
     --------------------------------------------------------------- */
  const menu = $('#menu');
  const burger = $('.burger');
  $$('.menu__list li').forEach((li, i) => li.firstElementChild.style.setProperty('--i', i));

  function toggleMenu(open) {
    menu.classList.toggle('is-open', open);
    menu.inert = !open;
    hdr.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    lockScroll(open);
  }
  burger.addEventListener('click', () => toggleMenu(!menu.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) toggleMenu(false); });

  /* ---------------------------------------------------------------
     4. Модальное окно «Узнать цену»
     --------------------------------------------------------------- */
  const modal = $('#modal-price');
  function openModal() {
    if (!modal) return;
    $$('.modal__view', modal).forEach((v, i) => v.classList.toggle('is-active', i === 0));
    modal.showModal();
    lockScroll(true);
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('is-in')));
    setTimeout(() => { const f = $('.field__input', modal); if (f && matchMedia('(pointer: fine)').matches) f.focus(); }, 350);
  }
  function closeModal() {
    if (!modal.open) return;
    modal.classList.remove('is-in');
    setTimeout(() => { modal.close(); lockScroll(false); }, 320);
  }
  $$('[data-modal="price"]').forEach((b) => b.addEventListener('click', openModal));
  modal.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });

  /* ---------------------------------------------------------------
     5. Телефонная маска и формы
     --------------------------------------------------------------- */
  function formatPhone(raw) {
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    const p = d.slice(1);
    let out = '+7';
    if (p.length) out += ' (' + p.slice(0, 3);
    if (p.length >= 3) out += ')';
    if (p.length > 3) out += ' ' + p.slice(3, 6);
    if (p.length > 6) out += '-' + p.slice(6, 8);
    if (p.length > 8) out += '-' + p.slice(8, 10);
    return out;
  }
  $$('input[type="tel"]').forEach((inp) => {
    inp.addEventListener('focus', () => { if (!inp.value) inp.value = '+7 ('; });
    inp.addEventListener('blur', () => { if (inp.value.replace(/\D/g, '').length <= 1) inp.value = ''; });
    inp.addEventListener('input', (e) => {
      if (e.inputType && e.inputType.startsWith('delete') && /\D$/.test(inp.value)) return; // не мешаем стирать скобки и дефисы
      inp.value = formatPhone(inp.value);
    });
  });

  function shake(el) {
    el.classList.remove('is-shake');
    void el.offsetWidth;
    el.classList.add('is-shake');
  }

  function validate(form) {
    let first = null;
    $$('.field', form).forEach((f) => {
      const inp = $('input', f);
      const ok = inp.type === 'tel' ? inp.value.replace(/\D/g, '').length === 11 : inp.value.trim().length > 1;
      f.classList.toggle('is-error', !ok);
      if (!ok) { shake(f); first = first || inp; }
    });
    const c = $('.consent', form);
    if (c) {
      const ok = $('input', c).checked;
      c.classList.toggle('is-error', !ok);
      if (!ok) { shake(c); first = first || $('input', c); }
    }
    if (first) first.focus();
    return !first;
  }
  $$('.field__input, .consent input').forEach((i) => i.addEventListener('input', () => {
    (i.closest('.field') || i.closest('.consent')).classList.remove('is-error');
  }));

  const toast = $('.toast');
  let toastTimer;
  function showToast(text) {
    $('.toast__text', toast).textContent = text;
    toast.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 3600);
  }

  async function sendLead(kind, data) {
    const payload = Object.assign({ form: kind, page: location.href, sent_at: new Date().toISOString() }, utm, data);
    if (cfg.leadEndpoint) {
      const res = await fetch(cfg.leadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } else {
      await new Promise((r) => setTimeout(r, 900));
      console.info('[Город-Парк] заявка (обработчик не подключён):', payload);
    }
    goal(kind);
  }

  function formData(form) {
    const data = {};
    new FormData(form).forEach((v, k) => {
      if (k === 'consent') return;
      data[k] = data[k] ? [].concat(data[k], v) : v;
    });
    return data;
  }

  async function submitWithMorph(form, kind, onDone) {
    const btn = $('.morph', form);
    if (btn.dataset.state !== 'idle') return;
    if (!validate(form)) return;
    btn.dataset.state = 'loading';
    btn.setAttribute('aria-busy', 'true');
    try {
      await sendLead(kind, formData(form));
      btn.dataset.state = 'done';
      btn.removeAttribute('aria-busy');
      setTimeout(() => { onDone(); }, 900);
      setTimeout(() => { btn.dataset.state = 'idle'; }, 2200);
    } catch (err) {
      btn.dataset.state = 'idle';
      btn.removeAttribute('aria-busy');
      showToast('Не получилось отправить. Позвоните нам: +7 (3412) 65-07-78');
    }
  }

  $$('form[data-form="price"], form[data-form="final"]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const kind = form.dataset.form;
      submitWithMorph(form, kind, () => {
        if (kind === 'price') {
          $$('.modal__view', modal).forEach((v, i) => v.classList.toggle('is-active', i === 1));
        } else {
          showToast('Спасибо! Менеджер перезвонит вам в рабочее время');
        }
        form.reset();
      });
    });
  });

  /* ---------------------------------------------------------------
     6. Квиз: три вопроса → контакт → спасибо
     --------------------------------------------------------------- */
  const qz = $('#qz');
  if (qz) {
    const steps = $$('.qz__step', qz);
    const next = $('.qz__next', qz);
    const back = $('.qz__back', qz);
    const counter = $('.qz__count', qz);
    const fill = $('.qz__fill', qz);
    let step = 1;

    const answered = (n) => {
      const s = steps[n - 1];
      if (n === 3) return true;                                   // пожелания необязательны
      return !!$('input:checked', s);
    };
    function render(dirBack) {
      qz.classList.toggle('is-back', !!dirBack);
      qz.dataset.step = step;
      steps.forEach((s, i) => {
        const on = i === step - 1;
        s.classList.toggle('is-active', on);
        s.inert = !on;
      });
      fill.style.setProperty('--p', Math.min(step, 4) / 4);
      counter.innerHTML = step <= 3 ? 'Вопрос <b class="qz__n">' + step + '</b> из 3' : step === 4 ? 'Последний шаг' : 'Готово';
      back.disabled = step === 1 || step === 5;
      next.disabled = !answered(step);
      if (step === 3) next.firstChild.textContent = $('input:checked', steps[2]) ? 'Далее' : 'Пропустить';
      else next.firstChild.textContent = 'Далее';
    }
    const box = $('.qz__steps', qz);
    function go(n) {
      const dirBack = n < step;
      const h0 = box.offsetHeight;
      step = Math.max(1, Math.min(5, n));
      render(dirBack);
      const h1 = box.offsetHeight;                   // высота карточки плавно подстраивается под шаг
      if (h0 !== h1 && box.animate && !REDUCED) box.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
      if (step === 4 && matchMedia('(pointer: fine)').matches) setTimeout(() => $('#qz-name').focus({ preventScroll: true }), 420);
    }
    qz.addEventListener('change', (e) => {
      if (!e.target.matches('.opt input')) return;
      render();
      if (e.target.type === 'radio') setTimeout(() => { if (step < 3) go(step + 1); }, 380);   // автопереход
    });
    next.addEventListener('click', () => go(step + 1));
    back.addEventListener('click', () => go(step - 1));
    qz.addEventListener('submit', (e) => {
      e.preventDefault();
      if (step !== 4) { if (step < 4 && answered(step)) go(step + 1); return; }
      submitWithMorph(qz, 'quiz', () => go(5));
    });
    render();
  }

  /* ---------------------------------------------------------------
     7. Табы планировок (ui-motion: JS считает края, CSS их анимирует)
     --------------------------------------------------------------- */
  $$('.tabs').forEach((list) => {
    const ind = $('.tabs__ind', list);
    const tabs = $$('[role="tab"]', list);
    let current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const place = (i) => {
      const t = tabs[i];
      ind.style.setProperty('--l', t.offsetLeft + 'px');
      ind.style.setProperty('--r', list.clientWidth - t.offsetLeft - t.offsetWidth + 'px');
    };
    function select(i, focus) {
      if (i === current) return;
      list.dataset.dir = i > current ? 'right' : 'left';
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).classList.toggle('is-active', on);
      });
      current = i;
      place(i);
      if (focus) tabs[i].focus();
    }
    tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
    list.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (e.key === 'Home') select(0, true);
      else if (e.key === 'End') select(tabs.length - 1, true);
      else if (d) select((current + d + tabs.length) % tabs.length, true);
      else return;
      e.preventDefault();
    });
    const snap = () => { delete list.dataset.dir; place(current); };
    document.fonts && document.fonts.ready.then(snap);
    new ResizeObserver(snap).observe(list);
  });

  /* ---------------------------------------------------------------
     8. Отзывы: «читать полностью», стрелки, прогресс, перетаскивание мышью
     --------------------------------------------------------------- */
  const track = $('.rev-track');
  if (track) {
    const bar = $('.rev-progress span');
    const cards = $$('.rev', track);
    const checkClamp = () => cards.forEach((c) => {
      if (c.classList.contains('is-open')) return;
      const t = $('.rev__text', c);
      $('.rev__more', c).hidden = t.scrollHeight <= t.clientHeight + 2;
    });
    cards.forEach((c) => $('.rev__more', c).addEventListener('click', (e) => {
      const open = c.classList.toggle('is-open');
      e.currentTarget.textContent = open ? 'Свернуть' : 'Читать полностью';
    }));
    const progress = () => {
      const max = track.scrollWidth - track.clientWidth;
      const w = track.clientWidth / track.scrollWidth;
      const p = max > 0 ? track.scrollLeft / max : 0;
      bar.style.setProperty('--w', w.toFixed(3));
      bar.style.setProperty('--x', ((p * (1 - w)) / w * 100).toFixed(2));
      $('[data-rev="prev"]').disabled = track.scrollLeft < 4;
      $('[data-rev="next"]').disabled = track.scrollLeft > max - 4;
    };
    const stepW = () => cards[0].offsetWidth + parseFloat(getComputedStyle(track).columnGap || 16);
    $('[data-rev="prev"]').addEventListener('click', () => track.scrollBy({ left: -stepW(), behavior: 'smooth' }));
    $('[data-rev="next"]').addEventListener('click', () => track.scrollBy({ left: stepW(), behavior: 'smooth' }));
    track.addEventListener('scroll', () => requestAnimationFrame(progress), { passive: true });
    window.addEventListener('resize', () => { checkClamp(); progress(); });
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { checkClamp(); progress(); });

    // перетаскивание мышью на десктопе
    let down = false, startX = 0, startL = 0, moved = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.target.closest('button')) return;
      down = true; moved = false; startX = e.clientX; startL = track.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 5) { moved = true; track.classList.add('is-drag'); }
      if (moved) track.scrollLeft = startL - dx;
    });
    window.addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      if (moved) {
        const w = stepW();
        const target = Math.round(track.scrollLeft / w) * w;
        track.classList.remove('is-drag');
        track.scrollTo({ left: target, behavior: 'smooth' });
      }
    });
  }


  /* ---------------------------------------------------------------
     8½. Карта района: метки по координатам, маршрут-дуга до объекта
     --------------------------------------------------------------- */
  const map = $('#map');
  if (map) {
    const [VW, VH] = map.dataset.vb.split(' ').map(Number);
    const home = $('.pin--home', map);
    const HX = +home.dataset.x, HY = +home.dataset.y;
    const route = $('.map__route', map);
    const pins = $$('.pin[data-key]', map);
    const times = $$('.time[data-key]');
    const keys = pins.map((p) => p.dataset.key);
    pins.forEach((p, i) => p.style.setProperty('--n', i));

    function layout() {
      const w = map.clientWidth, h = map.clientHeight;
      const s = Math.max(w / VW, h / VH);             // как object-fit: cover
      const ox = (w - VW * s) / 2, oy = (h - VH * s) / 2;
      $$('[data-x]', map).forEach((el) => {
        el.style.left = (ox + el.dataset.x * s).toFixed(1) + 'px';
        el.style.top = (oy + el.dataset.y * s).toFixed(1) + 'px';
        if (el.dataset.r) el.style.setProperty('--r', el.dataset.r + 'deg');
      });
      requestAnimationFrame(() => {                   // подпись, вылезающая за край карты, скрывается
        const mr = map.getBoundingClientRect();
        $$('.map__lbl', map).forEach((el) => {
          const r = el.getBoundingClientRect();
          el.hidden = r.left < mr.left + 8 || r.right > mr.right - 8 || r.top < mr.top + 8 || r.bottom > mr.bottom - 24;
        });
      });
      map.style.setProperty('--cx', ((ox + HX * s) / w * 100).toFixed(1) + '%');
      map.style.setProperty('--cy', ((oy + HY * s) / h * 100).toFixed(1) + '%');
    }
    new ResizeObserver(layout).observe(map);
    layout();

    let current = null;
    function activate(key) {
      if (key === current) return;
      current = key;
      pins.forEach((p) => p.classList.toggle('is-active', p.dataset.key === key));
      times.forEach((t) => t.classList.toggle('is-active', t.dataset.key === key));
      const p = pins.find((x) => x.dataset.key === key);
      if (!p) return;
      const tx = +p.dataset.x, ty = +p.dataset.y;
      const mx = (HX + tx) / 2, my = (HY + ty) / 2;
      const dx = tx - HX, dy = ty - HY;
      const k = 0.22;                                  // изгиб дуги
      route.setAttribute('d', `M${HX} ${HY}Q${(mx - dy * k).toFixed(0)} ${(my + dx * k).toFixed(0)} ${tx} ${ty}`);
      route.classList.remove('is-drawn');
      void route.getBoundingClientRect();
      route.classList.add('is-drawn');
    }

    // автопереключение объектов, пока карта на экране и её никто не трогал
    let timer = null, touched = false, visible = false;
    const stop = () => { clearInterval(timer); timer = null; };
    const cycle = () => {
      stop();
      if (touched || !visible || REDUCED) return;
      timer = setInterval(() => activate(keys[(keys.indexOf(current) + 1) % keys.length]), 3400);
    };
    const userPick = (key) => { touched = true; stop(); activate(key); };
    pins.forEach((p) => p.addEventListener('click', () => userPick(p.dataset.key)));
    times.forEach((t) => {
      t.addEventListener('click', () => userPick(t.dataset.key));
      t.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) userPick(t.dataset.key); });
      t.addEventListener('focus', () => userPick(t.dataset.key));
    });

    const start = () => {
      map.classList.add('is-in');
      setTimeout(() => { map.classList.add('is-ready'); if (!current) activate(keys[0]); cycle(); }, MOTION ? 1300 : 0);
    };
    if ('IntersectionObserver' in window) {
      let started = false;
      new IntersectionObserver(([en]) => {
        visible = en.isIntersecting;
        if (visible && !started) { started = true; start(); }
        else if (started) visible ? cycle() : stop();
      }, { threshold: 0.35 }).observe(map);
    } else start();
  }

  /* ---------------------------------------------------------------
     9. Видео первого экрана (только телефон, без режима экономии трафика)
     --------------------------------------------------------------- */
  const video = $('.hero__video');
  function startHeroVideo() {
    const c = navigator.connection || {};
    const slow = c.saveData || /(^|-)2g|3g/.test(c.effectiveType || '');
    if (!video || REDUCED || slow || !matchMedia(MOBILE_MQ).matches) return;
    video.src = video.dataset.src;
    video.addEventListener('playing', () => video.classList.add('is-playing'), { once: true });
    const p = video.play();
    if (p && p.catch) p.catch(() => { /* автозапуск запрещён — остаётся постер */ });
  }

  /* ---------------------------------------------------------------
     11. ДВИЖЕНИЕ
     --------------------------------------------------------------- */
  function splitWords(el) {
    // оборачиваем слова в span, сохраняя неразрывные пробелы
    const words = el.textContent.trim().split(/ +/);
    el.innerHTML = words.map((w, i) => '<span class="w' + (i === 0 ? ' w--brand' : '') + '">' + w + '</span>').join(' ');
    return $$('.w', el);
  }

  const tick = () => new Promise((r) => (window.scheduler && scheduler.yield ? scheduler.yield().then(r) : setTimeout(r, 0)));

  async function initMotion() {
    gsap.registerPlugin(ScrollTrigger);
    const hasSplit = !!window.SplitText;
    if (hasSplit) gsap.registerPlugin(SplitText);
    const mm = gsap.matchMedia();

    /* --- Заголовки: строки выезжают из-под маски --- */
    $$('.split').forEach((el) => {
      if (!hasSplit) { gsap.from(el, { y: 30, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } }); return; }
      SplitText.create(el, {
        type: 'lines', mask: 'lines', linesClass: 'ln', autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, {
          yPercent: 110, duration: 1.15, ease: 'expo.out', stagger: 0.09,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        }),
      });
    });

    await tick();
    /* --- Примитивы LUCE (scrub): появление по мере прокрутки --- */
    const siblingsIndex = (el) => [...el.parentElement.children].filter((c) => c.classList.contains('ani-rise')).indexOf(el);
    $$('.ani-rise').forEach((el) => {
      const k = Math.max(0, siblingsIndex(el)) % 4;
      gsap.fromTo(el, { opacity: 0, y: 70, scale: 0.94 }, {
        opacity: 1, y: 0, scale: 1, ease: 'none',
        scrollTrigger: { trigger: el, start: `top+=${k * 36} bottom`, end: `top+=${k * 36} 72%`, scrub: true },
      });
    });
    $$('.ani-fade').forEach((el) => {
      gsap.fromTo(el, { opacity: 0, y: 24 }, {
        opacity: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 94%', end: 'top 70%', scrub: true },
      });
    });

    await tick();
    /* --- Подчёркивание по скроллу (LUCE): класс, а движение делает CSS --- */
    $$('.u-line').forEach((el) => {
      if (el.closest('.reveal')) return;            // внутри раскрытия — управляется таймлайном
      ScrollTrigger.create({ trigger: el, start: 'top 72%', end: 'bottom top', toggleClass: { targets: el, className: 'is-on' } });
    });

    await tick();
    /* --- ПЕРЕХОД A: первый экран «проваливается вниз» и гаснет --- */
    gsap.to('.hero__media', {
      y: () => window.innerHeight * 0.24, opacity: 0.3, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    });

    await tick();
    /* --- Цифры доверия: счётчики --- */
    $$('[data-count]').forEach((el) => {
      const to = +el.dataset.count;
      const obj = { v: 0 };
      el.textContent = '0';
      ScrollTrigger.create({
        trigger: el, start: 'top 92%', once: true,
        onEnter: () => gsap.to(obj, { v: to, duration: 1.6, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(obj.v); } }),
      });
    });

    await tick();
    /* --- О проекте: слова проявляются по мере чтения --- */
    const lead = $('.about__lead');
    if (lead) {
      const words = splitWords(lead);
      gsap.to(words, {
        color: (i, el) => (el.classList.contains('w--brand') ? '#3D7B52' : '#2D2926'), ease: 'none', stagger: 0.06,
        scrollTrigger: { trigger: lead, start: 'top 82%', end: 'bottom 48%', scrub: true },
      });
    }

    await tick();
    /* --- Раскрытие двора через знак-тюльпан (главный момент страницы) --- */
    const reveal = $('.reveal');
    if (reveal) {
      const media = $('.reveal__media', reveal);
      const img = $('img', media);
      const cap = $('.reveal__caption', reveal);
      const uline = $('.u-line', cap);
      const tl = gsap.timeline({ scrollTrigger: { trigger: reveal, start: 'top bottom', end: 'bottom bottom', scrub: 0.6 } });
      tl.fromTo(media, { '--m': '44vh' }, { '--m': '1800vh', ease: 'power3.in', duration: 1 }, 0)
        .fromTo(img, { scale: 1.4 }, { scale: 1, ease: 'power1.out', duration: 1 }, 0)
        .fromTo('.reveal__scrim', { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.66)
        .fromTo(cap, { yPercent: 30, opacity: 0 }, { yPercent: 0, opacity: 1, ease: 'power2.out', duration: 0.2 }, 0.7)
        .call(() => uline && uline.classList.remove('is-on'), null, 0.86)
        .call(() => uline && uline.classList.add('is-on'), null, 0.9)
        .to({}, { duration: 0.12 });

      /* ПЕРЕХОД B (LUCE «уход вглубь + раскрытие»): кадр уходит вглубь и
         становится карточкой, а фото внутри продолжает наезжать */
      gsap.fromTo('.reveal__frame', { scale: 1, borderRadius: 0 }, {
        scale: 0.86, borderRadius: 40, ease: 'none',
        scrollTrigger: { trigger: '.adv', start: 'top bottom', end: 'top 15%', scrub: true },
      });
      gsap.fromTo(img, { yPercent: 0 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: '.adv', start: 'top bottom', end: 'top 15%', scrub: true },
      });
    }

    await tick();
    /* --- Преимущества: карточки ложатся стопкой, нижняя уходит вглубь --- */
    const cards = $$('.adv__card');
    cards.forEach((card, i) => {
      card.style.setProperty('--i', i);
      const pic = $('img', card);
      gsap.fromTo(pic, { scale: 1.18 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'top 30%', scrub: true } });
      const nextCard = cards[i + 1];
      if (!nextCard) return;
      gsap.to(card, {
        scale: 0.93, '--dim': 0.28, ease: 'none',
        scrollTrigger: {
          trigger: nextCard, start: 'top bottom',
          end: () => 'top ' + (parseFloat(getComputedStyle(nextCard).top) || 90) + 'px',
          scrub: true, invalidateOnRefresh: true,
        },
      });
    });

    await tick();
    /* --- Линейные формы брендбука рисуют себя по скроллу --- */
    $$('.draw').forEach((p) => {
      gsap.fromTo(p, { strokeDashoffset: 1 }, {
        strokeDashoffset: 0, ease: 'none',
        scrollTrigger: { trigger: p.closest('section'), start: 'top 75%', end: 'bottom 70%', scrub: true },
      });
    });

    await tick();
    /* --- Расположение: плашки времени выезжают слева --- */
    $$('.time').forEach((el, i) => {
      gsap.fromTo(el, { opacity: 0, x: -60 }, {
        opacity: 1, x: 0, ease: 'none',
        scrollTrigger: { trigger: el, start: `top+=${(i % 2) * 20} bottom`, end: `top+=${(i % 2) * 20} 75%`, scrub: true },
      });
    });

    await tick();
    /* --- Фото-пауза: параллакс и лёгкий наезд --- */
    gsap.fromTo('.pause__media', { yPercent: -8, scale: 1.12 }, {
      yPercent: 8, scale: 1, ease: 'none',
      scrollTrigger: { trigger: '.pause', start: 'top bottom', end: 'bottom top', scrub: true },
    });

    await tick();
    /* --- Отзывы: карточки въезжают справа одной волной --- */
    gsap.from('.rev', {
      x: 90, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08,
      scrollTrigger: { trigger: '.rev-track', start: 'top 85%', once: true },
    });

    await tick();
    /* --- Финал: фото раскрывается, плашка поднимается; ПЕРЕХОД D — тихое растворение в футер --- */
    gsap.fromTo('.final__media img', { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.final', start: 'top bottom', end: 'top top', scrub: true } });
    mm.add(MOBILE_MQ, () => {
      gsap.fromTo('.final__plaque', { yPercent: 35 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.final', start: 'top 70%', end: 'bottom bottom', scrub: true } });
    });
    mm.add('(min-width: 768px)', () => {
      gsap.fromTo('.final__plaque', { y: 120, opacity: 0 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.final', start: 'top 70%', end: 'top 10%', scrub: true } });
    });
    gsap.to('.final__media', { opacity: 0.35, ease: 'none', scrollTrigger: { trigger: '.ftr', start: 'top bottom', end: 'top 30%', scrub: true } });

    await tick();
    /* --- Магнитные кнопки (только мышь) --- */
    if (matchMedia('(pointer: fine)').matches) {
      $$('.hero__btns .btn, .terms__cta .btn, .hdr__cta').forEach((b) => {
        const xTo = gsap.quickTo(b, 'x', { duration: 0.6, ease: 'power3.out' });
        const yTo = gsap.quickTo(b, 'y', { duration: 0.6, ease: 'power3.out' });
        b.addEventListener('pointermove', (e) => {
          const r = b.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * 0.22);
          yTo((e.clientY - r.top - r.height / 2) * 0.35);
        });
        b.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
      });
    }

    ScrollTrigger.refresh();
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }


  /* ---------------------------------------------------------------
     12. Старт: первый экран появляется на CSS сразу, анимации скролла
         собираются после первой отрисовки порциями, видео — после загрузки
     --------------------------------------------------------------- */
  const boot = () => {
    if (MOTION) initMotion().then(initLenis);
    else $$('.u-line').forEach((el) => el.classList.add('is-on'));
  };
  if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 1000 });
  else setTimeout(boot, 200);
  if (document.readyState === 'complete') setTimeout(startHeroVideo, 800);
  else window.addEventListener('load', () => setTimeout(startHeroVideo, 800), { once: true });
})();
