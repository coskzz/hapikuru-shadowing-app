'use strict';

// =====================================================
// STATE
// =====================================================
const APP = {
  user: null,
  currentLesson: null,
  progress: {},   // { lessonId: { playCount, completed, lastAt, bestScore, wordsRead } }
  meta: { streak: 0, maxStreak: 0, lastStudyDate: '', totalWordsRead: 0, studyLog: {} },
};

const PLAYER = {
  isPlaying: false,
  speed: 1.0,
  mode: 'listen',     // 'listen' | 'silent'
  currentWordIndex: -1,
  words: [],          // [{ word, start, end }]
  utterance: null,
  fallbackTimer: null,
  boundaryFired: false,
  playCount: 0,
  textHidden: false,
};

// 発音チェック state
const PRON = {
  recognition:      null,
  isRecording:      false,
  isRunning:        false,
  lastScore:        null,
  words:            [],
  currentWordIndex: 0,
  speed:            1.0,
  fallbackTimer:    null,
  transcript:       '',
};

// =====================================================
// HELPERS
// =====================================================
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.style.display = 'none');
  $(id).style.display = 'flex';
}

function showError(elId, msg) {
  const el = $(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError(elId) {
  const el = $(elId);
  if (el) el.style.display = 'none';
}

// =====================================================
// AUTH
// =====================================================
function login() {
  const id = $('login-id').value.trim();
  const pw = $('login-pw').value.trim();

  if (!id || !pw) {
    showError('login-error', 'IDとパスワードを入力してください');
    return;
  }

  const user = MOCK_USERS.find(u => u.id === id && u.password === pw);
  if (!user) {
    showError('login-error', 'IDまたはパスワードが間違っています');
    return;
  }

  APP.user = user;
  sessionStorage.setItem('currentUser', JSON.stringify(user));
  loadProgress();
  loadMeta();
  showHome();
}

function signup() {
  const name = $('signup-name').value.trim();
  const id   = $('signup-id').value.trim();
  const pw   = $('signup-pw').value.trim();

  if (!name || !id || !pw) {
    showError('signup-error', 'すべての項目を入力してください');
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(id)) {
    showError('signup-error', 'IDは英字・数字・アンダースコアのみ使えます');
    return;
  }
  if (MOCK_USERS.find(u => u.id === id)) {
    showError('signup-error', 'このIDはすでに使われています');
    return;
  }
  if (pw.length < 4) {
    showError('signup-error', 'パスワードは4文字以上で入力してください');
    return;
  }

  const newUser = { id, password: pw, name, role: 'student' };
  MOCK_USERS.push(newUser);
  APP.user = newUser;
  sessionStorage.setItem('currentUser', JSON.stringify(newUser));
  loadProgress();
  loadMeta();
  showHome();
}

function logout() {
  APP.user = null;
  APP.progress = {};
  APP.meta = { streak: 0, maxStreak: 0, lastStudyDate: '', totalWordsRead: 0, studyLog: {} };
  sessionStorage.removeItem('currentUser');
  stopAllAudio();
  $('login-id').value = '';
  $('login-pw').value = '';
  hideError('login-error');
  showLoginForm();
  showScreen('screen-welcome');
}

function showLoginForm() {
  $('form-login').style.display  = 'flex';
  $('form-signup').style.display = 'none';
  hideError('login-error');
}

function showSignupForm() {
  $('form-login').style.display  = 'none';
  $('form-signup').style.display = 'flex';
  hideError('signup-error');
}

// =====================================================
// HOME SCREEN
// =====================================================
function showHome() {
  $('header-user-name').textContent = APP.user.name;

  // Admin tab
  $('tab-btn-admin').style.display = APP.user.role === 'admin' ? 'flex' : 'none';

  renderLessons();
  renderProgress();
  renderProfile();
  if (APP.user.role === 'admin') renderAdmin();

  showScreen('screen-home');
  showTab('lessons');
}

function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.style.display = 'none';
  });
  $(`tab-${tab}`).style.display = 'block';
}

// ---- Lessons Tab ----
function renderLessons() {
  $('lessons-grid').innerHTML = LESSONS.map(lesson => {
    const prog   = APP.progress[lesson.id] || { playCount: 0, completed: false };
    const locked = !lesson.available;

    return `
      <div class="lesson-card ${locked ? 'locked' : ''}"
           ${!locked ? `onclick="openLesson(${lesson.id})"` : 'role="listitem"'}>
        <div class="lesson-emoji">${lesson.emoji}</div>
        <div class="lesson-info">
          <div class="lesson-title">${lesson.title}</div>
          <div class="lesson-title-ja">${lesson.titleJa}</div>
          <div class="lesson-meta">
            <span class="level-badge">${lesson.level}</span>
            <span class="category-badge">${lesson.category}</span>
          </div>
          ${locked
            ? `<div class="coming-soon-label">🔒 近日公開</div>`
            : `<div class="lesson-stats">
                 <span class="play-count-badge">${prog.playCount > 0 ? `再生 ${prog.playCount}回` : '未練習'}</span>
                 ${prog.completed ? '<span class="completed-badge">✓ 完了</span>' : ''}
               </div>`
          }
        </div>
        ${!locked ? '<div class="lesson-arrow">▶</div>' : ''}
        ${!locked ? `<button class="btn-report-icon btn-report-lesson" onclick="event.stopPropagation();openReportModal('${lesson.title}')" title="このレッスンを報告">🚩</button>` : ''}
      </div>`;
  }).join('');
}

// ---- Stamp Card ----
function renderStampCard(meta, containerId) {
  const studyLog  = meta.studyLog  || {};
  const streak    = meta.streak    || 0;
  const maxStreak = meta.maxStreak || streak;
  const dayNames  = ['日', '月', '火', '水', '木', '金', '土'];
  const today     = new Date();

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  const stampsHTML = days.map((d, idx) => {
    const dateStr  = d.toISOString().split('T')[0];
    const isToday  = idx === 6;
    const studied  = !!studyLog[dateStr];
    const words    = studied ? studyLog[dateStr].wordsRead : null;
    const dayLabel = isToday ? '今日' : dayNames[d.getDay()];
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    return `
      <div class="stamp-day">
        <div class="stamp-day-name${isToday ? ' stamp-today' : ''}">${dayLabel}</div>
        <div class="stamp-day-date">${dateLabel}</div>
        <div class="stamp-circle${studied ? ' stamp-done' : ''}">
          ${studied ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
        </div>
        <div class="stamp-words">${words != null ? words : ''}</div>
      </div>`;
  }).join('');

  $(containerId).innerHTML = `
    <div class="streak-card">
      <div class="streak-card-top">
        <div>
          <div class="streak-card-title">🔥 連続学習日数</div>
          <div class="streak-card-sub">最高記録: ${maxStreak}日</div>
        </div>
        <div class="streak-count">${streak}<span class="streak-unit">日</span></div>
      </div>
      <div class="stamp-row">${stampsHTML}</div>
    </div>`;
}

// ---- Progress Tab ----
function renderProgress() {
  const available  = LESSONS.filter(l => l.available);
  const completed  = available.filter(l => APP.progress[l.id]?.completed).length;
  const totalPlays = Object.values(APP.progress).reduce((s, p) => s + (p.playCount || 0), 0);

  // ── スタンプカード ──
  renderStampCard(APP.meta, 'stamp-card-container');

  $('stat-words').textContent   = (APP.meta.totalWordsRead || 0).toLocaleString();

  // 全体進捗（モック：完了 / 全数）
  const overallPct = available.length > 0
    ? Math.round((completed / available.length) * 100)
    : 0;
  $('stat-overall').textContent      = `${overallPct}%`;
  $('stat-overall-note').textContent = '（サンプル2本のみ）';

  // サブ指標
  $('stat-completed').textContent = `${completed} / ${available.length}`;
  $('stat-plays').textContent     = `${totalPlays} 回`;

  // ── レッスン別成績 ──
  const listEl = $('lesson-scores-list');
  listEl.innerHTML = available.map(l => {
    const p = APP.progress[l.id] || { playCount: 0, completed: false };
    const score = p.bestScore != null ? `${p.bestScore}点` : '未受験';
    const scoreCls = p.bestScore == null ? 'score-none'
                   : p.bestScore >= 70   ? 'score-clear'
                   : 'score-try';
    return `
      <div class="lesson-score-row" onclick="openLesson(${l.id})">
        <div class="lesson-score-left">
          <span class="lesson-score-emoji">${l.emoji}</span>
          <div class="lesson-score-info">
            <div class="lesson-score-title">${l.title}</div>
            <div class="lesson-score-meta">${l.level} · ${l.category}　再生 ${p.playCount}回</div>
          </div>
        </div>
        <div class="lesson-score-right">
          <span class="lesson-score-badge ${scoreCls}">${score}</span>
          ${p.completed ? '<span class="lesson-done-badge">✓</span>' : ''}
        </div>
      </div>`;
  }).join('');
}

// ---- Profile Tab ----
function renderProfile() {
  $('profile-name').textContent     = APP.user.name;
  $('profile-id').textContent       = APP.user.id;
  const badge                       = $('profile-role-badge');
  badge.textContent                 = APP.user.role === 'admin' ? '👩‍🏫 講師' : '🎓 生徒';
  badge.className                   = `profile-role-badge ${APP.user.role}`;
  // Reset password display on each render
  $('profile-pw').textContent       = '●●●●●●';
  $('btn-pw-toggle').textContent    = '表示';
}

function toggleProfilePassword() {
  const pwEl  = $('profile-pw');
  const btnEl = $('btn-pw-toggle');
  if (btnEl.textContent === '表示') {
    pwEl.textContent  = APP.user.password;
    btnEl.textContent = '隠す';
  } else {
    pwEl.textContent  = '●●●●●●';
    btnEl.textContent = '表示';
  }
}

// ---- Admin Tab ----
function renderAdmin() {
  const students = MOCK_USERS.filter(u => u.role === 'student');
  $('admin-total-students').textContent = students.length;

  let activeCount = 0;
  const avail = LESSONS.filter(l => l.available).length;

  const rows = students.map(student => {
    const raw   = localStorage.getItem(`progress_${student.id}`);
    const prog  = raw ? JSON.parse(raw) : {};
    const meta  = JSON.parse(localStorage.getItem(`meta_${student.id}`) || '{}');
    const plays = Object.values(prog).reduce((s, p) => s + (p.playCount || 0), 0);
    const done  = Object.values(prog).filter(p => p.completed).length;
    const avg   = calcAvgBestScore(prog);
    const avgLabel = avg != null ? `平均 ${avg}点` : '未受験';
    const avgCls   = avg == null ? '' : avg >= 70 ? 'avg-clear' : 'avg-try';
    if (plays > 0) activeCount++;

    return `
      <div class="admin-row admin-row-clickable" onclick="openStudentDetail('${student.id}')">
        <div class="admin-row-top">
          <div>
            <span class="admin-name">${student.name}</span>
            <span class="admin-id">@${student.id}</span>
          </div>
          <span class="admin-avg-badge ${avgCls}">${avgLabel}</span>
        </div>
        <div class="admin-stats">
          <span class="admin-stat">完了 ${done}/${avail}</span>
          <span class="admin-stat">再生 ${plays}回</span>
          <span class="admin-stat">🔥 ${meta.streak || 0}日</span>
        </div>
        <div class="admin-chevron">›</div>
      </div>`;
  });

  $('admin-active-students').textContent = activeCount;
  $('admin-student-list').innerHTML = rows.join('');
}

// =====================================================
// 生徒詳細ポップアップ（管理画面）
// =====================================================
function openStudentDetail(studentId) {
  const student = MOCK_USERS.find(u => u.id === studentId);
  if (!student) return;

  const raw     = localStorage.getItem(`progress_${studentId}`);
  const prog    = raw ? JSON.parse(raw) : {};
  const meta    = JSON.parse(localStorage.getItem(`meta_${studentId}`) || '{}');
  const avail   = LESSONS.filter(l => l.available);
  const done    = avail.filter(l => prog[l.id]?.completed).length;
  const overall = avail.length > 0 ? Math.round((done / avail.length) * 100) : 0;

  $('detail-name').textContent    = student.name;
  $('detail-id').textContent      = `@${student.id}`;
  $('detail-streak').textContent  = meta.streak || 0;
  $('detail-words').textContent   = (meta.totalWordsRead || 0).toLocaleString();
  $('detail-overall').textContent = `${overall}%`;

  // レッスン別最高点数
  $('detail-lesson-scores').innerHTML = avail.map(l => {
    const p = prog[l.id] || {};
    const score   = p.bestScore != null ? `${p.bestScore}点` : '未受験';
    const scoreCls = p.bestScore == null ? 'score-none'
                   : p.bestScore >= 70   ? 'score-clear'
                   : 'score-try';
    return `
      <div class="detail-lesson-row">
        <span class="detail-lesson-emoji">${l.emoji}</span>
        <div class="detail-lesson-info">
          <span class="detail-lesson-title">${l.title}</span>
          <span class="detail-lesson-sub">${l.level} · 再生 ${p.playCount || 0}回</span>
        </div>
        <span class="detail-lesson-score ${scoreCls}">${score}</span>
      </div>`;
  }).join('');

  $('modal-student-detail').style.display = 'flex';
}

function closeStudentDetail() {
  $('modal-student-detail').style.display = 'none';
}

function handleStudentModalBg(e) {
  if (e.target === $('modal-student-detail')) closeStudentDetail();
}

// =====================================================
// PLAYER SCREEN
// =====================================================
function openLesson(lessonId) {
  const lesson = LESSONS.find(l => l.id === lessonId);
  if (!lesson || !lesson.available) return;

  APP.currentLesson = lesson;

  // Reset player state
  stopAllAudio();
  PLAYER.isPlaying       = false;
  PLAYER.currentWordIndex = -1;
  PLAYER.boundaryFired   = false;
  PLAYER.textHidden      = false;
  PLAYER.playCount       = APP.progress[lessonId]?.playCount || 0;

  // Update UI
  $('player-title').textContent    = lesson.title;
  $('player-level').textContent    = lesson.level;
  $('player-category').textContent = lesson.category;
  $('player-play-count').textContent = `再生回数: ${PLAYER.playCount}回`;

  // Setup karaoke text
  setupKaraokeText(lesson.text);

  // Speed buttons
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === PLAYER.speed);
  });

  // Reset controls
  setPlayIcon(false);
  updateProgressBar(0);
  setStatusDot(false);
  $('karaoke-hint').classList.remove('hidden');

  // Text toggle button
  $('text-toggle-btn').classList.remove('active');
  $('karaoke-text').classList.remove('text-hidden');

  // Reset Japanese translation
  $('ja-text').style.display = 'none';
  $('btn-ja-toggle').textContent = '🇯🇵 日本語訳を表示';
  $('btn-ja-toggle').classList.remove('active');

  // Sync mode buttons
  applyMode();

  // Set lesson name for report button
  const reportBtn = $('player-report-btn');
  if (reportBtn) reportBtn.onclick = () => openReportModal(lesson.title);

  showScreen('screen-player');
}

// ---- Mode ----
function applyMode() {
  $('player-tip').textContent = 'テキストを目で追いながら音声を聞きましょう';
}

// ---- Karaoke Text Setup ----
function setupKaraokeText(text) {
  PLAYER.words = [];

  // Parse words with character positions
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    PLAYER.words.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }

  // Build HTML: replace each word with a <span>, preserve whitespace
  let idx = 0;
  const html = text.replace(/\S+/g, () => {
    return `<span class="kword upcoming" data-idx="${idx++}"></span>`;
  });

  // Insert HTML then fill in word text (avoids XSS from lesson data)
  $('karaoke-text').innerHTML = html;
  document.querySelectorAll('.kword').forEach((span, i) => {
    span.textContent = PLAYER.words[i].word;
  });
}

// ---- Word Highlighting ----
function highlightWord(index) {
  if (index < 0 || index >= PLAYER.words.length) return;
  PLAYER.currentWordIndex = index;

  document.querySelectorAll('.kword').forEach((span, i) => {
    span.className = 'kword';
    if      (i < index)  span.classList.add('revealed');
    else if (i === index) span.classList.add('active');
    else                  span.classList.add('upcoming');
  });

  // Scroll active word to center of karaoke wrapper
  const activeSpan = document.querySelector('#karaoke-text .kword.active');
  if (activeSpan) {
    const wrapper = activeSpan.closest('.karaoke-wrapper');
    if (wrapper) {
      const spanTop    = activeSpan.offsetTop;
      const spanHeight = activeSpan.offsetHeight;
      const wrapperH   = wrapper.clientHeight;
      wrapper.scrollTo({ top: spanTop - wrapperH / 2 + spanHeight / 2, behavior: 'smooth' });
    }
  }

  updateProgressBar(index / Math.max(1, PLAYER.words.length - 1));
}

function revealAllWords() {
  document.querySelectorAll('.kword').forEach(span => {
    span.className = 'kword revealed';
  });
  updateProgressBar(1);
}

// ---- Progress & Status ----
function updateProgressBar(ratio) {
  $('progress-fill').style.width = `${Math.round(Math.min(ratio, 1) * 100)}%`;
}

function setStatusDot(playing) {
  const dot = $('player-status-indicator');
  dot.classList.toggle('playing', playing);
}

function setPlayIcon(playing) {
  $('play-btn').classList.toggle('playing', playing);
  $('icon-play').style.display  = playing ? 'none'  : 'block';
  $('icon-pause').style.display = playing ? 'block' : 'none';
}

// ---- Fallback Timer ----
function clearFallbackTimer() {
  if (PLAYER.fallbackTimer) {
    clearInterval(PLAYER.fallbackTimer);
    PLAYER.fallbackTimer = null;
  }
}

function startFallbackTimer(fromIndex) {
  clearFallbackTimer();
  let idx = fromIndex;
  // ~130 WPM natural English at 1.0×; adjusted per speed; slight buffer factor
  const msPerWord = Math.round((60 / (130 * PLAYER.speed)) * 1000 * 0.88);

  PLAYER.fallbackTimer = setInterval(() => {
    if (!PLAYER.isPlaying) { clearFallbackTimer(); return; }
    if (idx >= PLAYER.words.length) {
      clearFallbackTimer();
      onPlayerEnd();
      return;
    }
    highlightWord(idx++);
  }, msPerWord);
}

// ---- Audio Controls ----
function stopAllAudio() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  clearFallbackTimer();
  PLAYER.isPlaying = false;
  PLAYER.utterance = null;
}

function togglePlay() {
  if (PLAYER.isPlaying) {
    pausePlayer();
  } else {
    playPlayer();
  }
}

function playPlayer() {
  if (!APP.currentLesson) return;

  // Hide the hint message
  $('karaoke-hint').classList.add('hidden');

  // ── Web Speech API ──
  if (!window.speechSynthesis) {
    alert('このブラウザは音声機能（Web Speech API）に対応していません。\nChromeまたはSafariでお試しください。');
    return;
  }

  // If paused mid-utterance, resume
  if (window.speechSynthesis.paused && PLAYER.utterance) {
    window.speechSynthesis.resume();
    PLAYER.isPlaying = true;
    setPlayIcon(true);
    setStatusDot(true);
    startFallbackTimer(PLAYER.currentWordIndex + 1);
    return;
  }

  // Fresh play (or replay from beginning)
  stopAllAudio();

  const startIdx = PLAYER.currentWordIndex >= 0 ? PLAYER.currentWordIndex : 0;
  const textToSpeak = PLAYER.words.slice(startIdx).map(w => w.word).join(' ');

  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.lang  = 'en-US';
  utterance.rate  = PLAYER.speed;

  // Prefer a native-sounding English voice
  const voices = window.speechSynthesis.getVoices();
  const engVoice = voices.find(v => v.lang === 'en-US' && /Samantha|Alex|Karen|Victoria/i.test(v.name))
    || voices.find(v => v.lang === 'en-US')
    || voices.find(v => v.lang.startsWith('en'));
  if (engVoice) utterance.voice = engVoice;

  PLAYER.utterance    = utterance;
  PLAYER.isPlaying    = true;
  PLAYER.boundaryFired = false;

  setPlayIcon(true);
  setStatusDot(true);

  let wordOffset = startIdx;
  let relIdx     = 0;

  utterance.onboundary = (event) => {
    if (event.name !== 'word') return;
    PLAYER.boundaryFired = true;
    clearFallbackTimer();

    // Map charIndex to our word array (relative to sliced text)
    const ci = event.charIndex;
    let cumLen = 0;
    let found  = false;
    for (let i = 0; i < PLAYER.words.length - wordOffset; i++) {
      const wLen = PLAYER.words[wordOffset + i].word.length;
      if (ci >= cumLen && ci < cumLen + wLen) {
        relIdx = i;
        found  = true;
        break;
      }
      cumLen += wLen + 1; // +1 for space separator
    }
    if (found) highlightWord(wordOffset + relIdx);
  };

  utterance.onstart = () => {
    // Give boundary 400ms to fire; if not, fall back to timer
    setTimeout(() => {
      if (!PLAYER.boundaryFired && PLAYER.isPlaying) {
        startFallbackTimer(wordOffset + relIdx);
      }
    }, 400);
  };

  utterance.onend = () => {
    // Only treat as completion if we weren't manually cancelled
    if (PLAYER.isPlaying) {
      onPlayerEnd();
    }
  };

  utterance.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    // On error, fall back to visual-only timer
    if (PLAYER.isPlaying) {
      startFallbackTimer(wordOffset + relIdx);
    }
  };

  window.speechSynthesis.speak(utterance);
}

function pausePlayer() {
  if (PLAYER.mode === 'listen' && window.speechSynthesis) {
    window.speechSynthesis.pause();
  }
  clearFallbackTimer();
  PLAYER.isPlaying = false;
  setPlayIcon(false);
  setStatusDot(false);
}

function replayPlayer() {
  stopAllAudio();
  PLAYER.currentWordIndex = -1;
  PLAYER.isPlaying        = false;

  setPlayIcon(false);
  setStatusDot(false);
  updateProgressBar(0);

  // Reset all words to upcoming
  document.querySelectorAll('.kword').forEach(span => {
    span.className = 'kword upcoming';
  });

  $('karaoke-hint').classList.remove('hidden');
}

function setSpeed(speed) {
  PLAYER.speed = speed;
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
  });

  // If currently playing, restart from current position with new speed
  if (PLAYER.isPlaying) {
    const resumeIdx = Math.max(0, PLAYER.currentWordIndex - 1);
    stopAllAudio();
    PLAYER.currentWordIndex = resumeIdx;
    PLAYER.isPlaying = false;
    setTimeout(() => playPlayer(), 80);
  }
}

function toggleJaTranslation() {
  const jaEl  = $('ja-text');
  const btnEl = $('btn-ja-toggle');
  const shown = jaEl.style.display !== 'none';
  if (shown) {
    jaEl.style.display  = 'none';
    btnEl.textContent   = '🇯🇵 日本語訳を表示';
    btnEl.classList.remove('active');
  } else {
    const lesson = APP.currentLesson;
    jaEl.textContent  = lesson?.textJa || '（日本語訳は準備中です）';
    jaEl.style.display = 'block';
    btnEl.textContent  = '🇯🇵 日本語訳を隠す';
    btnEl.classList.add('active');
  }
}

function toggleTextVisibility() {
  PLAYER.textHidden = !PLAYER.textHidden;
  $('karaoke-text').classList.toggle('text-hidden', PLAYER.textHidden);
  $('text-toggle-btn').classList.toggle('active', PLAYER.textHidden);
  $('player-tip').textContent = PLAYER.textHidden
    ? '👂 音だけで練習しています（上級モード）'
    : 'テキストを目で追いながら音声を聞きましょう';
}

// ---- Player End ----
function onPlayerEnd() {
  clearFallbackTimer();
  PLAYER.isPlaying = false;
  setPlayIcon(false);
  setStatusDot(false);
  revealAllWords();

  // Increment play count
  PLAYER.playCount++;
  const lid        = APP.currentLesson.id;
  const wordCount  = getLessonWordCount(APP.currentLesson);
  if (!APP.progress[lid]) APP.progress[lid] = { playCount: 0, completed: false };
  APP.progress[lid].playCount  = PLAYER.playCount;
  APP.progress[lid].completed  = true;
  APP.progress[lid].lastAt     = new Date().toISOString();
  APP.progress[lid].wordsRead  = (APP.progress[lid].wordsRead || 0) + wordCount;
  saveProgress();

  // メタ更新（連続学習日数・総読み上げ語数）
  APP.meta.totalWordsRead = (APP.meta.totalWordsRead || 0) + wordCount;
  updateStreak(wordCount);
  saveMeta();

  $('player-play-count').textContent = `再生回数: ${PLAYER.playCount}回`;
  $('player-tip').textContent = '🎉 完了！';

  // シャドーイング完了後は完了画面へ
  setTimeout(() => showComplete(), 700);
}

function goBackFromPlayer() {
  stopAllAudio();
  PLAYER.isPlaying = false;
  showHome();
}

// =====================================================
// 発音チェック SCREEN
// =====================================================

// PRON state (extended)
// PRON.recognition, PRON.isRecording, PRON.lastScore already declared at top
// Additional runtime fields set per session:
//   PRON.words[], PRON.speed, PRON.fallbackTimer, PRON.isRunning, PRON.transcript

function openPronScreen() {
  const lesson = APP.currentLesson;
  if (!lesson) return;

  // Stop player if running
  stopAllAudio();

  // Init PRON session state
  PRON.lastScore    = null;
  PRON.isRecording  = false;
  PRON.isRunning    = false;
  PRON.speed        = PLAYER.speed;  // inherit current speed
  PRON.transcript   = '';
  if (PRON.recognition) { try { PRON.recognition.stop(); } catch {} PRON.recognition = null; }
  if (PRON.fallbackTimer) { clearTimeout(PRON.fallbackTimer); PRON.fallbackTimer = null; }

  // Setup UI
  $('pron-lesson-title').textContent = `${lesson.emoji} ${lesson.titleJa}`;
  setupPronKaraokeText(lesson.text);
  $('pron-score-area').style.display   = 'none';
  $('pron-action-row').style.display   = 'none';
  $('pron-start-row').style.display    = 'flex';
  $('pron-rec-status').textContent     = '';
  $('pron-tip').textContent            = '速度を選んでスタートを押してください';
  $('pron-icon-play').style.display    = 'block';
  $('pron-icon-pause').style.display   = 'none';
  $('pron-start-btn').classList.remove('playing');

  // Sync speed buttons
  document.querySelectorAll('#pron-speed-buttons .speed-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === PRON.speed);
  });

  showScreen('screen-pron');
}

function goBackFromPron() {
  stopPronSession();
  showScreen('screen-player');
}

function setPronSpeed(speed) {
  PRON.speed = speed;
  document.querySelectorAll('#pron-speed-buttons .speed-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
  });
}

// ---- Pron Karaoke Text ----
function setupPronKaraokeText(text) {
  PRON.words = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    PRON.words.push({ word: match[0] });
  }
  let idx = 0;
  const html = text.replace(/\S+/g, () => `<span class="kword upcoming" data-idx="${idx++}"></span>`);
  $('pron-karaoke-text').innerHTML = html;
  document.querySelectorAll('#pron-karaoke-text .kword').forEach((span, i) => {
    span.textContent = PRON.words[i].word;
  });
}

function pronHighlightWord(index) {
  if (index < 0 || index >= PRON.words.length) return;
  PRON.currentWordIndex = index;
  document.querySelectorAll('#pron-karaoke-text .kword').forEach((span, i) => {
    span.className = 'kword';
    if      (i < index)  span.classList.add('revealed');
    else if (i === index) span.classList.add('active');
    else                  span.classList.add('upcoming');
  });
  // Center scroll
  const activeSpan = document.querySelector('#pron-karaoke-text .kword.active');
  if (activeSpan) {
    const wrapper = activeSpan.closest('.karaoke-wrapper');
    if (wrapper) {
      wrapper.scrollTo({ top: activeSpan.offsetTop - wrapper.clientHeight / 2 + activeSpan.offsetHeight / 2, behavior: 'smooth' });
    }
  }
}

function pronRevealAll() {
  document.querySelectorAll('#pron-karaoke-text .kword').forEach(span => {
    span.className = 'kword revealed';
  });
}

// 音節数を概算（タイミング計算用）
function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 1;
  const m = w.match(/[aeiouy]+/g);
  let n = m ? m.length : 1;
  if (w.length > 2 && w.endsWith('e') && !/[aeiouy]e$/.test(w)) n = Math.max(1, n - 1);
  return Math.max(1, n);
}

// ---- Session Start / Stop ----
function startPronSession() {
  // トグル: 実行中なら途中停止して採点
  if (PRON.isRunning) {
    stopPronSessionAndScore();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasSpeechAPI = !!SpeechRecognition;

  PRON.isRunning        = true;
  PRON.currentWordIndex = 0;
  PRON.transcript       = '';

  $('pron-start-btn').classList.add('playing');
  $('pron-icon-play').style.display   = 'none';
  $('pron-icon-pause').style.display  = 'block';
  $('pron-score-area').style.display  = 'none';
  $('pron-action-row').style.display  = 'none';
  $('pron-tip').textContent           = '🔴 録音中 — テキストに合わせて読んでください（■で停止→採点）';
  $('pron-rec-status').textContent    = hasSpeechAPI ? '🎤 録音中…' : '⚠️ 音声認識非対応（スコアは0点になります）';

  // Start SpeechRecognition (continuous)
  if (hasSpeechAPI) {
    const recognition = new SpeechRecognition();
    recognition.lang           = 'en-US';
    recognition.continuous     = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    PRON.recognition = recognition;
    PRON.isRecording = true;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          PRON.transcript += ' ' + event.results[i][0].transcript;
        }
      }
    };
    recognition.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        $('pron-rec-status').textContent = `⚠️ 録音エラー: ${e.error}`;
      }
    };
    try { recognition.start(); } catch {}
  }

  // 音節数ベースの setTimeout 連鎖タイマー（自然なタイミング）
  // ~130WPM × 平均1.5音節 = ~195音節/分 → 1音節あたり ~308ms
  const msPerSyllable = (60000 / (195 * PRON.speed)) * 0.88;

  function scheduleNext(idx) {
    if (!PRON.isRunning) return;
    if (idx >= PRON.words.length) {
      onPronSessionEnd();
      return;
    }
    pronHighlightWord(idx);
    const syllables = countSyllables(PRON.words[idx].word);
    const delay     = Math.max(80, syllables * msPerSyllable);
    PRON.fallbackTimer = setTimeout(() => scheduleNext(idx + 1), delay);
  }
  scheduleNext(0);
}

function stopPronSession() {
  PRON.isRunning = false;
  if (PRON.fallbackTimer) { clearTimeout(PRON.fallbackTimer); PRON.fallbackTimer = null; }
  if (PRON.recognition)   { try { PRON.recognition.stop(); } catch {} PRON.recognition = null; }
  PRON.isRecording = false;
}

// 途中停止→採点
function stopPronSessionAndScore() {
  stopPronSession();
  pronRevealAll();
  $('pron-start-btn').classList.remove('playing');
  $('pron-icon-play').style.display  = 'block';
  $('pron-icon-pause').style.display = 'none';
  $('pron-rec-status').textContent   = '';
  setTimeout(() => {
    const score = calcSimilarity(APP.currentLesson?.text || '', PRON.transcript);
    PRON.lastScore = score;
    showPronScreenScore(score, PRON.transcript.trim());
    if (APP.currentLesson) {
      const lid = APP.currentLesson.id;
      if (!APP.progress[lid]) APP.progress[lid] = { playCount: 0, completed: false };
      const prev = APP.progress[lid].bestScore ?? -1;
      if (score > prev) { APP.progress[lid].bestScore = score; saveProgress(); }
    }
  }, 400);
}

function onPronSessionEnd() {
  PRON.isRunning = false;
  // Stop recognition and wait briefly for final results
  if (PRON.recognition) {
    try { PRON.recognition.stop(); } catch {}
    PRON.recognition = null;
  }
  PRON.isRecording = false;
  pronRevealAll();

  $('pron-start-btn').classList.remove('playing');
  $('pron-icon-play').style.display  = 'block';
  $('pron-icon-pause').style.display = 'none';
  $('pron-rec-status').textContent   = '';

  // Wait briefly for final speech results to arrive, then score
  setTimeout(() => {
    const score = calcSimilarity(APP.currentLesson?.text || '', PRON.transcript);
    PRON.lastScore = score;
    showPronScreenScore(score, PRON.transcript.trim());

    // Save best score
    if (APP.currentLesson) {
      const lid = APP.currentLesson.id;
      if (!APP.progress[lid]) APP.progress[lid] = { playCount: 0, completed: false };
      const prev = APP.progress[lid].bestScore ?? -1;
      if (score > prev) {
        APP.progress[lid].bestScore = score;
        saveProgress();
      }
    }
  }, 600);
}

function showPronScreenScore(score, transcript) {
  const isClear = score >= 85;
  $('pron-score-num').textContent   = score;
  $('pron-score-circle').className  = `score-circle${isClear ? ' clear' : ''}`;
  $('pron-score-label').textContent = isClear ? '🎉 クリア！ Great job!' : '😊 もう少し！ Try again!';
  $('pron-score-transcript').textContent = transcript ? `認識結果: "${transcript}"` : '（音声が認識されませんでした）';
  $('pron-score-area').style.display   = 'flex';
  $('pron-action-row').style.display   = 'flex';
  $('pron-tip').textContent            = isClear ? '✅ 85点以上でクリア！' : '前置詞・冠詞も含め全単語を発音してみよう';
}

function replayPron() {
  stopPronSession();
  const lesson = APP.currentLesson;
  if (!lesson) return;
  PRON.lastScore = null;
  PRON.transcript = '';
  setupPronKaraokeText(lesson.text);
  $('pron-score-area').style.display  = 'none';
  $('pron-action-row').style.display  = 'none';
  $('pron-start-btn').classList.remove('playing');
  $('pron-icon-play').style.display   = 'block';
  $('pron-icon-pause').style.display  = 'none';
  $('pron-rec-status').textContent    = '';
  $('pron-tip').textContent           = '速度を選んでスタートを押してください';
}

function proceedFromPron() {
  stopPronSession();
  showComplete();
}

// 発音チェックスコア計算（0〜100）
// 全単語を順序通りに発音できているかを評価。
// 前置詞・冠詞などの機能語も含め、順番に一致する単語の割合を点数とする。
// 飛ばした単語・ぼかした単語は認識されないため自動的に減点となる。
function calcSimilarity(target, spoken) {
  const clean = s => s.toLowerCase().replace(/[^a-z'\s]/g, '').trim().split(/\s+/).filter(Boolean);
  const tw = clean(target);
  const sw = clean(spoken);
  if (tw.length === 0) return 0;
  if (sw.length === 0) return 0;
  // 順序マッチング: target の各単語が spoken に順番に現れるか検査
  let si = 0, matched = 0;
  for (const word of tw) {
    while (si < sw.length && sw[si] !== word) si++;
    if (si < sw.length) { matched++; si++; }
  }
  return Math.round((matched / tw.length) * 100);
}

// =====================================================
// 報告・要望 MODAL
// =====================================================
function openReportModal(target) {
  const label = target || (APP.currentLesson ? APP.currentLesson.title : 'アプリ全般');
  $('report-target-label').textContent = `対象: ${label}`;
  $('report-category').value           = '機能・使い方の要望';
  $('report-body').value               = '';
  $('report-sent-msg').style.display   = 'none';
  $('report-actions').style.display    = 'flex';
  $('modal-report').style.display      = 'flex';
}

function closeReportModal() {
  $('modal-report').style.display = 'none';
}

function handleReportBg(e) {
  if (e.target === $('modal-report')) closeReportModal();
}

function submitReport() {
  const category = $('report-category').value;
  const body     = $('report-body').value.trim();
  if (!body) { $('report-body').focus(); return; }
  // Mock送信（本番ではFirestoreに保存）
  console.log('[Report]', { category, body, target: $('report-target-label').textContent, user: APP.user?.id });
  $('report-actions').style.display  = 'none';
  $('report-sent-msg').style.display = 'block';
  setTimeout(() => closeReportModal(), 1800);
}

// =====================================================
// COMPLETE SCREEN
// =====================================================
function showComplete() {
  $('complete-lesson-name').textContent = APP.currentLesson?.title || '';
  $('complete-play-count').textContent  = `${PLAYER.playCount}`;
  showScreen('screen-complete');
}

function replayFromComplete() {
  if (!APP.currentLesson) { showHome(); return; }
  openLesson(APP.currentLesson.id);
}

function goHomeFromComplete() {
  showHome();
}

// =====================================================
// PERSISTENCE
// =====================================================
function saveProgress() {
  if (!APP.user) return;
  localStorage.setItem(`progress_${APP.user.id}`, JSON.stringify(APP.progress));
}

function loadProgress() {
  if (!APP.user) return;
  const raw = localStorage.getItem(`progress_${APP.user.id}`);
  APP.progress = raw ? JSON.parse(raw) : {};
}

function saveMeta() {
  if (!APP.user) return;
  localStorage.setItem(`meta_${APP.user.id}`, JSON.stringify(APP.meta));
}

function loadMeta() {
  if (!APP.user) return;
  const raw = localStorage.getItem(`meta_${APP.user.id}`);
  const saved = raw ? JSON.parse(raw) : {};
  APP.meta = {
    streak: 0, maxStreak: 0, lastStudyDate: '', totalWordsRead: 0, studyLog: {},
    ...saved,
  };
}

// 連続学習日数の更新（wordsを渡すと当日の語数も記録）
function updateStreak(words = 0) {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (!APP.meta.studyLog) APP.meta.studyLog = {};
  // 当日の語数を累積記録
  if (!APP.meta.studyLog[today]) APP.meta.studyLog[today] = { wordsRead: 0 };
  APP.meta.studyLog[today].wordsRead += words;
  if (APP.meta.lastStudyDate === today) return; // ストリークは1日1回
  APP.meta.streak = APP.meta.lastStudyDate === yesterday
    ? (APP.meta.streak || 0) + 1
    : 1;
  APP.meta.maxStreak = Math.max(APP.meta.streak, APP.meta.maxStreak || 0);
  APP.meta.lastStudyDate = today;
}

// レッスンの語数を返す
function getLessonWordCount(lesson) {
  return lesson.text.split(/\s+/).filter(Boolean).length;
}

// 管理画面用：デモ用モックデータを初期投入（未設定の生徒のみ）
function seedMockStudentData() {
  const TODAY     = new Date().toISOString().split('T')[0];
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const D2 = new Date(Date.now() - 2*86400000).toISOString().split('T')[0];
  const D3 = new Date(Date.now() - 3*86400000).toISOString().split('T')[0];
  const D5 = new Date(Date.now() - 5*86400000).toISOString().split('T')[0];
  const seeds = {
    tanaka: {
      progress: { 1: { playCount: 3, completed: true, lastAt: TODAY,      bestScore: 85, wordsRead: 171 },
                  2: { playCount: 2, completed: true, lastAt: YESTERDAY,  bestScore: 62, wordsRead: 94  } },
      meta:     { streak: 5, maxStreak: 7, lastStudyDate: TODAY, totalWordsRead: 265,
                  studyLog: { [D5]: { wordsRead: 42 }, [D3]: { wordsRead: 57 }, [D2]: { wordsRead: 80 },
                              [YESTERDAY]: { wordsRead: 86 }, [TODAY]: { wordsRead: 94 } } },
    },
    sato: {
      progress: { 1: { playCount: 1, completed: true, lastAt: YESTERDAY,  bestScore: 72, wordsRead: 57  } },
      meta:     { streak: 2, maxStreak: 3, lastStudyDate: YESTERDAY, totalWordsRead: 57,
                  studyLog: { [D2]: { wordsRead: 57 }, [YESTERDAY]: { wordsRead: 57 } } },
    },
    yamada: {
      progress: {},
      meta:     { streak: 0, maxStreak: 0, lastStudyDate: '', totalWordsRead: 0, studyLog: {} },
    },
  };
  Object.entries(seeds).forEach(([id, data]) => {
    if (!localStorage.getItem(`progress_${id}`))
      localStorage.setItem(`progress_${id}`, JSON.stringify(data.progress));
    if (!localStorage.getItem(`meta_${id}`))
      localStorage.setItem(`meta_${id}`, JSON.stringify(data.meta));
  });
}

// 生徒の平均最高点を計算
function calcAvgBestScore(progress) {
  const scores = Object.values(progress).filter(p => p.bestScore != null).map(p => p.bestScore);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// =====================================================
// STARTUP
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  // Restore session
  const saved = sessionStorage.getItem('currentUser');
  if (saved) {
    try {
      APP.user = JSON.parse(saved);
      loadProgress();
      loadMeta();
      showHome();
    } catch {
      sessionStorage.removeItem('currentUser');
      showScreen('screen-welcome');
    }
  } else {
    showScreen('screen-welcome');
  }

  // 管理画面デモ用のモックデータを初期投入
  seedMockStudentData();

  // Keyboard shortcuts for login
  $('login-id').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-pw').focus(); });
  $('login-pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  // Pre-load voices (Chrome requires getVoices() call before they're available)
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
});
