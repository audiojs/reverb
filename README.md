# @audio/reverb

> Reverberation algorithms — one atom per kind.

| Package | Status | What |
|---|---|---|
| `@audio/reverb-schroeder` | ✔ | 4 combs + 2 allpass (extracted from audio-effect) |
| `@audio/reverb-freeverb` | ✔ | Schroeder-Moorer 8+4 stereo |
| `@audio/reverb-dattorro` | ✔ | plate — figure-eight tank (JAES 1997) |
| `@audio/reverb-convolution` | ✔ | IR convolution, no latency, streaming (`convolver`); cabinet sims share the engine — see @audio/amp |
| `@audio/reverb-fdn` | ✔ | feedback delay network |
| `@audio/reverb-spring` | ✔ | spring model |
| `@audio/reverb-shimmer` | ✔ | pitch-shifted feedback — self-contained 2-head varispeed ring buffer, no dependency |
