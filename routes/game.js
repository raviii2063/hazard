const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');

// GET ALL ACTIVE GAME SCENARIOS WITH HAZARD COUNTS
router.get('/scenarios', authenticateToken, async (req, res) => {
  try {
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

    const scenarios = await db.all(query);
    res.json({ scenarios });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load scenarios: ' + err.message });
  }
});

// GET SCENARIO DETAILS AND HAZARDS (FOR 3D SCENE GENERATION)
router.get('/scenarios/:id', authenticateToken, async (req, res) => {
  try {
    const scenarioId = req.params.id;
    const scenario = await db.get('SELECT * FROM game_scenarios WHERE id = ? AND active = 1', [scenarioId]);

    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found or inactive.' });
    }

    const hazards = await db.all('SELECT * FROM hazards WHERE scenario_id = ?', [scenarioId]);

    res.json({
      scenario,
      hazards
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load scenario: ' + err.message });
  }
});

// GET QUIZ QUESTIONS FOR A SCENARIO
router.get('/scenarios/:id/quiz', authenticateToken, async (req, res) => {
  try {
    const scenarioId = req.params.id;
    const questions = await db.all(
      'SELECT id, question_text, option_a, option_b, option_c, option_d FROM quiz_questions WHERE scenario_id = ?',
      [scenarioId]
    );
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load quiz questions: ' + err.message });
  }
});

// SUBMIT HAZARD SPOT ATTEMPT
router.post('/hazard-spot', authenticateToken, async (req, res) => {
  try {
    const { scenarioId, hazardId, selectedCategory, reactionTimeSec } = req.body;

    if (!scenarioId || !hazardId || !selectedCategory) {
      return res.status(400).json({ error: 'Missing required parameters for hazard verification.' });
    }

    const hazard = await db.get('SELECT * FROM hazards WHERE id = ? AND scenario_id = ?', [hazardId, scenarioId]);
    if (!hazard) {
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
  } catch (err) {
    res.status(500).json({ error: 'Hazard spot verification error: ' + err.message });
  }
});

// SAVE COMPLETED GAME SESSION AND HAZARD ATTEMPTS
router.post('/session/complete', authenticateToken, async (req, res) => {
  try {
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

    const sRes = await db.run(`
      INSERT INTO game_sessions (
        user_id, scenario_id, total_score, max_score, accuracy_percentage,
        hazards_found, hazards_missed, incorrect_tries, avg_reaction_time_sec, time_taken_sec
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      scenarioId,
      totalScore,
      maxScore || 100,
      parseFloat(accuracyPercentage || 0).toFixed(1),
      hazardsFound || 0,
      hazardsMissed || 0,
      incorrectTries || 0,
      parseFloat(avgReactionTimeSec || 0).toFixed(2),
      timeTakenSec || 0
    ]);

    const sessionId = sRes.lastID;

    // Record individual hazard attempts if provided
    if (Array.isArray(hazardSpotLogs) && hazardSpotLogs.length > 0) {
      const hazardStmts = hazardSpotLogs.map(log => ({
        sql: `INSERT INTO hazard_attempts (session_id, hazard_id, is_correct, reaction_time_sec, selected_category) VALUES (?, ?, ?, ?, ?)`,
        args: [
          sessionId,
          log.hazardId,
          log.isCorrect ? 1 : 0,
          parseFloat(log.reactionTimeSec || 0).toFixed(2),
          log.selectedCategory || 'Unknown'
        ]
      }));
      await db.batch(hazardStmts);
    }

    // Process Quiz Answers if provided
    if (Array.isArray(quizAnswers) && quizAnswers.length > 0) {
      const questions = await db.all('SELECT id, correct_option FROM quiz_questions WHERE scenario_id = ?', [scenarioId]);
      if (questions && questions.length > 0) {
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

        await db.run('UPDATE game_sessions SET quiz_score = ?, quiz_max_score = ? WHERE id = ?', [quizScore, quizMaxScore, sessionId]);
        await db.run(
          'INSERT INTO quiz_attempts (session_id, user_id, scenario_id, score, max_score, percentage) VALUES (?, ?, ?, ?, ?, ?)',
          [sessionId, userId, scenarioId, quizScore, quizMaxScore, quizPct]
        );
      }
    }

    res.status(201).json({
      message: 'Game session and results saved successfully!',
      sessionId,
      totalScore,
      accuracyPercentage
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record game session: ' + err.message });
  }
});

// GET LOGGED-IN PLAYER'S HISTORY AND PERSONAL STATS
router.get('/history', authenticateToken, async (req, res) => {
  try {
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

    const sessions = await db.all(querySessions, [userId]);

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
    const scores = sessions.map(s => Number(s.total_score));
    const highestScore = Math.max(...scores);
    const averageScore = (scores.reduce((a, b) => a + b, 0) / totalGamesPlayed).toFixed(1);
    const totalHazardsFound = sessions.reduce((acc, s) => acc + Number(s.hazards_found), 0);

    const completedScenariosSet = new Set(sessions.map(s => s.scenario_id));

    res.json({
      sessions,
      totalGamesPlayed,
      highestScore,
      averageScore,
      totalHazardsFound,
      completedScenariosCount: completedScenariosSet.size
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;
