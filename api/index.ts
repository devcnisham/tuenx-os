/**
 * Vercel's entry point into the API.
 *
 * Everything under `/api/*` is rewritten here by `vercel.json`, and the Express
 * app routes it exactly as it does locally — same routers, same `requireTeam`
 * boundary, same error handler. One function rather than a file per endpoint,
 * so there is no second copy of the routing table to keep in step.
 */
export { default } from '../server/index.ts'
