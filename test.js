import test from 'node:test'
import { strict as assert } from 'node:assert'

import { schroeder } from './index.js'
import { freeverb as freeverbFactory } from './packages/reverb-freeverb/audio.js'
import { tail as freeverbTail } from './packages/reverb-freeverb/freeverb.js'
const fx = { reverb: schroeder }

test('freeverb factory — only known dry settings remove the tail', () => {
	for (const sampleRate of [16000, 48000, 96000]) {
		for (const mix of [0, -1, 0.33, 1, NaN]) {
			const tail = freeverbFactory.tail({ sampleRate, params: { mix: Float32Array.of(mix) } })
			// only mix is given here, so the wet tail is the kernel's at its own room and damp (0.5 each); a host gives
			// every value (the tail tests below)
			assert.equal(tail, mix <= 0 ? 0 : freeverbTail({ fs: sampleRate }))
		}
	}
})

let { ok, equal: is } = assert

function almost (a, b, eps = 1e-6) { ok(Math.abs(a - b) < eps, `${a} ≈ ${b} (±${eps})`) }

function impulse (n = 64) { let d = new Float64Array(n); d[0] = 1; return d }
function dc (n = 64, val = 1) { let d = new Float64Array(n); d.fill(val); return d }
function sine (f, n, fs = 44100) {
	let d = new Float64Array(n)
	for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * f * i / fs)
	return d
}

// ═══════════════════════════════════════════════════════════════════════════
// Modulation
// ═══════════════════════════════════════════════════════════════════════════

test('reverb — produces wet signal without NaN', () => {
	let data = impulse(44100)
	fx.reverb(data, { decay: 0.84, damping: 0.5, mix: 0.5, fs: 44100 })
	ok(data.some(x => Math.abs(x) > 0.001), 'reverb has output')
	ok(data.every(isFinite), 'no NaN/Inf')
})

test('reverb — mix=0 is passthrough', () => {
	let data = impulse(256)
	let orig = Float64Array.from(data)
	fx.reverb(data, { mix: 0, fs: 44100 })
	let maxErr = 0
	for (let i = 0; i < data.length; i++) { let e = Math.abs(data[i] - orig[i]); if (e > maxErr) maxErr = e }
	ok(maxErr < 1e-10, `reverb mix=0 passthrough: err=${maxErr}`)
})

test('reverb — decays over time', () => {
	let N = 44100
	let data = impulse(N)
	fx.reverb(data, { decay: 0.84, mix: 1, fs: 44100 })
	// First reflections arrive after ~1300 samples (shortest comb delay)
	let early = 0, late = 0
	for (let i = 2000; i < 6000; i++) early = Math.max(early, Math.abs(data[i]))
	for (let i = 30000; i < 44100; i++) late = Math.max(late, Math.abs(data[i]))
	ok(early > late, `reverb decays: early=${early.toFixed(4)}, late=${late.toFixed(6)}`)
})

// ═══════════════════════════════════════════════════════════════════════════
// Distortion
// ═══════════════════════════════════════════════════════════════════════════


import { freeverb, dattorro, convolve, fdn, spring, shimmer } from './index.js'

function tailEnergy (d, fromSec, fs = 44100) {
	let s = 0
	for (let i = Math.round(fromSec * fs); i < d.length; i++) s += d[i] * d[i]
	return s
}

test('freeverb — impulse produces a decaying tail, no NaN', () => {
	let d = impulse(44100)
	freeverb(d, { room: 0.7, damp: 0.4, mix: 0.5, fs: 44100 })
	assert.ok(d.every(isFinite), 'finite')
	assert.ok(tailEnergy(d, 0.1) > 0, 'tail beyond 100 ms')
	assert.ok(tailEnergy(d, 0.1) > tailEnergy(d, 0.6), 'decaying')
})

test('freeverb — mix=0 is passthrough; larger room → longer tail', () => {
	let d = impulse(8192)
	let ref = Float64Array.from(d)
	freeverb(d, { mix: 0, fs: 44100 })
	assert.deepEqual(Array.from(d.slice(0, 64)), Array.from(ref.slice(0, 64)))
	let small = impulse(44100), large = impulse(44100)
	freeverb(small, { room: 0.2, mix: 1, fs: 44100 })
	freeverb(large, { room: 0.95, mix: 1, fs: 44100 })
	assert.ok(tailEnergy(large, 0.5) > tailEnergy(small, 0.5), 'room extends decay')
})

test('freeverb — stereo channels decorrelate', () => {
	let L = impulse(44100), R = impulse(44100)
	freeverb([L, R], { mix: 1, fs: 44100 })
	let diff = 0
	for (let i = 0; i < L.length; i++) diff = Math.max(diff, Math.abs(L[i] - R[i]))
	assert.ok(diff > 1e-4, 'L differs from R')
})

test('dattorro — impulse produces a long decaying stereo tail, no NaN', () => {
	let L = impulse(88200), R = impulse(88200)
	dattorro([L, R], { decay: 0.6, mix: 1, fs: 44100 })
	assert.ok(L.every(isFinite) && R.every(isFinite), 'finite')
	assert.ok(tailEnergy(L, 0.25) > 0, 'tail beyond 250 ms')
	let diff = 0
	for (let i = 0; i < L.length; i++) diff = Math.max(diff, Math.abs(L[i] - R[i]))
	assert.ok(diff > 1e-4, 'stereo decorrelated')
})

test('dattorro — decay parameter extends the tail; mono works', () => {
	let a = impulse(88200), b = impulse(88200)
	dattorro(a, { decay: 0.25, mix: 1, fs: 44100 })
	dattorro(b, { decay: 0.85, mix: 1, fs: 44100 })
	assert.ok(a.every(isFinite) && b.every(isFinite), 'finite')
	assert.ok(tailEnergy(b, 1.0) > tailEnergy(a, 1.0) * 10, 'decay=0.85 ≫ decay=0.25 late energy')
})

test('convolve — delta IR is identity, delayed delta shifts, mix blends', () => {
	let d = sine(440, 4096)
	let ref = Float64Array.from(d)
	let delta = new Float32Array(64); delta[0] = 1
	convolve(d, { ir: delta })
	for (let i = 0; i < d.length; i++) assert.ok(Math.abs(d[i] - ref[i]) < 1e-6)
	let e = sine(440, 4096)
	let late = new Float32Array(101); late[100] = 1
	convolve(e, { ir: late })
	for (let i = 200; i < 4000; i += 37) assert.ok(Math.abs(e[i] - ref[i - 100]) < 1e-6, 'shifted by 100')
})

function goertzel (d, freq, sr = 44100, from = 0, to = d.length) {
	let w = 2 * Math.PI * freq / sr, cw = Math.cos(w)
	let s1 = 0, s2 = 0
	for (let i = from; i < to; i++) { let s0 = d[i] + 2 * cw * s1 - s2; s2 = s1; s1 = s0 }
	return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - 2 * cw * s1 * s2)) / (to - from)
}

test('fdn — measured T60 (Schroeder EDC) matches configured within 30%', () => {
	let fs2 = 44100
	for (let T60 of [0.5, 1.5]) {
		let d = impulse(Math.round(fs2 * (T60 + 1)))
		fdn(d, { t60: T60, damping: 0, mix: 1, fs: fs2 })
		assert.ok(d.every(isFinite))
		// Schroeder backward-integrated energy decay curve
		let edc = new Float64Array(d.length)
		let acc = 0
		for (let i = d.length - 1; i >= 0; i--) { acc += d[i] * d[i]; edc[i] = acc }
		let dbAt = tSec => 10 * Math.log10(edc[Math.round(tSec * fs2)] / edc[0])
		let t0 = 0.1 * T60, t1 = 0.6 * T60
		let slope = (dbAt(t1) - dbAt(t0)) / (t1 - t0) // dB per second
		let measured = -60 / slope
		assert.ok(Math.abs(measured - T60) / T60 < 0.3, 'T60 ' + T60 + 's measured ' + measured.toFixed(2) + 's')
	}
})

test('fdn — stereo decorrelation, decay control, finite', () => {
	let L = impulse(44100), R = impulse(44100)
	fdn([L, R], { mix: 1 })
	assert.ok(L.every(isFinite) && R.every(isFinite))
	let diff = 0
	for (let i = 0; i < L.length; i++) diff = Math.max(diff, Math.abs(L[i] - R[i]))
	assert.ok(diff > 1e-4, 'L differs from R')
	let a = impulse(88200), b = impulse(88200)
	fdn(a, { decay: 0.2, mix: 1 }); fdn(b, { decay: 0.9, mix: 1 })
	assert.ok(tailEnergy(b, 0.8) > tailEnergy(a, 0.8) * 5, 'decay extends tail')
})

test('spring — tail, decay control, mix=0 passthrough, finite', () => {
	let d = impulse(44100)
	let ref = Float64Array.from(d)
	spring(d, { mix: 0 })
	assert.deepEqual(Array.from(d.slice(0, 64)), Array.from(ref.slice(0, 64)))
	let a = impulse(88200), b = impulse(88200)
	spring(a, { decay: 0.2, mix: 1 }); spring(b, { decay: 0.9, mix: 1 })
	assert.ok(a.every(isFinite) && b.every(isFinite))
	assert.ok(tailEnergy(b, 0.5) > tailEnergy(a, 0.5), 'decay extends tail')
	assert.ok(tailEnergy(b, 0.2) > 0, 'has tail')
})

test('shimmer — octave-up content appears in the tail', () => {
	let n = 88200
	let mk = () => { let d = new Float32Array(n); for (let i = 0; i < 22050; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 44100); return d }
	let dry = mk(), wet = mk()
	shimmer(dry, { shimmer: 0, mix: 1 })
	shimmer(wet, { shimmer: 0.9, mix: 1 })
	assert.ok(wet.every(isFinite))
	// octave band (grain-smeared around 880 Hz) against the source band, in the tail after the source stops
	let band = (d, f0, f1) => { let e = 0; for (let f = f0; f <= f1; f += 2) e += goertzel(d, f, 44100, 22050, 35280) ** 2; return e }
	let lift = d => 10 * Math.log10(band(d, 820, 940) / band(d, 400, 480))
	assert.ok(lift(wet) > lift(dry) + 20, `octave-up energy in shimmer tail: ${lift(wet).toFixed(1)} dB vs ${lift(dry).toFixed(1)} dB without`)
})

test('shimmer — the tail decays at any setting (feedback loop gain < 1)', () => {
	// The octave-up return was added on top of the comb feedback: at the defaults the loop
	// gained ~1.3 and a 2 s burst grew to 1e24 within 11 s
	let seed = 1, rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1
	for (let [decay, amount] of [[0.7, 0.5], [1, 1], [0, 1], [1, 0.3]]) {
		let x = new Float32Array(44100 * 12)
		for (let i = 0; i < 44100 * 2; i++) x[i] = 0.3 * rnd()
		shimmer(x, { decay, shimmer: amount, mix: 1 })
		let peakAt = s => { let m = 0; for (let i = s * 44100; i < (s + 1) * 44100; i++) m = Math.max(m, Math.abs(x[i])); return m }
		assert.ok(peakAt(1) < 4, `decay ${decay} shimmer ${amount}: level while fed ${peakAt(1).toFixed(2)}`)
		assert.ok(peakAt(11) < peakAt(2) * 0.1, `decay ${decay} shimmer ${amount}: tail falls ${peakAt(2).toFixed(3)} → ${peakAt(11).toFixed(4)}`)
	}
})

test('convolution — partitioned FFT path matches direct within 1e-6', () => {
	let n = 44100
	let x = new Float32Array(n)
	for (let i = 0; i < n; i++) x[i] = 0.4 * Math.sin(2 * Math.PI * 440 * i / 44100) + 0.2 * Math.sin(2 * Math.PI * 31 * i / 441)
	let ir = new Float32Array(5000)
	for (let i = 0; i < ir.length; i++) ir[i] = Math.sin(i * 0.7) * Math.exp(-i / 900) * (i % 7 ? 0.3 : 1)
	let a = Float32Array.from(x), b = Float32Array.from(x)
	convolve(a, { ir, method: 'direct' })
	convolve(b, { ir, method: 'fft' })
	let err = 0
	for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(a[i] - b[i]))
	assert.ok(err < 1e-6, 'max diff ' + err.toExponential(1))
})

import { convolver } from '@audio/reverb-convolution'

test('convolver — streams with no latency, in chunks of any length, as the direct form convolves', () => {
	// lengths about each level's edge (the head at 128, partitions of 128, 1024, 8192), chunks of random lengths
	let seed = 1, rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1
	for (let N of [1, 127, 128, 129, 1023, 1024, 1025, 8191, 8192, 8193, 20000]) {
		let h = Float32Array.from({ length: N }, (_, i) => rnd() * Math.exp(-i / (N / 3 + 1)))
		let x = Float32Array.from({ length: 30000 }, rnd)
		let ref = Float32Array.from(x)
		convolve(ref, { ir: h, method: 'direct' })
		let c = convolver(h), y = new Float32Array(x.length)
		for (let o = 0; o < x.length;) { let n = Math.min(x.length - o, 1 + Math.floor((rnd() + 1) * 700)); c.write(x.subarray(o, o + n), y.subarray(o, o + n)); o += n }
		let err = 0, top = 0
		for (let i = 0; i < x.length; i++) { err = Math.max(err, Math.abs(y[i] - ref[i])); top = Math.max(top, Math.abs(ref[i])) }
		assert.ok(err / top < 1e-6, `IR of ${N}: ${(err / top).toExponential(1)} of the peak`)
	}
	// an impulse comes back as the IR itself, from its first sample
	let h = Float32Array.from({ length: 10000 }, (_, i) => Math.sin(i) / (1 + i)), x = new Float32Array(12000); x[0] = 1
	let y = convolver(h).write(x)
	for (let i = 0; i < h.length; i++) assert.ok(Math.abs(y[i] - h[i]) < 1e-7, `sample ${i}`)
})

test('convolver — empty chunks and one sample at a time, as one chunk', () => {
	let h = Float32Array.from({ length: 3000 }, (_, i) => Math.cos(i) / (1 + i)), x = Float32Array.from({ length: 2000 }, (_, i) => Math.sin(i * 0.3))
	let whole = convolver(h).write(x), c = convolver(h), y = new Float32Array(x.length)
	assert.equal(c.write(new Float32Array(0)).length, 0, 'nothing in, nothing out')
	for (let i = 0; i < x.length; i++) { c.write(x.subarray(i, i + 1), y.subarray(i, i + 1)); if (i % 500 === 0) c.write(new Float32Array(0)) }
	for (let i = 0; i < x.length; i++) assert.ok(Math.abs(y[i] - whole[i]) < 1e-6, `sample ${i}`)
	assert.throws(() => convolver(new Float32Array(0)), /impulse response is required/)
})

function noiseOf (n, seed) { let d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1; return d }
function irOf (n, seed) { let h = noiseOf(n, seed); for (let i = 0; i < n; i++) h[i] *= Math.exp(-i / (n / 4)); return h }

test('convolver: write(chunk, out, length) takes the chunk\'s first length frames, as a view of them does', () => {
	// a caller with arrays sized once for its longest block needs no view per call
	let h = irOf(3000, 11), x = noiseOf(20000, 12), seed = 13, rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
	let a = convolver(h), b = convolver(h), ya = new Float32Array(x.length), yb = new Float32Array(x.length)
	let chunk = new Float32Array(1024), out = new Float32Array(1024), differ = 0
	for (let o = 0; o < x.length;) {
		let n = Math.min(x.length - o, 1 + Math.floor(rnd() * 1024))
		a.write(x.subarray(o, o + n), ya.subarray(o, o + n))
		chunk.set(x.subarray(o, o + n)); b.write(chunk, out, n); yb.set(out.subarray(0, n), o)
		o += n
	}
	for (let i = 0; i < x.length; i++) if (ya[i] !== yb[i]) differ++
	assert.equal(differ, 0, 'samples that differ')
})

import { convolution as convolutionAtom } from '@audio/reverb-convolution/audio'

// the manifest as a host runs it: an instance from a stub ctx, the signal in calls of `block` frames
function convolutionRun (x, { ir, predelay = 0, mix = 1, block = x[0].length, sampleRate = 44100 } = {}) {
	let params = { predelay: Float32Array.of(predelay), mix: Float32Array.of(mix) }
	let process = convolutionAtom({ sampleRate, maxBlockSize: block, maxChannels: x.length, params, buffers: { ir } })
	let out = x.map(c => new Float32Array(c.length))
	for (let i = 0; i < x[0].length; i += block) {
		let n = Math.min(block, x[0].length - i)
		process([x.map(c => c.subarray(i, i + n))], [out.map(c => c.subarray(i, i + n))], params)
	}
	return out
}
// the convolution computed directly: y[i] = Σ h[j]·x[i − j]
function directForm (x, h) {
	let y = new Float64Array(x.length)
	for (let i = 0; i < x.length; i++) { let s = 0; for (let j = 0; j < h.length && j <= i; j++) s += h[j] * x[i - j]; y[i] = s }
	return y
}
const differing = (a, b) => { let n = 0; for (let c = 0; c < a.length; c++) for (let i = 0; i < a[c].length; i++) if (a[c][i] !== b[c][i]) n++; return n }

// Tolerance against the direct form, below: 1e-6 of the peak, the bound the convolver's own differential test holds
// (above); the manifest adds two float32 roundings (the wet block, the output), each 2^-24 of the value

test('convolution manifest: a unit-impulse IR passes the input through at mix 1', () => {
	let x = [noiseOf(20000, 1), noiseOf(20000, 2)], delta = new Float32Array(2048); delta[0] = 1
	assert.equal(differing(convolutionRun(x, { ir: [delta], mix: 1, block: 128 }), x), 0, 'samples that differ from the input')
})

test('convolution manifest: a short random IR gives the direct form, dry and wet blended by mix', () => {
	let h = irOf(1500, 3), x = [noiseOf(8000, 4)], ref = directForm(x[0], h)
	for (let mix of [1, 0.3]) {
		let y = convolutionRun(x, { ir: [h], mix, block: 128 }), m = Math.fround(mix), err = 0, top = 0
		for (let i = 0; i < x[0].length; i++) { let e = x[0][i] * (1 - m) + ref[i] * m; err = Math.max(err, Math.abs(y[0][i] - e)); top = Math.max(top, Math.abs(e)) }
		assert.ok(err / top < 1e-6, `mix ${mix}: ${(err / top).toExponential(1)} of the peak`)
	}
})

test('convolution manifest: blocks of 1, 64, 127, 128 and 1024 frames give one whole call\'s samples', () => {
	// 30000 frames: the predelay line (0.5 s and one frame at 44.1 kHz) wraps
	let x = [noiseOf(30000, 5), noiseOf(30000, 6)], ir = [irOf(3000, 7), irOf(3000, 8)]
	let whole = convolutionRun(x, { ir, predelay: 0.0123, mix: 0.3 })
	for (let block of [1, 64, 127, 128, 1024]) assert.equal(differing(convolutionRun(x, { ir, predelay: 0.0123, mix: 0.3, block }), whole), 0, `blocks of ${block}: samples that differ`)
})

test('convolution manifest: predelay moves the wet part by round(predelay · sampleRate) frames', () => {
	// 0.0019 s is 83.79 frames, rounded up, not cut; 0.5 s, the most, is the line's whole length
	let x = [noiseOf(30000, 9)], h = irOf(500, 10), y0 = convolutionRun(x, { ir: [h], mix: 1, block: 128 })
	for (let predelay of [0.001, 0.0019, 0.0123, 0.5]) {
		let D = Math.round(Math.fround(predelay) * 44100), y = convolutionRun(x, { ir: [h], predelay, mix: 1, block: 128 }), err = 0, top = 0
		for (let i = 0; i < x[0].length; i++) { let e = i < D ? 0 : y0[0][i - D]; err = Math.max(err, Math.abs(y[0][i] - e)); top = Math.max(top, Math.abs(e)) }
		assert.ok(err / top < 1e-6, `predelay ${predelay}: ${D} frames, ${(err / top).toExponential(1)} of the peak`)
	}
})

test('convolution manifest: mix 0 is the input', () => {
	let x = [noiseOf(5000, 14), noiseOf(5000, 15)]
	assert.equal(differing(convolutionRun(x, { ir: [irOf(900, 16), irOf(900, 17)], predelay: 0.01, mix: 0, block: 128 }), x), 0, 'samples that differ from the input')
})

test('convolution manifest: tail is the IR\'s length in seconds plus the predelay in force', () => {
	let sampleRate = 48000, tail = (ir, predelay) => convolutionAtom.tail({ sampleRate, params: { predelay: Float32Array.of(predelay), mix: Float32Array.of(0.3) }, buffers: { ir } })
	assert.equal(tail([new Float32Array(48000)], 0), 1)
	assert.equal(tail([new Float32Array(24000)], 0.25), 0.75)
	assert.equal(tail([new Float32Array(1000), new Float32Array(9600)], 0.1), 0.2 + Math.fround(0.1), 'the longer channel')
	assert.equal(tail(undefined, 0.1), 0, 'no IR, no tail')
})

test('convolution manifest: two channels and a stereo IR, each its own; a mono IR serves all; channel c takes c % 2', () => {
	let hs = [irOf(600, 18), irOf(600, 19)], x = [noiseOf(4000, 20), noiseOf(4000, 21), noiseOf(4000, 22)]
	for (let [ir, chs] of [[hs, 2], [hs, 3], [[hs[0]], 2]]) {
		let y = convolutionRun(x.slice(0, chs), { ir, mix: 1, block: 128 })
		for (let c = 0; c < chs; c++) {
			let ref = directForm(x[c], ir[c % ir.length]), err = 0, top = 0
			for (let i = 0; i < ref.length; i++) { err = Math.max(err, Math.abs(y[c][i] - ref[i])); top = Math.max(top, Math.abs(ref[i])) }
			assert.ok(err / top < 1e-6, `${ir.length}-channel IR, channel ${c} of ${chs}: ${(err / top).toExponential(1)} of the peak`)
		}
	}
})

test('convolution manifest: an impulse comes back as the IR from frame 0, so latency is 0, as declared (the default)', () => {
	let h = irOf(10000, 23), x = new Float32Array(12000); x[0] = 1
	let y = convolutionRun([x], { ir: [h], mix: 1, block: 128 })[0], err = 0
	for (let i = 0; i < y.length; i++) err = Math.max(err, Math.abs(y[i] - (i < h.length ? h[i] : 0)))
	assert.ok(err < 1e-6, `deviation from the IR ${err.toExponential(1)}`)
	assert.equal(convolutionAtom.latency ?? 0, 0)
})

test('convolution manifest: no IR, the input passes through unchanged', () => {
	let x = [noiseOf(3000, 24), noiseOf(3000, 25)]
	assert.equal(differing(convolutionRun(x, { mix: 0.7, predelay: 0.2, block: 64 }), x), 0, 'samples that differ from the input')
	// a host older than contract 1.0 gives no ctx.buffers
	let params = { predelay: Float32Array.of(0), mix: Float32Array.of(1) }, out = x.map(c => new Float32Array(c.length))
	convolutionAtom({ sampleRate: 44100, maxBlockSize: 3000, maxChannels: 2, params })([x], [out], params)
	assert.equal(differing(out, x), 0, 'without ctx.buffers')
	assert.equal(convolutionAtom.tail({ sampleRate: 44100, params }), 0)
})

test('convolution manifest: a NaN or an Infinity in is taken as 0, the output stays finite', () => {
	let x = [noiseOf(6000, 26)], clean = [x[0].slice()], ir = [irOf(2000, 27)]
	x[0][1000] = NaN; x[0][3000] = Infinity; x[0][3001] = -Infinity
	clean[0][1000] = clean[0][3000] = clean[0][3001] = 0
	let y = convolutionRun(x, { ir, mix: 0.3, block: 128 })
	assert.ok(y[0].every(Number.isFinite), 'finite')
	assert.equal(differing(y, convolutionRun(clean, { ir, mix: 0.3, block: 128 })), 0, 'samples that differ from the input with zeros there')
})

// ═══════════════════════════════════════════════════════════════════════════
// The six network reverbs as processors: streaming, live values, tails
// ═══════════════════════════════════════════════════════════════════════════

import * as dattorroK from '@audio/reverb-dattorro'
import * as fdnK from '@audio/reverb-fdn'
import * as shimmerK from '@audio/reverb-shimmer'
import * as springK from '@audio/reverb-spring'
import * as freeverbK from '@audio/reverb-freeverb'
import * as schroederK from '@audio/reverb-schroeder'
import { plate as plateAtom } from '@audio/reverb-dattorro/audio'
import { fdn as fdnAtom } from '@audio/reverb-fdn/audio'
import { shimmer as shimmerAtom } from '@audio/reverb-shimmer/audio'
import { spring as springAtom } from '@audio/reverb-spring/audio'
import { schroeder as schroederAtom } from '@audio/reverb-schroeder/audio'

const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647
// noise for the first half, silence after, so a tail rings in every render
function burst (n, seed) { let d = noiseOf(n, seed); for (let i = 0; i < n; i++) d[i] = i < n >> 1 ? 0.5 * d[i] : 0; return d }
const rmsOf = (d, a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / (b - a)) }

// the values of a setting as a host gives them: each number a 1-length Float32Array, the defaults where unset
const paramsOf = (atom, set) => Object.fromEntries(Object.entries(atom.params).map(([k, s]) => [k, Float32Array.of(k in set ? set[k] : s.default)]))
// a processor as a host runs it: an instance from a stub ctx, the signal in calls of `block` frames; `at(i, params)`
// sets values before the call at frame i
function atomRun (atom, x, set = {}, { block = x[0].length, sampleRate = 44100, at } = {}) {
	let params = paramsOf(atom, set)
	let process = atom({ sampleRate, maxBlockSize: block, maxChannels: x.length, params: paramsOf(atom, set), buffers: {} })
	let out = x.map(c => new Float32Array(c.length))
	for (let i = 0; i < x[0].length; i += block) {
		let n = Math.min(block, x[0].length - i)
		at?.(i, params)
		process([x.map(c => c.subarray(i, i + n))], [out.map(c => c.subarray(i, i + n))], params)
	}
	return out
}

// Each processor as it ran when it took the whole signal in one call (plate, fdn, shimmer, spring), or as its kernel's
// whole-buffer call runs it (freeverb, schroeder): on copies of the input, with the values as a host gives them
const pairOf = fn => (x, o) => {
	let y = x.map(c => c.slice())
	if (y.length >= 2) fn([y[0], y[1]], o); else fn(y[0], o)
	for (let c = 2; c < y.length; c++) y[c].set(y[c & 1])
	return y
}
const REVERBS = {
	plate: { atom: plateAtom, kernel: dattorroK, whole: pairOf(dattorro), stereo: true, decay: 'decay', damping: 'damping' },
	fdn: { atom: fdnAtom, kernel: fdnK, whole: pairOf(fdn), stereo: true, decay: 'decay', damping: 'damping' },
	shimmer: { atom: shimmerAtom, kernel: shimmerK, whole: (x, o) => x.map(c => shimmer(c.slice(), o)), decay: 'decay', damping: 'damping' },
	spring: { atom: springAtom, kernel: springK, whole: (x, o) => x.map(c => spring(c.slice(), o)), decay: 'decay', damping: 'damping' },
	// as its manifest called it: channel c offset by 23 samples a channel, feedback room·0.28 + 0.7, damping damp·0.4
	freeverb: {
		atom: freeverbFactory, kernel: freeverbK, decay: 'room', damping: 'damp',
		whole: (x, o) => x.map((c, i) => {
			let y = c.slice()
			freeverbK.processChannel(y, freeverbK.channelState(o.fs, i * 23), o.room * 0.28 + 0.7, o.damp * 0.4, o.mix)
			return y
		}),
	},
	schroeder: { atom: schroederAtom, kernel: schroederK, whole: (x, o) => x.map(c => schroeder(c.slice(), { ...o })), decay: 'decay', damping: 'damping' },
}
// a random setting in a processor's ranges, as Float32 values
const settingOf = (atom, rnd) => Object.fromEntries(Object.entries(atom.params).map(([k, s]) => [k, Math.fround(s.min + (s.max - s.min) * rnd())]))

test('plate, fdn, shimmer, spring: the streaming form, in calls of 1, 64, 127, 128 and 1024 frames, is the whole-buffer call, bit for bit', () => {
	let rnd = seeded(41), opts = { plate: ['decay', 'damping', 'mix', 'bandwidth'], fdn: ['decay', 'damping', 'mix'], shimmer: ['decay', 'shimmer', 'damping', 'mix'], spring: ['decay', 'tension', 'damping', 'mix'] }
	for (let [name, keys] of Object.entries(opts)) for (let fs of [22050, 44100, 96000]) for (let chs of REVERBS[name].stereo ? [1, 2] : [1]) {
		let { kernel, stereo } = REVERBS[name], o = { fs }, p = {}
		for (let k of keys) p[k] = [o[k] = rnd()]
		if (name === 'fdn' && fs === 96000) p.t60 = [o.t60 = 0.8]   // a T60 in seconds overrides decay
		let x = Array.from({ length: chs }, (_, c) => burst(40000, 70 + c)), ref = x.map(c => c.slice())
		kernel.default(chs === 2 ? ref : ref[0], o)
		for (let block of [1, 64, 127, 128, 1024]) {
			let y = x.map(c => c.slice()), s = kernel.state(fs)
			for (let i = 0; i < 40000; i += block) {
				let n = Math.min(block, 40000 - i), v = y.map(c => c.subarray(i, i + n))
				if (stereo) kernel.stream(v[0], v[1] ?? null, p, s, n)
				else kernel.stream(v[0], p, s, n)
			}
			assert.equal(differing(y, ref), 0, `${name} at ${fs} Hz, ${chs} channels, calls of ${block}: samples that differ`)
		}
	}
})

test('the six processors stream: calls of 1, 64, 127, 128 and 1024 frames give the samples the whole signal in one call gave, bit for bit', () => {
	let rnd = seeded(51)
	for (let [name, r] of Object.entries(REVERBS)) {
		assert.notEqual(r.atom.streaming, false, `${name} streams`)
		for (let [sampleRate, chs] of [[22050, 1], [48000, 2], [96000, 3]]) {
			let set = settingOf(r.atom, rnd), x = Array.from({ length: chs }, (_, c) => burst(40000, 80 + c))
			let ref = r.whole(x, { ...set, fs: sampleRate })
			for (let block of [1, 64, 127, 128, 1024]) assert.equal(differing(atomRun(r.atom, x, set, { block, sampleRate }), ref), 0, `${name} at ${sampleRate} Hz, ${chs} channels, calls of ${block}: samples that differ`)
		}
	}
})

test('the six processors have no latency: an impulse moves nothing before it enters (shimmer\'s octave shifter reads only what was written)', () => {
	for (let [name, r] of Object.entries(REVERBS)) {
		let x = [new Float32Array(4000), new Float32Array(4000)]
		x[0][1000] = x[1][1000] = 1
		let y = atomRun(r.atom, x, {}, { block: 128 })
		for (let c = 0; c < 2; c++) for (let i = 0; i < 1000; i++) assert.equal(y[c][i], 0, `${name}, channel ${c}, frame ${i}`)
		assert.ok(y[0][1000] !== 0, `${name}: the impulse is heard as it enters`)
		assert.equal(r.atom.latency ?? 0, 0)
	}
})

test('every value of the six is live and smoothed over 20 ms: none is restart, every number declares smoothing 0.02', () => {
	for (let [name, r] of Object.entries(REVERBS)) for (let [k, s] of Object.entries(r.atom.params)) {
		assert.ok(!s.restart && !s.flags?.includes('restart'), `${name}.${k} is live`)
		assert.equal(s.smoothing, 0.02, `${name}.${k}`)
	}
})

// The crest of the second difference: each sample's |d2| over the RMS of d2 within ±h frames, the largest from a to b.
// A step stands out of the signal around it; a held setting gives the measure of the signal itself
function crest (y, a, b, h) {
	let top = 0
	for (let c of y) {
		let d = new Float64Array(c.length), s = 0
		for (let i = 2; i < c.length; i++) d[i] = c[i] - 2 * c[i - 1] + c[i - 2]
		for (let i = a - h; i < a + h; i++) s += d[i] * d[i]
		for (let i = a; i < b; i++) {
			let r = Math.sqrt(s / (2 * h))
			if (r > 0) top = Math.max(top, Math.abs(d[i]) / r)
			s += d[i + h] * d[i + h] - d[i - h] * d[i - h]
		}
	}
	return top
}

test('a change of decay or damping mid-tail, as a host makes it (a linear ramp over its smoothing, calls of 32 frames), is continuous', () => {
	// Measured on these cases (Node 25): ×1.05 of a held setting at most. With no ramp (a jump), damping from 0.8 to 0
	// reads ×2.3 to ×3.9 (schroeder, fdn, spring); decay, room and the shimmer share glide over 32 frames even then
	// (×1.07 at most). Left out: damping moved from 0.95 to a bright setting leaves a staircase of the host's 32-frame
	// steps, each 36 to 42 dB below the tail, which a tail that dark shows (×2 to ×3.5 by this measure)
	let sampleRate = 48000, n = sampleRate, B = sampleRate / 4, at = B + 32 * 300, span = Math.round(0.3 * sampleRate)
	for (let [name, r] of Object.entries(REVERBS)) {
		let moves = [[r.decay, 0.5, 0.9], [r.decay, 0.9, 0.3], [r.damping, 0.3, 0.8], [r.damping, 0.8, 0]]
		if (name === 'spring') moves.push(['tension', 0, 1])
		if (name === 'shimmer') moves.push(['shimmer', 0, 1])
		for (let [key, from, to] of moves) {
			let x = [burst(2 * B, 90), burst(2 * B, 91)].map(c => { let d = new Float32Array(n); d.set(c.subarray(0, B)); return d })
			let len = Math.round((r.atom.params[key].smoothing ?? 0) * sampleRate)
			// a host's ramp: the value at a call's first frame f is from + (to − from)·(f − at)/len, to from at + len on
			let move = (i, p) => { if (i >= at) p[key][0] = len ? from + (to - from) * Math.min(1, (i - at) / len) : to }
			let moved = atomRun(r.atom, x, { [key]: from, mix: 1 }, { block: 32, sampleRate, at: move })
			let held = atomRun(r.atom, x, { [key]: from, mix: 1 }, { block: 32, sampleRate }), heldTo = atomRun(r.atom, x, { [key]: to, mix: 1 }, { block: 32, sampleRate })
			assert.equal(differing(moved.map(c => c.subarray(0, at)), held.map(c => c.subarray(0, at))), 0, `${name} ${key}: nothing moves before the change`)
			let ratio = crest(moved, at, at + span, 240) / Math.max(crest(held, at, at + span, 240), crest(heldTo, at, at + span, 240))
			assert.ok(ratio <= 1.5, `${name} ${key} ${from} → ${to}: ×${ratio.toFixed(2)} the crest of a held setting`)
			assert.ok(rmsOf(moved[0], at + span - 960, at + span) > 0, `${name} ${key} ${from} → ${to}: the tail goes on`)
		}
	}
})

// A host as contract 1.0 describes one (Parameters, Time; What a host owes, 3): each call is handed the values at its
// first frame, as Float32; `key`, set to `to` at frame `at`, moves there on a linear ramp over its smoothing, and no call
// that starts while it moves is longer than 32 frames; as audio's hosts do, a call ends where the ramp does, so its
// corner is a call's first frame. `cut(i)`: the length the host would give the call at frame i
function hostRun (atom, x, set, key, to, at, cut, sampleRate, buffers = {}) {
	let params = paramsOf(atom, set), from = params[key][0], N = Math.round(atom.params[key].smoothing * sampleRate)
	let process = atom({ sampleRate, maxBlockSize: 128, maxChannels: x.length, params: paramsOf(atom, set), buffers })
	let out = x.map(c => new Float32Array(c.length))
	for (let i = 0; i < x[0].length;) {
		let n = Math.min(x[0].length - i, cut(i), i >= at && i < at + N ? Math.min(32, at + N - i) : 128)
		if (i < at && i + n > at) n = at - i
		if (i >= at) params[key][0] = i >= at + N ? to : from + (to - from) * (i - at) / N
		process([x.map(c => c.subarray(i, i + n))], [out.map(c => c.subarray(i, i + n))], params)
		i += n
	}
	return out
}
const d2top = (y, a, b) => { let m = 0; for (let c of y) for (let i = a; i < b; i++) m = Math.max(m, Math.abs(c[i] - 2 * c[i - 1] + c[i - 2])); return m }

test('a value that scales the signal glides: a host\'s ramp of decay, room, the shimmer share or mix gives one output however the host cuts its calls, and mix moves the output by no more than its line', () => {
	// The values that scale the signal (what a loop returns, the octave share, the mix) are glided sample by sample;
	// those that retune a filter (damping, damp, tension) or move a read (predelay) stay the call's. A tone of 220 Hz,
	// 0.5, from a quarter to three quarters of the range half a second in, 48 kHz, through the host above in calls of 1
	// frame, of 32 (128 while nothing moves) and of seeded lengths 1 to 128.
	// One output: the hosts hand values on one line, each rounded to Float32 (2^-24 of the value), and the glide draws
	// that line between them, so the values differ by 2^-23 of themselves at most; a mix passes that to the output, and
	// a loop of gain g grows it at most 1/(1 − g), 18 at the largest loop gain here (the FDN's shortest line at decay
	// 0.75, 0.945); with the outputs' own rounding (2^-24 of the peak each) they agree within 2.3e-6 of the peak, and
	// 1e-5 is asked. A value held for each call, the host's 32-frame staircase, differs by about 1e-3 of the peak.
	// mix: y = x + m·(w − x), w the wet signal (the output at mix 1), so Δ²y[n] = (1 − m)Δ²x + m·Δ²w + (m[n] − m[n−1])·
	// e[n] − (m[n−1] − m[n−2])·e[n−2], e = w − x: the first two terms are at most the larger of the two held settings'
	// (they are a line in m), and each step of m is at most the ramp's, s = |to − from|/N, and the two Float32
	// roundings of the values it lies between (2^-24 each, m ≤ 1); so the largest |Δ²y| over the change is at most the
	// held settings' plus 2·(s + 2^-23)·max|e|, e read off Float32 renders (2^-24·max|w| each way), plus the Float32
	// roundings of the outputs, each moving a Δ² by at most 4·2^-24·max|y|: the moved render's and the held ones'
	const glided = { plate: ['decay', 'mix'], fdn: ['decay', 'mix'], shimmer: ['decay', 'shimmer', 'mix'], spring: ['decay', 'mix'], freeverb: ['room', 'mix'], schroeder: ['decay', 'mix'], convolution: ['mix'] }
	const perCall = { plate: ['damping'], fdn: ['damping'], shimmer: ['damping'], spring: ['tension', 'damping'], freeverb: ['damp'], schroeder: ['damping'], convolution: ['predelay'] }
	let sampleRate = 48000, n = sampleRate, at = sampleRate / 2 + 13, span = Math.round(0.3 * sampleRate), rnd = seeded(71)
	let tone = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 220 * i / sampleRate)), x = [tone, tone.slice()]
	let ir = { ir: [irOf(Math.round(0.3 * sampleRate), 31).map(v => v * 0.05)] }
	let cuts = Array.from({ length: 4096 }, () => 1 + Math.floor(128 * rnd()))
	for (let [name, atom] of [...Object.entries(REVERBS).map(([k, r]) => [k, r.atom]), ['convolution', convolutionAtom]]) {
		let buffers = name === 'convolution' ? ir : {}
		for (let [key, s] of Object.entries(atom.params)) {
			if (!glided[name].includes(key)) { assert.ok(perCall[name].includes(key), `${name}.${key}: classed`); continue }
			let from = Math.fround(s.min + 0.25 * (s.max - s.min)), to = Math.fround(s.min + 0.75 * (s.max - s.min)), set = { [key]: from }
			if (key !== 'mix') set.mix = 1
			let one = hostRun(atom, x, set, key, to, at, () => 1, sampleRate, buffers), top = 0
			for (let c of one) for (let v of c) top = Math.max(top, Math.abs(v))
			for (let [how, cut] of [['32', () => 32], ['seeded', i => cuts[i & 4095]]]) {
				let y = hostRun(atom, x, set, key, to, at, cut, sampleRate, buffers), err = 0
				for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(y[c][i] - one[c][i]))
				assert.ok(err <= 1e-5 * top, `${name}.${key} ${from} → ${to}, calls of ${how} against calls of 1: ${(err / top).toExponential(1)} of the peak`)
			}
			if (key !== 'mix') continue
			let held = [from, to].map(v => hostRun(atom, x, { mix: v }, 'mix', v, at, () => 128, sampleRate, buffers))
			let w = hostRun(atom, x, { mix: 1 }, 'mix', 1, at, () => 128, sampleRate, buffers), e = 0, wmax = 0, ymax = 0
			for (let c = 0; c < 2; c++) for (let i = at; i < at + span; i++) e = Math.max(e, Math.abs(w[c][i] - x[c][i])), wmax = Math.max(wmax, Math.abs(w[c][i]))
			for (let y of [one, ...held]) for (let c of y) for (let i = at; i < at + span; i++) ymax = Math.max(ymax, Math.abs(c[i]))
			let ref = Math.max(...held.map(y => d2top(y, at, at + span))), step = Math.abs(to - from) / Math.round(s.smoothing * sampleRate) + 2 ** -23
			let bound = ref + 2 * step * (e + 2 * 2 ** -24 * wmax) + 8 * 2 ** -24 * ymax
			for (let [how, cut] of [['1', () => 1], ['32', () => 32]]) {
				let got = d2top(hostRun(atom, x, set, key, to, at, cut, sampleRate, buffers), at, at + span)
				assert.ok(got <= bound, `${name}.mix ${from} → ${to}, calls of ${how}: the largest |Δ²| ×${(got / ref).toFixed(2)} the held settings', its line allows ×${(bound / ref).toFixed(2)}`)
			}
		}
	}
})

// The validator's tail measure (compile/tools/verify.js, tail): a burst of noise, then silence; from the declared tail
// on, the output's RMS over every window of 64 frames stays below 1e-3 of the burst's RMS (60 dB down)
function tailHeld (atom, set, sampleRate) {
	let T = atom.tail({ sampleRate, params: paramsOf(atom, set), buffers: {} })
	if (!(T < Infinity)) return { T }
	let B = Math.round(0.25 * sampleRate), end = B + Math.max(128, Math.ceil(T * sampleRate)), n = end + Math.round(0.25 * sampleRate)
	let x = [noiseOf(n, 101), noiseOf(n, 102)]
	for (let c of x) c.fill(0, B)
	let y = atomRun(atom, x, set, { block: 1024, sampleRate }), floor = rmsOf(x[0], 0, B) * 1e-3, late = 0
	for (let i = end; i + 64 <= n; i += 64) for (let c of y) late = Math.max(late, rmsOf(c, i, i + 64))
	return { T, late: late / floor }
}

test('each reverb\'s tail holds: a noise burst falls 60 dB below itself within it, at the range ends and at 22.05, 44.1 and 96 kHz', () => {
	for (let [name, r] of Object.entries(REVERBS)) {
		let sets = [{}]
		for (let [k, s] of Object.entries(r.atom.params)) if (k !== 'mix') sets.push({ [k]: s.min }, { [k]: s.max })
		for (let sampleRate of [22050, 44100, 96000]) for (let set of sets) {
			let { T, late } = tailHeld(r.atom, set, sampleRate), at = `${name} ${JSON.stringify(set)} at ${sampleRate} Hz`
			// a pole at 1 never decays: the plate's tank at decay 1, a damping one-pole at damping 1 (it holds its value)
			let endless = set[r.damping] === 1 && name !== 'freeverb' || name === 'plate' && set.decay === 1
			if (endless) { assert.equal(T, Infinity, at); continue }
			assert.ok(T > 0 && T < Infinity, `${at}: tail ${T}`)
			assert.ok(late <= 1, `${at}: ${(20 * Math.log10(late) - 60).toFixed(1)} dB at ${T.toFixed(3)} s`)
		}
	}
})

// A radix-2 FFT in place, re and im of a power-of-two length
function fft (re, im) {
	let n = re.length
	for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
	for (let len = 2; len <= n; len <<= 1) {
		let a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a)
		for (let i = 0; i < n; i += len) for (let k = 0, cr = 1, ci = 0; k < len >> 1; k++) {
			let p = i + k, q = p + (len >> 1), tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr
			re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti
			let t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t
		}
	}
}
// The frequency, 0 to 0.45 of the rate (0: DC), an impulse response h is loudest at: its spectrum's largest bin, h
// zero-padded to four times its length, refined by the parabola through that bin and its two neighbours
function loudest (h, sampleRate) {
	let n = 1 << 15
	while (n < 4 * h.length) n <<= 1
	let re = new Float64Array(n), im = new Float64Array(n), k = 0
	re.set(h); fft(re, im)
	let mag = i => Math.hypot(re[i], im[i])
	for (let i = 0; i <= 0.45 * n; i++) if (mag(i) > mag(k)) k = i
	let d = k > 0 ? 0.5 * (mag(k - 1) - mag(k + 1)) / (mag(k - 1) - 2 * mag(k) + mag(k + 1)) : 0
	return Math.max(0, (k + d) * sampleRate / n)
}
// What four inputs that stop leave behind, against 60 dB under each input's level (contract 1.0, Latency, tail: the
// time after the input stops until the output stays 60 dB under the input's level), as the validator reads it: a noise
// burst against 1e-3 of its RMS, an impulse against 1e-3 of one 64-frame window's RMS (1/8), and a DC of 0.5 and a
// tone of 0.5 at the frequency the impulse response is loudest at, each against 1e-3 of its largest 64-frame RMS.
// Stricter than the validator: the DC and the tone hold for the tail (8 s at most), so the ring builds up to its steady
// level, and the tone sits on the spectrum's peak, not the nearest Hz. A ring: the frames from the stop to the end of
// the last 64-frame window above its level on any channel; -1 where a window is still above it a tail and 0.25 s on
function ringsOf (atom, set, sampleRate, T) {
	let W = 64, B = Math.round(0.25 * sampleRate), wait = Math.ceil(T * sampleRate) + B, hold = Math.round(Math.min(8, Math.max(0.25, T)) * sampleRate)
	let ring = (y, stop, floor) => {
		let last = stop
		for (let c of y) for (let i = stop; i + W <= c.length; i += W) if (!(rmsOf(c, i, i + W) <= floor)) last = Math.max(last, i + W)
		return last + W > y[0].length ? -1 : last - stop
	}
	let x = [noiseOf(B + wait, 201), noiseOf(B + wait, 202)], rings = {}
	for (let c of x) c.fill(0, B)
	rings['noise burst'] = ring(atomRun(atom, x, set, { block: 128, sampleRate }), B, 1e-3 * rmsOf(x[0], 0, B))
	x = [new Float32Array(B + wait), new Float32Array(B + wait)]
	x[0][B - 1] = x[1][B - 1] = 1
	let h = atomRun(atom, x, set, { block: 128, sampleRate })
	rings.impulse = ring(h, B, 1e-3 / Math.sqrt(W))
	let hz = loudest(h[0].subarray(B - 1, B - 1 + Math.min(1 << 17, h[0].length - B + 1)), sampleRate)
	for (let [what, f] of [['dc', 0], [`tone of ${hz.toFixed(2)} Hz`, hz]]) {
		let s = new Float32Array(hold + wait), w = 2 * Math.PI * f / sampleRate, top = 0
		for (let i = 0; i < hold; i++) s[i] = f ? 0.5 * Math.sin(w * i) : 0.5
		for (let i = 0; i + W <= hold; i += W) top = Math.max(top, rmsOf(s, i, i + W))
		rings[what] = ring(atomRun(atom, [s, s.slice()], set, { block: 128, sampleRate }), hold, 1e-3 * top)
	}
	return rings
}

test('each reverb\'s tail holds after a tone held at its loudest mode, a held DC, a noise burst and an impulse, and is at most twice the longest of their rings where its loop\'s gain is largest', () => {
	// A held input builds a feedback loop up to its peak gain (a comb's 1/(1 − g) at DC, a resonance of the network), so
	// the ring starts above the input, and the tail counts 60 dB under the input from there. At mix 1, where the ring is
	// loudest: the defaults, two seeded settings (each value at an end of its range a fifth of the time each), and the
	// setting where the loop's gain is largest (each kernel's tail derives the peak gain), at 22.05, 44.1 and 96 kHz.
	// Twice the longest ring, at the defaults and the largest gain: past it the validator advises a long tail. Not
	// rendered: tails over 30 s (the plate past decay 0.85 at damping 0)
	let rnd = seeded(61)
	const loudestSet = { plate: { decay: 0.8, damping: 0 }, fdn: { decay: 1, damping: 0 }, shimmer: { decay: 1, shimmer: 0, damping: 0 }, spring: { decay: 1, tension: 1, damping: 0 }, freeverb: { room: 1, damp: 0 }, schroeder: { decay: 0.98, damping: 0 } }
	for (let [name, r] of Object.entries(REVERBS)) for (let sampleRate of [22050, 44100, 96000]) {
		let drawn = Array.from({ length: 2 }, () => Object.fromEntries(Object.entries(r.atom.params).map(([k, s]) => { let u = rnd(); return [k, Math.fround(u < 0.2 ? s.min : u < 0.4 ? s.max : s.min + (s.max - s.min) * rnd())] })))
		for (let [set, twice] of [[{}, true], [loudestSet[name], true], ...drawn.map(s => [s, false])]) {
			set = { ...set, mix: 1 }
			let T = r.atom.tail({ sampleRate, params: paramsOf(r.atom, set), buffers: {} }), at = `${name} ${JSON.stringify(set)} at ${sampleRate} Hz`
			if (!(T <= 30)) continue
			let rings = ringsOf(r.atom, set, sampleRate, T), longest = 0
			for (let [what, n] of Object.entries(rings)) {
				assert.ok(n >= 0 && n <= Math.ceil(T * sampleRate), `${at}: after a ${what}, the output is above 60 dB under the input ${n < 0 ? 'still' : (n / sampleRate).toFixed(3) + ' s'} after it stops, the tail ${T.toFixed(3)} s`)
				longest = Math.max(longest, n / sampleRate)
			}
			if (twice) assert.ok(T <= 2 * longest, `${at}: tail ${T.toFixed(3)} s, ${(T / longest).toFixed(2)} times the longest ring (${longest.toFixed(3)} s)`)
		}
	}
})

// RT60 from the energy decay curve (M. R. Schroeder, "New method of measuring reverberation time", JASA 37(3), 1965:
// the impulse response's energy integrated backward), its slope from −5 to −35 dB extrapolated to 60 dB
function edcRT60 (y, sampleRate) {
	let e = new Float64Array(y.length), acc = 0
	for (let i = y.length - 1; i >= 0; i--) e[i] = acc += y[i] * y[i]
	let db = i => 10 * Math.log10(e[i] / e[0]), a = 0
	while (db(a) > -5) a++
	let b = a
	while (db(b) > -35) b++
	let sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0
	for (let i = a; i <= b; i++) { let v = db(i); sx += i; sy += v; sxx += i * i; sxy += i * v; k++ }
	return -60 / ((k * sxy - sx * sy) / (k * sxx - sx * sx)) / sampleRate
}

test('each reverb\'s tail is its slowest decay: the RT60 its impulse response measures is at most the tail, and at least the share its bound leaves', () => {
	// The tail bounds every mode (the loop's longest delay at any frequency against its largest gain, J. O. Smith's
	// decay time of a pole); the energy decay curve sees the modes' average. What the bound adds, so the least share:
	// plate: its slowest mode, at 868 Hz where the four tank allpasses' group delays peak together, is 1.6 times the
	// average; the bound adds 1.75 times the average delay and the input diffusers' ring (0.52 s): 0.4
	// fdn, damping 0: Jot's T60 itself, plus the longest line played out once (52 ms): 0.9
	// spring: the chain's group delay at its peak (up to 9% over its delay at DC), the pre-delay (12 ms), and damping,
	// which takes the highs sooner: 0.8
	// shimmer with no octave share, damping 0: the longest comb's 1617 samples against their mean 1522: 0.9
	// freeverb, damp 0: the longest comb (1640, the right channel's) against channel 0's mean (1378), one more pass of
	// it (37 ms) and the allpasses' ring (0.37 s): 0.75
	// schroeder, damping 0: the longest comb (1523) against their mean (1407), one more pass of it (35 ms) and the
	// allpasses' ring (0.14 s): 0.8
	// The tail then falls 60 dB under the input, not under the ring: the loop's part is longer by the 20·log10(G) dB a
	// held input builds it up by, G the loop's peak gain (each kernel's tail derives it), and the shares above shrink by
	// what that adds at each setting: plate ×1.195 and ×1.463, fdn ×1.502 and ×1.639, spring ×1.159 and ×1.433, shimmer
	// ×1.222 and ×1.389, freeverb ×1.397, schroeder ×1.531 (the tail with the term over the tail without it)
	// Measured (Node 25, 44.1 and 96 kHz): plate 0.39 and 0.42, fdn 0.60 to 0.65, spring 0.65 to 0.74, shimmer 0.68
	// and 0.78, freeverb 0.59, schroeder 0.59. With an octave share, shimmer's highs climb into its damping: 0.12 to 0.17
	let cases = [
		['plate', { decay: 0.5, damping: 0.3 }, 0.33], ['plate', { decay: 0.9, damping: 0 }, 0.27],
		['fdn', { decay: 0.6, damping: 0 }, 0.59], ['fdn', { decay: 1, damping: 0 }, 0.54], ['fdn', { decay: 0.6, damping: 0.3 }, 0],
		['spring', { decay: 0.6 }, 0.69], ['spring', { decay: 1, tension: 1, damping: 0 }, 0.55],
		['shimmer', { decay: 0.7, shimmer: 0, damping: 0 }, 0.73], ['shimmer', { decay: 1, shimmer: 0, damping: 0 }, 0.64], ['shimmer', { decay: 0.7 }, 0],
		['freeverb', { room: 0.9, damp: 0 }, 0.53], ['freeverb', { room: 0.5 }, 0],
		['schroeder', { decay: 0.95, damping: 0 }, 0.52], ['schroeder', { decay: 0.84 }, 0],
	]
	for (let sampleRate of [44100, 96000]) for (let [name, set, least] of cases) {
		let { atom } = REVERBS[name], T = atom.tail({ sampleRate, params: paramsOf(atom, set), buffers: {} })
		let x = [new Float32Array(Math.ceil((T + 0.2) * sampleRate))]
		x[0][0] = 1
		let rt = edcRT60(atomRun(atom, x, { ...set, mix: 1 }, { block: 1024, sampleRate })[0], sampleRate)
		assert.ok(rt <= T && rt >= least * T, `${name} ${JSON.stringify(set)} at ${sampleRate} Hz: RT60 ${rt.toFixed(3)} s, tail ${T.toFixed(3)} s (${(rt / T).toFixed(2)})`)
	}
})
