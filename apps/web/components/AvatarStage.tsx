'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Props = {
  glbPath: string;
  remoteStream?: MediaStream | null;
};

export function AvatarStage({ glbPath, remoteStream }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1020');

    const camera = new THREE.PerspectiveCamera(35, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 1.5, 2.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2, 5, 4);
    scene.add(ambient, key);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 3.2;
    controls.target.set(0, 1.3, 0);
    controls.update();

    const loader = new GLTFLoader();
    let avatarRoot: THREE.Object3D | null = null;
    let jawBone: THREE.Object3D | null = null;
    const blendTargets: THREE.Mesh[] = [];
    const clock = new THREE.Clock();
    const analyserState: {
      audioContext: AudioContext | null;
      source: MediaStreamAudioSourceNode | null;
      analyser: AnalyserNode | null;
    } = { audioContext: null, source: null, analyser: null };

    loader.load(
      glbPath,
      (gltf) => {
        avatarRoot = gltf.scene;
        avatarRoot.position.set(0, -1.45, 0);
        scene.add(avatarRoot);

        avatarRoot.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            if (mesh.morphTargetDictionary) {
              blendTargets.push(mesh);
            }
          }
          if (obj.name === 'Jaw') {
            jawBone = obj;
          }
        });
      },
      undefined,
      () => {
        // Keep stage interactive even if model loading fails.
      }
    );

    if (remoteStream) {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(remoteStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserState.audioContext = audioContext;
      analyserState.source = source;
      analyserState.analyser = analyser;
    }

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    window.addEventListener('resize', onResize);

    let rafId = 0;
    const animate = () => {
      rafId = window.requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();
      const blink = Math.sin(elapsed * 2.2) > 0.985 ? 1 : 0;
      const nod = Math.sin(elapsed) * 0.03;
      if (avatarRoot) {
        avatarRoot.rotation.x = nod;
      }

      let jawOpen = 0.05;
      if (analyserState.analyser) {
        const samples = new Uint8Array(analyserState.analyser.frequencyBinCount);
        analyserState.analyser.getByteFrequencyData(samples);
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

      if (jawBone) {
        jawBone.rotation.x = jawOpen * 0.35;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      window.cancelAnimationFrame(rafId);
      controls.dispose();

      analyserState.source?.disconnect();
      analyserState.analyser?.disconnect();
      void analyserState.audioContext?.close();

      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((mat) => mat.dispose());
          } else {
            material?.dispose();
          }
        }
      });

      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [glbPath, remoteStream]);

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid #2b3f59' }}
    />
  );
}
