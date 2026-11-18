// atom manifest — Dattorro plate reverb (JAES 45(9), 1997). One plate per instance, made
// with it (dattorro.js state) and carried from call to call by the streaming form; decay,
// damping and mix are read at each call. The tank is inherently stereo (cross-coupled
// figure-eight); mono input is handled by the kernel directly, extra channels pass the
// first pair's field. decay scales the tank and mix scales the output, so each is glided
// sample by sample (glide, below): a host's ramp of it is one line, however the host cut
// its calls. damping retunes the one-poles each call. While nothing moves the kernel runs
// on the call's values, as it ran.

import { state, stream, tail } from './dattorro.js'

export const plate = (ctx) => {
	const s = state(ctx.sampleRate), M = ctx.maxBlockSize
	const g = new Float64Array(2 * GLIDE).fill(NaN), lanes = new Float64Array(2 * M)
	return (inputs, outputs, params) => {
		const inp = inputs[0], out = outputs[0]
		if (!inp || !inp.length) return
		const n = inp[0].length
		const moving = glide(g, 0, params.decay, lanes, 0, n, 0) | glide(g, 1, params.mix, lanes, M, n, 0)
		for (let c = 0; c < out.length; c++) out[c].set(inp[c % inp.length])
		stream(out[0], out.length >= 2 ? out[1] : null, params, s, n, moving ? lanes : undefined, M)
		for (let c = 2; c < out.length; c++) out[c].set(out[c & 1])
	}
}
plate.channels = 'any'
// the tank's slowest mode at the values in force (dattorro.js tail); Infinity at decay 1, and at damping 1 with a decay above 0
plate.tail = ({ sampleRate, params }) => tail({ decay: params.decay[0], damping: params.damping[0], fs: sampleRate })
plate.params = {
	decay:   { type: 'number', min: 0, max: 1, default: 0.5, smoothing: 0.02 },
	damping: { type: 'number', min: 0, max: 1, default: 0.3, smoothing: 0.02 },
	mix:     { type: 'number', min: 0, max: 1, default: 0.3, smoothing: 0.02 },
}

// A value that scales the signal, glided sample by sample so that a host's steps of it join into one line (the
// dynamics family's glide, its text; each reverb package ships its own copy, as each is published alone). A host hands
// each call the value at its first frame and, while a value moves (a `smoothing` ramp), calls with 32 frames at most
// (contract 1.0: Parameters, Time; What a host owes, 3). So the line through the values the calls bring, each at its
// call's first frame, is known 32 frames behind any call's first frame, however the host cut the calls; the glide plays
// it 32 frames late. Straight from the value of one call to the next's, it is the host's ramp itself, the same whether
// the host calls with 1, 32 or a mix of frames; drawn between each call's end and the next (a glide across each call),
// a ramp cut 32, 4, 32 would put 32 frames of it into 4. A value that follows a call of more than 32 frames came with
// no ramp: it is reached in a straight line over 32 frames. The first call of an instance starts on its value, and a
// value held 32 frames is the value itself, so a value that does not move is bit for bit what it was before the glide
// existed. `g`: the memory, GLIDE slots a value from j·GLIDE (made NaN): the value the last call brought, where in the
// ring its first frame is, its frames, the frames the line had been at that value before it (64 once held and the ring
// all of it; counted to 63 at most, so that a long call after a move cannot reach 64 before the ring is made all of
// it), how many of `row`'s hold it, then the line, a frame a slot, in a ring of 64. `src`: the param's array. The
// line's values for this call's `n` frames go to `row` from `at` (with `lin` 1 as the gain e^(v·ln10/20) of a value in
// dB; no reverb value is in dB, so every call here passes 0). Returns 1 while they move, 0 when every one is the value
// (then `row` holds it, filled once, and the kernel runs on the values alone). Only arrays and whole numbers cross the
// call.
const GLIDE = 69
function glide (g, j, src, row, at, n, lin) {
	let o = j * GLIDE, r = o + 5, v = src[0], was = g[o]
	if (!(was === was)) { g[o] = v; g[o + 1] = 0; g[o + 2] = n; g[o + 3] = 0; g[o + 4] = 0 }
	else if (v !== was || g[o + 3] < 64) {
		let len = g[o + 2], L = len < 32 ? len : 32, w = (g[o + 1] + len) & 63, d = v - was, held = v === was ? Math.min(g[o + 3] + len, 63) : 0
		for (let q = 0; q < L; q++) g[r + ((w - L + q) & 63)] = was + d * q / L
		g[r + w] = v
		g[o] = v; g[o + 1] = w; g[o + 2] = n; g[o + 3] = held; g[o + 4] = 0
		if (held < 32) {
			for (let i = 0; i < n; i++) {
				let u = i < 32 ? g[r + ((w + i - 32) & 63)] : v
				row[at + i] = lin ? Math.exp(u * (Math.LN10 / 20)) : u
			}
			return 1
		}
	} else { g[o + 1] = (g[o + 1] + g[o + 2]) & 63; g[o + 2] = n }
	// held 32 frames: the ring made all of the value once (a move from it reads the line from there), the row filled
	// with it as far as no call since it was held has filled it; from then on a call only moves the ring's position
	if (g[o + 3] < 64) { for (let q = 0; q < 64; q++) g[r + q] = v; g[o + 3] = 64 }
	if (g[o + 4] < n) {
		let u = lin ? Math.exp(v * (Math.LN10 / 20)) : v
		for (let i = 0; i < n; i++) row[at + i] = u
		g[o + 4] = n
	}
	return 0
}
