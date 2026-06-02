const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('public/index.html', 'utf8');
for (const needle of [
  'id="nav"',
  'data-page="players"',
  'function nav(page)',
  'function setDb(ok,msg)',
  "GET('/players')",
  'function saveSession',
  'function addPerformance',
  "'/players/'+id+'/performance'",
  'Tore pro Spiel',
  'function openImport',
  "POST('/import/'+type",
  'CSV Import',
  'Rangliste Läufe',
  'Rangliste Tore',
  'Alle Läufe / Aktivitäten'
]) {
  if (!html.includes(needle)) throw new Error(`Missing expected UI code: ${needle}`);
}
for (const template of ['public/templates/spieler.csv', 'public/templates/uebungen.csv', 'public/templates/trainings.csv']) {
  if (!fs.existsSync(template)) throw new Error(`Missing CSV template: ${template}`);
}
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n');
new vm.Script(scripts);
console.log('static UI checks passed');
