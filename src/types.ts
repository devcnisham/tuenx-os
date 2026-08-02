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

export const CONTACT_STAGES = ['lead', 'proposal', 'active', 'closed'] as const
export type ContactStage = (typeof CONTACT_STAGES)[number]

export const CONTACT_STAGE_LABEL: Record<ContactStage, string> = {
  lead: 'Lead',
  proposal: 'Proposal',
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
 * Not enumerated anywhere in the TRD or PRD — chosen here. See ADR-0002.
 * `on_hold` earns its place because Agency work stalls on client sign-off far
 * more often than it fails outright, and that is worth telling apart from
 * active.
 */
export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'delivered'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  delivered: 'Delivered',
}

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
}

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
  email: string | null
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
  kind: 'task' | 'contact' | 'member' | 'product' | 'project' | 'invoice'
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
