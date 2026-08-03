import express from 'express'
import { errorHandler } from './http.ts'
import { attachViewer, requireTeam } from './auth.ts'
import { authRouter } from './routes/auth.ts'
import { portalRouter } from './routes/portal.ts'
import { overviewRouter } from './routes/overview.ts'
import { tasksRouter } from './routes/tasks.ts'
import { contactsRouter } from './routes/contacts.ts'
import { teamRouter } from './routes/team.ts'
import { productsRouter } from './routes/products.ts'
import { roadmapRouter } from './routes/roadmap.ts'
import { releasesRouter } from './routes/releases.ts'
import { projectsRouter } from './routes/projects.ts'
import { invoicesRouter } from './routes/invoices.ts'
import { treasuryRouter } from './routes/treasury.ts'
import { docsRouter } from './routes/docs.ts'
import { okrsRouter } from './routes/okrs.ts'
import { calendarRouter } from './routes/calendar.ts'
import { plannerRouter } from './routes/planner.ts'
import { linksRouter } from './routes/links.ts'
import { messagesRouter } from './routes/messages.ts'
import { workRouter } from './routes/work.ts'
import { searchRouter } from './routes/search.ts'

/**
 * Tuenx OS API.
 *
 * Three audiences, three levels of access:
 *   owner / admin  the full dashboard — every module
 *   team member    the same API, gated by a signed-in team session
 *   client         /api/portal only, read-only, scoped to their own records
 *
 * Everything below `requireTeam` is default-deny: a route is internal unless
 * it is mounted above the gate. That ordering *is* the security boundary —
 * adding a router below it is safe by default, and adding one above it has to
 * be a deliberate decision.
 */
const app = express()
const port = Number(process.env.API_PORT ?? 5174)

app.use(express.json({ limit: '1mb' }))
app.use(attachViewer)

// --- Open ------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

// Login, logout, and "who am I" must be reachable before a session exists.
// Account management inside this router carries its own admin gate.
app.use('/api/auth', authRouter)

// --- Client portal ---------------------------------------------------------
// Carries its own requireClient gate, and is the only thing a client can reach.
app.use('/api/portal', portalRouter)

// --- Team gate -------------------------------------------------------------
// Everything past this point needs a signed-in team session.
app.use('/api', requireTeam)

// Phase 1
app.use('/api/overview', overviewRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/contacts', contactsRouter)
app.use('/api/team', teamRouter)

// Phase 2
app.use('/api/products', productsRouter)
app.use('/api/roadmap', roadmapRouter)
app.use('/api/releases', releasesRouter)

// Phase 3
app.use('/api/projects', projectsRouter)
app.use('/api/invoices', invoicesRouter)

// Phase 4
app.use('/api/treasury', treasuryRouter)

// Phase 5
app.use('/api/docs', docsRouter)
app.use('/api/okrs', okrsRouter)

// Task depth — epics, sprints, time
app.use('/api/work', workRouter)

// Planning and calendar
app.use('/api/calendar', calendarRouter)
app.use('/api/planner', plannerRouter)

// Cross-module
app.use('/api/links', linksRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/search', searchRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown endpoint' })
})

app.use(errorHandler)

app.listen(port, '127.0.0.1', () => {
  console.log(`[api] Tuenx OS API listening on http://127.0.0.1:${port}`)
})
