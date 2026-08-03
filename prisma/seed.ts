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
import { hashPassword } from '../server/auth.ts'

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
  // Order matters: children before parents.
  await prisma.roadmapItem.deleteMany()
  await prisma.release.deleteMany()
  await prisma.campaign.deleteMany()
  await prisma.product.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.timeEntry.deleteMany()
  await prisma.task.deleteMany()
  await prisma.epic.deleteMany()
  await prisma.sprint.deleteMany()
  await prisma.project.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.leaveRequest.deleteMany()
  await prisma.vendor.deleteMany()
  await prisma.candidate.deleteMany()
  await prisma.contract.deleteMany()
  await prisma.teamMember.deleteMany()
  await prisma.session.deleteMany()
  await prisma.userAccount.deleteMany()
  await prisma.clientAccount.deleteMany()
  await prisma.message.deleteMany()
  await prisma.channelMember.deleteMany()
  await prisma.channel.deleteMany()
  await prisma.recordLink.deleteMany()
  await prisma.planItem.deleteMany()
  await prisma.idea.deleteMany()
  await prisma.calendarEntry.deleteMany()
  await prisma.keyResult.deleteMany()
  await prisma.objective.deleteMany()
  await prisma.doc.deleteMany()
  await prisma.fundEntry.deleteMany()
  await prisma.tagCounter.deleteMany()

  await prisma.$transaction(async (tx) => {
    // -- Team ---------------------------------------------------------------
    const people: { name: string; role: string; division: Division; team: string; email: string }[] = [
      { name: 'Nisham', role: 'Founder', division: 'tuenx', team: 'leadership', email: 'nisham@tuenx.com' },
      { name: 'Aria Sen', role: 'Operations Lead', division: 'tuenx', team: 'ops', email: 'aria@tuenx.com' },
      { name: 'Dev Rao', role: 'Finance & Admin', division: 'tuenx', team: 'finance', email: 'dev@tuenx.com' },
      { name: 'Maya Iqbal', role: 'Agency Lead', division: 'agency', team: 'leadership', email: 'maya@tuenx.com' },
      { name: 'Tomas Lund', role: 'Account Manager', division: 'agency', team: 'sales', email: 'tomas@tuenx.com' },
      { name: 'Priya Nair', role: 'Designer', division: 'agency', team: 'design', email: 'priya@tuenx.com' },
      { name: 'Kenji Mori', role: 'Product Lead', division: 'gaphatch', team: 'product', email: 'kenji@tuenx.com' },
      { name: 'Sara Okoye', role: 'Engineer', division: 'gaphatch', team: 'engineering', email: 'sara@tuenx.com' },
      { name: 'Luis Ferrer', role: 'Engineer', division: 'gaphatch', team: 'engineering', email: 'luis@tuenx.com' },
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

    // Ids are kept by title so the task-depth block below can attach epics,
    // sprints, subtasks, and logged time without re-querying.
    const taskIds: Record<string, string> = {}
    for (const task of tasks) {
      const tag = await allocateTag(tx, task.division, TAG_TYPE.task)
      const created = await tx.task.create({
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
      taskIds[task.title] = created.id
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
      contractType?: string
      contractValue?: number
      startDate?: Date
      endDate?: Date
    }[] = [
      { name: 'Helen Marsh', company: 'Northwind Studio', division: 'agency', stage: 'active', value: 48000, email: 'helen@northwind.co', notes: 'Rebrand + site. Retainer conversation in September.', contractType: 'project', contractValue: 48000, startDate: daysOut(-60), endDate: daysOut(34) },
      { name: 'Owen Baptiste', company: 'Brightline Health', division: 'agency', stage: 'active', value: 36000, email: 'owen@brightline.io', contractType: 'retainer', contractValue: 12000, startDate: daysOut(-70), endDate: daysOut(110) },
      { name: 'Ravi Chandra', company: 'Halcyon Labs', division: 'agency', stage: 'proposal', value: 60000, email: 'ravi@halcyonlabs.com', notes: 'Proposal out this week. Wants a 6-month retainer.' },
      { name: 'Dana Whitlock', company: 'Ferrous & Co', division: 'agency', stage: 'proposal', value: 22000, email: 'dana@ferrous.co' },
      { name: 'Ines Duarte', company: 'Cartel Coffee', division: 'agency', stage: 'lead', value: 15000, email: 'ines@cartelcoffee.pt' },
      { name: 'Marcus Bell', company: 'Odeon Group', division: 'agency', stage: 'closed', value: 41000, email: 'marcus@odeongroup.com', notes: 'Closed won, delivered in Q1.', contractType: 'project', contractValue: 41000, startDate: daysOut(-190), endDate: daysOut(-120) },

      { name: 'Prof. Amara Diallo', company: 'Ashfield College', division: 'gaphatch', stage: 'proposal', value: 12000, email: 'a.diallo@ashfield.edu', notes: 'Scholr pilot — 400 seats, first institutional deal.' },
      { name: 'Jonah Krieg', company: 'Lattice Tutoring', division: 'gaphatch', stage: 'lead', value: 7500, email: 'jonah@latticetutoring.com' },

      { name: 'Sofia Renner', company: 'Renner Capital', division: 'tuenx', stage: 'lead', value: 0, email: 'sofia@rennercap.com', notes: 'Banking relationship, not a sales deal. Tracked for context.' },
    ]

    const contactIds: Record<string, string> = {}
    for (const contact of contacts) {
      const tag = await allocateTag(tx, contact.division, TAG_TYPE.contact)
      const created = await tx.contact.create({
        data: {
          tag,
          name: contact.name,
          company: contact.company,
          division: contact.division,
          stage: contact.stage,
          value: contact.value,
          email: contact.email,
          notes: contact.notes ?? null,
          contractType: contact.contractType ?? null,
          contractValue: contact.contractValue ?? null,
          startDate: contact.startDate ?? null,
          endDate: contact.endDate ?? null,
        },
      })
      contactIds[contact.company] = created.id
    }

    // -- Projects and invoices (Phase 3, Agency) ----------------------------
    const projectSpecs: {
      company: string
      title: string
      status: string
      dueDate?: Date
      invoices: { amount: number; status: string; issue: Date; due: Date; notes?: string }[]
    }[] = [
      {
        company: 'Northwind Studio',
        title: 'Northwind rebrand + site build',
        status: 'active',
        dueDate: daysOut(34),
        invoices: [
          { amount: 24000, status: 'paid', issue: daysOut(-52), due: daysOut(-22), notes: 'Phase 1 — discovery and identity.' },
          { amount: 12000, status: 'sent', issue: daysOut(-12), due: daysOut(18), notes: 'Phase 2 — site build, first half.' },
        ],
      },
      {
        company: 'Brightline Health',
        title: 'Brightline retainer — Q3',
        status: 'active',
        dueDate: daysOut(58),
        invoices: [
          { amount: 12000, status: 'paid', issue: daysOut(-63), due: daysOut(-33) },
          { amount: 12000, status: 'overdue', issue: daysOut(-40), due: daysOut(-10), notes: 'Chased once. Follow up again this week.' },
          { amount: 12000, status: 'draft', issue: daysOut(0), due: daysOut(30) },
        ],
      },
      {
        company: 'Odeon Group',
        title: 'Odeon campaign — delivered',
        status: 'delivered',
        invoices: [
          { amount: 41000, status: 'paid', issue: daysOut(-140), due: daysOut(-110) },
        ],
      },
      {
        company: 'Ferrous & Co',
        title: 'Ferrous website refresh',
        status: 'on_hold',
        dueDate: daysOut(75),
        invoices: [],
      },
      {
        company: 'Halcyon Labs',
        title: 'Halcyon retainer — pending signature',
        status: 'planning',
        dueDate: daysOut(20),
        invoices: [],
      },
    ]

    const projectIds: Record<string, string> = {}
    for (const spec of projectSpecs) {
      const contactId = contactIds[spec.company]!
      const contact = await tx.contact.findUniqueOrThrow({
        where: { id: contactId },
        select: { division: true },
      })

      const tag = await allocateTag(tx, contact.division as Division, TAG_TYPE.project)
      const project = await tx.project.create({
        data: {
          tag,
          contactId,
          title: spec.title,
          status: spec.status,
          dueDate: spec.dueDate ?? null,
        },
      })
      projectIds[spec.title] = project.id

      for (const invoice of spec.invoices) {
        const invoiceTag = await allocateTag(tx, contact.division as Division, TAG_TYPE.invoice)
        await tx.invoice.create({
          data: {
            tag: invoiceTag,
            contactId,
            projectId: project.id,
            amount: invoice.amount,
            status: invoice.status,
            issueDate: invoice.issue,
            dueDate: invoice.due,
            notes: invoice.notes ?? null,
          },
        })
      }
    }

    // Link the Agency tasks that belong to a project.
    for (const [taskTitle, projectTitle] of [
      ['Northwind rebrand — second concept round', 'Northwind rebrand + site build'],
      ['Onboard Brightline to the shared drive', 'Brightline retainer — Q3'],
    ] as const) {
      await tx.task.updateMany({
        where: { title: taskTitle },
        data: { projectId: projectIds[projectTitle] },
      })
    }

    // -- Docs (Phase 5) -----------------------------------------------------
    const docs: { title: string; division: Division; category: string; body: string }[] = [
      {
        title: 'How we tag records',
        division: 'tuenx',
        category: 'Reference',
        body: `Every record in Tuenx OS carries a division-coded tag: AGY-T003, GPH-C012.

Format is <DIVISION>-<TYPE><SEQ>.

  Divisions   TNX Tuenx / AGY Agency / GPH Gaphatch
  Types       T task, C contact, M member, P product, R roadmap item,
              V release, J project, I invoice, F fund entry, D doc

The sequence counts per division per type, so AGY-T001 and GPH-T001 are
different records.

Tags are never reissued or renumbered. If someone moves from Agency to
Gaphatch they keep AGY-M004 — the tag is identity, not a category label.

You can search any tag from the box in the top bar. Typing AGY- lists
everything Agency.`,
      },
      {
        title: 'New client onboarding',
        division: 'agency',
        category: 'SOP',
        body: `Run this the day a proposal is signed.

1. Move the CRM contact to Active and fill in the contract terms — type,
   value, start and end date.
2. Create a Project against that client. It inherits their division.
3. Raise the first invoice against the project. Terms are 30 days unless the
   contract says otherwise.
4. Create the kickoff task and assign it. Link it to the project so it shows
   on the project card.
5. Add the client to the shared drive and send the welcome note.

If the client is a retainer rather than a project, set the contract type
accordingly — the value field then means per cycle, not total.`,
      },
      {
        title: 'Chasing an overdue invoice',
        division: 'agency',
        category: 'Playbook',
        body: `Invoices flip to Overdue automatically when the Invoices page is opened
after their due date. Nobody has to remember.

Day 1 overdue    Short, friendly email to the billing contact. Attach the
                 invoice again — most of the time it was simply missed.
Day 7            Email the main contact directly, not billing. Ask whether
                 anything is blocking it.
Day 14           Call. Put a note on the invoice recording what was said.
Day 30           Escalate to Maya before doing anything further. Do not stop
                 work without that conversation.

Log every contact in the invoice notes. The next person to pick it up needs
to know what has already been tried.`,
      },
      {
        title: 'Shipping a Gaphatch release',
        division: 'gaphatch',
        category: 'SOP',
        body: `1. Move every roadmap item that made it into the build to Shipped.
2. Log the release on the product page — version, date, and notes written the
   way you would tell a customer, not the way you would tell an engineer.
3. Check error monitoring for an hour after deploy.
4. If anything is rolled back, edit the release rather than deleting it. The
   log is a record of what happened, not of what we wish had happened.`,
      },
      {
        title: 'First week at Tuenx',
        division: 'tuenx',
        category: 'Onboarding',
        body: `Day one
  - Accounts: email, shared drive, Tuenx OS.
  - Add yourself to Team with your role and division. If you work across both
    arms, your division is Tuenx.
  - Read "How we tag records". It explains the ID on every screen.

First week
  - Sit in on one Agency client call and one Gaphatch product session,
    whichever arm you are not in.
  - Find the doc for the thing you will do most, and fix whatever is out of
    date in it. That is the fastest way to learn it.

Ask Aria for anything not covered here.`,
      },
      {
        title: 'Expense and spend policy',
        division: 'tuenx',
        category: 'Policy',
        body: `Anything under 200 USD that is clearly for work: just buy it, then log it in
Treasury against your division with a category.

200 to 1,000 USD: check with Dev first.

Over 1,000 USD, or anything recurring: check with Nisham. Recurring spend also
needs a Vendor record so renewals do not surprise us.

Capital moved from Tuenx into a division is an allocation, not spend. It is
tracked separately and does not count against runway.`,
      },
    ]

    for (const doc of docs) {
      const tag = await allocateTag(tx, doc.division, TAG_TYPE.doc)
      await tx.doc.create({
        data: {
          tag,
          title: doc.title,
          division: doc.division,
          category: doc.category,
          body: doc.body,
        },
      })
    }

    // -- Treasury (Phase 4) -------------------------------------------------
    const fundEntries: {
      division: Division
      type: string
      amount: number
      category: string
      date: Date
      notes?: string
    }[] = [
      { division: 'tuenx', type: 'income', amount: 120000, category: 'Founder capital', date: daysOut(-210), notes: 'Opening capital into the group.' },
      { division: 'agency', type: 'income', amount: 41000, category: 'Client revenue', date: daysOut(-140) },
      { division: 'agency', type: 'income', amount: 24000, category: 'Client revenue', date: daysOut(-52) },
      { division: 'agency', type: 'income', amount: 12000, category: 'Client revenue', date: daysOut(-63) },
      { division: 'agency', type: 'income', amount: 12000, category: 'Client revenue', date: daysOut(-33) },

      { division: 'tuenx', type: 'expense', amount: 4200, category: 'Legal & accounting', date: daysOut(-180) },
      { division: 'tuenx', type: 'expense', amount: 2600, category: 'Software & tools', date: daysOut(-90) },
      { division: 'tuenx', type: 'expense', amount: 2600, category: 'Software & tools', date: daysOut(-30) },
      { division: 'agency', type: 'expense', amount: 31000, category: 'Contractor fees', date: daysOut(-120) },
      { division: 'agency', type: 'expense', amount: 18500, category: 'Contractor fees', date: daysOut(-45) },
      { division: 'gaphatch', type: 'expense', amount: 26000, category: 'Product build', date: daysOut(-100), notes: 'Scholr build, first block.' },
      { division: 'gaphatch', type: 'expense', amount: 21000, category: 'Product build', date: daysOut(-40) },
      { division: 'gaphatch', type: 'expense', amount: 1800, category: 'Infrastructure', date: daysOut(-15) },

      { division: 'gaphatch', type: 'allocation', amount: 60000, category: 'Capital into Gaphatch', date: daysOut(-150), notes: 'Funds Scholr through beta.' },
      { division: 'agency', type: 'allocation', amount: 25000, category: 'Capital into Agency', date: daysOut(-150), notes: 'Working capital for contractor float.' },
    ]

    for (const entry of fundEntries) {
      const tag = await allocateTag(tx, entry.division, TAG_TYPE.fund)
      await tx.fundEntry.create({
        data: {
          tag,
          division: entry.division,
          type: entry.type,
          amount: entry.amount,
          category: entry.category,
          date: entry.date,
          notes: entry.notes ?? null,
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

    const productIds: Record<string, string> = {}
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

      productIds[spec.name] = product.id

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




    // -- Accounts -----------------------------------------------------------
    //
    // Demo credentials. Every password here is `tuenx1234` — fine for a seeded
    // local database, and it must never be how a real account is created. The
    // hash is computed properly through the same scrypt path the login route
    // uses, so nothing about the storage format is special-cased for the seed.
    const accountSpecs: { member: string; username: string; role: string; password?: string }[] = [
      { member: 'Nisham', username: 'nisham', role: 'admin', password: '11223344' },
      { member: 'Aria Sen', username: 'aria', role: 'admin' },
      { member: 'Maya Iqbal', username: 'maya', role: 'lead' },
      { member: 'Kenji Mori', username: 'kenji', role: 'lead' },
      { member: 'Sara Okoye', username: 'sara', role: 'member' },
      { member: 'Priya Nair', username: 'priya', role: 'member' },
    ]

    for (const spec of accountSpecs) {
      const { passwordHash, passwordSalt } = await hashPassword(spec.password ?? 'tuenx1234')
      await tx.userAccount.create({
        data: {
          memberId: members[spec.member]!,
          email: `${spec.username}@tuenx.com`,
          username: spec.username,
          role: spec.role,
          passwordHash,
          passwordSalt,
        },
      })
    }

    // Client portal logins. No password by design — see server/routes/auth.ts.
    for (const company of ['Northwind Studio', 'Brightline Health', 'Odeon Group']) {
      const contactId = contactIds[company]
      if (!contactId) continue
      const contact = await tx.contact.findUniqueOrThrow({
        where: { id: contactId },
        select: { email: true },
      })
      if (!contact.email) continue
      await tx.clientAccount.create({ data: { contactId, email: contact.email.toLowerCase() } })
    }

    // -- Messaging ----------------------------------------------------------
    const channels: { name: string; purpose: string; division: Division; kind: string; members: string[]; messages: { author: string; body: string; minutesAgo: number }[] }[] = [
      {
        name: 'group', purpose: 'Anything the whole group needs to see.', division: 'tuenx', kind: 'channel',
        members: ['Nisham', 'Aria Sen', 'Dev Rao', 'Maya Iqbal', 'Kenji Mori'],
        messages: [
          { author: 'Nisham', body: 'Quarter planning is on the calendar for the 12th. Bring what you want committed, not a wishlist.', minutesAgo: 2880 },
          { author: 'Aria Sen', body: 'Six of the ten core SOPs are written. The remaining four are all Agency delivery — Maya, can I get 30 minutes with you this week?', minutesAgo: 1400 },
          { author: 'Maya Iqbal', body: 'Thursday afternoon works.', minutesAgo: 1380 },
        ],
      },
      {
        name: 'agency-delivery', purpose: 'Client work in flight. Not for new business.', division: 'agency', kind: 'channel',
        members: ['Maya Iqbal', 'Tomas Lund', 'Priya Nair'],
        messages: [
          { author: 'Priya Nair', body: 'Second concept round for Northwind goes over tomorrow at 2. Helen has seen the direction already so it should be quick.', minutesAgo: 600 },
          { author: 'Tomas Lund', body: 'Brightline still has not paid the June invoice. Second chase went out, no reply. Calling tomorrow.', minutesAgo: 420 },
          { author: 'Maya Iqbal', body: 'If the call gets nowhere, escalate to me before doing anything about the work itself.', minutesAgo: 410 },
        ],
      },
      {
        name: 'scholr-launch', purpose: 'Everything blocking the paid launch.', division: 'gaphatch', kind: 'channel',
        members: ['Kenji Mori', 'Sara Okoye', 'Luis Ferrer'],
        messages: [
          { author: 'Sara Okoye', body: 'Nine of twelve beta blockers closed. The three left are all in calendar sync.', minutesAgo: 300 },
          { author: 'Luis Ferrer', body: 'Error monitoring is half done. I would not want to launch without it.', minutesAgo: 240 },
          { author: 'Kenji Mori', body: 'Agreed — monitoring is a hard gate. Go/no-go is on the 7th.', minutesAgo: 200 },
        ],
      },
      {
        name: 'Maya & Tomas', purpose: '', division: 'agency', kind: 'dm',
        members: ['Maya Iqbal', 'Tomas Lund'],
        messages: [
          { author: 'Maya Iqbal', body: 'How did Ferrous take the pause?', minutesAgo: 180 },
          { author: 'Tomas Lund', body: 'Fine. They asked us to hold until their board meets. I moved the project to on hold.', minutesAgo: 170 },
        ],
      },
    ]

    for (const channel of channels) {
      const tag = await allocateTag(tx, channel.division, TAG_TYPE.channel)
      const created = await tx.channel.create({
        data: {
          tag,
          name: channel.name,
          purpose: channel.purpose || null,
          division: channel.division,
          kind: channel.kind,
          members: { create: channel.members.map((n) => ({ memberId: members[n]! })) },
        },
      })

      for (const message of channel.messages) {
        await tx.message.create({
          data: {
            channelId: created.id,
            authorId: members[message.author] ?? null,
            body: message.body,
            createdAt: new Date(Date.now() - message.minutesAgo * 60_000),
          },
        })
      }
    }

    // -- Brainstorms, planner, calendar entries -----------------------------
    const quarter = (offset: number) => {
      const now = new Date()
      let year = now.getFullYear()
      let q = Math.floor(now.getMonth() / 3) + 1 + offset
      while (q > 4) { q -= 4; year += 1 }
      return `${year}-Q${q}`
    }

    const ideas: { title: string; body: string; division: Division; status: string; author: string; votes: number }[] = [
      { title: 'Self-serve signup for Scholr', body: 'Institutions are slow. A student-paid tier could prove demand without waiting on procurement.', division: 'gaphatch', status: 'shortlisted', author: 'Kenji Mori', votes: 5 },
      { title: 'Productise the rebrand process', body: 'We have run the same discovery three times. Package it as a fixed-scope offer.', division: 'agency', status: 'shortlisted', author: 'Maya Iqbal', votes: 4 },
      { title: 'Publish the Agency name story when we pick it', body: 'The naming decision is interesting. Could be the first real marketing we do.', division: 'agency', status: 'raw', author: 'Priya Nair', votes: 2 },
      { title: 'Weekly written update instead of a standup', body: 'Half the team is across two divisions. Writing scales better than a meeting nobody can all attend.', division: 'tuenx', status: 'raw', author: 'Aria Sen', votes: 3 },
      { title: 'Buy rather than build the helpdesk', body: 'Phase 7 has us building support. Worth pricing an off-the-shelf tool first.', division: 'gaphatch', status: 'parked', author: 'Sara Okoye', votes: 1 },
      { title: 'Retainer-only from next year', body: 'Project work is lumpy. Painful transition, much better cash flow.', division: 'agency', status: 'raw', author: 'Nisham', votes: 2 },
    ]

    const ideaIds: Record<string, string> = {}
    for (const idea of ideas) {
      const tag = await allocateTag(tx, idea.division, TAG_TYPE.idea)
      const created = await tx.idea.create({
        data: { tag, title: idea.title, body: idea.body, division: idea.division, status: idea.status, author: idea.author, votes: idea.votes },
      })
      ideaIds[idea.title] = created.id
    }

    const planItems: { title: string; division: Division; period: string; status: string; effort: string; owner: string; notes?: string; fromIdea?: string }[] = [
      { title: 'Scholr paid launch', division: 'gaphatch', period: quarter(0), status: 'committed', effort: 'l', owner: 'Kenji Mori', notes: 'Blocked on the beta list and error monitoring.' },
      { title: 'Close the first institutional deal', division: 'gaphatch', period: quarter(0), status: 'in_progress', effort: 'm', owner: 'Kenji Mori' },
      { title: 'Finalise and register the Agency name', division: 'tuenx', period: quarter(0), status: 'in_progress', effort: 's', owner: 'Nisham' },
      { title: 'Move three clients onto retainers', division: 'agency', period: quarter(0), status: 'committed', effort: 'm', owner: 'Maya Iqbal' },
      { title: 'Write the remaining core SOPs', division: 'tuenx', period: quarter(0), status: 'planned', effort: 's', owner: 'Aria Sen' },

      { title: 'Vespor first build sprint', division: 'gaphatch', period: quarter(1), status: 'planned', effort: 'l', owner: 'Kenji Mori' },
      { title: 'Fixed-scope rebrand offer', division: 'agency', period: quarter(1), status: 'planned', effort: 'm', owner: 'Maya Iqbal', fromIdea: 'Productise the rebrand process' },
      { title: 'Hire a second Agency designer', division: 'agency', period: quarter(1), status: 'planned', effort: 'm', owner: 'Maya Iqbal' },

      { title: 'Scholr self-serve tier', division: 'gaphatch', period: quarter(2), status: 'planned', effort: 'l', owner: 'Sara Okoye', fromIdea: 'Self-serve signup for Scholr' },
      { title: 'Decide on the helpdesk approach', division: 'gaphatch', period: quarter(2), status: 'planned', effort: 's', owner: 'Sara Okoye' },
    ]

    for (const item of planItems) {
      const tag = await allocateTag(tx, item.division, TAG_TYPE.planItem)
      const ideaId = item.fromIdea ? ideaIds[item.fromIdea] ?? null : null
      await tx.planItem.create({
        data: {
          tag,
          title: item.title,
          division: item.division,
          period: item.period,
          status: item.status,
          effort: item.effort,
          owner: item.owner,
          notes: item.notes ?? null,
          ideaId,
        },
      })
      if (ideaId) await tx.idea.update({ where: { id: ideaId }, data: { status: 'promoted' } })
    }

    const entries: { title: string; division: Division; kind: string; date: Date; endDate?: Date; allDay: boolean; startTime?: string; endTime?: string; attendees?: string; remind?: number; notes?: string }[] = [
      { title: 'Weekly group sync', division: 'tuenx', kind: 'meeting', date: daysOut(1), allDay: false, startTime: '10:00', endTime: '10:30', attendees: 'Everyone', remind: 15 },
      { title: 'Northwind concept presentation', division: 'agency', kind: 'meeting', date: daysOut(2), allDay: false, startTime: '14:00', endTime: '15:00', attendees: 'Priya Nair, Helen Marsh', remind: 60 },
      { title: 'Scholr go/no-go on launch date', division: 'gaphatch', kind: 'meeting', date: daysOut(5), allDay: false, startTime: '11:00', endTime: '12:00', attendees: 'Kenji Mori, Sara Okoye, Luis Ferrer', remind: 1440 },
      { title: 'Chase Brightline on the overdue invoice', division: 'agency', kind: 'reminder', date: daysOut(1), allDay: true, remind: 0, notes: 'Second chase. Call rather than email this time.' },
      { title: 'Quarter planning session', division: 'tuenx', kind: 'meeting', date: daysOut(12), allDay: false, startTime: '09:30', endTime: '12:30', attendees: 'Leads', remind: 1440 },
      { title: 'Aria on leave', division: 'tuenx', kind: 'holiday', date: daysOut(15), endDate: daysOut(19), allDay: true },
      { title: 'Renew the design tooling subscription', division: 'tuenx', kind: 'reminder', date: daysOut(9), allDay: true, remind: 10080 },
    ]

    for (const entry of entries) {
      const tag = await allocateTag(tx, entry.division, TAG_TYPE.entry)
      await tx.calendarEntry.create({
        data: {
          tag,
          title: entry.title,
          division: entry.division,
          kind: entry.kind,
          date: entry.date,
          endDate: entry.endDate ?? null,
          allDay: entry.allDay,
          startTime: entry.startTime ?? null,
          endTime: entry.endTime ?? null,
          attendees: entry.attendees ?? null,
          remindMinutesBefore: entry.remind ?? null,
          notes: entry.notes ?? null,
        },
      })
    }

    // -- OKRs (Phase 5) -----------------------------------------------------
    const objectives: {
      title: string
      scopeKind: string
      division: Division
      product?: string
      period: string
      owner: string
      keyResults: { title: string; target: number; current: number; unit?: string; status: string }[]
    }[] = [
      {
        title: 'Get Scholr to a paid launch',
        scopeKind: 'product',
        division: 'gaphatch',
        product: 'Scholr',
        period: '2026-Q3',
        owner: 'Kenji Mori',
        keyResults: [
          { title: 'Close every beta blocker', target: 12, current: 9, status: 'on_track' },
          { title: 'First paying institution signed', target: 1, current: 0, status: 'at_risk' },
          { title: 'Error rate under target before launch', target: 100, current: 40, unit: '%', status: 'off_track' },
        ],
      },
      {
        title: 'Agency revenue predictable enough to plan against',
        scopeKind: 'division',
        division: 'agency',
        period: '2026-Q3',
        owner: 'Maya Iqbal',
        keyResults: [
          { title: 'Clients on a retainer rather than project work', target: 3, current: 1, status: 'at_risk' },
          { title: 'Days sales outstanding', target: 30, current: 21, unit: 'd', status: 'on_track' },
          { title: 'Signed contract value for next quarter', target: 120000, current: 96000, unit: '$', status: 'on_track' },
        ],
      },
      {
        title: 'The group runs on Tuenx OS, not on memory',
        scopeKind: 'division',
        division: 'tuenx',
        period: '2026-Q3',
        owner: 'Nisham',
        keyResults: [
          { title: 'Core SOPs written down', target: 10, current: 6, status: 'on_track' },
          { title: 'Records with no owner or division', target: 0, current: 0, status: 'done' },
          { title: 'Months of runway held', target: 18, current: 32, unit: 'mo', status: 'done' },
        ],
      },
    ]

    for (const objective of objectives) {
      const productId = objective.product ? productIds[objective.product] ?? null : null
      const tag = await allocateTag(tx, objective.division, TAG_TYPE.objective)
      const created = await tx.objective.create({
        data: {
          tag,
          scopeKind: objective.scopeKind,
          division: objective.division,
          productId,
          title: objective.title,
          period: objective.period,
          owner: objective.owner,
        },
      })

      for (const kr of objective.keyResults) {
        const krTag = await allocateTag(tx, objective.division, TAG_TYPE.keyResult)
        await tx.keyResult.create({
          data: {
            tag: krTag,
            objectiveId: created.id,
            title: kr.title,
            targetValue: kr.target,
            currentValue: kr.current,
            unit: kr.unit ?? null,
            status: kr.status,
          },
        })
      }
    }

    // -- Task depth: epics, sprints, subtasks, time --------------------------
    //
    // Deliberately partial. Only Gaphatch runs sprints, only two bodies of work
    // are epics, and most tasks carry no estimate — which is the honest shape
    // of a 9-person company and the case the UI has to look right in. A seed
    // where every field is filled proves nothing about the empty states.
    const epics: { key: string; title: string; division: Division; status: string; notes?: string }[] = [
      { key: 'launch', title: 'Scholr public launch', division: 'gaphatch', status: 'in_progress', notes: 'Everything that has to be true before the beta flag comes off.' },
      { key: 'rebrand', title: 'Northwind rebrand', division: 'agency', status: 'in_progress' },
      { key: 'moveoff', title: 'Get the company off personal drives', division: 'tuenx', status: 'open' },
    ]

    const epicIds: Record<string, string> = {}
    for (const epic of epics) {
      const tag = await allocateTag(tx, epic.division, TAG_TYPE.epic)
      const created = await tx.epic.create({
        data: {
          tag,
          title: epic.title,
          division: epic.division,
          status: epic.status,
          notes: epic.notes ?? null,
        },
      })
      epicIds[epic.key] = created.id
    }

    const sprints: {
      key: string
      name: string
      division: Division
      status: string
      goal: string
      start: Date
      end: Date
    }[] = [
      { key: 's12', name: 'Sprint 12', division: 'gaphatch', status: 'closed', goal: 'Staging on the new host, error budget agreed.', start: daysOut(-28), end: daysOut(-15) },
      { key: 's13', name: 'Sprint 13', division: 'gaphatch', status: 'active', goal: 'Beta blocker list to zero.', start: daysOut(-14), end: daysOut(0) },
      { key: 's14', name: 'Sprint 14', division: 'gaphatch', status: 'planned', goal: 'Launch readiness — monitoring, pricing page, comms.', start: daysOut(1), end: daysOut(14) },
    ]

    const sprintIds: Record<string, string> = {}
    for (const sprint of sprints) {
      const tag = await allocateTag(tx, sprint.division, TAG_TYPE.sprint)
      const created = await tx.sprint.create({
        data: {
          tag,
          name: sprint.name,
          division: sprint.division,
          status: sprint.status,
          goal: sprint.goal,
          startDate: sprint.start,
          endDate: sprint.end,
        },
      })
      sprintIds[sprint.key] = created.id
    }

    const assignments: { task: string; epic?: string; sprint?: string; estimate?: number }[] = [
      { task: 'Scholr — close out the beta blocker list', epic: 'launch', sprint: 's13', estimate: 16 },
      { task: 'Scholr — set up error monitoring before launch', epic: 'launch', sprint: 's14', estimate: 6 },
      { task: 'Scholr — pricing page copy', epic: 'launch', sprint: 's14', estimate: 4 },
      { task: 'Migrate Scholr staging to the new host', epic: 'launch', sprint: 's12', estimate: 8 },
      { task: 'Vespor — scope the first build sprint', estimate: 3 },
      { task: 'Northwind rebrand — second concept round', epic: 'rebrand', estimate: 12 },
      { task: 'Move company docs off personal drives', epic: 'moveoff', estimate: 5 },
    ]

    for (const assignment of assignments) {
      await tx.task.update({
        where: { id: taskIds[assignment.task]! },
        data: {
          epicId: assignment.epic ? epicIds[assignment.epic]! : null,
          sprintId: assignment.sprint ? sprintIds[assignment.sprint]! : null,
          estimateHours: assignment.estimate ?? null,
        },
      })
    }

    // One level only. A subtask of a subtask means the parent should have been
    // an epic — the API rejects it, and the seed shouldn't imply otherwise.
    const subtasks: { parent: string; title: string; division: Division; status: string; assignee?: string }[] = [
      { parent: 'Scholr — close out the beta blocker list', title: 'Fix the signup race on slow connections', division: 'gaphatch', status: 'done', assignee: 'Sara Okoye' },
      { parent: 'Scholr — close out the beta blocker list', title: 'Session expiry logs the user out mid-form', division: 'gaphatch', status: 'in_progress', assignee: 'Sara Okoye' },
      { parent: 'Scholr — close out the beta blocker list', title: 'Empty state on the class list', division: 'gaphatch', status: 'todo', assignee: 'Luis Ferrer' },
      { parent: 'Northwind rebrand — second concept round', title: 'Three logo directions', division: 'agency', status: 'done', assignee: 'Priya Nair' },
      { parent: 'Northwind rebrand — second concept round', title: 'Type pairing for the two survivors', division: 'agency', status: 'in_progress', assignee: 'Priya Nair' },
    ]

    for (const subtask of subtasks) {
      const tag = await allocateTag(tx, subtask.division, TAG_TYPE.task)
      await tx.task.create({
        data: {
          tag,
          title: subtask.title,
          division: subtask.division,
          status: subtask.status,
          priority: 'medium',
          parentId: taskIds[subtask.parent]!,
          assigneeId: subtask.assignee ? members[subtask.assignee]! : null,
        },
      })
    }

    const timeEntries: { task: string; member: string; hours: number; day: number; note?: string }[] = [
      { task: 'Scholr — close out the beta blocker list', member: 'Sara Okoye', hours: 5.5, day: -4, note: 'Signup race' },
      { task: 'Scholr — close out the beta blocker list', member: 'Sara Okoye', hours: 4, day: -3 },
      { task: 'Scholr — close out the beta blocker list', member: 'Luis Ferrer', hours: 2, day: -2, note: 'Pairing on the session bug' },
      { task: 'Migrate Scholr staging to the new host', member: 'Luis Ferrer', hours: 9, day: -17, note: 'Ran over — DNS propagation' },
      { task: 'Northwind rebrand — second concept round', member: 'Priya Nair', hours: 6, day: -5 },
      { task: 'Northwind rebrand — second concept round', member: 'Priya Nair', hours: 3.5, day: -1 },
    ]

    for (const entry of timeEntries) {
      await tx.timeEntry.create({
        data: {
          taskId: taskIds[entry.task]!,
          memberId: members[entry.member]!,
          hours: entry.hours,
          date: daysOut(entry.day),
          note: entry.note ?? null,
        },
      })
    }

    // -- People & Ops (Phase 6) ---------------------------------------------
    //
    // Hiring, time off, vendors, marketing, and the contracts repository. Still
    // not payroll — master plan §4. Leave records who is away and nothing more.
    const candidates: {
      name: string
      role: string
      division: Division
      stage: string
      source?: string
      notes?: string
    }[] = [
      { name: 'Ines Kabir', role: 'Senior Engineer', division: 'gaphatch', stage: 'interview', source: 'Referral — Sara Okoye', notes: 'Second interview booked. Strong on the data layer.' },
      { name: 'Tom Alvarez', role: 'Senior Engineer', division: 'gaphatch', stage: 'screening', source: 'Inbound' },
      { name: 'Rhea Sundaram', role: 'Motion Designer', division: 'agency', stage: 'offer', source: 'Portfolio outreach', notes: 'Offer out. Wants a start date after the 15th.' },
      { name: 'Callum Boyd', role: 'Motion Designer', division: 'agency', stage: 'passed', source: 'Inbound', notes: 'Good reel, wrong seniority for this role.' },
      { name: 'Nadia Haddad', role: 'Operations Associate', division: 'tuenx', stage: 'applied', source: 'Referral — Aria Sen' },
      { name: 'Jonas Weiss', role: 'Account Manager', division: 'agency', stage: 'hired', source: 'Agency', notes: 'Starts next month.' },
    ]

    for (const candidate of candidates) {
      const tag = await allocateTag(tx, candidate.division, TAG_TYPE.candidate)
      await tx.candidate.create({
        data: {
          tag,
          name: candidate.name,
          role: candidate.role,
          division: candidate.division,
          stage: candidate.stage,
          source: candidate.source ?? null,
          notes: candidate.notes ?? null,
        },
      })
    }

    const leaves: {
      member: string
      type: string
      status: string
      start: Date
      end: Date
      notes?: string
    }[] = [
      { member: 'Aria Sen', type: 'holiday', status: 'approved', start: daysOut(15), end: daysOut(19), notes: 'Already on the calendar.' },
      { member: 'Priya Nair', type: 'holiday', status: 'requested', start: daysOut(30), end: daysOut(41) },
      { member: 'Luis Ferrer', type: 'sick', status: 'approved', start: daysOut(-3), end: daysOut(-2) },
      { member: 'Tomas Lund', type: 'parental', status: 'approved', start: daysOut(45), end: daysOut(105), notes: 'Cover plan needed before the Northwind renewal.' },
      { member: 'Sara Okoye', type: 'unpaid', status: 'declined', start: daysOut(9), end: daysOut(12), notes: 'Clashes with the Scholr launch week.' },
    ]

    for (const leave of leaves) {
      const person = people.find((p) => p.name === leave.member)!
      const tag = await allocateTag(tx, person.division, TAG_TYPE.leave)
      await tx.leaveRequest.create({
        data: {
          tag,
          memberId: members[leave.member]!,
          type: leave.type,
          status: leave.status,
          startDate: leave.start,
          endDate: leave.end,
          notes: leave.notes ?? null,
        },
      })
    }

    const vendors: {
      name: string
      division: Division
      monthlyCost: number
      renewal?: Date
      owner?: string
      notes?: string
    }[] = [
      { name: 'Google Workspace', division: 'tuenx', monthlyCost: 108, renewal: daysOut(22), owner: 'Aria Sen', notes: '9 seats.' },
      { name: 'Xero', division: 'tuenx', monthlyCost: 70, renewal: daysOut(64), owner: 'Dev Rao' },
      { name: 'Figma', division: 'agency', monthlyCost: 135, renewal: daysOut(8), owner: 'Priya Nair', notes: '3 editors, 4 viewers.' },
      { name: 'Adobe Creative Cloud', division: 'agency', monthlyCost: 180, renewal: daysOut(120) },
      { name: 'Vercel', division: 'gaphatch', monthlyCost: 60, renewal: daysOut(41), owner: 'Luis Ferrer' },
      { name: 'Sentry', division: 'gaphatch', monthlyCost: 29, renewal: daysOut(97), owner: 'Sara Okoye', notes: 'Bought for the Scholr launch.' },
      { name: 'Linear', division: 'gaphatch', monthlyCost: 48, owner: 'Kenji Mori', notes: 'Being wound down as Tuenx OS takes over.' },
    ]

    for (const vendor of vendors) {
      const tag = await allocateTag(tx, vendor.division, TAG_TYPE.vendor)
      await tx.vendor.create({
        data: {
          tag,
          name: vendor.name,
          division: vendor.division,
          monthlyCost: vendor.monthlyCost,
          renewalDate: vendor.renewal ?? null,
          ownerId: vendor.owner ? members[vendor.owner]! : null,
          notes: vendor.notes ?? null,
        },
      })
    }

    const campaigns: {
      title: string
      channel: string
      division: Division
      product?: string
      status: string
      date: Date
      notes?: string
    }[] = [
      { title: 'Scholr beta waitlist push', channel: 'Email', division: 'gaphatch', product: 'Scholr', status: 'live', date: daysOut(-6), notes: 'Two sends left in the sequence.' },
      { title: 'Scholr launch announcement', channel: 'Product Hunt', division: 'gaphatch', product: 'Scholr', status: 'planned', date: daysOut(26) },
      { title: 'Agency case study — Odeon', channel: 'LinkedIn', division: 'agency', status: 'done', date: daysOut(-34) },
      { title: 'Retainer offer to lapsed clients', channel: 'Email', division: 'agency', status: 'planned', date: daysOut(12) },
      { title: 'Group hiring post — engineering', channel: 'LinkedIn', division: 'tuenx', status: 'live', date: daysOut(-2) },
    ]

    for (const campaign of campaigns) {
      const productId = campaign.product ? productIds[campaign.product] ?? null : null
      const division = productId ? 'gaphatch' : campaign.division
      const tag = await allocateTag(tx, division, TAG_TYPE.campaign)
      await tx.campaign.create({
        data: {
          tag,
          scopeKind: productId ? 'product' : 'division',
          division,
          productId,
          title: campaign.title,
          channel: campaign.channel,
          status: campaign.status,
          date: campaign.date,
          notes: campaign.notes ?? null,
        },
      })
    }

    const contracts: {
      party: string
      division: Division
      type: string
      value: number
      start?: Date
      end?: Date
      fileRef?: string
      notes?: string
    }[] = [
      { party: 'Northwind Studio', division: 'agency', type: 'client', value: 48000, start: daysOut(-60), end: daysOut(34), fileRef: '/Shared/Contracts/northwind-rebrand.pdf' },
      { party: 'Brightline Health', division: 'agency', type: 'client', value: 12000, start: daysOut(-70), end: daysOut(110), fileRef: '/Shared/Contracts/brightline-retainer.pdf', notes: 'Retainer, rolls monthly after the end date.' },
      { party: 'Odeon Group', division: 'agency', type: 'client', value: 41000, start: daysOut(-190), end: daysOut(-120), notes: 'Delivered and closed.' },
      { party: 'Adobe', division: 'agency', type: 'vendor', value: 2160, start: daysOut(-245), end: daysOut(120) },
      { party: 'Jonas Weiss', division: 'agency', type: 'employment', value: 62000, start: daysOut(30), notes: 'Signed, starts next month.' },
      { party: 'Regus — desk licence', division: 'tuenx', type: 'other', value: 9600, start: daysOut(-120), end: daysOut(245) },
    ]

    for (const contract of contracts) {
      const tag = await allocateTag(tx, contract.division, TAG_TYPE.contract)
      await tx.contract.create({
        data: {
          tag,
          party: contract.party,
          division: contract.division,
          type: contract.type,
          value: contract.value,
          startDate: contract.start ?? null,
          endDate: contract.end ?? null,
          fileRef: contract.fileRef ?? null,
          notes: contract.notes ?? null,
        },
      })
    }
  })

  const [team, tasks, contacts, products, docCount, plans, ideaCount, entryCount, msgCount, accountCount, candidateCount, vendorCount, contractCount, epicCount, sprintCount, timeCount] = await Promise.all([
    prisma.teamMember.count(),
    prisma.task.count(),
    prisma.contact.count(),
    prisma.product.count(),
    prisma.doc.count(),
    prisma.planItem.count(),
    prisma.idea.count(),
    prisma.calendarEntry.count(),
    prisma.message.count(),
    prisma.userAccount.count(),
    prisma.candidate.count(),
    prisma.vendor.count(),
    prisma.contract.count(),
    prisma.epic.count(),
    prisma.sprint.count(),
    prisma.timeEntry.count(),
  ])

  console.log(
    `Seeded: ${team} team members, ${tasks} tasks, ${contacts} contacts, ${products} products, ${docCount} docs, ${plans} plan items, ${ideaCount} ideas, ${entryCount} calendar entries, ${msgCount} messages, ${accountCount} accounts, ${candidateCount} candidates, ${vendorCount} vendors, ${contractCount} contracts, ${epicCount} epics, ${sprintCount} sprints, ${timeCount} time entries.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
