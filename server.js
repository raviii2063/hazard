const express = require('express');
const cors = require('cors');
const path = require('path');

try {
  require('dotenv').config();
} catch (e) {
  // dotenv optional
}

// Initialize database & seed data
const db = require('./db');
if (db && typeof db.initDb === 'function') {
  db.initDb().catch((err) => {
    console.error('⚠️ DB Initialization warning:', err.message);
  });
}

const { router: authRouter } = require('./routes/auth');
const gameRouter = require('./routes/game');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, 'public')));

// Mount API Routes
app.use('/api/auth', authRouter);
app.use('/api/game', gameRouter);
app.use('/api/admin', adminRouter);

// Fallback SPA routing for Express 5 compatibility
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🚀 360° Warehouse Hazard Perception Simulator Server Running`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔑 Seed Admin Login: Username "admin" | Password "admin123"`);
  console.log(`👤 Seed Player Login: Username "player1" | Password "player123"`);
  console.log(`================================================================`);
});
