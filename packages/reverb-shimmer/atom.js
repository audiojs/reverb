// atom manifest — shimmer reverb (octave-up varispeed shifter in the comb feedback
// path; Valhalla/Eno-Lanois class). The kernel builds its combs and shifter ring
// inside each call — declared streaming: false: the host materializes the whole
// timeline (plus the declared tail from the actual decay setting) and calls process
// once, per channel.

import shimmerFn from './shimmer.js'

export const shimmer = (ctx) => {
	return (inputs, outputs, params) => {
		const inp = inputs[0], out = outputs[0]
		if (!inp || !inp.length) return
		const opts = {
			decay: params.decay[0],
			shimmer: params.shimmer[0],
			damping: params.damping[0],
			mix: params.mix[0],
			fs: ctx.sampleRate,
		}
		for (let c = 0; c < inp.length; c++) {
			out[c].set(inp[c])
			shimmerFn(out[c], opts)
		}
	}
}
shimmer.channels = 'any'
shimmer.streaming = false
// comb fb = 0.5 + 0.45·decay over a ~1557-sample comb → RT60 = 3·(1557/fs)/−log10(fb)
shimmer.tail = (ctx) => 3 * (1557 / ctx.sampleRate) / -Math.log10(0.5 + 0.45 * ctx.params.decay[0])
shimmer.params = {
	decay:   { type: 'number', min: 0, max: 1, default: 0.7 },
	shimmer: { type: 'number', min: 0, max: 1, default: 0.5 },
	damping: { type: 'number', min: 0, max: 1, default: 0.3 },
	mix:     { type: 'number', min: 0, max: 1, default: 0.4 },
}
