# @audio/reverb-spring [![npm](https://img.shields.io/npm/v/@audio/reverb-spring)](https://www.npmjs.com/package/@audio/reverb-spring) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Spring reverb — dispersive allpass-chain loop (Parker-Välimäki class simplified model)

```
npm install @audio/reverb-spring
```

```js
import spring from '@audio/reverb-spring'
```

A feedback loop of 24 cascaded first-order dispersive allpass filters plus a short pre-delay: the cascade makes group delay frequency-dependent, producing the characteristic spring "boing"/chirp on transients. A simplified digital spring after Parker & Välimäki, "Spring reverberation: a physical perspective" (DAFx-10). Mono only.

```js
spring(data, { decay: 0.6, tension: 0.5, damping: 0.4, mix: 0.35, fs: 44100 })
spring(data, { tension: 0.9 })  // tighter spring, more pronounced dispersion chirp
```

| Param | Default | |
|---|---|---|
| `decay` | `0.6` | 0..1 — loop feedback (tail length) |
| `tension` | `0.5` | 0..1 — allpass dispersion coefficient (spring "tightness") |
| `damping` | `0.4` | 0..1 — high-frequency loss in the loop |
| `mix` | `0.35` | 0..1 — wet/dry blend |
| `fs` | `44100` | sample rate; delay lengths scale to it |

**Mutates `data` in place** and returns it. Fresh loop/allpass state is allocated per call, so each call starts from silence. To run a signal in pieces, carry one state from piece to piece:

```js
import { state, stream, tail } from '@audio/reverb-spring'
let s = state(48000), p = { decay: [0.6], tension: [0.5], damping: [0.4], mix: [0.35] }
stream(data, p, s)   // each piece in turn, in place
tail({ decay: 0.6, tension: 0.5, damping: 0.4, fs: 48000 })   // seconds the output takes to fall 60 dB under the input once it stops
```

`state(fs)` makes the loop, the chain and the pre-delay once. `stream(data, p, s, n)` runs `n` frames (all of `data` by default), and the pieces together are the samples one whole call gives, bit for bit. `p` holds the values as a host gives them, each a one-element array, read at each call. `stream(data, p, s, n, lanes, M)` takes `decay` and `mix` for each frame instead, from 0 and from `M` of `lanes`. `tail` is τ·log10(1000·G) / −log10(fb) (Schroeder 1962, from G times the input to 60 dB under it), fb = `0.55 + 0.42·decay`, τ the loop's longest delay at any frequency (the loop line, the chain at its group delay's peak, the damping one-pole at DC) and G = 0.6/(1 − fb) the loop's gain at DC, which a held input builds the ring up to; plus the pre-delay. It is `Infinity` at `damping` 1, where the one-pole holds its value.

The `/audio` processor runs the streaming form: one state per channel, made with the instance; every value read at each call and smoothed over 20 ms by the host. `decay` and `mix` scale the signal, so they move sample by sample along the host's ramp, 32 frames behind it: the output is the same however the host cuts its calls, and a held value is the value itself. `tension` and `damping` retune the chain and the one-pole at each call (both feed the output directly, so a jump in either would step it; the host's ramp moves them a call at a time). No latency; its tail is `tail()` at the values in force.

**Use when:** guitar-amp/vintage spring-tank character, transient "boing".<br>
**Not for:** smooth room/plate tails (the dispersion coloration is the point — use `freeverb`/`dattorro` for smooth) or stereo width (mono only).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
