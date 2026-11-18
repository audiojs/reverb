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

The same without an options object: `state(fs)` makes the combs and allpasses once, and `stream(data, p, s, n)` runs `n` samples in place, where `p` holds `decay`, `damping` and `mix` as a host gives them, each a one-element array, read at each call; `stream(data, p, s, n, lanes, M)` takes `decay` and `mix` for each sample instead, from 0 and from `M` of `lanes`. `tail({ decay, damping, fs })` is the seconds the output takes to fall 60 dB under the input once it stops: the longest comb's decay, τ·log10(1000·G) / −log10(`decay`) (Schroeder 1962, from G times the input to 60 dB under it), G = 1.5²/(1 − `decay`) the network's gain at DC, which a held input builds the ring up to (the two diffusers are not true allpasses: each passes DC 1.5 times); one more pass of it, then the allpasses' ring. It is `Infinity` at `damping` 1 with a `decay` above 0, where the damping one-pole holds its value.

The `/audio` processor keeps one state per channel, made with the instance; every value is read at each call and smoothed over 20 ms by the host. `decay` and `mix` scale the signal, so they move sample by sample along the host's ramp, 32 frames behind it: the output is the same however the host cuts its calls, and a held value is the value itself. `damping` retunes the one-poles at each call. No latency; its tail is `tail()` at the values in force.

**Use when:** the cheapest CPU budget in the family, or reproducing the specific Schroeder/Moorer-predecessor sound.<br>
**Not for:** stereo width (use `freeverb`/`dattorro`/`fdn`) or streaming without manual state-object management.

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
