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
| `shimmer` | `0.5` | 0..1 — share of the feedback that returns an octave up; the loop gain stays below 1, so the tail always decays |
| `damping` | `0.3` | 0..1 — high-frequency loss in the comb feedback path |
| `mix` | `0.4` | 0..1 — wet/dry blend |
| `fs` | `44100` | sample rate; delay/ring-buffer lengths scale to it |

**Mutates `data` in place** and returns it. Fresh comb and ring-buffer state is allocated per call, so each call starts from silence. To run a signal in pieces, carry one state from piece to piece:

```js
import { state, stream, tail } from '@audio/reverb-shimmer'
let s = state(48000), p = { decay: [0.7], shimmer: [0.5], damping: [0.3], mix: [0.4] }
stream(data, p, s)   // each piece in turn, in place
tail({ decay: 0.7, shimmer: 0.5, damping: 0.3, fs: 48000 })   // seconds the output takes to fall 60 dB under the input once it stops
```

`state(fs)` makes the combs and the ring once. `stream(data, p, s, n)` runs `n` frames (all of `data` by default), and the pieces together are the samples one whole call gives, bit for bit. `p` holds the values as a host gives them, each a one-element array, read at each call. `stream(data, p, s, n, lanes, S)` takes `decay`, `shimmer` and `mix` for each frame instead, from 0, `S` and 2·`S` of `lanes`. The shifter's taps read 0 to 2048 samples (at 44.1 kHz) behind what was just written, never ahead, so there is no latency. `tail` is τ·log10(1000·G) / −log10(fb) (Schroeder 1962, from G times the input to 60 dB under it), fb = `0.5 + 0.45·decay`, over the longest pass τ: the longest comb, plus the damping one-pole's delay at DC for the share that returns as it was, or the shifter's window for the share that returns an octave up. G = 0.7/(1 − fb) bounds how far a held input builds the ring up, and what the longest comb holds plays out once before it falls. It is `Infinity` at `damping` 1 while a share returns through the one-pole, which then holds its value.

The `/audio` processor runs the streaming form: one state per channel, made with the instance; every value read at each call and smoothed over 20 ms by the host. `decay`, `shimmer` and `mix` scale the signal, so they move sample by sample along the host's ramp, 32 frames behind it: the output is the same however the host cuts its calls, and a held value is the value itself. `damping` retunes the one-poles at each call. No latency; its tail is `tail()` at the values in force.

**Use when:** ambient pads, ethereal tails that climb in pitch as they decay.<br>
**Not for:** natural room/plate character (the octave-up feedback is the deliberate coloration) or stereo width (mono only — run twice with decorrelated seeds for pseudo-stereo).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
