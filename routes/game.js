const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');

// GET ALL ACTIVE GAME SCENARIOS WITH HAZARD COUNTS
router.get('/scenarios', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      s.id, 
      s.key_name, 
      s.title, 
      s.description, 
      s.zone_name, 
      s.time_limit, 
      s.max_score, 
      s.active,
      COUNT(h.id) as hazard_count
    FROM game_scenarios s
    LEFT JOIN hazards h ON s.id = h.scenario_id
    WHERE s.active = 1
    GROUP BY s.id
    ORDER BY s.id ASC
  `;

  db.all(query, [], (err, scenarios) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to load scenarios: ' + err.message });
    }
    res.json({ scenarios });
  });
});

// GET SCENARIO DETAILS AND HAZARDS (FOR 3D SCENE GENERATION)
router.get('/scenarios/:id', authenticateToken, (req, res) => {
  const scenarioId = req.params.id;

  db.get('SELECT * FROM game_scenarios WHERE id = ? AND active = 1', [scenarioId], (sErr, scenario) => {
    if (sErr || !scenario) {
      return res.status(404).json({ error: 'Scenario not found or inactive.' });
    }

    db.all('SELECT * FROM hazards WHERE scenario_id = ?', [scenarioId], (hErr, hazards) => {
      if (hErr) {
        return res.status(500).json({ error: 'Failed to load hazards: ' + hErr.message });
      }

      res.json({
        scenario,
        hazards
      });
    });
  });
});

// GET QUIZ QUESTIONS FOR A SCENARIO
router.get('/scenarios/:id/quiz', authenticateToken, (req, res) => {
  const scenarioId = req.params.id;

  db.all(
    'SELECT id, question_text, option_a, option_b, option_c, option_d FROM quiz_questions WHERE scenario_id = ?',
    [scenarioId],
    (err, questions) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to load quiz questions: ' + err.message });
      }
      res.json({ questions });
    }
  );
});

// SUBMIT HAZARD SPOT ATTEMPT
router.post('/hazard-spot', authenticateToken, (req, res) => {
  const { scenarioId, hazardId, selectedCategory, reactionTimeSec } = req.body;

  if (!scenarioId || !hazardId || !selectedCategory) {
    return res.status(400).json({ error: 'Missing required parameters for hazard verification.' });
  }

  db.get('SELECT * FROM hazards WHERE id = ? AND scenario_id = ?', [hazardId, scenarioId], (err, hazard) => {
    if (err || !hazard) {
      return res.status(404).json({ error: 'Target hazard not found in scenario.' });
    }

    const isCorrectCategory = (selectedCategory.trim().toLowerCase() === hazard.category.trim().toLowerCase());

    const scoreEarned = isCorrectCategory ? hazard.score_value : 0;
    const safetyBonusEarned = isCorrectCategory ? hazard.safety_bonus : 0;
    const totalPointsAwarded = scoreEarned + safetyBonusEarned;

    res.json({
      isCorrect: isCorrectCategory,
      scoreAwarded: totalPointsAwarded,
      hazardName: hazard.name,
      correctCategory: hazard.category,
      riskExplanation: hazard.risk_explanation,
      safetyRecommendation: hazard.safety_recommendation,
      reactionTimeSec: parseFloat(reactionTimeSec || 0).toFixed(2)
    });
  });
});

// SAVE COMPLETED GAME SESSION AND HAZARD ATTEMPTS
router.post('/session/complete', authenticateToken, (req, res) => {
  const {
    scenarioId,
    totalScore,
    maxScore,
    accuracyPercentage,
    hazardsFound,
    hazardsMissed,
    incorrectTries,
    avgReactionTimeSec,
    timeTakenSec,
    hazardSpotLogs,
    quizAnswers
  } = req.body;

  const userId = req.user.id;

  if (!scenarioId || totalScore === undefined) {
    return res.status(400).json({ error: 'Invalid game session payload.' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const stmtSession = db.prepare(`
      INSERT INTO game_sessions (
        user_id, scenario_id, total_score, max_score, accuracy_percentage,
        hazards_found, hazards_missed, incorrect_tries, avg_reaction_time_sec, time_taken_sec
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmtSession.run(
      [
        userId,
        scenarioId,
        totalScore,
        maxScore || 1000,
        parseFloat(accuracyPercentage || 0).toFixed(1),
        hazardsFound || 0,
        hazardsMissed || 0,
        incorrectTries || 0,
        parseFloat(avgReactionTimeSec || 0).toFixed(2),
        timeTakenSec || 0
      ],
      function (sErr) {
        if (sErr) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to record game session: ' + sErr.message });
        }

        const sessionId = this.lastID;

        // Record individual hazard attempts if provided
        if (Array.isArray(hazardSpotLogs) && hazardSpotLogs.length > 0) {
          const stmtHazard = db.prepare(`
            INSERT INTO hazard_attempts (session_id, hazard_id, is_correct, reaction_time_sec, selected_category)
            VALUES (?, ?, ?, ?, ?)
          `);

          for (const log of hazardSpotLogs) {
            stmtHazard.run([
              sessionId,
              log.hazardId,
              log.isCorrect ? 1 : 0,
              parseFloat(log.reactionTimeSec || 0).toFixed(2),
              log.selectedCategory || 'Unknown'
            ]);
          }
          stmtHazard.finalize();
        }

        // Process Quiz Answers if provided
        if (Array.isArray(quizAnswers) && quizAnswers.length > 0) {
          db.all('SELECT id, correct_option FROM quiz_questions WHERE scenario_id = ?', [scenarioId], (qErr, questions) => {
            if (!qErr && questions) {
              const qMap = {};
              questions.forEach(q => qMap[q.id] = q.correct_option);

              let quizScore = 0;
              const quizMaxScore = questions.length;

              quizAnswers.forEach(ans => {
                if (qMap[ans.questionId] && qMap[ans.questionId].toUpperCase() === (ans.selectedOption || '').toUpperCase()) {
                  quizScore += 1;
                }
              });

              const quizPct = ((quizScore / (quizMaxScore || 1)) * 100).toFixed(1);

              // Update session with quiz score
              db.run('UPDATE game_sessions SET quiz_score = ?, quiz_max_score = ? WHERE id = ?', [quizScore, quizMaxScore, sessionId]);

              // Record quiz attempt
              db.run(
                'INSERT INTO quiz_attempts (session_id, user_id, scenario_id, score, max_score, percentage) VALUES (?, ?, ?, ?, ?, ?)',
                [sessionId, userId, scenarioId, quizScore, quizMaxScore, quizPct]
              );
            }

            db.run('COMMIT', (cErr) => {
              if (cErr) return res.status(500).json({ error: 'Failed to commit transaction.' });
              res.status(201).json({
                message: 'Game session and results saved successfully!',
                sessionId,
                totalScore,
                accuracyPercentage
              });
            });
          });
        } else {
          db.run('COMMIT', (cErr) => {
            if (cErr) return res.status(500).json({ error: 'Failed to commit transaction.' });
            res.status(201).json({
              message: 'Game session saved successfully!',
              sessionId,
              totalScore,
              accuracyPercentage
            });
          });
        }
      }
    );

    stmtSession.finalize();
  });
});

// GET LOGGED-IN PLAYER'S HISTORY AND PERSONAL STATS
router.get('/history', authenticateToken, (req, res) => {
  const userId = req.user.id;

  const querySessions = `
    SELECT 
      gs.id as session_id,
      gs.scenario_id,
      sc.title as scenario_title,
      sc.zone_name,
      gs.total_score,
      gs.max_score,
      gs.accuracy_percentage,
      gs.hazards_found,
      gs.hazards_missed,
      gs.incorrect_tries,
      gs.avg_reaction_time_sec,
      gs.time_taken_sec,
      gs.quiz_score,
      gs.quiz_max_score,
      gs.completed_at
    FROM game_sessions gs
    JOIN game_scenarios sc ON gs.scenario_id = sc.id
    WHERE gs.user_id = ?
    ORDER BY gs.completed_at DESC
  `;

  db.all(querySessions, [userId], (err, sessions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }

    if (!sessions || sessions.length === 0) {
      return res.json({
        sessions: [],
        totalGamesPlayed: 0,
        highestScore: 0,
        averageScore: 0,
        totalHazardsFound: 0,
        completedScenariosCount: 0
      });
    }

    const totalGamesPlayed = sessions.length;
    const scores = sessions.map(s => s.total_score);
    const highestScore = Math.max(...scores);
    const averageScore = (scores.reduce((a, b) => a + b, 0) / totalGamesPlayed).toFixed(1);
    const totalHazardsFound = sessions.reduce((acc, s) => acc + s.hazards_found, 0);

    const completedScenariosSet = new Set(sessions.map(s => s.scenario_id));

    res.json({
      sessions,
      totalGamesPlayed,
      highestScore,
      averageScore,
      totalHazardsFound,
      completedScenariosCount: completedScenariosSet.size
    });
  });
});

module.exports = router;
