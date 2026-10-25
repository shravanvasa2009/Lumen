import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card } from '@/ui/components/Card';
import { ListRow } from '@/ui/components/ListRow';
import { AppText } from '@/ui/components/AppText';
import { RouteShell } from '@/ui/components/RouteShell';
import { HomePreview } from '@/features/settings/HomePreview';
import { IconTile } from '@/features/settings/IconTile';
import { Segmented } from '@/features/settings/Segmented';
import { useTheme } from '@/ui/theme';
import { setPreference, usePreferences } from '@/ui/theme/preferences';

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { appearance } = usePreferences();
  const previews = [
    { scheme: 'light', caption: t('appearance.light') },
    { scheme: 'dark', caption: t('appearance.dark') },
  ] as const;
  return (
    <RouteShell title={t('appearance.title')}>
      <Segmented
        label={t('appearance.title')}
        selected={appearance}
        onSelect={(choice) => setPreference('appearance', choice)}
        options={[
          { value: 'system', label: t('appearance.segmentSystem'), hint: t('appearance.system') },
          { value: 'light', label: t('appearance.light') },
          { value: 'dark', label: t('appearance.dark') },
        ]}
      />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xxxl - 4 }}>
          {previews
            .filter(({ scheme }) => appearance === 'system' || appearance === scheme)
            .map(({ scheme, caption }) => (
              <HomePreview key={scheme} scheme={scheme} measureLabel={t('home.measure')} caption={caption} />
            ))}
        </View>
      </Card>
      <Card flush>
        {appearance === 'system' ? (
          <ListRow
            title={t('appearance.following')}
            subtitle={t('appearance.followingBody')}
            leading={<IconTile name="settings" />}
          />
        ) : null}
        <ListRow
          title={t('appearance.pdf')}
          leading={<IconTile name="share" />}
          trailing={<AppText tone="textDim">{t('appearance.pdfValue')}</AppText>}
        />
        <ListRow
          title={t('appearance.emergency')}
          subtitle={t('appearance.emergencyBody')}
          leading={<IconTile name="warning" neutral />}
          last
        />
      </Card>
    </RouteShell>
  );
}
