import { useIsFocused } from 'expo-router';

import { CareMapScreen } from '@/features/care/CareMapScreen';

// Tabs stay mounted, so the map and location request exist only while this tab is focused.
export default function CareTab() {
  return useIsFocused() ? <CareMapScreen /> : null;
}
