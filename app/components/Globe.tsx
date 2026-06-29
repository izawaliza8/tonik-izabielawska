'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Leva, useControls, folder } from 'leva'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger)

const DEBUG = process.env.NODE_ENV !== 'production'
const LINE_COLOR = '#AEAEBC'
const COLOR_A = '#0a0a0f'   // cool grey-black atmosphere
const COLOR_B = '#b3327a'   // warm magenta (wired in later prompts)
const DETAIL_DESKTOP = 48
const DETAIL_MOBILE = 16
const GLOBE_SCALE = 0.82        // full-size fit in fov-35 frame
const INIT_SCALE = 0.8         // starts at 80%, grows to 100% on scroll

const POINT_RADIUS = 1.03
const OVERLAY_COLORS = ['#AEAEBC', '#AEAEBC', '#AEAEBC', '#AEAEBC', '#AEAEBC']
const OVERLAY_BEAM_COLOR = '#6A2137'
const BEAM_LINE_WIDTH = 3             // screen-space px (Line2)
const OVERLAY_DOT_SIZE = 0.025
const OVERLAY_PARTICLE_SIZE = 0.009
const OVERLAY_LINE_OPACITY = 0.65
const BEAM_DRAW_SPEED = 2.2  // world units per second along arc
const BEAM_DRAW_EASE = 'sine.inOut'
const DOT_ENTRANCE_EASE = 'power3.inOut'
const DOT_ENTRANCE_DUR = 0.1   // seconds per dot pop
const ENTRANCE_STEP_DELAY = 0.1   // pause between dot pop and beam draw (and vice versa)
const ENTRANCE_GROUP_OVERLAP = 1.1   // how early Group 2 starts before Group 1 ends
const ENTRANCE_TRIGGER_START = 'top center'
const YOYO_TRAVEL_SPEED = 0.8   // world units per second for particle travel
const YOYO_PAUSE_DURATION = 0.1   // seconds to pause at destination before reversing
const TRAIL_MAX_LENGTH = 0.3   // max trail length as fraction of arc length
const TRAIL_FADE_DURATION = 0.2   // seconds for P3 handoff trail fade
const TRAIL_SPHERE_COUNT = 20    // number of instanced spheres behind each comet dot
const TRAIL_SPHERE_BASE_SIZE = OVERLAY_PARTICLE_SIZE * 1.2 // radius of the nearest (largest) trail sphere
const ARC_SEGS = 64
const OVERLAY_SPHERE_SEGS = 8
const DOT_SPHERE_SEGS = 48   // grown dots are large — keep them smooth/round
const OVERLAY_DOT_OPACITY = 1
const OVERLAY_PARTICLE_OPACITY = 1
const DEFAULT_LATLONS: [number, number][] = [
  [1, -45],
  [-20, 21],
  [64, -140],
  [30, 23],
  [-21, -32],
]
const DEFAULT_BEAMS: [number, number][] = [[0, 1], [2, 3], [3, 4]]

// ── Grow phase (second scroll trigger) ──────────────────────────────────────
const GLOBE_GROW_FACTOR    = 1.1         // globe scale multiplier at ST2 end
const DOT_GROWN_SCALE      = 3.6         // dot mesh local scale at ST2 end (grows from 1)
const DOT_LEAVEBACK_FACTOR = 0.8         // dot scale = GROWN × this on section leaveBack
const BEAM_FADE_DUR        = 0.4         // seconds — beam + comet opacity fade when ST2 first fires
const BEAM_FADE_EASE       = 'sine.out'
const DOT_GROW_DUR         = 0.8         // seconds — time-based dot/globe grow on ST2 enter
const DOT_GROW_EASE        = 'sine.in'
const GROW_RESET_DUR       = 0.5         // seconds — leaveBack dot/globe reset tween
const GROW_RESET_EASE      = 'sine.in'
const ST2_START            = 'top+=40% top'   // immediately after ST1 ends
const ST2_END              = 'top+=140% top'  // 100 vh later
// ── Line sweep phase (third scroll trigger) ─────────────────────────────────
const GLOBE_GROW_FACTOR_ST3 = 1.18
const ST3_START              = 'top+=140% top'
const ST3_END                = 'top+=240% top'
const ST3_ORDER              = [2, 3, 1, 4, 0] as const  // slot → dot index
const DOT_LINE_Y             = -0.22
const DOT_LINE_XS            = [-0.38, -0.19, 0.0, 0.19, 0.38] as const
const ST3_WINDOWS = [
  [0.00, 0.28],
  [0.18, 0.46],
  [0.36, 0.64],
  [0.54, 0.82],
  [0.72, 1.00],
] as const
// Per-slot ctrl1 launch offsets (relative to start): kick dot forward + unique XY direction
const ST3_CTRL1_OFFSETS: [number, number, number][] = [
  [ 0.3,  0.9, 1.4],  // P2 — up-right burst
  [-0.6,  0.4, 1.6],  // P3 — left-up burst
  [ 0.7, -0.5, 1.2],  // P1 — right-down burst
  [-0.4, -0.8, 1.5],  // P4 — left-down burst
  [ 0.1,  0.6, 1.3],  // P0 — slight right-up burst
]
// Per-slot ctrl2 approach offsets (relative to end): shallow landing angle
const ST3_CTRL2_OFFSETS: [number, number, number][] = [
  [-0.2,  0.4, 0.5],  // P2
  [ 0.3,  0.3, 0.4],  // P3
  [-0.3, -0.4, 0.6],  // P1
  [ 0.4, -0.3, 0.3],  // P4
  [-0.1,  0.5, 0.4],  // P0
]
// Per-dot grow anchor (screen-space transform-origin equivalent), in dot-radius units.
// [x, y]: x = +right / -left, y = +up / -down. The dot grows away from this fixed edge,
// so at full scale its centre sits opposite the anchor (the natural centre stays at scale 1).
const DOT_GROW_ANCHORS: [number, number][] = [
  [-1, 0],   // P0 — left center
  [0, 0],    // P1 — center center (symmetric)
  [0, 1],    // P2 — top center
  [1, 1],    // P3 — top right
  [-1, -1],  // P4 — bottom left
]
// Opaque pink glaze — applied to dots only once the ST2 grow starts.
const DOT_GLAZE = {
  color: '#e080a8',
  emissive: '#8a8088',
  emissiveIntensity: 0.18,
  metalness: 0.05,
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.3,
}
// Light layer shared by the front fill and grown dot meshes (globe/comets stay unlit).
const DOT_LIGHT_LAYER = 0

export interface GlobeProps { className?: string }

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

function beamCurve(
  a: THREE.Vector3,
  b: THREE.Vector3,
  segs = 64,
  height = 0,
  bias = 0.5,
): THREE.Vector3[] {
  const mid = a.clone().lerp(b, bias)
  const ab = b.clone().sub(a)
  const perp = new THREE.Vector3(-ab.y, ab.x, 0).normalize()
  const ctrl = mid.clone().addScaledVector(perp, height)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const t1 = 1 - t
    pts.push(new THREE.Vector3(
      t1 * t1 * a.x + 2 * t1 * t * ctrl.x + t * t * b.x,
      t1 * t1 * a.y + 2 * t1 * t * ctrl.y + t * t * b.y,
      t1 * t1 * a.z + 2 * t1 * t * ctrl.z + t * t * b.z,
    ))
  }
  return pts
}

// Module-level scratch objects reused every frame to avoid GC pressure
const _trailDummy = new THREE.Object3D()
const _trailCol = new THREE.Color()

function makeTrailMesh(color: string): THREE.InstancedMesh {
  const geo = new THREE.SphereGeometry(1, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, TRAIL_SPHERE_COUNT)
  mesh.renderOrder = 2
  mesh.visible = true
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

// Walk backwards along arc from fromIdx until targetDist world-units have been covered.
// "backward" direction depends on direction of travel (forward flag).
function walkBackArc(
  pts: THREE.Vector3[],
  fromIdx: number,
  targetDist: number,
  forward: boolean,
): THREE.Vector3 {
  let dist = 0
  let i = fromIdx
  while (true) {
    const next = forward ? i - 1 : i + 1
    if (next < 0 || next >= pts.length) break
    const d = pts[i].distanceTo(pts[next])
    if (dist + d >= targetDist) {
      return pts[i].clone().lerp(pts[next], (targetDist - dist) / d)
    }
    dist += d
    i = next
  }
  return pts[forward ? 0 : pts.length - 1].clone()
}

function updateTrailMesh(
  mesh: THREE.InstancedMesh,
  pts: THREE.Vector3[],
  dotIdx: number,
  trailWorldLen: number,
  forward: boolean,
  baseColor: THREE.Color,
) {
  if (trailWorldLen <= 0) {
    _trailDummy.scale.setScalar(0)
    _trailDummy.position.set(0, 0, 0)
    _trailDummy.updateMatrix()
    for (let i = 0; i < TRAIL_SPHERE_COUNT; i++) mesh.setMatrixAt(i, _trailDummy.matrix)
    mesh.instanceMatrix.needsUpdate = true
    return
  }
  const spacing = trailWorldLen / TRAIL_SPHERE_COUNT
  for (let i = 0; i < TRAIL_SPHERE_COUNT; i++) {
    const t = i / TRAIL_SPHERE_COUNT        // 0 = nearest dot, approaches 1 = tail
    const q = (1 - t) * (1 - t)            // quadratic falloff
    const pos = walkBackArc(pts, dotIdx, (i + 1) * spacing, forward)
    _trailDummy.position.copy(pos)
    _trailDummy.scale.setScalar(TRAIL_SPHERE_BASE_SIZE * q)
    _trailDummy.updateMatrix()
    mesh.setMatrixAt(i, _trailDummy.matrix)
    _trailCol.copy(baseColor).multiplyScalar(q)  // brightness encodes opacity for additive blend
    mesh.setColorAt(i, _trailCol)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function dotLineTarget(slotIndex: number): THREE.Vector3 {
  const x = DOT_LINE_XS[slotIndex]
  const y = DOT_LINE_Y
  const z = Math.sqrt(Math.max(0, POINT_RADIUS * POINT_RADIUS - x * x - y * y))
  return new THREE.Vector3(x, y, z)
}

function cubicBezier(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  const u = 1 - t
  return new THREE.Vector3(
    u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    u*u*u*p0.z + 3*u*u*t*p1.z + 3*u*t*t*p2.z + t*t*t*p3.z,
  )
}

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
  uAmbient: { value: number }
  uGradCore: { value: THREE.Color }
  uGradRim: { value: THREE.Color }
  uRadialFocus: { value: number }
  uPulseStrength: { value: number }
  uPulseSpeed: { value: number }
  uPulseMix: { value: number }
}

// Ashima 3-D simplex noise — no uniforms, safe to inject into both stages
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

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

// Shared wave-field uniforms + three helper functions
const FIELD = /* glsl */`
uniform float uTime;
uniform float uSpeed;
uniform float uDistortionFrequency;
uniform float uDistortionStrength;
uniform float uDisplacementFrequency;
uniform float uDisplacementStrength;
uniform float uWaveDepth;

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 2; i++) {
    sum += amp * snoise(p);
    p   *= 2.0;
    amp *= 0.5;
  }
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

  vec3 ref = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1  = normalize(cross(dir, ref));
  vec3 t2  = normalize(cross(dir, t1));
  vec3 pA  = displacedPos(dir + t1 * 0.01);
  vec3 pB  = displacedPos(dir + t2 * 0.01);
  vec3 nrm = normalize(cross(pA - pos, pB - pos));
  if (dot(nrm, dir) < 0.0) nrm = -nrm;

  vNormal     = normalize(mat3(modelMatrix) * nrm);
  vWorldPos   = (modelMatrix * vec4(pos, 1.0)).xyz;
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
uniform vec3  uLight1;
uniform vec3  uLight2;
uniform vec3  uLight3;
uniform vec3  uLight4;
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

  vec3  N     = normalize(vNormal);
  vec3  V     = normalize(cameraPosition - vWorldPos);
  float diff  = clamp(
    max(dot(N, normalize(uLight1 - vWorldPos)), 0.0) +
    max(dot(N, normalize(uLight2 - vWorldPos)), 0.0) +
    max(dot(N, normalize(uLight3 - vWorldPos)), 0.0) +
    max(dot(N, normalize(uLight4 - vWorldPos)), 0.0),
    0.0, 1.0
  );
  float shade = uAmbient + (1.0 - uAmbient) * diff;

  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);

  float radial = max(dot(N, V), 0.0);
  float center = pow(radial, uRadialFocus);
  float pulse  = 0.5 + 0.5 * sin(uTime * uPulseSpeed);
  vec3  radCol = mix(uGradRim, uGradCore, center);
  float radStr = uPulseStrength * ((1.0 - uPulseMix) + uPulseMix * pulse) * center * uProgress;

  vec3 lineCol = uLineColor * shade * (1.0 + fres * 0.8);

  vec3  col   = lineCol * line + radCol * radStr;
  float alpha = line * mix(0.85, 1.0, fres) + radStr;
  gl_FragColor = vec4(col, alpha);
}
`

type AnimatedBeamProps = {
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
  color: string
  arcHeight: number
  apexBias: number
  lineRef: { current: Line2 | null }
  arcPointsRef: { current: THREE.Vector3[] }
}

function AnimatedBeam({ fromLat, fromLon, toLat, toLon, color, arcHeight, apexBias, lineRef, arcPointsRef }: AnimatedBeamProps) {
  const { size } = useThree()

  const { line, arcPoints } = useMemo(() => {
    const a = latLonToVec3(fromLat, fromLon, POINT_RADIUS)
    const b = latLonToVec3(toLat, toLon, POINT_RADIUS)
    const pts = beamCurve(a, b, ARC_SEGS, arcHeight, apexBias)
    const positions: number[] = []
    pts.forEach(p => positions.push(p.x, p.y, p.z))
    const geo = new LineGeometry()
    geo.setPositions(positions)
    geo.instanceCount = 0
    const mat = new LineMaterial({
      color,
      linewidth: BEAM_LINE_WIDTH,
      transparent: true,
      opacity: OVERLAY_LINE_OPACITY,
      depthWrite: false,
      depthTest: false,
      worldUnits: false,
      dashed: false,
    })
    const line = new Line2(geo, mat)
    line.renderOrder = 1
    return { line, arcPoints: pts }
  }, [fromLat, fromLon, toLat, toLon, color, arcHeight, apexBias])

  useEffect(() => {
    lineRef.current = line
    arcPointsRef.current = arcPoints
    return () => {
      lineRef.current = null
      arcPointsRef.current = []
      line.geometry.dispose()
        ; (line.material as LineMaterial).dispose()
    }
  }, [line, lineRef, arcPoints, arcPointsRef])

  useEffect(() => {
    ; (line.material as LineMaterial).resolution.set(size.width, size.height)
  }, [size, line])

  return <primitive object={line} />
}

type GlobePointsProps = {
  latlons: [number, number][]
  beamHeights: number[]
  apexBiases: number[]
  dotRefs: { current: THREE.Group | null }[]
  lineRefs: { current: Line2 | null }[]
  arcPointsRefs: { current: THREE.Vector3[] }[]
  dotsGlass: boolean
}

function GlobePoints({ latlons, beamHeights, apexBiases, dotRefs, lineRefs, arcPointsRefs, dotsGlass }: GlobePointsProps) {
  return (
    <>
      {latlons.map(([lat, lon], i) => {
        // Anchored growth: the wrapper group sits at the fixed anchor edge and
        // the sphere is offset back so its centre rests on the globe point at
        // scale 1. Scaling the group then grows the dot away from that edge —
        // the 3D equivalent of CSS transform-origin.
        const [ax, ay] = DOT_GROW_ANCHORS[i] ?? [0, 0]
        const ex = ax * OVERLAY_DOT_SIZE
        const ey = ay * OVERLAY_DOT_SIZE
        const base = latLonToVec3(lat, lon, POINT_RADIUS)
        return (
          <group
            key={i}
            ref={dotRefs[i] as React.RefObject<THREE.Group>}
            scale={0}
            position={[base.x + ex, base.y + ey, base.z]}
          >
            <mesh
              position={[-ex, -ey, 0]}
              renderOrder={dotsGlass ? 10 : 2}
              layers={dotsGlass ? DOT_LIGHT_LAYER : 0}
            >
              <sphereGeometry args={[OVERLAY_DOT_SIZE, DOT_SPHERE_SEGS, DOT_SPHERE_SEGS]} />
              {dotsGlass ? (
                // Pink glaze — transparent pass + high renderOrder so dots draw over the globe mesh.
                <meshPhysicalMaterial
                  color={DOT_GLAZE.color}
                  emissive={DOT_GLAZE.emissive}
                  emissiveIntensity={DOT_GLAZE.emissiveIntensity}
                  metalness={DOT_GLAZE.metalness}
                  roughness={DOT_GLAZE.roughness}
                  clearcoat={DOT_GLAZE.clearcoat}
                  clearcoatRoughness={DOT_GLAZE.clearcoatRoughness}
                  transparent
                  opacity={1}
                  depthTest={false}
                  depthWrite={false}
                />
              ) : (
                <meshBasicMaterial
                  color={OVERLAY_COLORS[i]}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                  depthTest={false}
                  transparent
                  opacity={OVERLAY_DOT_OPACITY}
                />
              )}
            </mesh>
          </group>
        )
      })}
      {DEFAULT_BEAMS.map(([from, to], i) => (
        <AnimatedBeam
          key={i}
          fromLat={latlons[from][0]}
          fromLon={latlons[from][1]}
          toLat={latlons[to][0]}
          toLon={latlons[to][1]}
          color={OVERLAY_BEAM_COLOR}
          arcHeight={beamHeights[i]}
          apexBias={apexBiases[i]}
          lineRef={lineRefs[i]}
          arcPointsRef={arcPointsRefs[i]}
        />
      ))}
    </>
  )
}

type GlobeSceneProps = {
  detail: number
  scrollProgress: { current: number }
  latlons: [number, number][]
  beamHeights: number[]
  apexBiases: number[]
  dotRefs: { current: THREE.Group | null }[]
  lineRefs: { current: Line2 | null }[]
  arcPointsRefs: { current: THREE.Vector3[] }[]
  yoyoDotP01Ref: { current: THREE.Mesh | null }
  yoyoDotChainRef: { current: THREE.Mesh | null }
  trailP01Ref: { current: THREE.InstancedMesh | null }
  trailChainRef: { current: THREE.InstancedMesh | null }
  globeGrowRef: { current: number }
  st3ProgressRef: { current: number }
  dotsGlass: boolean
}

function GlobeScene({ detail, scrollProgress, latlons, beamHeights, apexBiases, dotRefs, lineRefs, arcPointsRefs, yoyoDotP01Ref, yoyoDotChainRef, trailP01Ref, trailChainRef, globeGrowRef, st3ProgressRef, dotsGlass }: GlobeSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const scrollDamped = useRef(0)
  const overlayRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  // Glazed dots live on DOT_LIGHT_LAYER — enable it on the camera while they are active.
  useEffect(() => {
    if (dotsGlass) camera.layers.enable(DOT_LIGHT_LAYER)
    else camera.layers.disable(DOT_LIGHT_LAYER)
  }, [dotsGlass, camera])

  const trailP01Mesh = useMemo(() => makeTrailMesh(OVERLAY_COLORS[0]), [])
  const trailChainMesh = useMemo(() => makeTrailMesh(OVERLAY_COLORS[2]), [])

  const dotStarts = useMemo(
    () => latlons.map(([lat, lon]) => latLonToVec3(lat, lon, POINT_RADIUS)),
    [latlons],
  )
  const dotTargets = useMemo(
    () => ST3_ORDER.map((_, slotIdx) => dotLineTarget(slotIdx)),
    [],
  )

  useEffect(() => {
    trailP01Ref.current = trailP01Mesh
    trailChainRef.current = trailChainMesh
    return () => {
      trailP01Ref.current = null
      trailChainRef.current = null
      trailP01Mesh.geometry.dispose()
        ; (trailP01Mesh.material as THREE.MeshBasicMaterial).dispose()
      trailChainMesh.geometry.dispose()
        ; (trailChainMesh.material as THREE.MeshBasicMaterial).dispose()
    }
  }, [trailP01Mesh, trailChainMesh, trailP01Ref, trailChainRef])

  const c = useControls('Globe', {
    speed: { value: 0.01, min: 0, max: 1, step: 0.01 },
    distortionFrequency: { value: 1.05, min: 0, max: 5, step: 0.05 },
    distortionStrength: { value: 1.96, min: 0, max: 2, step: 0.01 },
    displacementFrequency: { value: 0.20, min: 0.2, max: 5, step: 0.05 },
    displacement: { value: 0.08, min: 0, max: 0.6, step: 0.005 },
    waveDepth: { value: 1.80, min: 1, max: 4, step: 0.05 },
    levels: { value: 80, min: 4, max: 100, step: 1 },
    lineWidth: { value: 1.15, min: 0.4, max: 3, step: 0.05 },
    light1: { value: [0.5, 0.5, 0] as [number, number, number], step: 0.1 },
    light2: { value: [-0.5, 0.5, 0] as [number, number, number], step: 0.1 },
    light3: { value: [0.5, -0.5, 0] as [number, number, number], step: 0.1 },
    light4: { value: [-0.5, -0.5, 0] as [number, number, number], step: 0.1 },
    ambient: { value: 0.12, min: 0, max: 1, step: 0.01 },
    glow: folder({
      gradCore: { value: '#9b4269' },
      gradRim: { value: '#000000' },
      radialFocus: { value: 3.35, min: 0.1, max: 8, step: 0.05 },
      pulseStrength: { value: 0.58, min: 0, max: 1, step: 0.005 },
      pulseSpeed: { value: 3.10, min: 0, max: 4, step: 0.05 },
      pulseMix: { value: 0.36, min: 0, max: 1, step: 0.01 },
    }, { collapsed: true }),
  })

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
    uAmbient: { value: 0.12 },
    uGradCore: { value: new THREE.Color('#9b4269') },
    uGradRim: { value: new THREE.Color('#000000') },
    uRadialFocus: { value: 3.35 },
    uPulseStrength: { value: 0.58 },
    uPulseSpeed: { value: 3.10 },
    uPulseMix: { value: 0.36 },
  }), [])

  useFrame((_, delta) => {
    const u = materialRef.current?.uniforms as Uniforms | undefined
    if (!u || !groupRef.current) return
    const dt = Math.min(delta, 0.1)
    const smooth = 1 - Math.pow(1 - 0.05, dt * 60)
    scrollDamped.current += (scrollProgress.current - scrollDamped.current) * smooth
    const s = scrollDamped.current

    u.uTime.value += dt
    u.uSpeed.value = c.speed
    u.uDistortionFrequency.value = c.distortionFrequency
    u.uDistortionStrength.value = c.distortionStrength
    u.uDisplacementFrequency.value = c.displacementFrequency
    u.uDisplacementStrength.value = c.displacement
    u.uWaveDepth.value = c.waveDepth
    u.uLevels.value = c.levels
    u.uLineWidth.value = c.lineWidth
    u.uLight1.value.set(c.light1[0], c.light1[1], c.light1[2])
    u.uLight2.value.set(c.light2[0], c.light2[1], c.light2[2])
    u.uLight3.value.set(c.light3[0], c.light3[1], c.light3[2])
    u.uLight4.value.set(c.light4[0], c.light4[1], c.light4[2])
    u.uAmbient.value = c.ambient
    u.uProgress.value = s
    u.uGradCore.value.set(c.gradCore)
    u.uGradRim.value.set(c.gradRim)
    u.uRadialFocus.value = c.radialFocus
    u.uPulseStrength.value = c.pulseStrength
    u.uPulseSpeed.value = c.pulseSpeed
    u.uPulseMix.value = c.pulseMix
    groupRef.current.rotation.y += dt * 0.06

    const st3p = st3ProgressRef.current

    // 1. Globe extra grow — write before scale is consumed this frame
    if (st3p > 0) {
      globeGrowRef.current = GLOBE_GROW_FACTOR +
        (GLOBE_GROW_FACTOR_ST3 - GLOBE_GROW_FACTOR) * st3p
    }

    // 2. Scale (reads the just-updated globeGrowRef)
    const sc = GLOBE_SCALE * (INIT_SCALE + s * (1 - INIT_SCALE)) * globeGrowRef.current
    groupRef.current.scale.setScalar(sc)
    if (overlayRef.current) overlayRef.current.scale.setScalar(sc)

    // 3. Particle flight positions
    ST3_ORDER.forEach((dotIdx, seqIdx) => {
      const ref = dotRefs[dotIdx]
      if (!ref.current) return
      const [wStart, wEnd] = ST3_WINDOWS[seqIdx]
      const tRaw = Math.max(0, Math.min(1, (st3p - wStart) / (wEnd - wStart)))
      const t = tRaw * tRaw * (3 - 2 * tRaw)
      const start = dotStarts[dotIdx]
      const end   = dotTargets[seqIdx]
      const [c1x, c1y, c1z] = ST3_CTRL1_OFFSETS[seqIdx]
      const [c2x, c2y, c2z] = ST3_CTRL2_OFFSETS[seqIdx]
      const ctrl1 = start.clone().add(new THREE.Vector3(c1x, c1y, c1z))
      const ctrl2 = end.clone().add(new THREE.Vector3(c2x, c2y, c2z))
      ref.current.position.copy(cubicBezier(start, ctrl1, ctrl2, end, t))
    })
  })

  return (
    <>
      {/* Front fill for grown dots only (layer 1). Globe/comets are unlit basic/shader mats. */}
      {/* {dotsGlass && (
        <spotLight
          position={[0, 0.15, 3.25]}
          angle={1.4}
          penumbra={0.95}
          intensity={6}
          distance={10}
          decay={1}
          layers={DOT_LIGHT_LAYER}
        />
      )} */}
      <group ref={groupRef} scale={GLOBE_SCALE * INIT_SCALE}>
        <mesh renderOrder={0}>
          <icosahedronGeometry args={[1, detail]} />
          <shaderMaterial
            ref={materialRef}
            vertexShader={VERTEX_SHADER}
            fragmentShader={FRAGMENT_SHADER}
            uniforms={uniforms}
            transparent
            depthWrite={false}
          />
        </mesh>
      </group>
      <group ref={overlayRef} scale={GLOBE_SCALE * INIT_SCALE}>
        <GlobePoints latlons={latlons} beamHeights={beamHeights} apexBiases={apexBiases} dotRefs={dotRefs} lineRefs={lineRefs} arcPointsRefs={arcPointsRefs} dotsGlass={dotsGlass} />
        <primitive object={trailP01Mesh} />
        <primitive object={trailChainMesh} />
        <mesh ref={yoyoDotP01Ref as React.RefObject<THREE.Mesh>} visible={false} renderOrder={2}>
          <sphereGeometry args={[OVERLAY_PARTICLE_SIZE, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS]} />
          <meshBasicMaterial color={OVERLAY_COLORS[0]} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} transparent opacity={OVERLAY_PARTICLE_OPACITY} />
        </mesh>
        <mesh ref={yoyoDotChainRef as React.RefObject<THREE.Mesh>} visible={false} renderOrder={2}>
          <sphereGeometry args={[OVERLAY_PARTICLE_SIZE, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS]} />
          <meshBasicMaterial color={OVERLAY_COLORS[2]} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} transparent opacity={OVERLAY_PARTICLE_OPACITY} />
        </mesh>
      </group>
    </>
  )
}

export default function Globe({ className }: GlobeProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const detail = isMobile ? DETAIL_MOBILE : DETAIL_DESKTOP
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollProgress = useRef(0)
  const dotRefs = useMemo<{ current: THREE.Group | null }[]>(
    () => Array.from({ length: 5 }, (): { current: THREE.Group | null } => ({ current: null })),
    []
  )
  const lineRefs = useMemo<{ current: Line2 | null }[]>(
    () => Array.from({ length: 3 }, (): { current: Line2 | null } => ({ current: null })),
    []
  )
  const arcPointsRefs = useMemo<{ current: THREE.Vector3[] }[]>(
    () => Array.from({ length: 3 }, (): { current: THREE.Vector3[] } => ({ current: [] })),
    []
  )
  const yoyoDotP01Ref = useMemo<{ current: THREE.Mesh | null }>(() => ({ current: null }), [])
  const yoyoDotChainRef = useMemo<{ current: THREE.Mesh | null }>(() => ({ current: null }), [])
  const trailP01Ref = useMemo<{ current: THREE.InstancedMesh | null }>(() => ({ current: null }), [])
  const trailChainRef = useMemo<{ current: THREE.InstancedMesh | null }>(() => ({ current: null }), [])
  const [pointLatlons, setPointLatlons] = useState<[number, number][]>(DEFAULT_LATLONS)
  const [beamHeights, setBeamHeights] = useState<number[]>([0.5, 0.33, -0.5])
  const [apexBiases, setApexBiases] = useState<number[]>([0.56, 0.25, 0.6])

  const [animBeamSpeed, setAnimBeamSpeed] = useState(BEAM_DRAW_SPEED)
  const [animBeamEase, setAnimBeamEase] = useState(BEAM_DRAW_EASE)
  const [animDotDur, setAnimDotDur] = useState(DOT_ENTRANCE_DUR)
  const [animDotEase, setAnimDotEase] = useState(DOT_ENTRANCE_EASE)
  const [animStepDelay, setAnimStepDelay] = useState(ENTRANCE_STEP_DELAY)
  const [animGroupOverlap, setAnimGroupOverlap] = useState(ENTRANCE_GROUP_OVERLAP)
  const [animArcSegs, setAnimArcSegs] = useState(ARC_SEGS)
  const [animPointRadius, setAnimPointRadius] = useState(POINT_RADIUS)
  const [animDotsColor, setAnimDotsColor] = useState('#AEAEBC')
  const [animBeamsColor, setAnimBeamsColor] = useState('#6A2137')
  const [animDotSize, setAnimDotSize] = useState(OVERLAY_DOT_SIZE)
  const [animParticleSize, setAnimParticleSize] = useState(OVERLAY_PARTICLE_SIZE)
  const [animLineOpacity, setAnimLineOpacity] = useState(OVERLAY_LINE_OPACITY)
  const [animDotOpacity, setAnimDotOpacity] = useState(OVERLAY_DOT_OPACITY)
  const [animParticleOpacity, setAnimParticleOpacity] = useState(OVERLAY_PARTICLE_OPACITY)
  const [animSphereSegs, setAnimSphereSegs] = useState(OVERLAY_SPHERE_SEGS)

  // ── Grow phase refs ──────────────────────────────────────────────────────
  const globeGrowRef    = useRef(1)
  const st3ProgressRef  = useRef(0)
  const dotScaleRef     = useRef(1)            // current local scale of the dot meshes (1 = entrance size)
  const dotsGrown    = useRef(false)        // true once the ST2 grow has fired (one-way until leaveBack)
  const beamsFaded   = useRef(false)
  const tlRef        = useRef<gsap.core.Timeline | null>(null)
  const yoyoTlRef    = useRef<gsap.core.Timeline | null>(null)
  // Glaze material swaps in only once the ST2 grow begins (basic additive before that).
  const [dotsGlass, setDotsGlass] = useState(false)

  useGSAP(() => {
    // ST1: globe intro scale (0 → 1) ─────────────────────────────────────
    ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top top',
      end: '+=40%',
      markers: DEBUG,
      onUpdate: (self) => { scrollProgress.current = self.progress },
      onLeaveBack: () => {
        if (!dotsGrown.current) return
        // Reset back above the section: dots ease to a partly-grown rest size and
        // the globe returns to ×1.0, so re-entering ST2 grows from here.
        gsap.killTweensOf(dotScaleRef)
        gsap.killTweensOf(globeGrowRef)
        gsap.to(dotScaleRef, {
          current: DOT_LEAVEBACK_FACTOR * DOT_GROWN_SCALE,
          duration: GROW_RESET_DUR,
          ease: GROW_RESET_EASE,
          onUpdate: () => {
            dotRefs.forEach(r => { if (r.current) r.current.scale.setScalar(dotScaleRef.current) })
          },
        })
        gsap.to(globeGrowRef, { current: 1.0, duration: GROW_RESET_DUR, ease: GROW_RESET_EASE })
        dotsGrown.current = false
      },
    })

    // ST2: dot grow (in-canvas meshes) + globe grow — time-based on enter ──────
    ScrollTrigger.create({
      trigger: containerRef.current,
      start: ST2_START,
      end:   ST2_END,
      markers: DEBUG,
      onEnter: () => {
        if (dotsGrown.current) return  // one-way until ST1 leaveBack resets it
        dotsGrown.current = true
        setDotsGlass(true)  // swap dots to pink glaze exactly as the grow begins

        // First-ever fire: kill the entrance/yoyo timeline and fade the beams + comets.
        if (!beamsFaded.current) {
          tlRef.current?.kill()
          yoyoTlRef.current?.kill()
          lineRefs.forEach(r => {
            if (r.current)
              gsap.to(r.current.material as LineMaterial, {
                opacity: 0, duration: BEAM_FADE_DUR, ease: BEAM_FADE_EASE,
              })
          })
          ;[yoyoDotP01Ref, yoyoDotChainRef].forEach(r => {
            if (r.current)
              gsap.to(r.current.material as THREE.MeshBasicMaterial, {
                opacity: 0, duration: BEAM_FADE_DUR, ease: BEAM_FADE_EASE,
              })
          })
          ;[trailP01Ref, trailChainRef].forEach(r => {
            if (r.current)
              gsap.to(r.current.material as THREE.MeshBasicMaterial, {
                opacity: 0, duration: BEAM_FADE_DUR, ease: BEAM_FADE_EASE,
              })
          })
          beamsFaded.current = true
        }

        // Smooth, time-based grow: dots scale up from their current size to the
        // grown target while the globe eases from ×1.0 to GLOBE_GROW_FACTOR.
        gsap.killTweensOf(dotScaleRef)
        gsap.killTweensOf(globeGrowRef)
        const startDot   = dotScaleRef.current
        const startGlobe = globeGrowRef.current
        const proxy = { t: 0 }
        gsap.to(proxy, {
          t: 1,
          duration: DOT_GROW_DUR,
          ease: DOT_GROW_EASE,
          onUpdate: () => {
            const t = proxy.t
            dotScaleRef.current  = startDot + (DOT_GROWN_SCALE - startDot) * t
            globeGrowRef.current = startGlobe + (GLOBE_GROW_FACTOR - startGlobe) * t
            dotRefs.forEach(r => { if (r.current) r.current.scale.setScalar(dotScaleRef.current) })
          },
        })
      },
    })

    // ST3: scrub — dot flight to horizontal line + globe 1.1 → 1.18
    ScrollTrigger.create({
      trigger: containerRef.current,
      start: ST3_START,
      end:   ST3_END,
      scrub: true,
      markers: DEBUG,
      onUpdate: (self) => { st3ProgressRef.current = self.progress },
    })
  }, { scope: containerRef })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let raf = 0
    let tl:     gsap.core.Timeline | null = null
    let yoyoTl: gsap.core.Timeline | null = null

    // <Canvas> renders its scene graph in a separate reconciler and only after it
    // has measured a non-zero size, so dotRefs/lineRefs are still null when this
    // effect first runs. Poll until R3F has populated them, then build the timeline
    // (the non-null assertions below are only reached once every ref is set).
    const build = () => {
      const ready = (
        dotRefs.every(r => r.current) &&
        lineRefs.every(r => r.current) &&
        arcPointsRefs.every(r => r.current.length > 0) &&
        yoyoDotP01Ref.current !== null &&
        yoyoDotChainRef.current !== null &&
        trailP01Ref.current !== null &&
        trailChainRef.current !== null
      )
      if (!ready) {
        raf = requestAnimationFrame(build)
        return
      }

      const hideAllTrails = () => {
        if (trailP01Ref.current) trailP01Ref.current.visible = false
        if (trailChainRef.current) trailChainRef.current.visible = false
      }

      // Reset state for replay
      dotRefs.forEach(r => r.current!.scale.setScalar(0))
      lineRefs.forEach(r => {
        if (r.current) (r.current.geometry as THREE.InstancedBufferGeometry).instanceCount = 0
      })
      yoyoDotP01Ref.current!.visible = false
      yoyoDotChainRef.current!.visible = false
      hideAllTrails()
        ; (trailP01Ref.current!.material as THREE.MeshBasicMaterial).opacity = 1
        ; (trailChainRef.current!.material as THREE.MeshBasicMaterial).opacity = 1

      // Compute each beam's arc length for duration proportional to world-space speed
      const beamInfo = DEFAULT_BEAMS.map(([from, to], i) => {
        const a = latLonToVec3(pointLatlons[from][0], pointLatlons[from][1], animPointRadius)
        const b = latLonToVec3(pointLatlons[to][0], pointLatlons[to][1], animPointRadius)
        const pts = beamCurve(a, b, animArcSegs, beamHeights[i], apexBiases[i])
        let arcLen = 0
        for (let j = 1; j < pts.length; j++) arcLen += pts[j].distanceTo(pts[j - 1])
        return { segCount: pts.length - 1, arcLen, duration: arcLen / animBeamSpeed }
      })

      // Proxy objects for setDrawRange tweening (one per beam)
      const p0 = { count: 0 }
      const p1 = { count: 0 }
      const p2 = { count: 0 }

      tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: ENTRANCE_TRIGGER_START,
          once: true,
        },
      })
      tlRef.current = tl

      // Group 1: P2 → beam[2,3] → P3 → beam[3,4] → P4
      tl.to(dotRefs[2].current!.scale, { x: 1, y: 1, z: 1, duration: animDotDur, ease: animDotEase })
      tl.to(p1, {
        count: beamInfo[1].segCount, duration: beamInfo[1].duration, ease: animBeamEase,
        onUpdate() {
          if (lineRefs[1].current)
            (lineRefs[1].current.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(p1.count)
        },
      }, `>${animStepDelay}`)
      tl.addLabel('yoyoFwd')  // chain dot comet starts here; rest of entrance continues in parallel
      tl.to(dotRefs[3].current!.scale, { x: 1, y: 1, z: 1, duration: animDotDur, ease: animDotEase }, `>${animStepDelay}`)
      tl.to(p2, {
        count: beamInfo[2].segCount, duration: beamInfo[2].duration, ease: animBeamEase,
        onUpdate() {
          if (lineRefs[2].current)
            (lineRefs[2].current.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(p2.count)
        },
      }, `>${animStepDelay}`)
      tl.to(dotRefs[4].current!.scale, { x: 1, y: 1, z: 1, duration: animDotDur, ease: animDotEase }, `>${animStepDelay}`)

      // Group 2: P0 → beam[0,1] → P1  (starts 0.3 s before Group 1 ends)
      tl.to(dotRefs[0].current!.scale, { x: 1, y: 1, z: 1, duration: animDotDur, ease: animDotEase }, `-=${animGroupOverlap}`)
      tl.to(p0, {
        count: beamInfo[0].segCount, duration: beamInfo[0].duration, ease: animBeamEase,
        onUpdate() {
          if (lineRefs[0].current)
            (lineRefs[0].current.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(p0.count)
        },
      }, `>${animStepDelay}`)
      // Label placed the moment beam[0→1] finishes drawing — used to trigger the P01 yoyo comet
      tl.addLabel('p01BeamDone')
      tl.to(dotRefs[1].current!.scale, { x: 1, y: 1, z: 1, duration: animDotDur, ease: animDotEase }, `>${animStepDelay}`)

      // --- Yoyo phase ---
      const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

      const arcLen0 = beamInfo[0].arcLen
      const arcLen1 = beamInfo[1].arcLen
      const arcLen2 = beamInfo[2].arcLen

      const d01 = arcLen0 / YOYO_TRAVEL_SPEED
      const d23 = arcLen1 / YOYO_TRAVEL_SPEED
      const d34 = arcLen2 / YOYO_TRAVEL_SPEED

      // P01 starts the instant its entrance beam finishes drawing (not relative to the chain).
      // For the reverse pass the beam is already drawn, so no offset is needed.
      const p01FwdOffset = tl.labels.p01BeamDone - tl.labels.yoyoFwd
      const p01RevOffset = 0

      const py01 = { t: 0 }, py23 = { t: 0 }, py34 = { t: 0 }
      const state01 = { forward: true }, state23 = { forward: true }, state34 = { forward: true }

      const p01Color = new THREE.Color(OVERLAY_COLORS[0])
      const chainColor = new THREE.Color(OVERLAY_COLORS[2])

      const updateP01 = () => {
        if (!yoyoDotP01Ref.current || !trailP01Ref.current) return
        const pts = arcPointsRefs[0].current
        if (!pts.length) return
        const idx = clamp(Math.round(py01.t * (pts.length - 1)), 0, pts.length - 1)
        yoyoDotP01Ref.current.position.copy(pts[idx])
        const trailWorldLen = Math.sin(py01.t * Math.PI) * TRAIL_MAX_LENGTH * arcLen0
        updateTrailMesh(trailP01Ref.current, pts, idx, trailWorldLen, state01.forward, p01Color)
      }

      const updateChain23 = () => {
        if (!yoyoDotChainRef.current || !trailChainRef.current) return
        const pts = arcPointsRefs[1].current
        if (!pts.length) return
        const idx = clamp(Math.round(py23.t * (pts.length - 1)), 0, pts.length - 1)
        yoyoDotChainRef.current.position.copy(pts[idx])
        const trailWorldLen = Math.sin(py23.t * Math.PI) * TRAIL_MAX_LENGTH * arcLen1
        updateTrailMesh(trailChainRef.current, pts, idx, trailWorldLen, state23.forward, chainColor)
      }

      const updateChain34 = () => {
        if (!yoyoDotChainRef.current || !trailChainRef.current) return
        const pts = arcPointsRefs[2].current
        if (!pts.length) return
        const idx = clamp(Math.round(py34.t * (pts.length - 1)), 0, pts.length - 1)
        yoyoDotChainRef.current.position.copy(pts[idx])
        const trailWorldLen = Math.sin(py34.t * Math.PI) * TRAIL_MAX_LENGTH * arcLen2
        updateTrailMesh(trailChainRef.current, pts, idx, trailWorldLen, state34.forward, chainColor)
      }

      const resetChainTrail = () => {
        if (!trailChainRef.current) return
          ; (trailChainRef.current.material as THREE.MeshBasicMaterial).opacity = 1
      }

      // Capture chain trail material (ref is stable by this point)
      const cMat = trailChainRef.current!.material as THREE.MeshBasicMaterial

      // --- Looping yoyo timeline ---
      const chainFwdDur = d23 + TRAIL_FADE_DURATION + d34
      const fwdMax      = Math.max(chainFwdDur, p01FwdOffset + d01)
      const revStart    = fwdMax + YOYO_PAUSE_DURATION
      const chainRevDur = d34 + TRAIL_FADE_DURATION + d23
      const revMax      = Math.max(chainRevDur, p01RevOffset + d01)

      yoyoTl = gsap.timeline({ repeat: -1, paused: true })
      yoyoTlRef.current = yoyoTl

      // Reset chain dot to P2 at the top of every loop iteration
      yoyoTl.call(() => {
        const pts1 = arcPointsRefs[1].current
        if (pts1.length && yoyoDotChainRef.current) yoyoDotChainRef.current.position.copy(pts1[0])
        resetChainTrail()
      })

      // Forward: chain P23 → fade → P34
      yoyoTl.to(py23, { t: 1, duration: d23, ease: 'none',
        onStart() { state23.forward = true }, onUpdate: updateChain23,
      })
      yoyoTl.to(cMat, { opacity: 0, duration: TRAIL_FADE_DURATION })
      yoyoTl.call(() => {
        resetChainTrail()
        const pts2 = arcPointsRefs[2].current
        if (pts2.length && yoyoDotChainRef.current) yoyoDotChainRef.current.position.copy(pts2[0])
      })
      yoyoTl.to(py34, { t: 1, duration: d34, ease: 'none',
        onStart() { state34.forward = true }, onUpdate: updateChain34,
      })

      // Forward: P01 (overlaps end of P23)
      yoyoTl.call(() => {
        const pts0 = arcPointsRefs[0].current
        if (pts0.length && yoyoDotP01Ref.current) yoyoDotP01Ref.current.position.copy(pts0[0])
      }, undefined, p01FwdOffset)
      yoyoTl.to(py01, { t: 1, duration: d01, ease: 'none',
        onStart() { state01.forward = true }, onUpdate: updateP01,
      }, p01FwdOffset)

      // Pause at destinations
      yoyoTl.to({}, { duration: YOYO_PAUSE_DURATION }, fwdMax)

      // Reverse: chain P34 → fade → P23
      yoyoTl.to(py34, { t: 0, duration: d34, ease: 'none',
        onStart() { state34.forward = false }, onUpdate: updateChain34,
      }, revStart)
      yoyoTl.to(cMat, { opacity: 0, duration: TRAIL_FADE_DURATION })
      yoyoTl.call(() => {
        resetChainTrail()
        const pts1 = arcPointsRefs[1].current
        if (pts1.length && yoyoDotChainRef.current)
          yoyoDotChainRef.current.position.copy(pts1[pts1.length - 1])
      })
      yoyoTl.to(py23, { t: 0, duration: d23, ease: 'none',
        onStart() { state23.forward = false }, onUpdate: updateChain23,
      })

      // Reverse: P01 (overlaps end of P34 rev)
      yoyoTl.to(py01, { t: 0, duration: d01, ease: 'none',
        onStart() { state01.forward = false }, onUpdate: updateP01,
      }, revStart + p01RevOffset)

      // Pause at origins before next loop
      yoyoTl.to({}, { duration: YOYO_PAUSE_DURATION }, revStart + revMax)

      // Launch loop when beam23 finishes drawing (yoyoFwd label)
      tl.call(() => {
        if (yoyoDotChainRef.current) yoyoDotChainRef.current.visible = true
        if (trailChainRef.current)   trailChainRef.current.visible   = true
        if (yoyoDotP01Ref.current)   yoyoDotP01Ref.current.visible   = true
        if (trailP01Ref.current)     trailP01Ref.current.visible     = true
        yoyoTl!.play()
      }, undefined, 'yoyoFwd')
    }

    raf = requestAnimationFrame(build)

    return () => {
      cancelAnimationFrame(raf)
      tl?.scrollTrigger?.kill()
      tl?.kill()
      yoyoTl?.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animBeamSpeed, animBeamEase, animDotDur, animDotEase, animStepDelay, animGroupOverlap, animArcSegs, animPointRadius])

  /* eslint-disable @typescript-eslint/no-unused-vars */
  const numStyle: React.CSSProperties = {
    width: 52, background: 'transparent', border: '1px solid rgba(200,40,100,0.25)',
    color: '#e87db0', fontFamily: 'monospace', fontSize: 11,
    textAlign: 'right', padding: '1px 4px', borderRadius: 2, outline: 'none',
  }
  const dotStyle = (color: string): React.CSSProperties => ({
    width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
  })
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }
  const lblStyle: React.CSSProperties = { width: 28, color: '#905070', fontSize: 10 }
  const selStyle: React.CSSProperties = {
    flex: 1, background: 'transparent', border: '1px solid rgba(200,40,100,0.25)',
    color: '#e87db0', fontFamily: 'monospace', fontSize: 11,
    padding: '1px 4px', borderRadius: 2, outline: 'none',
  }
  const colStyle: React.CSSProperties = {
    width: 36, height: 16, padding: 0,
    border: '1px solid rgba(200,40,100,0.25)', borderRadius: 2, cursor: 'pointer',
  }
  const EASING_OPTS = [
    'none',
    'power1.in', 'power1.out', 'power1.inOut',
    'power2.in', 'power2.out', 'power2.inOut',
    'power3.in', 'power3.out', 'power3.inOut',
    'back.in', 'back.out', 'back.inOut',
    'sine.in', 'sine.out', 'sine.inOut',
    'circ.in', 'circ.out', 'circ.inOut',
  ]
  /* eslint-enable @typescript-eslint/no-unused-vars */

  return (
    <div ref={containerRef} className={className}
      style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Leva hidden />
      <Canvas
        camera={{ fov: 35, position: [0, 0, 3] as [number, number, number] }}
        dpr={[1, 2] as [number, number]}
        gl={{ antialias: true, alpha: true }}
        flat
      >
        <>
          <GlobeScene
            detail={detail}
            scrollProgress={scrollProgress}
            latlons={pointLatlons}
            beamHeights={beamHeights}
            apexBiases={apexBiases}
            dotRefs={dotRefs}
            lineRefs={lineRefs}
            arcPointsRefs={arcPointsRefs}
            yoyoDotP01Ref={yoyoDotP01Ref}
            yoyoDotChainRef={yoyoDotChainRef}
            trailP01Ref={trailP01Ref}
            trailChainRef={trailChainRef}
            globeGrowRef={globeGrowRef}
            st3ProgressRef={st3ProgressRef}
            dotsGlass={dotsGlass}
          />
          <EffectComposer>
            <Bloom luminanceThreshold={0.2} intensity={0.8} mipmapBlur={!isMobile} />
          </EffectComposer>
        </>
      </Canvas>

      {/* POINTS/BEAMS HELPER — commented out
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        background: 'rgba(10, 6, 14, 0.88)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(200, 40, 100, 0.3)',
        borderRadius: 6, padding: '12px 14px',
        fontFamily: 'monospace', fontSize: 11, color: '#d04878',
        width: 260, userSelect: 'none',
      }}>
        ...
      </div>
      */}

      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        background: 'rgba(10, 6, 14, 0.88)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(200, 40, 100, 0.3)',
        borderRadius: 6, padding: '12px 14px',
        fontFamily: 'monospace', fontSize: 11, color: '#d04878',
        width: 260, userSelect: 'none',
      }}>
        <div style={{ color: '#c03060', fontWeight: 700, marginBottom: 8, fontSize: 10, letterSpacing: 1 }}>ANIMATION</div>

        <div style={{ color: '#6a2545', fontSize: 9, letterSpacing: 0.8, marginBottom: 4 }}>COLORS</div>
        <div style={rowStyle}>
          <span style={dotStyle(animDotsColor)} /><span style={{ ...lblStyle, width: 36 }}>dots</span>
          <input type="color" value={animDotsColor} onChange={e => setAnimDotsColor(e.target.value)} style={colStyle} />
        </div>
        <div style={rowStyle}>
          <span style={dotStyle(animBeamsColor)} /><span style={{ ...lblStyle, width: 36 }}>beams</span>
          <input type="color" value={animBeamsColor} onChange={e => setAnimBeamsColor(e.target.value)} style={colStyle} />
        </div>

        <div style={{ color: '#6a2545', fontSize: 9, letterSpacing: 0.8, margin: '8px 0 4px' }}>OVERLAY</div>
        <div style={rowStyle}><span style={lblStyle}>r</span><input type="number" style={numStyle} value={animPointRadius} step={0.01} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimPointRadius(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>dsz</span><input type="number" style={numStyle} value={animDotSize} step={0.001} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimDotSize(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>psz</span><input type="number" style={numStyle} value={animParticleSize} step={0.001} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimParticleSize(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>lop</span><input type="number" style={numStyle} value={animLineOpacity} step={0.01} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimLineOpacity(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>dop</span><input type="number" style={numStyle} value={animDotOpacity} step={0.01} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimDotOpacity(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>pop</span><input type="number" style={numStyle} value={animParticleOpacity} step={0.01} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimParticleOpacity(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>sph</span><input type="number" style={numStyle} value={animSphereSegs} step={1} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setAnimSphereSegs(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>arc</span><input type="number" style={numStyle} value={animArcSegs} step={1} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setAnimArcSegs(v) }} /></div>

        <div style={{ color: '#6a2545', fontSize: 9, letterSpacing: 0.8, margin: '8px 0 4px' }}>TIMING</div>
        <div style={rowStyle}><span style={lblStyle}>bsp</span><input type="number" style={numStyle} value={animBeamSpeed} step={0.1} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimBeamSpeed(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>dur</span><input type="number" style={numStyle} value={animDotDur} step={0.05} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimDotDur(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>stp</span><input type="number" style={numStyle} value={animStepDelay} step={0.05} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimStepDelay(v) }} /></div>
        <div style={rowStyle}><span style={lblStyle}>grp</span><input type="number" style={numStyle} value={animGroupOverlap} step={0.05} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAnimGroupOverlap(v) }} /></div>

        <div style={{ color: '#6a2545', fontSize: 9, letterSpacing: 0.8, margin: '8px 0 4px' }}>EASING</div>
        <div style={rowStyle}>
          <span style={lblStyle}>beam</span>
          <select style={selStyle} value={animBeamEase} onChange={e => setAnimBeamEase(e.target.value)}>
            {EASING_OPTS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div style={rowStyle}>
          <span style={lblStyle}>dot</span>
          <select style={selStyle} value={animDotEase} onChange={e => setAnimDotEase(e.target.value)}>
            {EASING_OPTS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

    </div>
  )
}
