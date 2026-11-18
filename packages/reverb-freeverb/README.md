# @audio/reverb-freeverb [![npm](https://img.shields.io/npm/v/@audio/reverb-freeverb)](https://www.npmjs.com/package/@audio/reverb-freeverb) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Freeverb — Schroeder-Moorer 8-comb + 4-allpass reverb, Jezar public-domain tuning, stereo spread

```
npm install @audio/reverb-freeverb
```

```js
import freeverb from '@audio/reverb-freeverb'
```

8 parallel LP-damped feedback combs into 4 series allpass diffusers per channel, Jezar's public-domain tuning (44.1 kHz delay constants, scaled to `fs`). Stereo input runs the right channel through `spread`-offset (23-sample) delay lines for width — pass `[left, right]` and the two channels decorrelate on their own; mono input runs a single channel. Strictly stereo, not N-channel: only `data[0]`/`data[1]` are read and written — a third channel in the array is silently left untouched.

```js
freeverb(data, { room: 0.7, damp: 0.4, mix: 0.5, fs: 44100 })
freeverb([left, right], { room: 0.9, mix: 0.4 })  // stereo — decorrelated spread
```

| Param | Default | |
|---|---|---|
| `room` | `0.5` | 0..1 — feedback amount (tail length) |
| `damp` | `0.5` | 0..1 — high-frequency loss in the comb feedback path |
| `mix` | `0.33` | 0..1 — wet/dry blend |
| `fs` | `44100` | sample rate; delay lengths scale to it |

**Mutates `data` in place** and returns it — the return value is the same array/pair you passed in, not a copy. `mix: 0` is an exact passthrough (`room`/`damp` never run when nothing is mixed in). A fresh call allocates fresh comb/allpass state, so each call starts from silence. To run a signal in pieces, keep a `channelState(fs, offset)` per channel (`offset` 0 for the left, 23 for the right) and pass each piece to `stream(data, p, st, n)`, where `p` holds `room`, `damp` and `mix` as a host gives them, each a one-element array, read at each call; `stream(data, p, st, n, lanes, M)` takes `room` and `mix` for each sample instead, from 0 and from `M` of `lanes`. `tail({ room, damp, fs })` is the seconds a stereo pair's output takes to fall 60 dB under the input once it stops: the longest comb's decay, τ·log10(1000·G) / −log10(fb) (Schroeder 1962, from G times the input to 60 dB under it), fb = `room·0.28 + 0.7`, G = 8·0.015/(1 − fb)·(5/3)⁴ a bound on the network's gain, which a held input builds the ring up to (Freeverb's allpasses are not true allpasses: each passes up to 5/3); one more pass of it, then the allpasses' ring.

The `/audio` factory keeps per-channel state between blocks; channel c runs combs 23·c samples longer, so past the first two each channel rings a little longer than `tail()` says (1.11 times at the tenth). `room`, `damp` and `mix` are smoothed over 20 ms by the host; `room` and `mix` scale the signal, so they move sample by sample along the host's ramp, 32 frames behind it (the output is the same however the host cuts its calls, and a held value is the value itself), and `damp` retunes the one-poles at each call. Its `tail(ctx)` returns zero for a known dry `mix: 0`, otherwise `tail()` at the `room` and `damp` in force, including an unknown/automated mix. A host planning a whole edit must not infer permanent bypass from an automation curve's initial zero.

**Use when:** general-purpose room/hall reverb, the "default" choice among this family.<br>
**Not for:** metallic plate character (use `dattorro`) or a colorless, uniform-T60 tail (use `fdn`).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
