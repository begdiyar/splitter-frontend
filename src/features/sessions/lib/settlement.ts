import type { SessionHistoryEntry } from '@/features/sessions/api/history.api';

export type SettlementSummary = {
  /** uniqueId of the person who paid the bill (session creator) */
  payerId?: string;
  /** Participants who owe money to the payer */
  debtorIds: string[];
  paidCount: number;
  debtorCount: number;
  collected: number;
  remaining: number;
  allSettled: boolean;
  isPaid: (uniqueId: string) => boolean;
  amountOf: (uniqueId: string) => number;
};

/**
 * Who still has to pay back the person who covered the bill.
 * The payer's own share is never counted as a debt.
 */
export const getSettlementSummary = (bill: SessionHistoryEntry): SettlementSummary => {
  const paid = new Set(bill.paidUniqueIds ?? []);
  const amounts = new Map<string, number>();
  (bill.totals?.byParticipant ?? []).forEach(p => amounts.set(p.uniqueId, p.amountOwed ?? 0));

  const payerId = bill.creatorUniqueId;
  const debtorIds = (bill.participants ?? [])
    .map(p => p.uniqueId)
    .filter(id => id !== payerId && (amounts.get(id) ?? 0) > 0);

  let collected = 0;
  let remaining = 0;
  let paidCount = 0;
  debtorIds.forEach(id => {
    const amount = amounts.get(id) ?? 0;
    if (paid.has(id)) {
      collected += amount;
      paidCount += 1;
    } else {
      remaining += amount;
    }
  });

  return {
    payerId,
    debtorIds,
    paidCount,
    debtorCount: debtorIds.length,
    collected,
    remaining,
    allSettled: paidCount === debtorIds.length,
    isPaid: id => id === payerId || paid.has(id),
    amountOf: id => amounts.get(id) ?? 0,
  };
};
