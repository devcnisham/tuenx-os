import { useState } from 'react'
import { api } from '../lib/api.ts'
import type { Viewer } from '../types.ts'
import { Button } from '../components/ui.tsx'
import { TextField } from '../components/Field.tsx'
import { Icon } from '../components/Icon.tsx'

type Mode = 'team' | 'client'

/**
 * The way in, for both audiences.
 *
 * One screen with two modes rather than two URLs — a client who lands here by
 * mistake should be able to get where they are going without being told they
 * are on the wrong page.
 */
export function SignIn({ onSignedIn }: { onSignedIn: (viewer: Viewer) => void }) {
  const [mode, setMode] = useState<Mode>('team')

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="font-display text-2xl leading-none font-semibold tracking-tight text-ink">
              TUENX
            </span>
            <span className="rounded-xs bg-ink px-1.5 py-0.5 font-mono text-[11px] font-medium text-surface">
              OS
            </span>
          </span>
          <p className="mt-3 text-sm text-graphite">
            {mode === 'team'
              ? 'Sign in to the internal dashboard.'
              : 'Client portal — your projects and invoices.'}
          </p>
        </div>

        <div className="rounded-md bg-surface p-6 shadow-card">
          <div
            role="group"
            aria-label="Who are you"
            className="mb-6 flex overflow-hidden rounded-sm border border-rule"
          >
            {(
              [
                ['team', 'Team'],
                ['client', 'Client'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`flex-1 px-3 py-2 font-mono text-[11px] transition-colors ${
                  mode === value ? 'bg-ink text-surface' : 'bg-surface text-graphite hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'team' ? (
            <TeamForm onSignedIn={onSignedIn} />
          ) : (
            <ClientForm onSignedIn={onSignedIn} />
          )}
        </div>

        <p className="mt-5 text-center font-mono text-[10px] leading-relaxed text-faint">
          Runs on localhost. No sign-in existed before this —<br />
          see master plan §7.
        </p>
      </div>
    </div>
  )
}

function TeamForm({ onSignedIn }: { onSignedIn: (viewer: Viewer) => void }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<{ viewer: Viewer }>('/auth/login', { identifier, password })
      onSignedIn(result.viewer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label="Email or username"
        value={identifier}
        onChange={setIdentifier}
        required
        autoFocus
        placeholder="nisham"
      />
      <label>
        <span className="label-mono mb-1.5 block">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full rounded-sm border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors hover:border-graphite focus:border-ink focus:outline-none"
        />
      </label>

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-alert">
          <Icon name="alert" size={14} className="mt-0.5" />
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={busy} className="w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

function ClientForm({ onSignedIn }: { onSignedIn: (viewer: Viewer) => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<{ viewer: Viewer }>('/auth/client-login', { email })
      onSignedIn(result.viewer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        required
        autoFocus
        placeholder="you@company.com"
      />

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-alert">
          <Icon name="alert" size={14} className="mt-0.5" />
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={busy} className="w-full">
        {busy ? 'Opening…' : 'Open portal'}
      </Button>

      {/*
        Saying this out loud rather than hiding it. The portal has no password
        by explicit decision, and anyone reading this screen should understand
        what that means before it is used anywhere but localhost.
      */}
      <p className="rounded-sm border border-pending/30 bg-wash px-3 py-2 font-mono text-[10px] leading-relaxed text-graphite">
        No password yet — an email address is the whole credential. Fine on a
        local machine, not safe on the open internet.
      </p>
    </form>
  )
}
