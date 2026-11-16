import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, serif } from '../theme';
import type { Todo } from '../types';
import { pad } from '../utils/date';
import { useNow } from '../utils/useNow';

/**
 * Jam 12 jam dengan dua cincin:
 *  - cincin dalam  = AM (00:00–12:00)
 *  - cincin luar   = PM (12:00–24:00)
 * Jadwal digambar sebagai busur di cincin yang sesuai.
 */

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};

const arcPath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
  const end = Math.min(endDeg, startDeg + 359.9);
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, end);
  const large = end - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
};

interface Segment {
  ring: 0 | 1;
  a: number; // menit dalam setengah hari
  b: number;
}

/** Pecah rentang menit-sehari menjadi segmen AM/PM. */
const toSegments = (start: number, end: number): Segment[] => {
  const segs: Segment[] = [];
  const e = Math.min(end, 1440);
  if (start < 720) segs.push({ ring: 0, a: start, b: Math.min(e, 720) });
  if (e > 720) segs.push({ ring: 1, a: Math.max(start, 720) - 720, b: e - 720 });
  return segs;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface HandProps {
  rot: SharedValue<number>;
  c: number;
  faceR: number;
  len: number;
  tail: number;
  thickness: number;
  color: string;
}

function Hand({ rot, c, faceR, len, tail, thickness, color }: HandProps) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: c - faceR,
          top: c - faceR,
          width: faceR * 2,
          height: faceR * 2,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          marginTop: faceR - len,
          width: thickness,
          height: len + tail,
          borderRadius: thickness / 2,
          backgroundColor: color,
        }}
      />
    </Animated.View>
  );
}

interface Props {
  /** Jadwal (kind === 'schedule') pada tanggal yang dipilih. */
  items: Todo[];
  highContrast: boolean;
}

export const ClockFace = memo(function ClockFace({ items, highContrast }: Props) {
  const { width } = useWindowDimensions();
  const now = useNow(15000);

  const faceR = Math.min(width * 0.3, 124);
  const ring0 = faceR + 20;
  const ring1 = faceR + 46;
  const S = (ring1 + 16) * 2;
  const c = S / 2;

  // Gerakan jarum dihitung di UI thread dari Date.now() — tidak membebani JS thread.
  const offsetMs = useMemo(() => -new Date().getTimezoneOffset() * 60000, []);
  const hourDeg = useSharedValue(0);
  const minDeg = useSharedValue(0);
  const secDeg = useSharedValue(0);

  useFrameCallback(() => {
    'worklet';
    const ms = (Date.now() + offsetMs) % 86400000;
    secDeg.value = ((ms % 60000) / 60000) * 360;
    minDeg.value = ((ms % 3600000) / 3600000) * 360;
    hourDeg.value = ((ms % 43200000) / 43200000) * 360;
  });

  // Bagian statis (muka jam + cincin titik) hanya dihitung ulang saat ukuran berubah.
  const face = useMemo(() => {
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const major = i % 5 === 0;
      const p1 = polar(c, c, faceR - 5, i * 6);
      const p2 = polar(c, c, faceR - (major ? 14 : 9), i * 6);
      return (
        <Line
          key={`t${i}`}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke={major ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.28)'}
          strokeWidth={major ? 1.6 : 1}
          strokeLinecap="round"
        />
      );
    });

    const numbers = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      const p = polar(c, c, faceR * 0.76, n * 30);
      return (
        <SvgText
          key={`n${n}`}
          x={p.x}
          y={p.y + faceR * 0.05}
          fill={colors.text}
          fontSize={faceR * 0.13}
          fontWeight="500"
          textAnchor="middle"
        >
          {n}
        </SvgText>
      );
    });

    const dots = [ring0, ring1].flatMap((r, ri) =>
      Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        const p = polar(c, c, r, i * 6);
        return (
          <Circle
            key={`d${ri}-${i}`}
            cx={p.x}
            cy={p.y}
            r={major ? 1.9 : 1}
            fill={major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)'}
          />
        );
      }),
    );

    return (
      <G>
        {dots}
        <Circle cx={c} cy={c} r={faceR} fill="#141415" stroke="rgba(255,255,255,0.14)" strokeWidth={2} />
        {ticks}
        {numbers}
      </G>
    );
  }, [c, faceR, ring0, ring1]);

  const arcs = useMemo(
    () =>
      items.flatMap((item) => {
        if (item.startMin == null || item.endMin == null) return [];
        const dur = item.endMin - item.startMin;
        const w = highContrast ? clamp(6 + (dur / 90) * 9, 6, 17) : 8;
        return toSegments(item.startMin, item.endMin).map((seg, i) => (
          <Path
            key={`${item.id}-${i}`}
            d={arcPath(c, c, seg.ring === 0 ? ring0 : ring1, seg.a * 0.5, seg.b * 0.5)}
            stroke={item.color}
            strokeWidth={w}
            strokeLinecap="round"
            fill="none"
            opacity={item.done ? 0.3 : 1}
          />
        ));
      }),
    [items, highContrast, c, ring0, ring1],
  );

  const h24 = now.getHours();
  const h12 = h24 % 12 || 12;

  return (
    <View style={{ width: S, height: S, alignSelf: 'center' }}>
      <Svg width={S} height={S}>
        {face}
        {arcs}
      </Svg>

      <View
        pointerEvents="none"
        style={[styles.digital, { left: c - 50, top: c + faceR * 0.2 }]}
      >
        <Text style={styles.time}>
          {pad(h12)}:{pad(now.getMinutes())}
        </Text>
        <Text style={styles.ampm}>{h24 < 12 ? 'AM' : 'PM'}</Text>
      </View>
      <View
        pointerEvents="none"
        style={[styles.brand, { left: c - 40, top: c - faceR * 0.42 }]}
      >
        <Text style={styles.brandText}>Tempo</Text>
      </View>

      <Hand rot={hourDeg} c={c} faceR={faceR} len={faceR * 0.5} tail={10} thickness={6} color="#F5F5F7" />
      <Hand rot={minDeg} c={c} faceR={faceR} len={faceR * 0.78} tail={10} thickness={4.5} color="#F5F5F7" />
      <Hand rot={secDeg} c={c} faceR={faceR} len={faceR * 0.86} tail={22} thickness={1.5} color={colors.accent} />
      <View
        pointerEvents="none"
        style={[styles.pivot, { left: c - 6, top: c - 6 }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  digital: { position: 'absolute', width: 100, alignItems: 'center' },
  time: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  ampm: { color: colors.textDim, fontSize: 11, fontWeight: '500', marginTop: 1 },
  brand: { position: 'absolute', width: 80, alignItems: 'center' },
  brandText: { color: colors.textFaint, fontSize: 12, fontFamily: serif, letterSpacing: 1 },
  pivot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
});
