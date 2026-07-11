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

**Mutates `data` in place** and returns it — the return value is the same array/pair you passed in, not a copy. `mix: 0` is an exact passthrough (`room`/`damp` never run when nothing is mixed in). A fresh call allocates fresh comb/allpass state, so there's no state to carry across calls — reprocess the whole buffer each time.

**Use when:** general-purpose room/hall reverb, the "default" choice among this family.<br>
**Not for:** metallic plate character (use `dattorro`) or a colorless, uniform-T60 tail (use `fdn`).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
