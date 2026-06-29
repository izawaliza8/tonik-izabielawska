'use client'
import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { Decal } from '@react-three/drei'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import {
  SCROLL_PHASE1A_VH,
  SCROLL_PHASE1B_VH,
  SCROLL_PHASE1_VH,
  SCROLL_PHASE3_START_VH,
  SCROLL_PHASE4_START_VH,
  SCROLL_PHASE2_VH,
  SCROLL_PHASE3_VH,
  SCROLL_PHASE4_VH,
  scrollOffsetVh,
} from './globeScrollLayout'

gsap.registerPlugin(ScrollTrigger)

// ── Globe constants ───────────────────────────────────────────────────────────
const LINE_COLOR = '#AEAEBC'
const COLOR_A = '#0a0a0f'
const COLOR_B = '#b3327a'
const DETAIL_DESKTOP = 48
const DETAIL_MOBILE = 16
const GLOBE_SCALE = 0.72
const INIT_SCALE = 0.6


// ── Particle constants ────────────────────────────────────────────────────────
const PARTICLE_SIZE_INIT = 0.018
const PARTICLE_COLOR = '#AEAEBC'

// ── Beam / comet constants ────────────────────────────────────────────────────
const OVERLAY_BEAM_COLOR = '#6A2137'
const BEAM_LINE_WIDTH = 3
const OVERLAY_LINE_OPACITY = 0.65
const ARC_SEGS = 64
const BEAM_DRAW_SPEED = 4.4
const BEAM_DRAW_EASE = 'sine.in'
const BEAM_FADE_DUR = 0.4
const BEAM_FADE_EASE = 'sine.out'
const PHASE1A_SCROLL_END = scrollOffsetVh(SCROLL_PHASE1A_VH)
const PHASE1B_SCROLL_START = scrollOffsetVh(SCROLL_PHASE1A_VH)
const PHASE2_SCROLL_START = scrollOffsetVh(SCROLL_PHASE1_VH)
const ENTRANCE_TRIGGER_START = PHASE1B_SCROLL_START
const ENTRANCE_TRIGGER_END = scrollOffsetVh(SCROLL_PHASE1B_VH) // relative to start, not cumulative
const ENTRANCE_GROUP_OVERLAP = 1.1

const DOT_POP_DUR     = 0.22
const DOT_POP_STAGGER = 0.06

const OVERLAY_COLORS = ['#AEAEBC', '#AEAEBC', '#AEAEBC', '#AEAEBC', '#AEAEBC']
const OVERLAY_PARTICLE_SIZE = 0.009
const OVERLAY_PARTICLE_OPACITY = 1
const OVERLAY_SPHERE_SEGS = 8
const TRAIL_SPHERE_COUNT = 20
const TRAIL_SPHERE_BASE_SIZE = OVERLAY_PARTICLE_SIZE * 1.2
const TRAIL_MAX_LENGTH = 0.3
const TRAIL_FADE_DURATION = 0
const YOYO_TRAVEL_SPEED = 0.8
const YOYO_PAUSE_DURATION = 0
const PHASE1_REST_EPS = 0.01   // scroll progress threshold for "back in phase 1"

const DOT_BG_COLOR_A = '#905868'
const DOT_BG_COLOR_B = '#210a11'
const BACK_LIGHT_POS = new THREE.Vector3(0, 0.15, -2.5)
const BACK_LIGHT_COLOR = '#de91bb'
const BACK_LIGHT_MAX = 12
const BACK_LIGHT_RIM = 6
const HEADER_PX = 71
const HEADER_COLOR = '#FFFFFF'
const HEADER_SIZE = 1.6
const HEADER_POS_Y = 0.36
const SUBTITLE_PX = 47
const SUBTITLE_COLOR = '#BBBBBB'
const SUBTITLE_SIZE = 0.95
const SUBTITLE_POS_Y = 0.18
const TEXT_LIFT = 1.04
const TEXT_Z_PUSH = -10
const TEXT_DEPTH = 10
const TEXT_DEPTH_ANGLE = 90
const TEXT_SIDE_COLOR = '#1c1c1c'

// ── Positions & beam connections ──────────────────────────────────────────────
const LATLONS: [number, number][] = [
  [ 53,   0],   // P0 — top,          front
  [ 24, 138],   // P1 — upper,        right-back
  [  0, -85],   // P2 — equator,      left
  [-24,  53],   // P3 — lower,        right-front
  [-53, 190],   // P4 — bottom,       back-left
]
// P0→P1  and  P2→P3→P4
const BEAMS: [number, number][] = [[0, 1], [2, 3], [3, 4]]

// Phase 3 equator targets — lat=0, lon evenly spaced 360/5=72° apart, centered on 0
const ROW_TARGETS: THREE.Vector3[] = [
  new THREE.Vector3(Math.sin(-144 * Math.PI / 180), 0, Math.cos(-144 * Math.PI / 180)),
  new THREE.Vector3(Math.sin(-72 * Math.PI / 180), 0, Math.cos(-72 * Math.PI / 180)),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(Math.sin(72 * Math.PI / 180), 0, Math.cos(72 * Math.PI / 180)),
  new THREE.Vector3(Math.sin(144 * Math.PI / 180), 0, Math.cos(144 * Math.PI / 180)),
]

// Phase 4 — fired on scroll-enter (GSAP, no scrub). Every dot keeps moving
// anticlockwise (increasing longitude) and parks at one of these frontal slots.
// Slots are assigned by anticlockwise proximity to +15°: the dot closest to +15°
// lands there, the next at +7.5°, … the furthest sweeps almost a full lap to −15°.
// All dots share one angular sweep ("same speed") and peel off as each reaches it.
const PHASE4_SLOTS     = [15, 7.5, 0, -7.5, -15]   // frontal slots, +15° first
const PHASE4_RADIUS    = 1.18
const PHASE4_SPEED_DPS = 200                       // sweep angular speed (deg / sec)

const mod360 = (d: number) => ((d % 360) + 360) % 360

type Phase4Plan = { travel: number[]; maxTravel: number }

// Given each dot's current longitude, assign slots by anticlockwise distance to
// +15° and return the anticlockwise sweep (deg) each dot must travel to its slot.
function phase4Plan(startLons: number[]): Phase4Plan {
  const ranked = startLons
    .map((L, i) => ({ i, d: mod360(PHASE4_SLOTS[0] - L) }))
    .sort((a, b) => a.d - b.d)
  const travel = new Array<number>(startLons.length)
  let maxTravel = 0
  ranked.forEach(({ i }, rank) => {
    travel[i] = mod360(PHASE4_SLOTS[rank] - startLons[i])
    if (travel[i] > maxTravel) maxTravel = travel[i]
  })
  return { travel, maxTravel }
}

// ── Portrait textures & shaders ───────────────────────────────────────────────
const PORTRAIT_PATHS = [
  '/globe/p0.png',
  '/globe/p1.png',
  '/globe/p2.png',
  '/globe/p3.png',
  '/globe/p4.png',
]

const PORTRAIT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const PORTRAIT_FRAG = `
uniform sampler2D map;
uniform vec3 uDotColor;
uniform float uOpacity;
uniform float uReveal;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uBevelWidth;
uniform float uBevelStrength;
uniform float uBevelLight;
uniform vec3 uBevelHighlight;
uniform vec3 uBevelShadow;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);

  // Anti-aliased circle edge
  float fw = fwidth(r);
  float alpha = 1.0 - smoothstep(0.5 - fw, 0.5 + fw, r);
  if (alpha < 0.001) discard;

  vec4 tex = texture2D(map, vUv);

  // Image look: brightness → contrast → saturation (all default to neutral 1.0)
  vec3 imgCol = tex.rgb * uBrightness;
  imgCol = (imgCol - 0.5) * uContrast + 0.5;
  float lum = dot(imgCol, vec3(0.299, 0.587, 0.114));
  imgCol = mix(vec3(lum), imgCol, uSaturation);

  // Reveal white dot → photo (background lives on a separate plane behind)
  vec3 col = mix(uDotColor, imgCol, uReveal);

  // Beveled rim — colored highlight / shadow on edge ring only
  float a = radians(uBevelLight);
  vec2 L = vec2(cos(a), sin(a));
  float facing = dot(r > 1e-4 ? p / r : vec2(0.0), L);
  float inner = 0.5 - uBevelWidth;
  float rim = smoothstep(inner - fw, inner + fw, r)
            * (1.0 - smoothstep(0.5 - fw * 2.0, 0.5 + fw, r));
  vec3 bevelCol = facing >= 0.0 ? uBevelHighlight : uBevelShadow;
  col = mix(col, bevelCol, abs(facing) * uBevelStrength * rim);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha * mix(1.0, tex.a, uReveal) * uOpacity);
}
`

const DOT_BG_FRAG = `
uniform float uReveal;
uniform vec3 uBgColorA;   // gradient stop A (sRGB 0..1)
uniform vec3 uBgColorB;   // gradient stop B (sRGB 0..1)
varying vec2 vUv;

// sRGB → linear so the renderer's sRGB output reproduces the CSS gradient exactly
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);
  float fw = fwidth(r);
  float alpha = 1.0 - smoothstep(0.5 - fw, 0.5 + fw, r);
  if (alpha < 0.001) discard;

  // linear-gradient(40deg, A -4.51%, B 97.28%)
  float ang = radians(40.0);
  vec2  dir = vec2(sin(ang), cos(ang));         // CSS: 0deg = up, +clockwise
  float L   = abs(dir.x) + abs(dir.y);          // gradient-line length across the unit box
  float g   = dot(p, dir) / L + 0.5;            // 0..1 corner-to-corner
  float f   = clamp((g + 0.0451) / (0.9728 + 0.0451), 0.0, 1.0); // stops at -4.51% / 97.28%
  vec3  col = srgbToLinear(mix(uBgColorA, uBgColorB, f));

  gl_FragColor = vec4(col, alpha * uReveal);
}
`

// ── Uniforms type ─────────────────────────────────────────────────────────────
type Uniforms = {
  uTime: { value: number }
  uProgress: { value: number }
  uLineColor: { value: THREE.Color }
  uColorA: { value: THREE.Color }
  uColorB: { value: THREE.Color }
  uSpeed: { value: number }
  uDistortionFrequency: { value: number }
  uDistortionStrength: { value: number }
  uDisplacementFrequency: { value: number }
  uDisplacementStrength: { value: number }
  uWaveDepth: { value: number }
  uLevels: { value: number }
  uLineWidth: { value: number }
  uLight1: { value: THREE.Vector3 }
  uLight2: { value: THREE.Vector3 }
  uLight3: { value: THREE.Vector3 }
  uLight4: { value: THREE.Vector3 }
  uBackLight: { value: THREE.Vector3 }
  uBackLightStrength: { value: number }
  uBackLightColor: { value: THREE.Color }
  uBackLightRim: { value: number }
  uAmbient: { value: number }
  uGradCore: { value: THREE.Color }
  uGradRim: { value: THREE.Color }
  uRadialFocus: { value: number }
  uPulseStrength: { value: number }
  uPulseSpeed: { value: number }
  uPulseMix: { value: number }
}

// ── Ashima 3-D simplex noise ──────────────────────────────────────────────────
const NOISE = /* glsl */`
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}
vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0)) +
    i.y + vec4(0.0, i1.y, i2.y, 1.0)) +
    i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3  ns  = n_ * D.wyz - D.xzx;
  vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x  = x_ * ns.x + ns.yyyy;
  vec4 y  = y_ * ns.x + ns.yyyy;
  vec4 h  = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

const FIELD = /* glsl */`
uniform float uTime;
uniform float uSpeed;
uniform float uDistortionFrequency;
uniform float uDistortionStrength;
uniform float uDisplacementFrequency;
uniform float uDisplacementStrength;
uniform float uWaveDepth;

float fbm(vec3 p) {
  float sum = 0.0; float amp = 0.5;
  for (int i = 0; i < 2; i++) { sum += amp * snoise(p); p *= 2.0; amp *= 0.5; }
  return sum;
}
float getField(vec3 dir) {
  float t = uTime * uSpeed;
  vec3 distortion = vec3(
    snoise(dir * uDistortionFrequency + vec3(0.0,  0.0, t)),
    snoise(dir * uDistortionFrequency + vec3(11.0, 0.0, t)),
    snoise(dir * uDistortionFrequency + vec3(0.0, 31.0, t))
  );
  vec3  p     = dir + distortion * uDistortionStrength;
  float field = fbm(p * uDisplacementFrequency + t);
  field = field * 0.5 + 0.5;
  field = pow(field, uWaveDepth) * 2.0 - 1.0;
  return field;
}
vec3 displacedPos(vec3 dir) {
  vec3 nd = normalize(dir);
  return nd * (1.0 + getField(nd) * uDisplacementStrength);
}
`

const VERTEX_SHADER = /* glsl */`
${NOISE}
${FIELD}
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vBasePos;
void main() {
  vBasePos    = position;
  vec3 dir    = normalize(position);
  vec3 pos    = displacedPos(dir);
  vec3 ref = abs(dir.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
  vec3 t1  = normalize(cross(dir, ref));
  vec3 t2  = normalize(cross(dir, t1));
  vec3 pA  = displacedPos(dir + t1 * 0.01);
  vec3 pB  = displacedPos(dir + t2 * 0.01);
  vec3 nrm = normalize(cross(pA - pos, pB - pos));
  if (dot(nrm, dir) < 0.0) nrm = -nrm;
  vNormal   = normalize(mat3(modelMatrix) * nrm);
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
}
`

const FRAGMENT_SHADER = /* glsl */`
precision highp float;
${NOISE}
${FIELD}
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vBasePos;
uniform vec3  uLineColor;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uProgress;
uniform float uLevels;
uniform float uLineWidth;
uniform vec3  uLight1; uniform vec3  uLight2; uniform vec3  uLight3; uniform vec3  uLight4;
uniform vec3  uBackLight;
uniform float uBackLightStrength;
uniform vec3  uBackLightColor;
uniform float uBackLightRim;
uniform float uAmbient;
uniform vec3  uGradCore;
uniform vec3  uGradRim;
uniform float uRadialFocus;
uniform float uPulseStrength;
uniform float uPulseSpeed;
uniform float uPulseMix;
void main() {
  float h    = getField(normalize(vBasePos));
  float band = h * uLevels;
  float f    = fract(band);
  float d    = min(f, 1.0 - f);
  float wdt  = fwidth(band) * uLineWidth;
  float line = 1.0 - smoothstep(0.0, wdt, d);
  vec3  N    = normalize(vNormal);
  vec3  V    = normalize(cameraPosition - vWorldPos);
  float diff = clamp(
    max(dot(N,normalize(uLight1-vWorldPos)),0.0)+max(dot(N,normalize(uLight2-vWorldPos)),0.0)+
    max(dot(N,normalize(uLight3-vWorldPos)),0.0)+max(dot(N,normalize(uLight4-vWorldPos)),0.0),
    0.0,1.0);
  float shade  = uAmbient + (1.0 - uAmbient) * diff;
  vec3  Lback  = normalize(uBackLight - vWorldPos);
  float facingBack = max(dot(N, Lback), 0.0);
  float rim      = pow(1.0 - max(dot(N, V), 0.0), uBackLightRim);
  float backGlow = rim * mix(0.2, 1.0, facingBack);
  vec3  backCol  = uBackLightColor * backGlow * uBackLightStrength;
  float fres   = pow(1.0 - max(dot(N,V),0.0), 2.0);
  float radial = max(dot(N,V),0.0);
  float center = pow(radial, uRadialFocus);
  float pulse  = 0.5 + 0.5 * sin(uTime * uPulseSpeed);
  vec3  radCol = mix(uGradRim, uGradCore, center);
  float radStr = uPulseStrength * ((1.0-uPulseMix) + uPulseMix*pulse) * center * uProgress;
  vec3 lineCol = uLineColor * shade * (1.0 + fres * 0.8);
  vec3  col   = lineCol * line + radCol * radStr + backCol;
  float alpha = line * mix(0.85,1.0,fres) + radStr + backGlow * uBackLightStrength * 0.45;
  gl_FragColor = vec4(col, alpha);
}
`

// ── Scratch objects (module-level, reused every frame) ────────────────────────
const _trailDummy = new THREE.Object3D()
const _trailCol = new THREE.Color()

// ── Helpers ───────────────────────────────────────────────────────────────────
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function latLonToVec3(lat: number, lon: number, r = 1): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180
  const theta = (lon * Math.PI) / 180
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.sin(theta),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.cos(theta),
  )
}

// JS approximation of the globe shader's getField() so particles ride the waves.
function approxField(dir: THREE.Vector3, time: number): number {
  const t = time * 0.01
  const { x, y, z } = dir
  const dx = (Math.sin(x * 1.05 + t) * 0.7 + Math.sin(y * 1.3 + t * 1.4) * 0.3) * 1.96
  const dy = (Math.sin(y * 1.05 + t + 3.8) * 0.7 + Math.sin(z * 1.1 + t * 0.9) * 0.3) * 1.96
  const dz = (Math.sin(z * 1.05 + t + 9.9) * 0.7 + Math.sin(x * 1.4 + t * 1.2) * 0.3) * 1.96
  const px = (x + dx) * 0.20 + t
  const py = (y + dy) * 0.20 + t
  const pz = (z + dz) * 0.20 + t
  const n1 = Math.sin(px * 3.7 + py * 2.9 + pz * 4.1) * 0.5
  const n2 = Math.sin(px * 7.4 + py * 5.8 + pz * 8.2) * 0.25
  const raw = n1 + n2
  const field = Math.min(Math.max(raw / 0.75 * 0.5 + 0.5, 0), 1)
  return Math.pow(field, 1.80) * 2.0 - 1.0
}

// Orthodromic arc: great-circle slerp between two sphere points,
// lifted radially outward at each step. Peak height = half the chord length,
// which gives a natural semicircle-like lift proportional to the separation.
function orthodromicArc(
  a: THREE.Vector3,
  b: THREE.Vector3,
  segs = 64,
  peakHeight?: number,
): THREE.Vector3[] {
  const aN = a.clone().normalize()
  const bN = b.clone().normalize()

  const chord = aN.distanceTo(bN)
  const h = peakHeight ?? chord * 0.5

  const cosAngle = Math.max(-1, Math.min(1, aN.dot(bN)))
  const angle = Math.acos(cosAngle)
  const sinAngle = Math.sin(angle)

  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs

    // Slerp for stable great-circle interpolation
    let dir: THREE.Vector3
    if (sinAngle < 1e-6) {
      dir = aN.clone().lerp(bN, t).normalize()
    } else {
      const wa = Math.sin((1 - t) * angle) / sinAngle
      const wb = Math.sin(t * angle) / sinAngle
      dir = new THREE.Vector3(
        aN.x * wa + bN.x * wb,
        aN.y * wa + bN.y * wb,
        aN.z * wa + bN.z * wb,
      ).normalize()
    }

    // Radial lift: sine envelope → zero at endpoints, peak at midpoint
    const r = 1.0 + h * Math.sin(Math.PI * t)
    pts.push(dir.multiplyScalar(r))
  }
  return pts
}

const ARC_UNIFORM_HEIGHT = (() => {
  const p2 = latLonToVec3(LATLONS[2][0], LATLONS[2][1]).normalize()
  const p3 = latLonToVec3(LATLONS[3][0], LATLONS[3][1]).normalize()
  return p2.distanceTo(p3) * 0.5 * 0.15
})()

function walkBackArc(
  pts: THREE.Vector3[], fromIdx: number, targetDist: number, forward: boolean,
): THREE.Vector3 {
  let dist = 0, i = fromIdx
  while (true) {
    const next = forward ? i - 1 : i + 1
    if (next < 0 || next >= pts.length) break
    const d = pts[i].distanceTo(pts[next])
    if (dist + d >= targetDist) return pts[i].clone().lerp(pts[next], (targetDist - dist) / d)
    dist += d; i = next
  }
  return pts[forward ? 0 : pts.length - 1].clone()
}

function makeTrailMesh(color: string): THREE.InstancedMesh {
  const geo = new THREE.SphereGeometry(1, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 1,
    depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, TRAIL_SPHERE_COUNT)
  mesh.renderOrder = 2
  _trailDummy.scale.setScalar(0)
  _trailDummy.position.set(0, 0, 0)
  _trailDummy.updateMatrix()
  const baseCol = new THREE.Color(color)
  for (let i = 0; i < TRAIL_SPHERE_COUNT; i++) {
    mesh.setMatrixAt(i, _trailDummy.matrix)
    mesh.setColorAt(i, baseCol)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  return mesh
}

function updateTrailMesh(
  mesh: THREE.InstancedMesh, pts: THREE.Vector3[],
  dotIdx: number, trailWorldLen: number, forward: boolean, baseColor: THREE.Color,
) {
  if (trailWorldLen <= 0) {
    _trailDummy.scale.setScalar(0); _trailDummy.position.set(0, 0, 0); _trailDummy.updateMatrix()
    for (let i = 0; i < TRAIL_SPHERE_COUNT; i++) mesh.setMatrixAt(i, _trailDummy.matrix)
    mesh.instanceMatrix.needsUpdate = true; return
  }
  const spacing = trailWorldLen / TRAIL_SPHERE_COUNT
  for (let i = 0; i < TRAIL_SPHERE_COUNT; i++) {
    const t = i / TRAIL_SPHERE_COUNT
    const q = (1 - t) * (1 - t)
    const pos = walkBackArc(pts, dotIdx, (i + 1) * spacing, forward)
    _trailDummy.position.copy(pos)
    _trailDummy.scale.setScalar(TRAIL_SPHERE_BASE_SIZE * q)
    _trailDummy.updateMatrix()
    mesh.setMatrixAt(i, _trailDummy.matrix)
    _trailCol.copy(baseColor).multiplyScalar(q)
    mesh.setColorAt(i, _trailCol)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

// ── AnimatedBeam ──────────────────────────────────────────────────────────────
type AnimatedBeamProps = {
  fromLat: number; fromLon: number
  toLat: number; toLon: number
  lineRef: { current: Line2 | null }
  arcPointsRef: { current: THREE.Vector3[] }
}

function AnimatedBeam({ fromLat, fromLon, toLat, toLon, lineRef, arcPointsRef }: AnimatedBeamProps) {
  const { size } = useThree()

  const { line, arcPoints } = useMemo(() => {
    // Endpoints at radius 1.0 — same as particle base positions
    const a = latLonToVec3(fromLat, fromLon)
    const b = latLonToVec3(toLat, toLon)
    const pts = orthodromicArc(a, b, ARC_SEGS, ARC_UNIFORM_HEIGHT)
    const positions: number[] = []
    pts.forEach(p => positions.push(p.x, p.y, p.z))
    const geo = new LineGeometry()
    geo.setPositions(positions)
    geo.instanceCount = 0
    const mat = new LineMaterial({
      color: OVERLAY_BEAM_COLOR, linewidth: BEAM_LINE_WIDTH,
      transparent: true, opacity: OVERLAY_LINE_OPACITY,
      depthWrite: false, depthTest: true, worldUnits: false, dashed: false,
    })
    const l = new Line2(geo, mat)
    l.renderOrder = 2
    return { line: l, arcPoints: pts }
  }, [fromLat, fromLon, toLat, toLon])

  useEffect(() => {
    lineRef.current = line; arcPointsRef.current = arcPoints
    return () => {
      lineRef.current = null; arcPointsRef.current = []
      line.geometry.dispose(); (line.material as LineMaterial).dispose()
    }
  }, [line, lineRef, arcPoints, arcPointsRef])

  useEffect(() => {
    ; (line.material as LineMaterial).resolution.set(size.width, size.height)
  }, [size, line])

  return <primitive object={line} />
}

// ── Surface particles ─────────────────────────────────────────────────────────
// Children of the rotating globe group — they orbit with it.
// Fixed at radius 1.0 so their positions exactly match the beam endpoints.
type ParticlesProps = {
  baseDirs: THREE.Vector3[]
  particleRefs: { current: THREE.Group | null }[]
  revealRef: React.MutableRefObject<number>
}

// Parse a #rrggbb string into sRGB 0..1 components (no colour-space conversion).
const hexToSRGB = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function SurfaceParticles({ baseDirs, particleRefs, revealRef }: ParticlesProps) {
  const textures = useLoader(THREE.TextureLoader, PORTRAIT_PATHS)

  const dotColorRef    = useRef('#ffffff')
  const opacityRef     = useRef(1.0)
  const brightnessRef  = useRef(1.0)
  const contrastRef    = useRef(1.0)
  const saturationRef  = useRef(1.0)
  const bevelWidthRef    = useRef(0.03)
  const bevelStrengthRef = useRef(0.38)
  const bevelLightRef    = useRef(172)
  const bevelHighlightRef = useRef('#ffffff')
  const bevelShadowRef    = useRef('#ba70d8')

  const bgMaterials = useMemo(() =>
    textures.map(() => new THREE.ShaderMaterial({
      uniforms: {
        uReveal:   { value: 0.0 },
        uBgColorA: { value: new THREE.Vector3(...hexToSRGB(DOT_BG_COLOR_A)) },
        uBgColorB: { value: new THREE.Vector3(...hexToSRGB(DOT_BG_COLOR_B)) },
      },
      vertexShader: PORTRAIT_VERT,
      fragmentShader: DOT_BG_FRAG,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
    })),
    [textures],
  )

  const materials = useMemo(() =>
    textures.map(tex => {
      tex.center.set(0.5, 0.5)
      tex.colorSpace = THREE.SRGBColorSpace
      return new THREE.ShaderMaterial({
        uniforms: {
          map:          { value: tex },
          uDotColor:    { value: new THREE.Color('#ffffff') },
          uOpacity:     { value: 0.0 },
          uReveal:      { value: 0.0 },
          uBrightness:  { value: 1.0 },
          uContrast:    { value: 1.0 },
          uSaturation:  { value: 1.0 },
          uBevelWidth:  { value: 0.03 },
          uBevelStrength: { value: 0.38 },
          uBevelLight:  { value: 172 },
          uBevelHighlight: { value: new THREE.Color('#ffffff') },
          uBevelShadow:    { value: new THREE.Color('#ba70d8') },
        },
        vertexShader: PORTRAIT_VERT,
        fragmentShader: PORTRAIT_FRAG,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false,
        depthTest: true,
      })
    }),
    [textures],
  )

  useFrame(() => {
    const reveal = revealRef.current
    bgMaterials.forEach(m => {
      m.uniforms.uReveal.value = reveal
      m.uniforms.uBgColorA.value.set(...hexToSRGB(DOT_BG_COLOR_A))
      m.uniforms.uBgColorB.value.set(...hexToSRGB(DOT_BG_COLOR_B))
    })
    materials.forEach(m => {
      m.uniforms.uDotColor.value.set(dotColorRef.current)
      m.uniforms.uOpacity.value = opacityRef.current * reveal
      m.uniforms.uReveal.value = reveal
      m.uniforms.uBrightness.value = brightnessRef.current
      m.uniforms.uContrast.value = contrastRef.current
      m.uniforms.uSaturation.value = saturationRef.current
      m.uniforms.uBevelWidth.value = bevelWidthRef.current
      m.uniforms.uBevelStrength.value = bevelStrengthRef.current
      m.uniforms.uBevelLight.value = bevelLightRef.current
      m.uniforms.uBevelHighlight.value.set(bevelHighlightRef.current)
      m.uniforms.uBevelShadow.value.set(bevelShadowRef.current)
    })
  })

  return (
    <>
      {baseDirs.map((d, i) => (
        <group
          key={i}
          ref={particleRefs[i] as React.RefObject<THREE.Group>}
          position={[d.x, d.y, d.z]}
          scale={PARTICLE_SIZE_INIT}
        >
          <mesh position={[0, 0, -0.002]} scale={[1.0, 1.0, 1]} renderOrder={1.9}>
            <planeGeometry args={[1, 1]} />
            <primitive object={bgMaterials[i]} attach="material" />
          </mesh>
          <mesh renderOrder={2}>
            <planeGeometry args={[1, 1]} />
            <primitive object={materials[i]} attach="material" />
          </mesh>
        </group>
      ))}
    </>
  )
}

// ── Phase-4 headline, projected onto the sphere surface as Decals ───────────────
const PHASE4_HEADER   = 'CoffeeSpace is where the best teams find each other.'
const PHASE4_SUBTITLE = "Profiles surface real projects, scrappiness, and the things resumes can't show."

// Rasterise one wrapped, centred text block onto its own canvas → CanvasTexture.
// depthPx > 0 fakes thickness by stacking offset copies (in sideColor) behind the face.
function rasterizeBlock(
  text: string, font: string, color: string, lineHeightMul: number,
  depthPx: number, depthAngleDeg: number, sideColor: string,
) {
  const W    = 1200
  const maxW = W * 0.86
  const px   = parseInt(font.match(/(\d+)px/)?.[1] ?? '40', 10)
  const meas = document.createElement('canvas').getContext('2d')!
  meas.font = font

  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word
    if (meas.measureText(test).width > maxW && line) { lines.push(line); line = word }
    else line = test
  }
  if (line) lines.push(line)

  const lh   = px * lineHeightMul
  // Extrusion offset in canvas space (x right, y down): 0° = right, 90° = down.
  const a    = (depthAngleDeg * Math.PI) / 180
  const ex   = Math.cos(a) * depthPx
  const ey   = Math.sin(a) * depthPx
  const pad  = Math.round(px * 0.6) + Math.ceil(Math.max(Math.abs(ex), Math.abs(ey)))
  const H    = Math.ceil(lines.length * lh + pad * 2)

  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font

  const drawLines = (dx: number, dy: number) => {
    let y = pad + lh / 2
    for (const l of lines) { ctx.fillText(l, W / 2 + dx, y + dy); y += lh }
  }

  // Extruded body: stacked copies from far → near, then the face on top.
  const steps = depthPx > 0 ? Math.min(160, Math.ceil(depthPx)) : 0
  ctx.fillStyle = sideColor
  for (let s = steps; s >= 1; s--) drawLines((ex * s) / steps, (ey * s) / steps)
  ctx.fillStyle = color
  drawLines(0, 0)

  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 16
  t.needsUpdate = true
  return { texture: t, aspect: H / W }
}

type BlockTex = { texture: THREE.CanvasTexture; aspect: number }

type PhaseFourTextProps = {
  opacityRef: React.MutableRefObject<number>   // GSAP-driven fade (0→1)
  scaleRef: React.MutableRefObject<number>     // live globe world scale
  lift: number          // radial multiplier so text sits just proud of the surface
  zPush: number         // polygonOffsetFactor
  headerPx: number
  headerColor: string
  headerSize: number    // header decal width in local (radius-1) units
  headerPosY: number    // header latitude (Y on unit sphere)
  subtitlePx: number
  subtitleColor: string
  subtitleSize: number  // subtitle decal width
  subtitlePosY: number  // subtitle latitude
  depth: number         // faux-extrusion thickness (canvas px)
  depthAngle: number    // extrusion direction (deg, 0 = right, 90 = down)
  sideColor: string     // colour of the extruded body
}

function PhaseFourText({
  opacityRef, scaleRef, lift, zPush,
  headerPx, headerColor, headerSize, headerPosY,
  subtitlePx, subtitleColor, subtitleSize, subtitlePosY,
  depth, depthAngle, sideColor,
}: PhaseFourTextProps) {
  const meshRef         = useRef<THREE.Mesh>(null)
  const headerMatRef    = useRef<THREE.MeshBasicMaterial>(null)
  const subtitleMatRef  = useRef<THREE.MeshBasicMaterial>(null)
  const [tex, setTex] = useState<{ header: BlockTex; subtitle: BlockTex } | null>(null)

  // Rasterise each block to its own texture using the page's Sora / Inter fonts.
  useEffect(() => {
    let cancelled = false
    const root = document.documentElement
    const cssFam = (v: string, fb: string) => getComputedStyle(root).getPropertyValue(v).trim() || fb
    const soraFam  = cssFam('--font-sora-nf', 'sans-serif')
    const interFam = cssFam('--font-inter-nf', 'sans-serif')
    const primary  = (f: string) => f.split(',')[0].trim()
    const hFont = `400 ${headerPx}px ${soraFam}`
    const sFont = `400 ${subtitlePx}px ${interFam}`

    const build = () => {
      if (cancelled) return
      const header   = rasterizeBlock(PHASE4_HEADER, hFont, headerColor, 1.12, depth, depthAngle, sideColor)
      const subtitle = rasterizeBlock(PHASE4_SUBTITLE, sFont, subtitleColor, 1.3, depth, depthAngle, sideColor)
      setTex(prev => { prev?.header.texture.dispose(); prev?.subtitle.texture.dispose(); return { header, subtitle } })
    }

    const fonts = (document as unknown as { fonts?: { load: (s: string) => Promise<unknown>; ready: Promise<unknown> } }).fonts
    if (fonts?.load) {
      Promise.all([
        fonts.load(`400 ${headerPx}px ${primary(soraFam)}`),
        fonts.load(`400 ${subtitlePx}px ${primary(interFam)}`),
      ]).then(() => fonts.ready).then(build).catch(build)
    } else {
      build()
    }
    return () => { cancelled = true }
  }, [headerPx, subtitlePx, headerColor, subtitleColor, depth, depthAngle, sideColor])

  // Keep the projection sphere matched to the globe; drive the fade each frame.
  useFrame(() => {
    if (meshRef.current) meshRef.current.scale.setScalar(scaleRef.current * lift)
    const o = opacityRef.current
    if (headerMatRef.current)   headerMatRef.current.opacity   = o
    if (subtitleMatRef.current) subtitleMatRef.current.opacity = o
  })

  if (!tex) return null
  const hpz = Math.sqrt(Math.max(1e-4, 1 - headerPosY * headerPosY))     // front-surface Z at each latitude
  const spz = Math.sqrt(Math.max(1e-4, 1 - subtitlePosY * subtitlePosY))
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      {/* invisible projection target — the visible globe is rendered by groupRef */}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Decal
        position={[0, headerPosY, hpz]}
        rotation={[0, 0, 0]}
        scale={[headerSize, headerSize * tex.header.aspect, headerSize]}
        map={tex.header.texture}
        polygonOffsetFactor={zPush}
        depthTest={false}
        renderOrder={3}
      >
        <meshBasicMaterial ref={headerMatRef} map={tex.header.texture} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </Decal>
      <Decal
        position={[0, subtitlePosY, spz]}
        rotation={[0, 0, 0]}
        scale={[subtitleSize, subtitleSize * tex.subtitle.aspect, subtitleSize]}
        map={tex.subtitle.texture}
        polygonOffsetFactor={zPush}
        depthTest={false}
        renderOrder={3}
      >
        <meshBasicMaterial ref={subtitleMatRef} map={tex.subtitle.texture} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </Decal>
    </mesh>
  )
}

// ── Globe scene ───────────────────────────────────────────────────────────────
type GlobeSceneProps = {
  detail: number
  scrollProgress: React.MutableRefObject<number>
  scrollProgress2: React.MutableRefObject<number>
  scrollProgress3: React.MutableRefObject<number>
  scrollProgress4: React.MutableRefObject<number>
  sceneZoomRef: React.MutableRefObject<number>
  lineRefs: { current: Line2 | null }[]
  arcPointsRefs: { current: THREE.Vector3[] }[]
  yoyoDotP01Ref: { current: THREE.Mesh | null }
  yoyoDotChainRef: { current: THREE.Mesh | null }
  trailP01Ref: { current: THREE.InstancedMesh | null }
  trailChainRef: { current: THREE.InstancedMesh | null }
  initDotMats: THREE.MeshBasicMaterial[]
  yoyoStartedRef: React.MutableRefObject<boolean>
  yoyoTlRef: React.MutableRefObject<gsap.core.Timeline | null>
}

function GlobeScene({
  detail, scrollProgress, scrollProgress2, scrollProgress3, scrollProgress4,
  sceneZoomRef,
  lineRefs, arcPointsRefs,
  yoyoDotP01Ref, yoyoDotChainRef,
  trailP01Ref, trailChainRef,
  initDotMats,
  yoyoStartedRef, yoyoTlRef,
}: GlobeSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const group2Ref = useRef<THREE.Group>(null)
  const extraRotRef = useRef(0)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const timeRef = useRef(0)
  const scrollDamped = useRef(0)
  const scrollDamped3 = useRef(0)
  const phase4Active    = useRef(false)
  const phase4Sweep     = useRef(0)                 // GSAP-driven angular sweep (deg)
  const phase4FreezeRot = useRef(0)                 // group2 rotation held during phase 4
  const phase4PlanRef   = useRef<Phase4Plan | null>(null)
  const phase4StartLons = useRef<number[]>([])
  const phase4TweenRef  = useRef<gsap.core.Tween | null>(null)
  const phase4PrevSig   = useRef(0)
  const phase4OpacityRef = useRef(0)
  const backLightStrengthRef = useRef(0)
  const globeScaleRef    = useRef(GLOBE_SCALE * INIT_SCALE)  // live world scale, fed to the text decal

  const baseDirs = useMemo(
    () => LATLONS.map(([lat, lon]) => latLonToVec3(lat, lon).normalize()),
    [],
  )

  const particleRefs = useMemo<{ current: THREE.Group | null }[]>(
    () => Array.from({ length: 5 }, () => ({ current: null })),
    [],
  )

  const initDotRefs = useMemo<{ current: THREE.Mesh | null }[]>(
    () => Array.from({ length: 5 }, () => ({ current: null })),
    [],
  )

  const trailP01Mesh = useMemo(() => makeTrailMesh(OVERLAY_COLORS[0]), [])
  const trailChainMesh = useMemo(() => makeTrailMesh(OVERLAY_COLORS[2]), [])

  useEffect(() => {
    trailP01Ref.current = trailP01Mesh
    trailChainRef.current = trailChainMesh
    return () => {
      trailP01Ref.current = null; trailChainRef.current = null
      trailP01Mesh.geometry.dispose(); (trailP01Mesh.material as THREE.MeshBasicMaterial).dispose()
      trailChainMesh.geometry.dispose(); (trailChainMesh.material as THREE.MeshBasicMaterial).dispose()
    }
  }, [trailP01Mesh, trailChainMesh, trailP01Ref, trailChainRef])

  const uniforms = useMemo<Uniforms>(() => ({
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uLineColor: { value: new THREE.Color(LINE_COLOR) },
    uColorA: { value: new THREE.Color(COLOR_A) },
    uColorB: { value: new THREE.Color(COLOR_B) },
    uSpeed: { value: 0.01 },
    uDistortionFrequency: { value: 1.05 },
    uDistortionStrength: { value: 1.96 },
    uDisplacementFrequency: { value: 0.20 },
    uDisplacementStrength: { value: 0.08 },
    uWaveDepth: { value: 1.80 },
    uLevels: { value: 80 },
    uLineWidth: { value: 1.15 },
    uLight1: { value: new THREE.Vector3(0.5, 0.5, 0) },
    uLight2: { value: new THREE.Vector3(-0.5, 0.5, 0) },
    uLight3: { value: new THREE.Vector3(0.5, -0.5, 0) },
    uLight4: { value: new THREE.Vector3(-0.5, -0.5, 0) },
    uBackLight: { value: new THREE.Vector3(0, 0.15, -2.5) },
    uBackLightStrength: { value: 0 },
    uBackLightColor: { value: new THREE.Color('#de91bb') },
    uBackLightRim: { value: 6 },
    uAmbient: { value: 0.12 },
    uGradCore: { value: new THREE.Color('#9b4269') },
    uGradRim: { value: new THREE.Color('#000000') },
    uRadialFocus: { value: 3.35 },
    uPulseStrength: { value: 0.58 },
    uPulseSpeed: { value: 3.10 },
    uPulseMix: { value: 0.36 },
  }), [])

  // ── Hardcoded globe / light values (controls removed, text panel is active) ──
  const ambientRef      = useRef(0.12)
  const pulseStrengthRef = useRef(0.58)
  const pulseSpeedRef   = useRef(3.10)
  const pulseMixRef     = useRef(0.36)
  const radialFocusRef  = useRef(3.35)
  const gradCoreRef     = useRef('#9b4269')
  const gradRimRef      = useRef('#000000')
  const dotSizeInitRef  = useRef(0.018)
  const dotSizeRef      = useRef(0.19)
  const dotRadiusPushRef = useRef(0.18)
  const light1Ref = useRef(new THREE.Vector3(0.5,  0.5,  0))
  const light2Ref = useRef(new THREE.Vector3(-0.5, 0.5,  0))
  const light3Ref = useRef(new THREE.Vector3(0.5,  -0.5, 0))
  const light4Ref = useRef(new THREE.Vector3(-0.5, -0.5, 0))
  const backLightPosRef = useRef(BACK_LIGHT_POS.clone())
  const backLightColorRef = useRef(BACK_LIGHT_COLOR)
  const backLightMaxRef = useRef(BACK_LIGHT_MAX)
  const backLightRimRef = useRef(BACK_LIGHT_RIM)

  // Phase 4 — snapshot dot longitudes, plan slot assignment, sweep anticlockwise.
  const firePhase4 = () => {
    if (!group2Ref.current) return
    const wp = new THREE.Vector3()
    const startLons = particleRefs.map(r => {
      if (!r.current) return 0
      r.current.getWorldPosition(wp)
      return THREE.MathUtils.radToDeg(Math.atan2(wp.x, wp.z))
    })
    phase4StartLons.current = startLons
    phase4PlanRef.current   = phase4Plan(startLons)
    phase4FreezeRot.current = group2Ref.current.rotation.y
    phase4Sweep.current     = 0
    phase4Active.current    = true

    gsap.killTweensOf(phase4OpacityRef)
    gsap.killTweensOf(backLightStrengthRef)
    gsap.killTweensOf(sceneZoomRef)
    phase4OpacityRef.current = 0
    backLightStrengthRef.current = 0
    sceneZoomRef.current     = 1
    phase4TweenRef.current?.kill()
    phase4TweenRef.current = gsap.to(phase4Sweep, {
      current: phase4PlanRef.current.maxTravel,
      duration: phase4PlanRef.current.maxTravel / PHASE4_SPEED_DPS,
      ease: 'sine.inOut',
      onComplete() {
        gsap.to(phase4OpacityRef, {
          current: 1,
          duration: 0.8,
          ease: 'power2.in',
          onComplete() {
            gsap.to(backLightStrengthRef, { current: backLightMaxRef.current, duration: 0.3, ease: 'power2.out' })
          },
        })
        gsap.to(sceneZoomRef, {
          current: 1.1,
          duration: 2.7,
          ease: 'power2.inOut',
        })
      },
    })
  }

  const reversePhase4 = () => {
    gsap.to(phase4OpacityRef, { current: 0, duration: 0.3, ease: 'power2.in', overwrite: true })
    gsap.to(backLightStrengthRef, { current: 0, duration: 0.3, ease: 'power2.in', overwrite: true })
    gsap.to(sceneZoomRef,     { current: 1,   duration: 0.3, ease: 'power2.in', overwrite: true })
    const tw = phase4TweenRef.current
    if (!tw) { phase4Active.current = false; return }
    tw.eventCallback('onReverseComplete', () => {
      phase4Active.current = false
      if (groupRef.current)
        extraRotRef.current = phase4FreezeRot.current - groupRef.current.rotation.y
    })
    tw.reverse()
  }

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.1)
    const u = materialRef.current?.uniforms as Uniforms | undefined
    if (!u || !groupRef.current || !group2Ref.current) return

    const smooth = 1 - Math.pow(1 - 0.05, dt * 60)
    scrollDamped.current += (scrollProgress.current - scrollDamped.current) * smooth
    scrollDamped3.current += (scrollProgress3.current - scrollDamped3.current) * smooth

    timeRef.current += dt
    u.uTime.value = timeRef.current
    u.uProgress.value = scrollDamped.current

    u.uAmbient.value = ambientRef.current
    u.uPulseStrength.value = pulseStrengthRef.current
    u.uPulseSpeed.value = pulseSpeedRef.current
    u.uPulseMix.value = pulseMixRef.current
    u.uRadialFocus.value = radialFocusRef.current
    u.uGradCore.value.set(gradCoreRef.current)
    u.uGradRim.value.set(gradRimRef.current)
    u.uLight1.value.copy(light1Ref.current)
    u.uLight2.value.copy(light2Ref.current)
    u.uLight3.value.copy(light3Ref.current)
    u.uLight4.value.copy(light4Ref.current)

    u.uBackLight.value.copy(backLightPosRef.current)
    u.uBackLightStrength.value = backLightStrengthRef.current
    u.uBackLightColor.value.set(backLightColorRef.current)
    u.uBackLightRim.value = backLightRimRef.current

    const p2 = scrollProgress2.current
    const p3 = scrollDamped3.current
    const p3Raw = scrollProgress3.current

    // Phase 4 enter/leave edge detection (scrollProgress4 is a 0/1 flag)
    const sig = scrollProgress4.current


    const yoyoActive =
      yoyoStartedRef.current &&
      p2 < PHASE1_REST_EPS &&
      p3Raw < PHASE1_REST_EPS &&
      sig <= 0.5
    ;[yoyoDotP01Ref, yoyoDotChainRef].forEach(r => {
      if (r.current) r.current.visible = yoyoActive
    })
    if (trailP01Ref.current) trailP01Ref.current.visible = yoyoActive
    if (trailChainRef.current) trailChainRef.current.visible = yoyoActive
    if (yoyoActive) yoyoTlRef.current?.play()
    else yoyoTlRef.current?.pause()
    if (sig > 0.5 && phase4PrevSig.current <= 0.5) firePhase4()
    else if (sig <= 0.5 && phase4PrevSig.current > 0.5) reversePhase4()
    phase4PrevSig.current = sig

    // Wavy globe: constant base speed only
    groupRef.current.rotation.y += dt * 0.1

    // Dots group: frozen while Phase 4 dots ride to their slots, else Phase 3 spin
    if (phase4Active.current) {
      group2Ref.current.rotation.y = phase4FreezeRot.current
    } else {
      if (p3 > 0) extraRotRef.current += dt * (THREE.MathUtils.lerp(0.1, 0.8, p3) - 0.1)
      group2Ref.current.rotation.y = groupRef.current.rotation.y + extraRotRef.current
    }

    // Both groups scale identically; sceneZoomRef grows 1→1.1 with text + back-light reveal
    const sc = GLOBE_SCALE * (INIT_SCALE + scrollDamped.current * (1 - INIT_SCALE)) * sceneZoomRef.current
    groupRef.current.scale.setScalar(sc)
    group2Ref.current.scale.setScalar(sc)
    globeScaleRef.current = sc
    const group2RotDeg = THREE.MathUtils.radToDeg(group2Ref.current.rotation.y)
    particleRefs.forEach((r, i) => {
      if (!r.current) return
      r.current.scale.setScalar(dotSizeInitRef.current + (dotSizeRef.current - dotSizeInitRef.current) * p2)
      const pos = baseDirs[i].clone().lerp(ROW_TARGETS[i], p3).normalize()
      pos.multiplyScalar(1.0 + Math.max(p2, p3) * dotRadiusPushRef.current)
      if (phase4Active.current && phase4PlanRef.current) {
        // Sweep anticlockwise (in world longitude) until this dot reaches its slot.
        const worldLon = phase4StartLons.current[i] +
          Math.min(phase4Sweep.current, phase4PlanRef.current.travel[i])
        pos.copy(latLonToVec3(0, worldLon - group2RotDeg)).multiplyScalar(PHASE4_RADIUS)
      }
      r.current.position.copy(pos)
    })

    const invGroup2Quat = group2Ref.current.quaternion.clone().invert()
    particleRefs.forEach(r => {
      if (r.current) r.current.quaternion.copy(camera.quaternion).premultiply(invGroup2Quat)
    })
    initDotRefs.forEach(r => {
      if (r.current) r.current.quaternion.copy(camera.quaternion).premultiply(invGroup2Quat)
    })

  })

  return (
    <>
      {/* Wavy globe — groupRef: only the globe shader mesh + depth occluder */}
      <group ref={groupRef} scale={GLOBE_SCALE * INIT_SCALE}>
        <mesh renderOrder={0}>
          <icosahedronGeometry args={[1, detail]} />
          <shaderMaterial
            ref={materialRef}
            vertexShader={VERTEX_SHADER}
            fragmentShader={FRAGMENT_SHADER}
            uniforms={uniforms}
            transparent depthWrite={false} depthTest={false}
          />
        </mesh>

        {/* Depth occluder — same wavy vertex shader + uniforms as the globe so the
            depth values written match the displaced surface exactly, eliminating the
            silhouette gap. colorWrite=false means zero fragment cost. */}
        <mesh renderOrder={1}>
          <icosahedronGeometry args={[1, detail]} />
          <shaderMaterial
            vertexShader={VERTEX_SHADER}
            fragmentShader={`void main() {}`}
            uniforms={uniforms}
            depthWrite={true}
            colorWrite={false}
            side={THREE.FrontSide}
          />
        </mesh>
      </group>

      {/* Dots group — group2Ref: particles, beams, comets, trails */}
      <group ref={group2Ref} scale={GLOBE_SCALE * INIT_SCALE}>
        {baseDirs.map((d, i) => (
          <mesh
            key={`init-${i}`}
            ref={initDotRefs[i] as React.RefObject<THREE.Mesh>}
            position={[d.x, d.y, d.z]}
            scale={PARTICLE_SIZE_INIT}
            renderOrder={2}
          >
            <circleGeometry args={[0.5, 32]} />
            <primitive object={initDotMats[i]} attach="material" />
          </mesh>
        ))}

        <SurfaceParticles baseDirs={baseDirs} particleRefs={particleRefs} revealRef={scrollProgress2} />

        {BEAMS.map(([from, to], i) => (
          <AnimatedBeam
            key={i}
            fromLat={LATLONS[from][0]} fromLon={LATLONS[from][1]}
            toLat={LATLONS[to][0]} toLon={LATLONS[to][1]}
            lineRef={lineRefs[i]}
            arcPointsRef={arcPointsRefs[i]}
          />
        ))}

        <mesh ref={yoyoDotP01Ref as React.RefObject<THREE.Mesh>} visible={false} renderOrder={2}>
          <sphereGeometry args={[OVERLAY_PARTICLE_SIZE, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS]} />
          <meshBasicMaterial color={OVERLAY_COLORS[0]} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={true} transparent opacity={OVERLAY_PARTICLE_OPACITY} />
        </mesh>
        <mesh ref={yoyoDotChainRef as React.RefObject<THREE.Mesh>} visible={false} renderOrder={2}>
          <sphereGeometry args={[OVERLAY_PARTICLE_SIZE, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS]} />
          <meshBasicMaterial color={OVERLAY_COLORS[2]} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={true} transparent opacity={OVERLAY_PARTICLE_OPACITY} />
        </mesh>

        <primitive object={trailP01Mesh} />
        <primitive object={trailChainMesh} />
      </group>

      {/* Phase 4 text — projected onto the sphere surface as a Decal so it follows
          the globe's curvature in every direction (not a flat camera-facing billboard). */}
      <PhaseFourText
        opacityRef={phase4OpacityRef}
        scaleRef={globeScaleRef}
        lift={TEXT_LIFT}
        zPush={TEXT_Z_PUSH}
        headerPx={HEADER_PX}
        headerColor={HEADER_COLOR}
        headerSize={HEADER_SIZE}
        headerPosY={HEADER_POS_Y}
        subtitlePx={SUBTITLE_PX}
        subtitleColor={SUBTITLE_COLOR}
        subtitleSize={SUBTITLE_SIZE}
        subtitlePosY={SUBTITLE_POS_Y}
        depth={TEXT_DEPTH}
        depthAngle={TEXT_DEPTH_ANGLE}
        sideColor={TEXT_SIDE_COLOR}
      />

    </>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────
export interface GlobeProps { className?: string }

export default function Globe({ className }: GlobeProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const detail = isMobile ? DETAIL_MOBILE : DETAIL_DESKTOP

  const containerRef = useRef<HTMLDivElement>(null)

  // Only animate the render loop while the globe is on screen. The scene renders
  // continuously (waves, rotation, bloom) and is expensive — left at r3f's
  // default frameloop="always" it churns the GPU even when scrolled out of view
  // behind Hero, which is what makes the page scroll stutter. An
  // IntersectionObserver flips between "always" (visible) and "demand" (idle).
  //
  // "demand" — not "never" — is deliberate: it renders once at mount so all the
  // shaders compile while off-screen, then sits idle (zero animation frames, no
  // stutter). "never" would defer that compile to the first on-screen frame,
  // producing a one-time hitch exactly when the globe scrolls into view.
  const [frameloop, setFrameloop] = useState<'always' | 'demand'>('demand')

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setFrameloop(entry.isIntersecting ? 'always' : 'demand'),
      { rootMargin: '256px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const scrollProgress = useRef(0)
  const scrollProgress2 = useRef(0)
  const scrollProgress3 = useRef(0)
  const scrollProgress4 = useRef(0)
  const sceneZoomRef = useRef(1)

  const lineRefs = useMemo<{ current: Line2 | null }[]>(
    () => Array.from({ length: 3 }, (): { current: Line2 | null } => ({ current: null })),
    [],
  )
  const arcPointsRefs = useMemo<{ current: THREE.Vector3[] }[]>(
    () => Array.from({ length: 3 }, (): { current: THREE.Vector3[] } => ({ current: [] })),
    [],
  )
  const yoyoDotP01Ref = useMemo<{ current: THREE.Mesh | null }>(() => ({ current: null }), [])
  const yoyoDotChainRef = useMemo<{ current: THREE.Mesh | null }>(() => ({ current: null }), [])
  const trailP01Ref = useMemo<{ current: THREE.InstancedMesh | null }>(() => ({ current: null }), [])
  const trailChainRef = useMemo<{ current: THREE.InstancedMesh | null }>(() => ({ current: null }), [])
  const initDotMats = useMemo(
    () => Array.from({ length: 5 }, () => new THREE.MeshBasicMaterial({
      color: new THREE.Color(PARTICLE_COLOR),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
    })),
    [],
  )

  const yoyoTlRef = useRef<gsap.core.Timeline | null>(null)
  const entranceTlRef = useRef<gsap.core.Timeline | null>(null)
  const yoyoStartedRef = useRef(false)
  const beamsFaded = useRef(false)

  const fadeBeamsAndComets = () => {
    if (beamsFaded.current) return
    beamsFaded.current = true
    yoyoTlRef.current?.pause()
    lineRefs.forEach(r => {
      if (r.current)
        gsap.to(r.current.material as LineMaterial, {
          opacity: 0, duration: BEAM_FADE_DUR, ease: BEAM_FADE_EASE, overwrite: true,
        })
    })
    initDotMats.forEach(mat =>
      gsap.to(mat, { opacity: 0, duration: BEAM_FADE_DUR, ease: BEAM_FADE_EASE, overwrite: true })
    )
  }

  const restoreBeamsAndComets = () => {
    if (!beamsFaded.current) return
    beamsFaded.current = false
    lineRefs.forEach(r => {
      if (r.current)
        gsap.to(r.current.material as LineMaterial, {
          opacity: OVERLAY_LINE_OPACITY, duration: BEAM_FADE_DUR, ease: BEAM_FADE_EASE, overwrite: true,
        })
    })
    initDotMats.forEach(mat =>
      gsap.to(mat, { opacity: 1, duration: BEAM_FADE_DUR, ease: BEAM_FADE_EASE, overwrite: true })
    )
  }

  const resetPhase1bEntrance = () => {
    yoyoStartedRef.current = false
    yoyoTlRef.current?.pause().progress(0)

    if (yoyoDotP01Ref.current) yoyoDotP01Ref.current.visible = false
    if (yoyoDotChainRef.current) yoyoDotChainRef.current.visible = false
    if (trailP01Ref.current) {
      trailP01Ref.current.visible = false
      ;(trailP01Ref.current.material as THREE.MeshBasicMaterial).opacity = 1
    }
    if (trailChainRef.current) {
      trailChainRef.current.visible = false
      ;(trailChainRef.current.material as THREE.MeshBasicMaterial).opacity = 1
    }

    lineRefs.forEach(r => {
      if (!r.current) return
      gsap.killTweensOf(r.current.material as LineMaterial)
      ;(r.current.geometry as THREE.InstancedBufferGeometry).instanceCount = 0
    })
    initDotMats.forEach(mat => {
      gsap.killTweensOf(mat)
      mat.opacity = 0
    })
    beamsFaded.current = false
  }

  useGSAP(() => {
    // Phase 1a — globe grow only
    ScrollTrigger.create({
      id: 'phase-1a',
      trigger: containerRef.current,
      start: 'top top',
      end: PHASE1A_SCROLL_END,
      onEnter:     () => gsap.to(scrollProgress, { current: 1, duration: 0.8, ease: 'power2.out', overwrite: true }),
      onLeaveBack: () => gsap.to(scrollProgress, { current: 0, duration: 0.8, ease: 'power2.out', overwrite: true }),
    })
    ScrollTrigger.create({
      id: 'phase-2',
      trigger: containerRef.current,
      start: PHASE2_SCROLL_START,
      end: scrollOffsetVh(SCROLL_PHASE2_VH),
      onEnter:     () => gsap.to(scrollProgress2, { current: 1, duration: 0.8, ease: 'power2.out', overwrite: true }),
      onLeaveBack: () => gsap.to(scrollProgress2, { current: 0, duration: 0.8, ease: 'power2.out', overwrite: true }),
    })
    ScrollTrigger.create({
      id: 'phase-3',
      trigger: containerRef.current,
      start: scrollOffsetVh(SCROLL_PHASE3_START_VH),
      end: scrollOffsetVh(SCROLL_PHASE3_VH),
      onEnter: () => {
        gsap.to(scrollProgress3, { current: 1, duration: 0.8, ease: 'power2.out', overwrite: true })
        fadeBeamsAndComets()
      },
      onLeaveBack: () => {
        gsap.to(scrollProgress3, { current: 0, duration: 0.8, ease: 'power2.out', overwrite: true })
        restoreBeamsAndComets()
      },
    })
    ScrollTrigger.create({
      id: 'phase-4',
      trigger: containerRef.current,
      start: scrollOffsetVh(SCROLL_PHASE4_START_VH),
      end: scrollOffsetVh(SCROLL_PHASE4_VH),
      onEnter:     () => { scrollProgress4.current = 1 },
      onLeaveBack: () => { scrollProgress4.current = 0 },
    })
  }, { scope: containerRef })

  useEffect(() => {
    let raf = 0

    const build = () => {
      const ready = (
        lineRefs.every(r => r.current) &&
        arcPointsRefs.every(r => r.current.length > 0) &&
        yoyoDotP01Ref.current !== null &&
        yoyoDotChainRef.current !== null &&
        trailP01Ref.current !== null &&
        trailChainRef.current !== null
      )
      if (!ready) { raf = requestAnimationFrame(build); return }

      // ── Compute arc lengths for speed-proportional draw durations ───────
      const beamInfo = BEAMS.map(([from, to]) => {
        const a = latLonToVec3(LATLONS[from][0], LATLONS[from][1])
        const b = latLonToVec3(LATLONS[to][0], LATLONS[to][1])
        const pts = orthodromicArc(a, b, ARC_SEGS, ARC_UNIFORM_HEIGHT)
        let arcLen = 0
        for (let j = 1; j < pts.length; j++) arcLen += pts[j].distanceTo(pts[j - 1])
        return { segCount: pts.length - 1, arcLen, duration: arcLen / BEAM_DRAW_SPEED }
      })

      // Reset
      lineRefs.forEach(r => {
        if (r.current) (r.current.geometry as THREE.InstancedBufferGeometry).instanceCount = 0
      })
      yoyoDotP01Ref.current!.visible = false
      yoyoDotChainRef.current!.visible = false
      trailP01Ref.current!.visible = false
      trailChainRef.current!.visible = false
        ; (trailP01Ref.current!.material as THREE.MeshBasicMaterial).opacity = 1
        ; (trailChainRef.current!.material as THREE.MeshBasicMaterial).opacity = 1
      initDotMats.forEach(mat => { mat.opacity = 0 })

      const p0 = { count: 0 }, p1 = { count: 0 }, p2 = { count: 0 }

      // ── Entrance timeline (phase 1b) ──────────────────────────────────────
      // Fires once on enter — not scrubbed:
      //   1. dots pop in (staggered)
      //   2. beams draw sequentially
      //   3. comets launch at yoyoFwd label
      const tl = gsap.timeline({
        scrollTrigger: {
          id: 'phase-1b',
          trigger: containerRef.current,
          start: ENTRANCE_TRIGGER_START,
          end: ENTRANCE_TRIGGER_END,
          toggleActions: 'play none none none',
          onLeaveBack: () => {
            resetPhase1bEntrance()
            entranceTlRef.current?.pause().progress(0)
          },
        },
      })
      entranceTlRef.current = tl

      // Dots pop in before any beam draws
      tl.to(initDotMats, {
        opacity: 1, duration: DOT_POP_DUR, ease: 'back.out(1.7)', stagger: DOT_POP_STAGGER,
      })

      tl.to(p1, {
        count: beamInfo[1].segCount, duration: beamInfo[1].duration, ease: BEAM_DRAW_EASE,
        onUpdate() {
          if (lineRefs[1].current)
            (lineRefs[1].current.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(p1.count)
        },
      })
      tl.addLabel('yoyoFwd')
      tl.call(() => { yoyoStartedRef.current = true })
      tl.to(p2, {
        count: beamInfo[2].segCount, duration: beamInfo[2].duration, ease: BEAM_DRAW_EASE,
        onUpdate() {
          if (lineRefs[2].current)
            (lineRefs[2].current.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(p2.count)
        },
      })
      tl.to(p0, {
        count: beamInfo[0].segCount, duration: beamInfo[0].duration, ease: BEAM_DRAW_EASE,
        onUpdate() {
          if (lineRefs[0].current)
            (lineRefs[0].current.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(p0.count)
        },
      }, `-=${ENTRANCE_GROUP_OVERLAP}`)
      tl.addLabel('p01BeamDone')

      // ── Yoyo timeline ─────────────────────────────────────────────────────
      const arcLen0 = beamInfo[0].arcLen
      const arcLen1 = beamInfo[1].arcLen
      const arcLen2 = beamInfo[2].arcLen

      const d01 = arcLen0 / YOYO_TRAVEL_SPEED
      const d23 = arcLen1 / YOYO_TRAVEL_SPEED
      const d34 = arcLen2 / YOYO_TRAVEL_SPEED

      const p01FwdOffset = tl.labels.p01BeamDone - tl.labels.yoyoFwd

      const py01 = { t: 0 }, py23 = { t: 0 }, py34 = { t: 0 }
      const state01 = { forward: true }, state23 = { forward: true }, state34 = { forward: true }

      const p01Color = new THREE.Color(OVERLAY_COLORS[0])
      const chainColor = new THREE.Color(OVERLAY_COLORS[2])

      const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

      const updateP01 = () => {
        if (!yoyoDotP01Ref.current || !trailP01Ref.current) return
        const pts = arcPointsRefs[0].current
        if (!pts.length) return
        const idx = clamp(Math.round(py01.t * (pts.length - 1)), 0, pts.length - 1)
        yoyoDotP01Ref.current.position.copy(pts[idx])
        updateTrailMesh(trailP01Ref.current, pts, idx, Math.sin(py01.t * Math.PI) * TRAIL_MAX_LENGTH * arcLen0, state01.forward, p01Color)
      }

      const updateChain23 = () => {
        if (!yoyoDotChainRef.current || !trailChainRef.current) return
        const pts = arcPointsRefs[1].current
        if (!pts.length) return
        const idx = clamp(Math.round(py23.t * (pts.length - 1)), 0, pts.length - 1)
        yoyoDotChainRef.current.position.copy(pts[idx])
        updateTrailMesh(trailChainRef.current, pts, idx, Math.sin(py23.t * Math.PI) * TRAIL_MAX_LENGTH * arcLen1, state23.forward, chainColor)
      }

      const updateChain34 = () => {
        if (!yoyoDotChainRef.current || !trailChainRef.current) return
        const pts = arcPointsRefs[2].current
        if (!pts.length) return
        const idx = clamp(Math.round(py34.t * (pts.length - 1)), 0, pts.length - 1)
        yoyoDotChainRef.current.position.copy(pts[idx])
        updateTrailMesh(trailChainRef.current, pts, idx, Math.sin(py34.t * Math.PI) * TRAIL_MAX_LENGTH * arcLen2, state34.forward, chainColor)
      }

      const cMat = trailChainRef.current!.material as THREE.MeshBasicMaterial
      const resetChainTrail = () => { cMat.opacity = 1 }

      const chainFwdDur = d23 + TRAIL_FADE_DURATION + d34
      const fwdMax = Math.max(chainFwdDur, p01FwdOffset + d01)
      const revStart = fwdMax + YOYO_PAUSE_DURATION
      const chainRevDur = d34 + TRAIL_FADE_DURATION + d23
      const revMax = Math.max(chainRevDur, d01)

      const yoyoTl = gsap.timeline({ repeat: -1, paused: true })
      yoyoTlRef.current = yoyoTl

      yoyoTl.call(() => {
        const pts1 = arcPointsRefs[1].current
        if (pts1.length && yoyoDotChainRef.current) yoyoDotChainRef.current.position.copy(pts1[0])
        resetChainTrail()
      })

      // Forward: chain P2→3, fade, P3→4
      yoyoTl.to(py23, { t: 1, duration: d23, ease: 'none', onStart() { state23.forward = true }, onUpdate: updateChain23 })
      yoyoTl.to(cMat, { opacity: 0, duration: TRAIL_FADE_DURATION })
      yoyoTl.call(() => {
        resetChainTrail()
        const pts2 = arcPointsRefs[2].current
        if (pts2.length && yoyoDotChainRef.current) yoyoDotChainRef.current.position.copy(pts2[0])
      })
      yoyoTl.to(py34, { t: 1, duration: d34, ease: 'none', onStart() { state34.forward = true }, onUpdate: updateChain34 })

      // Forward: P0→1 (overlaps chain)
      yoyoTl.call(() => {
        const pts0 = arcPointsRefs[0].current
        if (pts0.length && yoyoDotP01Ref.current) yoyoDotP01Ref.current.position.copy(pts0[0])
      }, undefined, p01FwdOffset)
      yoyoTl.to(py01, { t: 1, duration: d01, ease: 'none', onStart() { state01.forward = true }, onUpdate: updateP01 }, p01FwdOffset)

      yoyoTl.to({}, { duration: YOYO_PAUSE_DURATION }, fwdMax)

      // Reverse: chain P4→3, fade, P3→2
      yoyoTl.to(py34, { t: 0, duration: d34, ease: 'none', onStart() { state34.forward = false }, onUpdate: updateChain34 }, revStart)
      yoyoTl.to(cMat, { opacity: 0, duration: TRAIL_FADE_DURATION })
      yoyoTl.call(() => {
        resetChainTrail()
        const pts1 = arcPointsRefs[1].current
        if (pts1.length && yoyoDotChainRef.current) yoyoDotChainRef.current.position.copy(pts1[pts1.length - 1])
      })
      yoyoTl.to(py23, { t: 0, duration: d23, ease: 'none', onStart() { state23.forward = false }, onUpdate: updateChain23 })

      // Reverse: P1→0
      yoyoTl.to(py01, { t: 0, duration: d01, ease: 'none', onStart() { state01.forward = false }, onUpdate: updateP01 }, revStart)

      yoyoTl.to({}, { duration: YOYO_PAUSE_DURATION }, revStart + revMax)
    }

    raf = requestAnimationFrame(build)
    return () => {
      cancelAnimationFrame(raf)
      entranceTlRef.current?.scrollTrigger?.kill()
      entranceTlRef.current?.kill()
      entranceTlRef.current = null
      yoyoTlRef.current?.kill()
      yoyoTlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <Canvas
        frameloop={frameloop}
        camera={{ fov: 35, position: [0, 0, 3] as [number, number, number] }}
        dpr={[1, 2] as [number, number]}
        gl={{ antialias: true, alpha: true }}
        flat
      >
        <Suspense fallback={null}>
          <GlobeScene
            detail={detail}
            scrollProgress={scrollProgress}
            scrollProgress2={scrollProgress2}
            scrollProgress3={scrollProgress3}
            scrollProgress4={scrollProgress4}
            sceneZoomRef={sceneZoomRef}
            lineRefs={lineRefs}
            arcPointsRefs={arcPointsRefs}
            yoyoDotP01Ref={yoyoDotP01Ref}
            yoyoDotChainRef={yoyoDotChainRef}
            trailP01Ref={trailP01Ref}
            trailChainRef={trailChainRef}
            initDotMats={initDotMats}
            yoyoStartedRef={yoyoStartedRef}
            yoyoTlRef={yoyoTlRef}
          />
        </Suspense>
        <EffectComposer>
          <Bloom luminanceThreshold={1.0} intensity={0.35} mipmapBlur={!isMobile} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
