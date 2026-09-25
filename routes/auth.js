const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'hazard_perception_secret_key_2026';

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// REGISTER NEW PLAYER
router.post('/register', async (req, res) => {
  try {
    const { username, full_name, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = (full_name || username).trim();

    const passwordHash = bcrypt.hashSync(password, 10);

    const result = await db.run(
      `INSERT INTO users (username, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'player')`,
      [cleanUsername, cleanFullName, cleanEmail, passwordHash]
    );

    const userId = result.lastID;
    const user = { id: userId, username: cleanUsername, full_name: cleanFullName, email: cleanEmail, role: 'player' };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Registration successful!',
      token,
      user
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username or email is already registered.' });
    }
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// LOGIN PLAYER / ADMIN
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required.' });
    }

    const query = `SELECT * FROM users WHERE username = ? OR email = ?`;
    const user = await db.get(query, [username.trim(), username.trim().toLowerCase()]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const payload = {
      id: Number(user.id),
      username: user.username,
      full_name: user.full_name || user.username,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful!',
      token,
      user: payload
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET CURRENT USER PROFILE
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, full_name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = { router, authenticateToken, JWT_SECRET };
