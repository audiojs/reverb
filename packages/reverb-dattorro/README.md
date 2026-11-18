# @audio/reverb-dattorro [![npm](https://img.shields.io/npm/v/@audio/reverb-dattorro)](https://www.npmjs.com/package/@audio/reverb-dattorro) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Dattorro plate reverb — input diffusers + figure-eight tank (JAES 1997 topology and taps)

```
npm install @audio/reverb-dattorro
```

```js
import dattorro from '@audio/reverb-dattorro'
```

Input diffusion (4 series allpasses) feeding a figure-eight tank of two cross-coupled branches (allpass → delay → one-pole damping → decay → allpass → delay), each branch's output re-entering the other. Structure, delay lengths, and output taps are Dattorro's Table 1/2 ("Effect Design Part 1: Reverberator and Other Filters", JAES 45(9), 1997), reference rate 29761 Hz, scaled to `fs`. Modulation (chorus on the tank delays) is omitted — a static tank. Mono input sums to a single feed and both output taps blend into one channel; stereo input feeds the tank from `(L+R)/2` and reads the two taps independently for width. Strictly stereo, not N-channel: only `data[0]`/`data[1]` are read and written.

```js
dattorro(data, { decay: 0.6, damping: 0.3, mix: 0.3, fs: 44100 })
dattorro([left, right], { decay: 0.85, mix: 0.4 })  // stereo, longer tail
```

| Param | Default | |
|---|---|---|
| `decay` | `0.5` | 0..1 — tank feedback (tail length) |
| `damping` | `0.3` | 0..1 — one-pole high-frequency loss in each tank branch |
| `bandwidth` | `0.9995` | input low-pass coefficient (pre-tank high-cut) |
| `mix` | `0.3` | 0..1 — wet/dry blend |
| `fs` | `44100` | sample rate; delay lengths scale to it |

**Mutates `data` in place** and returns it. Fresh tank state is allocated per call, so each call starts from a silent tank. To run a signal in pieces, carry one tank from piece to piece:

```js
import { state, stream, tail } from '@audio/reverb-dattorro'
let s = state(48000), p = { decay: [0.6], damping: [0.3], mix: [0.3] }
stream(left, right, p, s)   // each piece in turn, in place; right is null for mono
tail({ decay: 0.6, damping: 0.3, fs: 48000 })   // seconds the output takes to fall 60 dB under the input once it stops
```

`state(fs)` makes the tank once. `stream(left, right, p, s, n)` runs `n` frames (all of `left` by default), and the pieces together are the samples one whole call gives, bit for bit. `p` holds the values as a host gives them, each a one-element array, read at each call, so they may change between pieces. `stream(left, right, p, s, n, lanes, M)` takes `decay` and `mix` for each frame instead, from 0 and from `M` of `lanes`. `tail` is the tank's slowest mode at those values: τ·log10(1000·G) / −log10(`decay`⁴) (Schroeder 1962, from G times the input to 60 dB under it), τ the loop's longest delay at any frequency and G = 0.6·(3 + 6·`decay`)/(1 − `decay`²) a bound on the tank's peak gain, which a held input builds the ring up to at most; after the input diffusers ring out. It is `Infinity` at `decay` 1, and at `damping` 1 with a `decay` above 0, where the damping one-pole holds its value.

The `/audio` processor runs the streaming form: one tank per instance, made with it; `decay`, `damping` and `mix` read at each call and smoothed over 20 ms by the host. `decay` and `mix` scale the signal, so they move sample by sample along the host's ramp, 32 frames behind it: the output is the same however the host cuts its calls, and a held value is the value itself. `damping` retunes the one-poles at each call. No latency; its tail is `tail()` at the values in force.

**Use when:** plate/studio-reverb character, long shimmering tails.<br>
**Not for:** short room ambience (use `freeverb`/`schroeder`) or a physically-modeled spring "boing" (use `spring`).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
