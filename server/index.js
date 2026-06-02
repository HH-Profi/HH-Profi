const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'handball.db');
const UPLOADS = process.env.UPLOADS || path.join(__dirname, '..', 'data', 'uploads');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, number TEXT, position TEXT,
  birthdate TEXT, contact TEXT, status TEXT DEFAULT 'fit', notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS injuries (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, description TEXT,
  players_count TEXT, duration INTEGER DEFAULT 15, material TEXT DEFAULT '[]',
  file_path TEXT, file_name TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, title TEXT, date TEXT NOT NULL, time TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS session_attendance (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('present','absent')),
  PRIMARY KEY (session_id, player_id)
);
CREATE TABLE IF NOT EXISTS session_exercises (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (session_id, exercise_id)
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  distance_km REAL, time_min REAL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, player_id)
);
CREATE TABLE IF NOT EXISTS player_performance (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  distance_km REAL,
  time_min REAL,
  goals INTEGER DEFAULT 0,
  opponent TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

const uid = () => Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();
const jsonArray = (value) => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
};

const splitList = (value) => String(value || '').split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
const normalize = (value) => String(value || '').trim().toLowerCase();
const firstValue = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return '';
};

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { field += '"'; i += 1; } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(field); field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows.shift().map((header) => normalize(header));
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || '').trim()])));
}

function parseImportRows(req) {
  if (!req.file) throw new Error('CSV-Datei fehlt');
  const name = req.file.originalname.toLowerCase();
  if (!name.endsWith('.csv')) throw new Error('Bitte eine CSV-Datei hochladen');
  const rows = parseCsv(req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (rows.length === 0) throw new Error('CSV enthält keine Daten');
  return rows;
}

function findPlayerId(value) {
  const wanted = normalize(value);
  if (!wanted) return null;
  const players = db.prepare('SELECT id,name,number FROM players').all();
  const found = players.find((player) => normalize(player.id) === wanted || normalize(player.number) === wanted || normalize(player.name) === wanted || normalize(`#${player.number} ${player.name}`) === wanted);
  return found?.id || null;
}

function findExerciseId(value) {
  const wanted = normalize(value);
  if (!wanted) return null;
  const exercise = db.prepare('SELECT id,name FROM exercises').all().find((item) => normalize(item.id) === wanted || normalize(item.name) === wanted);
  return exercise?.id || null;
}

function parseExercise(row) {
  if (!row) return null;
  return { ...row, material: jsonArray(row.material) };
}

function getPlayer(id) {
  const player = db.prepare('SELECT * FROM players WHERE id=?').get(id);
  if (!player) return null;
  player.injuries = db.prepare('SELECT * FROM injuries WHERE player_id=? ORDER BY date DESC').all(id);
  player.performance = db.prepare('SELECT * FROM player_performance WHERE player_id=? ORDER BY date DESC, created_at DESC').all(id);
  player.session_runs = db.prepare(`
    SELECT r.id, s.date, s.title, r.distance_km, r.time_min
    FROM runs r JOIN sessions s ON s.id=r.session_id
    WHERE r.player_id=?
    ORDER BY s.date DESC, r.created_at DESC`).all(id);
  return player;
}

function getSession(id) {
  const session = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!session) return null;
  const attendance = db.prepare('SELECT * FROM session_attendance WHERE session_id=?').all(id);
  session.present = attendance.filter((row) => row.status === 'present').map((row) => row.player_id);
  session.absent = attendance.filter((row) => row.status === 'absent').map((row) => row.player_id);
  session.exercises = db.prepare('SELECT exercise_id FROM session_exercises WHERE session_id=? ORDER BY sort_order').all(id).map((row) => row.exercise_id);
  session.runs = db.prepare('SELECT * FROM runs WHERE session_id=?').all(id);
  return session;
}

function notFound(res) {
  return res.status(404).json({ error: 'Nicht gefunden' });
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/players', (req, res) => {
  const rows = db.prepare('SELECT id FROM players ORDER BY CAST(number AS INTEGER), name').all();
  res.json(rows.map((row) => getPlayer(row.id)));
});

app.post('/api/players', (req, res) => {
  const { name, number, position, birthdate, contact, status, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name fehlt' });
  const id = uid();
  db.prepare('INSERT INTO players (id,name,number,position,birthdate,contact,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, name.trim(), number || null, position || null, birthdate || null, contact || null, status || 'fit', notes || null, now(), now());
  res.json(getPlayer(id));
});

app.put('/api/players/:id', (req, res) => {
  if (!getPlayer(req.params.id)) return notFound(res);
  const { name, number, position, birthdate, contact, status, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name fehlt' });
  db.prepare('UPDATE players SET name=?,number=?,position=?,birthdate=?,contact=?,status=?,notes=?,updated_at=? WHERE id=?')
    .run(name.trim(), number || null, position || null, birthdate || null, contact || null, status || 'fit', notes || null, now(), req.params.id);
  res.json(getPlayer(req.params.id));
});

app.delete('/api/players/:id', (req, res) => {
  db.prepare('DELETE FROM players WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/players/:id/injuries', (req, res) => {
  const { date, note } = req.body;
  if (!getPlayer(req.params.id)) return notFound(res);
  if (!date || !note) return res.status(400).json({ error: 'Datum und Notiz fehlen' });
  const id = uid();
  db.prepare('INSERT INTO injuries (id,player_id,date,note) VALUES (?,?,?,?)').run(id, req.params.id, date, note);
  res.json(db.prepare('SELECT * FROM injuries WHERE id=?').get(id));
});

app.delete('/api/injuries/:id', (req, res) => {
  db.prepare('DELETE FROM injuries WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/players/:id/performance', (req, res) => {
  const { date, distance_km, time_min, goals, opponent, notes } = req.body;
  if (!getPlayer(req.params.id)) return notFound(res);
  if (!date) return res.status(400).json({ error: 'Datum fehlt' });
  const id = uid();
  db.prepare('INSERT INTO player_performance (id,player_id,date,distance_km,time_min,goals,opponent,notes) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.params.id, date, parseFloat(distance_km) || null, parseFloat(time_min) || null, parseInt(goals, 10) || 0, opponent || null, notes || null);
  res.json(db.prepare('SELECT * FROM player_performance WHERE id=?').get(id));
});

app.delete('/api/performance/:id', (req, res) => {
  db.prepare('DELETE FROM player_performance WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});


app.post('/api/import/players', importUpload.single('file'), (req, res) => {
  try {
    const rows = parseImportRows(req);
    let created = 0, updated = 0, skipped = 0;
    const findExisting = db.prepare('SELECT id FROM players WHERE number=? OR lower(name)=lower(?) LIMIT 1');
    const insert = db.prepare('INSERT INTO players (id,name,number,position,birthdate,contact,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const update = db.prepare('UPDATE players SET name=?,number=?,position=?,birthdate=?,contact=?,status=?,notes=?,updated_at=? WHERE id=?');
    db.transaction(() => rows.forEach((row) => {
      const name = firstValue(row, ['name', 'spieler', 'spielername', 'vorname nachname']).trim();
      if (!name) { skipped += 1; return; }
      const number = firstValue(row, ['number', 'nummer', 'trikotnummer']);
      const data = {
        number: number || null,
        position: firstValue(row, ['position', 'pos']) || null,
        birthdate: firstValue(row, ['birthdate', 'geburtsdatum', 'geburtstag']) || null,
        contact: firstValue(row, ['contact', 'kontakt', 'email', 'telefon']) || null,
        status: firstValue(row, ['status']) || 'fit',
        notes: firstValue(row, ['notes', 'notizen', 'notiz']) || null
      };
      const existing = findExisting.get(data.number, name);
      if (existing) {
        update.run(name, data.number, data.position, data.birthdate, data.contact, data.status, data.notes, now(), existing.id);
        updated += 1;
      } else {
        insert.run(uid(), name, data.number, data.position, data.birthdate, data.contact, data.status, data.notes, now(), now());
        created += 1;
      }
    }))();
    res.json({ ok: true, created, updated, skipped });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/import/exercises', importUpload.single('file'), (req, res) => {
  try {
    const rows = parseImportRows(req);
    let created = 0, updated = 0, skipped = 0;
    const findExisting = db.prepare('SELECT id FROM exercises WHERE lower(name)=lower(?) LIMIT 1');
    const insert = db.prepare('INSERT INTO exercises (id,name,category,description,players_count,duration,material,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
    const update = db.prepare('UPDATE exercises SET category=?,description=?,players_count=?,duration=?,material=?,updated_at=? WHERE id=?');
    db.transaction(() => rows.forEach((row) => {
      const name = firstValue(row, ['name', 'übung', 'uebung', 'exercise']).trim();
      if (!name) { skipped += 1; return; }
      const material = splitList(firstValue(row, ['material', 'materials', 'geräte', 'geraete']));
      const category = firstValue(row, ['category', 'kategorie']) || null;
      const description = firstValue(row, ['description', 'beschreibung', 'ablauf']) || null;
      const playersCount = firstValue(row, ['players_count', 'spieleranzahl', 'spieler']) || null;
      const duration = parseInt(firstValue(row, ['duration', 'dauer', 'minuten']), 10) || 15;
      const existing = findExisting.get(name);
      if (existing) {
        update.run(category, description, playersCount, duration, JSON.stringify(material), now(), existing.id);
        updated += 1;
      } else {
        insert.run(uid(), name, category, description, playersCount, duration, JSON.stringify(material), now(), now());
        created += 1;
      }
    }))();
    res.json({ ok: true, created, updated, skipped });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/import/sessions', importUpload.single('file'), (req, res) => {
  try {
    const rows = parseImportRows(req);
    let created = 0, skipped = 0;
    db.transaction(() => rows.forEach((row) => {
      const date = firstValue(row, ['date', 'datum']).trim();
      if (!date) { skipped += 1; return; }
      const id = uid();
      db.prepare('INSERT INTO sessions (id,title,date,time,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, firstValue(row, ['title', 'titel', 'training']) || 'Training', date, firstValue(row, ['time', 'uhrzeit', 'zeit']) || null, firstValue(row, ['notes', 'notizen', 'notiz']) || null, now(), now());
      const present = splitList(firstValue(row, ['present', 'anwesend', 'spieler_anwesend'])).map(findPlayerId).filter(Boolean);
      const absent = splitList(firstValue(row, ['absent', 'abwesend', 'spieler_abwesend'])).map(findPlayerId).filter(Boolean);
      const exercises = splitList(firstValue(row, ['exercises', 'übungen', 'uebungen'])).map(findExerciseId).filter(Boolean);
      saveAttendance(id, present, absent);
      saveSessionExercises(id, exercises);
      created += 1;
    }))();
    res.json({ ok: true, created, updated: 0, skipped });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/exercises', (req, res) => {
  res.json(db.prepare('SELECT * FROM exercises ORDER BY name').all().map(parseExercise));
});

app.post('/api/exercises', upload.single('file'), (req, res) => {
  const { name, category, description, players_count, duration, material } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name fehlt' });
  const id = uid();
  const fp = req.file ? `/uploads/${req.file.filename}` : null;
  const fn = req.file ? req.file.originalname : null;
  db.prepare('INSERT INTO exercises (id,name,category,description,players_count,duration,material,file_path,file_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, name.trim(), category || null, description || null, players_count || null, parseInt(duration, 10) || 15, material || '[]', fp, fn, now(), now());
  res.json(parseExercise(db.prepare('SELECT * FROM exercises WHERE id=?').get(id)));
});

app.put('/api/exercises/:id', upload.single('file'), (req, res) => {
  const ex = db.prepare('SELECT * FROM exercises WHERE id=?').get(req.params.id);
  if (!ex) return notFound(res);
  const { name, category, description, players_count, duration, material } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name fehlt' });
  let fp = ex.file_path;
  let fn = ex.file_name;
  if (req.file) {
    if (fp) { try { fs.unlinkSync(path.join(UPLOADS, path.basename(fp))); } catch {} }
    fp = `/uploads/${req.file.filename}`;
    fn = req.file.originalname;
  }
  db.prepare('UPDATE exercises SET name=?,category=?,description=?,players_count=?,duration=?,material=?,file_path=?,file_name=?,updated_at=? WHERE id=?')
    .run(name.trim(), category || null, description || null, players_count || null, parseInt(duration, 10) || 15, material || '[]', fp, fn, now(), req.params.id);
  res.json(parseExercise(db.prepare('SELECT * FROM exercises WHERE id=?').get(req.params.id)));
});

app.delete('/api/exercises/:id', (req, res) => {
  const ex = db.prepare('SELECT * FROM exercises WHERE id=?').get(req.params.id);
  if (ex?.file_path) { try { fs.unlinkSync(path.join(UPLOADS, path.basename(ex.file_path))); } catch {} }
  db.prepare('DELETE FROM exercises WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/sessions', (req, res) => {
  const rows = db.prepare('SELECT id FROM sessions ORDER BY date DESC, time DESC').all();
  res.json(rows.map((row) => getSession(row.id)));
});

app.post('/api/sessions', (req, res) => {
  const { title, date, time, notes, present = [], absent = [], exercises = [], runs = [] } = req.body;
  if (!date) return res.status(400).json({ error: 'Datum fehlt' });
  const id = uid();
  db.transaction(() => {
    db.prepare('INSERT INTO sessions (id,title,date,time,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, title || null, date, time || null, notes || null, now(), now());
    saveAttendance(id, present, absent);
    saveSessionExercises(id, exercises);
    saveRuns(id, runs);
  })();
  res.json(getSession(id));
});

app.put('/api/sessions/:id', (req, res) => {
  if (!getSession(req.params.id)) return notFound(res);
  const { title, date, time, notes, present = [], absent = [], exercises = [], runs = [] } = req.body;
  if (!date) return res.status(400).json({ error: 'Datum fehlt' });
  db.transaction(() => {
    db.prepare('UPDATE sessions SET title=?,date=?,time=?,notes=?,updated_at=? WHERE id=?')
      .run(title || null, date, time || null, notes || null, now(), req.params.id);
    saveAttendance(req.params.id, present, absent);
    saveSessionExercises(req.params.id, exercises);
    saveRuns(req.params.id, runs);
  })();
  res.json(getSession(req.params.id));
});

app.delete('/api/sessions/:id', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

function saveAttendance(sessionId, present, absent) {
  db.prepare('DELETE FROM session_attendance WHERE session_id=?').run(sessionId);
  const ins = db.prepare('INSERT INTO session_attendance (session_id,player_id,status) VALUES (?,?,?)');
  [...new Set(present)].forEach((playerId) => ins.run(sessionId, playerId, 'present'));
  [...new Set(absent)].filter((playerId) => !present.includes(playerId)).forEach((playerId) => ins.run(sessionId, playerId, 'absent'));
}

function saveSessionExercises(sessionId, exerciseIds) {
  db.prepare('DELETE FROM session_exercises WHERE session_id=?').run(sessionId);
  const ins = db.prepare('INSERT INTO session_exercises (session_id,exercise_id,sort_order) VALUES (?,?,?)');
  [...new Set(exerciseIds)].forEach((exerciseId, index) => ins.run(sessionId, exerciseId, index));
}

function saveRuns(sessionId, runs) {
  db.prepare('DELETE FROM runs WHERE session_id=?').run(sessionId);
  const ins = db.prepare('INSERT INTO runs (id,session_id,player_id,distance_km,time_min) VALUES (?,?,?,?,?)');
  runs.forEach((run) => {
    if (run.player_id) ins.run(uid(), sessionId, run.player_id, parseFloat(run.distance_km) || null, parseFloat(run.time_min) || null);
  });
}

app.get('/api/stats', (req, res) => {
  const totalSessions = db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c;
  const totalPlayers = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;
  const injured = db.prepare("SELECT COUNT(*) AS c FROM players WHERE status='verletzt'").get().c;
  const sick = db.prepare("SELECT COUNT(*) AS c FROM players WHERE status='krank'").get().c;
  const avgAttendance = totalSessions && totalPlayers
    ? Math.round((db.prepare("SELECT COUNT(*) AS c FROM session_attendance WHERE status='present'").get().c / (totalSessions * totalPlayers)) * 100)
    : 0;
  const attendanceRanking = db.prepare(`
    SELECT p.id, p.name, p.number, p.position,
      COUNT(CASE WHEN sa.status='present' THEN 1 END) AS present_count,
      ? AS total_sessions,
      CASE WHEN ?=0 THEN 0 ELSE ROUND(100.0*COUNT(CASE WHEN sa.status='present' THEN 1 END)/?,0) END AS rate
    FROM players p LEFT JOIN session_attendance sa ON sa.player_id=p.id
    GROUP BY p.id ORDER BY rate DESC, p.name`).all(totalSessions, totalSessions, totalSessions);
  const runRanking = db.prepare(`
    SELECT p.id, p.name, p.number,
      ROUND(SUM(src.distance_km),1) AS total_km, SUM(src.time_min) AS total_min, COUNT(*) AS run_count
    FROM (
      SELECT player_id, distance_km, time_min FROM runs WHERE distance_km IS NOT NULL
      UNION ALL
      SELECT player_id, distance_km, time_min FROM player_performance WHERE distance_km IS NOT NULL
    ) src JOIN players p ON p.id=src.player_id
    GROUP BY p.id ORDER BY total_km DESC`).all().map((row) => {
    let pace = null;
    if (row.total_km > 0 && row.total_min > 0) {
      const minutes = row.total_min / row.total_km;
      pace = `${Math.floor(minutes)}:${Math.round((minutes % 1) * 60).toString().padStart(2, '0')}`;
    }
    return { ...row, pace };
  });
  const goalRanking = db.prepare(`
    SELECT p.id, p.name, p.number, SUM(pp.goals) AS goals, COUNT(*) AS games
    FROM player_performance pp JOIN players p ON p.id=pp.player_id
    WHERE pp.goals IS NOT NULL AND pp.goals > 0
    GROUP BY p.id ORDER BY goals DESC, games ASC`).all();
  const runDetails = db.prepare(`
    SELECT p.id AS player_id, p.name, p.number, pp.id AS entry_id, pp.date, pp.opponent AS title,
      pp.distance_km, pp.time_min, pp.goals, pp.notes, 'player' AS source
    FROM player_performance pp JOIN players p ON p.id=pp.player_id
    WHERE pp.distance_km IS NOT NULL OR pp.time_min IS NOT NULL OR pp.goals > 0
    UNION ALL
    SELECT p.id AS player_id, p.name, p.number, r.id AS entry_id, s.date, s.title,
      r.distance_km, r.time_min, NULL AS goals, NULL AS notes, 'training' AS source
    FROM runs r JOIN players p ON p.id=r.player_id JOIN sessions s ON s.id=r.session_id
    WHERE r.distance_km IS NOT NULL OR r.time_min IS NOT NULL
    ORDER BY date DESC`).all();
  res.json({ totalSessions, totalPlayers, avgAttendance, injured, sick, attendanceRanking, runRanking, goalRanking, runDetails });
});

app.use('/api', (req, res) => notFound(res));

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ==========================================');
  console.log('   🤾 Handball Trainer läuft!');
  console.log(`   http://0.0.0.0:${PORT}`);
  console.log(`   DB: ${DB_PATH}`);
  console.log('  ==========================================');
  console.log('');
});
