// atom manifest — Schroeder reverb (4 parallel damped combs + 2 series allpasses).
// The kernel keeps its comb/allpass state on the params object — the manifest owns one
// persistent params object per channel, so tails ring across blocks. decay/damping/mix
// are live (read per call). Tail declared from the actual decay setting: RT60 of the
// longest comb loop, 3·(1523/fs)/−log10(decay) — not the worst-case slider.

import schroederFn from './schroeder.js'

export const schroeder = (ctx) => {
	const chP = []
	for (let c = 0, N = ctx.maxChannels ?? 8; c < N; c++) chP.push({ fs: ctx.sampleRate })
	return (inputs, outputs, params) => {
		const inp = inputs[0], out = outputs[0]
		if (!inp || !inp.length) return
		for (let c = 0; c < inp.length; c++) {
			const p = chP[c]
			p.decay = params.decay[0]
			p.damping = params.damping[0]
			p.mix = params.mix[0]
			out[c].set(inp[c])
			schroederFn(out[c], p)
		}
	}
}
schroeder.channels = 'any'
schroeder.tail = (ctx) => 3 * (1523 / ctx.sampleRate) / -Math.log10(Math.min(ctx.params.decay[0], 0.98) || 1e-6)
schroeder.params = {
	decay:   { type: 'number', min: 0, max: 0.98, default: 0.84 },
	damping: { type: 'number', min: 0, max: 1, default: 0.5 },
	mix:     { type: 'number', min: 0, max: 1, default: 0.3, smoothing: 0.02 },
}
