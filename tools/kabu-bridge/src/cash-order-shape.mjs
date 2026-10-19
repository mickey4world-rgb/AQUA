/**
 * Cash sendorder shape invariants (kabuステーション API).
 * Walk THIS file whenever any reject code is fixed — do not patch one field in isolation.
 *
 * Official constraints (as of 2026-02+):
 * - Exchange 1 (東証) banned for cash buy/sell → 100378; use 27 (東証+) or 9 (SOR)
 * - FundType AA without credit agreement → 100204; use 02 (保護)
 * - Buy DelivType required (2=お預り金 / 3=auマネーコネクト)
 * - Sell FundType = two ASCII spaces; DelivType = 0
 * - CashMargin = 1 for 現物
 */

export const CASH_EXCHANGES_ALLOWED = Object.freeze([9, 27]);
export const KNOWN_REJECT_PLAYBOOK = Object.freeze({
  100378: "Exchange must be 27 or 9 (not 1)",
  100204: "FundType AA requires credit; use 02",
  100031: "FundType invalid for account",
  100001: "Buy DelivType missing/invalid",
  21: "Insufficient buying power",
  32: "AccountType mismatch (2=一般 / 4=特定)",
  100202: "Agreement unread (best-exec / listed securities)",
});

/** Force cash Exchange off banned TSE=1. */
export function normalizeCashExchange(raw, preferred = 27) {
  const pref = Number(preferred) || 27;
  const safePref = pref === 1 ? 27 : pref;
  const n = Number(raw) || 0;
  if (n === 1 || n === 0) return safePref;
  if (n === 9 || n === 27) return n;
  // Regional (名証等): keep; still not 1
  return n;
}

/**
 * @returns {{ ok: true } | { ok: false; errors: string[] }}
 */
export function assertCashOrderShape(order, opts = {}) {
  const errors = [];
  const allowCreditFund = opts.allowCreditFund === true;
  if (!order || typeof order !== "object") {
    return { ok: false, errors: ["order missing"] };
  }
  if (Number(order.CashMargin) !== 1) {
    errors.push(`CashMargin=${order.CashMargin} must be 1 (cash)`);
  }
  const ex = Number(order.Exchange);
  if (ex === 1) {
    errors.push("Exchange=1 banned for cash since 2026-02 (100378); use 27 or 9");
  } else if (!CASH_EXCHANGES_ALLOWED.includes(ex) && ![3, 5, 6].includes(ex)) {
    errors.push(`Exchange=${ex} not in allowed cash set ${CASH_EXCHANGES_ALLOWED.join(",")}`);
  }
  const side = String(order.Side);
  const fund = order.FundType;
  const deliv = Number(order.DelivType);
  if (side === "2") {
    // buy
    if (fund === "AA" && !allowCreditFund) {
      errors.push("FundType=AA without credit opt-in (100204 risk); use 02");
    }
    if (fund !== "02" && fund !== "AA") {
      errors.push(`FundType=${JSON.stringify(fund)} invalid for cash buy (want 02 or AA)`);
    }
    if (deliv !== 2 && deliv !== 3) {
      errors.push(`DelivType=${deliv} invalid for cash buy (want 2 or 3)`);
    }
  } else if (side === "1") {
    // sell
    if (fund !== "  ") {
      errors.push(`FundType for cash sell must be two spaces, got ${JSON.stringify(fund)}`);
    }
    if (deliv !== 0) {
      errors.push(`DelivType for cash sell must be 0, got ${deliv}`);
    }
  } else {
    errors.push(`Side=${side} invalid`);
  }
  if (Number(order.SecurityType) !== 1) {
    errors.push(`SecurityType=${order.SecurityType} must be 1`);
  }
  if (Number(order.FrontOrderType) === 10 && Number(order.Price) !== 0) {
    errors.push("Market order FrontOrderType=10 requires Price=0");
  }
  if (!(Number(order.Qty) > 0)) {
    errors.push(`Qty=${order.Qty} must be > 0`);
  }
  if (!String(order.Symbol || "").trim()) {
    errors.push("Symbol missing");
  }
  const acct = Number(order.AccountType);
  if (acct !== 2 && acct !== 4) {
    errors.push(`AccountType=${acct} must be 2 (一般) or 4 (特定)`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Autofix map for reject codes (mutates orderBody). Returns fix strings. */
export function applyKnownRejectFixes(orderBody, code, remember) {
  const fixes = [];
  const c = Number(code);
  if (c === 100378) {
    if (orderBody.Exchange === 1) {
      orderBody.Exchange = 27;
      fixes.push("Exchange 1->27 (100378)");
      remember?.({ exchange: 27 });
      return fixes;
    }
    if (orderBody.Exchange === 27) {
      orderBody.Exchange = 9;
      fixes.push("Exchange 27->9 (100378 SOR)");
      remember?.({ exchange: 9 });
      return fixes;
    }
  }
  if (c === 100204 && String(orderBody.FundType) === "AA") {
    orderBody.FundType = "02";
    fixes.push("FundType AA->02 (100204)");
    remember?.({ fundType: "02" });
    return fixes;
  }
  if (c === 100001 && String(orderBody.Side) === "2") {
    // Buy delivery: 2=お預り金, 3=auマネーコネクト — flip once
    if (Number(orderBody.DelivType) === 2) {
      orderBody.DelivType = 3;
      fixes.push("DelivType 2->3 (100001 au)");
      return fixes;
    }
    orderBody.DelivType = 2;
    fixes.push("DelivType ->2 (100001)");
    return fixes;
  }
  if (c === 100031 && String(orderBody.Side) === "2") {
    // Wrong fund type for account: flip AA→02 only (never invent credit AA).
    if (String(orderBody.FundType) === "AA") {
      orderBody.FundType = "02";
      fixes.push("FundType AA->02 (100031)");
      remember?.({ fundType: "02" });
      return fixes;
    }
  }
  if (c === 32) {
    // 口座種別不正: 特定(4) ↔ 一般(2)
    if (Number(orderBody.AccountType) === 4) {
      orderBody.AccountType = 2;
      fixes.push("AccountType 4->2 (32)");
      remember?.({ accountType: 2 });
      return fixes;
    }
    if (Number(orderBody.AccountType) === 2) {
      orderBody.AccountType = 4;
      fixes.push("AccountType 2->4 (32)");
      remember?.({ accountType: 4 });
      return fixes;
    }
  }
  return fixes;
}
