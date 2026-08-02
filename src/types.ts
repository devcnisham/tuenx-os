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
  createdAt: string
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
  }
  needsAttention: Task[]
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
