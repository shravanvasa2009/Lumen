// Decimal mark follows the app language (es writes 0,7). Hermes ships Intl:
// https://hermesengine.dev/docs/intl/. Stored values and the CSV export stay unformatted.
export function formatNumber(
  value: number,
  language: string,
  maximumFractionDigits = 1,
  minimumFractionDigits = 0,
  { useGrouping = true }: { useGrouping?: boolean } = {},
): string {
  return new Intl.NumberFormat(language, {
    maximumFractionDigits,
    minimumFractionDigits,
    useGrouping,
  }).format(value);
}
