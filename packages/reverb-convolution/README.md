# @audio/reverb-convolution [![npm](https://img.shields.io/npm/v/@audio/reverb-convolution)](https://www.npmjs.com/package/@audio/reverb-convolution) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Convolution reverb — impulse-response convolution (rooms, plates, cabinets…)

```
npm install @audio/reverb-convolution
```

```js
import convolve from '@audio/reverb-convolution'
```

Convolves the input against an impulse response with no latency: the IR's head (its first 128 samples) direct-form, the rest by FFT overlap-save with a frequency-domain delay line in partitions growing with the offset — 128, 1024, 8192 (Gardner 1995, *Efficient convolution without input-output delay*). Differentially tested against the direct form to 1e-6 of the peak, IRs about each partition's edge, chunks of any length. The wet tail is truncated at the input length (no automatic tail extension — pad `data` yourself if you need the reverb tail past the input's own end). Mono only. Speaker-cabinet simulation (`@audio/amp-cabinet`) shares this engine.

```js
convolve(data, { ir: roomImpulseResponse })
convolve(data, { ir, normalize: true })

// streaming: chunks of any length, each back at once (wet only)
import { convolver } from '@audio/reverb-convolution'
let room = convolver(ir)
for (let chunk of input) play(room.write(chunk))
```

| Param | Default | |
|---|---|---|
| `ir` | *(required)* | `Float32Array` impulse response — throws `RangeError` if missing/empty |
| `mix` | `1` | 0..1 — wet/dry blend |
| `normalize` | `false` | scale the IR to unit energy first, so output level ≈ input level regardless of the IR's own loudness |
| `method` | `'auto'` | `'auto'` or `'fft'`: the partitioned engine; `'direct'`: the plain direct form, its reference |

**Mutates `data` in place** and returns it. A delta IR (`[1, 0, 0, …]`) is an exact identity; a delayed delta shifts the signal by that many samples — useful sanity checks when building your own IRs.

`room.write(chunk, out, length)` takes the first `length` frames of `chunk` and writes as many to `out`, so arrays sized once for the longest block serve every block with no view made per call.

The `/audio` processor takes the IR as its buffer `ir`, of one channel or two. A mono IR serves every channel; a stereo IR gives channel c its channel c % 2 (left to channels 0, 2, …, right to 1, 3, …). It builds one convolver per channel with the instance, none while it runs. `predelay` (0 to 0.5 s) delays what enters the convolvers; `mix` (default 0.3) blends `x·(1 − mix) + wet·mix`, as the family's other reverbs do, and moves sample by sample along the host's 20 ms ramp, 32 frames behind it, so the output is the same however the host cuts its calls. No latency: an impulse comes back as the IR from its first frame. Its `tail(ctx)` is the IR's length plus the predelay in force. Without an IR the input passes through unchanged, a NaN included; with one, a NaN or an Infinity in is taken as 0.

**Use when:** the most accurate reverb character available — real captured spaces, plates, or cabinets, at the cost of needing an IR file.<br>
**Not for:** parametric control over decay/damping (use any of the algorithmic reverbs) or extending the tail beyond the input length automatically.

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
