import { Stack } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import type { EvidenceMetric } from '@/data/evidence';
import { useTheme } from '@/ui/theme';

import { AppText } from './AppText';
import { Card } from './Card';
import { EvidenceBadge } from './EvidenceBadge';
import { Screen } from './Screen';

type RouteSection = { heading: string; lines?: readonly string[]; metric?: EvidenceMetric };

type RouteShellProps = {
  title: string;
  subtitle?: string;
  titleTone?: ComponentProps<typeof AppText>['tone'];
  sections?: readonly RouteSection[];
  children?: ReactNode;
  // The screen draws its own title.
  headerless?: boolean;
  tabRoot?: boolean;
  footer?: ReactNode;
  // Right of the nav bar, or beside the body title without a header.
  trailing?: ReactNode;
};

export function RouteShell({
  title,
  subtitle,
  titleTone,
  sections = [],
  children,
  headerless = false,
  tabRoot = false,
  footer,
  trailing,
}: RouteShellProps) {
  const { spacing } = useTheme();
  const drawsOwnTitle = headerless || tabRoot;
  return (
    <Screen headerless={drawsOwnTitle} aboveTabBar={tabRoot} footer={footer}>
      {headerless ? <Stack.Screen options={{ headerShown: false }} /> : null}
      {drawsOwnTitle ? null : (
        <Stack.Screen options={{ title, headerRight: trailing ? () => trailing : undefined }} />
      )}
      <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xxxl }}>
        {drawsOwnTitle ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <AppText
              variant={tabRoot ? 'display' : 'title'}
              tone={titleTone}
              accessibilityRole="header"
              style={{ flex: 1 }}
            >
              {title}
            </AppText>
            {trailing}
          </View>
        ) : null}
        {subtitle ? <AppText tone="textDim">{subtitle}</AppText> : null}
        {sections.map(({ heading, lines = [], metric }) => (
          <Card key={heading}>
            <AppText variant="headline">{heading}</AppText>
            {metric ? <EvidenceBadge metric={metric} /> : null}
            {lines.map((line) => (
              <AppText key={line} tone="textDim">
                {line}
              </AppText>
            ))}
          </Card>
        ))}
        {children}
      </ScrollView>
    </Screen>
  );
}
