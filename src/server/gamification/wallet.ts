import { robuxLedgerRepo } from "~/repositories/robuxLedger.js";
import { computeWallet, type Wallet } from "~/domain/ledger/ledger.js";

/** Compute an enrollment's wallet from its ledger entries (§11). */
export async function walletFor(enrollmentId: string): Promise<Wallet> {
  const entries = await robuxLedgerRepo.list(enrollmentId);
  return computeWallet(entries.map((e) => ({ type: e.type, amount: e.amount, source: e.source, refId: e.refId })));
}
