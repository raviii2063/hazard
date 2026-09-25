# 360° WAREHOUSE HAZARD PERCEPTION TRAINING SIMULATOR
### University of Sunderland Enterprise Project — Automotive Logistics Safety Game

A complete, full-stack web application and interactive 3D WebGL simulator designed for workplace health and safety hazard perception training in automotive logistics warehouses.

---

## 🌟 Key Project Features

1. **360° Interactive 3D Warehouse Environment**:
   - Built using **Three.js** and WebGL.
   - Procedurally generated high-bay warehouse aisles, epoxy concrete flooring with pedestrian safety lanes and zebra crossings, industrial storage racks, chemical storage bays, forklifts, and pedestrian workers.
   - Full 360-degree mouse camera look with **PointerLock Controls**, sensitivity adjustments, and an on-screen **Virtual D-Pad**.
   - First-person walking physics (WASD + Arrow keys) with collision detection preventing clipping through perimeter walls and racking.

2. **Core Hazard Spotting Mechanics**:
   - Dynamic 3D Raycasting from the center aim crosshair to target potential workplace hazards.
   - Interactive glowing highlight and HUD prompt (`Press E or Click to Identify`).
   - Category confirmation modal with 8 HSE hazard classifications (*Spills/Slips, Blocked Walkways, Electrical Cables, Buckled Racks, Emergency Door Obstructions, Teetering Crates, Forklift Risks, Blind Spot Visibility*).
   - Instant server-side verification, Web Audio API sound effects, score calculation, reaction timing, and visual placement of green safety cones on cleared hazards.

3. **3 Playable Warehouse Scenarios**:
   - **Scenario 1: Warehouse Walkway Hazard Hunt** (6 Walkway hazards, 120s timer, 5-question safety quiz).
   - **Scenario 2: Forklift & Pedestrian Safety Zone** (5 Forklift & crossing hazards, 120s timer, 5-question safety quiz).
   - **Scenario 3: Storage Rack & High-Bay Loading Zone** (5 Racking & chemical hazards, 120s timer, 5-question safety quiz).

4. **Post-Scenario Health & Safety Quizzes**:
   - 5 scenario-specific assessment questions loaded from the SQLite database.
   - Instant feedback and detailed safety guidance explanations based on UK HSE / OSHA workplace standards.

5. **Player & Admin Portals**:
   - **Player Portal**: Registration, login, dashboard KPI metrics (Highest Score, Average Score, Total Hazards Found, Total Games), scenario selection, active 3D gameplay, performance breakdown certificate, and complete attempt history.
   - **Admin Portal**: Protected role-based admin dashboard featuring real SQLite analytics (Registered Players, Total Game Sessions, Class Avg Score, Pass Rate, Avg Reaction Time), searchable player management table, game session logs, 2D Canvas charts, and CRUD managers for Scenarios, Hazards, and Quiz Questions.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3 (Vanilla industrial charcoal & safety yellow design system), JavaScript ES Modules, Three.js (r128), Web Audio API.
- **Backend**: Node.js, Express.js REST API, JSON Web Tokens (JWT), bcryptjs password hashing, CORS.
- **Database**: SQLite3 persistent database (`database.sqlite`).

---

## 🚀 Quick Startup & Run Instructions (macOS / VS Code)

### Prerequisites
- Node.js (v16+ recommended)
- macOS Apple Silicon or Intel

### Installation & Startup Commands

1. Open VS Code terminal in the project directory:
   ```bash
   cd "/Users/ravisir/Desktop/hazard final"
   ```

2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

3. Start the application server:
   ```bash
   npm start
   ```

4. Open your web browser and navigate to:
   - **Player Portal URL**: [http://localhost:8080](http://localhost:8080)
   - **Admin Portal URL**: [http://localhost:8080](http://localhost:8080) *(Log in using Admin credentials)*

---

## 🔑 Pre-Seeded Accounts

- **Default Administrator Account**:
  - **Username**: `admin`
  - **Password**: `admin123`
  - **Role**: `admin` (Access to Admin Control Center & Analytics)

- **Default Demo Player Account**:
  - **Username**: `player1`
  - **Password**: `player123`
  - **Role**: `player` (Access to Training Scenarios & Dashboard)

- **New Player Registration**:
  - New users can register via the `Sign In / Register` modal on the landing page.

---

## 🧪 Testing Checklist & Verification

1. **Server & Database Initialization**:
   - Run `npm start` -> verifies `database.sqlite` auto-creation and table seeding.
2. **Player Registration & Login**:
   - Register a new account or log in as `player1` / `player123`.
3. **Player Dashboard & Scenario Launch**:
   - View statistics cards and click `Start Scenario Training` on any scenario.
4. **3D Navigation & Camera**:
   - Click canvas to lock pointer. Test WASD movement, mouse look up/down/left/right, and sensitivity slider in pause menu.
5. **Hazard Spotting & Scoring**:
   - Aim crosshair at a hazard (e.g. oil spill or cable). Press `E`. Select hazard category -> verify +150 Pts award, Web Audio sound chime, and green safety cone placement.
6. **Safety Quiz & Results**:
   - Complete scenario or wait for timer. Answer 5 quiz questions. Verify score certificate and database saving.
7. **Admin Portal Analytics**:
   - Log in as `admin` / `admin123`. Verify real database query totals, performance charts, player search, attempt logs, and scenario CRUD.

---

## ⚡ Turso Database Setup for Vercel Deployment

To deploy on Vercel without native GLIBC / SQLite file locking issues, this project uses **Turso** (hosted libSQL over HTTP).

### 1. Create a Free Turso Database
```bash
# Install Turso CLI
brew install tursodatabase/tap/turso

# Login & Create Database
turso auth login
turso db create hazard-db

# Get Database URL and Auth Token
turso db show hazard-db --url
turso db tokens create hazard-db
```

### 2. Set Environment Variables on Vercel
Go to **Vercel Dashboard** -> **Project Settings** -> **Environment Variables** and add:
- `TURSO_DATABASE_URL`: `libsql://hazard-db-[username].turso.io`
- `TURSO_AUTH_TOKEN`: `your-turso-jwt-token`
- `JWT_SECRET`: `your_secure_secret_key`

### 3. Migrate Local Data to Turso (Optional)
Run the migration script to push your local SQLite data to Turso:
```bash
npm run db:migrate-turso
```

---

## 📜 License
University of Sunderland Enterprise Health & Safety Project. All rights reserved.

