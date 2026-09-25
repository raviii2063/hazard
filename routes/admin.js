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
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = {};

    const r1 = await db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'player'`);
    stats.totalPlayers = r1 ? Number(r1.count) : 0;

    const r2 = await db.get(`
      SELECT 
        COUNT(*) as totalSessions, 
        AVG(total_score) as avgScore,
        AVG(accuracy_percentage) as avgAccuracy,
        AVG(avg_reaction_time_sec) as avgReactionTime,
        SUM(hazards_found) as totalHazardsSpotted
      FROM game_sessions
    `);

    stats.totalSessions = r2 && r2.totalSessions ? Number(r2.totalSessions) : 0;
    stats.avgScore = r2 && r2.avgScore ? Number(r2.avgScore).toFixed(1) : '0.0';
    stats.avgAccuracy = r2 && r2.avgAccuracy ? Number(r2.avgAccuracy).toFixed(1) : '0.0';
    stats.avgReactionTime = r2 && r2.avgReactionTime ? Number(r2.avgReactionTime).toFixed(2) : '0.00';
    stats.totalHazardsSpotted = r2 && r2.totalHazardsSpotted ? Number(r2.totalHazardsSpotted) : 0;

    const r3 = await db.get(`SELECT COUNT(*) as passCount FROM game_sessions WHERE accuracy_percentage >= 50`);
    stats.passRate = stats.totalSessions > 0
      ? (((r3 ? Number(r3.passCount) : 0) / stats.totalSessions) * 100).toFixed(1)
      : '0.0';

    const r4 = await db.get(`SELECT MAX(total_score) as highestScore, MIN(total_score) as lowestScore FROM game_sessions`);
    stats.highestScore = r4 && r4.highestScore !== null ? Number(r4.highestScore) : 0;
    stats.lowestScore = r4 && r4.lowestScore !== null ? Number(r4.lowestScore) : 0;

    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET ALL REGISTERED PLAYERS LIST WITH PERFORMANCE METRICS
router.get('/players', requireAdmin, async (req, res) => {
  try {
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

    const players = await db.all(query, [searchParam, searchParam, searchParam]);
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// 3. GET INDIVIDUAL PLAYER PROFILE DETAILS AND SESSIONS HISTORY
router.get('/players/:id', requireAdmin, async (req, res) => {
  try {
    const playerId = req.params.id;
    const player = await db.get('SELECT id, username, full_name, email, role, created_at FROM users WHERE id = ? AND role = \'player\'', [playerId]);

    if (!player) {
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

    const sessions = await db.all(querySessions, [playerId]);
    res.json({ player, sessions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load player profile: ' + err.message });
  }
});

// 4. DELETE PLAYER ACCOUNT
router.delete('/players/:id', requireAdmin, async (req, res) => {
  try {
    const playerId = req.params.id;
    const result = await db.run(`DELETE FROM users WHERE id = ? AND role = 'player'`, [playerId]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Player not found or cannot delete an admin account.' });
    }

    res.json({ message: 'Player account and associated game records deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete player: ' + err.message });
  }
});

// 5. GET ALL GAME SESSIONS LOG
router.get('/sessions', requireAdmin, async (req, res) => {
  try {
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

    const sessions = await db.all(query);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// 6. SCENARIO MANAGEMENT (CRUD)
router.get('/scenarios', requireAdmin, async (req, res) => {
  try {
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

    const scenarios = await db.all(query);
    res.json({ scenarios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scenarios', requireAdmin, async (req, res) => {
  try {
    const { key_name, title, description, zone_name, time_limit, max_score, active } = req.body;

    if (!key_name || !title || !description || !zone_name) {
      return res.status(400).json({ error: 'Missing required scenario fields.' });
    }

    const result = await db.run(
      `INSERT INTO game_scenarios (key_name, title, description, zone_name, time_limit, max_score, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [key_name.trim(), title.trim(), description.trim(), zone_name.trim(), time_limit || 120, max_score || 100, active !== undefined ? active : 1]
    );

    res.status(201).json({ message: 'Scenario created successfully!', scenarioId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/scenarios/:id', requireAdmin, async (req, res) => {
  try {
    const scenarioId = req.params.id;
    const { title, description, zone_name, time_limit, max_score, active } = req.body;

    const result = await db.run(
      `UPDATE game_scenarios 
       SET title = ?, description = ?, zone_name = ?, time_limit = ?, max_score = ?, active = ?
       WHERE id = ?`,
      [title, description, zone_name, time_limit, max_score, active, scenarioId]
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Scenario not found.' });
    res.json({ message: 'Scenario updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/scenarios/:id', requireAdmin, async (req, res) => {
  try {
    const scenarioId = req.params.id;
    const row = await db.get('SELECT COUNT(*) as count FROM game_sessions WHERE scenario_id = ?', [scenarioId]);

    if (row && Number(row.count) > 0) {
      return res.status(400).json({
        error: `Cannot delete scenario. It is referenced in ${row.count} completed player game sessions. Deactivate it instead.`
      });
    }

    await db.run('DELETE FROM game_scenarios WHERE id = ?', [scenarioId]);
    res.json({ message: 'Scenario deleted successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. HAZARD MANAGEMENT (CRUD)
router.get('/scenarios/:id/hazards', requireAdmin, async (req, res) => {
  try {
    const scenarioId = req.params.id;
    const hazards = await db.all('SELECT * FROM hazards WHERE scenario_id = ?', [scenarioId]);
    res.json({ hazards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hazards', requireAdmin, async (req, res) => {
  try {
    const { scenario_id, hazard_key, name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus } = req.body;

    if (!scenario_id || !name || !category) {
      return res.status(400).json({ error: 'Scenario ID, hazard name, and category are required.' });
    }

    const result = await db.run(
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
        radius || 3.5,
        difficulty || 'Easy',
        score_value || 15,
        safety_bonus || 5
      ]
    );

    res.status(201).json({ message: 'Hazard created successfully!', hazardId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/hazards/:id', requireAdmin, async (req, res) => {
  try {
    const hazardId = req.params.id;
    const { name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus } = req.body;

    const result = await db.run(
      `UPDATE hazards
       SET name = ?, category = ?, description = ?, risk_explanation = ?, safety_recommendation = ?,
           pos_x = ?, pos_y = ?, pos_z = ?, radius = ?, difficulty = ?, score_value = ?, safety_bonus = ?
       WHERE id = ?`,
      [name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus, hazardId]
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Hazard not found.' });
    res.json({ message: 'Hazard updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/hazards/:id', requireAdmin, async (req, res) => {
  try {
    const hazardId = req.params.id;
    await db.run('DELETE FROM hazards WHERE id = ?', [hazardId]);
    res.json({ message: 'Hazard deleted successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. QUIZ QUESTION MANAGEMENT (CRUD)
router.get('/scenarios/:id/quizzes', requireAdmin, async (req, res) => {
  try {
    const scenarioId = req.params.id;
    const quizzes = await db.all('SELECT * FROM quiz_questions WHERE scenario_id = ?', [scenarioId]);
    res.json({ quizzes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/quizzes', requireAdmin, async (req, res) => {
  try {
    const { scenario_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation } = req.body;

    if (!scenario_id || !question_text || !correct_option) {
      return res.status(400).json({ error: 'Missing required quiz fields.' });
    }

    const result = await db.run(
      `INSERT INTO quiz_questions (scenario_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [scenario_id, question_text.trim(), option_a, option_b, option_c, option_d, correct_option.toUpperCase(), explanation || '']
    );

    res.status(201).json({ message: 'Quiz question added successfully!', quizId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/quizzes/:id', requireAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    const { question_text, option_a, option_b, option_c, option_d, correct_option, explanation } = req.body;

    await db.run(
      `UPDATE quiz_questions
       SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_option = ?, explanation = ?
       WHERE id = ?`,
      [question_text, option_a, option_b, option_c, option_d, correct_option.toUpperCase(), explanation, quizId]
    );

    res.json({ message: 'Quiz question updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/quizzes/:id', requireAdmin, async (req, res) => {
  try {
    const quizId = req.params.id;
    await db.run('DELETE FROM quiz_questions WHERE id = ?', [quizId]);
    res.json({ message: 'Quiz question deleted successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
