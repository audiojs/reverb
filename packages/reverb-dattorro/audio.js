// atom manifest — Dattorro plate reverb (JAES 45(9), 1997). The kernel builds its
// diffusion/tank state inside each call, so per-block hosting would reset the tank
// every block — declared streaming: false: the host materializes the whole timeline
// (plus the declared tail of silence, so the plate rings out) and calls process once.
// The tank is inherently stereo (cross-coupled figure-eight); mono input is handled
// by the kernel directly, extra channels pass the first pair's field.

import dattorroFn from './dattorro.js'

export const plate = (ctx) => {
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
		if (out.length >= 2) dattorroFn([out[0], out[1]], opts)
		else dattorroFn(out[0], opts)
		for (let c = 2; c < out.length; c++) out[c].set(out[c & 1])
	}
}
plate.channels = 'any'
plate.streaming = false
plate.tail = (ctx) => 1 + 7 * ctx.params.decay[0]
plate.params = {
	decay:   { type: 'number', min: 0, max: 1, default: 0.5 },
	damping: { type: 'number', min: 0, max: 1, default: 0.3 },
	mix:     { type: 'number', min: 0, max: 1, default: 0.3 },
}
