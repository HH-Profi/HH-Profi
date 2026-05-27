const data = { players: [], exercises: [], sessions: [], attendance: [] };

const el = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID();

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function calcPace(timeMin, distanceKm) {
  if (!timeMin || !distanceKm || distanceKm <= 0) return null;
  const pace = timeMin / distanceKm;
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60).toString().padStart(2, '0');
  return `${m}:${s} min/km`;
}

function attendanceRate(playerId) {
  const entries = data.attendance.filter((a) => a.playerId === playerId);
  if (!entries.length) return '0%';
  const present = entries.filter((e) => e.status === 'anwesend' || e.status === 'gesund').length;
  return `${Math.round((present / entries.length) * 100)}%`;
}

function renderPlayers() {
  el('playersTable').innerHTML = data.players.map((p) => {
    const latest = data.attendance.filter(a => a.playerId === p.id).at(-1)?.status || 'unbekannt';
    return `<tr><td>${p.name}</td><td>${p.position || '-'}</td><td>${p.jersey || '-'}</td><td>${latest}</td><td>${attendanceRate(p.id)}</td></tr>`;
  }).join('');
  const picker = el('playerPicker');
  picker.innerHTML = '<option value="">Bitte wählen</option>' + data.players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function renderExercises() {
  el('exerciseList').innerHTML = data.exercises.map((x) => `<li><strong>${x.title}</strong> (${x.category || 'ohne Kategorie'}) – ${x.playersNeeded || '?'} Spieler<br>${x.description}<br><small>Material: ${x.material || '-'} ${x.fileName ? `| Datei: ${x.fileName}` : ''}</small></li>`).join('');
  el('exerciseSelect').innerHTML = data.exercises.map(x => `<option value="${x.id}">${x.title}</option>`).join('');
}

function renderSessions() {
  const byDate = [...data.sessions].sort((a,b)=>a.date.localeCompare(b.date));
  el('sessionList').innerHTML = byDate.map((s) => {
    const exercises = s.exerciseIds.map(id => data.exercises.find(e => e.id===id)?.title).filter(Boolean).join(', ') || '-';
    return `<li><strong>${s.date}</strong> – ${s.title}<br>Übungen: ${exercises}<br>${s.notes || ''}</li>`;
  }).join('');
  el('sessionPicker').innerHTML = '<option value="">Bitte wählen</option>' + byDate.map(s => `<option value="${s.id}">${s.date} – ${s.title}</option>`).join('');
}

function renderAttendance() {
  const rows = data.attendance.map((a) => {
    const player = data.players.find(p => p.id === a.playerId)?.name || 'Unbekannt';
    const session = data.sessions.find(s => s.id === a.sessionId);
    return `<tr><td>${session?.date || '-'}</td><td>${player}</td><td>${a.status}</td><td>${a.timeMin || '-'}</td><td>${a.distanceKm || '-'}</td><td>${a.pace || '-'}</td></tr>`;
  }).join('');
  el('attendanceTable').innerHTML = rows;
}

function renderDashboard() {
  const upcoming = [...data.sessions].filter(s => s.date >= new Date().toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date))[0];
  el('nextTraining').textContent = upcoming ? `${upcoming.date} – ${upcoming.title}` : 'kein geplantes Training';
  const latestByPlayer = new Map();
  data.attendance.forEach(a => latestByPlayer.set(a.playerId, a.status));
  const sickInj = [...latestByPlayer.values()].filter(s=>s==='krank' || s==='verletzt').length;
  el('healthSummary').textContent = `${sickInj} Spieler`;
  if (!data.players.length) {
    el('attendanceAvg').textContent = '-';
  } else {
    const avg = Math.round(data.players.reduce((sum,p)=>sum + parseInt(attendanceRate(p.id)), 0) / data.players.length);
    el('attendanceAvg').textContent = `${avg}%`;
  }
}

el('playerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await api('/api/players', 'POST', { id: uid(), name: f.get('name'), position: f.get('position'), jersey: f.get('jersey'), birthDate: f.get('birthDate'), contact: f.get('contact'), injuryHistory: f.get('injuryHistory') });
  e.target.reset(); await reload();
});

el('exerciseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const file = f.get('file');
  let fileName = '';
  let fileData = '';
  if (file && file.size) {
    fileName = file.name;
    fileData = await file.arrayBuffer().then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
  }
  await api('/api/exercises', 'POST', { id: uid(), title: f.get('title'), category: f.get('category'), playersNeeded: f.get('playersNeeded'), material: f.get('material'), description: f.get('description'), fileName, fileData });
  e.target.reset(); await reload();
});

el('sessionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const selected = [...el('exerciseSelect').selectedOptions].map(o => o.value);
  await api('/api/sessions', 'POST', { id: uid(), date: f.get('date'), title: f.get('title'), notes: f.get('notes'), exerciseIds: selected });
  e.target.reset(); await reload();
});

el('attendanceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const distanceKm = parseFloat(f.get('distanceKm') || '0');
  const timeMin = parseFloat(f.get('timeMin') || '0');
  await api('/api/attendance', 'POST', { id: uid(), sessionId: el('sessionPicker').value, playerId: el('playerPicker').value, status: f.get('status'), distanceKm: distanceKm || null, timeMin: timeMin || null, pace: calcPace(timeMin, distanceKm) });
  e.target.reset(); await reload();
});

['distanceKm','timeMin'].forEach((name) => {
  el('attendanceForm').elements[name].addEventListener('input', () => {
    const dist = parseFloat(el('attendanceForm').elements.distanceKm.value || '0');
    const time = parseFloat(el('attendanceForm').elements.timeMin.value || '0');
    el('paceOutput').textContent = `Pace: ${calcPace(time, dist) || '-'}`;
  });
});

function renderAll() { renderPlayers(); renderExercises(); renderSessions(); renderAttendance(); renderDashboard(); }

async function reload() {
  const fresh = await api('/api/bootstrap');
  data.players = fresh.players;
  data.exercises = fresh.exercises;
  data.sessions = fresh.sessions;
  data.attendance = fresh.attendance;
  renderAll();
}

reload();
