/**
 * Shared domain vocabulary. Imported by both the React client and the Node API
 * so the two can never drift.
 *
 * Prisma has no native enum on SQLite, so every field the TRD types as an enum
 * is a `String` column constrained here instead. On Postgres (TRD Phase 9)
 * these can become native enums with no application-code change.
 */

// ---------------------------------------------------------------------------
// Divisions
// ---------------------------------------------------------------------------

/**
 * Hardcoded on purpose. Master plan §4 and TRD §5: Tuenx OS is internal-only,
 * the division model is not configurable and there is no multi-tenancy.
 */
export const DIVISIONS = ['tuenx', 'agency', 'gaphatch'] as const
export type Division = (typeof DIVISIONS)[number]

/** Division code used in record tags — the `AGY` in `AGY-T003`. */
export const DIVISION_CODE: Record<Division, string> = {
  tuenx: 'TNX',
  agency: 'AGY',
  gaphatch: 'GPH',
}

export const DIVISION_LABEL: Record<Division, string> = {
  tuenx: 'Tuenx',
  agency: 'Agency',
  gaphatch: 'Gaphatch',
}

/**
 * Type letter used in record tags — the `T` in `AGY-T003`.
 * Sequence numbers count per division per type, so AGY-T001 and GPH-T001 are
 * both valid and distinct.
 */
export const TAG_TYPE = {
  task: 'T',
  contact: 'C',
  member: 'M',
  product: 'P',
  roadmap: 'R',
  release: 'V',
  // Phase 3. `J` for project because `P` is already the product.
  project: 'J',
  invoice: 'I',
  // Phase 4.
  fund: 'F',
  // Phase 5.
  doc: 'D',
  objective: 'O',
  keyResult: 'K',
  // Phase 6. `H` for hire (C is contact), `N` for vendor (V is release),
  // `G` for campaign, `A` for agreement (C is taken).
  candidate: 'H',
  leave: 'L',
  vendor: 'N',
  campaign: 'G',
  contract: 'A',
  // Phase 7. `S` for support, `Z` for metric snapshot (M is member, E is
  // event), `U` for customer.
  ticket: 'S',
  metric: 'Z',
  customer: 'U',
  // Planning and calendar. `B` for brainstorm idea, `Q` for a quarter plan
  // item, `E` for a calendar entry.
  idea: 'B',
  planItem: 'Q',
  entry: 'E',
  // Messaging. `X` for channel — C, M, G, and H were already taken by
  // contact, member, campaign, and hire.
  channel: 'X',
  // Task depth. `Y` for epic (E is a calendar entry), `W` for sprint.
  epic: 'Y',
  sprint: 'W',
} as const
export type TagType = (typeof TAG_TYPE)[keyof typeof TAG_TYPE]

// ---------------------------------------------------------------------------
// Phase 1 — Tasks, CRM, Team
// ---------------------------------------------------------------------------

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

/**
 * The sales pipeline as the founder's diagram draws it (2026-08-03), plus the
 * two states the diagram has no box for.
 *
 * `discovery`, `signed`, and `onboarding` are the new ones: the diagram splits
 * the discovery call out of "lead" and names onboarding as its own step, both
 * of which the old four-stage list buried inside `lead` and `active`.
 *
 * `closed` and `lost` are not on the diagram and are kept anyway — a pipeline
 * with nowhere to put a deal that went away either lies or leaks. `closed`
 * means closed *won* and finished; every pre-existing `closed` row was a won
 * one, so the migration leaves them where they are.
 */
export const CONTACT_STAGES = [
  'lead',
  'discovery',
  'proposal',
  'signed',
  'onboarding',
  'active',
  'closed',
  'lost',
] as const
export type ContactStage = (typeof CONTACT_STAGES)[number]

export const CONTACT_STAGE_LABEL: Record<ContactStage, string> = {
  lead: 'New lead',
  discovery: 'Discovery call',
  proposal: 'Proposal sent',
  signed: 'Contract signed',
  onboarding: 'Onboarding',
  active: 'Active',
  closed: 'Closed won',
  lost: 'Lost',
}

/** Deals that are no longer moving — excluded from pipeline value. */
export const isContactOpen = (stage: ContactStage) => stage !== 'closed' && stage !== 'lost'

// ---------------------------------------------------------------------------
// Task depth — epics, sprints, subtasks, time
// ---------------------------------------------------------------------------

export const EPIC_STATUSES = ['open', 'in_progress', 'done', 'dropped'] as const
export type EpicStatus = (typeof EPIC_STATUSES)[number]

export const EPIC_STATUS_LABEL: Record<EpicStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  dropped: 'Dropped',
}

export const SPRINT_STATUSES = ['planned', 'active', 'closed'] as const
export type SprintStatus = (typeof SPRINT_STATUSES)[number]

export const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  closed: 'Closed',
}

// ---------------------------------------------------------------------------
// Phase 3 — Agency operations
// ---------------------------------------------------------------------------

export const CONTRACT_TYPES = ['retainer', 'project'] as const
export type ContractType = (typeof CONTRACT_TYPES)[number]

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  retainer: 'Retainer',
  project: 'Project',
}

/**
 * The delivery pipeline from the founder's diagram (2026-08-03). See ADR-0002.
 *
 * Replaces `planning | active | on_hold | delivered`, where `active` was doing
 * the work of four distinct stages — kickoff, build, QA, and handoff — which is
 * exactly the information a status field exists to carry.
 *
 * `on_hold` is gone as a *stage* and is now a flag on the project. Work stalls
 * on client sign-off from any stage, and collapsing that into a status
 * destroyed the record of which stage it stalled in.
 *
 * `support` is the warranty period the diagram ends on, and the moment the
 * retainer conversation happens. `closed` is after that.
 */
export const PROJECT_STATUSES = [
  'kickoff',
  'build',
  'qa',
  'handoff',
  'support',
  'closed',
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  kickoff: 'Kickoff & requirements',
  build: 'Build',
  qa: 'QA & review',
  handoff: 'Delivery & handoff',
  support: 'Support & warranty',
  closed: 'Closed',
}

/** Short forms, for board column heads and chips where the full label wraps. */
export const PROJECT_STATUS_SHORT: Record<ProjectStatus, string> = {
  kickoff: 'Kickoff',
  build: 'Build',
  qa: 'QA',
  handoff: 'Handoff',
  support: 'Support',
  closed: 'Closed',
}

/** Finished work. An old due date on one of these is not a problem. */
export const isProjectClosed = (status: ProjectStatus) => status === 'closed'

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
}

// ---------------------------------------------------------------------------
// Phase 6 — People, ops, marketing
// ---------------------------------------------------------------------------

export const CANDIDATE_STAGES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'passed',
] as const
export type CandidateStage = (typeof CANDIDATE_STAGES)[number]

export const CANDIDATE_STAGE_LABEL: Record<CandidateStage, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  passed: 'Passed',
}

/** Time off only. Payroll and tax stay permanently out of scope — master plan §4. */
export const LEAVE_TYPES = ['holiday', 'sick', 'unpaid', 'parental'] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  holiday: 'Holiday',
  sick: 'Sick',
  unpaid: 'Unpaid',
  parental: 'Parental',
}

export const LEAVE_STATUSES = ['requested', 'approved', 'declined'] as const
export type LeaveStatus = (typeof LEAVE_STATUSES)[number]

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  declined: 'Declined',
}

export const CAMPAIGN_STATUSES = ['planned', 'live', 'done'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  planned: 'Planned',
  live: 'Live',
  done: 'Done',
}

/** Named CONTRACT_KINDS because CONTRACT_TYPES is already the CRM retainer/project split. */
export const CONTRACT_KINDS = ['client', 'vendor', 'employment', 'other'] as const
export type ContractKind = (typeof CONTRACT_KINDS)[number]

export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  client: 'Client',
  vendor: 'Vendor',
  employment: 'Employment',
  other: 'Other',
}

// ---------------------------------------------------------------------------
// Phase 7 — Gaphatch customer-facing
// ---------------------------------------------------------------------------

/**
 * What kind of thing came in.
 *
 * Bugs and features are tracked in the same queue on purpose: they compete for
 * the same week of the same engineer, and splitting them into two systems is
 * how a bug list quietly becomes something nobody opens. The kind changes how
 * it is read, not where it lives.
 *
 * A `feature` that survives triage should become a roadmap item — the same
 * promotion an idea gets in Brainstorms.
 */
export const TICKET_KINDS = ['bug', 'issue', 'feature'] as const
export type TicketKind = (typeof TICKET_KINDS)[number]

export const TICKET_KIND_LABEL: Record<TicketKind, string> = {
  bug: 'Bug',
  issue: 'Issue',
  feature: 'Feature request',
}

export const TICKET_STATUSES = ['open', 'pending', 'resolved'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
}

export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'churned'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Active',
  churned: 'Churned',
}

// ---------------------------------------------------------------------------
// Phase 5 — Docs
// ---------------------------------------------------------------------------

/**
 * Suggested categories. Not an enum on the model — a knowledge base that
 * rejects a category nobody anticipated stops getting written in, which is the
 * failure mode PRD §9 flags for Docs. The field is free text; these just
 * prefill the picker.
 */
export const DOC_CATEGORIES = [
  'SOP',
  'Playbook',
  'Onboarding',
  'Policy',
  'Reference',
] as const

// ---------------------------------------------------------------------------
// Phase 5 — OKRs
// ---------------------------------------------------------------------------

/**
 * TRD §3 types Objective.scope as "division | productId" — one overloaded
 * string. Split into a kind plus a real foreign key here, because a single
 * column would mean sniffing a cuid to tell "gaphatch" from an id.
 */
export const OBJECTIVE_SCOPES = ['division', 'product'] as const
export type ObjectiveScope = (typeof OBJECTIVE_SCOPES)[number]

export const KEY_RESULT_STATUSES = ['on_track', 'at_risk', 'off_track', 'done'] as const
export type KeyResultStatus = (typeof KEY_RESULT_STATUSES)[number]

export const KEY_RESULT_STATUS_LABEL: Record<KeyResultStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  done: 'Done',
}

// ---------------------------------------------------------------------------
// Planning — brainstorms and the quarter planner
// ---------------------------------------------------------------------------

/**
 * Ideas stay separate from plan items on purpose. Mixing "someone mentioned
 * this once" with "we are doing this in Q3" is what makes planning boards
 * untrustworthy — people stop writing ideas down because writing one down
 * starts to look like a commitment.
 */
export const IDEA_STATUSES = ['raw', 'shortlisted', 'parked', 'promoted'] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  raw: 'Raw',
  shortlisted: 'Shortlisted',
  parked: 'Parked',
  promoted: 'Promoted',
}

export const PLAN_STATUSES = [
  'planned',
  'committed',
  'in_progress',
  'done',
  'dropped',
] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  planned: 'Planned',
  committed: 'Committed',
  in_progress: 'In progress',
  done: 'Done',
  dropped: 'Dropped',
}

/** Rough size, not an estimate in hours. Hours imply a precision nobody has. */
export const PLAN_EFFORTS = ['s', 'm', 'l'] as const
export type PlanEffort = (typeof PLAN_EFFORTS)[number]

export const PLAN_EFFORT_LABEL: Record<PlanEffort, string> = {
  s: 'Small',
  m: 'Medium',
  l: 'Large',
}

/** Weight used for the per-quarter load bar. Relative, not absolute. */
export const PLAN_EFFORT_WEIGHT: Record<PlanEffort, number> = { s: 1, m: 3, l: 8 }

// ---------------------------------------------------------------------------
// Accounts, roles, and functional teams
// ---------------------------------------------------------------------------

/** PRD §5 roles. Only `admin` is enforced today, for account management. */
export const ROLES = ['admin', 'lead', 'member'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Owner / Admin',
  lead: 'Division lead',
  member: 'Member',
}

/**
 * Functional teams, orthogonal to division.
 *
 * Division says which arm of the group pays for someone; team says what they
 * do. An Agency designer and a Gaphatch designer are the same craft in
 * different arms, and collapsing the two axes would lose that.
 */
export const TEAMS = [
  'engineering',
  'design',
  'product',
  'marketing',
  'sales',
  'people',
  'finance',
  'ops',
  'support',
  'leadership',
] as const
export type Team = (typeof TEAMS)[number]

export const TEAM_LABEL: Record<Team, string> = {
  engineering: 'Engineering',
  design: 'Design',
  product: 'Product',
  marketing: 'Marketing',
  sales: 'Sales',
  people: 'People',
  finance: 'Finance',
  ops: 'Operations',
  support: 'Support',
  leadership: 'Leadership',
}

// ---------------------------------------------------------------------------
// Messaging
//
// Was an explicit non-goal until the founder reversed it — see master plan §7.
// The reversal earns its place through `record` channels: a conversation bound
// to the record it is about.
// ---------------------------------------------------------------------------

export const CHANNEL_KINDS = ['channel', 'dm', 'record'] as const
export type ChannelKind = (typeof CHANNEL_KINDS)[number]

export const CHANNEL_KIND_LABEL: Record<ChannelKind, string> = {
  channel: 'Channel',
  dm: 'Direct',
  record: 'On a record',
}

// ---------------------------------------------------------------------------
// Calendar entries
// ---------------------------------------------------------------------------

export const ENTRY_KINDS = ['event', 'meeting', 'reminder', 'holiday'] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  event: 'Event',
  meeting: 'Meeting',
  reminder: 'Reminder',
  holiday: 'Holiday',
}

/** Offsets offered for a reminder, in minutes before the start. */
export const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At start' },
  { value: '15', label: '15 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
  { value: '10080', label: '1 week before' },
] as const

// ---------------------------------------------------------------------------
// Phase 4 — Tuenx treasury
// ---------------------------------------------------------------------------

export const FUND_TYPES = ['income', 'expense', 'allocation'] as const
export type FundType = (typeof FUND_TYPES)[number]

export const FUND_TYPE_LABEL: Record<FundType, string> = {
  income: 'Income',
  expense: 'Expense',
  allocation: 'Allocation',
}

// ---------------------------------------------------------------------------
// Phase 2 — Gaphatch Products
// ---------------------------------------------------------------------------

export const PRODUCT_STATUSES = ['planning', 'building', 'live'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  planning: 'Planning',
  building: 'Building',
  live: 'Live',
}

export const ROADMAP_STATUSES = ['backlog', 'building', 'shipped'] as const
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number]

export const ROADMAP_STATUS_LABEL: Record<RoadmapStatus, string> = {
  backlog: 'Backlog',
  building: 'Building',
  shipped: 'Shipped',
}

// ---------------------------------------------------------------------------
// Wire types
//
// What the API actually returns. Dates are ISO strings over JSON, not Date
// objects — these are deliberately not the Prisma model types.
// ---------------------------------------------------------------------------

export interface TeamMember {
  id: string
  tag: string
  name: string
  role: string
  division: Division
  /** Functional team. Nullable — not everyone slots into one. */
  team: Team | null
  email: string | null
  createdAt: string
}

/** What the API says about whoever is signed in. Never carries a hash. */
export interface Viewer {
  kind: 'team' | 'client'
  account?: {
    id: string
    role: Role
    memberId: string
    name: string
    division: Division
  }
  client?: {
    id: string
    contactId: string
    name: string
    company: string | null
  }
}

export interface UserAccount {
  id: string
  memberId: string
  member: Pick<TeamMember, 'id' | 'tag' | 'name' | 'division' | 'team'>
  email: string
  username: string
  role: Role
  active: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface ClientAccount {
  id: string
  contactId: string
  contact: Pick<Contact, 'id' | 'tag' | 'name' | 'company'>
  email: string
  active: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface Task {
  id: string
  tag: string
  title: string
  division: Division
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  assignee: Pick<TeamMember, 'id' | 'tag' | 'name' | 'division'> | null
  projectId: string | null
  project: Pick<Project, 'id' | 'tag' | 'title'> | null
  dueDate: string | null
  parentId: string | null
  epicId: string | null
  epic: Pick<Epic, 'id' | 'tag' | 'title'> | null
  sprintId: string | null
  sprint: Pick<Sprint, 'id' | 'tag' | 'name'> | null
  estimateHours: number | null
  createdAt: string
  subtasks?: Task[]
  /** Sum of logged time. Derived from the entries, never stored. */
  loggedHours: number
  counts?: { subtasks: number; subtasksDone: number }
}

export interface Epic {
  id: string
  tag: string
  title: string
  division: Division
  status: EpicStatus
  notes: string | null
  createdAt: string
  counts: { tasks: number; done: number }
  estimateHours: number
  loggedHours: number
}

export interface Sprint {
  id: string
  tag: string
  name: string
  division: Division
  startDate: string
  endDate: string
  goal: string | null
  status: SprintStatus
  createdAt: string
  counts: { tasks: number; done: number }
  estimateHours: number
  loggedHours: number
}

export interface TimeEntry {
  id: string
  taskId: string
  memberId: string | null
  member: Pick<TeamMember, 'id' | 'tag' | 'name'> | null
  hours: number
  date: string
  note: string | null
  createdAt: string
}

export interface Contact {
  id: string
  tag: string
  name: string
  company: string | null
  division: Division
  stage: ContactStage
  value: number
  email: string | null
  notes: string | null
  contractType: ContractType | null
  contractValue: number | null
  startDate: string | null
  endDate: string | null
  createdAt: string
}

export interface Project {
  id: string
  tag: string
  contactId: string
  contact: Pick<Contact, 'id' | 'tag' | 'name' | 'company' | 'division'>
  title: string
  status: ProjectStatus
  /** Stalled where it stands. Orthogonal to status — see ADR-0002. */
  onHold: boolean
  dueDate: string | null
  createdAt: string
  counts: {
    tasks: number
    openTasks: number
    invoices: number
  }
  /** Sum of every invoice on this project, regardless of status. */
  invoicedTotal: number
}

export interface Invoice {
  id: string
  tag: string
  contactId: string
  contact: Pick<Contact, 'id' | 'tag' | 'name' | 'company' | 'division'>
  projectId: string | null
  project: Pick<Project, 'id' | 'tag' | 'title'> | null
  amount: number
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  notes: string | null
  createdAt: string
}

export interface Doc {
  id: string
  tag: string
  title: string
  division: Division
  category: string
  body: string
  updatedAt: string
  createdAt: string
}

export interface KeyResult {
  id: string
  tag: string
  objectiveId: string
  title: string
  targetValue: number
  currentValue: number
  unit: string | null
  status: KeyResultStatus
  createdAt: string
}

export interface Objective {
  id: string
  tag: string
  scopeKind: ObjectiveScope
  division: Division
  productId: string | null
  product: Pick<Product, 'id' | 'tag' | 'name'> | null
  title: string
  period: string
  owner: string | null
  createdAt: string
  keyResults: KeyResult[]
  /** 0–1, averaged across key results. Derived, never stored. */
  progress: number
}

export interface Idea {
  id: string
  tag: string
  title: string
  body: string | null
  division: Division
  status: IdeaStatus
  author: string | null
  votes: number
  createdAt: string
  planItem: Pick<PlanItem, 'id' | 'tag' | 'period'> | null
}

export interface PlanItem {
  id: string
  tag: string
  title: string
  division: Division
  period: string
  status: PlanStatus
  effort: PlanEffort
  owner: string | null
  notes: string | null
  objectiveId: string | null
  objective: Pick<Objective, 'id' | 'tag' | 'title'> | null
  productId: string | null
  product: Pick<Product, 'id' | 'tag' | 'name'> | null
  ideaId: string | null
  createdAt: string
}

export interface CalendarEntry {
  id: string
  tag: string
  title: string
  notes: string | null
  division: Division
  kind: EntryKind
  date: string
  endDate: string | null
  allDay: boolean
  startTime: string | null
  endTime: string | null
  attendees: string | null
  remindMinutesBefore: number | null
  createdAt: string
}

export interface Message {
  id: string
  channelId: string
  authorId: string | null
  author: Pick<TeamMember, 'id' | 'tag' | 'name' | 'division'> | null
  body: string
  editedAt: string | null
  createdAt: string
}

export interface Channel {
  id: string
  tag: string
  name: string
  purpose: string | null
  division: Division
  kind: ChannelKind
  archived: boolean
  recordType: string | null
  recordId: string | null
  createdAt: string
  members: Pick<TeamMember, 'id' | 'tag' | 'name' | 'division'>[]
  messageCount: number
  lastMessage: Message | null
}

export interface Candidate {
  id: string
  tag: string
  name: string
  role: string
  division: Division
  stage: CandidateStage
  source: string | null
  notes: string | null
  createdAt: string
}

export interface LeaveRequest {
  id: string
  tag: string
  memberId: string
  member: Pick<TeamMember, 'id' | 'tag' | 'name' | 'division'>
  type: LeaveType
  startDate: string
  endDate: string
  status: LeaveStatus
  notes: string | null
  createdAt: string
}

export interface Vendor {
  id: string
  tag: string
  name: string
  division: Division
  monthlyCost: number
  renewalDate: string | null
  ownerId: string | null
  owner: Pick<TeamMember, 'id' | 'tag' | 'name'> | null
  notes: string | null
  createdAt: string
}

export interface Campaign {
  id: string
  tag: string
  scopeKind: string
  division: Division
  productId: string | null
  product: Pick<Product, 'id' | 'tag' | 'name'> | null
  title: string
  channel: string
  status: CampaignStatus
  date: string
  notes: string | null
  createdAt: string
}

export interface CompanyContract {
  id: string
  tag: string
  party: string
  division: Division
  type: ContractKind
  value: number
  startDate: string | null
  endDate: string | null
  fileRef: string | null
  notes: string | null
  createdAt: string
}

export interface Ticket {
  id: string
  tag: string
  productId: string
  product: Pick<Product, 'id' | 'tag' | 'name'>
  customerId: string | null
  customerContact: string | null
  subject: string
  body: string | null
  kind: TicketKind
  status: TicketStatus
  priority: TaskPriority
  createdAt: string
}

export interface FundEntry {
  id: string
  tag: string
  division: Division
  type: FundType
  amount: number
  category: string
  date: string
  notes: string | null
}

/** Computed treasury view — PRD §6 Phase 4. */
export interface Treasury {
  balance: number
  income: number
  expenses: number
  /** Average monthly net burn over the trailing window. Null when not burning. */
  monthlyBurn: number | null
  /** Months of runway at that burn. Null when income covers expenses. */
  runwayMonths: number | null
  byDivision: {
    division: Division
    income: number
    expenses: number
    allocated: number
    net: number
  }[]
  entries: FundEntry[]
}

export interface Product {
  id: string
  tag: string
  name: string
  status: ProductStatus
  description: string | null
  /** The live site, or staging while it is still building. */
  url: string | null
  /** Where the code lives. */
  repoUrl: string | null
  createdAt: string
  counts: {
    roadmapTotal: number
    roadmapShipped: number
    releases: number
  }
}

export interface RoadmapItem {
  id: string
  tag: string
  productId: string
  title: string
  status: RoadmapStatus
  createdAt: string
}

export interface Release {
  id: string
  tag: string
  productId: string
  version: string
  notes: string | null
  date: string
}

/** Overview rollup — PRD §6 Phase 1. */
export interface DivisionSummary {
  division: Division
  openTasks: number
  pipelineValue: number
  activeDeals: number
  headcount: number
}

export interface Overview {
  divisions: DivisionSummary[]
  totals: {
    openTasks: number
    pipelineValue: number
    activeDeals: number
    headcount: number
    productsBuilding: number
    productsLive: number
    /** Phase 3 — billed but not collected (sent + overdue). */
    outstandingInvoiced: number
    overdueInvoices: number
    /** Phase 4 — income minus expenses; allocations excluded as internal. */
    treasuryBalance: number
  }
  needsAttention: Task[]
}

/** Cross-module search hit — mirrors the server's SearchHit. */
export interface SearchHit {
  id: string
  tag: string
  title: string
  detail: string | null
  kind:
    | 'task'
    | 'contact'
    | 'member'
    | 'product'
    | 'project'
    | 'invoice'
    | 'doc'
    | 'candidate'
    | 'vendor'
    | 'campaign'
    | 'contract'
    | 'epic'
    | 'sprint'
    | 'ticket'
  route: string
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const oneOf =
  <T extends string>(allowed: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v)

export const isDivision = oneOf(DIVISIONS)
export const isTaskStatus = oneOf(TASK_STATUSES)
export const isTaskPriority = oneOf(TASK_PRIORITIES)
export const isContactStage = oneOf(CONTACT_STAGES)
export const isProductStatus = oneOf(PRODUCT_STATUSES)
export const isRoadmapStatus = oneOf(ROADMAP_STATUSES)
export const isContractType = oneOf(CONTRACT_TYPES)
export const isProjectStatus = oneOf(PROJECT_STATUSES)
export const isInvoiceStatus = oneOf(INVOICE_STATUSES)
export const isFundType = oneOf(FUND_TYPES)
export const isObjectiveScope = oneOf(OBJECTIVE_SCOPES)
export const isKeyResultStatus = oneOf(KEY_RESULT_STATUSES)
export const isIdeaStatus = oneOf(IDEA_STATUSES)
export const isPlanStatus = oneOf(PLAN_STATUSES)
export const isPlanEffort = oneOf(PLAN_EFFORTS)
export const isEntryKind = oneOf(ENTRY_KINDS)
export const isChannelKind = oneOf(CHANNEL_KINDS)
export const isEpicStatus = oneOf(EPIC_STATUSES)
export const isSprintStatus = oneOf(SPRINT_STATUSES)
export const isRole = oneOf(ROLES)
export const isTeam = oneOf(TEAMS)
export const isCandidateStage = oneOf(CANDIDATE_STAGES)
export const isLeaveType = oneOf(LEAVE_TYPES)
export const isLeaveStatus = oneOf(LEAVE_STATUSES)
export const isCampaignStatus = oneOf(CAMPAIGN_STATUSES)
export const isContractKind = oneOf(CONTRACT_KINDS)
export const isTicketKind = oneOf(TICKET_KINDS)
export const isTicketStatus = oneOf(TICKET_STATUSES)
export const isSubscriptionStatus = oneOf(SUBSCRIPTION_STATUSES)
