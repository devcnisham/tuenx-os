import express from 'express'
import { errorHandler } from './http.ts'
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
import { searchRouter } from './routes/search.ts'

/**
 * Tuenx OS API.
 *
 * No authentication — deliberate, per PRD §5 and TRD §5. Phase 9 adds
 * per-person accounts and role-based permissions; until then this binds to
 * localhost and is not intended to be exposed.
 */
const app = express()
const port = Number(process.env.API_PORT ?? 5174)

app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

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

// Cross-module
app.use('/api/calendar', calendarRouter)
app.use('/api/planner', plannerRouter)

// Cross-module
app.use('/api/search', searchRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown endpoint' })
})

app.use(errorHandler)

app.listen(port, '127.0.0.1', () => {
  console.log(`[api] Tuenx OS API listening on http://127.0.0.1:${port}`)
})
