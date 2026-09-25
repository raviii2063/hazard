/**
 * MAIN WAREHOUSE HAZARD HUNT SIMULATOR APPLICATION ENGINE
 * Max Score 100 Scale, Smooth Continuous Controls Flow,
 * Educational Missed Hazards Revelation & Easy Quizzes.
 */

(function () {
  'use strict';

  const API_BASE = '/api';
  let authToken = localStorage.getItem('hz_token') || null;
  let currentUser = JSON.parse(localStorage.getItem('hz_user')) || null;

  // 3D Game State Variables
  let threeScene, threeCamera, threeRenderer;
  let animationFrameId = null;
  let activeScenario = null;
  let activeHazards = [];
  let gameTimer = 120;
  let timerInterval = null;
  let currentScore = 0;
  let hazardsFoundCount = 0;
  let incorrectTriesCount = 0;
  let scenarioStartTime = 0;
  let hazardSpotLogs = [];
  let userQuizAnswers = [];
  let isGameActive = false;

  /* =========================================================================
     1. REST API HELPER
     ========================================================================= */
  async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, opts);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server error occurred.');
      }
      return data;
    } catch (err) {
      throw err;
    }
  }

  function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span>${message}</span>
      </div>
      <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    if (duration > 0) setTimeout(() => toast.remove(), duration);
  }

  /* =========================================================================
     2. NAVIGATION & UI CONTROLLER
     ========================================================================= */
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    window.scrollTo(0, 0);

    if (screenId !== 'screen-game' && isGameActive) {
      stopGameSession();
    }
  }

  function updateNavUI() {
    const userBadge = document.getElementById('user-badge');
    const nameElem = document.getElementById('user-display-name');
    const roleElem = userBadge ? userBadge.querySelector('.user-role') : null;

    const btnAuth = document.getElementById('btn-nav-auth');
    const btnDash = document.getElementById('btn-nav-dashboard');
    const btnAdmin = document.getElementById('btn-nav-admin');
    const btnLogout = document.getElementById('btn-nav-logout');

    if (currentUser) {
      if (roleElem) {
        roleElem.textContent = currentUser.role.toUpperCase();
        roleElem.className = 'user-role ' + (currentUser.role === 'admin' ? 'role-admin' : 'role-player');
      }
      if (nameElem) nameElem.textContent = currentUser.full_name || currentUser.username;

      if (btnAuth) btnAuth.style.display = 'none';
      if (btnDash) btnDash.style.display = 'inline-flex';
      if (btnLogout) btnLogout.style.display = 'inline-flex';

      if (btnAdmin) {
        btnAdmin.style.display = (currentUser.role === 'admin') ? 'inline-flex' : 'none';
      }
    } else {
      if (roleElem) {
        roleElem.textContent = 'GUEST';
        roleElem.className = 'user-role role-guest';
      }
      if (nameElem) nameElem.textContent = 'Not Logged In';

      if (btnAuth) btnAuth.style.display = 'inline-flex';
      if (btnDash) btnDash.style.display = 'none';
      if (btnAdmin) btnAdmin.style.display = 'none';
      if (btnLogout) btnLogout.style.display = 'none';
    }
  }

  /* =========================================================================
     3. AUTHENTICATION & PORTALS
     ========================================================================= */
  function openAuthModal(defaultTab = 'login') {
    const modal = document.getElementById('modal-auth');
    if (!modal) return;
    modal.classList.add('active');

    const tabLogin = document.getElementById('auth-tab-login');
    const tabAdminLogin = document.getElementById('auth-tab-admin-login');
    const tabReg = document.getElementById('auth-tab-register');

    const formLogin = document.getElementById('form-login');
    const formAdminLogin = document.getElementById('form-admin-login');
    const formReg = document.getElementById('form-register');
    const alertElem = document.getElementById('auth-alert');

    if (alertElem) alertElem.style.display = 'none';

    [tabLogin, tabAdminLogin, tabReg].forEach(t => t?.classList.remove('active'));
    [formLogin, formAdminLogin, formReg].forEach(f => f?.classList.remove('active'));

    if (defaultTab === 'admin') {
      tabAdminLogin?.classList.add('active');
      formAdminLogin?.classList.add('active');
    } else if (defaultTab === 'register') {
      tabReg?.classList.add('active');
      formReg?.classList.add('active');
    } else {
      tabLogin?.classList.add('active');
      formLogin?.classList.add('active');
    }
  }

  function closeAuthModal() {
    const modal = document.getElementById('modal-auth');
    if (modal) modal.classList.remove('active');
  }

  async function handleLoginSubmit(e, isAdminForm = false) {
    e.preventDefault();
    const usernameInput = document.getElementById(isAdminForm ? 'admin-login-username' : 'login-username').value;
    const passwordInput = document.getElementById(isAdminForm ? 'admin-login-password' : 'login-password').value;
    const alertElem = document.getElementById('auth-alert');

    try {
      const data = await apiCall('/auth/login', 'POST', {
        username: usernameInput,
        password: passwordInput
      });

      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('hz_token', authToken);
      localStorage.setItem('hz_user', JSON.stringify(currentUser));

      updateNavUI();
      closeAuthModal();

      if (currentUser.role === 'admin') {
        showToast(`Welcome back, Safety Administrator ${currentUser.full_name || currentUser.username}!`, 'success');
        loadAdminDashboard();
        showScreen('screen-admin');
      } else {
        showToast(`Welcome to Player Portal, ${currentUser.full_name || currentUser.username}!`, 'success');
        loadPlayerDashboard();
        showScreen('screen-dashboard');
      }
    } catch (err) {
      if (alertElem) {
        alertElem.textContent = err.message;
        alertElem.style.display = 'block';
      }
    }
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    const fullName = document.getElementById('reg-fullname').value;
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const alertElem = document.getElementById('auth-alert');

    if (password !== confirmPassword) {
      if (alertElem) {
        alertElem.textContent = 'Passwords do not match.';
        alertElem.style.display = 'block';
      }
      return;
    }

    try {
      const data = await apiCall('/auth/register', 'POST', {
        full_name: fullName,
        username,
        email,
        password
      });

      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('hz_token', authToken);
      localStorage.setItem('hz_user', JSON.stringify(currentUser));

      updateNavUI();
      closeAuthModal();
      showToast('Player account registered successfully!', 'success');

      loadPlayerDashboard();
      showScreen('screen-dashboard');
    } catch (err) {
      if (alertElem) {
        alertElem.textContent = err.message;
        alertElem.style.display = 'block';
      }
    }
  }

  function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('hz_token');
    localStorage.removeItem('hz_user');

    updateNavUI();
    showToast('Logged out successfully.', 'success');
    showScreen('screen-intro');
  }

  /* =========================================================================
     4. PLAYER DASHBOARD & SCENARIOS
     ========================================================================= */
  async function loadPlayerDashboard() {
    if (!currentUser) return openAuthModal('login');

    const welcomeElem = document.getElementById('dash-welcome-text');
    if (welcomeElem) {
      welcomeElem.textContent = `Welcome, ${currentUser.full_name || currentUser.username}`;
    }

    try {
      const historyData = await apiCall('/game/history');
      
      document.getElementById('dash-stat-high').textContent = `${historyData.highestScore || 0} / 100`;
      document.getElementById('dash-stat-avg').textContent = `${historyData.averageScore || '0.0'} / 100`;
      document.getElementById('dash-stat-hazards').textContent = historyData.totalHazardsFound || 0;
      document.getElementById('dash-stat-games').textContent = historyData.totalGamesPlayed || 0;

      const tbody = document.getElementById('dash-recent-tbody');
      if (tbody) {
        if (!historyData.sessions || historyData.sessions.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="text-center">No previous training attempts recorded.</td></tr>`;
        } else {
          tbody.innerHTML = historyData.sessions.slice(0, 5).map(s => `
            <tr>
              <td>${new Date(s.completed_at).toLocaleString()}</td>
              <td><strong>${s.scenario_title}</strong></td>
              <td style="color: var(--accent-yellow); font-weight: 700;">${s.total_score} / 100 Pts</td>
              <td>${s.accuracy_percentage}%</td>
              <td>${s.hazards_found}</td>
              <td>${s.avg_reaction_time_sec}s</td>
              <td>${s.quiz_score}/${s.quiz_max_score}</td>
            </tr>
          `).join('');
        }
      }

      const scenariosData = await apiCall('/game/scenarios');
      renderScenariosGrid(scenariosData.scenarios);
    } catch (err) {
      showToast('Error loading dashboard: ' + err.message, 'error');
    }
  }

  function renderScenariosGrid(scenarios) {
    const container = document.getElementById('scenarios-container');
    if (!container) return;

    if (!scenarios || scenarios.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted);">No active training scenarios available.</p>`;
      return;
    }

    container.innerHTML = scenarios.map(s => `
      <div class="scenario-card">
        <div>
          <div class="scenario-meta">
            <span class="badge-tag yellow-tag">${s.zone_name}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">⏱️ ${s.time_limit}s</span>
          </div>
          <h3 class="scenario-title">${s.title}</h3>
          <p class="scenario-desc">${s.description}</p>
        </div>

        <div>
          <div class="scenario-stats-row">
            <span>⚠️ <strong>${s.hazard_count} Hazards</strong></span>
            <span>⭐ <strong>Max 100 Pts</strong></span>
          </div>
          <button class="btn btn-primary btn-start-scenario" data-id="${s.id}" style="width: 100%;">
            Start Scenario Training
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-start-scenario').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const scenarioId = e.currentTarget.getAttribute('data-id');
        initiateScenarioGame(scenarioId);
      });
    });
  }

  /* =========================================================================
     5. 3D GAMEPLAY ENGINE & CONTINUOUS CONTROLS LOOP
     ========================================================================= */
  async function initiateScenarioGame(scenarioId) {
    if (!currentUser) return openAuthModal('login');

    try {
      const data = await apiCall(`/game/scenarios/${scenarioId}`);
      activeScenario = data.scenario;
      activeHazards = data.hazards;

      currentScore = 0;
      hazardsFoundCount = 0;
      incorrectTriesCount = 0;
      gameTimer = activeScenario.time_limit || 120;
      hazardSpotLogs = [];
      userQuizAnswers = [];
      scenarioStartTime = Date.now();

      document.getElementById('hud-scenario-title').textContent = activeScenario.title;
      document.getElementById('hud-timer-val').textContent = `${gameTimer}s`;
      document.getElementById('hud-score-val').textContent = '0';
      document.getElementById('hud-found-val').textContent = `0 / ${activeHazards.length}`;

      initThreeEngine();

      window.WarehouseSceneBuilder.buildWarehouseEnvironment(threeScene);
      window.ScenarioBuilder.loadScenarioHazards(threeScene, activeHazards);

      const canvas = document.getElementById('three-canvas');
      window.PlayerControls.initControls(threeCamera, threeScene, canvas);

      showScreen('screen-game');
      isGameActive = true;

      // Hide start overlay banner automatically
      const banner = document.getElementById('pointerlock-banner');
      if (banner) banner.style.display = 'none';

      startTimerCountdown();
      animate3DLoop();

      showToast(`Started: ${activeScenario.title}. Drag touchpad or move mouse to look 360°!`, 'success');
    } catch (err) {
      showToast('Failed to start scenario: ' + err.message, 'error');
    }
  }

  function initThreeEngine() {
    const canvas = document.getElementById('three-canvas');
    if (!canvas) return;

    const width = canvas.parentElement.clientWidth;
    const height = canvas.parentElement.clientHeight;

    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x090d16);

    threeCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

    threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    threeRenderer.setSize(width, height);
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
    const canvas = document.getElementById('three-canvas');
    if (!canvas || !threeRenderer || !threeCamera) return;

    const width = canvas.parentElement.clientWidth;
    const height = canvas.parentElement.clientHeight;

    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(width, height);
  }

  function animate3DLoop() {
    if (!isGameActive) return;

    animationFrameId = requestAnimationFrame(animate3DLoop);

    const delta = 0.016;
    window.PlayerControls.update(delta);

    threeRenderer.render(threeScene, threeCamera);
  }

  function startTimerCountdown() {
    if (timerInterval) clearInterval(timerInterval);

    const timerElem = document.getElementById('hud-timer-val');

    timerInterval = setInterval(() => {
      gameTimer--;
      if (timerElem) {
        timerElem.textContent = `${gameTimer}s`;
        if (gameTimer <= 30) {
          timerElem.className = 'hud-val timer-warn';
          window.PlayerControls.playSound('tick');
        } else {
          timerElem.className = 'hud-val timer-normal';
        }
      }

      if (gameTimer <= 0) {
        clearInterval(timerInterval);
        showToast('Time expired! Revealing missed hazards & safety quiz...', 'info');
        finishGameplayPhase();
      }
    }, 1000);
  }

  function stopGameSession() {
    isGameActive = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (timerInterval) clearInterval(timerInterval);
    window.PlayerControls.releasePointerLock();
  }

  /* =========================================================================
     6. HAZARD SPOTTING INTERACTION & CONTINUOUS FLOW
     ========================================================================= */
  function handleGlobalKeyDown(e) {
    if (isGameActive && (e.code === 'KeyE' || e.key === 'e' || e.key === 'E')) {
      triggerHazardSpotModal();
    }
  }

  function triggerHazardSpotModal() {
    const targeted = window.PlayerControls.getTargetedHazard();
    if (!targeted) {
      showToast('Aim crosshair near a glowing yellow hazard first!', 'info', 2500);
      return;
    }

    if (window.ScenarioBuilder.isHazardSolved(targeted.hazardId)) {
      showToast('You have already identified and cleared this hazard!', 'info');
      return;
    }

    window.PlayerControls.releasePointerLock();

    const modal = document.getElementById('modal-hazard-spot');
    const title = document.getElementById('spot-modal-title');
    if (title) title.textContent = `Identify: ${targeted.hazardName}`;
    if (modal) modal.classList.add('active');
  }

  async function handleHazardSpotConfirm(e) {
    e.preventDefault();
    const modal = document.getElementById('modal-hazard-spot');
    if (modal) modal.classList.remove('active');

    const targeted = window.PlayerControls.getTargetedHazard();
    if (!targeted) return;

    const selectedRadio = document.querySelector('input[name="hazard_category"]:checked');
    if (!selectedRadio) return;

    const selectedCategory = selectedRadio.value;
    const reactionTimeSec = ((Date.now() - scenarioStartTime) / 1000).toFixed(2);

    try {
      const result = await apiCall('/game/hazard-spot', 'POST', {
        scenarioId: activeScenario.id,
        hazardId: targeted.hazardId,
        selectedCategory,
        reactionTimeSec
      });

      hazardSpotLogs.push({
        hazardId: targeted.hazardId,
        hazardName: result.hazardName,
        selectedCategory,
        isCorrect: result.isCorrect,
        reactionTimeSec: result.reactionTimeSec,
        scoreAwarded: result.scoreAwarded
      });

      if (result.isCorrect) {
        currentScore += result.scoreAwarded;
        hazardsFoundCount++;

        window.PlayerControls.playSound('correct');
        window.ScenarioBuilder.markHazardAsSolved(threeScene, targeted.hazardId);

        document.getElementById('hud-score-val').textContent = currentScore;
        document.getElementById('hud-found-val').textContent = `${hazardsFoundCount} / ${activeHazards.length}`;

        openSpotFeedbackModal(true, result);

        if (hazardsFoundCount >= activeHazards.length) {
          setTimeout(() => {
            window.PlayerControls.playSound('victory');
            showToast('All hazards identified! Proceeding to safety quiz...', 'success');
            finishGameplayPhase();
          }, 1500);
        }
      } else {
        incorrectTriesCount++;
        window.PlayerControls.playSound('wrong');
        openSpotFeedbackModal(false, result);
      }
    } catch (err) {
      showToast('Hazard evaluation failed: ' + err.message, 'error');
    }
  }

  function openSpotFeedbackModal(isCorrect, result) {
    const modal = document.getElementById('modal-spot-feedback');
    if (!modal) return;

    document.getElementById('fb-icon').textContent = isCorrect ? '✅' : '❌';
    document.getElementById('fb-title').textContent = isCorrect ? 'Correct Hazard Spotting!' : 'Incorrect Category Choice';
    
    const tag = document.getElementById('fb-score-tag');
    tag.textContent = isCorrect ? `+${result.scoreAwarded} POINTS AWARDED` : '0 POINTS AWARDED';
    tag.className = 'badge-tag ' + (isCorrect ? 'green-tag' : 'red-tag');

    document.getElementById('fb-explanation').textContent = result.riskExplanation || 'Observe workplace safety rules.';
    document.getElementById('fb-recommendation').textContent = result.safetyRecommendation || 'Maintain clear walkways and safe equipment operating distance.';

    modal.classList.add('active');
  }

  // CONTINUOUS FLOW: AUTO RESUME GAMEPLAY AFTER CLOSING FEEDBACK MODAL
  function resumeContinuousGameplay() {
    const modal = document.getElementById('modal-spot-feedback');
    if (modal) modal.classList.remove('active');

    // Ensure pointerlock banner stays hidden so player doesn't have to click to enable again
    const banner = document.getElementById('pointerlock-banner');
    if (banner) banner.style.display = 'none';
  }

  /* =========================================================================
     7. POST-SCENARIO SAFETY QUIZ ENGINE
     ========================================================================= */
  async function finishGameplayPhase() {
    stopGameSession();

    try {
      const data = await apiCall(`/game/scenarios/${activeScenario.id}/quiz`);
      renderSafetyQuiz(data.questions);
      showScreen('screen-quiz');
    } catch (err) {
      showToast('Error loading quiz: ' + err.message, 'error');
      saveAndDisplayFinalResults([]);
    }
  }

  function renderSafetyQuiz(questions) {
    const container = document.getElementById('quiz-container');
    if (!container) return;

    if (!questions || questions.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted);">No quiz questions for this scenario.</p>`;
      return;
    }

    container.innerHTML = questions.map((q, idx) => `
      <div class="quiz-card" data-qid="${q.id}">
        <div class="quiz-q-num">QUESTION ${idx + 1} OF ${questions.length}</div>
        <div class="quiz-q-text">${q.question_text}</div>

        <div class="quiz-options-grid">
          <button class="quiz-opt-btn" data-qid="${q.id}" data-opt="A">
            <span class="opt-letter">A</span> <span>${q.option_a}</span>
          </button>
          <button class="quiz-opt-btn" data-qid="${q.id}" data-opt="B">
            <span class="opt-letter">B</span> <span>${q.option_b}</span>
          </button>
          <button class="quiz-opt-btn" data-qid="${q.id}" data-opt="C">
            <span class="opt-letter">C</span> <span>${q.option_c}</span>
          </button>
          <button class="quiz-opt-btn" data-qid="${q.id}" data-opt="D">
            <span class="opt-letter">D</span> <span>${q.option_d}</span>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.quiz-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = parseInt(btn.getAttribute('data-qid'), 10);
        const opt = btn.getAttribute('data-opt');

        const parent = btn.closest('.quiz-card');
        parent.querySelectorAll('.quiz-opt-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        const existingIdx = userQuizAnswers.findIndex(a => a.questionId === qId);
        if (existingIdx >= 0) {
          userQuizAnswers[existingIdx].selectedOption = opt;
        } else {
          userQuizAnswers.push({ questionId: qId, selectedOption: opt });
        }
      });
    });
  }

  async function handleQuizSubmit() {
    saveAndDisplayFinalResults(userQuizAnswers);
  }

  /* =========================================================================
     8. RESULTS CALCULATOR & MISSED HAZARDS EDUCATIONAL REVEAL
     ========================================================================= */
  async function saveAndDisplayFinalResults(quizAnswersList) {
    const totalHazards = activeHazards.length || 1;
    const accuracyPct = parseFloat(((hazardsFoundCount / totalHazards) * 100).toFixed(1));
    const timeTakenSec = Math.round((Date.now() - scenarioStartTime) / 1000);

    const avgReactionTimeSec = hazardSpotLogs.length > 0
      ? (hazardSpotLogs.reduce((acc, l) => acc + parseFloat(l.reactionTimeSec), 0) / hazardSpotLogs.length).toFixed(2)
      : '0.00';

    // Cap total score at 100 max
    const finalDisplayScore = Math.min(100, currentScore);

    const payload = {
      scenarioId: activeScenario.id,
      totalScore: finalDisplayScore,
      maxScore: 100,
      accuracyPercentage: accuracyPct,
      hazardsFound: hazardsFoundCount,
      hazardsMissed: totalHazards - hazardsFoundCount,
      incorrectTries: incorrectTriesCount,
      avgReactionTimeSec: parseFloat(avgReactionTimeSec),
      timeTakenSec,
      hazardSpotLogs,
      quizAnswers: quizAnswersList
    };

    try {
      const response = await apiCall('/game/session/complete', 'POST', payload);
      
      const dbStatus = document.getElementById('db-save-status');
      if (dbStatus) dbStatus.textContent = `✅ Results Saved to SQLite (Session #${response.sessionId})`;

      document.getElementById('res-score-num').textContent = finalDisplayScore;
      document.getElementById('res-score-max').textContent = 'OUT OF 100';
      document.getElementById('res-scenario-name').textContent = `${activeScenario.title} Breakdown`;

      document.getElementById('res-val-accuracy').textContent = `${accuracyPct}%`;
      document.getElementById('res-val-found').textContent = `${hazardsFoundCount} / ${totalHazards}`;
      document.getElementById('res-val-reaction').textContent = `${avgReactionTimeSec}s`;
      document.getElementById('res-val-quiz').textContent = `${userQuizAnswers.length} Submitted`;

      const badge = document.getElementById('res-rating-badge');
      const desc = document.getElementById('res-feedback-desc');

      if (accuracyPct >= 80) {
        badge.textContent = 'EXCELLENT — MASTER SAFETY INSPECTOR';
        badge.className = 'rating-badge green-tag';
        desc.textContent = 'Outstanding hazard perception! You spotted workplace risks quickly and correctly.';
      } else if (accuracyPct >= 50) {
        badge.textContent = 'PASS — SAFETY CONSCIOUS';
        badge.className = 'rating-badge yellow-tag';
        desc.textContent = 'Good workplace safety awareness. Review the missed hazards reveal box below to improve your safety knowledge.';
      } else {
        badge.textContent = 'NEEDS IMPROVEMENT — REVIEW MISSED HAZARDS';
        badge.className = 'rating-badge red-tag';
        desc.textContent = 'Several critical workplace hazards were missed. Read the correct answers below to build your safety knowledge!';
      }

      // Populate Hazards Breakdown Table
      const spotLogMap = {};
      hazardSpotLogs.forEach(l => spotLogMap[l.hazardId] = l);

      const tbody = document.getElementById('res-hazards-tbody');
      if (tbody) {
        tbody.innerHTML = activeHazards.map(h => {
          const log = spotLogMap[h.id];
          const isFound = log && log.isCorrect;
          return `
            <tr>
              <td><strong>${h.name}</strong></td>
              <td>${h.category}</td>
              <td>
                <span class="badge-tag ${isFound ? 'green-tag' : 'red-tag'}">
                  ${isFound ? 'FOUND (' + log.reactionTimeSec + 's)' : 'MISSED / UNFOUND'}
                </span>
              </td>
              <td style="color: var(--accent-yellow); font-weight: 700;">${isFound ? h.score_value + h.safety_bonus : 0} Pts</td>
              <td style="font-size: 0.82rem; color: var(--text-muted);">${h.safety_recommendation}</td>
            </tr>
          `;
        }).join('');
      }

      // REVEAL MISSED HAZARDS EDUCATIONAL KNOWLEDGE BOX
      const missedContainer = document.getElementById('res-missed-hazards-box');
      const missedList = activeHazards.filter(h => !spotLogMap[h.id] || !spotLogMap[h.id].isCorrect);

      if (missedContainer) {
        if (missedList.length === 0) {
          missedContainer.innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid var(--accent-green); padding: 1rem; border-radius: 8px; text-align: center; color: var(--accent-green); font-weight: 700;">
              🎉 Perfect Score! You spotted every single workplace hazard in this scenario!
            </div>
          `;
        } else {
          missedContainer.innerHTML = `
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid var(--accent-yellow); padding: 1.25rem; border-radius: 10px; margin-top: 1.5rem;">
              <h4 style="color: var(--accent-yellow); font-size: 1.1rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 8px;">
                💡 Educational Reveal: Correct Answers for ${missedList.length} Missed Hazard(s)
              </h4>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                Review the details below to learn where these hazards were located and what the correct safety action should be:
              </p>
              
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${missedList.map(h => `
                  <div style="background: rgba(15, 23, 42, 0.8); border-left: 4px solid var(--accent-orange); padding: 1rem; border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <strong style="color: #fff; font-size: 0.95rem;">⚠️ ${h.name}</strong>
                      <span class="badge-tag yellow-tag" style="margin:0;">Category: ${h.category}</span>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px;"><strong>Location in Scene:</strong> Coordinates (X: ${h.pos_x}, Z: ${h.pos_z})</p>
                    <p style="font-size: 0.85rem; color: #fca5a5; margin-bottom: 4px;"><strong>Why it is Dangerous:</strong> ${h.risk_explanation}</p>
                    <p style="font-size: 0.85rem; color: #34d399;"><strong>Correct Safety Action:</strong> ${h.safety_recommendation}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }

      showScreen('screen-results');
    } catch (err) {
      showToast('Error saving results: ' + err.message, 'error');
      showScreen('screen-results');
    }
  }

  /* =========================================================================
     9. ADMIN PORTAL
     ========================================================================= */
  async function loadAdminDashboard() {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Admin privileges required.', 'error');
      return showScreen('screen-dashboard');
    }

    try {
      const statsData = await apiCall('/admin/stats');
      const stats = statsData.stats;

      document.getElementById('adm-stat-players').textContent = stats.totalPlayers || 0;
      document.getElementById('adm-stat-sessions').textContent = stats.totalSessions || 0;
      document.getElementById('adm-stat-avg-score').textContent = `${stats.avgScore || '0.0'} / 100`;
      document.getElementById('adm-stat-accuracy').textContent = `${stats.avgAccuracy || 0}%`;
      document.getElementById('adm-stat-reaction').textContent = `${stats.avgReactionTime || 0}s`;

      renderAdminCharts(stats);
      loadAdminPlayersTable();
    } catch (err) {
      showToast('Failed to load admin stats: ' + err.message, 'error');
    }
  }

  function renderAdminCharts(stats) {
    const canvasAcc = document.getElementById('chart-accuracy');
    if (canvasAcc) {
      const ctx = canvasAcc.getContext('2d');
      ctx.clearRect(0, 0, canvasAcc.width, canvasAcc.height);

      ctx.fillStyle = '#f59e0b';
      ctx.font = '14px sans-serif';
      ctx.fillText(`Class Avg Accuracy: ${stats.avgAccuracy}%`, 20, 30);

      const barHeight = Math.min(120, (parseFloat(stats.avgAccuracy) / 100) * 120);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(50, 160 - barHeight, 60, barHeight);

      ctx.fillStyle = '#ef4444';
      const failHeight = 120 - barHeight;
      ctx.fillRect(150, 160 - failHeight, 60, failHeight);

      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Passed', 60, 180);
      ctx.fillText('Missed', 160, 180);
    }
  }

  async function loadAdminPlayersTable(searchQuery = '') {
    try {
      const data = await apiCall(`/admin/players?search=${encodeURIComponent(searchQuery)}`);
      const tbody = document.getElementById('adm-players-tbody');

      if (!tbody) return;

      if (!data.players || data.players.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center">No registered players found.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.players.map(p => `
        <tr>
          <td>${p.id}</td>
          <td><strong>${p.full_name || p.username}</strong></td>
          <td>${p.username}</td>
          <td>${p.email}</td>
          <td>${new Date(p.created_at).toLocaleDateString()}</td>
          <td>${p.total_sessions || 0}</td>
          <td style="color: var(--accent-yellow); font-weight: 700;">${p.best_score || 0} / 100</td>
          <td>${p.avg_accuracy || 0}%</td>
          <td>${p.avg_reaction_time || 0}s</td>
          <td>
            <button class="btn btn-secondary btn-del-player" data-id="${p.id}" style="padding: 2px 8px; font-size: 0.75rem; color: #fca5a5;">
              Delete
            </button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-del-player').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const playerId = e.currentTarget.getAttribute('data-id');
          if (confirm('Are you sure you want to delete this player account and all associated game history?')) {
            try {
              await apiCall(`/admin/players/${playerId}`, 'DELETE');
              showToast('Player deleted.', 'success');
              loadAdminPlayersTable();
            } catch (err) {
              showToast('Delete failed: ' + err.message, 'error');
            }
          }
        });
      });
    } catch (err) {
      showToast('Error loading players: ' + err.message, 'error');
    }
  }

  async function loadAdminSessionsLog() {
    try {
      const data = await apiCall('/admin/sessions');
      const tbody = document.getElementById('adm-sessions-tbody');
      if (!tbody) return;

      if (!data.sessions || data.sessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center">No game sessions logged yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.sessions.map(s => `
        <tr>
          <td>#${s.session_id}</td>
          <td><strong>${s.full_name || s.username}</strong></td>
          <td>${s.scenario_title}</td>
          <td style="color: var(--accent-yellow); font-weight: 700;">${s.total_score} / 100 Pts</td>
          <td>${s.accuracy_percentage}%</td>
          <td>${s.hazards_found}</td>
          <td>${s.avg_reaction_time_sec}s</td>
          <td>${s.quiz_score}/${s.quiz_max_score}</td>
          <td>${new Date(s.completed_at).toLocaleString()}</td>
        </tr>
      `).join('');
    } catch (err) {
      showToast('Error loading sessions log: ' + err.message, 'error');
    }
  }

  /* =========================================================================
     10. EVENT LISTENERS
     ========================================================================= */
  function initEventListeners() {
    document.addEventListener('keydown', handleGlobalKeyDown);

    document.getElementById('btn-touch-spot')?.addEventListener('click', () => {
      triggerHazardSpotModal();
    });

    document.getElementById('btn-enter-player-portal')?.addEventListener('click', () => {
      if (currentUser) {
        loadPlayerDashboard();
        showScreen('screen-dashboard');
      } else {
        openAuthModal('login');
      }
    });

    document.getElementById('btn-enter-admin-portal')?.addEventListener('click', () => {
      if (currentUser && currentUser.role === 'admin') {
        loadAdminDashboard();
        showScreen('screen-admin');
      } else {
        openAuthModal('admin');
      }
    });

    const navLogo = document.getElementById('nav-logo-link');
    if (navLogo) {
      navLogo.addEventListener('click', () => {
        if (currentUser) {
          loadPlayerDashboard();
          showScreen('screen-dashboard');
        } else {
          showScreen('screen-intro');
        }
      });
    }

    document.getElementById('btn-nav-auth')?.addEventListener('click', () => openAuthModal('login'));
    document.getElementById('btn-nav-dashboard')?.addEventListener('click', () => {
      loadPlayerDashboard();
      showScreen('screen-dashboard');
    });
    document.getElementById('btn-nav-admin')?.addEventListener('click', () => {
      if (currentUser && currentUser.role === 'admin') {
        loadAdminDashboard();
        showScreen('screen-admin');
      } else {
        openAuthModal('admin');
      }
    });
    document.getElementById('btn-nav-logout')?.addEventListener('click', handleLogout);

    document.getElementById('btn-intro-rules')?.addEventListener('click', () => showScreen('screen-rules'));
    document.getElementById('btn-rules-back')?.addEventListener('click', () => showScreen('screen-intro'));
    document.getElementById('btn-rules-start-now')?.addEventListener('click', () => {
      if (currentUser) {
        loadPlayerDashboard();
        showScreen('screen-dashboard');
      } else {
        openAuthModal('login');
      }
    });

    document.getElementById('auth-tab-login')?.addEventListener('click', () => openAuthModal('login'));
    document.getElementById('auth-tab-admin-login')?.addEventListener('click', () => openAuthModal('admin'));
    document.getElementById('auth-tab-register')?.addEventListener('click', () => openAuthModal('register'));

    document.getElementById('modal-auth-close')?.addEventListener('click', closeAuthModal);

    document.getElementById('form-login')?.addEventListener('submit', (e) => handleLoginSubmit(e, false));
    document.getElementById('form-admin-login')?.addEventListener('submit', (e) => handleLoginSubmit(e, true));
    document.getElementById('form-register')?.addEventListener('submit', handleRegisterSubmit);

    document.getElementById('form-hazard-spot')?.addEventListener('submit', handleHazardSpotConfirm);
    document.getElementById('btn-spot-cancel')?.addEventListener('click', () => {
      document.getElementById('modal-hazard-spot')?.classList.remove('active');
    });

    // CONTINUE CONTINUOUS GAMEPLAY AUTOMATICALLY WHEN CLOSING FEEDBACK MODAL
    document.getElementById('btn-fb-continue')?.addEventListener('click', resumeContinuousGameplay);

    document.getElementById('btn-quiz-submit')?.addEventListener('click', handleQuizSubmit);

    document.getElementById('btn-res-replay')?.addEventListener('click', () => {
      if (activeScenario) initiateScenarioGame(activeScenario.id);
    });
    document.getElementById('btn-res-dashboard')?.addEventListener('click', () => {
      loadPlayerDashboard();
      showScreen('screen-dashboard');
    });

    document.getElementById('btn-game-pause')?.addEventListener('click', () => {
      window.PlayerControls.releasePointerLock();
      document.getElementById('modal-pause')?.classList.add('active');
    });
    document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
      document.getElementById('modal-pause')?.classList.remove('active');
    });
    document.getElementById('btn-pause-quit')?.addEventListener('click', () => {
      document.getElementById('modal-pause')?.classList.remove('active');
      stopGameSession();
      loadPlayerDashboard();
      showScreen('screen-dashboard');
    });

    document.getElementById('sensitivity-slider')?.addEventListener('input', (e) => {
      window.PlayerControls.setSensitivity(parseFloat(e.target.value));
    });

    document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
      const isMuted = window.PlayerControls.toggleSound();
      document.getElementById('sound-icon-on').style.display = isMuted ? 'none' : 'block';
      document.getElementById('sound-icon-off').style.display = isMuted ? 'block' : 'none';
      showToast(isMuted ? 'Sound muted.' : 'Sound unmuted.', 'info');
    });

    document.getElementById('tab-btn-players')?.addEventListener('click', (e) => {
      switchAdminTab('tab-view-players', e.target);
      loadAdminPlayersTable();
    });
    document.getElementById('tab-btn-sessions')?.addEventListener('click', (e) => {
      switchAdminTab('tab-view-sessions', e.target);
      loadAdminSessionsLog();
    });
    document.getElementById('btn-admin-close')?.addEventListener('click', () => {
      if (currentUser) {
        loadPlayerDashboard();
        showScreen('screen-dashboard');
      } else {
        showScreen('screen-intro');
      }
    });

    document.getElementById('admin-search-players')?.addEventListener('input', (e) => {
      loadAdminPlayersTable(e.target.value);
    });
  }

  function switchAdminTab(viewId, activeBtn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(v => v.classList.remove('active'));

    if (activeBtn) activeBtn.classList.add('active');
    document.getElementById(viewId)?.classList.add('active');
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateNavUI();
    initEventListeners();

    if (currentUser) {
      if (currentUser.role === 'admin') {
        loadAdminDashboard();
        showScreen('screen-admin');
      } else {
        loadPlayerDashboard();
        showScreen('screen-dashboard');
      }
    } else {
      showScreen('screen-intro');
    }
  });

})();
