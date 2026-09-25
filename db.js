const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', DB_PATH);
  }
});

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON;');

  // 1. Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Game Scenarios Table (Max Score = 100)
  db.run(`
    CREATE TABLE IF NOT EXISTS game_scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_name TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      time_limit INTEGER NOT NULL DEFAULT 120,
      max_score INTEGER NOT NULL DEFAULT 100,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Hazards Table (Score value 15, bonus 5 = 20 pts max per hazard)
  db.run(`
    CREATE TABLE IF NOT EXISTS hazards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id INTEGER NOT NULL,
      hazard_key TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      risk_explanation TEXT NOT NULL,
      safety_recommendation TEXT NOT NULL,
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      pos_z REAL NOT NULL,
      radius REAL NOT NULL DEFAULT 3.5,
      difficulty TEXT NOT NULL DEFAULT 'Easy',
      score_value INTEGER NOT NULL DEFAULT 15,
      safety_bonus INTEGER NOT NULL DEFAULT 5,
      FOREIGN KEY (scenario_id) REFERENCES game_scenarios(id) ON DELETE CASCADE
    )
  `);

  // 4. Quiz Questions Table
  db.run(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL,
      explanation TEXT NOT NULL,
      FOREIGN KEY (scenario_id) REFERENCES game_scenarios(id) ON DELETE CASCADE
    )
  `);

  // 5. Game Sessions Table
  db.run(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      scenario_id INTEGER NOT NULL,
      total_score INTEGER NOT NULL,
      max_score INTEGER NOT NULL DEFAULT 100,
      accuracy_percentage REAL NOT NULL,
      hazards_found INTEGER NOT NULL,
      hazards_missed INTEGER NOT NULL,
      incorrect_tries INTEGER NOT NULL,
      avg_reaction_time_sec REAL NOT NULL,
      time_taken_sec INTEGER NOT NULL,
      quiz_score INTEGER DEFAULT 0,
      quiz_max_score INTEGER DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'completed',
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (scenario_id) REFERENCES game_scenarios(id) ON DELETE CASCADE
    )
  `);

  // 6. Hazard Identification Attempts Table
  db.run(`
    CREATE TABLE IF NOT EXISTS hazard_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      hazard_id INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      reaction_time_sec REAL NOT NULL,
      selected_category TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (hazard_id) REFERENCES hazards(id) ON DELETE CASCADE
    )
  `);

  // 7. Quiz Attempts Table
  db.run(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      scenario_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      max_score INTEGER NOT NULL DEFAULT 5,
      percentage REAL NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (scenario_id) REFERENCES game_scenarios(id) ON DELETE CASCADE
    )
  `);

  // Seed Data Setup
  seedDefaultData();
});

function seedDefaultData() {
  // 1. Seed Admin Account
  const adminUsername = 'admin';
  db.get('SELECT id FROM users WHERE username = ?', [adminUsername], (err, row) => {
    if (err) return console.error('Error checking admin user:', err.message);
    if (!row) {
      const adminHash = bcrypt.hashSync('admin123', 10);
      db.run(
        `INSERT INTO users (username, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
        [adminUsername, 'System Administrator', 'admin@warehouse-safety.com', adminHash, 'admin'],
        (iErr) => {
          if (iErr) console.error('Admin seed error:', iErr.message);
          else console.log('✅ Seeded Admin Account: admin / admin123');
        }
      );
    }
  });

  // 2. Seed Default Player Demo Account
  const demoUsername = 'player1';
  db.get('SELECT id FROM users WHERE username = ?', [demoUsername], (err, row) => {
    if (err) return console.error('Error checking demo user:', err.message);
    if (!row) {
      const demoHash = bcrypt.hashSync('player123', 10);
      db.run(
        `INSERT INTO users (username, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
        [demoUsername, 'Alex Taylor (Warehouse Trainee)', 'alex.taylor@logistics-auto.com', demoHash, 'player'],
        (iErr) => {
          if (iErr) console.error('Demo player seed error:', iErr.message);
          else console.log('✅ Seeded Demo Player: player1 / player123');
        }
      );
    }
  });

  // 3. Seed Scenarios & Hazards & Quizzes (MAX SCORE = 100)
  db.get('SELECT COUNT(*) as count FROM game_scenarios', (err, row) => {
    if (err) return console.error('Error checking scenarios:', err.message);
    if (row.count === 0) {
      console.log('Seeding initial scenarios, hazards, and educational quiz questions (Max Score 100)...');

      // SCENARIO 1: WALKWAY HAZARD HUNT
      db.run(
        `INSERT INTO game_scenarios (key_name, title, description, zone_name, time_limit, max_score) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'walkway_hunt',
          'Warehouse Walkway Hazard Hunt',
          'Explore the main pedestrian walkway aisle. Look for spills, exposed cables, pallets, damaged racks, and blocked exit doors.',
          'Main Walkway & Pedestrian Aisle 1',
          120,
          100
        ],
        function (sErr) {
          if (sErr) return console.error('Scenario 1 seed error:', sErr.message);
          const s1Id = this.lastID;

          // Hazards for Scenario 1 (5 hazards = 20 pts max each -> Total 100 pts)
          const s1Hazards = [
            {
              hazard_key: 'h1_spill',
              name: 'Hydraulic Oil Floor Spill',
              category: 'Spills & Slip Hazards',
              description: 'Dark slippery hydraulic fluid spilled from a cart onto the pedestrian walkway floor.',
              risk_explanation: 'Oil spills create an immediate slip hazard for workers and cause foot slipping accidents.',
              safety_recommendation: 'Place caution slip signs, spread spill absorbent, and clean up the liquid immediately.',
              pos_x: 2.5, pos_y: 0.1, pos_z: -8.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h1_cable',
              name: 'Exposed High-Voltage Cable',
              category: 'Electrical & Cable Risks',
              description: 'Loose power extension cable running across the pedestrian walkway without a rubber cover.',
              risk_explanation: 'Exposed cables create a major trip hazard and risk electrical shock if damaged.',
              safety_recommendation: 'Cover cable with a heavy-duty rubber protector ramp or route overhead.',
              pos_x: -3.0, pos_y: 0.1, pos_z: -14.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h1_obstruct',
              name: 'Unattended Pallet in Walkway',
              category: 'Blocked Walkway & Debris',
              description: 'Empty wooden pallet left lying flat in the middle of a designated walking lane.',
              risk_explanation: 'Obstructs walking lanes and forces pedestrians into moving forklift traffic zones.',
              safety_recommendation: 'Move pallet to designated rack storage areas immediately.',
              pos_x: 0.5, pos_y: 0.3, pos_z: -20.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h1_rack',
              name: 'Buckled Rack Upright Post',
              category: 'Shelving & Structural Damage',
              description: 'Bent lower vertical steel leg of a heavy storage rack column caused by forklift impact.',
              risk_explanation: 'Buckled rack columns lose structural strength and risk catastrophic rack collapse.',
              safety_recommendation: 'Unload affected rack bays immediately and repair column with certified steel guards.',
              pos_x: 4.8, pos_y: 1.0, pos_z: -12.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h1_exit',
              name: 'Blocked Emergency Exit Door',
              category: 'Fire & Emergency Obstructions',
              description: 'Cardboard boxes stacked directly against the primary emergency fire exit door.',
              risk_explanation: 'Blocks rapid evacuation during a fire or emergency alarm.',
              safety_recommendation: 'Keep all emergency exit doors completely clear of boxes and stock at all times.',
              pos_x: -9.5, pos_y: 1.2, pos_z: -26.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            }
          ];

          s1Hazards.forEach((h) => {
            db.run(
              `INSERT INTO hazards (scenario_id, hazard_key, name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [s1Id, h.hazard_key, h.name, h.category, h.description, h.risk_explanation, h.safety_recommendation, h.pos_x, h.pos_y, h.pos_z, h.radius, h.difficulty, h.score_value, h.safety_bonus]
            );
          });

          // Easy & Educational Quiz Questions for Scenario 1
          const s1Quizzes = [
            {
              q: 'What should you do immediately if you see a liquid oil spill on a warehouse floor?',
              a: 'Walk around it and ignore it.',
              b: 'Put up warning slip signs and clean it up immediately.',
              c: 'Cover it with paper.',
              d: 'Wait until tomorrow to report it.',
              ans: 'B',
              exp: 'Spills must be marked with warning signs and cleaned immediately to prevent slip injuries.'
            },
            {
              q: 'Why should power cables running across pedestrian paths be covered with rubber ramps?',
              a: 'To make the walkway look nice.',
              b: 'To prevent tripping and protect the cable from damage.',
              c: 'To stop wifi interference.',
              d: 'To keep the cable warm.',
              ans: 'B',
              exp: 'Rubber ramps prevent workers from tripping over cables and stop wheels from damaging electrical wiring.'
            },
            {
              q: 'How should emergency fire exit doors be kept in a warehouse?',
              a: 'Completely clear of any boxes or equipment at all times.',
              b: 'Blocked with light cardboard boxes.',
              c: 'Locked with a padlock during work hours.',
              d: 'Used for storing extra pallets.',
              ans: 'A',
              exp: 'Emergency exit doors must remain 100% clear at all times for safe emergency evacuation.'
            },
            {
              q: 'What is the danger of leaving empty wooden pallets in pedestrian walkways?',
              a: 'It takes up empty space.',
              b: 'It creates a trip hazard and forces workers into forklift lanes.',
              c: 'It makes noise.',
              d: 'It blocks natural sunlight.',
              ans: 'B',
              exp: 'Walkway obstructions force pedestrians into active vehicle traffic lanes, increasing accident risks.'
            },
            {
              q: 'What should be done if a metal storage rack column leg is bent or buckled?',
              a: 'Ignore it if it is not falling.',
              b: 'Unload the shelf immediately and repair the damaged leg.',
              c: 'Push it back with your hands.',
              d: 'Paint over the dent.',
              ans: 'B',
              exp: 'A buckled rack leg loses strength and must be unloaded immediately to prevent structural collapse.'
            }
          ];

          s1Quizzes.forEach((q) => {
            db.run(
              `INSERT INTO quiz_questions (scenario_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [s1Id, q.q, q.a, q.b, q.c, q.d, q.ans, q.exp]
            );
          });
        }
      );

      // SCENARIO 2: FORKLIFT AND PEDESTRIAN SAFETY
      db.run(
        `INSERT INTO game_scenarios (key_name, title, description, zone_name, time_limit, max_score)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'forklift_safety',
          'Forklift & Pedestrian Safety Zone',
          'Identify hazardous forklift operations, elevated loads, blind corners, and pedestrian crossing dangers.',
          'Dock Intersection & Forklift Movement Zone',
          120,
          100
        ],
        function (sErr) {
          if (sErr) return console.error('Scenario 2 seed error:', sErr.message);
          const s2Id = this.lastID;

          const s2Hazards = [
            {
              hazard_key: 'h2_forklift_cross',
              name: 'Forklift Driving with Elevated Load',
              category: 'Forklift & Vehicle Risks',
              description: 'Forklift driving near a crossing with forks raised high off the ground.',
              risk_explanation: 'Driving with raised loads blocks driver vision and increases tip-over risks.',
              safety_recommendation: 'Forklift drivers must carry loads low to the ground (10-15 cm) while traveling.',
              pos_x: -6.0, pos_y: 1.0, pos_z: -10.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h2_blind_spot',
              name: 'Blind Spot Intersection Stacking',
              category: 'Visibility & Blind Spots',
              description: 'Pallets stacked high at an aisle corner blocking view of oncoming forklift traffic.',
              risk_explanation: 'Pedestrians cannot see approaching forklifts around blind corners.',
              safety_recommendation: 'Keep corner stacks low and install convex safety mirrors at intersections.',
              pos_x: 4.5, pos_y: 1.5, pos_z: -16.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h2_ped_proximity',
              name: 'Pedestrian Near Reversing Forklift',
              category: 'Forklift & Vehicle Risks',
              description: 'Worker standing too close behind a reversing forklift.',
              risk_explanation: 'Forklift drivers have rear blind spots and may run over nearby pedestrians.',
              safety_recommendation: 'Maintain at least 3 meters safe distance from operating forklifts.',
              pos_x: -1.5, pos_y: 0.9, pos_z: -24.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h2_pallet_jack_obst',
              name: 'Pallet Jack Left on Pedestrian Crossing',
              category: 'Blocked Walkway & Debris',
              description: 'Manual pallet jack parked directly on a yellow zebra crossing.',
              risk_explanation: 'Blocks pedestrian safe zone and forces workers into vehicle traffic.',
              safety_recommendation: 'Park pallet jacks in designated equipment bays when not in use.',
              pos_x: 1.0, pos_y: 0.4, pos_z: -8.5, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h2_unsecured_load',
              name: 'Unsecured Loose Load on Forks',
              category: 'Falling Objects & Stacking',
              description: 'Unstrapped loose boxes carried on forks without shrink wrap.',
              risk_explanation: 'Loose items can slide off forks during sudden braking and hit workers.',
              safety_recommendation: 'Always shrink-wrap and secure loose cargo to pallets before moving.',
              pos_x: 6.0, pos_y: 1.2, pos_z: -22.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            }
          ];

          s2Hazards.forEach((h) => {
            db.run(
              `INSERT INTO hazards (scenario_id, hazard_key, name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [s2Id, h.hazard_key, h.name, h.category, h.description, h.risk_explanation, h.safety_recommendation, h.pos_x, h.pos_y, h.pos_z, h.radius, h.difficulty, h.score_value, h.safety_bonus]
            );
          });

          const s2Quizzes = [
            {
              q: 'What height should forklift forks be kept off the floor when driving with a load?',
              a: 'Raised high so the driver can see under the load.',
              b: 'Low to the ground (10 to 15 cm) and tilted back.',
              c: 'Fully raised to maximum height.',
              d: 'Dragging on the floor.',
              ans: 'B',
              exp: 'Forks must be kept low to maintain vehicle balance and clear driver visibility.'
            },
            {
              q: 'What safety mirror helps workers see around blind aisle corners in a warehouse?',
              a: 'Convex round safety mirror.',
              b: 'Flat bathroom mirror.',
              c: 'Dark tinted window glass.',
              d: 'Magnifying glass.',
              ans: 'A',
              exp: 'Convex mirrors provide wide-angle views around blind corners to prevent collisions.'
            },
            {
              q: 'What is the recommended safe distance a pedestrian should keep from a moving forklift?',
              a: 'At least 3 meters (10 feet).',
              b: '0.5 meters.',
              c: 'Directly behind the forklift.',
              d: 'No distance needed.',
              ans: 'A',
              exp: 'Keeping 3 meters distance protects workers from blind spots and sudden forklift turns.'
            },
            {
              q: 'Where should manual pallet jacks be parked when work is finished?',
              a: 'In pedestrian zebra crossings.',
              b: 'In designated equipment parking bays.',
              c: 'In front of emergency exit doors.',
              d: 'Anywhere in the middle of an aisle.',
              ans: 'B',
              exp: 'Equipment must be returned to designated parking bays to keep walkways clear.'
            },
            {
              q: 'How should loose boxes be secured on a wooden pallet before being moved by a forklift?',
              a: 'Left loose without wrapping.',
              b: 'Shrink-wrapped or strapped securely to the pallet.',
              c: 'Balanced loosely on one fork.',
              d: 'Stacked upside down.',
              ans: 'B',
              exp: 'Shrink wrapping prevents boxes from sliding off during vehicle movement.'
            }
          ];

          s2Quizzes.forEach((q) => {
            db.run(
              `INSERT INTO quiz_questions (scenario_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [s2Id, q.q, q.a, q.b, q.c, q.d, q.ans, q.exp]
            );
          });
        }
      );

      // SCENARIO 3: STORAGE AND LOADING ZONE
      db.run(
        `INSERT INTO game_scenarios (key_name, title, description, zone_name, time_limit, max_score)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'storage_loading',
          'Warehouse Storage & Loading Zone',
          'Spot chemical leaks, sagging rack beams, teetering crates, and loading dock edge debris.',
          'High-Bay Racking & Loading Staging Bay',
          120,
          100
        ],
        function (sErr) {
          if (sErr) return console.error('Scenario 3 seed error:', sErr.message);
          const s3Id = this.lastID;

          const s3Hazards = [
            {
              hazard_key: 'h3_chem_drum',
              name: 'Leaking Chemical Drum',
              category: 'Spills & Slip Hazards',
              description: 'Industrial drum dripping chemical liquid onto the warehouse floor.',
              risk_explanation: 'Chemical leaks pose chemical burn and slipping risks.',
              safety_recommendation: 'Evacuate immediate area, put on chemical PPE, and use a spill kit.',
              pos_x: 7.0, pos_y: 0.8, pos_z: -12.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h3_bowed_beam',
              name: 'Overloaded Sagging Rack Beam',
              category: 'Shelving & Structural Damage',
              description: 'Horizontal steel rack beam bending under heavy cargo load.',
              risk_explanation: 'Sagging beams indicate overload and risk sudden collapse.',
              safety_recommendation: 'Remove heavy cargo immediately with a forklift and replace beam.',
              pos_x: -5.5, pos_y: 2.4, pos_z: -15.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h3_loose_box',
              name: 'Teetering Top Shelf Crate',
              category: 'Falling Objects & Stacking',
              description: 'Box hanging over the edge of a high shelf 5 meters above floor.',
              risk_explanation: 'Vibrations can dislodge teetering crates, falling onto workers below.',
              safety_recommendation: 'Isolate area below and push crate back securely onto shelf.',
              pos_x: 3.0, pos_y: 5.0, pos_z: -21.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h3_dock_debris',
              name: 'Broken Wooden Pallet at Dock Edge',
              category: 'Blocked Walkway & Debris',
              description: 'Splintered pallet with exposed nails lying near dock ramp.',
              risk_explanation: 'Causes foot punctures and forklift tire damage at dock edge.',
              safety_recommendation: 'Clear broken wood debris into disposal bins immediately.',
              pos_x: -8.0, pos_y: 0.2, pos_z: -25.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            },
            {
              hazard_key: 'h3_missing_rail',
              name: 'Missing Mezzanine Safety Chain',
              category: 'Falling Objects & Stacking',
              description: 'Elevated mezzanine loading edge missing protective safety chain.',
              risk_explanation: 'Poses fall from height risk for workers near elevated dock edge.',
              safety_recommendation: 'Keep safety chains or self-closing gates closed across edges.',
              pos_x: 8.5, pos_y: 3.5, pos_z: -18.0, radius: 3.5, difficulty: 'Easy', score_value: 15, safety_bonus: 5
            }
          ];

          s3Hazards.forEach((h) => {
            db.run(
              `INSERT INTO hazards (scenario_id, hazard_key, name, category, description, risk_explanation, safety_recommendation, pos_x, pos_y, pos_z, radius, difficulty, score_value, safety_bonus)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [s3Id, h.hazard_key, h.name, h.category, h.description, h.risk_explanation, h.safety_recommendation, h.pos_x, h.pos_y, h.pos_z, h.radius, h.difficulty, h.score_value, h.safety_bonus]
            );
          });

          const s3Quizzes = [
            {
              q: 'What action should be taken if a chemical drum is leaking on the warehouse floor?',
              a: 'Mop it up without wearing protective gear.',
              b: 'Evacuate area, wear proper chemical PPE, and use a chemical spill kit.',
              c: 'Cover it with cardboard boxes.',
              d: 'Blow air on it with a fan.',
              ans: 'B',
              exp: 'Chemical leaks require protective gear and spill kit containment.'
            },
            {
              q: 'What does a visible downward curve or bend in a metal rack beam mean?',
              a: 'The beam is working normally.',
              b: 'The beam is overloaded past safety limits and risks collapsing.',
              c: 'The rack needs new paint.',
              d: 'The floor is crooked.',
              ans: 'B',
              exp: 'Bent beams are overloaded and must have cargo removed immediately.'
            },
            {
              q: 'Why are boxes hanging over high shelf edges dangerous?',
              a: 'They look unorganized.',
              b: 'They can fall from height and injure workers below.',
              c: 'They block wifi signals.',
              d: 'They collect dust.',
              ans: 'B',
              exp: 'Items teetering on high shelf edges can fall and cause severe head injuries.'
            },
            {
              q: 'What injury risk do broken wooden pallets with nails pose near loading docks?',
              a: 'No risk at all.',
              b: 'Foot puncture wounds, trip accidents, and forklift tire blowouts.',
              c: 'Eye strain.',
              d: 'Sunburn.',
              ans: 'B',
              exp: 'Exposed nails cause foot puncture injuries and puncture forklift tires.'
            },
            {
              q: 'Why are safety chains or gates required on elevated mezzanine loading edges?',
              a: 'To make the loading dock look nice.',
              b: 'To prevent workers from falling off high edges.',
              c: 'To hang signs on.',
              d: 'To keep birds out.',
              ans: 'B',
              exp: 'Safety chains prevent workers from accidentally falling off high mezzanine edges.'
            }
          ];

          s3Quizzes.forEach((q) => {
            db.run(
              `INSERT INTO quiz_questions (scenario_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [s3Id, q.q, q.a, q.b, q.c, q.d, q.ans, q.exp]
            );
          });
        }
      );
    }
  });
}

module.exports = db;
