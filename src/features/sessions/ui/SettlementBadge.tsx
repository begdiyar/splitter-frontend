import React from 'react';
import { XStack, Text } from 'tamagui';
import { Check, Clock } from '@tamagui/lucide-icons';

const SETTLED = '#2ECC71';
const PENDING = '#F39C12';

export function SettlementBadge({ settled, label }: { settled: boolean; label: string }) {
  const color = settled ? SETTLED : PENDING;
  const Icon = settled ? Check : Clock;
  return (
    <XStack ai="center" gap="$1" px="$2" py={2} br={12} backgroundColor={`${color}1A`}>
      <Icon size={12} color={color} />
      <Text fontSize={11} fontWeight="600" color={color}>
        {label}
      </Text>
    </XStack>
  );
}
