const data = { players: [], exercises: [], sessions: [], attendance: [] };
const el = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID();

async function api(path, method = 'GET', body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const calcPace = (timeMin, distanceKm) => (!timeMin || !distanceKm || distanceKm <= 0) ? null : `${Math.floor(timeMin/distanceKm)}:${Math.round(((timeMin/distanceKm)%1)*60).toString().padStart(2,'0')} min/km`;
const attendanceRate = (playerId) => { const e = data.attendance.filter((a) => a.playerId === playerId); if (!e.length) return '0%'; return `${Math.round((e.filter((x) => x.status === 'anwesend' || x.status === 'gesund').length / e.length) * 100)}%`; };

function resetForm(id) { el(id).reset(); el(id).elements.id && (el(id).elements.id.value = ''); }
function setMulti(select, ids=[]) { [...select.options].forEach(o=>o.selected=ids.includes(o.value)); }

function renderPlayers() {
  el('playersTable').innerHTML = data.players.map((p) => `<tr><td>${p.name}</td><td>${p.position||'-'}</td><td>${p.jersey||'-'}</td><td>${data.attendance.filter(a=>a.playerId===p.id).at(-1)?.status||'unbekannt'}</td><td>${attendanceRate(p.id)}</td><td><button onclick="editPlayer('${p.id}')">Bearbeiten</button> <button class='ghost' onclick="delPlayer('${p.id}')">Löschen</button></td></tr>`).join('');
  el('playerPicker').innerHTML = '<option value="">Bitte wählen</option>' + data.players.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
}
function renderExercises() {
  el('exerciseList').innerHTML = data.exercises.map((x) => `<li><strong>${x.title}</strong> (${x.category||'ohne Kategorie'})<br>${x.description}<br><small>Material: ${x.material||'-'} | Spieler: ${x.playersNeeded||'-'} ${x.fileName?`| Datei: ${x.fileName}`:''}</small><div class='inline-actions'><button onclick="editExercise('${x.id}')">Bearbeiten</button><button class='ghost' onclick="delExercise('${x.id}')">Löschen</button></div></li>`).join('');
  el('exerciseSelect').innerHTML = data.exercises.map((x) => `<option value="${x.id}">${x.title}</option>`).join('');
}
function renderSessions() {
  const byDate = [...data.sessions].sort((a,b)=>a.date.localeCompare(b.date));
  el('sessionList').innerHTML = byDate.map((s) => `<li><strong>${s.date}</strong> – ${s.title}<br>Übungen: ${(s.exerciseIds||[]).map(id=>data.exercises.find(e=>e.id===id)?.title).filter(Boolean).join(', ')||'-'}<br>${s.notes||''}<div class='inline-actions'><button onclick="editSession('${s.id}')">Bearbeiten</button><button class='ghost' onclick="delSession('${s.id}')">Löschen</button></div></li>`).join('');
  el('sessionPicker').innerHTML = '<option value="">Bitte wählen</option>' + byDate.map((s) => `<option value="${s.id}">${s.date} – ${s.title}</option>`).join('');
}
function renderAttendance() {
  el('attendanceTable').innerHTML = data.attendance.map((a) => `<tr><td>${data.sessions.find(s=>s.id===a.sessionId)?.date||'-'}</td><td>${data.players.find(p=>p.id===a.playerId)?.name||'Unbekannt'}</td><td>${a.status}</td><td>${a.timeMin||'-'}</td><td>${a.distanceKm||'-'}</td><td>${a.pace||'-'}</td><td><button onclick="editAttendance('${a.id}')">Bearbeiten</button> <button class='ghost' onclick="delAttendance('${a.id}')">Löschen</button></td></tr>`).join('');
}
function renderDashboard() {
  const upcoming = data.sessions.filter(s=>s.date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date))[0];
  el('nextTraining').textContent = upcoming ? `${upcoming.date} – ${upcoming.title}` : 'kein geplantes Training';
  const latest = new Map(); data.attendance.forEach(a=>latest.set(a.playerId,a.status));
  el('healthSummary').textContent = `${[...latest.values()].filter(s=>s==='krank'||s==='verletzt').length} Spieler`;
  el('attendanceAvg').textContent = data.players.length ? `${Math.round(data.players.reduce((sum,p)=>sum+parseInt(attendanceRate(p.id)),0)/data.players.length)}%` : '-';
}
function renderAll(){renderPlayers();renderExercises();renderSessions();renderAttendance();renderDashboard();}

window.editPlayer = (id) => { const p = data.players.find(x=>x.id===id); const f = el('playerForm').elements; Object.assign(f,{ }); f.id.value=p.id; f.name.value=p.name||''; f.position.value=p.position||''; f.jersey.value=p.jersey||''; f.birthDate.value=p.birthDate||''; f.contact.value=p.contact||''; f.injuryHistory.value=p.injuryHistory||''; };
window.editExercise = (id) => { const x = data.exercises.find(e=>e.id===id); const f = el('exerciseForm').elements; f.id.value=x.id; f.title.value=x.title||''; f.category.value=x.category||''; f.playersNeeded.value=x.playersNeeded||''; f.material.value=x.material||''; f.description.value=x.description||''; };
window.editSession = (id) => { const s = data.sessions.find(x=>x.id===id); const f = el('sessionForm').elements; f.id.value=s.id; f.date.value=s.date||''; f.title.value=s.title||''; f.notes.value=s.notes||''; setMulti(el('exerciseSelect'), s.exerciseIds||[]); };
window.editAttendance = (id) => { const a = data.attendance.find(x=>x.id===id); const f = el('attendanceForm').elements; f.id.value=a.id; el('sessionPicker').value=a.sessionId; el('playerPicker').value=a.playerId; f.status.value=a.status; f.distanceKm.value=a.distanceKm||''; f.timeMin.value=a.timeMin||''; el('paceOutput').textContent=`Pace: ${a.pace||'-'}`; };

window.delPlayer = async (id)=>{ if(confirm('Spieler löschen?')) { await api(`/api/players/${id}`,'DELETE'); await reload(); } };
window.delExercise = async (id)=>{ if(confirm('Übung löschen?')) { await api(`/api/exercises/${id}`,'DELETE'); await reload(); } };
window.delSession = async (id)=>{ if(confirm('Einheit löschen?')) { await api(`/api/sessions/${id}`,'DELETE'); await reload(); } };
window.delAttendance = async (id)=>{ if(confirm('Eintrag löschen?')) { await api(`/api/attendance/${id}`,'DELETE'); await reload(); } };

el('playerForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target); const id = f.get('id') || uid(); await api(`/api/players${f.get('id') ? `/${id}`:''}`, f.get('id') ? 'PUT' : 'POST', { id, name:f.get('name'), position:f.get('position'), jersey:f.get('jersey'), birthDate:f.get('birthDate'), contact:f.get('contact'), injuryHistory:f.get('injuryHistory') }); resetForm('playerForm'); await reload(); });
el('exerciseForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target); const id = f.get('id') || uid(); const file=f.get('file'); let fileName='', fileData=''; if(file&&file.size){ fileName=file.name; fileData=await file.arrayBuffer().then(buf=>btoa(String.fromCharCode(...new Uint8Array(buf)))); } await api(`/api/exercises${f.get('id') ? `/${id}`:''}`, f.get('id') ? 'PUT' : 'POST', { id, title:f.get('title'), category:f.get('category'), playersNeeded:f.get('playersNeeded'), material:f.get('material'), description:f.get('description'), fileName, fileData }); resetForm('exerciseForm'); await reload(); });
el('sessionForm').addEventListener('submit', async (e) => { e.preventDefault(); const f=new FormData(e.target); const id=f.get('id')||uid(); await api(`/api/sessions${f.get('id') ? `/${id}`:''}`, f.get('id') ? 'PUT' : 'POST', { id, date:f.get('date'), title:f.get('title'), notes:f.get('notes'), exerciseIds:[...el('exerciseSelect').selectedOptions].map(o=>o.value) }); resetForm('sessionForm'); await reload(); });
el('attendanceForm').addEventListener('submit', async (e) => { e.preventDefault(); const f=new FormData(e.target); const id=f.get('id')||uid(); const distanceKm=parseFloat(f.get('distanceKm')||'0'); const timeMin=parseFloat(f.get('timeMin')||'0'); await api(`/api/attendance${f.get('id') ? `/${id}`:''}`, f.get('id') ? 'PUT' : 'POST', { id, sessionId:el('sessionPicker').value, playerId:el('playerPicker').value, status:f.get('status'), distanceKm:distanceKm||null, timeMin:timeMin||null, pace:calcPace(timeMin,distanceKm) }); resetForm('attendanceForm'); el('paceOutput').textContent='Pace: -'; await reload(); });
['distanceKm','timeMin'].forEach((n)=>el('attendanceForm').elements[n].addEventListener('input',()=>{const d=parseFloat(el('attendanceForm').elements.distanceKm.value||'0');const t=parseFloat(el('attendanceForm').elements.timeMin.value||'0');el('paceOutput').textContent=`Pace: ${calcPace(t,d)||'-'}`;}));
['cancelPlayerEdit','cancelExerciseEdit','cancelSessionEdit','cancelAttendanceEdit'].forEach((id,idx)=>el(id).addEventListener('click',()=>resetForm(['playerForm','exerciseForm','sessionForm','attendanceForm'][idx])));

async function reload(){ const fresh=await api('/api/bootstrap'); data.players=fresh.players; data.exercises=fresh.exercises; data.sessions=fresh.sessions; data.attendance=fresh.attendance; renderAll(); }
reload();
