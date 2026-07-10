// atom manifest — spring reverb (dispersive allpass-chain loop, Parker & Välimäki
// class "boing"). The kernel builds its loop state inside each call — declared
// streaming: false: the host materializes the whole timeline (plus the declared
// tail from the actual decay setting) and calls process once, per channel.

import springFn from './spring.js'

export const spring = (ctx) => {
	return (inputs, outputs, params) => {
		const inp = inputs[0], out = outputs[0]
		if (!inp || !inp.length) return
		const opts = {
			decay: params.decay[0],
			tension: params.tension[0],
			damping: params.damping[0],
			mix: params.mix[0],
			fs: ctx.sampleRate,
		}
		for (let c = 0; c < inp.length; c++) {
			out[c].set(inp[c])
			springFn(out[c], opts)
		}
	}
}
spring.channels = 'any'
spring.streaming = false
// loop fb = 0.55 + 0.42·decay over a 1801-sample loop → RT60 = 3·(1801/fs)/−log10(fb)
spring.tail = (ctx) => 3 * (1801 / ctx.sampleRate) / -Math.log10(0.55 + 0.42 * ctx.params.decay[0])
spring.params = {
	decay:   { type: 'number', min: 0, max: 1, default: 0.6 },
	tension: { type: 'number', min: 0, max: 1, default: 0.5 },
	damping: { type: 'number', min: 0, max: 1, default: 0.4 },
	mix:     { type: 'number', min: 0, max: 1, default: 0.35 },
}
