/**
 * Demo seed data.
 *
 * Wipes every table and reinserts a plausible Tuenx snapshot so the modules
 * aren't empty on first run. Not production data — `npm run db:seed` is
 * destructive by design.
 *
 * Product names (Scholr, Vespor) were inferred from directories on this
 * machine under ~/Desktop/gaphatch. Swap them if they're wrong; nothing else
 * depends on them.
 */
import { PrismaClient } from '@prisma/client'
import { allocateTag } from '../server/tags.ts'
import { TAG_TYPE, type Division } from '../src/types.ts'

const prisma = new PrismaClient()

/** Relative to today, so seeded due dates stay meaningful over time. */
const daysOut = (n: number) => {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

async function main() {
  console.log('Clearing existing data…')
  // Order matters: children before parents, and tasks before the members they
  // reference.
  await prisma.roadmapItem.deleteMany()
  await prisma.release.deleteMany()
  await prisma.product.deleteMany()
  await prisma.task.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.teamMember.deleteMany()
  await prisma.tagCounter.deleteMany()

  await prisma.$transaction(async (tx) => {
    // -- Team ---------------------------------------------------------------
    const people: { name: string; role: string; division: Division; email: string }[] = [
      { name: 'Nisham', role: 'Founder', division: 'tuenx', email: 'nisham@tuenx.com' },
      { name: 'Aria Sen', role: 'Operations Lead', division: 'tuenx', email: 'aria@tuenx.com' },
      { name: 'Dev Rao', role: 'Finance & Admin', division: 'tuenx', email: 'dev@tuenx.com' },
      { name: 'Maya Iqbal', role: 'Agency Lead', division: 'agency', email: 'maya@tuenx.com' },
      { name: 'Tomas Lund', role: 'Account Manager', division: 'agency', email: 'tomas@tuenx.com' },
      { name: 'Priya Nair', role: 'Designer', division: 'agency', email: 'priya@tuenx.com' },
      { name: 'Kenji Mori', role: 'Product Lead', division: 'gaphatch', email: 'kenji@tuenx.com' },
      { name: 'Sara Okoye', role: 'Engineer', division: 'gaphatch', email: 'sara@tuenx.com' },
      { name: 'Luis Ferrer', role: 'Engineer', division: 'gaphatch', email: 'luis@tuenx.com' },
    ]

    const members: Record<string, string> = {}
    for (const person of people) {
      const tag = await allocateTag(tx, person.division, TAG_TYPE.member)
      const created = await tx.teamMember.create({ data: { tag, ...person } })
      members[person.name] = created.id
    }

    // -- Tasks --------------------------------------------------------------
    const tasks: {
      title: string
      division: Division
      status: string
      priority: string
      assignee?: string
      dueDate?: Date
    }[] = [
      { title: 'Finalise Agency name and register the mark', division: 'tuenx', status: 'in_progress', priority: 'high', assignee: 'Nisham', dueDate: daysOut(10) },
      { title: 'Q3 capital allocation between divisions', division: 'tuenx', status: 'todo', priority: 'high', assignee: 'Dev Rao', dueDate: daysOut(4) },
      { title: 'Move company docs off personal drives', division: 'tuenx', status: 'todo', priority: 'medium', assignee: 'Aria Sen', dueDate: daysOut(21) },
      { title: 'Set up shared vendor/subscription list', division: 'tuenx', status: 'done', priority: 'low', assignee: 'Aria Sen' },

      { title: 'Northwind rebrand — second concept round', division: 'agency', status: 'in_progress', priority: 'high', assignee: 'Priya Nair', dueDate: daysOut(2) },
      { title: 'Send Halcyon retainer proposal', division: 'agency', status: 'todo', priority: 'high', assignee: 'Maya Iqbal', dueDate: daysOut(1) },
      { title: 'Q2 invoices — chase the two outstanding', division: 'agency', status: 'todo', priority: 'medium', assignee: 'Tomas Lund', dueDate: daysOut(6) },
      { title: 'Write the standard scope-of-work template', division: 'agency', status: 'todo', priority: 'low', assignee: 'Maya Iqbal' },
      { title: 'Onboard Brightline to the shared drive', division: 'agency', status: 'done', priority: 'medium', assignee: 'Tomas Lund' },

      { title: 'Scholr — close out the beta blocker list', division: 'gaphatch', status: 'in_progress', priority: 'high', assignee: 'Sara Okoye', dueDate: daysOut(3) },
      { title: 'Scholr — pricing page copy', division: 'gaphatch', status: 'todo', priority: 'medium', assignee: 'Kenji Mori', dueDate: daysOut(14) },
      { title: 'Scholr — set up error monitoring before launch', division: 'gaphatch', status: 'todo', priority: 'high', assignee: 'Luis Ferrer', dueDate: daysOut(8) },
      { title: 'Vespor — scope the first build sprint', division: 'gaphatch', status: 'todo', priority: 'medium', assignee: 'Kenji Mori', dueDate: daysOut(28) },
      { title: 'Migrate Scholr staging to the new host', division: 'gaphatch', status: 'done', priority: 'medium', assignee: 'Luis Ferrer' },
    ]

    for (const task of tasks) {
      const tag = await allocateTag(tx, task.division, TAG_TYPE.task)
      await tx.task.create({
        data: {
          tag,
          title: task.title,
          division: task.division,
          status: task.status,
          priority: task.priority,
          assigneeId: task.assignee ? members[task.assignee] : null,
          dueDate: task.dueDate ?? null,
        },
      })
    }

    // -- CRM ----------------------------------------------------------------
    const contacts: {
      name: string
      company: string
      division: Division
      stage: string
      value: number
      email: string
      notes?: string
    }[] = [
      { name: 'Helen Marsh', company: 'Northwind Studio', division: 'agency', stage: 'active', value: 48000, email: 'helen@northwind.co', notes: 'Rebrand + site. Retainer conversation in September.' },
      { name: 'Owen Baptiste', company: 'Brightline Health', division: 'agency', stage: 'active', value: 36000, email: 'owen@brightline.io' },
      { name: 'Ravi Chandra', company: 'Halcyon Labs', division: 'agency', stage: 'proposal', value: 60000, email: 'ravi@halcyonlabs.com', notes: 'Proposal out this week. Wants a 6-month retainer.' },
      { name: 'Dana Whitlock', company: 'Ferrous & Co', division: 'agency', stage: 'proposal', value: 22000, email: 'dana@ferrous.co' },
      { name: 'Ines Duarte', company: 'Cartel Coffee', division: 'agency', stage: 'lead', value: 15000, email: 'ines@cartelcoffee.pt' },
      { name: 'Marcus Bell', company: 'Odeon Group', division: 'agency', stage: 'closed', value: 41000, email: 'marcus@odeongroup.com', notes: 'Closed won, delivered in Q1.' },

      { name: 'Prof. Amara Diallo', company: 'Ashfield College', division: 'gaphatch', stage: 'proposal', value: 12000, email: 'a.diallo@ashfield.edu', notes: 'Scholr pilot — 400 seats, first institutional deal.' },
      { name: 'Jonah Krieg', company: 'Lattice Tutoring', division: 'gaphatch', stage: 'lead', value: 7500, email: 'jonah@latticetutoring.com' },

      { name: 'Sofia Renner', company: 'Renner Capital', division: 'tuenx', stage: 'lead', value: 0, email: 'sofia@rennercap.com', notes: 'Banking relationship, not a sales deal. Tracked for context.' },
    ]

    for (const contact of contacts) {
      const tag = await allocateTag(tx, contact.division, TAG_TYPE.contact)
      await tx.contact.create({
        data: {
          tag,
          name: contact.name,
          company: contact.company,
          division: contact.division,
          stage: contact.stage,
          value: contact.value,
          email: contact.email,
          notes: contact.notes ?? null,
        },
      })
    }

    // -- Products (Gaphatch) ------------------------------------------------
    const productSpecs: {
      name: string
      status: string
      description: string
      roadmap: { title: string; status: string }[]
      releases: { version: string; notes: string; date: Date }[]
    }[] = [
      {
        name: 'Scholr',
        status: 'building',
        description: 'Academic tracking for students and tutors. The one product in active development.',
        roadmap: [
          { title: 'Assignment tracker', status: 'shipped' },
          { title: 'Grade projections', status: 'shipped' },
          { title: 'Calendar sync', status: 'building' },
          { title: 'Tutor dashboard', status: 'building' },
          { title: 'Institutional billing', status: 'backlog' },
          { title: 'Mobile app', status: 'backlog' },
          { title: 'Parent view', status: 'backlog' },
        ],
        releases: [
          { version: '0.3.0', notes: 'Grade projections, term-over-term comparison, faster dashboard load.', date: daysOut(-9) },
          { version: '0.2.1', notes: 'Fixed timezone drift on assignment due dates.', date: daysOut(-24) },
          { version: '0.2.0', notes: 'Assignment tracker out of alpha. Bulk import from CSV.', date: daysOut(-41) },
        ],
      },
      {
        name: 'Vespor',
        status: 'planning',
        description: 'Second Gaphatch product. Scoping in progress, no build started.',
        roadmap: [
          { title: 'Define the core loop', status: 'building' },
          { title: 'Competitive teardown', status: 'backlog' },
          { title: 'Pricing model', status: 'backlog' },
        ],
        releases: [],
      },
      {
        name: 'Untitled ops tool',
        status: 'planning',
        description: 'Placeholder. Idea stage only — kept here so it does not live in a notes app.',
        roadmap: [{ title: 'Write the one-pager', status: 'backlog' }],
        releases: [],
      },
    ]

    for (const spec of productSpecs) {
      const productTag = await allocateTag(tx, 'gaphatch', TAG_TYPE.product)
      const product = await tx.product.create({
        data: {
          tag: productTag,
          name: spec.name,
          status: spec.status,
          description: spec.description,
        },
      })

      for (const item of spec.roadmap) {
        const tag = await allocateTag(tx, 'gaphatch', TAG_TYPE.roadmap)
        await tx.roadmapItem.create({
          data: { tag, productId: product.id, title: item.title, status: item.status },
        })
      }

      for (const release of spec.releases) {
        const tag = await allocateTag(tx, 'gaphatch', TAG_TYPE.release)
        await tx.release.create({
          data: {
            tag,
            productId: product.id,
            version: release.version,
            notes: release.notes,
            date: release.date,
          },
        })
      }
    }
  })

  const [team, tasks, contacts, products] = await Promise.all([
    prisma.teamMember.count(),
    prisma.task.count(),
    prisma.contact.count(),
    prisma.product.count(),
  ])

  console.log(
    `Seeded: ${team} team members, ${tasks} tasks, ${contacts} contacts, ${products} products.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
