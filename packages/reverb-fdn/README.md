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

**Mutates `data` in place** and returns it. Fresh line state is allocated per call — no state carries across calls, reprocess the whole buffer each time. Measured T60 (Schroeder backward-integrated energy decay curve) lands within ~30% of the configured value — see the family test suite.

**Use when:** a colorless, uniform-decay tail is the goal — algorithmic reverb without per-mode coloration.<br>
**Not for:** plate/spring character (use `dattorro`/`spring`) or the cheapest possible CPU budget (use `schroeder`).

---

Part of the [@audio/reverb](https://github.com/audiojs/reverb) family.

MIT © [audiojs](https://github.com/audiojs)
