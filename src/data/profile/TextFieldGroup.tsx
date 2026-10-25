import type { KeyboardTypeOptions } from 'react-native';
import { TextInput, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { SectionLabel } from '@/features/settings/SectionLabel';
import { useTheme } from '@/ui/theme';

type TextFieldGroupProps = {
  // Also the spoken label.
  heading: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  maxLength: number;
  problem?: string | null;
  note?: string;
};

export function TextFieldGroup({
  heading,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  maxLength,
  problem = null,
  note,
}: TextFieldGroupProps) {
  const { colors, spacing, control } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionLabel>{heading}</SectionLabel>
      <Card flush>
        <TextInput
          accessibilityLabel={heading}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
          maxLength={maxLength}
          value={value}
          onChangeText={onChangeText}
          style={{
            minHeight: control.minTarget,
            paddingHorizontal: spacing.lg,
            fontSize: 17,
            color: colors.text,
          }}
        />
      </Card>
      {note ? (
        <AppText variant="caption" tone="textDim">
          {note}
        </AppText>
      ) : null}
      {problem ? (
        <AppText variant="caption" tone="textDim" accessibilityRole="alert">
          {problem}
        </AppText>
      ) : null}
    </View>
  );
}
