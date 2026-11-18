// atom manifest: convolution reverb, the input through the impulse response given as the buffer `ir`.
// One streaming convolver per channel (convolution.js: no latency, blocks of any length), built with the
// instance: a mono IR serves every channel, a stereo one gives channel c its channel c % 2. Without an IR
// the input passes through. predelay delays what enters the convolvers, so a tail already ringing keeps its
// time when it moves; mix blends x·(1 − mix) + wet·mix, as the family's other reverbs do.

import { convolver } from './convolution.js'

// a NaN or an Infinity in is taken as 0: in a convolver's memory it would ring through the whole IR
const finite = s => s - s === 0 ? s : 0

export const convolution = (ctx) => {
	const ir = ctx.buffers?.ir   // a host older than contract 1.0 gives no ctx.buffers
	if (!ir) return (inputs, outputs) => {
		const inp = inputs[0], out = outputs[0]
		for (let c = 0; c < inp.length; c++) out[c].set(inp[c])
	}
	const sr = ctx.sampleRate, eng = [], line = []
	// the predelay line: the longest predelay behind the sample just written
	const P = Math.round(convolution.params.predelay.max * sr) + 1
	for (let c = 0; c < ctx.maxChannels; c++) {
		eng.push(convolver(ir[c % ir.length]))
		line.push(new Float32Array(P))
	}
	const del = new Float32Array(ctx.maxBlockSize), wet = new Float32Array(ctx.maxBlockSize)
	// mix scales the output, so it is glided sample by sample (glide, below): a host's ramp of it is one line, however
	// the host cut its calls; while it is held each sample takes the call's value, as before
	const g = new Float64Array(GLIDE).fill(NaN), row = new Float64Array(ctx.maxBlockSize)
	let w = 0
	return (inputs, outputs, params) => {
		const inp = inputs[0], out = outputs[0], n = inp[0].length
		const d = Math.round(params.predelay[0] * sr), mix = params.mix[0], moving = glide(g, 0, params.mix, row, 0, n, 0)
		for (let c = 0; c < inp.length; c++) {
			const x = inp[c], y = out[c], r = line[c]
			for (let i = 0, j = w; i < n; i++, j = j + 1 < P ? j + 1 : 0) {
				r[j] = finite(x[i])
				del[i] = r[j < d ? j - d + P : j - d]
			}
			eng[c].write(del, wet, n)
			for (let i = 0; i < n; i++) { const k = moving ? row[i] : mix; y[i] = finite(x[i]) * (1 - k) + wet[i] * k }
		}
		w = (w + n) % P
	}
}
convolution.channels = 'any'
convolution.buffers = { ir: { channels: [1, 2] } }
// the longest IR channel past the predelay in force; none without an IR
convolution.tail = ({ sampleRate, params, buffers }) => buffers?.ir ? Math.max(...buffers.ir.map(h => h.length)) / sampleRate + params.predelay[0] : 0
convolution.params = {
	predelay: { type: 'number', min: 0, max: 0.5, default: 0, unit: 's' },
	mix:      { type: 'number', min: 0, max: 1, default: 0.3, smoothing: 0.02 },
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
