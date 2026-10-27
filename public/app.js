const $ = (id) => document.getElementById(id);
const state = { tasks: [], status: 'all', search: '', priority: 'all', sort: 'created_desc', editing: null };
const dialog = $('task-dialog');
let toastTimer;
const statusLabels = { todo: 'To do', in_progress: 'In progress', completed: 'Completed' };
const priorityLabels = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data;
}
function toast(message, error = false) {
  const el = $('toast'); el.textContent = message; el.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = 'toast', 2800);
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function prettyDate(date) {
  if (!date) return 'No deadline';
  const d = new Date(date + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? escapeHtml(date) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
async function refresh() {
  try {
    const params = new URLSearchParams({ search: state.search, status: state.status, priority: state.priority, sort: state.sort });
    const [taskData, statsData] = await Promise.all([api('/api/tasks?' + params), api('/api/analytics')]);
    state.tasks = taskData.tasks;
    const a = statsData.analytics;
    $('stat-total').textContent = a.total; $('stat-todo').textContent = a.todo;
    $('stat-progress').textContent = a.in_progress; $('stat-completed').textContent = a.completed;
    $('side-total').textContent = a.total; $('completion-rate').textContent = (a.total ? Math.round(a.completed / a.total * 100) : 0) + '%';
    $('api-status').textContent = 'API healthy · SQLite'; $('api-status').style.color = '#35b787';
    $('result-count').textContent = taskData.total + (taskData.total === 1 ? ' task' : ' tasks');
    renderTasks();
  } catch (err) {
    $('api-status').textContent = 'API unavailable'; $('api-status').style.color = '#d94c69';
    $('task-list').innerHTML = '<tr><td colspan="5" class="empty-state"><strong>Could not load tasks</strong>' + escapeHtml(err.message) + '<br><button class="secondary-btn" onclick="refresh()">Try again</button></td></tr>';
    toast(err.message, true);
  }
}
function renderTasks() {
  const list = $('task-list');
  if (!state.tasks.length) {
    list.innerHTML = '<tr><td colspan="5" class="empty-state"><strong>No tasks found</strong>Try another filter, or create a task to get started.<br><button class="primary-btn" onclick="openCreate()">＋ Create a task</button></td></tr>';
    return;
  }
  list.innerHTML = state.tasks.map(t => {
    const overdue = t.due_date && t.due_date < new Date().toISOString().slice(0,10) && t.status !== 'completed';
    return '<tr><td><div class="task-name"><button class="task-check ' + (t.status === 'completed' ? 'checked' : '') + '" data-action="toggle" data-id="' + t.id + '" aria-label="Toggle completed">' + (t.status === 'completed' ? '✓' : '') + '</button><div><div class="task-title">' + escapeHtml(t.title) + '</div>' + (t.description ? '<div class="task-description">' + escapeHtml(t.description) + '</div>' : '') + (t.tags ? '<div class="tag-line"># ' + escapeHtml(t.tags) + '</div>' : '') + '</div></div></td><td><span class="priority priority-' + t.priority + '">' + priorityLabels[t.priority] + '</span></td><td class="' + (overdue ? 'due-overdue' : '') + '">' + (overdue ? '⚠ ' : '') + prettyDate(t.due_date) + '</td><td><select class="status-badge status-' + t.status + '" data-action="status" data-id="' + t.id + '" aria-label="Change status"><option value="todo" ' + (t.status === 'todo' ? 'selected' : '') + '>To do</option><option value="in_progress" ' + (t.status === 'in_progress' ? 'selected' : '') + '>In progress</option><option value="completed" ' + (t.status === 'completed' ? 'selected' : '') + '>Completed</option></select></td><td><div class="row-actions"><button class="row-btn" data-action="edit" data-id="' + t.id + '" title="Edit task" aria-label="Edit task">✎</button><button class="row-btn delete" data-action="delete" data-id="' + t.id + '" title="Delete task" aria-label="Delete task">⌫</button></div></td></tr>';
  }).join('');
}
function openCreate() {
  state.editing = null; $('task-form').reset(); $('task-id').value = '';
  $('modal-title').textContent = 'Create a task'; $('modal-eyebrow').textContent = 'NEW TASK'; $('save-task').textContent = 'Create task';
  $('status').value = 'todo'; $('priority').value = 'medium'; dialog.showModal(); $('title').focus();
}
function openEdit(task) {
  state.editing = task.id; $('task-id').value = task.id;
  $('title').value = task.title; $('description').value = task.description || '';
  $('status').value = task.status; $('priority').value = task.priority;
  $('due-date').value = task.due_date || ''; $('tags').value = task.tags || '';
  $('modal-title').textContent = 'Edit task'; $('modal-eyebrow').textContent = 'UPDATE TASK'; $('save-task').textContent = 'Save changes';
  dialog.showModal(); $('title').focus();
}
async function saveTask(event) {
  event.preventDefault();
  const payload = { title: $('title').value.trim(), description: $('description').value.trim(), status: $('status').value, priority: $('priority').value, due_date: $('due-date').value, tags: $('tags').value.trim() };
  if (!payload.title) return toast('Please enter a task title.', true);
  const button = $('save-task'); button.disabled = true; button.textContent = 'Saving…';
  try {
    if (state.editing) await api('/api/tasks/' + state.editing, { method: 'PATCH', body: JSON.stringify(payload) });
    else await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    dialog.close(); toast(state.editing ? 'Task updated successfully.' : 'Task created successfully.'); await refresh();
  } catch (err) { toast(err.message, true); }
  finally { button.disabled = false; button.textContent = state.editing ? 'Save changes' : 'Create task'; }
}
async function changeTask(id, patch) {
  try { await api('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify(patch) }); toast('Task updated.'); await refresh(); }
  catch (err) { toast(err.message, true); }
}
$('task-form').addEventListener('submit', saveTask);
$('new-task').addEventListener('click', openCreate);
$('close-modal').addEventListener('click', () => dialog.close());
$('cancel-modal').addEventListener('click', () => dialog.close());
$('export-btn').addEventListener('click', () => { window.location.href = '/api/tasks/export.csv'; toast('Preparing CSV export…'); });
$('search').addEventListener('input', e => { state.search = e.target.value; clearTimeout(window.searchDebounce); window.searchDebounce = setTimeout(refresh, 220); });
$('status-filter').addEventListener('change', e => { state.status = e.target.value; refresh(); });
$('priority-filter').addEventListener('change', e => { state.priority = e.target.value; refresh(); });
$('sort-filter').addEventListener('change', e => { state.sort = e.target.value; refresh(); });
$('nav-all').addEventListener('click', () => { state.status = 'all'; $('status-filter').value = 'all'; $('crumb').textContent = 'All tasks'; $('list-title').textContent = 'All tasks'; refresh(); });
$('nav-dashboard').addEventListener('click', () => { state.status = 'all'; $('status-filter').value = 'all'; $('crumb').textContent = 'Overview'; $('list-title').textContent = 'Your tasks'; refresh(); });
document.querySelectorAll('.status-nav').forEach(btn => btn.addEventListener('click', () => { state.status = btn.dataset.status; $('status-filter').value = state.status; $('crumb').textContent = btn.textContent.trim(); $('list-title').textContent = btn.textContent.trim() + ' tasks'; refresh(); }));
$('task-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  const id = Number(btn.dataset.id), action = btn.dataset.action, task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (action === 'toggle') return changeTask(id, { status: task.status === 'completed' ? 'todo' : 'completed' });
  if (action === 'edit') return openEdit(task);
  if (action === 'delete') {
    if (!confirm('Delete "' + task.title + '"? This cannot be undone.')) return;
    try { await api('/api/tasks/' + id, { method: 'DELETE' }); toast('Task deleted.'); await refresh(); }
    catch (err) { toast(err.message, true); }
  }
});
$('task-list').addEventListener('change', e => {
  if (e.target.dataset.action === 'status') changeTask(Number(e.target.dataset.id), { status: e.target.value });
});
$('theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('taskflow-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});
if (localStorage.getItem('taskflow-theme') === 'dark') document.body.classList.add('dark');
window.openCreate = openCreate; window.refresh = refresh;
refresh();
