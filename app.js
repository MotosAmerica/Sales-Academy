// ==========================================================================
// Motos America Sales Academy — Application logic
// Single-page app: no build step, no framework. Renders into #app.
// ==========================================================================

(function () {
  'use strict';

  const DATA = window.ACADEMY_DATA;
  const STORE_OPTIONS = ['Cascade Moto Portland', 'Tampa Bay Motos', 'Triumph of Santa Monica', 'Triumph Columbia River', 'MA Corporate'];
  const CORPORATE_STORE = 'MA Corporate';

  // ---------- Supabase client ----------
  let supabase = null;
  const supabaseReady =
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !window.SUPABASE_URL.includes('YOUR_SUPABASE') &&
    !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

  if (supabaseReady && window.supabase) {
    supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }

  // ---------- Local session (who's logged in) ----------
  const SESSION_KEY = 'moto_academy_session';

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(trainee) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(trainee));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ---------- Local progress cache (works even if Supabase is offline) ----------
  // Keyed by trainee id. Each entry: { [quizKey]: {scorePct, correct, total, completedAt} }
  const PROGRESS_KEY = 'moto_academy_progress';

  function getLocalProgress(traineeId) {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      const all = raw ? JSON.parse(raw) : {};
      return all[traineeId] || {};
    } catch (e) {
      return {};
    }
  }

  function saveLocalProgress(traineeId, quizKey, result) {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      const all = raw ? JSON.parse(raw) : {};
      if (!all[traineeId]) all[traineeId] = {};
      // Preserve/increment a lifetime attempt counter per quiz, so "took 4
      // attempts to pass" survives even after they eventually succeed.
      const prevAttempts = (all[traineeId][quizKey] && all[traineeId][quizKey].attempts) || 0;
      all[traineeId][quizKey] = { ...result, attempts: prevAttempts + 1 };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
      return all[traineeId][quizKey];
    } catch (e) { /* ignore quota errors */ }
  }

  // ---------- Pending sync queue (for flaky connections) ----------
  // If a Supabase write fails, we queue it here and retry on next load / action.
  const QUEUE_KEY = 'moto_academy_pending_sync';

  function getQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function pushToQueue(item) {
    const q = getQueue();
    q.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  function setQueue(items) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  }

  async function flushQueue() {
    if (!supabase) return;
    let queue = getQueue();
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      try {
        if (item.type === 'trainee') {
          await supabase.from('trainees').upsert(item.payload, { onConflict: 'id' });
        } else if (item.type === 'attempt') {
          await supabase.from('quiz_attempts').insert(item.payload);
        }
      } catch (e) {
        remaining.push(item);
      }
    }
    setQueue(remaining);
  }

  // Try to flush whenever we come back online
  window.addEventListener('online', flushQueue);

  // ---------- Router ----------
  // Route shape: { view: 'toc' | 'module' | 'quiz' | 'exam' | 'report' | 'login', ...params }
  let currentRoute = { view: 'login' };

  function navigate(route) {
    currentRoute = route;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  // ---------- Utility ----------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v !== null && v !== undefined) {
          node.setAttribute(k, v);
        }
      }
    }
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Renders inline **bold** markers from the source content into <strong> tags safely.
  function renderInline(text) {
    const escaped = escapeHtml(text || '');
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function moduleByNum(num) {
    return DATA.modules.find((m) => m.num === num);
  }

  function quizKeyForModule(num) {
    return `module-${num}`;
  }

  function totalModuleCount() {
    return DATA.modules.length;
  }

  // ==========================================================================
  // VIEW: Login
  // ==========================================================================

  function renderLogin(root) {
    const shell = el('div', { class: 'login-shell' });

    const logoWrap = el('div', { class: 'login-shell__logo' }, [
      el('img', { src: 'assets/MA_logo_white_header.png', alt: 'Motos America' }),
    ]);
    shell.appendChild(logoWrap);

    const card = el('div', { class: 'login-card' });

    card.appendChild(el('div', { class: 'login-card__sub' }, ['Sales Academy']));
    card.appendChild(el('div', { class: 'login-card__tag' }, ['Live the passion. Take the ride.']));

    let errorBox = null;

    const nameField = el('div', { class: 'field' }, [
      el('label', {}, ['Your full name']),
      el('input', { type: 'text', id: 'login-name', autocomplete: 'name', placeholder: 'e.g. Jordan Reyes' }),
    ]);

    const storeSelect = el('select', { id: 'login-store' }, [
      el('option', { value: '' }, ['Select your store...']),
      ...STORE_OPTIONS.map((s) => el('option', { value: s }, [s])),
    ]);
    const storeField = el('div', { class: 'field' }, [
      el('label', {}, ['Your store']),
      storeSelect,
    ]);

    const roleSelect = el('select', { id: 'login-role' }, [
      el('option', { value: 'sales' }, ['Sales']),
      el('option', { value: 'finance' }, ['Finance / F&I']),
      el('option', { value: 'manager' }, ['Manager']),
    ]);
    const roleField = el('div', { class: 'field' }, [
      el('label', {}, ['Your role']),
      roleSelect,
    ]);

    // MA Corporate is Manager-only: lock the role dropdown to Manager and
    // disable it the moment that store is picked, so it's not even possible
    // to select something else in the UI.
    storeSelect.addEventListener('change', () => {
      if (storeSelect.value === CORPORATE_STORE) {
        roleSelect.value = 'manager';
        roleSelect.disabled = true;
      } else {
        roleSelect.disabled = false;
      }
    });

    const submitBtn = el('button', { class: 'btn btn--primary' }, ['Enter the Academy']);

    const form = el('div', {}, [nameField, storeField, roleField, submitBtn]);

    async function handleSubmit() {
      const name = document.getElementById('login-name').value.trim();
      const store = document.getElementById('login-store').value;
      let role = document.getElementById('login-role').value;

      if (errorBox) { errorBox.remove(); errorBox = null; }

      if (!name || name.length < 2) {
        errorBox = el('div', { class: 'login-error' }, ['Please enter your full name.']);
        form.insertBefore(errorBox, form.firstChild);
        return;
      }
      if (!store) {
        errorBox = el('div', { class: 'login-error' }, ['Please select your store.']);
        form.insertBefore(errorBox, form.firstChild);
        return;
      }
      // Hard enforcement, independent of the UI lock above — MA Corporate is
      // always Manager, even if the role field were tampered with.
      if (store === CORPORATE_STORE) {
        role = 'manager';
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing you in...';

      const trainee = await findOrCreateTrainee(name, store, role);

      setSession(trainee);
      navigate({ view: 'toc' });
    }

    submitBtn.addEventListener('click', handleSubmit);
    [nameField, storeField].forEach((f) => {
      f.querySelector('input,select').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSubmit();
      });
    });

    card.appendChild(form);
    shell.appendChild(card);
    root.appendChild(shell);
  }

  // Looks up a trainee by name+store, or creates a new record. Falls back to a
  // local-only id if Supabase isn't configured or the network call fails, so
  // the app still works offline / before setup is complete.
  async function findOrCreateTrainee(name, store, role) {
    const localId = 'local-' + name.toLowerCase().replace(/\s+/g, '-') + '-' + store.toLowerCase().replace(/\s+/g, '-');
    const fallback = { id: localId, full_name: name, store, role, _local: true };

    if (!supabase) return fallback;

    try {
      const { data: existing, error: findErr } = await supabase
        .from('trainees')
        .select('*')
        .eq('full_name', name)
        .eq('store', store)
        .limit(1);

      if (findErr) throw findErr;

      if (existing && existing.length) {
        return existing[0];
      }

      const { data: created, error: createErr } = await supabase
        .from('trainees')
        .insert({ full_name: name, store, role })
        .select()
        .single();

      if (createErr) throw createErr;
      return created;
    } catch (e) {
      // Network/setup issue — queue a create attempt for later, and proceed
      // with a local id so the trainee isn't blocked from training today.
      pushToQueue({ type: 'trainee', payload: { id: undefined, full_name: name, store, role } });
      return fallback;
    }
  }

  // ==========================================================================
  // Shared: top bar
  // ==========================================================================

  function renderTopbar(root, trainee) {
    const bar = el('div', { class: 'topbar' });

    const brand = el('div', { class: 'topbar__brand', onclick: () => navigate({ view: 'toc' }) }, [
      el('img', {
        src: 'assets/MA_logo_white_header.png',
        alt: 'Motos America',
        class: 'topbar__logo',
      }),
      el('div', { class: 'topbar__brand-sub' }, ['Sales Academy']),
    ]);

    const right = el('div', { class: 'topbar__right' });
    right.appendChild(el('span', { class: 'topbar__user' }, [`${trainee.full_name} · ${trainee.store}`]));

    if (trainee.role === 'manager' || trainee.role === 'admin') {
      right.appendChild(el('button', { class: 'topbar__link', onclick: () => navigate({ view: 'report' }) }, ['Report']));
    }
    right.appendChild(el('button', { class: 'topbar__link', onclick: () => { clearSession(); navigate({ view: 'login' }); } }, ['Sign out']));

    bar.appendChild(brand);
    bar.appendChild(right);
    root.appendChild(bar);
  }

  // ==========================================================================
  // VIEW: Table of Contents / Dashboard
  // ==========================================================================

  async function renderTOC(root, trainee) {
    renderTopbar(root, trainee);
    const page = el('div', { class: 'page' });
    page.appendChild(el('div', { class: 'loading' }, [el('div', { class: 'spinner' }), 'Loading your progress...']));
    root.appendChild(page);

    const progress = await fetchProgress(trainee.id);

    page.innerHTML = '';

    const partI = DATA.modules.filter((m) => m.part === 'I');
    const partII = DATA.modules.filter((m) => m.part === 'II');

    const doneCount = DATA.modules.filter((m) => isPassed(progress[quizKeyForModule(m.num)])).length;
    const exam1Done = !!progress['part1-exam'];
    const exam2Done = !!progress['part2-exam'];

    const hero = el('div', { class: 'hero' }, [
      el('div', { class: 'hero__eyebrow' }, ['Welcome back']),
      el('div', { class: 'hero__title' }, [trainee.full_name.split(' ')[0] + ', here\u2019s your training']),
      el('div', { class: 'hero__desc' }, ['Work through each module, then pass its 5-question review with a perfect score. Finish a Part to unlock its 20-question exam.']),
      el('div', { class: 'progress-summary' }, [
        el('div', { class: 'progress-chip' }, [el('strong', {}, [`${doneCount}/${totalModuleCount()}`]), 'modules passed']),
        el('div', { class: 'progress-chip' }, [el('strong', {}, [exam1Done ? '\u2713' : '\u2014']), 'Part I exam']),
        el('div', { class: 'progress-chip' }, [el('strong', {}, [exam2Done ? '\u2713' : '\u2014']), 'Part II exam']),
      ]),
    ]);
    page.appendChild(hero);

    function buildPartSection(label, title, mods, examKey, examTitle, examQuestions) {
      const section = el('div', { class: 'part-section' });
      section.appendChild(el('div', { class: 'part-section__header' }, [
        el('span', { class: 'part-section__label' }, [`Part ${label}`]),
        el('span', { class: 'part-section__title' }, [title]),
      ]));

      const list = el('div', { class: 'module-list' });
      mods.forEach((m) => {
        const key = quizKeyForModule(m.num);
        const result = progress[key];
        const passed = isPassed(result);
        const attempts = result ? (result.attempts || 1) : 0;
        let metaLabel;
        if (passed) {
          metaLabel = attempts > 1 ? `Passed \u00b7 ${attempts} attempts` : 'Passed \u00b7 1st attempt';
        } else if (result) {
          metaLabel = `Not yet \u00b7 ${result.correct}/${result.total} (attempt ${attempts})`;
        } else {
          metaLabel = 'Not started';
        }
        const card = el('button', { class: 'module-card' + (passed ? ' module-card--done' : ''), onclick: () => navigate({ view: 'module', num: m.num }) }, [
          el('div', { class: 'module-card__num' }, [String(m.num).padStart(2, '0')]),
          el('div', { class: 'module-card__body' }, [
            el('div', { class: 'module-card__title' }, [m.title]),
            el('div', { class: 'module-card__meta' }, [
              el('span', { class: 'status-pill ' + (passed ? 'status-pill--done' : 'status-pill--todo') }, [metaLabel]),
            ]),
          ]),
        ]);
        list.appendChild(card);
      });
      section.appendChild(list);

      const allModsDone = mods.every((m) => isPassed(progress[quizKeyForModule(m.num)]));
      const examResult = progress[examKey];
      const examCard = el('div', { class: 'exam-card' }, [
        el('div', {}, [
          el('div', { class: 'exam-card__title' }, [examTitle]),
          el('div', { class: 'exam-card__desc' }, [
            examResult
              ? `Completed \u00b7 Score: ${examResult.correct}/${examResult.total} (${Math.round(examResult.scorePct)}%)`
              : (allModsDone ? '20 questions \u00b7 ready when you are' : `Pass all ${mods.length} module reviews above (100% each) to unlock`),
          ]),
        ]),
        el('button', {
          class: 'btn btn--primary',
          disabled: !allModsDone,
          onclick: () => allModsDone && navigate({ view: 'exam', part: label }),
        }, [examResult ? 'Retake Exam' : 'Start Exam']),
      ]);
      section.appendChild(examCard);

      return section;
    }

    page.appendChild(buildPartSection('I', 'The Sales Team', partI, 'part1-exam', 'Part I Exam \u2014 The Sales Team', DATA.part1Exam));
    page.appendChild(buildPartSection('II', 'The Finance & Insurance Office', partII, 'part2-exam', 'Part II Exam \u2014 The Finance & Insurance Office', DATA.part2Exam));
  }

  // A module review only counts as "passed" at a perfect score. Part exams
  // don't use this — any completed attempt counts, since they aren't gated.
  function isPassed(result) {
    return !!result && result.correct === result.total;
  }

  // Fetches all quiz results for a trainee, merging Supabase (if available)
  // with anything cached locally (so results still show up if the network
  // request fails, e.g. flaky wifi on the showroom floor).
  async function fetchProgress(traineeId) {
    const local = getLocalProgress(traineeId);
    if (!supabase || traineeId.startsWith('local-')) return local;

    try {
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('completed_at', { ascending: true });

      if (error) throw error;

      const merged = { ...local };
      (data || []).forEach((row) => {
        merged[row.quiz_key] = {
          correct: row.correct_answers,
          total: row.total_questions,
          scorePct: row.score_pct,
          completedAt: row.completed_at,
        };
      });
      return merged;
    } catch (e) {
      return local;
    }
  }

  // ==========================================================================
  // VIEW: Module reader
  // ==========================================================================

  function renderBlockToNode(b) {
    switch (b.type) {
      case 'part':
        if (/GOAL OF MODULE/i.test(b.title)) {
          return el('div', { class: 'block-goalhead' }, [b.title.toUpperCase()]);
        }
        return el('div', {}, [
          el('div', { class: 'block-part-num' }, [`Part ${b.num}`]),
          el('div', { class: 'block-part-title' }, [b.title]),
        ]);
      case 'goalhead':
        return el('div', { class: 'block-goalhead' }, [b.text.toUpperCase()]);
      case 'subhead':
        return el('div', { class: 'block-subhead' }, [b.text]);
      case 'emphasis':
        return el('p', { class: 'block-emphasis', html: renderInline(b.text) });
      case 'quote':
        return el('p', { class: 'block-quote', html: renderInline(b.text) });
      case 'bullets':
        return el('ul', { class: 'block-bullets' }, b.items.map((it) => el('li', { html: renderInline(it) })));
      case 'ordered':
        return el('ol', { class: 'block-ordered' }, b.items.map((it) => el('li', { html: renderInline(it) })));
      case 'para':
        return el('p', { class: 'block-para', html: renderInline(b.text) });
      default:
        return null;
    }
  }

  function renderModule(root, trainee, num) {
    renderTopbar(root, trainee);
    const page = el('div', { class: 'page' });

    const m = moduleByNum(num);
    if (!m) {
      page.appendChild(el('div', { class: 'empty-state' }, ['Module not found.']));
      root.appendChild(page);
      return;
    }

    const crumbs = el('div', { class: 'crumbs' }, [
      el('button', { onclick: () => navigate({ view: 'toc' }) }, ['Contents']),
      el('span', {}, ['/']),
      el('span', {}, [`Module ${String(m.num).padStart(2, '0')}`]),
    ]);
    page.appendChild(crumbs);

    page.appendChild(el('div', { class: 'module-header__eyebrow' }, [`Module ${String(m.num).padStart(2, '0')}`]));
    page.appendChild(el('div', { class: 'module-header__title' }, [m.title]));
    if (m.tagline) {
      page.appendChild(el('div', { class: 'module-header__tagline' }, [m.tagline]));
    }

    const body = el('div', { class: 'module-body' });
    m.blocks.forEach((b) => {
      const node = renderBlockToNode(b);
      if (node) body.appendChild(node);
    });
    page.appendChild(body);

    const nav = el('div', { class: 'module-nav' });
    const prevModule = moduleByNum(num - 1);
    const nextModule = moduleByNum(num + 1);

    nav.appendChild(
      prevModule
        ? el('button', { class: 'btn btn--ghost', onclick: () => navigate({ view: 'module', num: prevModule.num }) }, ['\u2190 Previous Module'])
        : el('span', {})
    );
    nav.appendChild(
      el('button', { class: 'btn btn--primary', onclick: () => navigate({ view: 'quiz', num: m.num }) }, ['Take the Module Review \u2192'])
    );
    page.appendChild(nav);

    if (nextModule) {
      const nextRow = el('div', { style: 'text-align:right; margin-top:10px;' });
      nextRow.appendChild(el('button', { class: 'btn btn--ghost', onclick: () => navigate({ view: 'module', num: nextModule.num }) }, ['Skip to Next Module \u2192']));
      page.appendChild(nextRow);
    }

    root.appendChild(page);
  }

  // ==========================================================================
  // VIEW: Quiz (module review, 5 questions) and Exam (Part review, 20 questions)
  // ==========================================================================

  const LETTERS = ['A', 'B', 'C', 'D'];

  function renderQuizOrExam(root, trainee, opts) {
    // opts: { mode: 'quiz', num } or { mode: 'exam', part: 'I'|'II' }
    renderTopbar(root, trainee);
    const page = el('div', { class: 'page' });

    let questions, quizKey, quizLabel, backRoute, eyebrow, title, desc;

    if (opts.mode === 'quiz') {
      const m = moduleByNum(opts.num);
      questions = DATA.moduleQuizzes[String(opts.num)];
      quizKey = quizKeyForModule(opts.num);
      quizLabel = `Module ${String(opts.num).padStart(2, '0')} Review`;
      backRoute = { view: 'module', num: opts.num };
      eyebrow = `Module ${String(opts.num).padStart(2, '0')} Review`;
      title = 'Check Your Knowledge';
      desc = `Five questions on ${m.title}.`;
    } else {
      const isOne = opts.part === 'I';
      questions = isOne ? DATA.part1Exam : DATA.part2Exam;
      quizKey = isOne ? 'part1-exam' : 'part2-exam';
      quizLabel = isOne ? 'Part I Exam \u2014 The Sales Team' : 'Part II Exam \u2014 The Finance & Insurance Office';
      backRoute = { view: 'toc' };
      eyebrow = `Part ${opts.part} Exam`;
      title = isOne ? 'The Sales Team' : 'The Finance & Insurance Office';
      desc = '20 questions covering everything in this Part.';
    }

    const state = { answers: new Array(questions.length).fill(null), submitted: false };

    const header = el('div', { class: 'quiz-header' }, [
      el('div', { class: 'quiz-header__eyebrow' }, [eyebrow]),
      el('div', { class: 'quiz-header__title' }, [title]),
      el('div', { class: 'quiz-header__desc' }, [desc]),
    ]);
    page.appendChild(header);

    const progressBar = el('div', { class: 'quiz-progress' }, [el('div', { class: 'quiz-progress__bar', style: 'width:0%' })]);
    page.appendChild(progressBar);

    const questionsWrap = el('div', {});
    page.appendChild(questionsWrap);

    function updateProgress() {
      const answered = state.answers.filter((a) => a !== null).length;
      const pct = Math.round((answered / questions.length) * 100);
      progressBar.querySelector('.quiz-progress__bar').style.width = pct + '%';
    }

    function renderQuestions() {
      questionsWrap.innerHTML = '';
      questions.forEach((q, qIdx) => {
        const card = el('div', { class: 'question-card' });
        card.appendChild(el('div', { class: 'question-card__num' }, [`Question ${qIdx + 1} of ${questions.length}`]));
        card.appendChild(el('div', { class: 'question-card__text', html: renderInline(q.q) }));

        const list = el('div', { class: 'option-list' });
        const optionNodes = [];

        function classesFor(oIdx) {
          const isSelected = state.answers[qIdx] === oIdx;
          const isCorrectAnswer = oIdx === q.answer;
          let cls = 'option';
          if (state.submitted) {
            if (isCorrectAnswer) cls += ' correct';
            else if (isSelected && !isCorrectAnswer) cls += ' incorrect';
          } else if (isSelected) {
            cls += ' selected';
          }
          return cls;
        }

        q.options.forEach((opt, oIdx) => {
          const optionNode = el('label', { class: classesFor(oIdx) }, [
            el('span', { class: 'option__letter' }, [LETTERS[oIdx]]),
            el('span', { html: renderInline(opt) }),
          ]);

          if (!state.submitted) {
            optionNode.addEventListener('click', () => {
              state.answers[qIdx] = oIdx;
              updateProgress();
              // Update only this question's option classes in place —
              // no full re-render, so scroll position and other
              // questions' state stay untouched.
              optionNodes.forEach((node, i) => { node.className = classesFor(i); });
            });
          }
          optionNodes.push(optionNode);
          list.appendChild(optionNode);
        });
        card.appendChild(list);
        questionsWrap.appendChild(card);
      });
      updateProgress();
    }

    renderQuestions();

    const actions = el('div', { class: 'quiz-actions' });
    const submitBtn = el('button', { class: 'btn btn--primary' }, ['Submit Answers']);
    submitBtn.addEventListener('click', async () => {
      const unanswered =