import { Share } from 'react-native';
import type { TFunction } from 'i18next';

export type BillShareParticipant = {
  uniqueId: string;
  username: string;
  amount: number;
};

export type BillShareInput = {
  sessionName: string;
  currency: string;
  grandTotal: number;
  participants: BillShareParticipant[];
  /** If provided, each line gets a paid / unpaid mark */
  paidUniqueIds?: string[];
};

export const formatMoney = (value: number, currency: string) =>
  `${currency} ${Math.round(value).toLocaleString('en-US')}`;

export const buildBillShareText = (input: BillShareInput, t: TFunction): string => {
  const paid = input.paidUniqueIds ? new Set(input.paidUniqueIds) : undefined;
  const lines = [
    t('settlement.shareText.title', { name: input.sessionName }),
    t('settlement.shareText.total', { amount: formatMoney(input.grandTotal, input.currency) }),
    '',
    t('settlement.shareText.perPerson'),
    ...input.participants.map(p => {
      const mark = paid
        ? `${paid.has(p.uniqueId) ? t('settlement.shareText.paidMark') : t('settlement.shareText.unpaidMark')} `
        : '• ';
      return `${mark}${p.username}: ${formatMoney(p.amount, input.currency)}`;
    }),
    '',
    t('settlement.shareText.footer'),
  ];
  return lines.join('\n');
};

export const shareBill = async (input: BillShareInput, t: TFunction) => {
  try {
    await Share.share({ message: buildBillShareText(input, t) });
  } catch (error) {
    console.warn('[shareBill] Share failed', error);
  }
};
