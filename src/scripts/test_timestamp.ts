import { PrismaClient } from "@prisma/client"
import { UserPointsRepository } from "db/UserPointsRepository"

const main = async () => {
  const start = 1756268975
  const end = 1756270523

  const prismaClient = new PrismaClient()
  const userPointsRepository = new UserPointsRepository(prismaClient)
  await userPointsRepository.computeUserPoints(start, end)
}
main().then(() => {
  console.log("Done")
  process.exit(0)
})
