const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'tasks.sqlite');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(PUBLIC_DIR));

let db;
let saveTimer;
function persist() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}
function run(sql, params = []) {
  db.run(sql, params);
  return db.getRowsModified();
}
function rows(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const result = [];
    while (stmt.step()) result.push(stmt.getAsObject());
    return result;
  } finally { stmt.free(); }
}
function one(sql, params = []) { return rows(sql, params)[0] || null; }
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 30);
}
function cleanTask(input, partial = false) {
  const value = {};
  const fields = ['title', 'description', 'status', 'priority', 'due_date', 'tags'];
  for (const field of fields) {
    if (input[field] !== undefined) value[field] = input[field];
  }
  if (!partial || value.title !== undefined) {
    if (typeof value.title !== 'string' || !value.title.trim()) return { error: 'Title is required.' };
    value.title = value.title.trim().slice(0, 140);
  }
  if (value.description !== undefined) {
    if (typeof value.description !== 'string') return { error: 'Description must be text.' };
    value.description = value.description.trim().slice(0, 2000);
  }
  if (value.status !== undefined && !['todo', 'in_progress', 'completed'].includes(value.status)) return { error: 'Invalid status.' };
  if (value.priority !== undefined && !['low', 'medium', 'high', 'urgent'].includes(value.priority)) return { error: 'Invalid priority.' };
  if (value.due_date !== undefined && value.due_date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(value.due_date)) return { error: 'Due date must use YYYY-MM-DD.' };
  if (value.tags !== undefined) {
    if (Array.isArray(value.tags)) value.tags = value.tags.join(', ');
    if (typeof value.tags !== 'string') return { error: 'Tags must be text.' };
    value.tags = value.tags.slice(0, 300);
  }
  if (!partial) {
    value.description = value.description || '';
    value.status = value.status || 'todo';
    value.priority = value.priority || 'medium';
    value.due_date = value.due_date || '';
    value.tags = value.tags || '';
  }
  return { value };
}
function taskById(id) { return one('SELECT * FROM tasks WHERE id = ?', [id]); }

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: 'sqlite', timestamp: new Date().toISOString() }));
app.get('/api/tasks', (req, res) => {
  const { search = '', status = 'all', priority = 'all', sort = 'created_desc' } = req.query;
  const allowedSort = { created_desc: 'created_at DESC', created_asc: 'created_at ASC', due_asc: "CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC", priority: "CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END" };
  const where = []; const params = [];
  if (String(search).trim()) {
    where.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags) LIKE ?)');
    const term = '%' + String(search).trim().toLowerCase() + '%'; params.push(term, term, term);
  }
  if (status !== 'all' && ['todo','in_progress','completed'].includes(status)) { where.push('status = ?'); params.push(status); }
  if (priority !== 'all' && ['low','medium','high','urgent'].includes(priority)) { where.push('priority = ?'); params.push(priority); }
  const tasks = rows('SELECT * FROM tasks' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY ' + (allowedSort[sort] || allowedSort.created_desc), params);
  res.json({ tasks, total: tasks.length });
});
app.get('/api/tasks/:id', (req, res) => {
  const task = taskById(Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task });
});
app.post('/api/tasks', (req, res) => {
  const parsed = cleanTask(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const t = parsed.value;
  run('INSERT INTO tasks (title, description, status, priority, due_date, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
    [t.title, t.description, t.status, t.priority, t.due_date, t.tags]);
  scheduleSave();
  res.status(201).json({ task: taskById(one('SELECT last_insert_rowid() AS id').id) });
});
app.patch('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid task id.' });
  if (!taskById(id)) return res.status(404).json({ error: 'Task not found.' });
  const parsed = cleanTask(req.body || {}, true);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const entries = Object.entries(parsed.value);
  if (!entries.length) return res.status(400).json({ error: 'Provide at least one field to update.' });
  run('UPDATE tasks SET ' + entries.map(([key]) => key + ' = ?').join(', ') + ", updated_at = datetime('now') WHERE id = ?", [...entries.map(([, value]) => value), id]);
  scheduleSave();
  res.json({ task: taskById(id) });
});
app.delete('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!taskById(id)) return res.status(404).json({ error: 'Task not found.' });
  run('DELETE FROM tasks WHERE id = ?', [id]); scheduleSave();
  res.json({ success: true, id });
});
app.get('/api/analytics', (_req, res) => {
  const counts = one("SELECT COUNT(*) AS total, SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) AS todo, SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN due_date <> '' AND due_date < date('now') AND status <> 'completed' THEN 1 ELSE 0 END) AS overdue FROM tasks");
  const byPriority = rows('SELECT priority, COUNT(*) AS count FROM tasks GROUP BY priority');
  res.json({ analytics: Object.fromEntries(Object.entries(counts).map(([k,v]) => [k, Number(v || 0)])), byPriority });
});
app.get('/api/tasks/export.csv', (_req, res) => {
  const tasks = rows('SELECT id,title,description,status,priority,due_date,tags,created_at,updated_at FROM tasks ORDER BY created_at DESC');
  const quote = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = ['id,title,description,status,priority,due_date,tags,created_at,updated_at', ...tasks.map(t => Object.values(t).map(quote).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="tasks-export.csv"');
  res.send(csv);
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

async function start() {
  const SQL = await initSqlJs();
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = fs.existsSync(DB_FILE) ? new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE))) : new SQL.Database();
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','completed')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
    due_date TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  if (!one('SELECT id FROM tasks LIMIT 1')) {
    const sample = [
      ['Plan weekly sprint','Define goals and split work into deliverable tasks.','in_progress','high','', 'planning, team'],
      ['Review dashboard UI','Check responsive layout and accessibility.','todo','medium','', 'design, ux'],
      ['Ship API improvements','Validate CRUD endpoints and error responses.','completed','urgent','', 'backend, api']
    ];
    for (const t of sample) run("INSERT INTO tasks(title,description,status,priority,due_date,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))", t);
    persist();
  }
  app.listen(PORT, () => console.log(`Taskflow running at http://localhost:${PORT}`));
}
if (require.main === module) start().catch(err => { console.error(err); process.exit(1); });
module.exports = { app, start };
