import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { LumenCapture } from '../../../modules/lumen-capture/src';

export type Lens = { cx: number; cy: number; r: number };
type Label = { x: number; anchor: 'start' | 'middle' | 'end' };

export type PhoneModel = 'galaxyA17' | 'iphone17Pro' | 'generic';

export type PhoneBackLayout = {
  model: PhoneModel;
  cameraIsland: { x: number; y: number; width: number; height: number; rx: number };
  // The first lens is the one the fingertip must cover.
  lenses: readonly Lens[];
  flash: Lens;
  extras: readonly Lens[];
  fingerPad: { x: number; y: number; width: number; height: number };
  lensLabel: Label;
  flashLabel: Label;
};

// Positions are read from manufacturer product photos, not measured. Units are viewBox px.
const galaxyA17: PhoneBackLayout = {
  model: 'galaxyA17',
  cameraIsland: { x: 82, y: 52, width: 46, height: 112, rx: 23 },
  lenses: [
    { cx: 105, cy: 77, r: 15 },
    { cx: 105, cy: 111, r: 11 },
    { cx: 105, cy: 141, r: 8 },
  ],
  flash: { cx: 146, cy: 77, r: 6 },
  extras: [],
  fingerPad: { x: 84, y: 58, width: 84, height: 38 },
  lensLabel: { x: 112, anchor: 'end' },
  flashLabel: { x: 140, anchor: 'start' },
};

const iphone17Pro: PhoneBackLayout = {
  model: 'iphone17Pro',
  cameraIsland: { x: 74, y: 46, width: 190, height: 96, rx: 24 },
  lenses: [
    { cx: 108, cy: 74, r: 17 },
    { cx: 108, cy: 116, r: 17 },
    { cx: 148, cy: 95, r: 17 },
  ],
  flash: { cx: 206, cy: 70, r: 7 },
  extras: [
    { cx: 206, cy: 112, r: 7 },
    { cx: 236, cy: 70, r: 2.5 },
  ],
  fingerPad: { x: 86, y: 52, width: 142, height: 40 },
  lensLabel: { x: 108, anchor: 'middle' },
  flashLabel: { x: 206, anchor: 'middle' },
};

// Fallback for any other phone: one main lens with the flash beside it.
const generic: PhoneBackLayout = {
  model: 'generic',
  cameraIsland: { x: 80, y: 52, width: 90, height: 56, rx: 28 },
  lenses: [{ cx: 106, cy: 80, r: 15 }],
  flash: { cx: 148, cy: 80, r: 6 },
  extras: [],
  fingerPad: { x: 84, y: 58, width: 88, height: 44 },
  lensLabel: { x: 100, anchor: 'end' },
  flashLabel: { x: 154, anchor: 'start' },
};

const LAYOUTS: Record<PhoneModel, PhoneBackLayout> = { galaxyA17, iphone17Pro, generic };

// Galaxy A17: Build.MODEL is SM-A176x, or SM-S176x on carrier units; the module prefixes "samsung ".
// iPhone 17 Pro is iPhone18,1 (the Pro Max, iPhone18,2, has a different body).
// Identifiers: https://theapplewiki.com/wiki/Models
const GALAXY_A17_MODEL = /(^|\s)SM-[AS]176/;
const IPHONE_17_PRO_ID = 'iPhone18,1';

function phoneModelOf(modelId: string): PhoneModel {
  if (modelId === IPHONE_17_PRO_ID) return 'iphone17Pro';
  return GALAXY_A17_MODEL.test(modelId) ? 'galaxyA17' : 'generic';
}

// iOS names the model asynchronously through the capture module, so the generic drawing shows until
// it answers, and stays if it cannot.
export function usePhoneBackLayout(): PhoneBackLayout {
  const [model, setModel] = useState<PhoneModel>(() =>
    Platform.OS === 'android' ? phoneModelOf(Platform.constants.Model) : 'generic',
  );
  useEffect(() => {
    if (Platform.OS !== 'ios' || !LumenCapture) return;
    let current = true;
    LumenCapture.getCapabilities().then(
      ({ modelId }) => current && setModel(phoneModelOf(modelId)),
      (error: unknown) => {
        console.warn(
          `Phone model unknown, showing the generic placement guide: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
    return () => {
      current = false;
    };
  }, []);
  return LAYOUTS[model];
}

export function placementCopy(t: TFunction, model: PhoneModel): { instruction: string; figureLabel: string } {
  switch (model) {
    case 'iphone17Pro':
      return { instruction: t('placement.instructionIos'), figureLabel: t('placement.figureLabelIos') };
    case 'galaxyA17':
      return {
        instruction: t('placement.instructionAndroid'),
        figureLabel: t('placement.figureLabelAndroid'),
      };
    case 'generic':
      return {
        instruction: t('placement.instructionGeneric'),
        figureLabel: t('placement.figureLabelGeneric'),
      };
  }
}
