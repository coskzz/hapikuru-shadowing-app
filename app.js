'use strict';

// =====================================================
// STATE
// =====================================================
const APP = {
  user: null,
  currentLesson: null,
  progress: {},   // { lessonId: { playCount, completed, lastAt, bestScore, wordsRead } }
  meta: { streak: 0, lastStudyDate: '', totalWordsRead: 0 },
};

const PLAYER = {
  isPlaying: false,
  speed: 0.75,
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
  recognition: null,
  isRecording: false,
  targetPhrase: '',
  lastScore: null,
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
  APP.meta = { streak: 0, lastStudyDate: '', totalWordsRead: 0 };
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
      </div>`;
  }).join('');
}

// ---- Progress Tab ----
function renderProgress() {
  const available  = LESSONS.filter(l => l.available);
  const completed  = available.filter(l => APP.progress[l.id]?.completed).length;
  const totalPlays = Object.values(APP.progress).reduce((s, p) => s + (p.playCount || 0), 0);

  // ── 3大指標 ──
  $('stat-streak').textContent  = APP.meta.streak || 0;
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

  // Sync mode buttons
  applyMode(PLAYER.mode);

  showScreen('screen-player');
}

// ---- Mode (listen / silent) ----
function setMode(mode) {
  PLAYER.mode = mode;
  if (PLAYER.isPlaying) {
    // Restart with new mode
    const idx = Math.max(0, PLAYER.currentWordIndex - 1);
    stopAllAudio();
    PLAYER.currentWordIndex = idx;
    PLAYER.isPlaying = false;
    setTimeout(() => playPlayer(), 80);
  }
  applyMode(mode);
}

function applyMode(mode) {
  $('mode-btn-listen').classList.toggle('active', mode === 'listen');
  $('mode-btn-silent').classList.toggle('active', mode === 'silent');

  const tipEl   = $('player-tip');
  const hintEl  = $('karaoke-hint');
  if (mode === 'silent') {
    tipEl.textContent = '🔇 音声なし：テキストに合わせて声に出して読みましょう';
    hintEl.querySelector('span:last-child').textContent = '下のボタンで練習スタート';
  } else {
    tipEl.textContent = 'テキストを目で追いながら音声を聞きましょう';
    hintEl.querySelector('span:last-child').textContent = '下のボタンで再生スタート';
  }
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

  // Scroll active word into view smoothly
  const activeSpan = document.querySelector('.kword.active');
  if (activeSpan) {
    activeSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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

  // ── サイレントモード: タイマーのみ ──
  if (PLAYER.mode === 'silent') {
    if (PLAYER.isPlaying) return;
    PLAYER.isPlaying = true;
    setPlayIcon(true);
    setStatusDot(true);
    const startIdx = Math.max(0, PLAYER.currentWordIndex < 0 ? 0 : PLAYER.currentWordIndex);
    startFallbackTimer(startIdx);
    return;
  }

  // ── リスニングモード: Web Speech API ──
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
  updateStreak();
  saveMeta();

  $('player-play-count').textContent = `再生回数: ${PLAYER.playCount}回`;
  $('player-tip').textContent = '🎉 完了！';

  // リスニングモード完了後に発音チェックを案内
  if (PLAYER.mode === 'listen') {
    setTimeout(() => openPronCheck(), 800);
  } else {
    // サイレントモードはそのまま完了画面へ
    setTimeout(() => showComplete(), 700);
  }
}

function goBackFromPlayer() {
  stopAllAudio();
  PLAYER.isPlaying = false;
  showHome();
}

// =====================================================
// 発音チェック (Pronunciation Check)
// =====================================================

// レッスンテキストから最初の1文を抽出
function extractFirstSentence(text) {
  const m = text.match(/[^.!?]+[.!?]/);
  return m ? m[0].trim() : text.split(' ').slice(0, 12).join(' ');
}

function openPronCheck() {
  const lesson = APP.currentLesson;
  if (!lesson) { showComplete(); return; }

  PRON.targetPhrase = extractFirstSentence(lesson.text);
  PRON.lastScore    = null;
  PRON.isRecording  = false;

  $('pron-phrase').textContent   = PRON.targetPhrase;
  $('pron-status').textContent   = '🎤 ボタンを押して録音スタート';
  $('score-display').style.display = 'none';
  $('btn-pron-next').style.display = 'none';
  $('btn-record').classList.remove('recording');
  $('record-icon').textContent  = '🎤';
  $('record-label').textContent = '録音する';

  $('modal-pron').style.display = 'flex';
}

function closePronModal() {
  $('modal-pron').style.display = 'none';
  stopRecording();
}

function handleModalBgClick(e) {
  if (e.target === $('modal-pron')) closePronModal();
}

function toggleRecording() {
  if (PRON.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $('pron-status').textContent = '⚠️ お使いのブラウザは音声認識に対応していません（Chrome推奨）';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang             = 'en-US';
  recognition.interimResults   = false;
  recognition.maxAlternatives  = 1;
  PRON.recognition             = recognition;
  PRON.isRecording             = true;

  $('btn-record').classList.add('recording');
  $('record-icon').textContent  = '⏹';
  $('record-label').textContent = '録音中...';
  $('pron-status').textContent  = '🔴 録音中 — 読み終わったら自動で判定します';
  $('score-display').style.display  = 'none';
  $('btn-pron-next').style.display  = 'none';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const score = calcSimilarity(PRON.targetPhrase, transcript);
    PRON.lastScore = score;
    showPronScore(score, transcript);
  };

  recognition.onerror = (e) => {
    $('pron-status').textContent = `⚠️ エラー: ${e.error}`;
    resetRecordBtn();
    PRON.isRecording = false;
  };

  recognition.onend = () => {
    resetRecordBtn();
    PRON.isRecording = false;
  };

  recognition.start();
}

function stopRecording() {
  if (PRON.recognition) {
    try { PRON.recognition.stop(); } catch {}
    PRON.recognition = null;
  }
  PRON.isRecording = false;
  resetRecordBtn();
}

function resetRecordBtn() {
  $('btn-record').classList.remove('recording');
  $('record-icon').textContent  = '🎤';
  $('record-label').textContent = '録音する';
}

// 単語一致率でスコア計算（0〜100）
function calcSimilarity(target, spoken) {
  const clean = s => s.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).filter(Boolean);
  const tw = clean(target);
  const sw = clean(spoken);
  if (tw.length === 0) return 0;
  const matched = tw.filter(w => sw.includes(w)).length;
  return Math.round((matched / tw.length) * 100);
}

function showPronScore(score, transcript) {
  const isClear  = score >= 70;
  const circle   = $('score-circle');
  const numEl    = $('score-num');
  const labelEl  = $('score-label');
  const transEl  = $('score-transcript');
  const nextBtn  = $('btn-pron-next');

  numEl.textContent   = score;
  circle.className    = `score-circle${isClear ? ' clear' : ''}`;
  labelEl.textContent = isClear ? '🎉 クリア！ Great job!' : '😊 もう少し！ Try again!';
  transEl.textContent = `認識結果: "${transcript}"`;

  $('score-display').style.display = 'flex';
  nextBtn.style.display            = 'inline-flex';
  $('pron-status').textContent     = isClear
    ? '✅ 70点以上でクリアです！'
    : '再チャレンジするか「次へ」で進めます';
}

function skipPronCheck() {
  closePronModal();
  showComplete();
}

function proceedAfterPron() {
  // 発音チェックの最高点を保存
  if (PRON.lastScore !== null && APP.currentLesson) {
    const lid = APP.currentLesson.id;
    if (!APP.progress[lid]) APP.progress[lid] = { playCount: 0, completed: false };
    const prev = APP.progress[lid].bestScore ?? -1;
    if (PRON.lastScore > prev) {
      APP.progress[lid].bestScore = PRON.lastScore;
      saveProgress();
    }
  }
  closePronModal();
  showComplete();
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
  APP.meta = raw ? JSON.parse(raw) : { streak: 0, lastStudyDate: '', totalWordsRead: 0 };
}

// 連続学習日数の更新
function updateStreak() {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (APP.meta.lastStudyDate === today) return; // 今日は既にカウント済み
  APP.meta.streak = APP.meta.lastStudyDate === yesterday
    ? (APP.meta.streak || 0) + 1
    : 1;
  APP.meta.lastStudyDate = today;
  saveMeta();
}

// レッスンの語数を返す
function getLessonWordCount(lesson) {
  return lesson.text.split(/\s+/).filter(Boolean).length;
}

// 管理画面用：デモ用モックデータを初期投入（未設定の生徒のみ）
function seedMockStudentData() {
  const TODAY     = new Date().toISOString().split('T')[0];
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const seeds = {
    tanaka: {
      progress: { 1: { playCount: 3, completed: true, lastAt: TODAY,      bestScore: 85, wordsRead: 171 },
                  2: { playCount: 2, completed: true, lastAt: YESTERDAY,  bestScore: 62, wordsRead: 94  } },
      meta:     { streak: 5, lastStudyDate: TODAY,      totalWordsRead: 265 },
    },
    sato: {
      progress: { 1: { playCount: 1, completed: true, lastAt: YESTERDAY,  bestScore: 72, wordsRead: 57  } },
      meta:     { streak: 2, lastStudyDate: YESTERDAY,  totalWordsRead: 57  },
    },
    yamada: {
      progress: {},
      meta:     { streak: 0, lastStudyDate: '', totalWordsRead: 0 },
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
