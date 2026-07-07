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


import { freeverb, dattorro, convolve } from './index.js'

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
