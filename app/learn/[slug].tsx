import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { RouteShell } from '@/ui/components/RouteShell';
import { Screen } from '@/ui/components/Screen';
import { chapterViews } from '@/features/learn/chapterViews';
import { type Lesson, lessons } from '@/features/learn/lessons';
import { useReportReading } from '@/features/learn/useReportReading';
import { useTheme } from '@/ui/theme';

export default function LessonScreen() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const lesson = lessons.find((candidate) => candidate.slug === slug);
  const ChapterView = lesson ? chapterViews[lesson.slug] : undefined;
  if (!lesson || !ChapterView) return <RouteShell title={t('learn.notFound')} />;
  return <Chapter lesson={lesson} ChapterView={ChapterView} />;
}

// Guide name in the bar, chapter name as the heading.
function Chapter({ lesson, ChapterView }: { lesson: Lesson; ChapterView: (typeof chapterViews)[string] }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const reading = useReportReading(lesson.slug);
  return (
    <Screen>
      <Stack.Screen options={{ title: t('learn.guideTitle') }} />
      <ScrollView {...reading} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <ChapterView lesson={lesson} />
      </ScrollView>
    </Screen>
  );
}
