import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { fullDate, pluralise } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  ROLES,
  ROLE_LABEL,
  TEAMS,
  TEAM_LABEL,
  type ClientAccount,
  type Division,
  type Role,
  type Team,
  type TeamMember,
  type Viewer,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  Pill,
  Skeleton,
  Stat,
} from '../components/ui.tsx'
import { FilterSelect, SelectField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { Icon } from '../components/Icon.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const TEAM_OPTIONS = TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] }))
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))

interface Person extends TeamMember {
  account: {
    id: string
    email: string
    username: string
    role: Role
    active: boolean
    lastLoginAt: string | null
    signedIn: boolean
  } | null
  activity: {
    openTasks: number
    doneTasks: number
    loggedHours: number
    upcomingLeave: number
  }
}

/**
 * Who exists, what they can reach, and what they have on.
 *
 * Admin-only, and separate from the Team directory on purpose. Team is the
 * roster — a list anyone should be able to read. This is administration: it
 * joins accounts, roles, live sessions, and workload onto the same row, which
 * is a different question and a more sensitive one.
 *
 * What roles actually enforce today is stated on the page rather than implied.
 * A permissions screen that suggests more control than the server applies is
 * worse than none.
 */
export function Users({ viewer }: { viewer: Viewer }) {
  const [division, setDivision] = useState<Division | ''>('')
  const [team, setTeam] = useState<Team | ''>('')
  const [editingAccount, setEditingAccount] = useState<Person | null>(null)
  const [editingMember, setEditingMember] = useState<Person | 'new' | null>(null)
  const [managingClients, setManagingClients] = useState(false)

  const people = useResource<Person[]>(() => api.get('/people'), [])

  const visible = useMemo(
    () =>
      (people.data ?? []).filter(
        (p) => (!division || p.division === division) && (!team || p.team === team),
      ),
    [people.data, division, team],
  )

  const byTeam = useMemo(() => {
    const groups = new Map<string, Person[]>()
    for (const person of visible) {
      const key = person.team ?? 'unassigned'
      const list = groups.get(key)
      if (list) list.push(person)
      else groups.set(key, [person])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [visible])

  const totals = useMemo(() => {
    const all = people.data ?? []
    return {
      people: all.length,
      withAccounts: all.filter((p) => p.account).length,
      signedIn: all.filter((p) => p.account?.signedIn).length,
      admins: all.filter((p) => p.account?.role === 'admin').length,
    }
  }, [people.data])

  if (viewer.account?.role !== 'admin') {
    return (
      <EmptyState
        icon="team"
        title="Admins only"
        hint="Managing accounts and roles is restricted. Ask an owner if you need access."
      />
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Administration"
        title="Users"
        description="Everyone in the group, what they can sign in to, and what they have on."
        actions={
          <>
            <Button icon="crm" onClick={() => setManagingClients(true)}>
              Client logins
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setEditingMember('new')}>
              Add person
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat label="People" value={totals.people} hint="on the roster" />
        <Stat
          label="With logins"
          value={totals.withAccounts}
          hint={`${totals.people - totals.withAccounts} without`}
        />
        <Stat label="Signed in" value={totals.signedIn} hint="live sessions" />
        <Stat label="Admins" value={totals.admins} hint="full access" />
      </div>

      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by division"
          placeholder="All divisions"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <FilterSelect
          ariaLabel="Filter by team"
          placeholder="All teams"
          value={team}
          options={TEAM_OPTIONS}
          onChange={setTeam}
        />
        {(division || team) && (
          <Button
            size="sm"
            onClick={() => {
              setDivision('')
              setTeam('')
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(visible.length, 'person', 'people')}
        </span>
      </Toolbar>

      {people.error ? (
        <ErrorState message={people.error} onRetry={people.reload} />
      ) : people.loading ? (
        <Skeleton rows={4} />
      ) : (
        <div className="space-y-4">
          {byTeam.map(([teamKey, members]) => (
            <Panel
              key={teamKey}
              title={
                <span className="flex items-baseline gap-1.5">
                  {teamKey === 'unassigned' ? 'No team' : TEAM_LABEL[teamKey as Team]}
                  <span className="text-faint">{members.length}</span>
                </span>
              }
              bodyClassName="p-0"
            >
              <ul className="divide-y divide-rule-soft">
                {members.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    onEditMember={() => setEditingMember(person)}
                    onEditAccount={() => setEditingAccount(person)}
                  />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      <RoleNote />

      {editingMember && (
        <MemberForm
          person={editingMember === 'new' ? null : editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => {
            setEditingMember(null)
            people.reload()
          }}
        />
      )}

      {editingAccount && (
        <AccountForm
          person={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={() => {
            setEditingAccount(null)
            people.reload()
          }}
        />
      )}

      {managingClients && <ClientAccounts onClose={() => setManagingClients(false)} />}
    </>
  )
}

function PersonRow({
  person,
  onEditMember,
  onEditAccount,
}: {
  person: Person
  onEditMember: () => void
  onEditAccount: () => void
}) {
  const initials = person.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-sm font-mono text-[11px] font-medium ${
          mark(person.division).tag
        }`}
        aria-hidden
      >
        {initials}
      </span>

      <div className="min-w-0 flex-1 basis-52">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink">{person.name}</p>
          <Tag tag={person.tag} />
          {person.account?.signedIn && (
            <span
              className="size-1.5 rounded-full bg-ready"
              title="Signed in right now"
              aria-label="Signed in"
            />
          )}
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
          {person.role} · {DIVISION_LABEL[person.division]}
        </p>
      </div>

      {/* Access */}
      <div className="w-44 shrink-0">
        {person.account ? (
          <>
            <div className="flex items-center gap-1.5">
              <Pill tone={person.account.active ? 'ready' : 'alert'}>
                {person.account.active ? ROLE_LABEL[person.account.role] : 'Disabled'}
              </Pill>
            </div>
            <p className="mt-1 truncate font-mono text-[10px] text-faint">
              {person.account.username} ·{' '}
              {person.account.lastLoginAt
                ? `last in ${fullDate(person.account.lastLoginAt)}`
                : 'never signed in'}
            </p>
          </>
        ) : (
          <Pill>No login</Pill>
        )}
      </div>

      {/* Workload */}
      <div className="w-40 shrink-0 font-mono text-[10px] text-faint">
        <p>
          <span className="text-ink">{person.activity.openTasks}</span> open ·{' '}
          <span className="text-ink">{person.activity.doneTasks}</span> done
        </p>
        <p className="mt-0.5">
          {person.activity.loggedHours > 0
            ? `${person.activity.loggedHours}h logged`
            : 'no time logged'}
          {person.activity.upcomingLeave > 0 && ' · leave booked'}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="subtle" onClick={onEditMember}>
          Edit
        </Button>
        <Button size="sm" onClick={onEditAccount}>
          {person.account ? 'Access' : 'Give login'}
        </Button>
      </div>
    </li>
  )
}

/**
 * States exactly what roles do today.
 *
 * A permissions screen implying more control than the server enforces is worse
 * than no screen — someone would set a role and believe it restricted something.
 */
function RoleNote() {
  return (
    <div className="mt-6 rounded-md border border-rule bg-wash px-4 py-3">
      <p className="label-mono mb-2 flex items-center gap-1.5">
        <Icon name="alert" size={12} />
        What roles currently enforce
      </p>
      <ul className="space-y-1 font-mono text-[10px] leading-relaxed text-graphite">
        <li>
          <span className="text-ink">Owner / Admin</span> — full access, and the only role that can
          reach this page, manage accounts, or issue client logins. Enforced.
        </li>
        <li>
          <span className="text-ink">Division lead</span> and <span className="text-ink">Member</span>{' '}
          — currently identical to each other: both can read and write every module. The
          division-scoped and assigned-only restrictions in PRD §5 are still Phase 9 work.
        </li>
        <li className="pt-1 text-faint">
          Setting a role today records intent and controls admin access. It does not yet narrow what
          a lead or member can see.
        </li>
      </ul>
    </div>
  )
}

function MemberForm({
  person,
  onClose,
  onSaved,
}: {
  person: Person | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(person?.name ?? '')
  const [role, setRole] = useState(person?.role ?? '')
  const [division, setDivision] = useState<Division | ''>(person?.division ?? 'tuenx')
  const [team, setTeam] = useState<Team | ''>(person?.team ?? '')
  const [email, setEmail] = useState(person?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { name, role, division, team, email }
      if (person) await api.patch(`/team/${person.id}`, payload)
      else await api.post('/team', payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={person ? 'Edit person' : 'Add person'}
      subtitle={
        person ? (
          <Tag tag={person.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            Adds them to the roster. Give them a login separately.
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <TextField label="Name" value={name} onChange={setName} required autoFocus />
          <TextField
            label="Job title"
            value={role}
            onChange={setRole}
            required
            placeholder="Engineer, Account Manager, …"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
              hint="Which arm pays for them."
            />
            <SelectField
              label="Team"
              value={team}
              placeholder="No team"
              options={TEAM_OPTIONS}
              onChange={(v) => setTeam(v)}
              hint="What they do."
            />
          </div>

          <TextField label="Email" type="email" value={email} onChange={setEmail} />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : person ? 'Save changes' : 'Add person'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

function AccountForm({
  person,
  onClose,
  onSaved,
}: {
  person: Person
  onClose: () => void
  onSaved: () => void
}) {
  const existing = person.account
  const [email, setEmail] = useState(existing?.email ?? person.email ?? '')
  const [username, setUsername] = useState(
    existing?.username ?? person.name.split(' ')[0]?.toLowerCase() ?? '',
  )
  const [role, setRole] = useState<Role | ''>(existing?.role ?? 'member')
  const [password, setPassword] = useState('')
  const [active, setActive] = useState(existing?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (existing) {
        await api.patch(`/auth/accounts/${existing.id}`, {
          email,
          username,
          role,
          active,
          // Only sent when actually changed — an empty field must not blank it.
          ...(password ? { password } : {}),
        })
      } else {
        await api.post('/auth/accounts', {
          memberId: person.id,
          email,
          username,
          role,
          password,
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    if (!confirm(`Remove ${person.name}'s login? They stay on the roster but cannot sign in.`)) {
      return
    }
    setSaving(true)
    try {
      await api.del(`/auth/accounts/${existing.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={existing ? 'Access' : 'Give a login'}
      subtitle={
        <span className="flex items-center gap-2">
          <Tag tag={person.tag} />
          <span className="font-mono text-[10px] text-faint">{person.name}</span>
        </span>
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Email" type="email" value={email} onChange={setEmail} required />
            <TextField label="Username" value={username} onChange={setUsername} required />
          </div>

          <SelectField
            label="Role"
            value={role}
            options={ROLE_OPTIONS}
            onChange={setRole}
            hint="Admin is the only role enforced today — see the note on the Users page."
          />

          <label>
            <span className="label-mono mb-1.5 block">
              {existing ? 'New password' : 'Password'}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!existing}
              minLength={8}
              autoComplete="new-password"
              placeholder={existing ? 'Leave blank to keep the current one' : 'At least 8 characters'}
              className="w-full rounded-sm border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
            {existing && (
              <span className="mt-1 block text-[11px] text-faint">
                Changing it signs them out of every device.
              </span>
            )}
          </label>

          {existing && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-ink)]"
              />
              <span className="text-sm leading-snug text-ink">
                Account active
                <span className="mt-0.5 block font-mono text-[10px] text-faint">
                  Turning this off signs them out immediately
                </span>
              </span>
            </label>
          )}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {existing && (
            <Button
              type="button"
              variant="danger"
              icon="trash"
              onClick={remove}
              disabled={saving}
              className="mr-auto"
            >
              Remove login
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Save' : 'Create login'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}

/** Client portal logins. Kept behind a button — a different audience entirely. */
function ClientAccounts({ onClose }: { onClose: () => void }) {
  const accounts = useResource<ClientAccount[]>(() => api.get('/auth/client-accounts'), [])

  const toggle = async (account: ClientAccount) => {
    await api.patch(`/auth/client-accounts/${account.id}`, { active: !account.active })
    accounts.reload()
  }

  return (
    <RecordView
      title="Client logins"
      subtitle={
        <span className="font-mono text-[10px] text-faint">
          Read-only portal access, scoped to that client's own records
        </span>
      }
      onClose={onClose}
    >
      <div className="px-5 py-5">
        <p className="mb-4 rounded-sm border border-alert/30 bg-alert/5 px-3 py-2.5 text-[12px] leading-relaxed text-ink">
          <strong className="font-medium">These have no password.</strong> An email address is the
          entire credential, so anyone who knows a client's address can read that client's invoices
          and contract value. Safe on localhost only — turn an account off here to revoke it
          immediately.
        </p>

        {accounts.error ? (
          <ErrorState message={accounts.error} onRetry={accounts.reload} />
        ) : accounts.loading ? (
          <Skeleton rows={3} />
        ) : (accounts.data ?? []).length === 0 ? (
          <EmptyState
            icon="crm"
            title="No client logins"
            hint="Create one from a CRM contact when a client needs to see their own invoices."
          />
        ) : (
          <ul className="divide-y divide-rule-soft">
            {accounts.data!.map((account) => (
              <li key={account.id} className="flex items-center gap-3 py-3">
                <Tag tag={account.contact.tag} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">
                    {account.contact.company ?? account.contact.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
                    {account.email}
                    {account.lastLoginAt && ` · last in ${fullDate(account.lastLoginAt)}`}
                  </p>
                </div>
                <Pill tone={account.active ? 'ready' : 'alert'}>
                  {account.active ? 'Active' : 'Off'}
                </Pill>
                <Button size="sm" onClick={() => toggle(account)}>
                  {account.active ? 'Revoke' : 'Enable'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RecordFooter>
        <Button onClick={onClose}>Close</Button>
      </RecordFooter>
    </RecordView>
  )
}
