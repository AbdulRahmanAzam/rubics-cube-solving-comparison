import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACE_NORMALS, STICKERS, applyMoves } from '@shared/cube.js';

export const STICKER_COLORS = {
  U: '#f5f6f8',
  R: '#d92b2b',
  F: '#1fa24a',
  D: '#f7cc1c',
  L: '#f2731d',
  B: '#1f5fd6',
};

const GAP = 1.0;

const CUBIES = [];
for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++)
    for (let z = -1; z <= 1; z++) if (x || y || z) CUBIES.push([x, y, z]);

const STICKERS_OF = new Map(CUBIES.map((p) => [p.join(','), []]));
STICKERS.forEach((s, i) => STICKERS_OF.get(s.pos.join(',')).push(i));

function stickerRotation([nx, ny]) {
  if (nx) return [0, Math.PI / 2, 0];
  if (ny) return [Math.PI / 2, 0, 0];
  return [0, 0, 0];
}

// Rounded box built once and shared by every cubie on every canvas (same shape as drei's
// RoundedBox). Building it per mesh cost a geometry rebuild for each cubie on every turn.
function roundedBox(width, height, depth, radius, smoothness) {
  const eps = 0.00001;
  const r = radius - eps;
  const shape = new THREE.Shape();
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, height - r * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(width - r * 2, height - r * 2, eps, Math.PI / 2, 0, true);
  shape.absarc(width - r * 2, eps, eps, 0, -Math.PI / 2, true);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelSegments: 8,
    steps: 1,
    bevelSize: radius - eps,
    bevelThickness: radius,
    curveSegments: smoothness,
  });
  geometry.center();
  return toCreasedNormals(geometry, 0.4);
}

const BODY_GEOMETRY = roundedBox(0.96, 0.96, 0.96, 0.1, 3);
const STICKER_GEOMETRY = roundedBox(0.8, 0.8, 0.04, 0.1, 3);
const BODY_MATERIAL = new THREE.MeshStandardMaterial({ color: '#121212', roughness: 0.55 });
const STICKER_MATERIALS = Object.fromEntries(
  Object.entries(STICKER_COLORS).map(([f, c]) => [f, new THREE.MeshStandardMaterial({ color: c, roughness: 0.28, metalness: 0.02 })]),
);

// `colors` holds only this cubie's sticker colors, so a turn re-renders just the cubies it changed.
const Cubie = memo(function Cubie({ pos, colors, groupRef }) {
  return (
    <group ref={groupRef} position={pos.map((v) => v * GAP)}>
      <mesh geometry={BODY_GEOMETRY} material={BODY_MATERIAL} />
      {STICKERS_OF.get(pos.join(',')).map((i, k) => {
        const n = STICKERS[i].normal;
        return (
          <mesh
            key={i}
            geometry={STICKER_GEOMETRY}
            material={STICKER_MATERIALS[colors[k]]}
            position={n.map((v) => v * 0.485)}
            rotation={stickerRotation(n)}
          />
        );
      })}
    </group>
  );
});

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function moveAngle(move) {
  if (move.endsWith('2')) return -Math.PI;
  return move.endsWith("'") ? Math.PI / 2 : -Math.PI / 2;
}

const BASE_POS = CUBIES.map((p) => new THREE.Vector3(...p).multiplyScalar(GAP));
const turnQ = new THREE.Quaternion();

function AnimatedCube({ start, moves, speed }) {
  const [shown, setShown] = useState(0);
  const groups = useRef([]);
  const groupRefs = useMemo(() => CUBIES.map((_, i) => (g) => (groups.current[i] = g)), []);
  const progress = useRef(0);
  const invalidate = useThree((s) => s.invalidate);

  // New puzzle: restart from its start state.
  useEffect(() => setShown(0), [start]);
  const safeShown = Math.min(shown, moves.length);

  const facelets = useMemo(() => applyMoves(start, moves.slice(0, safeShown)), [start, moves, safeShown]);
  const active = safeShown < moves.length ? moves[safeShown] : null;
  const axis = useMemo(() => (active ? new THREE.Vector3(...FACE_NORMALS[active[0]]) : null), [active]);
  const layer = useMemo(
    () => (axis ? CUBIES.flatMap((p, i) => (p[0] * axis.x + p[1] * axis.y + p[2] * axis.z === 1 ? [i] : [])) : []),
    [axis],
  );

  // Fast models send moves quicker than one turn animation, so the queue speeds the
  // animation up instead of falling behind the live race.
  const backlog = moves.length - safeShown;
  const duration = Math.max(0.05, 0.3 / speed / (1 + (backlog - 1) * 0.75)) * (active?.endsWith('2') ? 1.4 : 1);

  // Runs at commit, before the next frame is drawn: the new colors never show on a turned layer.
  useLayoutEffect(() => {
    progress.current = 0;
    groups.current.forEach((g, i) => {
      g?.position.copy(BASE_POS[i]);
      g?.quaternion.identity();
    });
    invalidate();
  }, [active, safeShown, start, invalidate]);

  useFrame((state, delta) => {
    if (!active) return;
    progress.current = Math.min(1, progress.current + Math.min(delta, 0.05) / duration);
    turnQ.setFromAxisAngle(axis, moveAngle(active) * easeInOut(progress.current));
    for (const i of layer) {
      const g = groups.current[i];
      if (!g) continue;
      g.position.copy(BASE_POS[i]).applyQuaternion(turnQ);
      g.quaternion.copy(turnQ);
    }
    if (progress.current >= 1) setShown(safeShown + 1);
    else state.invalidate();
  });

  return (
    <group>
      {CUBIES.map((p, i) => (
        <Cubie
          key={i}
          pos={p}
          colors={STICKERS_OF.get(p.join(',')).map((s) => facelets[s]).join('')}
          groupRef={groupRefs[i]}
        />
      ))}
    </group>
  );
}

// Keeps the whole cube in view for any box shape: on tall/narrow boxes the vertical field of
// view widens so the horizontal extent still fits.
const BASE_FOV = 34;
// Narrowest box shape (width / height) that still shows the whole cube at BASE_FOV.
const FIT_ASPECT = 1.35;
function FitCamera() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const half = (BASE_FOV / 2) * (Math.PI / 180);
    camera.fov = aspect >= FIT_ASPECT ? BASE_FOV : (2 * Math.atan(Math.tan(half) * (FIT_ASPECT / aspect)) * 180) / Math.PI;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}

export default memo(function Cube3D({ start, moves = [], speed = 1, interactive = true }) {
  return (
    <Canvas
      camera={{ position: [4.4, 3.7, 5.6], fov: BASE_FOV }}
      // Draw only while something changes (a turn, a drag): four always-on canvases starved
      // the page of frames during fast races.
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ touchAction: 'none' }}
    >
      <FitCamera />
      <ambientLight intensity={0.85} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} />
      <directionalLight position={[-6, 2, -4]} intensity={0.45} />
      <group position={[0, 0.15, 0]}>
        <AnimatedCube start={start} moves={moves} speed={speed} />
      </group>
      <ContactShadows position={[0, -1.75, 0]} opacity={0.35} scale={9} blur={2.6} far={3} />
      {interactive && <OrbitControls enableZoom={false} enablePan={false} />}
    </Canvas>
  );
});
