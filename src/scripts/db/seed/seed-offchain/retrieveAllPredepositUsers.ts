import { PrismaClient } from "@prisma/client"
import * as fs from "fs"
// DEWHALE_MEMBERS: 0.75,
// LP_DEALS: 1,
// CVG_COMPENSATION: 1,
// ONBOARDED: 0.1,
const prisma = new PrismaClient()
export async function retrieve() {
  const users = await prisma.predeposit_users.findMany({
    select: {
      user_address: true,
    },
    where: {
      signature: {
        not: null,
      },
    },
  })
  console.log(users)
  fs.writeFileSync("./predeposit-users.json", JSON.stringify(users.map((u) => u.user_address.toLowerCase())))
}
retrieve()
