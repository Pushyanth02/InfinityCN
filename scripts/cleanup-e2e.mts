import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Remove pipeline test artifacts left in the dev DB so the E2E test starts clean.
  const deletedJobs = await db.job.deleteMany({
    where: { status: { in: ['QUEUED', 'PROCESSING', 'DEAD_LETTER'] } },
  })
  const deletedDocs = await db.document.deleteMany({})
  console.log(`cleaned: ${deletedJobs.count} jobs, ${deletedDocs.count} documents`)
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
