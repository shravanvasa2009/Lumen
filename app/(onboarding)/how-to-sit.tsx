import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card } from '@/ui/components/Card';
import { Icon } from '@/ui/components/Icon';
import { ListRow } from '@/ui/components/ListRow';
import { NavButton } from '@/ui/components/NavButton';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { SeatedIllustration } from '@/features/onboarding/SeatedIllustration';
import { useTheme } from '@/ui/theme';

export default function HowToSitScreen() {
  const { t } = useTranslation();
  const { colors, control } = useTheme();
  const checklist = [t('howToSit.elbows'), t('howToSit.height'), t('howToSit.hand'), t('howToSit.warm')];
  return (
    <OnboardingFrame
      step={4}
      title={t('howToSit.title')}
      subtitle={t('howToSit.subtitle')}
      footer={<NavButton label={t('common.continue')} href="/rating" />}
    >
      <Card>
        <SeatedIllustration phoneLabel={t('howToSit.labelPhone')} elbowLabel={t('howToSit.labelElbow')} />
      </Card>
      <Card flush>
        {checklist.map((item, index) => (
          <ListRow
            key={item}
            title={item}
            last={index === checklist.length - 1}
            leading={
              <View style={{ width: control.chevronSize }}>
                <Icon name="check" size={control.chevronSize} color={colors.accent} />
              </View>
            }
          />
        ))}
      </Card>
    </OnboardingFrame>
  );
}
