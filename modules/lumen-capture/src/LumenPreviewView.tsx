import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

// Drawn natively; no frame reaches JS. null without the capture module, where screens draw a glow instead.
// Resolved once at import because requireNativeView registers the view by name.
export const LumenPreviewView: ComponentType<ViewProps> | null =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? requireNativeView<ViewProps>('LumenCapture', 'LumenPreviewView')
    : null;
