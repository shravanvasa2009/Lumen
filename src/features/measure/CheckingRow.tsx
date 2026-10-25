import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Icon } from '@/ui/components/Icon';
import { useTheme } from '@/ui/theme';

import type { CheckingItem } from './checkingItems';
import type { MeasureMode } from './mode';

// Narrower than this, the checks stack as a list.
export const COMPACT_WIDTH_DP = 400;

// Only colour and icon change, so nothing moves on the capture screen.
export function CheckingRow({
  mode,
  items,
  dimmed = false,
}: {
  mode: MeasureMode;
  items: readonly CheckingItem[];
  dimmed?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const compact = useWindowDimensions().width < COMPACT_WIDTH_DP;
  const names = {
    afib: t('checks.afib.name'),
    hrv: t('checks.hrv.name'),
    diabetes: t('checks.diabetes.name'),
    pots: t('checks.pots.name'),
  };
  const words = {
    ready: t('checks.state.ready'),
    checking: t('checks.state.working'),
    unavailable: t('checks.state.unavailable'),
    off: t('checks.state.off'),
  };
  // Keyed on the mode, not on every item being off: a Full Scan with every check locked must not
  // show the Quick wording.
  const quick = mode === 'quick';
  return (
    <View
      style={{
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderWidth: 1,
      }}
    >
      <AppText variant="caption" tone="textDim" style={{ textTransform: 'uppercase', fontWeight: '600' }}>
        {t('checks.checking')}
      </AppText>
      {quick ? (
        <AppText tone="textDim">{t('checks.quickHeartRateOnly')}</AppText>
      ) : (
        <View
          style={{
            flexDirection: compact ? 'column' : 'row',
            gap: compact ? spacing.xs : spacing.md,
            alignItems: compact ? 'stretch' : 'flex-start',
          }}
        >
          {items.map(({ id, state }) => {
            const lit = state === 'ready' && !dimmed;
            const quiet = state === 'off' || state === 'unavailable';
            const tone = lit ? colors.accent : colors.textDim;
            const label = id === 'pots' ? t('checks.pots.standingNote') : `${names[id]}, ${words[state]}`;
            const word = (
              <AppText variant="caption" tone="textDim">
                {words[state]}
              </AppText>
            );
            return (
              <View
                key={id}
                accessible
                accessibilityLabel={label}
                style={{
                  flex: compact ? undefined : 1,
                  flexDirection: compact ? 'row' : 'column',
                  alignItems: compact ? 'center' : 'flex-start',
                  justifyContent: 'space-between',
                  gap: spacing.xs,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  {quiet ? (
                    <AppText tone="textDim" style={{ width: 16, textAlign: 'center' }}>
                      –
                    </AppText>
                  ) : (
                    <Icon name={state === 'ready' ? 'check' : 'clock'} size={16} color={tone} />
                  )}
                  <AppText
                    style={{
                      fontWeight: '600',
                      color: quiet || dimmed ? colors.textDim : lit ? colors.accent : colors.text,
                    }}
                  >
                    {names[id]}
                  </AppText>
                </View>
                {word}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
