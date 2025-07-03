import { id } from "ethers"

export const REPAY = "Repay(address,address,uint256,bool)"
export const REPAY_AND_WITHDRAW = "RepayAndWithdraw(address,uint256,uint256,bool)"
export const ZAP_REPAY = "ZapRepay(address,address,uint256,bool,address,uint256)"
export const ZAP_REPAY_AND_WITHDRAW = "ZapRepayAndWithdraw(address,uint256,uint256,bool,address,uint256)"
export const WITHDRAW = "Withdraw(address,uint256)"

export const LEVERAGE = "Leverage(address,uint256,uint256,uint256)"
export const ZAP_LEVERAGE = "ZapLeverage(address,uint256,uint256,uint256,uint256,address,uint256)"

export const DEPOSIT = "Deposit(address,uint256)"
export const BORROW = "Borrow(address,address,uint256)"
export const ZAP_DEPOSIT = "ZapDeposit(address,uint256,address,uint256)"
export const DEPOSIT_AND_BORROW = "DepositAndBorrow(address,uint256,uint256)"
export const ZAP_DEPOSIT_AND_BORROW = "ZapDepositAndBorrow(address,uint256,uint256,address,uint256)"

// Event signatures and topics
export const EVENT_TOPICS = {
  [id(REPAY)]: "Repay",
  [id(REPAY_AND_WITHDRAW)]: "RepayAndWithdraw",
  [id(ZAP_REPAY)]: "ZapRepay",
  [id(ZAP_REPAY_AND_WITHDRAW)]: "ZapRepayAndWithdraw",
  [id(WITHDRAW)]: "Withdraw",
  [id(DEPOSIT)]: "Deposit",
  [id(BORROW)]: "Borrow",
  [id(ZAP_DEPOSIT)]: "ZapDeposit",
  [id(DEPOSIT_AND_BORROW)]: "DepositAndBorrow",
  [id(ZAP_DEPOSIT_AND_BORROW)]: "ZapDepositAndBorrow",
  [id(LEVERAGE)]: "Leverage",
  [id(ZAP_LEVERAGE)]: "ZapLeverage",
}
