import { View } from 'react-native';

import { Icon } from '@/ui/components/Icon';
import { useTheme } from '@/ui/theme';

import type { Lesson } from './lessons';

// No token fits a 48 tile with a 12 corner.
const TILE_SIZE = 48;
const TILE_RADIUS = 12;

// Red stays reserved for the emergency screen.
export function LessonTile({ tone }: { tone: Lesson['tone'] }) {
  const { colors, control } = useTheme();
  const fill = { accent: colors.accentFill, flag: colors.flag, public: colors.badgePublicFg }[tone];
  return (
    <View
      style={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        borderRadius: TILE_RADIUS,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="learn" size={control.chevronSize + 4} color={colors.bg} />
    </View>
  );
}
