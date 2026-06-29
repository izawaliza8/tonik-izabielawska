'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger)

// ── Globe constants ───────────────────────────────────────────────────────────
const LINE_COLOR     = '#AEAEBC'
const COLOR_A        = '#0a0a0f'
const COLOR_B        = '#b3327a'
const DETAIL_DESKTOP = 48
const DETAIL_MOBILE  = 16
const GLOBE_SCALE    = 0.82
const INIT_SCALE     = 0.8

// ── Particle constants ────────────────────────────────────────────────────────
const PARTICLE_SIZE_INIT = 0.018
const PARTICLE_SIZE      = 0.108
const PARTICLE_SEGS      = 64
const PARTICLE_COLOR     = '#AEAEBC'

// ── Beam / comet constants ────────────────────────────────────────────────────
const OVERLAY_BEAM_COLOR     = '#6A2137'
const BEAM_LINE_WIDTH        = 3
const OVERLAY_LINE_OPACITY   = 0.65
const ARC_SEGS               = 64
const BEAM_DRAW_SPEED        = 2.2
const BEAM_DRAW_EASE         = 'sine.in'
const BEAM_FADE_DUR          = 0.4
const BEAM_FADE_EASE         = 'sine.out'
const ENTRANCE_TRIGGER_START = 'top center'
const ENTRANCE_GROUP_OVERLAP = 1.1

const OVERLAY_COLORS           = ['#AEAEBC', '#AEAEBC', '#AEAEBC', '#AEAEBC', '#AEAEBC']
const OVERLAY_PARTICLE_SIZE    = 0.009
const OVERLAY_PARTICLE_OPACITY = 1
const OVERLAY_SPHERE_SEGS      = 8
const TRAIL_SPHERE_COUNT       = 20
const TRAIL_SPHERE_BASE_SIZE   = OVERLAY_PARTICLE_SIZE * 1.2
const TRAIL_MAX_LENGTH         = 0.3
const TRAIL_FADE_DURATION      = 0
const YOYO_TRAVEL_SPEED        = 0.8
const YOYO_PAUSE_DURATION      = 0

// ── Positions & beam connections ──────────────────────────────────────────────
const LATLONS: [number, number][] = [
  [1,   -45],
  [-20,  21],
  [64, -140],
  [30,   23],
  [-21, -32],
]
// P0→P1  and  P2→P3→P4
const BEAMS: [number, number][] = [[0, 1], [2, 3], [3, 4]]

// Phase 3 equator targets — lat=0, lon evenly spaced 360/5=72° apart, centered on 0
const ROW_TARGETS: THREE.Vector3[] = [
  new THREE.Vector3( Math.sin(-144 * Math.PI / 180), 0, Math.cos(-144 * Math.PI / 180)),
  new THREE.Vector3( Math.sin( -72 * Math.PI / 180), 0, Math.cos( -72 * Math.PI / 180)),
  new THREE.Vector3( 0, 0, 1),
  new THREE.Vector3( Math.sin(  72 * Math.PI / 180), 0, Math.cos(  72 * Math.PI / 180)),
  new THREE.Vector3( Math.sin( 144 * Math.PI / 180), 0, Math.cos( 144 * Math.PI / 180)),
]

// ── Uniforms type ─────────────────────────────────────────────────────────────
type Uniforms = {
  uTime:                  { value: number }
  uProgress:              { value: number }
  uLineColor:             { value: THREE.Color }
  uColorA:                { value: THREE.Color }
  uColorB:                { value: THREE.Color }
  uSpeed:                 { value: number }
  uDistortionFrequency:   { value: number }
  uDistortionStrength:    { value: number }
  uDisplacementFrequency: { value: number }
  uDisplacementStrength:  { value: number }
  uWaveDepth:             { value: number }
  uLevels:                { value: number }
  uLineWidth:             { value: number }
  uLight1:                { value: THREE.Vector3 }
  uLight2:                { value: THREE.Vector3 }
  uLight3:                { value: THREE.Vector3 }
  uLight4:                { value: THREE.Vector3 }
  uAmbient:               { value: number }
  uGradCore:              { value: THREE.Color }
  uGradRim:               { value: THREE.Color }
  uRadialFocus:           { value: number }
  uPulseStrength:         { value: number }
  uPulseSpeed:            { value: number }
  uPulseMix:              { value: number }
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
  float fres   = pow(1.0 - max(dot(N,V),0.0), 2.0);
  float radial = max(dot(N,V),0.0);
  float center = pow(radial, uRadialFocus);
  float pulse  = 0.5 + 0.5 * sin(uTime * uPulseSpeed);
  vec3  radCol = mix(uGradRim, uGradCore, center);
  float radStr = uPulseStrength * ((1.0-uPulseMix) + uPulseMix*pulse) * center * uProgress;
  vec3 lineCol = uLineColor * shade * (1.0 + fres * 0.8);
  vec3  col   = lineCol * line + radCol * radStr;
  float alpha = line * mix(0.85,1.0,fres) + radStr;
  gl_FragColor = vec4(col, alpha);
}
`

// ── Scratch objects (module-level, reused every frame) ────────────────────────
const _trailDummy = new THREE.Object3D()
const _trailCol   = new THREE.Color()

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
  const phi   = (lat * Math.PI) / 180
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
  const dx = (Math.sin(x * 1.05 + t)       * 0.7 + Math.sin(y * 1.3  + t * 1.4) * 0.3) * 1.96
  const dy = (Math.sin(y * 1.05 + t + 3.8) * 0.7 + Math.sin(z * 1.1  + t * 0.9) * 0.3) * 1.96
  const dz = (Math.sin(z * 1.05 + t + 9.9) * 0.7 + Math.sin(x * 1.4  + t * 1.2) * 0.3) * 1.96
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
  const h     = peakHeight ?? chord * 0.5

  const cosAngle = Math.max(-1, Math.min(1, aN.dot(bN)))
  const angle    = Math.acos(cosAngle)
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
      const wb = Math.sin(t        * angle) / sinAngle
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

// 66% of the P2→P3 natural half-chord height — uniform across all arcs
const ARC_UNIFORM_HEIGHT = (() => {
  const p2 = latLonToVec3(LATLONS[2][0], LATLONS[2][1]).normalize()
  const p3 = latLonToVec3(LATLONS[3][0], LATLONS[3][1]).normalize()
  return p2.distanceTo(p3) * 0.5 * 0.5
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
  const geo  = new THREE.SphereGeometry(1, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS)
  const mat  = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 1,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
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
    _trailDummy.scale.setScalar(0); _trailDummy.position.set(0,0,0); _trailDummy.updateMatrix()
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
  toLat:   number; toLon:   number
  lineRef:      { current: Line2 | null }
  arcPointsRef: { current: THREE.Vector3[] }
}

function AnimatedBeam({ fromLat, fromLon, toLat, toLon, lineRef, arcPointsRef }: AnimatedBeamProps) {
  const { size } = useThree()

  const { line, arcPoints } = useMemo(() => {
    // Endpoints at radius 1.0 — same as particle base positions
    const a   = latLonToVec3(fromLat, fromLon)
    const b   = latLonToVec3(toLat,   toLon)
    const pts = orthodromicArc(a, b, ARC_SEGS, ARC_UNIFORM_HEIGHT)
    const positions: number[] = []
    pts.forEach(p => positions.push(p.x, p.y, p.z))
    const geo = new LineGeometry()
    geo.setPositions(positions)
    geo.instanceCount = 0
    const mat = new LineMaterial({
      color: OVERLAY_BEAM_COLOR, linewidth: BEAM_LINE_WIDTH,
      transparent: true, opacity: OVERLAY_LINE_OPACITY,
      depthWrite: false, depthTest: false, worldUnits: false, dashed: false,
    })
    const l = new Line2(geo, mat)
    l.renderOrder = 1
    return { line: l, arcPoints: pts }
  }, [fromLat, fromLon, toLat, toLon])

  useEffect(() => {
    lineRef.current = line; arcPointsRef.current = arcPoints
    return () => {
      lineRef.current = null; arcPointsRef.current = []
      line.geometry.dispose();(line.material as LineMaterial).dispose()
    }
  }, [line, lineRef, arcPoints, arcPointsRef])

  useEffect(() => {
    ;(line.material as LineMaterial).resolution.set(size.width, size.height)
  }, [size, line])

  return <primitive object={line} />
}

// ── Surface particles ─────────────────────────────────────────────────────────
// Children of the rotating globe group — they orbit with it.
// Fixed at radius 1.0 so their positions exactly match the beam endpoints.
type ParticlesProps = {
  baseDirs:     THREE.Vector3[]
  particleRefs: { current: THREE.Mesh | null }[]
}

function SurfaceParticles({ baseDirs, particleRefs }: ParticlesProps) {
  return (
    <>
      {baseDirs.map((d, i) => (
        <mesh
          key={i}
          ref={particleRefs[i] as React.RefObject<THREE.Mesh>}
          position={[d.x, d.y, d.z]}
          scale={PARTICLE_SIZE_INIT}
          renderOrder={2}
        >
          <sphereGeometry args={[1, PARTICLE_SEGS, PARTICLE_SEGS]} />
          <meshBasicMaterial
            color={PARTICLE_COLOR}
            blending={THREE.AdditiveBlending}
            transparent depthWrite={false} depthTest={false}
          />
        </mesh>
      ))}
    </>
  )
}

// ── Globe scene ───────────────────────────────────────────────────────────────
type GlobeSceneProps = {
  detail:           number
  scrollProgress:   React.MutableRefObject<number>
  scrollProgress2:  React.MutableRefObject<number>
  scrollProgress3:  React.MutableRefObject<number>
  lineRefs:         { current: Line2 | null }[]
  arcPointsRefs:    { current: THREE.Vector3[] }[]
  yoyoDotP01Ref:    { current: THREE.Mesh | null }
  yoyoDotChainRef:  { current: THREE.Mesh | null }
  trailP01Ref:      { current: THREE.InstancedMesh | null }
  trailChainRef:    { current: THREE.InstancedMesh | null }
}

function GlobeScene({
  detail, scrollProgress, scrollProgress2, scrollProgress3,
  lineRefs, arcPointsRefs,
  yoyoDotP01Ref, yoyoDotChainRef,
  trailP01Ref, trailChainRef,
}: GlobeSceneProps) {
  const groupRef     = useRef<THREE.Group>(null)
  const materialRef  = useRef<THREE.ShaderMaterial>(null)
  const timeRef      = useRef(0)
  const scrollDamped  = useRef(0)
  const scrollDamped3 = useRef(0)

  const baseDirs = useMemo(
    () => LATLONS.map(([lat, lon]) => latLonToVec3(lat, lon).normalize()),
    [],
  )

  const particleRefs = useMemo<{ current: THREE.Mesh | null }[]>(
    () => Array.from({ length: 5 }, () => ({ current: null })),
    [],
  )

  const trailP01Mesh    = useMemo(() => makeTrailMesh(OVERLAY_COLORS[0]), [])
  const trailChainMesh  = useMemo(() => makeTrailMesh(OVERLAY_COLORS[2]), [])

  useEffect(() => {
    trailP01Ref.current   = trailP01Mesh
    trailChainRef.current = trailChainMesh
    return () => {
      trailP01Ref.current = null; trailChainRef.current = null
      trailP01Mesh.geometry.dispose();(trailP01Mesh.material as THREE.MeshBasicMaterial).dispose()
      trailChainMesh.geometry.dispose();(trailChainMesh.material as THREE.MeshBasicMaterial).dispose()
    }
  }, [trailP01Mesh, trailChainMesh, trailP01Ref, trailChainRef])

  const uniforms = useMemo<Uniforms>(() => ({
    uTime:                  { value: 0 },
    uProgress:              { value: 0 },
    uLineColor:             { value: new THREE.Color(LINE_COLOR) },
    uColorA:                { value: new THREE.Color(COLOR_A) },
    uColorB:                { value: new THREE.Color(COLOR_B) },
    uSpeed:                 { value: 0.01 },
    uDistortionFrequency:   { value: 1.05 },
    uDistortionStrength:    { value: 1.96 },
    uDisplacementFrequency: { value: 0.20 },
    uDisplacementStrength:  { value: 0.08 },
    uWaveDepth:             { value: 1.80 },
    uLevels:                { value: 80 },
    uLineWidth:             { value: 1.15 },
    uLight1:  { value: new THREE.Vector3( 0.5,  0.5, 0) },
    uLight2:  { value: new THREE.Vector3(-0.5,  0.5, 0) },
    uLight3:  { value: new THREE.Vector3( 0.5, -0.5, 0) },
    uLight4:  { value: new THREE.Vector3(-0.5, -0.5, 0) },
    uAmbient:       { value: 0.12 },
    uGradCore:      { value: new THREE.Color('#9b4269') },
    uGradRim:       { value: new THREE.Color('#000000') },
    uRadialFocus:   { value: 3.35 },
    uPulseStrength: { value: 0.58 },
    uPulseSpeed:    { value: 3.10 },
    uPulseMix:      { value: 0.36 },
  }), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const u  = materialRef.current?.uniforms as Uniforms | undefined
    if (!u || !groupRef.current) return

    const smooth = 1 - Math.pow(1 - 0.05, dt * 60)
    scrollDamped.current  += (scrollProgress.current  - scrollDamped.current)  * smooth
    scrollDamped3.current += (scrollProgress3.current - scrollDamped3.current) * smooth

    timeRef.current   += dt
    u.uTime.value      = timeRef.current
    u.uProgress.value  = scrollDamped.current

    const p2 = scrollProgress2.current
    const p3 = scrollDamped3.current

    groupRef.current.rotation.y += dt * THREE.MathUtils.lerp(0.1, 0.8, p3)
    const sc = GLOBE_SCALE * (INIT_SCALE + scrollDamped.current * (1 - INIT_SCALE))
    groupRef.current.scale.setScalar(sc)
    particleRefs.forEach((r, i) => {
      if (!r.current) return
      r.current.scale.setScalar(PARTICLE_SIZE_INIT + (PARTICLE_SIZE - PARTICLE_SIZE_INIT) * p2)
      r.current.position.copy(baseDirs[i].clone().lerp(ROW_TARGETS[i], p3).normalize())
    })
  })

  return (
    <group ref={groupRef} scale={GLOBE_SCALE * INIT_SCALE}>
      {/* Globe mesh */}
      <mesh renderOrder={0}>
        <icosahedronGeometry args={[1, detail]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          uniforms={uniforms}
          transparent depthWrite={false}
        />
      </mesh>

      {/* 5 particles riding the wave surface */}
      <SurfaceParticles baseDirs={baseDirs} particleRefs={particleRefs} />

      {/* Beams: P0→P1 and P2→P3→P4 */}
      {BEAMS.map(([from, to], i) => (
        <AnimatedBeam
          key={i}
          fromLat={LATLONS[from][0]} fromLon={LATLONS[from][1]}
          toLat={LATLONS[to][0]}     toLon={LATLONS[to][1]}
          lineRef={lineRefs[i]}
          arcPointsRef={arcPointsRefs[i]}
        />
      ))}

      {/* Comet dots */}
      <mesh ref={yoyoDotP01Ref as React.RefObject<THREE.Mesh>} visible={false} renderOrder={2}>
        <sphereGeometry args={[OVERLAY_PARTICLE_SIZE, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS]} />
        <meshBasicMaterial color={OVERLAY_COLORS[0]} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} transparent opacity={OVERLAY_PARTICLE_OPACITY} />
      </mesh>
      <mesh ref={yoyoDotChainRef as React.RefObject<THREE.Mesh>} visible={false} renderOrder={2}>
        <sphereGeometry args={[OVERLAY_PARTICLE_SIZE, OVERLAY_SPHERE_SEGS, OVERLAY_SPHERE_SEGS]} />
        <meshBasicMaterial color={OVERLAY_COLORS[2]} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} transparent opacity={OVERLAY_PARTICLE_OPACITY} />
      </mesh>

      {/* Trail meshes */}
      <primitive object={trailP01Mesh} />
      <primitive object={trailChainMesh} />
    </group>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────
export interface GlobeProps { className?: string }

export default function GlobeV2({ className }: GlobeProps) {
  const isMobile       = useMediaQuery('(max-width: 767px)')
  const detail         = isMobile ? DETAIL_MOBILE : DETAIL_DESKTOP
  const containerRef    = useRef<HTMLDivElement>(null)
  const scrollProgress  = useRef(0)
  const scrollProgress2 = useRef(0)
  const scrollProgress3 = useRef(0)

  const lineRefs = useMemo<{ current: Line2 | null }[]>(
    () => Array.from({ length: 3 }, (): { current: Line2 | null } => ({ current: null })),
    [],
  )
  const arcPointsRefs = useMemo<{ current: THREE.Vector3[] }[]>(
    () => Array.from({ length: 3 }, (): { current: THREE.Vector3[] } => ({ current: [] })),
    [],
  )
  const yoyoDotP01Ref   = useMemo<{ current: THREE.Mesh | null }>(() => ({ current: null }), [])
  const yoyoDotChainRef = useMemo<{ current: THREE.Mesh | null }>(() => ({ current: null }), [])
  const trailP01Ref     = useMemo<{ current: THREE.InstancedMesh | null }>(() => ({ current: null }), [])
  const trailChainRef   = useMemo<{ current: THREE.InstancedMesh | null }>(() => ({ current: null }), [])
  const yoyoTlRef       = useRef<gsap.core.Timeline | null>(null)
  const beamsFaded      = useRef(false)

  const fadeBeamsAndComets = () => {
    if (beamsFaded.current) return
    beamsFaded.current = true
    yoyoTlRef.current?.kill()
    yoyoTlRef.current = null
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
  }

  useGSAP(() => {
    ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top top',
      end: '+=40%',
      onUpdate: (self) => { scrollProgress.current = self.progress },
    })
    ScrollTrigger.create({
      trigger: containerRef.current,
      start: '+=40%',
      end: '+=100vh',
      onUpdate: (self) => { scrollProgress2.current = self.progress },
      onEnter: fadeBeamsAndComets,
    })
    ScrollTrigger.create({
      trigger: containerRef.current,
      start: '+=140%',
      end: '+=100vh',
      onUpdate: (self) => { scrollProgress3.current = self.progress },
    })
  }, { scope: containerRef })

  useEffect(() => {
    let raf = 0

    const build = () => {
      const ready = (
        lineRefs.every(r => r.current) &&
        arcPointsRefs.every(r => r.current.length > 0) &&
        yoyoDotP01Ref.current   !== null &&
        yoyoDotChainRef.current !== null &&
        trailP01Ref.current     !== null &&
        trailChainRef.current   !== null
      )
      if (!ready) { raf = requestAnimationFrame(build); return }

      // ── Compute arc lengths for speed-proportional draw durations ───────
      const beamInfo = BEAMS.map(([from, to]) => {
        const a   = latLonToVec3(LATLONS[from][0], LATLONS[from][1])
        const b   = latLonToVec3(LATLONS[to][0],   LATLONS[to][1])
        const pts = orthodromicArc(a, b, ARC_SEGS, ARC_UNIFORM_HEIGHT)
        let arcLen = 0
        for (let j = 1; j < pts.length; j++) arcLen += pts[j].distanceTo(pts[j - 1])
        return { segCount: pts.length - 1, arcLen, duration: arcLen / BEAM_DRAW_SPEED }
      })

      // Reset
      lineRefs.forEach(r => {
        if (r.current) (r.current.geometry as THREE.InstancedBufferGeometry).instanceCount = 0
      })
      yoyoDotP01Ref.current!.visible   = false
      yoyoDotChainRef.current!.visible  = false
      trailP01Ref.current!.visible      = false
      trailChainRef.current!.visible    = false
      ;(trailP01Ref.current!.material   as THREE.MeshBasicMaterial).opacity = 1
      ;(trailChainRef.current!.material as THREE.MeshBasicMaterial).opacity = 1

      const p0 = { count: 0 }, p1 = { count: 0 }, p2 = { count: 0 }

      // ── Entrance timeline ─────────────────────────────────────────────────
      // Group 1: beam P2→P3, then beam P3→P4
      // Group 2: beam P0→P1 (starts ENTRANCE_GROUP_OVERLAP seconds before Group 1 ends)
      const tl = gsap.timeline({
        scrollTrigger: { trigger: containerRef.current, start: ENTRANCE_TRIGGER_START, once: true },
      })

      tl.to(p1, {
        count: beamInfo[1].segCount, duration: beamInfo[1].duration, ease: BEAM_DRAW_EASE,
        onUpdate() {
          if (lineRefs[1].current)
            (lineRefs[1].current.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(p1.count)
        },
      })
      tl.addLabel('yoyoFwd')
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

      const p01Color   = new THREE.Color(OVERLAY_COLORS[0])
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
      const fwdMax      = Math.max(chainFwdDur, p01FwdOffset + d01)
      const revStart    = fwdMax + YOYO_PAUSE_DURATION
      const chainRevDur = d34 + TRAIL_FADE_DURATION + d23
      const revMax      = Math.max(chainRevDur, d01)

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

      // Launch yoyo when beam P2→3 finishes drawing — skip if Phase 2 already faded everything
      tl.call(() => {
        if (beamsFaded.current) return
        if (yoyoDotChainRef.current) yoyoDotChainRef.current.visible = true
        if (trailChainRef.current)   trailChainRef.current.visible   = true
        if (yoyoDotP01Ref.current)   yoyoDotP01Ref.current.visible   = true
        if (trailP01Ref.current)     trailP01Ref.current.visible     = true
        yoyoTl.play()
      }, undefined, 'yoyoFwd')
    }

    raf = requestAnimationFrame(build)
    return () => {
      cancelAnimationFrame(raf)
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
        camera={{ fov: 35, position: [0, 0, 3] as [number, number, number] }}
        dpr={[1, 2] as [number, number]}
        gl={{ antialias: true, alpha: true }}
        flat
      >
        <GlobeScene
          detail={detail}
          scrollProgress={scrollProgress}
          scrollProgress2={scrollProgress2}
          scrollProgress3={scrollProgress3}
          lineRefs={lineRefs}
          arcPointsRefs={arcPointsRefs}
          yoyoDotP01Ref={yoyoDotP01Ref}
          yoyoDotChainRef={yoyoDotChainRef}
          trailP01Ref={trailP01Ref}
          trailChainRef={trailChainRef}
        />
        <EffectComposer>
          <Bloom luminanceThreshold={0.7} intensity={0.8} mipmapBlur={!isMobile} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
