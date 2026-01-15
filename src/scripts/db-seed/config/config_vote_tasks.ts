import { CURVE_GLOBAL_CONTRACTS, FXN_GLOBAL_CONTRACTS } from "@tangent/defi-resources"

//
export const ONCHAIN_TASKS = [
  {
    orga: "CRV",
    url: "https://www.curve.finance/dao/ethereum/gauges",
    controller: CURVE_GLOBAL_CONTRACTS.GAUGE_CONTROLLER.toLowerCase(),
    gauges: [
      {
        taskDescription: "crvUSD_USDC on veCRV gauge",
        name: "crvUSD_USDC",
        address: "0x95f00391cB5EebCd190EB58728B4CE23DbFa6ac1".toLowerCase(),
        pointRate: 3,
      },
      {
        taskDescription: "crvUSD_USDT on veCRV gauge",
        name: "crvUSD_USDT",
        address: "0x156527deF9a2AB4F54C849575f23dC4BB439d9d9".toLowerCase(),
        pointRate: 3,
      },
      {
        taskDescription: "crvUSD_USDf on veCRV gauge",
        name: "USDC_USDf",
        address: "0x156527deF9a2AB4F54C849575f23dC4BB439d9d9".toLowerCase(),
        pointRate: 3,
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
        taskDescription: "STABILITY_POOL on veFXN gauge",
        name: "STABILITY_POOL",
        address: "0x215D87bd3c7482E2348338815E059DE07Daf798A".toLowerCase(),
        pointRate: 2.5,
      },
      {
        taskDescription: "FXN_ETH on veFXN gauge",
        name: "FXN_ETH",
        address: "0xA5250C540914E012E22e623275E290c4dC993D11".toLowerCase(),
        pointRate: 2.5,
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
    orga: "cvx.eth",
    url: "https://vote.convexfinance.com/",
    title: "Gauge Weight for Week",
    scoringChoices: [
      { taskDescription: "crvUSD_USD0 on CVX snapshot", name: "crvUSD+USD0", pointRate: 3 },
      { taskDescription: "MIM3_CRV on CVX snapshot", name: "MIM+3CRV", pointRate: 3 },
      { taskDescription: "WETH_CVX on CVX snapshot", name: "WETH+CVX", pointRate: 3 },
      { taskDescription: "CRV_cvxCRV on CVX snapshot", name: "CRV+cvxCRV", pointRate: 3 },
    ],
    excludedVoters: [
      { name: "Votium delegation", user_address: "0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49".toLowerCase() },
      { name: "Stake DAO delegation", user_address: "0x52ea58f4FC3CEd48fa18E909226c1f8A0EF887DC".toLowerCase() },
      { name: "Clever delegation", user_address: "0x96C68D861aDa016Ed98c30C810879F9df7c64154".toLowerCase() },
      { name: "Pirex delegation", user_address: "0x97CE0101A307a79eC9959D82DB1D8ADBa9FbEE4D".toLowerCase() },
    ],
  },
  {
    orga: "sdcrv.eth",
    url: "https://snapshot.box/#/s:sdcrv.eth",
    title: "Gauge vote CRV",
    scoringChoices: [
      { taskDescription: "crvUSD_USD0 on sdCRV snapshot", name: "crvUSD+USD0", pointRate: 3 },
      { taskDescription: "ETH++_ETH on sdCRV snapshot", name: "ETH++WETH", pointRate: 3 },
      { taskDescription: "sdCRV-CRV on sdCRV snapshot", name: "sdCRV+CRV", pointRate: 3 },
    ],
    excludedVoters: [{ name: "Stake DAO delegation", user_address: "0x52ea58f4FC3CEd48fa18E909226c1f8A0EF887DC".toLowerCase() }],
  },
  {
    orga: "sdpendle.eth",
    url: "https://snapshot.box/#/s:sdpendle.eth",
    title: "Gauge vote PENDLE",
    scoringChoices: [
      { taskDescription: "PT-reUSD_25JUN26 on sdPENDLE snapshot", name: "reUSD-25JUN2026 - 1", pointRate: 3 },
      { taskDescription: "PT-asdPENDLE_26MAR2026 on sdPENDLE snapshot", name: "asdPENDLE-26MAR2026 - 1", pointRate: 2.5 },
    ],
    excludedVoters: [{ name: "Stake DAO delegation", user_address: "0x52ea58f4FC3CEd48fa18E909226c1f8A0EF887DC".toLowerCase() }],
  },
  {
    orga: "sdfxn.eth",
    url: "https://snapshot.box/#/s:sdFXN.eth",
    title: "Gauge vote FXN",
    scoringChoices: [
      { taskDescription: "FXN_sdFXN on sdFXN snapshot", name: "FXN+sdFXN", pointRate: 1 },
      { taskDescription: "msUSD_fxUSDon sdFXN snapshot", name: "msUSD+fxUSD", pointRate: 2 },
    ],
    excludedVoters: [{ name: "Stake DAO delegation", user_address: "0x52ea58f4FC3CEd48fa18E909226c1f8A0EF887DC".toLowerCase() }],
  },
]
