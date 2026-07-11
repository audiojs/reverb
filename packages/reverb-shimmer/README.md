# @audio/reverb-shimmer [![npm](https://img.shields.io/npm/v/@audio/reverb-shimmer)](https://www.npmjs.com/package/@audio/reverb-shimmer) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Shimmer reverb — octave-up pitch-shifted feedback tail (Valhalla/Eno-Lanois class)

```
npm install @audio/reverb-shimmer
```

```js
import shimmer from '@audio/reverb-shimmer'
```

A 4-comb reverb core whose feedback path is pitch-shifted up an octave before re-injection, so the tail climbs into sparkling upper octaves the longer it rings (Valhalla Shimmer / Eno-Lanois class). The in-loop shifter is a self-contained 2-head varispeed ring buffer (write head advances ×1, two read heads advance ×2 with a triangular crossfade) — no dependency on `@audio/shift-*`; those packages are for offline high-quality shifting, this one is built to run inside a feedback loop. Mono only.

```js
shimmer(data, { decay: 0.7, shimmer: 0.5, damping: 0.3, mix: 0.4, fs: 44100 })
shimmer(data, { shimmer: 0.9 })  // heavier octave-up content in the tail
```

| Param | Default | |
|---|---|---|
| `decay` | `0.7` | 0..1 — comb feedback (tail length) |
| `shimmer` | `0.5` | 0..1 — amount of octave-up signal re-injected into the feedback path |
| `damping` | `0.3` | 0..1 — high-frequency loss in the comb feedback path |
| `mix` | `0.4` | 0..1 — wet/dry blend |
| `fs` | `44100` | sample rate; delay/ring-buffer lengths scale to it |

**Mutates `data` in place** and returns it. Fresh comb and ring-buffer state is allocated per call — no state carries across calls, reprocess the whole buffer each time.

**Use when:** ambient pads, ethereal tails that climb in pitch as they decay.<br>
**Not for:** natural room/plate character (the octave-up feedback is the deliberate coloration) or stereo width (mono only — run twice with decorrelated seeds for pseudo-stereo).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
