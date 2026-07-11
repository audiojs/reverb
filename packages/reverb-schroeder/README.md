# @audio/reverb-schroeder [![npm](https://img.shields.io/npm/v/@audio/reverb-schroeder)](https://www.npmjs.com/package/@audio/reverb-schroeder) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Schroeder reverb — 4 parallel feedback combs with LP damping + 2 series allpass diffusers

```
npm install @audio/reverb-schroeder
```

```js
import schroeder from '@audio/reverb-schroeder'
```

The classical Schroeder topology: 4 parallel feedback comb filters (prime delay lengths, ~29–35 ms at 44.1 kHz) each with one-pole LP damping on the feedback path, summed and run through 2 series allpass diffusers (`g = 0.5`, ~6–8 ms delays). Mono only — for stereo, call it once per channel with separate options objects (see below).

```js
schroeder(data, { decay: 0.84, damping: 0.5, mix: 0.3, fs: 44100 })
```

| Param | Default | |
|---|---|---|
| `decay` | `0.84` | 0..1 — comb feedback (reverb time) |
| `damping` | `0.5` | 0..1 — high-frequency loss in the comb feedback path |
| `mix` | `0.3` | 0..1 — wet/dry blend |
| `fs` | `44100` | sample rate; delay lengths scale to it |

**Requires an options object — `schroeder(data)` throws.** Unlike every other reverb in this family, `schroeder` has no default `= {}` on its second parameter, so a call with only `data` throws reading `params.decay` off `undefined` rather than falling back to defaults. Always pass at least `{}`.

**Mutates `data` in place** and returns it. **Caches comb/allpass state on the options object itself** (`params._c`/`params._a`) rather than allocating fresh state per call — this is the family's one stateful exception. Passing a fresh options object each call gives independent, freshly-seeded reverb (the common case); passing the *same* options object across successive calls continues the same comb/allpass state, which is how you'd stream chunks through one continuous tail. Don't reuse an options object across unrelated buffers unless you want that continuity — reuse it per logical stream instead.

**Use when:** the cheapest CPU budget in the family, or reproducing the specific Schroeder/Moorer-predecessor sound.<br>
**Not for:** stereo width (use `freeverb`/`dattorro`/`fdn`) or streaming without manual state-object management.

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
