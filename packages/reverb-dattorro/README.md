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

**Mutates `data` in place** and returns it. Fresh tank state is allocated per call — no state carries across calls, reprocess the whole buffer each time.

**Use when:** plate/studio-reverb character, long shimmering tails.<br>
**Not for:** short room ambience (use `freeverb`/`schroeder`) or a physically-modeled spring "boing" (use `spring`).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
