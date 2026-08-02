import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import { dateInputValue, daysUntil, money, moneyShort, shortDate, todayInputValue } from '../lib/format.ts'
import {
  DIVISIONS,
  DIVISION_LABEL,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABEL,
  type Contact,
  type Division,
  type Invoice,
  type InvoiceStatus,
  type Project,
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
  type PillTone,
} from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { Modal, ModalFooter } from '../components/Modal.tsx'
import { Tag } from '../components/Tag.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))
const STATUS_OPTIONS = INVOICE_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_LABEL[s] }))

/** Colour means status, and an invoice's status is the whole point of it. */
const STATUS_TONE: Record<InvoiceStatus, PillTone> = {
  draft: 'neutral',
  sent: 'pending',
  paid: 'ready',
  overdue: 'alert',
}

/**
 * PRD §6 Phase 3: draft → sent → paid → overdue, per invoice.
 *
 * A ledger rather than a kanban. Invoices are read in date order and compared
 * by amount — a board would scatter that across four columns and lose the
 * running totals, which are the reason anyone opens this screen.
 */
export function Invoices() {
  const [division, setDivision] = useState<Division | ''>('')
  const [status, setStatus] = useState<InvoiceStatus | ''>('')
  const [editing, setEditing] = useState<Invoice | 'new' | null>(null)

  const invoices = useResource<Invoice[]>(
    () => api.get('/invoices', { division, status }),
    [division, status],
  )
  const contacts = useResource<Contact[]>(() => api.get('/contacts'), [])
  const projects = useResource<Project[]>(() => api.get('/projects'), [])

  /**
   * Sweep sent-but-past-due invoices to overdue when the module opens.
   *
   * There is no scheduler in this phase, so the honest version is a
   * request-time sweep at the one moment someone is looking at the numbers.
   * Idempotent, and it reloads only if something actually changed.
   */
  useEffect(() => {
    let cancelled = false
    api
      .post<{ updated: number }>('/invoices/sweep-overdue', {})
      .then((result) => {
        if (!cancelled && result.updated > 0) invoices.reload()
      })
      .catch(() => {
        // A failed sweep is not worth an error banner — the list is still correct,
        // it just may show an invoice as sent that is a day past due.
      })
    return () => {
      cancelled = true
    }
    // Once per mount, deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = useMemo(() => {
    const all = invoices.data ?? []
    const sumOf = (s: InvoiceStatus) =>
      all.filter((i) => i.status === s).reduce((sum, i) => sum + i.amount, 0)
    return {
      draft: sumOf('draft'),
      sent: sumOf('sent'),
      paid: sumOf('paid'),
      overdue: sumOf('overdue'),
      outstanding: sumOf('sent') + sumOf('overdue'),
    }
  }, [invoices.data])

  const advance = async (invoice: Invoice, next: InvoiceStatus) => {
    const previous = invoices.data ?? []
    invoices.set(previous.map((i) => (i.id === invoice.id ? { ...i, status: next } : i)))
    try {
      await api.patch(`/invoices/${invoice.id}`, { status: next })
    } catch {
      invoices.set(previous)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Agency · Billing"
        title="Invoices"
        description="What has been billed and what is still owed. Sent invoices past their due date are marked overdue when this page opens."
        actions={
          <Button
            variant="primary"
            onClick={() => setEditing('new')}
            disabled={(contacts.data ?? []).length === 0}
          >
            + New invoice
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat
          label="Outstanding"
          value={moneyShort(totals.outstanding)}
          hint="sent + overdue"
        />
        <Stat
          label="Overdue"
          value={moneyShort(totals.overdue)}
          tone={totals.overdue > 0 ? 'text-alert' : 'text-faint'}
          hint="past due date"
        />
        <Stat label="Paid" value={moneyShort(totals.paid)} hint="collected" />
        <Stat label="Draft" value={moneyShort(totals.draft)} hint="not yet sent" />
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
          ariaLabel="Filter by status"
          placeholder="Any status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        {(division || status) && (
          <Button
            size="sm"
            onClick={() => {
              setDivision('')
              setStatus('')
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {invoices.data?.length ?? 0} shown ·{' '}
          <span className="text-ink">
            {money((invoices.data ?? []).reduce((sum, i) => sum + i.amount, 0))}
          </span>
        </span>
      </Toolbar>

      {invoices.error ? (
        <ErrorState message={invoices.error} onRetry={invoices.reload} />
      ) : invoices.loading ? (
        <Skeleton rows={5} />
      ) : (invoices.data ?? []).length === 0 ? (
        <EmptyState
          title="No invoices"
          hint="Raise one against a client, and optionally against one of their projects."
        />
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-rule">
            {invoices.data!.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                onAdvance={advance}
                onEdit={() => setEditing(invoice)}
              />
            ))}
          </ul>
        </Panel>
      )}

      {editing && (
        <InvoiceForm
          invoice={editing === 'new' ? null : editing}
          contacts={contacts.data ?? []}
          projects={projects.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            invoices.reload()
          }}
        />
      )}
    </>
  )
}

/** The one action that matters per status, rather than a full status picker. */
function nextAction(status: InvoiceStatus): { label: string; next: InvoiceStatus } | null {
  switch (status) {
    case 'draft':
      return { label: 'Mark sent', next: 'sent' }
    case 'sent':
    case 'overdue':
      return { label: 'Mark paid', next: 'paid' }
    case 'paid':
      return null
  }
}

function InvoiceRow({
  invoice,
  onAdvance,
  onEdit,
}: {
  invoice: Invoice
  onAdvance: (invoice: Invoice, next: InvoiceStatus) => void
  onEdit: () => void
}) {
  const action = nextAction(invoice.status)
  const overdueBy = invoice.status === 'overdue' ? Math.abs(daysUntil(invoice.dueDate)) : null

  return (
    <li className="relative flex flex-wrap items-center gap-x-4 gap-y-2 py-3 pr-3 pl-4">
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(invoice.contact.division).fill}
        aria-hidden
      />

      <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
        <Tag tag={invoice.tag} />
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight text-ink">
            {invoice.contact.company ?? invoice.contact.name}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
            {invoice.project ? `${invoice.project.tag} · ${invoice.project.title}` : 'No project'}
          </p>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-display text-lg leading-none font-semibold tabular-nums text-ink">
          {money(invoice.amount)}
        </p>
        <p className="mt-1 font-mono text-[10px] text-faint">
          issued {shortDate(invoice.issueDate)} · due {shortDate(invoice.dueDate)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Pill tone={STATUS_TONE[invoice.status]}>
          {INVOICE_STATUS_LABEL[invoice.status]}
          {overdueBy !== null && ` · ${overdueBy}d`}
        </Pill>

        {action && (
          <Button size="sm" onClick={() => onAdvance(invoice, action.next)}>
            {action.label}
          </Button>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="font-mono text-[10px] text-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          Edit
        </button>
      </div>
    </li>
  )
}

function InvoiceForm({
  invoice,
  contacts,
  projects,
  onClose,
  onSaved,
}: {
  invoice: Invoice | null
  contacts: Contact[]
  projects: Project[]
  onClose: () => void
  onSaved: () => void
}) {
  const [contactId, setContactId] = useState(invoice?.contactId ?? contacts[0]?.id ?? '')
  const [projectId, setProjectId] = useState(invoice?.projectId ?? '')
  const [amount, setAmount] = useState(String(invoice?.amount ?? ''))
  const [status, setStatus] = useState<InvoiceStatus | ''>(invoice?.status ?? 'draft')
  const [issueDate, setIssueDate] = useState(
    invoice ? dateInputValue(invoice.issueDate) : todayInputValue(),
  )
  const [dueDate, setDueDate] = useState(invoice ? dateInputValue(invoice.dueDate) : '')
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The server rejects a project belonging to another client, so only offer
  // the ones that actually apply.
  const availableProjects = projects.filter((p) => p.contactId === contactId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = {
        contactId,
        projectId,
        amount: amount === '' ? 0 : Number(amount),
        status,
        issueDate,
        dueDate,
        notes,
      }
      if (invoice) await api.patch(`/invoices/${invoice.id}`, body)
      else await api.post('/invoices', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!invoice || !confirm(`Delete ${invoice.tag}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await api.del(`/invoices/${invoice.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={invoice ? 'Edit invoice' : 'New invoice'}
      subtitle={
        invoice ? (
          <Tag tag={invoice.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            Tagged with the client's division on save, e.g. AGY-I007
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <SelectField
            label="Client"
            value={contactId}
            options={contacts.map((c) => ({
              value: c.id,
              label: `${c.company ?? c.name} · ${c.tag}`,
            }))}
            onChange={(v) => {
              setContactId(v)
              // A project from the previous client would be rejected on save.
              setProjectId('')
            }}
          />

          <SelectField
            label="Project"
            value={projectId}
            placeholder="No project"
            options={availableProjects.map((p) => ({
              value: p.id,
              label: `${p.title} · ${p.tag}`,
            }))}
            onChange={(v) => setProjectId(v)}
            hint={
              availableProjects.length === 0
                ? 'This client has no projects. The invoice can still stand on its own.'
                : undefined
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Amount"
              type="number"
              min={0}
              step={100}
              value={amount}
              onChange={setAmount}
              required
              placeholder="0"
            />
            <SelectField
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={setStatus}
            />
            <TextField
              label="Issue date"
              type="date"
              value={issueDate}
              onChange={setIssueDate}
              required
            />
            <TextField
              label="Due date"
              type="date"
              value={dueDate}
              onChange={setDueDate}
              required
            />
          </div>

          <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={3} />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <ModalFooter>
          {invoice && (
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
            {saving ? 'Saving…' : invoice ? 'Save changes' : 'Create invoice'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
