import { TransactionPrisma } from "src/type/prisma.js"

// DEWHALE_MEMBERS: 0.75,
// LP_DEALS: 1,
// CVG_COMPENSATION: 1,
// CVG_PEPE: 0.75,
// TURTLE_CLUB: 0.5,
// ONBOARDED: 0.1,
export async function seedBoosts(prisma: TransactionPrisma) {
  await prisma.user.createMany({
    data: [
      // {
      //   address: user0,
      // },
      // {
      //   address: user1,
      // },
      // {
      //   address: user2,
      // },
      // {
      //   address: user3,
      // },
    ],
  })

  await prisma.offchain_boost_user.createMany({
    data: [
      // {
      //   user_address: user0,
      //   type: "CVG_COMPENSATION",
      // },
      // {
      //   user_address: user0,
      //   type: "DEWHALE_MEMBERS",
      // },
      // {
      //   user_address: user1,
      //   type: "CVG_COMPENSATION",
      // },
      // {
      //   user_address: user1,
      //   type: "DEWHALE_MEMBERS",
      // },
      // {
      //   user_address: user2,
      //   type: "CVG_COMPENSATION",
      // },
      // {
      //   user_address: user2,
      //   type: "DEWHALE_MEMBERS",
      // },
      // {
      //   user_address: user3,
      //   type: "CVG_COMPENSATION",
      // },
      // {
      //   user_address: user3,
      //   type: "DEWHALE_MEMBERS",
      // },
    ],
  })
}
