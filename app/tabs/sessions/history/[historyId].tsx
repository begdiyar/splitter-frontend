import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { YStack, XStack, Text, ScrollView, Button, Spinner } from 'tamagui';
import { Check, Clock, Share2 } from '@tamagui/lucide-icons';

import UserAvatar from '@/shared/ui/UserAvatar';
import { useAppStore } from '@/shared/lib/stores/app-store';
import { useSessionsHistoryStore } from '@/features/sessions/model/history.store';
import { getSettlementSummary } from '@/features/sessions/lib/settlement';
import { formatMoney, shareBill } from '@/features/sessions/lib/bill-share';
import type {
  SessionHistoryEntry,
  SessionHistoryAllocation,
  SessionHistoryItem,
  SessionHistoryParticipantLight,
  SessionHistoryTotalsByParticipant,
} from '@/features/sessions/api/history.api';

const DEFAULT_CURRENCY = 'UZS';
const BRAND = '#2ECC71';
const WARNING = '#F39C12';
const BULLET = '•';
const DETAIL_LIMIT = 50;

const formatSessionDate = (value: string | undefined, locale: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type ParticipantView = {
  participant: SessionHistoryParticipantLight;
  avatarUrl?: string | null;
  amount: number;
  items: {
    id: string;
    title: string;
    price: number;
  }[];
};

const buildParticipantsView = (bill?: SessionHistoryEntry): ParticipantView[] => {
  if (!bill) return [];

  const totalsByParticipant = new Map<string, SessionHistoryTotalsByParticipant>();
  (bill.totals?.byParticipant ?? []).forEach(item => {
    totalsByParticipant.set(item.uniqueId, item);
  });

  const itemsById = new Map<string, SessionHistoryItem>();
  (bill.totals?.byItem ?? []).forEach(item => {
    itemsById.set(item.itemId, item);
  });

  const allocationsByParticipant = new Map<string, SessionHistoryAllocation[]>();
  (bill.allocations ?? []).forEach(alloc => {
    const collection = allocationsByParticipant.get(alloc.participantId) ?? [];
    collection.push(alloc);
    allocationsByParticipant.set(alloc.participantId, collection);
  });

  return (bill.participants ?? []).map(p => {
    const totals = totalsByParticipant.get(p.uniqueId);
    const allocations = allocationsByParticipant.get(p.uniqueId) ?? [];
    const items = allocations.map((allocation, index) => {
      const itemMeta = itemsById.get(allocation.itemId);
      return {
        id: `${allocation.itemId}-${p.uniqueId}-${index}`,
        title: itemMeta?.name || 'Item',
        price: allocation.shareAmount,
      };
    });
    return {
      participant: {
        uniqueId: p.uniqueId,
        username: totals?.username || p.username || 'U',
        avatarUrl: p.avatarUrl ?? null,
      },
      avatarUrl: p.avatarUrl ?? null,
      amount: totals?.amountOwed ?? 0,
      items,
    };
  });
};

function StatusPill({ paid, label }: { paid: boolean; label: string }) {
  const color = paid ? BRAND : WARNING;
  const Icon = paid ? Check : Clock;
  return (
    <XStack ai="center" gap="$1" px="$2" py={2} br={12} bg={`${color}1A`}>
      <Icon size={12} color={color} />
      <Text fontSize={12} fontWeight="600" color={color}>
        {label}
      </Text>
    </XStack>
  );
}

export default function HistoryDetailsScreen() {
  const { historyId } = useLocalSearchParams<{ historyId: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const me = useAppStore(state => state.user);
  const sessions = useSessionsHistoryStore(state => state.sessions);
  const loading = useSessionsHistoryStore(state => state.loading);
  const initialized = useSessionsHistoryStore(state => state.initialized);
  const currentLimit = useSessionsHistoryStore(state => state.limit);
  const error = useSessionsHistoryStore(state => state.error);
  const fetchHistory = useSessionsHistoryStore(state => state.fetchHistory);
  const setParticipantPaid = useSessionsHistoryStore(state => state.setParticipantPaid);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const bill: SessionHistoryEntry | undefined = useMemo(() => {
    if (!historyId) return undefined;
    const id = Number(historyId);
    if (Number.isNaN(id)) return undefined;
    return sessions.find(session => session.sessionId === id);
  }, [historyId, sessions]);

  useEffect(() => {
    if (loading) return;
    const hasBill = Boolean(bill);
    if (!initialized || (!hasBill && (currentLimit ?? 0) < DETAIL_LIMIT)) {
      fetchHistory(DETAIL_LIMIT).catch(() => {});
    }
  }, [initialized, loading, currentLimit, fetchHistory, bill]);

  const participants = useMemo(() => buildParticipantsView(bill), [bill]);
  const settlement = useMemo(() => (bill ? getSettlementSummary(bill) : undefined), [bill]);
  const currency =
    bill?.currency ||
    bill?.totals?.currency ||
    bill?.payload?.totals?.currency ||
    DEFAULT_CURRENCY;

  if (!bill && loading) {
    return (
      <YStack f={1} bg="$background" ai="center" jc="center">
        <Text fontSize={16}>{t('settlement.loading')}</Text>
      </YStack>
    );
  }

  if (!bill || !settlement) {
    return (
      <YStack f={1} bg="$background" ai="center" jc="center" gap="$3">
        <Text fontSize={16} fontWeight="600">{t('settlement.notFound')}</Text>
        {error && (
          <Text fontSize={14} color="$red10">
            {error}
          </Text>
        )}
        <Button onPress={() => router.back()}>{t('settlement.back')}</Button>
      </YStack>
    );
  }

  const canEdit = bill.isCreator;
  const progress = settlement.debtorCount > 0 ? settlement.paidCount / settlement.debtorCount : 1;

  const togglePaid = async (uniqueId: string, paid: boolean) => {
    setPendingId(uniqueId);
    try {
      await setParticipantPaid(bill.sessionId, uniqueId, paid);
    } catch {
      Alert.alert(t('common.error', 'Error'), t('settlement.updateFailed'));
    } finally {
      setPendingId(null);
    }
  };

  const onShare = () =>
    shareBill(
      {
        sessionName: bill.sessionName,
        currency,
        grandTotal: bill.grandTotal ?? 0,
        participants: participants.map(({ participant, amount }) => ({
          uniqueId: participant.uniqueId,
          username: participant.username,
          amount,
        })),
        paidUniqueIds: [
          ...(bill.paidUniqueIds ?? []),
          ...(settlement.payerId ? [settlement.payerId] : []),
        ],
      },
      t
    );

  const myId = me?.uniqueId;
  const iAmDebtor = !canEdit && !!myId && settlement.debtorIds.includes(myId);

  return (
    <YStack f={1} bg="$background" px="$4" pt="$4" pb="$4">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 32, gap: 16 }}
      >
        <YStack w={358} gap="$3">
          <XStack jc="space-between" ai="center">
            <Text fontSize={24} fontWeight="700" f={1} numberOfLines={1}>
              {bill.sessionName}
            </Text>
            <Button
              size="$3"
              icon={<Share2 size={16} color={BRAND} />}
              borderColor={BRAND}
              borderWidth={1}
              bg="transparent"
              onPress={onShare}
            >
              <Text color={BRAND} fontWeight="600">{t('settlement.share')}</Text>
            </Button>
          </XStack>
          <Text fontSize={14} color="$gray10">
            {`${formatSessionDate(bill.finalizedAt || bill.createdAt, i18n.language)} ${BULLET} ${t(
              'settlement.participants',
              { count: (bill.participants ?? []).length }
            )}`}
          </Text>
          <Text fontSize={16} fontWeight="700" color={BRAND}>
            {formatMoney(bill.grandTotal ?? 0, currency)}
          </Text>
        </YStack>

        {/* Settlement progress */}
        {settlement.debtorCount > 0 && (
          <YStack
            w={358}
            p="$3"
            br={12}
            borderWidth={1}
            borderColor={settlement.allSettled ? BRAND : '$gray5'}
            bg={settlement.allSettled ? `${BRAND}1A` : '$color1'}
            gap="$2"
          >
            <XStack jc="space-between" ai="center">
              <Text fontSize={14} fontWeight="700">
                {t('settlement.progressTitle')}
              </Text>
              {settlement.allSettled ? (
                <StatusPill paid label={t('settlement.allSettled')} />
              ) : (
                <Text fontSize={13} color="$gray11">
                  {t('settlement.progressCount', {
                    paid: settlement.paidCount,
                    total: settlement.debtorCount,
                  })}
                </Text>
              )}
            </XStack>
            <YStack h={8} br={4} bg="$gray4" overflow="hidden">
              <YStack h={8} br={4} bg={BRAND} w={`${Math.round(progress * 100)}%`} />
            </YStack>
            <XStack jc="space-between">
              <YStack>
                <Text fontSize={12} color="$gray10">{t('settlement.collected')}</Text>
                <Text fontSize={15} fontWeight="700" color={BRAND}>
                  {formatMoney(settlement.collected, currency)}
                </Text>
              </YStack>
              <YStack ai="flex-end">
                <Text fontSize={12} color="$gray10">{t('settlement.remaining')}</Text>
                <Text
                  fontSize={15}
                  fontWeight="700"
                  color={settlement.remaining > 0 ? WARNING : '$gray10'}
                >
                  {formatMoney(settlement.remaining, currency)}
                </Text>
              </YStack>
            </XStack>
            {iAmDebtor && myId && (
              <Text fontSize={13} fontWeight="600" color={settlement.isPaid(myId) ? BRAND : WARNING}>
                {settlement.isPaid(myId)
                  ? t('settlement.youPaid')
                  : t('settlement.youOwe', {
                      amount: formatMoney(settlement.amountOf(myId), currency),
                    })}
              </Text>
            )}
            {!canEdit && (
              <Text fontSize={11} color="$gray9">
                {t('settlement.creatorOnlyHint')}
              </Text>
            )}
          </YStack>
        )}

        {participants.map(({ participant, avatarUrl, amount, items }) => {
          const isPayer = participant.uniqueId === settlement.payerId;
          const isPaid = settlement.isPaid(participant.uniqueId);
          const isDebtor = settlement.debtorIds.includes(participant.uniqueId);
          const isPending = pendingId === participant.uniqueId;
          return (
            <YStack
              key={participant.uniqueId}
              w={358}
              borderWidth={1}
              borderColor={isDebtor && !isPaid ? WARNING : BRAND}
              br={12}
              bg="$color1"
              px={16}
              py={12}
              gap="$3"
            >
              <XStack jc="space-between" ai="center">
                <XStack ai="center" gap="$2" f={1}>
                  <UserAvatar
                    uri={avatarUrl ?? undefined}
                    label={(participant.username || 'U').slice(0, 1).toUpperCase()}
                    size={40}
                    textSize={16}
                    backgroundColor="$gray5"
                  />
                  <YStack f={1} gap={2}>
                    <Text fontSize={16} fontWeight="600" numberOfLines={1}>
                      {participant.username}
                    </Text>
                    {isPayer ? (
                      <Text fontSize={12} color="$gray10">{t('settlement.payer')}</Text>
                    ) : isDebtor ? (
                      <XStack>
                        <StatusPill
                          paid={isPaid}
                          label={isPaid ? t('settlement.paid') : t('settlement.unpaid')}
                        />
                      </XStack>
                    ) : null}
                  </YStack>
                </XStack>
                <Text fontSize={16} fontWeight="700" color={BRAND}>
                  {formatMoney(amount, currency)}
                </Text>
              </XStack>

              <YStack gap={8}>
                {items.length ? (
                  items.map(item => (
                    <XStack key={item.id} jc="space-between" ai="center">
                      <Text fontSize={14} f={1} numberOfLines={1}>{item.title}</Text>
                      <Text fontSize={14} fontWeight="600" color={BRAND}>
                        {Math.round(item.price).toLocaleString('en-US')}
                      </Text>
                    </XStack>
                  ))
                ) : (
                  <Text fontSize={12} color="$gray9">
                    {t('settlement.noItems')}
                  </Text>
                )}
              </YStack>

              {canEdit && isDebtor && (
                <Button
                  size="$3"
                  disabled={isPending}
                  opacity={isPending ? 0.6 : 1}
                  bg={isPaid ? 'transparent' : BRAND}
                  borderColor={isPaid ? '$gray7' : BRAND}
                  borderWidth={1}
                  icon={isPending ? <Spinner size="small" color={isPaid ? '$gray10' : 'white'} /> : undefined}
                  onPress={() => togglePaid(participant.uniqueId, !isPaid)}
                  pressStyle={{ opacity: 0.85 }}
                >
                  <Text color={isPaid ? '$gray11' : 'white'} fontWeight="600">
                    {isPaid ? t('settlement.markUnpaid') : t('settlement.markPaid')}
                  </Text>
                </Button>
              )}
            </YStack>
          );
        })}
      </ScrollView>
    </YStack>
  );
}
