'use strict';

// =====================================================
// STATE
// =====================================================
const APP = {
  user: null,
  currentLesson: null,
  progress: {},   // { lessonId: { playCount, completed, lastAt } }
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
  showHome();
}

function logout() {
  APP.user = null;
  APP.progress = {};
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

  $('stat-completed').textContent = `${completed} / ${available.length}`;
  $('stat-plays').textContent     = `${totalPlays} 回`;

  // Recent list
  const practiced = available.filter(l => APP.progress[l.id]?.playCount > 0);
  const recentEl  = $('recent-lessons');
  if (practiced.length === 0) {
    recentEl.innerHTML = '<p class="no-data">まだ練習したレッスンはありません</p>';
  } else {
    recentEl.innerHTML = practiced.map(l => {
      const p = APP.progress[l.id];
      return `
        <div class="recent-item" onclick="openLesson(${l.id})">
          <span class="recent-emoji">${l.emoji}</span>
          <div class="recent-info">
            <span class="recent-title">${l.title}</span>
            <span class="recent-count">再生 ${p.playCount}回${p.completed ? ' ✓' : ''}</span>
          </div>
          <span class="recent-arrow">▶</span>
        </div>`;
    }).join('');
  }

  // Lesson progress bars
  const listEl = $('lesson-progress-list');
  listEl.innerHTML = available.map(l => {
    const p = APP.progress[l.id] || { playCount: 0, completed: false };
    const barW = p.completed ? 100 : Math.min(p.playCount * 25, 90);
    return `
      <div class="lesson-progress-item">
        <div class="lesson-progress-label">
          <span>${l.emoji} ${l.title}</span>
          <span>${p.completed ? '完了' : p.playCount > 0 ? `${p.playCount}回` : '未練習'}</span>
        </div>
        <div class="lesson-progress-bar">
          <div class="lesson-progress-bar-fill" style="width:${barW}%"></div>
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

  // Count how many have practiced (their progress data in localStorage)
  let activeCount = 0;
  const rows = students.map(student => {
    const raw     = localStorage.getItem(`progress_${student.id}`);
    const prog    = raw ? JSON.parse(raw) : {};
    const plays   = Object.values(prog).reduce((s, p) => s + (p.playCount || 0), 0);
    const done    = Object.values(prog).filter(p => p.completed).length;
    const avail   = LESSONS.filter(l => l.available).length;
    if (plays > 0) activeCount++;

    return `
      <div class="admin-row">
        <div class="admin-name">${student.name}</div>
        <div class="admin-id">@${student.id}</div>
        <div class="admin-stats">
          <span class="admin-stat">完了 ${done}/${avail}</span>
          <span class="admin-stat">再生 ${plays}回</span>
        </div>
      </div>`;
  });

  $('admin-active-students').textContent = activeCount;
  $('admin-student-list').innerHTML = rows.join('');
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
  const lid = APP.currentLesson.id;
  if (!APP.progress[lid]) APP.progress[lid] = { playCount: 0, completed: false };
  APP.progress[lid].playCount = PLAYER.playCount;
  APP.progress[lid].completed = true;
  APP.progress[lid].lastAt    = new Date().toISOString();
  saveProgress();

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
      showHome();
    } catch {
      sessionStorage.removeItem('currentUser');
      showScreen('screen-welcome');
    }
  } else {
    showScreen('screen-welcome');
  }

  // Keyboard shortcuts for login
  $('login-id').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-pw').focus(); });
  $('login-pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  // Pre-load voices (Chrome requires getVoices() call before they're available)
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
});
