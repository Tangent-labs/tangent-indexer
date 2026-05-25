import { PrismaClient } from "@prisma/client"
import * as cvgCompensation from "./cvgCompensation.json" with { type: "json" }
import * as dewhales from "./dewhales.json" with { type: "json" }
import * as predeposit from "./predeposit-users.json" with { type: "json" }

// DEWHALE_MEMBERS: 0.75,
// LP_DEALS: 1,
// CVG_COMPENSATION: 1,
// ONBOARDED: 0.1,
const prisma = new PrismaClient()
export async function seedOffchainBoosts() {
  const usersToAdd = cvgCompensation.default.concat(dewhales.default.concat(predeposit.default))

  await prisma.user.createMany({
    data: usersToAdd.map((u) => {
      return {
        address: u.toLowerCase(),
      }
    }),
    skipDuplicates: true,
  })

  await prisma.offchain_boost_user.createMany({
    data: cvgCompensation.default.map((u) => {
      return {
        user_address: u.toLowerCase(),
        type: "CVG_COMPENSATION",
      }
    }),
    skipDuplicates: true,
  })

  await prisma.offchain_boost_user.createMany({
    data: dewhales.default.map((u) => {
      return {
        user_address: u.toLowerCase(),
        type: "DEWHALE_MEMBERS",
      }
    }),
    skipDuplicates: true,
  })

  await prisma.offchain_boost_user.createMany({
    data: predeposit.default.map((u) => {
      return {
        user_address: u.toLowerCase(),
        type: "LP_DEALS",
      }
    }),
    skipDuplicates: true,
  })
}

seedOffchainBoosts()
