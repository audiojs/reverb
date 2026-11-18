# @audio/reverb-fdn [![npm](https://img.shields.io/npm/v/@audio/reverb-fdn)](https://www.npmjs.com/package/@audio/reverb-fdn) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

FDN reverb — 8 mutually-prime delays, O(N) Householder feedback, per-line damping (Jot topology)

```
npm install @audio/reverb-fdn
```

```js
import fdn from '@audio/reverb-fdn'
```

Feedback delay network: 8 mutually-prime delay lines coupled through a Householder feedback matrix (`I − 2/N·11ᵀ`, applied in O(N) rather than a full N×N multiply), one-pole damping per line, and Jot's per-line decay gains `g_k = 10^(−3·len_k / (T60·fs))` so every line decays at the same rate — a uniform, colorless T60 regardless of which delay you're listening to (Jot & Chaigne, 1991). Output taps use orthogonal `±1` sign patterns per channel for stereo decorrelation from a mono or stereo input. Strictly stereo, not N-channel: only `data[0]`/`data[1]` are read and written.

```js
fdn(data, { t60: 1.5, damping: 0.3, mix: 0.3, fs: 44100 })
fdn([left, right], { decay: 0.9, mix: 0.4 })  // stereo, decay-derived T60
```

| Param | Default | |
|---|---|---|
| `t60` | derived from `decay` | seconds — decay time to −60 dB; overrides `decay` when set |
| `decay` | `0.6` | 0..1 convenience knob → `t60 = 0.3 + 5·decay²` (ignored if `t60` is set) |
| `damping` | `0.3` | 0..1 — one-pole high-frequency loss per delay line |
| `mix` | `0.3` | 0..1 — wet/dry blend |
| `fs` | `44100` | sample rate; delay lengths scale to it |

**Mutates `data` in place** and returns it. Fresh line state is allocated per call, so each call starts from silent lines. To run a signal in pieces, carry one network from piece to piece:

```js
import { state, stream, tail } from '@audio/reverb-fdn'
let s = state(48000), p = { decay: [0.6], damping: [0.3], mix: [0.3] }   // or t60: [1.5]
stream(left, right, p, s)   // each piece in turn, in place; right is null for mono
tail({ decay: 0.6, damping: 0.3, fs: 48000 })   // seconds the output takes to fall 60 dB under the input once it stops
```

`state(fs)` makes the lines once. `stream(left, right, p, s, n)` runs `n` frames (all of `left` by default), and the pieces together are the samples one whole call gives, bit for bit. `p` holds the values as a host gives them, each a one-element array, read at each call; the decay gains are made anew when the T60 differs from the last call's. `stream(left, right, p, s, n, lanes, M)` takes `decay` and `mix` for each frame instead, from 0 and from `M` of `lanes`. `tail` is the T60, lengthened by the damping one-pole's delay at DC (`damping/(1 − damping)` samples a pass, most for the shortest line) and by G = √8/(1 − the largest line gain), a bound on the network's peak gain: a held input builds the ring up to at most G times itself, so the tail counts 60 dB under the input from there, (1 + log10 G / 3) times the T60. Plus the longest line played out once. It is `Infinity` at `damping` 1, where the one-pole holds its value.

The `/audio` processor runs the streaming form: one network per instance, made with it; `decay`, `damping` and `mix` read at each call and smoothed over 20 ms by the host. `decay` and `mix` scale the signal, so they move sample by sample along the host's ramp, 32 frames behind it: the output is the same however the host cuts its calls, and a held value is the value itself. `damping` retunes the one-poles at each call. No latency; its tail is `tail()` at the values in force.

Measured T60 (Schroeder backward-integrated energy decay curve) lands within ~30% of the configured value — see the family test suite.

**Use when:** a colorless, uniform-decay tail is the goal — algorithmic reverb without per-mode coloration.<br>
**Not for:** plate/spring character (use `dattorro`/`spring`) or the cheapest possible CPU budget (use `schroeder`).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
