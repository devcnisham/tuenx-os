import { useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { dateInputValue, money, moneyShort, pluralise } from '../lib/format.ts'
import {
  CONTACT_STAGES,
  CONTACT_STAGE_LABEL,
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABEL,
  DIVISIONS,
  DIVISION_LABEL,
  type Contact,
  type ContactStage,
  type ContractType,
  type Division,
} from '../types.ts'
import { PageHeader, Toolbar } from '../components/PageHeader.tsx'
import { Button, ErrorState, Panel, Pill, Skeleton } from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { Modal, ModalFooter } from '../components/Modal.tsx'
import { Tag } from '../components/Tag.tsx'
import { MoveButton } from './Tasks.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const STAGE_OPTIONS = CONTACT_STAGES.map((s) => ({ value: s, label: CONTACT_STAGE_LABEL[s] }))
const CONTRACT_OPTIONS = CONTRACT_TYPES.map((t) => ({ value: t, label: CONTRACT_TYPE_LABEL[t] }))

/**
 * PRD §6 Phase 1: pipeline by stage, filterable by division, with deal value.
 *
 * Phase 3 adds contract fields (type, value, start/end date) to this same
 * model — the form grows, the board doesn't change shape.
 */
export function Crm() {
  const [division, setDivision] = useState<Division | ''>('')
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)

  const contacts = useResource<Contact[]>(() => api.get('/contacts', { division }), [division])

  const columns = useMemo(
    () =>
      CONTACT_STAGES.map((stage) => {
        const items = (contacts.data ?? []).filter((c) => c.stage === stage)
        return { stage, items, value: items.reduce((total, c) => total + c.value, 0) }
      }),
    [contacts.data],
  )

  // "In play" excludes closed — matching how the Overview rollup counts it.
  const openValue = columns
    .filter((c) => c.stage !== 'closed')
    .reduce((total, c) => total + c.value, 0)

  const moveContact = async (contact: Contact, stage: ContactStage) => {
    const previous = contacts.data ?? []
    contacts.set(previous.map((c) => (c.id === contact.id ? { ...c, stage } : c)))
    try {
      await api.patch(`/contacts/${contact.id}`, { stage })
    } catch {
      contacts.set(previous)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Cross-division"
        title="CRM"
        description="Deals across Agency and Gaphatch in one pipeline. Drag a card between stages, or use the arrows on touch."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + New contact
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
          {pluralise(contacts.data?.length ?? 0, 'contact')} ·{' '}
          <span className="text-ink">{money(openValue)}</span> in play
        </span>
      </Toolbar>

      {contacts.error ? (
        <ErrorState message={contacts.error} onRetry={contacts.reload} />
      ) : contacts.loading ? (
        <Skeleton rows={5} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map(({ stage, items, value }) => (
            <StageColumn
              key={stage}
              stage={stage}
              contacts={items}
              value={value}
              onDropContact={(id) => {
                const dropped = contacts.data?.find((c) => c.id === id)
                if (dropped && dropped.stage !== stage) moveContact(dropped, stage)
              }}
              onMove={moveContact}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      {editing && (
        <ContactForm
          contact={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            contacts.reload()
          }}
        />
      )}
    </>
  )
}

function StageColumn({
  stage,
  contacts,
  value,
  onDropContact,
  onMove,
  onEdit,
}: {
  stage: ContactStage
  contacts: Contact[]
  value: number
  onDropContact: (id: string) => void
  onMove: (contact: Contact, stage: ContactStage) => void
  onEdit: (contact: Contact) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <Panel
      title={
        <span className="flex items-baseline gap-1.5">
          {CONTACT_STAGE_LABEL[stage]}
          <span className="text-faint">{contacts.length}</span>
        </span>
      }
      subtitle={
        <span className="font-mono text-[11px] tabular-nums text-ink">{moneyShort(value)}</span>
      }
      className={`transition-colors ${dragOver ? 'border-ink' : ''}`}
      bodyClassName="p-2 min-h-24"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const id = e.dataTransfer.getData('text/plain')
          if (id) onDropContact(id)
        }}
        className="space-y-1.5"
      >
        {contacts.length === 0 ? (
          <p className="py-6 text-center font-mono text-[10px] text-faint">Nothing here</p>
        ) : (
          contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onMove={onMove}
              onEdit={() => onEdit(contact)}
            />
          ))
        )}
      </div>
    </Panel>
  )
}

function ContactCard({
  contact,
  onMove,
  onEdit,
}: {
  contact: Contact
  onMove: (contact: Contact, stage: ContactStage) => void
  onEdit: () => void
}) {
  const index = CONTACT_STAGES.indexOf(contact.stage)

  return (
    <article
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', contact.id)}
      className="relative overflow-hidden rounded-[3px] border border-rule bg-paper py-2 pr-2 pl-3 transition-colors hover:border-ink"
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(contact.division).fill}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <Tag tag={contact.tag} />
        <span className="font-display text-sm font-semibold tabular-nums text-ink">
          {moneyShort(contact.value)}
        </span>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-1.5 block w-full text-left text-[13px] leading-snug text-ink underline-offset-2 hover:underline"
      >
        {contact.name}
      </button>

      {contact.contractType && (
        <p className="mt-1.5">
          <Pill>
            {CONTRACT_TYPE_LABEL[contact.contractType]}
            {contact.contractValue ? ` · ${moneyShort(contact.contractValue)}` : ''}
          </Pill>
        </p>
      )}

      <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-faint">
        <span className="truncate">{contact.company ?? '—'}</span>
        <span className="ml-auto flex shrink-0 gap-1">
          <MoveButton
            label={`Move ${contact.tag} back`}
            disabled={index === 0}
            onClick={() => onMove(contact, CONTACT_STAGES[index - 1]!)}
          >
            ←
          </MoveButton>
          <MoveButton
            label={`Move ${contact.tag} forward`}
            disabled={index === CONTACT_STAGES.length - 1}
            onClick={() => onMove(contact, CONTACT_STAGES[index + 1]!)}
          >
            →
          </MoveButton>
        </span>
      </div>
    </article>
  )
}

function ContactForm({
  contact,
  onClose,
  onSaved,
}: {
  contact: Contact | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(contact?.name ?? '')
  const [company, setCompany] = useState(contact?.company ?? '')
  const [division, setDivision] = useState<Division | ''>(contact?.division ?? 'agency')
  const [stage, setStage] = useState<ContactStage | ''>(contact?.stage ?? 'lead')
  const [value, setValue] = useState(String(contact?.value ?? ''))
  const [email, setEmail] = useState(contact?.email ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [contractType, setContractType] = useState<ContractType | ''>(contact?.contractType ?? '')
  const [contractValue, setContractValue] = useState(String(contact?.contractValue ?? ''))
  const [startDate, setStartDate] = useState(dateInputValue(contact?.startDate ?? null))
  const [endDate, setEndDate] = useState(dateInputValue(contact?.endDate ?? null))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = {
        name,
        company,
        division,
        stage,
        value: value === '' ? 0 : Number(value),
        email,
        notes,
        // Sent as a unit — clearing the type clears the terms with it, rather
        // than leaving orphan dates on a contact with no contract.
        contractType,
        contractValue: contractType === '' ? '' : contractValue,
        startDate: contractType === '' ? '' : startDate,
        endDate: contractType === '' ? '' : endDate,
      }
      if (contact) await api.patch(`/contacts/${contact.id}`, body)
      else await api.post('/contacts', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!contact || !confirm(`Delete ${contact.tag}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/contacts/${contact.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={contact ? 'Edit contact' : 'New contact'}
      subtitle={
        contact ? (
          <Tag tag={contact.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. AGY-C007
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" value={name} onChange={setName} required autoFocus />
            <TextField label="Company" value={company} onChange={setCompany} />
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
            <SelectField label="Stage" value={stage} options={STAGE_OPTIONS} onChange={setStage} />
            <TextField
              label="Deal value"
              type="number"
              min={0}
              step={100}
              value={value}
              onChange={setValue}
              placeholder="0"
            />
            <TextField label="Email" type="email" value={email} onChange={setEmail} />
          </div>

          <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={3} />

          {/* Phase 3 contract terms. Optional — a lead has no contract yet. */}
          <fieldset className="border-t border-rule pt-4">
            <legend className="label-mono mb-3">Contract</legend>

            <div className="space-y-4">
              <SelectField
                label="Type"
                value={contractType}
                placeholder="No contract"
                options={CONTRACT_OPTIONS}
                onChange={(v) => setContractType(v)}
                hint="A retainer bills on a cycle; a project bills against a fixed scope."
              />

              {contractType !== '' && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField
                    label={contractType === 'retainer' ? 'Per cycle' : 'Total value'}
                    type="number"
                    min={0}
                    step={100}
                    value={contractValue}
                    onChange={setContractValue}
                    placeholder="0"
                  />
                  <TextField
                    label="Starts"
                    type="date"
                    value={startDate}
                    onChange={setStartDate}
                  />
                  <TextField label="Ends" type="date" value={endDate} onChange={setEndDate} />
                </div>
              )}
            </div>
          </fieldset>

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <ModalFooter>
          {contact && (
            <Button
              type="button"
              variant="danger"
              onClick={remove}
              disabled={saving}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : contact ? 'Save changes' : 'Create contact'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
