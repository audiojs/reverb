// audio-module manifest — Freeverb with persistent per-channel comb/allpass state;
// room/damp/mix are live (Freeverb reads them per sample anyway).

import { channelState, processChannel } from './freeverb.js'

export const freeverb = (ctx) => {
	const sts = []
	for (let c = 0, N = ctx.maxChannels ?? 8; c < N; c++) sts.push(channelState(ctx.sampleRate, c * 23))
	return (inputs, outputs, params) => {
		const inp = inputs[0], out = outputs[0]
		if (!inp || !inp.length) return
		const fb = params.room[0] * 0.28 + 0.7
		const dm = params.damp[0] * 0.4
		const mix = params.mix[0]
		for (let c = 0; c < inp.length; c++) {
			out[c].set(inp[c])
			processChannel(out[c], sts[c], fb, dm, mix)
		}
	}
}
freeverb.channels = 'any'
freeverb.tail = 6
freeverb.params = {
	room: { type: 'number', min: 0, max: 1, default: 0.5 },
	damp: { type: 'number', min: 0, max: 1, default: 0.5 },
	mix:  { type: 'number', min: 0, max: 1, default: 0.33, smoothing: 0.02 },
}
