'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

type Props = {
  glbPath: string;
  remoteStream?: MediaStream | null;
};

function RPMAvatar({ glbPath, remoteStream }: Props) {
  const { scene } = useGLTF(glbPath);
  const blinkClock = useRef(0);
  const analyser = useRef<AnalyserNode | null>(null);
  const blendTargets = useMemo(() => {
    const targets: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).morphTargetDictionary) {
        targets.push(obj as THREE.Mesh);
      }
    });
    return targets;
  }, [scene]);

  useEffect(() => {
    if (!remoteStream) return;
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(remoteStream);
    const nextAnalyser = audioContext.createAnalyser();
    nextAnalyser.fftSize = 256;
    source.connect(nextAnalyser);
    analyser.current = nextAnalyser;

    return () => {
      source.disconnect();
      nextAnalyser.disconnect();
      audioContext.close();
      analyser.current = null;
    };
  }, [remoteStream]);

  useFrame((_state, delta) => {
    blinkClock.current += delta;
    const blink = Math.max(0, Math.sin(blinkClock.current * 2.2) > 0.985 ? 1 : 0);
    const nod = Math.sin(performance.now() / 1000) * 0.03;
    scene.rotation.x = nod;

    const samples = analyser.current ? new Uint8Array(analyser.current.frequencyBinCount) : null;
    let jawOpen = 0.05;
    if (samples && analyser.current) {
      analyser.current.getByteFrequencyData(samples);
      jawOpen = Math.min(1, samples.reduce((sum, value) => sum + value, 0) / samples.length / 110);
    }

    for (const mesh of blendTargets) {
      const dict = mesh.morphTargetDictionary ?? {};
      const influences = mesh.morphTargetInfluences ?? [];
      const jawIndex = dict.jawOpen;
      const blinkL = dict.eyeBlinkLeft;
      const blinkR = dict.eyeBlinkRight;
      if (jawIndex !== undefined) influences[jawIndex] = jawOpen;
      if (blinkL !== undefined) influences[blinkL] = blink;
      if (blinkR !== undefined) influences[blinkR] = blink;
    }

    const jawBone = scene.getObjectByName('Jaw');
    if (jawBone) jawBone.rotation.x = jawOpen * 0.35;
  });

  return <primitive object={scene} position={[0, -1.45, 0]} />;
}

export function AvatarStage(props: Props) {
  return (
    <div style={{ width: '100%', height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid #2b3f59' }}>
      <Canvas camera={{ position: [0, 1.5, 2.2], fov: 35 }}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[2, 5, 4]} intensity={1.5} />
        <RPMAvatar {...props} />
        <OrbitControls enablePan={false} minDistance={1.8} maxDistance={3.2} />
      </Canvas>
    </div>
  );
}
