import type { ColorValue } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { paper } from './paper';
import { stripHeight, stripInset, stripPoints, stripWidth } from './stripGeometry';

// Beat intervals on the Show me why chart's scale. Not a raw pulse waveform, which the app does not keep.
export function IntervalStrip({
  intervalsMs,
  color,
  label,
}: {
  intervalsMs: readonly number[];
  color: ColorValue;
  label: string;
}) {
  const dots = stripPoints(intervalsMs);
  const points = dots.map(({ x, y }) => `${x},${y}`).join(' ');
  return (
    <Svg
      viewBox={`0 0 ${stripWidth} ${stripHeight}`}
      width="100%"
      style={{ aspectRatio: stripWidth / stripHeight }}
      accessibilityLabel={label}
    >
      <Line
        x1={stripInset}
        x2={stripWidth - stripInset}
        y1={stripHeight / 2}
        y2={stripHeight / 2}
        stroke={paper.line}
        strokeWidth={1}
      />
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" />
      {dots.map(({ x, y }, index) => (
        <Circle key={index} cx={x} cy={y} r={1.75} fill={color} />
      ))}
    </Svg>
  );
}
