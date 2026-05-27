#!/usr/bin/env python3
import json
import os
import sqlite3
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

DB_PATH = os.path.join(os.path.dirname(__file__), 'training.db')


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript(
            '''
            CREATE TABLE IF NOT EXISTS players (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                position TEXT,
                jersey TEXT,
                birth_date TEXT,
                contact TEXT,
                injury_history TEXT
            );

            CREATE TABLE IF NOT EXISTS exercises (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT,
                players_needed INTEGER,
                material TEXT,
                description TEXT NOT NULL,
                file_name TEXT,
                file_data TEXT
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                title TEXT NOT NULL,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS session_exercises (
                session_id TEXT NOT NULL,
                exercise_id TEXT NOT NULL,
                PRIMARY KEY (session_id, exercise_id),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (exercise_id) REFERENCES exercises(id)
            );

            CREATE TABLE IF NOT EXISTS attendance (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                player_id TEXT NOT NULL,
                status TEXT NOT NULL,
                distance_km REAL,
                time_min REAL,
                pace TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (player_id) REFERENCES players(id)
            );
            '''
        )


def rows(conn, query, params=()):
    return [dict(r) for r in conn.execute(query, params).fetchall()]


class Handler(SimpleHTTPRequestHandler):

    def _id_from_path(self, prefix):
        if self.path.startswith(prefix + '/'):
            return self.path[len(prefix) + 1:]
        return None

    def _json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/bootstrap':
            with get_conn() as conn:
                players = rows(conn, 'SELECT id,name,position,jersey,birth_date as birthDate,contact,injury_history as injuryHistory FROM players ORDER BY name')
                exercises = rows(conn, 'SELECT id,title,category,players_needed as playersNeeded,material,description,file_name as fileName,file_data as fileData FROM exercises ORDER BY title')
                sessions = rows(conn, 'SELECT id,date,title,notes FROM sessions ORDER BY date')
                links = rows(conn, 'SELECT session_id, exercise_id FROM session_exercises')
                attendance = rows(conn, 'SELECT id,session_id as sessionId,player_id as playerId,status,distance_km as distanceKm,time_min as timeMin,pace,created_at as createdAt FROM attendance ORDER BY created_at')

            by_session = {}
            for l in links:
                by_session.setdefault(l['session_id'], []).append(l['exercise_id'])
            for s in sessions:
                s['exerciseIds'] = by_session.get(s['id'], [])

            return self._json(200, {
                'players': players,
                'exercises': exercises,
                'sessions': sessions,
                'attendance': attendance,
            })

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', '0'))
        try:
            payload = json.loads(self.rfile.read(length) if length else b'{}')
        except json.JSONDecodeError:
            return self._json(400, {'error': 'Invalid JSON'})

        with get_conn() as conn:
            if parsed.path == '/api/players':
                conn.execute('INSERT INTO players (id,name,position,jersey,birth_date,contact,injury_history) VALUES (?,?,?,?,?,?,?)', (
                    payload['id'], payload['name'], payload.get('position'), payload.get('jersey'), payload.get('birthDate'), payload.get('contact'), payload.get('injuryHistory')
                ))
                return self._json(201, {'ok': True})

            if parsed.path == '/api/exercises':
                conn.execute('INSERT INTO exercises (id,title,category,players_needed,material,description,file_name,file_data) VALUES (?,?,?,?,?,?,?,?)', (
                    payload['id'], payload['title'], payload.get('category'), payload.get('playersNeeded'), payload.get('material'), payload['description'], payload.get('fileName'), payload.get('fileData')
                ))
                return self._json(201, {'ok': True})

            if parsed.path == '/api/sessions':
                conn.execute('INSERT INTO sessions (id,date,title,notes) VALUES (?,?,?,?)', (
                    payload['id'], payload['date'], payload['title'], payload.get('notes')
                ))
                for ex_id in payload.get('exerciseIds', []):
                    conn.execute('INSERT INTO session_exercises (session_id,exercise_id) VALUES (?,?)', (payload['id'], ex_id))
                return self._json(201, {'ok': True})

            if parsed.path == '/api/attendance':
                conn.execute('INSERT INTO attendance (id,session_id,player_id,status,distance_km,time_min,pace,created_at) VALUES (?,?,?,?,?,?,?,?)', (
                    payload['id'], payload['sessionId'], payload['playerId'], payload['status'], payload.get('distanceKm'), payload.get('timeMin'), payload.get('pace'), datetime.utcnow().isoformat()
                ))
                return self._json(201, {'ok': True})

        return self._json(404, {'error': 'Not found'})


    def do_PUT(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', '0'))
        payload = json.loads(self.rfile.read(length) if length else b'{}')
        with get_conn() as conn:
            if parsed.path.startswith('/api/players/'):
                conn.execute('UPDATE players SET name=?,position=?,jersey=?,birth_date=?,contact=?,injury_history=? WHERE id=?', (payload['name'], payload.get('position'), payload.get('jersey'), payload.get('birthDate'), payload.get('contact'), payload.get('injuryHistory'), payload['id']))
                return self._json(200, {'ok': True})
            if parsed.path.startswith('/api/exercises/'):
                conn.execute('UPDATE exercises SET title=?,category=?,players_needed=?,material=?,description=?,file_name=COALESCE(NULLIF(?,''),file_name),file_data=COALESCE(NULLIF(?,''),file_data) WHERE id=?', (payload['title'], payload.get('category'), payload.get('playersNeeded'), payload.get('material'), payload['description'], payload.get('fileName',''), payload.get('fileData',''), payload['id']))
                return self._json(200, {'ok': True})
            if parsed.path.startswith('/api/sessions/'):
                conn.execute('UPDATE sessions SET date=?,title=?,notes=? WHERE id=?', (payload['date'], payload['title'], payload.get('notes'), payload['id']))
                conn.execute('DELETE FROM session_exercises WHERE session_id=?', (payload['id'],))
                for ex_id in payload.get('exerciseIds', []):
                    conn.execute('INSERT INTO session_exercises (session_id,exercise_id) VALUES (?,?)', (payload['id'], ex_id))
                return self._json(200, {'ok': True})
            if parsed.path.startswith('/api/attendance/'):
                conn.execute('UPDATE attendance SET session_id=?,player_id=?,status=?,distance_km=?,time_min=?,pace=? WHERE id=?', (payload['sessionId'], payload['playerId'], payload['status'], payload.get('distanceKm'), payload.get('timeMin'), payload.get('pace'), payload['id']))
                return self._json(200, {'ok': True})
        return self._json(404, {'error': 'Not found'})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        with get_conn() as conn:
            if parsed.path.startswith('/api/players/'):
                conn.execute('DELETE FROM players WHERE id=?', (parsed.path.split('/')[-1],))
                return self._json(200, {'ok': True})
            if parsed.path.startswith('/api/exercises/'):
                conn.execute('DELETE FROM exercises WHERE id=?', (parsed.path.split('/')[-1],))
                return self._json(200, {'ok': True})
            if parsed.path.startswith('/api/sessions/'):
                conn.execute('DELETE FROM sessions WHERE id=?', (parsed.path.split('/')[-1],))
                return self._json(200, {'ok': True})
            if parsed.path.startswith('/api/attendance/'):
                conn.execute('DELETE FROM attendance WHERE id=?', (parsed.path.split('/')[-1],))
                return self._json(200, {'ok': True})
        return self._json(404, {'error': 'Not found'})

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', '8080'))
    print(f'Serving on http://localhost:{port}')
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
