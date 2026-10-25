import { AppText } from '@/ui/components/AppText';
import { useTheme } from '@/ui/theme';

// The small heading above a grouped card. It sits one gutter further in than the card.
export function SectionLabel({ children }: { children: string }) {
  const { spacing } = useTheme();
  return (
    <AppText
      variant="caption"
      tone="textDim"
      accessibilityRole="header"
      style={{ paddingHorizontal: spacing.lg }}
    >
      {children}
    </AppText>
  );
}
