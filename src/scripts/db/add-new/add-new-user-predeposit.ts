import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function seedPredeposit() {
  await prisma.predeposit_users.createMany({
    data: [
      // Dewhales
      { user_address: "0xf1419f352846b723720424dC8bDa9E80342ea01D".toLowerCase(), is_private: true },
      { user_address: "0x2da6f8b0666e27586d9bd72b153ca049c4c6a9b4".toLowerCase(), is_private: true },
      { user_address: "0x795fe6f884eb7599abfa814aea3cb8d0b3cc47c2".toLowerCase(), is_private: true },
      { user_address: "0x8cCAf951C46899Aa11E96435261C271c3E5Ba963".toLowerCase(), is_private: true },
      { user_address: "0x96fe4e4cd275F1f39eea9d6184447C12006b8536".toLowerCase(), is_private: true },
      { user_address: "0x2e42c9e6c4e4725bcc568d4b4f716c34fd354f02".toLowerCase(), is_private: true },
      { user_address: "0x3dC5A62d0Dd5756E5C1a317EF797E2C4BbFF0be5".toLowerCase(), is_private: true },
      { user_address: "0xba15E9b644685cB845aF18a738Abd40C6Bcd78eD".toLowerCase(), is_private: true },
      { user_address: "0x0c99d36d2c031f5ef2d4c2e063767232d1d8885a".toLowerCase(), is_private: true },
      { user_address: "0x704ee15AFe87130f51E2ed34a87a72590A855913".toLowerCase(), is_private: true },
      { user_address: "0x544C95749BcE11822cF5513C29670E83Df8BE5f6".toLowerCase(), is_private: true },
    ],
  })
}

seedPredeposit()
