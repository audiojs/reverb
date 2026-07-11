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

**Mutates `data` in place** and returns it. Fresh loop/allpass state is allocated per call — no state carries across calls, reprocess the whole buffer each time.

**Use when:** guitar-amp/vintage spring-tank character, transient "boing".<br>
**Not for:** smooth room/plate tails (the dispersion coloration is the point — use `freeverb`/`dattorro` for smooth) or stereo width (mono only).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
