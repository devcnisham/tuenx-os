import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { pluralise } from '../lib/format.ts'
import { DIVISIONS, DIVISION_LABEL, type Division, type TeamMember } from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { Button, EmptyState, ErrorState, Panel, Skeleton } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextField } from '../components/Field.tsx'
import { Modal, ModalFooter } from '../components/Modal.tsx'
import { Tag } from '../components/Tag.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))

/** PRD §6 Phase 1: roster with role and division tag. Dense — it's a directory. */
export function Team() {
  const [division, setDivision] = useState<Division | ''>('')
  const [editing, setEditing] = useState<TeamMember | 'new' | null>(null)

  const members = useResource<TeamMember[]>(() => api.get('/team'), [])

  const visible = useMemo(
    () => (members.data ?? []).filter((m) => !division || m.division === division),
    [members.data, division],
  )

  const grouped = useMemo(
    () =>
      DIVISIONS.map((d) => ({ division: d, people: visible.filter((m) => m.division === d) })).filter(
        (group) => group.people.length > 0,
      ),
    [visible],
  )

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Directory"
        title="Team"
        description="Everyone in the group, by the division they belong to. Anyone shared across both divisions sits under Tuenx, the parent entity."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + Add person
          </Button>
        }
      />

      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by division"
          placeholder="All divisions"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        {division && (
          <Button size="sm" onClick={() => setDivision('')}>
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(visible.length, 'person', 'people')}
        </span>
      </Toolbar>

      {members.error ? (
        <ErrorState message={members.error} onRetry={members.reload} />
      ) : members.loading ? (
        <Skeleton rows={4} />
      ) : grouped.length === 0 ? (
        <EmptyState
          title="No one here yet"
          hint="Add the first person to start assigning tasks and deals to real names."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {grouped.map(({ division: d, people }) => (
            <Panel
              key={d}
              title={
                <span className="flex items-baseline gap-1.5">
                  {DIVISION_LABEL[d]}
                  <span className="text-faint">{people.length}</span>
                </span>
              }
              bodyClassName="divide-y divide-rule px-3"
            >
              {people.map((member) => (
                <MemberRow key={member.id} member={member} onEdit={() => setEditing(member)} />
              ))}
            </Panel>
          ))}
        </div>
      )}

      {editing && (
        <MemberForm
          member={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            members.reload()
          }}
        />
      )}
    </>
  )
}

function MemberRow({ member, onEdit }: { member: TeamMember; onEdit: () => void }) {
  const initials = member.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="group flex items-center gap-3 py-2.5">
      {/* Initials plate, set in the member's division treatment. */}
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-[2px] font-mono text-[11px] font-medium ${
          mark(member.division).tag
        }`}
        aria-hidden
      >
        {initials}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[13px] font-medium text-ink">{member.name}</p>
          <Tag tag={member.tag} />
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
          {member.role}
          {member.email && <> · {member.email}</>}
        </p>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 font-mono text-[10px] text-faint underline-offset-2 transition-colors group-hover:text-ink hover:underline"
      >
        Edit
      </button>
    </div>
  )
}

function MemberForm({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(member?.name ?? '')
  const [role, setRole] = useState(member?.role ?? '')
  const [division, setDivision] = useState<Division | ''>(member?.division ?? 'tuenx')
  const [email, setEmail] = useState(member?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { name, role, division, email }
      if (member) await api.patch(`/team/${member.id}`, body)
      else await api.post('/team', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!member) return
    if (!confirm(`Remove ${member.name}? Their tasks stay, but become unassigned.`)) return
    setSaving(true)
    try {
      await api.del(`/team/${member.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={member ? 'Edit person' : 'Add person'}
      subtitle={
        member ? (
          <Tag tag={member.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. GPH-M004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <TextField label="Name" value={name} onChange={setName} required autoFocus />
          <TextField
            label="Role"
            value={role}
            onChange={setRole}
            required
            placeholder="Engineer, Account Manager, …"
          />
          <SelectField
            label="Division"
            value={division}
            options={DIVISION_OPTIONS}
            onChange={setDivision}
            hint="Tuenx covers anyone shared across both divisions."
          />
          <TextField label="Email" type="email" value={email} onChange={setEmail} />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <ModalFooter>
          {member && (
            <Button
              type="button"
              variant="danger"
              onClick={remove}
              disabled={saving}
              className="mr-auto"
            >
              Remove
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : member ? 'Save changes' : 'Add person'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
