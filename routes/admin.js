const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');

// Middleware: Require Admin Role
function requireAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    next();
  });
}

// 1. GET ADMIN OVERVIEW DASHBOARD STATS
router.get('/stats', requireAdmin, (req, res) => {
  const stats = {};

  db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'player'`, (e1, r1) => {
    if (e1) return res.status(500).json({ error: e1.message });
    stats.totalPlayers = r1.count;

    db.get(`
      SELECT 
        COUNT(*) as totalSessions, 
        AVG(total_score) as avgScore,
        AVG(accuracy_percentage) as avgAccuracy,
        AVG(avg_reaction_time_sec) as avgReactionTime,
        SUM(hazards_found) as totalHazardsSpotted
      FROM game_sessions
    `, (e2, r2) => {
      if (e2) return res.status(500).json({ error: e2.message });
      stats.totalSessions = r2.totalSessions || 0;
      stats.avgScore = r2.avgScore ? r2.avgScore.toFixed(1) : '0.0';
      stats.avgAccuracy = r2.avgAccuracy ? r2.avgAccuracy.toFixed(1) : '0.0';
      stats.avgReactionTime = r2.avgReactionTime ? r2.avgReactionTime.toFixed(2) : '0.00';
      stats.totalHazardsSpotted = r2.totalHazardsSpotted || 0;

      db.get(`SELECT COUNT(*) as passCount FROM game_sessions WHERE accuracy_percentage >= 50`, (e3, r3) => {
        if (e3) return res.status(500).json({ error: e3.message });
        stats.passRate = stats.totalSessions > 0
          ? ((r3.passCount / stats.totalSessions) * 100).toFixed(1)
          : '0.0';

        db.get(`SELECT MAX(total_score) as highestScore, MIN(total_score) as lowestScore FROM game_sessions`, (e4, r4) => {
          if (e4) return res.status(500).json({ error: e4.message });
          stats.highestScore = r4.highestScore || 0;
          stats.lowestScore = r4.lowestScore || 0;

          res.json({ stats });
        });
      });
    });
  });
});

// 2. GET ALL REGISTERED PLAYERS LIST WITH PERFORMANCE METRICS
router.get('/players', requireAdmin, (req, res) => {
  const searchParam = req.query.search ? `%${req.query.search.trim()}%` : '%';

  const query = `
    SELECT 
      u.id, 
      u.username, 
      u.full_name,
      u.email, 
      u.role, 
      u.created_at,
      COUNT(gs.id) as total_sessions,
      MAX(gs.total_score) as best_score,
      ROUND(AVG(gs.total_score), 1) as avg_score,
      ROUND(AVG(gs.accuracy_percentage), 1) as avg_accuracy,
      ROUND(AVG(gs.avg_reaction_time_sec), 2) as avg_reaction_time
    FROM users u
    LEFT JOIN game_sessions gs ON u.id = gs.user_id
    WHERE u.role = 'player' AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `;

  db.all(query, [searchParam, searchParam, searchParam], (err, players) => {
    if (err) {
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    res.json({ players });
  });
});

// 3. GET INDIVIDUAL PLAYER PROFILE DETAILS AND SESSIONS HISTORY
router.get('/players/:id', requireAdmin, (req, res) => {
  const playerId = req.params.id;

  db.get('SELECT id, username, full_name, email, role, created_at FROM users WHERE id = ? AND role = \'player\'', [playerId], (uErr, player) => {
    if (uErr || !player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const querySessions = `
      SELECT 
        gs.id as session_id,
        sc.title as scenario_title,
        gs.total_score,
        gs.max_score,
        gs.accuracy_percentage,
        gs.hazards_found,
        gs.hazards_missed,
        gs.incorrect_tries,
        gs.avg_reaction_time_sec,
        gs.quiz_score,
        gs.quiz_max_score,
        gs.completed_at
      FROM game_sessions gs
      JOIN game_scenarios sc ON gs.scenario_id = sc.id
      WHERE gs.user_id = ?
      ORDER BY gs.completed_at DESC
    `;

    db.all(querySessions, [playerId], (sErr, sessions) => {
      if (sErr) {
        return res.status(500).json({ error: 'Failed to load player sessions.' });
      }
      res.json({ player, sessions });
    });
  });
});

// 4. DELETE PLAYER ACCOUNT
router.delete('/players/:id', requireAdmin, (req, res) => {
  const playerId = req.params.id;

  db.run(`DELETE FROM users WHERE id = ? AND role = 'player'`, [playerId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete player: ' + err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Player not found or cannot delete an admin account.' });
    }

    res.json({ message: 'Player account and associated game records deleted successfully.' });
  });
});

// 5. GET ALL GAME SESSIONS LOG
router.get('/sessions', requireAdmin, (req, res) => {
  const query = `
    SELECT 
      gs.id as session_id,
      gs.user_id,
      u.username,
      u.full_name,
      sc.title as scenario_title,
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
    JOIN users u ON gs.user_id = u.id
    JOIN game_scenarios sc ON gs.scenario_id = sc.id
    ORDER BY gs.completed_at DESC
    LIMIT 150
  `;

  db.all(query, [], (err, sessions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    res.json({ sessions });
  });
});

// 6. SCENARIO MANAGEMENT (CRUD)
router.get('/scenarios', requireAdmin, (req, res) => {
  const query = `
    SELECT 
      s.*, 
      COUNT(h.id) as hazard_count,
      COUNT(q.id) as quiz_count
    FROM game_scenarios s
    LEFT JOIN hazards h ON s.id = h.scenario_id
    LEFT JOIN quiz_questions q ON s.id = q.scenario_id
    GROUP BY s.id
    ORDER BY s.id ASC
  `;

  db.all(query, [], (err, scenarios) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ scenarios });
  });
});

router.post('/scenarios', requireAdmin, (req, res) => {
  const { key_name, title, description, zone_name, time_limit, max_score, active } = req.body;

  if (!key_name || !title || !description || !zone_name) {
    return res.status(400).json({ error: 'Missing required scenario fields.' });
  }

  db.run(
    `INSERT INTO game_scenarios (key_name, title, description, zone_name, time_limit, max_score, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [key_name.trim(), title.trim(), description.trim(), zone_name.trim(), time_limit || 120, max_score || 1000, active !== undefined ? active : 1],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Scenario created successfully!', scenarioId: this.lastID });
    }
  );
});

router.put('/scenarios/:id', requireAdmin, (req, res) => {
  const scenarioId = req.params.id;
  const { title, description, zone_name, time_limit, max_score, active } = req.body;

  db.run(
    `UPDATE game_scenarios 
     SET title = ?, description = ?, zone_name = ?, time_limit = ?, max_score = ?, active = ?
     WHERE id = ?`,
    [title, description, zone_name, time_limit, max_score, active, scenarioId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Scenario not found.' });
      res.json({ message: 'Scenario updated successfully!' });
    }
  );
});

router.delete('/scenarios/:id', requireAdmin, (req, res) => {
  const scenarioId = req.params.id;

  // Safeguard check for active sessions
  db.get('SELECT COUNT(*) as count FROM game_sessions WHERE scenario_id = ?', [scenarioId], (sErr, row) => {
    if (sErr) return res.status(500).json({ error: sErr.message });
    if (row.count > 0) {
      return res.status(400).json({
        error: `Cannot delete scenario. It is referenced in ${row.count} completed player game sessions. Deactivate it instead.`
      });
    }

    db.run('DELETE FROM game_scenarios WHERE id = ?', [scenarioId], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Scenario deleted successfully!' });
    });
  });
});

// 7. HAZARD MANAGEMENT (CRUD)
router.get('/scenarios/:id/hazards', requireAdmin, (req, res) => {
  const scenarioId = req.params.id;
  db.all('SELECT * FROM hazards WHERE scenario_id = ?', [scenarioId], (err, hazards) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ hazards });
  });
});

router.post('/hazards', requireAdmin, (req, res) => {
  const { scenario_id, hazard_key, name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus } = req.body;

  if (!scenario_id || !name || !category) {
    return res.status(400).json({ error: 'Scenario ID, hazard name, and category are required.' });
  }

  db.run(
    `INSERT INTO hazards (scenario_id, hazard_key, name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scenario_id,
      hazard_key || `hz_${Date.now()}`,
      name.trim(),
      category.trim(),
      description || '',
      risk_explanation || '',
      safety_recommendation || '',
      pos_x || 0,
      pos_y || 0.5,
      pos_z || -10,
      radius || 2.5,
      difficulty || 'Medium',
      score_value || 100,
      safety_bonus || 50
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Hazard created successfully!', hazardId: this.lastID });
    }
  );
});

router.put('/hazards/:id', requireAdmin, (req, res) => {
  const hazardId = req.params.id;
  const { name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus } = req.body;

  db.run(
    `UPDATE hazards
     SET name = ?, category = ?, description = ?, risk_explanation = ?, safety_recommendation = ?,
         pos_x = ?, pos_y = ?, pos_z = ?, radius = ?, difficulty = ?, score_value = ?, safety_bonus = ?
     WHERE id = ?`,
    [name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus, hazardId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Hazard not found.' });
      res.json({ message: 'Hazard updated successfully!' });
    }
  );
});

router.delete('/hazards/:id', requireAdmin, (req, res) => {
  const hazardId = req.params.id;
  db.run('DELETE FROM hazards WHERE id = ?', [hazardId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Hazard deleted successfully!' });
  });
});

// 8. QUIZ QUESTION MANAGEMENT (CRUD)
router.get('/scenarios/:id/quizzes', requireAdmin, (req, res) => {
  const scenarioId = req.params.id;
  db.all('SELECT * FROM quiz_questions WHERE scenario_id = ?', [scenarioId], (err, quizzes) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ quizzes });
  });
});

router.post('/quizzes', requireAdmin, (req, res) => {
  const { scenario_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation } = req.body;

  if (!scenario_id || !question_text || !correct_option) {
    return res.status(400).json({ error: 'Missing required quiz fields.' });
  }

  db.run(
    `INSERT INTO quiz_questions (scenario_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [scenario_id, question_text.trim(), option_a, option_b, option_c, option_d, correct_option.toUpperCase(), explanation || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Quiz question added successfully!', quizId: this.lastID });
    }
  );
});

router.put('/quizzes/:id', requireAdmin, (req, res) => {
  const quizId = req.params.id;
  const { question_text, option_a, option_b, option_c, option_d, correct_option, explanation } = req.body;

  db.run(
    `UPDATE quiz_questions
     SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_option = ?, explanation = ?
     WHERE id = ?`,
    [question_text, option_a, option_b, option_c, option_d, correct_option.toUpperCase(), explanation, quizId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Quiz question updated successfully!' });
    }
  );
});

router.delete('/quizzes/:id', requireAdmin, (req, res) => {
  const quizId = req.params.id;
  db.run('DELETE FROM quiz_questions WHERE id = ?', [quizId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Quiz question deleted successfully!' });
  });
});

module.exports = router;
