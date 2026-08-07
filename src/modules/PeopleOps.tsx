import { useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import {
  dateInputValue,
  dueLabel,
  fullDate,
  money,
  moneyShort,
  pluralise,
  shortDate,
  todayInputValue,
} from '../lib/format.ts'
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  CANDIDATE_STAGES,
  CANDIDATE_STAGE_LABEL,
  CONTRACT_KINDS,
  CONTRACT_KIND_LABEL,
  DIVISIONS,
  DIVISION_LABEL,
  LEAVE_STATUSES,
  LEAVE_STATUS_LABEL,
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  type Campaign,
  type CampaignStatus,
  type Candidate,
  type CandidateStage,
  type CompanyContract,
  type ContractKind,
  type Division,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
  type Product,
  type TeamMember,
  type Vendor,
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
  openable,
} from '../components/ui.tsx'
import { FilterSelect, SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { Onboarding } from './Onboarding.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { LinkedRecords, type LinkType } from '../components/LinkedRecords.tsx'
import { Tag } from '../components/Tag.tsx'

/**
 * Phase 6 — hiring, time off, vendors, marketing, and the contracts repository.
 *
 * One module with five tabs rather than five nav entries. They are small, they
 * are all "the running of the company" rather than the work itself, and five
 * more rail items would cost more attention than they are worth.
 *
 * Each tab loads its own data on mount (TRD §6): a vendors outage leaves the
 * hiring board working.
 *
 * Still not payroll and still not tax filing — master plan §4, permanent. Time
 * off here records who is away, nothing more.
 */

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))

const TABS = [
  { id: 'hiring', label: 'Hiring' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'leave', label: 'Time off' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'campaigns', label: 'Marketing' },
  { id: 'contracts', label: 'Contracts' },
] as const

type TabId = (typeof TABS)[number]['id']

export function PeopleOps() {
  const [tab, setTab] = useState<TabId>('hiring')

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · People & Ops"
        title="People & Ops"
        description="Hiring, onboarding and offboarding, time off, what the company pays for, what it is running in market, and every signed contract in one repository."
      />

      <div
        role="tablist"
        aria-label="People and ops sections"
        className="mb-5 flex flex-wrap gap-1 border-b border-rule pb-3"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-sm px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide transition-colors ${
              tab === t.id
                ? 'bg-ink text-surface shadow-card'
                : 'text-graphite hover:bg-wash hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'hiring' && <Hiring />}
      {tab === 'onboarding' && <Onboarding />}
      {tab === 'leave' && <TimeOff />}
      {tab === 'vendors' && <Vendors />}
      {tab === 'campaigns' && <Campaigns />}
      {tab === 'contracts' && <Contracts />}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Hiring                                                                     */
/* -------------------------------------------------------------------------- */

function Hiring() {
  const [division, setDivision] = useState<Division | ''>('')
  const [editing, setEditing] = useState<Candidate | 'new' | null>(null)

  const candidates = useResource<Candidate[]>(
    () => api.get('/ops/candidates', { division }),
    [division],
  )

  const move = async (candidate: Candidate, stage: CandidateStage) => {
    const previous = candidates.data ?? []
    candidates.set(previous.map((c) => (c.id === candidate.id ? { ...c, stage } : c)))
    try {
      await api.patch(`/ops/candidates/${candidate.id}`, { stage })
    } catch {
      candidates.set(previous)
    }
  }

  const open = (candidates.data ?? []).filter((c) => c.stage !== 'hired' && c.stage !== 'passed')

  return (
    <>
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
          {pluralise(open.length, 'candidate')} still in play
        </span>
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + New candidate
        </Button>
      </Toolbar>

      {candidates.error ? (
        <ErrorState message={candidates.error} onRetry={candidates.reload} />
      ) : candidates.loading ? (
        <Skeleton rows={3} />
      ) : (candidates.data ?? []).length === 0 ? (
        <EmptyState
          title="No candidates yet"
          hint="A hiring pipeline is only useful if every conversation lands in it — including the ones that go nowhere."
          icon="team"
          action={{ label: 'Add a candidate', onClick: () => setEditing('new') }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CANDIDATE_STAGES.map((stage) => {
            const items = (candidates.data ?? []).filter((c) => c.stage === stage)
            return (
              <Panel
                key={stage}
                title={
                  <span className="flex items-baseline gap-1.5">
                    {CANDIDATE_STAGE_LABEL[stage]}
                    <span className="text-faint">{items.length}</span>
                  </span>
                }
                bodyClassName="p-2 min-h-20"
              >
                <div className="space-y-1.5">
                  {items.length === 0 ? (
                    <p className="py-5 text-center font-mono text-[10px] text-faint">Nothing here</p>
                  ) : (
                    items.map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        onMove={move}
                        onEdit={() => setEditing(candidate)}
                      />
                    ))
                  )}
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {editing && (
        <CandidateForm
          candidate={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            candidates.reload()
          }}
        />
      )}
    </>
  )
}

function CandidateCard({
  candidate,
  onMove,
  onEdit,
}: {
  candidate: Candidate
  onMove: (candidate: Candidate, stage: CandidateStage) => void
  onEdit: () => void
}) {
  const index = CANDIDATE_STAGES.indexOf(candidate.stage)

  return (
    <article
      {...openable(onEdit)}
      className="relative cursor-pointer overflow-hidden rounded-sm border border-rule bg-surface py-2 pr-2 pl-3 transition-colors hover:border-ink"
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={mark(candidate.division).fill}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <Tag tag={candidate.tag} />
        {candidate.source && (
          <Pill className="max-w-[60%] overflow-hidden text-ellipsis">{candidate.source}</Pill>
        )}
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-1.5 block w-full text-left text-[13px] leading-snug text-ink underline-offset-2 hover:underline"
      >
        {candidate.name}
      </button>

      <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-faint">
        <span className="truncate">{candidate.role}</span>
        <span className="ml-auto flex shrink-0 gap-1">
          <StageButton
            label={`Move ${candidate.tag} back`}
            disabled={index === 0}
            onClick={() => onMove(candidate, CANDIDATE_STAGES[index - 1]!)}
          >
            ←
          </StageButton>
          <StageButton
            label={`Move ${candidate.tag} forward`}
            disabled={index === CANDIDATE_STAGES.length - 1}
            onClick={() => onMove(candidate, CANDIDATE_STAGES[index + 1]!)}
          >
            →
          </StageButton>
        </span>
      </div>
    </article>
  )
}

/** Local twin of the task board's MoveButton — same affordance, no import cycle. */
function StageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      // The card opens the record now, so a stage nudge must not also open it.
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded-xs border border-rule px-1 leading-none text-graphite transition-colors hover:border-ink hover:text-ink disabled:opacity-25 disabled:hover:border-rule"
    >
      {children}
    </button>
  )
}

function CandidateForm({
  candidate,
  onClose,
  onSaved,
}: {
  candidate: Candidate | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(candidate?.name ?? '')
  const [role, setRole] = useState(candidate?.role ?? '')
  const [division, setDivision] = useState<Division | ''>(candidate?.division ?? 'tuenx')
  const [stage, setStage] = useState<CandidateStage | ''>(candidate?.stage ?? 'applied')
  const [source, setSource] = useState(candidate?.source ?? '')
  const [notes, setNotes] = useState(candidate?.notes ?? '')

  return (
    <EntityForm
      title={candidate ? 'Edit candidate' : 'New candidate'}
      tag={candidate?.tag}
      tagHint="Tagged on save, e.g. TNX-H002"
      linkType="candidate"
      linkId={candidate?.id}
      body={{ name, role, division, stage, source, notes }}
      path="/ops/candidates"
      id={candidate?.id}
      deleteWarning={candidate ? `Delete ${candidate.name} (${candidate.tag})?` : ''}
      onClose={onClose}
      onSaved={onSaved}
    >
      <TextField label="Name" value={name} onChange={setName} required autoFocus />
      <TextField label="Role" value={role} onChange={setRole} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Division"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <SelectField
          label="Stage"
          value={stage}
          options={CANDIDATE_STAGES.map((s) => ({ value: s, label: CANDIDATE_STAGE_LABEL[s] }))}
          onChange={setStage}
        />
      </div>
      <TextField
        label="Source"
        value={source}
        onChange={setSource}
        placeholder="Referral, inbound, agency…"
      />
      <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={4} />
    </EntityForm>
  )
}

/* -------------------------------------------------------------------------- */
/* Time off                                                                   */
/* -------------------------------------------------------------------------- */

const LEAVE_TONE = (status: LeaveStatus) =>
  status === 'approved' ? 'ready' : status === 'declined' ? 'alert' : 'pending'

function TimeOff() {
  const [status, setStatus] = useState<LeaveStatus | ''>('')
  const [upcomingOnly, setUpcomingOnly] = useState(true)
  const [editing, setEditing] = useState<LeaveRequest | 'new' | null>(null)

  const leave = useResource<LeaveRequest[]>(
    () => api.get('/ops/leave', { status, upcoming: upcomingOnly ? 'true' : undefined }),
    [status, upcomingOnly],
  )
  const members = useResource<TeamMember[]>(() => api.get('/team'), [])

  const days = (entry: LeaveRequest) =>
    Math.round(
      (new Date(entry.endDate).getTime() - new Date(entry.startDate).getTime()) / 86_400_000,
    ) + 1

  return (
    <>
      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by status"
          placeholder="Any status"
          value={status}
          options={LEAVE_STATUSES.map((s) => ({ value: s, label: LEAVE_STATUS_LABEL[s] }))}
          onChange={setStatus}
        />
        <Button
          size="sm"
          onClick={() => setUpcomingOnly((v) => !v)}
          className={upcomingOnly ? 'border-ink' : ''}
        >
          {upcomingOnly ? 'Upcoming only' : 'All history'}
        </Button>
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(leave.data?.length ?? 0, 'request')}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setEditing('new')}
          disabled={(members.data ?? []).length === 0}
        >
          + Log time off
        </Button>
      </Toolbar>

      {leave.error ? (
        <ErrorState message={leave.error} onRetry={leave.reload} />
      ) : leave.loading ? (
        <Skeleton rows={3} />
      ) : (leave.data ?? []).length === 0 ? (
        <EmptyState
          title={upcomingOnly ? 'Nobody is away' : 'No time off recorded'}
          hint="Recording leave here is what stops a sprint being planned around someone who is on holiday."
          icon="calendar"
          action={{ label: 'Log time off', onClick: () => setEditing('new') }}
        />
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-rule-soft">
            {(leave.data ?? []).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="h-8 w-[3px] shrink-0 rounded-full"
                  style={mark(entry.member.division).fill}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setEditing(entry)}
                    className="flex items-center gap-2 text-left text-[13px] text-ink underline-offset-2 hover:underline"
                  >
                    {/* The leave record's own tag, not the person's — the row is
                        the record, and the name below already says who. */}
                    <Tag tag={entry.tag} />
                    <span className="truncate">{entry.member.name}</span>
                  </button>
                  <p className="mt-0.5 font-mono text-[10px] text-faint">
                    {LEAVE_TYPE_LABEL[entry.type]} · {shortDate(entry.startDate)} –{' '}
                    {shortDate(entry.endDate)} · {pluralise(days(entry), 'day')}
                  </p>
                </div>
                <Pill tone={LEAVE_TONE(entry.status)}>{LEAVE_STATUS_LABEL[entry.status]}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editing && (
        <LeaveForm
          leave={editing === 'new' ? null : editing}
          members={members.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            leave.reload()
          }}
        />
      )}
    </>
  )
}

function LeaveForm({
  leave,
  members,
  onClose,
  onSaved,
}: {
  leave: LeaveRequest | null
  members: TeamMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [memberId, setMemberId] = useState(leave?.memberId ?? members[0]?.id ?? '')
  const [type, setType] = useState<LeaveType | ''>(leave?.type ?? 'holiday')
  const [status, setStatus] = useState<LeaveStatus | ''>(leave?.status ?? 'requested')
  const [startDate, setStartDate] = useState(
    dateInputValue(leave?.startDate ?? null) || todayInputValue(),
  )
  const [endDate, setEndDate] = useState(dateInputValue(leave?.endDate ?? null) || todayInputValue())
  const [notes, setNotes] = useState(leave?.notes ?? '')

  // memberId is fixed after creation — the tag was allocated from that person's
  // division, and a tag is identity, not a label to be re-pointed.
  const body = leave
    ? { type, status, startDate, endDate, notes }
    : { memberId, type, status, startDate, endDate, notes }

  return (
    <EntityForm
      title={leave ? 'Edit time off' : 'Log time off'}
      tag={leave?.tag}
      tagHint="Tagged with the person's division on save, e.g. AGY-L001"
      body={body}
      path="/ops/leave"
      id={leave?.id}
      deleteWarning={leave ? `Delete this ${LEAVE_TYPE_LABEL[leave.type].toLowerCase()} record (${leave.tag})?` : ''}
      onClose={onClose}
      onSaved={onSaved}
    >
      {leave ? (
        <div className="flex items-center gap-2 rounded-sm border border-rule bg-wash px-3 py-2">
          <Tag tag={leave.member.tag} />
          <span className="text-[13px] text-ink">{leave.member.name}</span>
        </div>
      ) : (
        <SelectField
          label="Person"
          value={memberId}
          options={members.map((m) => ({ value: m.id, label: `${m.name} · ${m.tag}` }))}
          onChange={(v) => setMemberId(v)}
          hint="The record inherits this person's division — it has none of its own."
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Type"
          value={type}
          options={LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABEL[t] }))}
          onChange={setType}
        />
        <SelectField
          label="Status"
          value={status}
          options={LEAVE_STATUSES.map((s) => ({ value: s, label: LEAVE_STATUS_LABEL[s] }))}
          onChange={setStatus}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="From" type="date" value={startDate} onChange={setStartDate} required />
        <TextField label="To" type="date" value={endDate} onChange={setEndDate} required />
      </div>
      <TextAreaField label="Notes" value={notes} onChange={setNotes} />
    </EntityForm>
  )
}

/* -------------------------------------------------------------------------- */
/* Vendors                                                                    */
/* -------------------------------------------------------------------------- */

interface VendorPayload {
  vendors: Vendor[]
  monthlyTotal: number
  annualTotal: number
}

function Vendors() {
  const [division, setDivision] = useState<Division | ''>('')
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null)

  const vendors = useResource<VendorPayload>(() => api.get('/ops/vendors', { division }), [division])
  const members = useResource<TeamMember[]>(() => api.get('/team'), [])

  const list = vendors.data?.vendors ?? []
  const unowned = list.filter((v) => !v.owner).length

  return (
    <>
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
          {pluralise(list.length, 'subscription')}
          {unowned > 0 && <span className="text-alert"> · {unowned} with no owner</span>}
        </span>
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + New vendor
        </Button>
      </Toolbar>

      {vendors.error ? (
        <ErrorState message={vendors.error} onRetry={vendors.reload} />
      ) : vendors.loading ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Panel>
              <Stat
                label="Monthly"
                value={moneyShort(vendors.data?.monthlyTotal ?? 0)}
                hint="Recurring spend across every subscription shown"
              />
            </Panel>
            <Panel>
              <Stat
                label="Annualised"
                value={moneyShort(vendors.data?.annualTotal ?? 0)}
                hint="Monthly × 12 — not a forecast, just the run rate"
              />
            </Panel>
            <Panel>
              <Stat
                label="Renewing in 30d"
                value={
                  list.filter((v) => {
                    if (!v.renewalDate) return false
                    const days =
                      (new Date(v.renewalDate).getTime() - Date.now()) / 86_400_000
                    return days >= 0 && days <= 30
                  }).length
                }
                hint="The reason renewal dates are recorded at all"
              />
            </Panel>
          </div>

          {list.length === 0 ? (
            <EmptyState
              title="Nothing tracked yet"
              hint="What the company pays for, when it renews, and who owns it. The third one is what stops an unused tool renewing forever."
              icon="treasury"
              action={{ label: 'Add a vendor', onClick: () => setEditing('new') }}
            />
          ) : (
            <Panel bodyClassName="p-0">
              <ul className="divide-y divide-rule-soft">
                {list.map((vendor) => {
                  const due = vendor.renewalDate ? dueLabel(vendor.renewalDate) : null
                  return (
                    <li key={vendor.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className="h-8 w-[3px] shrink-0 rounded-full"
                        style={mark(vendor.division).fill}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setEditing(vendor)}
                          className="flex items-center gap-2 text-left text-[13px] text-ink underline-offset-2 hover:underline"
                        >
                          <Tag tag={vendor.tag} />
                          <span className="truncate">{vendor.name}</span>
                        </button>
                        <p className="mt-0.5 font-mono text-[10px] text-faint">
                          {vendor.owner ? vendor.owner.name : (
                            <span className="text-alert">No owner</span>
                          )}
                          {vendor.renewalDate && ` · renews ${shortDate(vendor.renewalDate)}`}
                        </p>
                      </div>
                      {due && (
                        <Pill
                          tone={
                            due.tone === 'overdue' ? 'alert' : due.tone === 'soon' ? 'pending' : 'neutral'
                          }
                        >
                          {due.text}
                        </Pill>
                      )}
                      <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-ink">
                        {money(vendor.monthlyCost)}
                        <span className="text-faint">/mo</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}
        </>
      )}

      {editing && (
        <VendorForm
          vendor={editing === 'new' ? null : editing}
          members={members.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            vendors.reload()
          }}
        />
      )}
    </>
  )
}

function VendorForm({
  vendor,
  members,
  onClose,
  onSaved,
}: {
  vendor: Vendor | null
  members: TeamMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(vendor?.name ?? '')
  const [division, setDivision] = useState<Division | ''>(vendor?.division ?? 'tuenx')
  const [monthlyCost, setMonthlyCost] = useState(String(vendor?.monthlyCost ?? ''))
  const [renewalDate, setRenewalDate] = useState(dateInputValue(vendor?.renewalDate ?? null))
  const [ownerId, setOwnerId] = useState(vendor?.ownerId ?? '')
  const [notes, setNotes] = useState(vendor?.notes ?? '')

  return (
    <EntityForm
      title={vendor ? 'Edit vendor' : 'New vendor'}
      tag={vendor?.tag}
      tagHint="Tagged on save, e.g. TNX-N003"
      linkType="vendor"
      linkId={vendor?.id}
      body={{
        name,
        division,
        monthlyCost: Number(monthlyCost || 0),
        renewalDate,
        ownerId,
        notes,
      }}
      path="/ops/vendors"
      id={vendor?.id}
      deleteWarning={vendor ? `Delete ${vendor.name} (${vendor.tag})?` : ''}
      onClose={onClose}
      onSaved={onSaved}
    >
      <TextField label="Name" value={name} onChange={setName} required autoFocus />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Division"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <TextField
          label="Monthly cost"
          type="number"
          min={0}
          step={1}
          value={monthlyCost}
          onChange={setMonthlyCost}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Renews" type="date" value={renewalDate} onChange={setRenewalDate} />
        <SelectField
          label="Owner"
          value={ownerId}
          placeholder="No owner"
          options={members.map((m) => ({ value: m.id, label: `${m.name} · ${m.tag}` }))}
          onChange={(v) => setOwnerId(v)}
          hint="Someone has to decide whether it renews."
        />
      </div>
      <TextAreaField label="Notes" value={notes} onChange={setNotes} />
    </EntityForm>
  )
}

/* -------------------------------------------------------------------------- */
/* Marketing campaigns                                                        */
/* -------------------------------------------------------------------------- */

const CAMPAIGN_TONE = (status: CampaignStatus) =>
  status === 'live' ? 'ready' : status === 'planned' ? 'pending' : 'neutral'

function Campaigns() {
  const [status, setStatus] = useState<CampaignStatus | ''>('')
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)

  const campaigns = useResource<Campaign[]>(() => api.get('/ops/campaigns', { status }), [status])
  const products = useResource<Product[]>(() => api.get('/products'), [])

  return (
    <>
      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by status"
          placeholder="Any status"
          value={status}
          options={CAMPAIGN_STATUSES.map((s) => ({ value: s, label: CAMPAIGN_STATUS_LABEL[s] }))}
          onChange={setStatus}
        />
        {status && (
          <Button size="sm" onClick={() => setStatus('')}>
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(campaigns.data?.length ?? 0, 'campaign')}
        </span>
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + New campaign
        </Button>
      </Toolbar>

      {campaigns.error ? (
        <ErrorState message={campaigns.error} onRetry={campaigns.reload} />
      ) : campaigns.loading ? (
        <Skeleton rows={3} />
      ) : (campaigns.data ?? []).length === 0 ? (
        <EmptyState
          title="No campaigns"
          hint="Marketing is shared: a campaign runs for a division, or for one Gaphatch product."
          icon="products"
          action={{ label: 'Add a campaign', onClick: () => setEditing('new') }}
        />
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-rule-soft">
            {(campaigns.data ?? []).map((campaign) => (
              <li key={campaign.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="h-8 w-[3px] shrink-0 rounded-full"
                  style={mark(campaign.division).fill}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setEditing(campaign)}
                    className="flex items-center gap-2 text-left text-[13px] text-ink underline-offset-2 hover:underline"
                  >
                    <Tag tag={campaign.tag} />
                    <span className="truncate">{campaign.title}</span>
                  </button>
                  <p className="mt-0.5 font-mono text-[10px] text-faint">
                    {campaign.channel} · {shortDate(campaign.date)}
                    {campaign.product && ` · ${campaign.product.name}`}
                  </p>
                </div>
                <Pill tone={CAMPAIGN_TONE(campaign.status)}>
                  {CAMPAIGN_STATUS_LABEL[campaign.status]}
                </Pill>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editing && (
        <CampaignForm
          campaign={editing === 'new' ? null : editing}
          products={products.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            campaigns.reload()
          }}
        />
      )}
    </>
  )
}

function CampaignForm({
  campaign,
  products,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null
  products: Product[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(campaign?.title ?? '')
  const [channel, setChannel] = useState(campaign?.channel ?? '')
  const [division, setDivision] = useState<Division | ''>(campaign?.division ?? 'tuenx')
  const [productId, setProductId] = useState(campaign?.productId ?? '')
  const [status, setStatus] = useState<CampaignStatus | ''>(campaign?.status ?? 'planned')
  const [date, setDate] = useState(dateInputValue(campaign?.date ?? null) || todayInputValue())
  const [notes, setNotes] = useState(campaign?.notes ?? '')

  // Scope is fixed on create, same as an objective: a campaign that changes
  // which product it belongs to has already been renamed into a different thing.
  const body = campaign
    ? { title, channel, status, date, notes }
    : { title, channel, division, productId, status, date, notes }

  return (
    <EntityForm
      title={campaign ? 'Edit campaign' : 'New campaign'}
      tag={campaign?.tag}
      tagHint="Tagged on save, e.g. AGY-G002"
      linkType="campaign"
      linkId={campaign?.id}
      body={body}
      path="/ops/campaigns"
      id={campaign?.id}
      deleteWarning={campaign ? `Delete ${campaign.title} (${campaign.tag})?` : ''}
      onClose={onClose}
      onSaved={onSaved}
    >
      <TextField label="Title" value={title} onChange={setTitle} required autoFocus />
      <TextField
        label="Channel"
        value={channel}
        onChange={setChannel}
        required
        placeholder="Email, LinkedIn, events…"
      />
      {!campaign && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Division"
            value={division}
            options={DIVISION_OPTIONS}
            onChange={setDivision}
            hint="Ignored if a product is chosen — a product campaign is Gaphatch by definition."
          />
          <SelectField
            label="Product"
            value={productId}
            placeholder="Division-wide"
            options={products.map((p) => ({ value: p.id, label: `${p.name} · ${p.tag}` }))}
            onChange={(v) => setProductId(v)}
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Status"
          value={status}
          options={CAMPAIGN_STATUSES.map((s) => ({ value: s, label: CAMPAIGN_STATUS_LABEL[s] }))}
          onChange={setStatus}
        />
        <TextField label="Date" type="date" value={date} onChange={setDate} required />
      </div>
      <TextAreaField label="Notes" value={notes} onChange={setNotes} />
    </EntityForm>
  )
}

/* -------------------------------------------------------------------------- */
/* Contracts repository                                                       */
/* -------------------------------------------------------------------------- */

function Contracts() {
  const [type, setType] = useState<ContractKind | ''>('')
  const [editing, setEditing] = useState<CompanyContract | 'new' | null>(null)

  const contracts = useResource<CompanyContract[]>(() => api.get('/ops/contracts', { type }), [type])

  const list = contracts.data ?? []
  const live = list.filter((c) => !c.endDate || new Date(c.endDate) >= new Date())
  const liveValue = live.reduce((sum, c) => sum + c.value, 0)

  return (
    <>
      <Toolbar>
        <FilterSelect
          ariaLabel="Filter by type"
          placeholder="Any type"
          value={type}
          options={CONTRACT_KINDS.map((k) => ({ value: k, label: CONTRACT_KIND_LABEL[k] }))}
          onChange={setType}
        />
        {type && (
          <Button size="sm" onClick={() => setType('')}>
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {pluralise(list.length, 'contract')} · <span className="text-ink">{money(liveValue)}</span>{' '}
          still running
        </span>
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + New contract
        </Button>
      </Toolbar>

      {contracts.error ? (
        <ErrorState message={contracts.error} onRetry={contracts.reload} />
      ) : contracts.loading ? (
        <Skeleton rows={3} />
      ) : list.length === 0 ? (
        <EmptyState
          title="Nothing filed"
          hint="Company-wide, and separate from the CRM's per-client terms. A contract is stored as a link, not an upload — file storage is out of scope, and a fake attachment is worse than a path."
          icon="docs"
          action={{ label: 'File a contract', onClick: () => setEditing('new') }}
        />
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-rule-soft">
            {list.map((contract) => {
              const ended = contract.endDate ? new Date(contract.endDate) < new Date() : false
              const due = contract.endDate && !ended ? dueLabel(contract.endDate) : null
              return (
                <li key={contract.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="h-8 w-[3px] shrink-0 rounded-full"
                    style={mark(contract.division).fill}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setEditing(contract)}
                      className="flex items-center gap-2 text-left text-[13px] text-ink underline-offset-2 hover:underline"
                    >
                      <Tag tag={contract.tag} />
                      <span className="truncate">{contract.party}</span>
                    </button>
                    <p className="mt-0.5 font-mono text-[10px] text-faint">
                      {CONTRACT_KIND_LABEL[contract.type]}
                      {contract.startDate && ` · from ${shortDate(contract.startDate)}`}
                      {contract.endDate
                        ? ` · ${ended ? 'ended' : 'until'} ${shortDate(contract.endDate)}`
                        : ' · open-ended'}
                    </p>
                  </div>
                  {due && (
                    <Pill tone={due.tone === 'overdue' || due.tone === 'soon' ? 'pending' : 'neutral'}>
                      {due.text}
                    </Pill>
                  )}
                  <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-ink">
                    {moneyShort(contract.value)}
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      {editing && (
        <ContractForm
          contract={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            contracts.reload()
          }}
        />
      )}
    </>
  )
}

function ContractForm({
  contract,
  onClose,
  onSaved,
}: {
  contract: CompanyContract | null
  onClose: () => void
  onSaved: () => void
}) {
  const [party, setParty] = useState(contract?.party ?? '')
  const [division, setDivision] = useState<Division | ''>(contract?.division ?? 'tuenx')
  const [type, setType] = useState<ContractKind | ''>(contract?.type ?? 'client')
  const [value, setValue] = useState(String(contract?.value ?? ''))
  const [startDate, setStartDate] = useState(dateInputValue(contract?.startDate ?? null))
  const [endDate, setEndDate] = useState(dateInputValue(contract?.endDate ?? null))
  const [fileRef, setFileRef] = useState(contract?.fileRef ?? '')
  const [notes, setNotes] = useState(contract?.notes ?? '')

  return (
    <EntityForm
      title={contract ? 'Edit contract' : 'File a contract'}
      tag={contract?.tag}
      tagHint="Tagged on save, e.g. AGY-A004"
      linkType="contract"
      linkId={contract?.id}
      body={{
        party,
        division,
        type,
        value: Number(value || 0),
        startDate,
        endDate,
        fileRef,
        notes,
      }}
      path="/ops/contracts"
      id={contract?.id}
      deleteWarning={contract ? `Delete the ${contract.party} contract (${contract.tag})?` : ''}
      onClose={onClose}
      onSaved={onSaved}
    >
      <TextField label="Party" value={party} onChange={setParty} required autoFocus />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Division"
          value={division}
          options={DIVISION_OPTIONS}
          onChange={setDivision}
        />
        <SelectField
          label="Type"
          value={type}
          options={CONTRACT_KINDS.map((k) => ({ value: k, label: CONTRACT_KIND_LABEL[k] }))}
          onChange={setType}
        />
        <TextField label="Value" type="number" min={0} step={1} value={value} onChange={setValue} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Starts" type="date" value={startDate} onChange={setStartDate} />
        <TextField
          label="Ends"
          type="date"
          value={endDate}
          onChange={setEndDate}
          hint="Leave empty for an open-ended agreement."
        />
      </div>
      <TextField
        label="File"
        value={fileRef}
        onChange={setFileRef}
        placeholder="https://… or a path on the shared drive"
        hint="A link, not an upload. File storage is out of scope for this phase."
      />
      {contract?.fileRef && (
        <p className="font-mono text-[11px] text-faint">
          Filed at <span className="text-ink">{contract.fileRef}</span>
        </p>
      )}
      <TextAreaField label="Notes" value={notes} onChange={setNotes} />
      {contract && (
        <p className="font-mono text-[10px] text-faint">Filed {fullDate(contract.createdAt)}</p>
      )}
    </EntityForm>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared form shell                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Create/edit/delete around a record view.
 *
 * Five entities with the same shape — a flat body, one endpoint, no relations
 * to reconcile — so the submit/delete/error handling is written once here and
 * each form supplies only its fields. Anything with real behaviour of its own
 * (Tasks, Projects) keeps its own form.
 */
function EntityForm({
  title,
  tag,
  tagHint,
  linkType,
  linkId,
  body,
  path,
  id,
  deleteWarning,
  onClose,
  onSaved,
  children,
}: {
  title: string
  tag?: string
  tagHint: string
  linkType?: LinkType
  linkId?: string
  body: Record<string, unknown>
  path: string
  id?: string
  deleteWarning: string
  onClose: () => void
  onSaved: () => void
  children: React.ReactNode
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (id) await api.patch(`${path}/${id}`, body)
      else await api.post(path, body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!id || !confirm(deleteWarning)) return
    setSaving(true)
    try {
      await api.del(`${path}/${id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={title}
      subtitle={
        tag ? <Tag tag={tag} /> : <span className="font-mono text-[10px] text-faint">{tagHint}</span>
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          {children}

          {linkType && linkId && <LinkedRecords type={linkType} id={linkId} />}

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {id && (
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
            {saving ? 'Saving…' : id ? 'Save changes' : 'Create'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
