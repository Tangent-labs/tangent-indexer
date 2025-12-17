import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const userAddress = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"

  // DEWHALE_MEMBERS: 0.75,
  // LP_DEALS: 1,

  //   CVG_COMPENSATION: 1,
  // CVG_PEPE: 0.75,
  // TURTLE_CLUB: 0.5,
  // ONBOARDED: 0.1,

  await prisma.offchain_boost_user.createMany({
    data: [
      {
        user_address: userAddress,
        type: "CVG_COMPENSATION",
      },
      {
        user_address: userAddress,
        type: "CVG_PEPE",
      },
      {
        user_address: userAddress,
        type: "TURTLE_CLUB",
      },
    ],
    skipDuplicates: true,
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
