// atom manifest — FDN reverb (8 mutually-prime delays, Householder feedback, Jot
// per-line decay gains → uniform colorless T60). The kernel builds its delay network
// inside each call — declared streaming: false: the host materializes the whole
// timeline (plus the declared tail, which IS the T60 the kernel targets) and calls
// process once. Stereo taps are native ± patterns; mono handled by the kernel.

import fdnFn from './fdn.js'

export const fdn = (ctx) => {
	return (inputs, outputs, params) => {
		const inp = inputs[0], out = outputs[0]
		if (!inp || !inp.length) return
		const opts = {
			decay: params.decay[0],
			damping: params.damping[0],
			mix: params.mix[0],
			fs: ctx.sampleRate,
		}
		for (let c = 0; c < out.length; c++) out[c].set(inp[c % inp.length])
		if (out.length >= 2) fdnFn([out[0], out[1]], opts)
		else fdnFn(out[0], opts)
		for (let c = 2; c < out.length; c++) out[c].set(out[c & 1])
	}
}
fdn.channels = 'any'
fdn.streaming = false
fdn.tail = (ctx) => 0.3 + 5 * ctx.params.decay[0] ** 2  // the kernel's own T60 mapping
fdn.params = {
	decay:   { type: 'number', min: 0, max: 1, default: 0.6 },
	damping: { type: 'number', min: 0, max: 1, default: 0.3 },
	mix:     { type: 'number', min: 0, max: 1, default: 0.3 },
}
