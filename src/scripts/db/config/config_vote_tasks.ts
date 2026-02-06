import { CURVE_GLOBAL_CONTRACTS, FXN_GLOBAL_CONTRACTS } from "@tangent/defi-resources"

export const CURVE_GAUGE_URL = "https://www.curve.finance/dao/ethereum/gauges"
export const ONCHAIN_TASKS = [
  {
    orga: "CRV",
    url: CURVE_GAUGE_URL,
    controller: CURVE_GLOBAL_CONTRACTS.GAUGE_CONTROLLER.toLowerCase(),
    gauges: [
      {
        taskDescription: "USDC/crvUSD on veCRV gauge",
        name: "USDC/crvUSD",
        address: "0x95f00391cb5eebcd190eb58728b4ce23dbfa6ac1".toLowerCase(),
        pointRate: 7.5,
      },
      {
        taskDescription: "USDT/crvUSD on veCRV gauge",
        name: "USDT/crvUSD",
        address: "0x4e6bb6b7447b7b2aa268c16ab87f4bb48bf57939".toLowerCase(),
        pointRate: 10,
      },
    ],
    votersToExclude: [
      { name: "Convex", address: CURVE_GLOBAL_CONTRACTS.CONVEX_veCRV_VOTER.toLowerCase() },
      { name: "Stake DAO", address: CURVE_GLOBAL_CONTRACTS.STAKE_DAO_veCRV_VOTER.toLowerCase() },
      { name: "Yearn", address: CURVE_GLOBAL_CONTRACTS.YEARN_veCRV_VOTER.toLowerCase() },
    ],
  },
  {
    orga: "FXN",
    url: "https://fx.aladdin.club/gauge/",
    controller: FXN_GLOBAL_CONTRACTS.GAUGE_CONTROLLER.toLowerCase(),
    gauges: [
      {
        taskDescription: "cvxFXN/FXN on veFXN gauge",
        name: "cvxFXN/FXN",
        address: "0xfEFafB9446d84A9e58a3A2f2DDDd7219E8c94FbB".toLowerCase(),
        pointRate: 100,
      },
      {
        taskDescription: "Stability Pool on veFXN gauge",
        name: "Stability Pool",
        address: "0x215D87bd3c7482E2348338815E059DE07Daf798A".toLowerCase(),
        pointRate: 75,
      },
    ],
    votersToExclude: [
      { name: "Convex", address: FXN_GLOBAL_CONTRACTS.CONVEX_veFXN_VOTER.toLowerCase() },
      { name: "Stake DAO", address: FXN_GLOBAL_CONTRACTS.STAKE_DAO_veFXN_VOTER.toLowerCase() },
    ],
  },
]
export const OFFCHAIN_TASKS = [
  {
    orga: "sdcrv.eth",
    url: "https://snapshot.box/#/s:sdcrv.eth",
    title: "Gauge vote CRV",
    scoringChoices: [{ taskDescription: "frxUSD+crvUSD on sdCRV snapshot", name: "frxUSD+crvUSD", pointRate: 5 }],
    excludedVoters: [{ name: "Stake DAO delegation", user_address: "0x52ea58f4FC3CEd48fa18E909226c1f8A0EF887DC".toLowerCase() }],
  },
  {
    orga: "cvx.eth",
    url: "https://vote.convexfinance.com/",
    title: "Gauge Weight for Week",
    scoringChoices: [
      { taskDescription: "pmUSD+crvUSD on CVX snapshot", name: "pmUSD+crvUSD", pointRate: 20 },
      { taskDescription: "pmUSD+frxUSD on CVX snapshot", name: "pmUSD+frxUSD", pointRate: 15 },
    ],
    excludedVoters: [
      { name: "Votium delegation", user_address: "0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49".toLowerCase() },
      { name: "Stake DAO delegation", user_address: "0x52ea58f4FC3CEd48fa18E909226c1f8A0EF887DC".toLowerCase() },
      { name: "Clever delegation", user_address: "0x96C68D861aDa016Ed98c30C810879F9df7c64154".toLowerCase() },
      { name: "Pirex delegation", user_address: "0x97CE0101A307a79eC9959D82DB1D8ADBa9FbEE4D".toLowerCase() },
    ],
  },
  {
    orga: "sdfxn.eth",
    url: "https://snapshot.box/#/s:sdFXN.eth",
    title: "Gauge vote FXN",
    scoringChoices: [{ taskDescription: "FXN_sdFXN on sdFXN snapshot", name: "FXN+sdFXN", pointRate: 100 }],
    excludedVoters: [{ name: "Stake DAO delegation", user_address: "0x52ea58f4FC3CEd48fa18E909226c1f8A0EF887DC".toLowerCase() }],
  },
  {
    orga: "sdpendle.eth",
    url: "https://snapshot.box/#/s:sdpendle.eth",
    title: "Gauge vote PENDLE",
    scoringChoices: [{ taskDescription: "asdPENDLE-26MAR2026 on sdPENDLE snapshot", name: "asdPENDLE-26MAR2026 - 1", pointRate: 10 }],
    excludedVoters: [{ name: "Stake DAO delegation", user_address: "0x52ea58f4FC3CEd48fa18E909226c1f8A0EF887DC".toLowerCase() }],
  },
]
