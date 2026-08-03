/**
 * Creates the first admin account on an empty database.
 *
 * There is no signup flow — accounts are created by an admin from the Users
 * module — which is a chicken-and-egg problem the moment this runs anywhere
 * that has not been seeded. This is the way out of it, and it is the only
 * script that should ever touch a production database.
 *
 *   npm run create-admin -- --name "Nisham" --email nisham@tuenx.com \
 *     --username nisham --password '…'
 *
 * The password is read from the argument or, better, from ADMIN_PASSWORD in the
 * environment — an argument is visible in `ps` and in shell history.
 *
 * Unlike `db:seed`, this destroys nothing: it refuses rather than overwrites if
 * the username is taken.
 */
import { PrismaClient } from '@prisma/client'
import { allocateTag } from '../server/tags'
import { hashPassword } from '../server/auth'
import { TAG_TYPE } from '../src/types'

const prisma = new PrismaClient()

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const name = arg('name')
  const email = arg('email')
  const username = arg('username')
  const password = process.env.ADMIN_PASSWORD ?? arg('password')

  if (!name || !email || !username || !password) {
    console.error(
      'Usage: npm run create-admin -- --name "Full Name" --email you@example.com --username you --password …\n' +
        '       (or set ADMIN_PASSWORD instead of --password)',
    )
    process.exitCode = 1
    return
  }

  if (password.length < 12) {
    console.error('Refusing: the first admin password must be at least 12 characters.')
    process.exitCode = 1
    return
  }

  const taken = await prisma.userAccount.findFirst({ where: { username } })
  if (taken) {
    console.error(`Refusing: the username "${username}" already exists.`)
    process.exitCode = 1
    return
  }

  const account = await prisma.$transaction(async (tx) => {
    // An account needs a team member to hang off — the member is the person,
    // the account is how they sign in.
    const existingMember = await tx.teamMember.findFirst({ where: { email } })
    const member =
      existingMember ??
      (await tx.teamMember.create({
        data: {
          tag: await allocateTag(tx, 'tuenx', TAG_TYPE.member),
          name,
          email,
          role: 'Founder',
          division: 'tuenx',
          team: 'leadership',
        },
      }))

    const { passwordHash, passwordSalt } = await hashPassword(password)

    return tx.userAccount.create({
      data: {
        memberId: member.id,
        username,
        email,
        passwordHash,
        passwordSalt,
        role: 'admin',
        active: true,
      },
    })
  })

  console.log(`Created admin "${username}" (account ${account.id}).`)
  console.log('Sign in at /#/ with that username and password.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
