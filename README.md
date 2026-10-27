# Taskflow — Interactive Dynamic Task Dashboard

A full-stack task management dashboard built with **Vanilla JavaScript**, **Node.js + Express**, and a persistent **SQLite database** (via sql.js/WebAssembly). It includes asynchronous CRUD, search/filter/sorting, task analytics, CSV export, responsive UI, and dark mode.

## Features
- Create, view, update, and delete tasks through REST API endpoints.
- Update status directly from the task list; search titles, descriptions and tags.
- Filter by status and priority; sort by newest, oldest, due date or priority.
- Analytics cards, completion rate, overdue highlighting and CSV export.
- Input validation, JSON errors, health endpoint, responsive UI and dark mode.
- Persistent local SQLite file at `data/tasks.sqlite`; no native DB build toolchain.

## Requirements
Node.js **22.13+** (Node 22 LTS recommended) and npm.

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000. Sample tasks are created on first launch. Your changes persist locally.

Development mode: `npm run dev`  
Tests: `npm test`

## REST API
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health and database status |
| GET | `/api/tasks` | List tasks; query: `search`, `status`, `priority`, `sort` |
| GET | `/api/tasks/:id` | Read one task |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/:id` | Update task fields |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/analytics` | Counts and overdue statistics |
| GET | `/api/tasks/export.csv` | Download CSV |

Statuses: `todo`, `in_progress`, `completed`. Priorities: `low`, `medium`, `high`, `urgent`.

## Project structure
```text
public/ (index.html, styles.css, app.js)
tests/api.test.js
server.js
package.json
.gitignore
README.md
data/ (generated at runtime; ignored by git)
```

## Production note
This is a local development/demo application. Before public production deployment, add authentication and per-user authorization, CSRF protections where applicable, rate limiting, structured logging and production hosting configuration. For multi-process production workloads, use a server database such as PostgreSQL.
