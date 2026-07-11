# @audio/reverb-convolution [![npm](https://img.shields.io/npm/v/@audio/reverb-convolution)](https://www.npmjs.com/package/@audio/reverb-convolution) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Convolution reverb — impulse-response convolution (rooms, plates, cabinets…)

```
npm install @audio/reverb-convolution
```

```js
import convolve from '@audio/reverb-convolution'
```

Convolves the input against an impulse response. Short IRs (≤1024 samples) run direct-form convolution; longer IRs run uniform-partitioned FFT overlap-add with a frequency-domain delay line (Wefers/Gardner class) — both paths are differentially tested against each other to agree within 1e-6. The wet tail is truncated at the input length (no automatic tail extension — pad `data` yourself if you need the reverb tail past the input's own end). Mono only. Speaker-cabinet simulation (`@audio/amp-cabinet`) shares this engine.

```js
convolve(data, { ir: roomImpulseResponse })
convolve(data, { ir, normalize: true, method: 'fft' })  // force the FFT path
```

| Param | Default | |
|---|---|---|
| `ir` | *(required)* | `Float32Array` impulse response — throws `RangeError` if missing/empty |
| `mix` | `1` | 0..1 — wet/dry blend |
| `normalize` | `false` | scale the IR to unit energy first, so output level ≈ input level regardless of the IR's own loudness |
| `method` | `'auto'` | `'auto'` (FFT above 1024-sample IRs, direct-form below), `'direct'`, or `'fft'` |

**Mutates `data` in place** and returns it. A delta IR (`[1, 0, 0, …]`) is an exact identity; a delayed delta shifts the signal by that many samples — useful sanity checks when building your own IRs.

**Use when:** the most accurate reverb character available — real captured spaces, plates, or cabinets, at the cost of needing an IR file.<br>
**Not for:** parametric control over decay/damping (use any of the algorithmic reverbs) or extending the tail beyond the input length automatically.

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
