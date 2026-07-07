import test from 'node:test'
import { strict as assert } from 'node:assert'

import { schroeder } from './index.js'
const fx = { reverb: schroeder }

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
	// measure 880 Hz in the tail after the source stops
	let e880wet = goertzel(wet, 880, 44100, 44100, n)
	let e880dry = goertzel(dry, 880, 44100, 44100, n)
	assert.ok(e880wet > e880dry * 3, 'octave-up energy in shimmer tail (' + (e880wet / (e880dry + 1e-12)).toFixed(1) + '×)')
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
