'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Props = {
  glbPath: string;
  thumbnailPath: string;
  remoteStream?: MediaStream | null;
};

const FALLBACK_THUMBNAIL = '/avatars/placeholder.svg';

export function AvatarStage({ glbPath, thumbnailPath, remoteStream }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setModelLoaded(false);

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

    const loadProceduralFallbackAvatar = () => {
      const fallbackGroup = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.38, 0.9, 8, 16),
        new THREE.MeshStandardMaterial({ color: '#2d4f73', metalness: 0.05, roughness: 0.75 })
      );
      body.position.set(0, 0.35, 0);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 32, 24),
        new THREE.MeshStandardMaterial({ color: '#e5c7a7', metalness: 0.05, roughness: 0.9 })
      );
      head.position.set(0, 1.08, 0);

      const portrait = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        new THREE.MeshStandardMaterial({ color: '#1f2a44', metalness: 0.02, roughness: 0.8 })
      );
      portrait.position.set(0, 1.1, 0.26);

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        thumbnailPath,
        (texture) => {
          const material = portrait.material as THREE.MeshStandardMaterial;
          material.map = texture;
          material.needsUpdate = true;
        },
        undefined,
        () => {
          textureLoader.load(FALLBACK_THUMBNAIL, (texture) => {
            const material = portrait.material as THREE.MeshStandardMaterial;
            material.map = texture;
            material.needsUpdate = true;
          });
        }
      );

      const jaw = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.12, 0.22),
        new THREE.MeshStandardMaterial({ color: '#d8b18b', metalness: 0.03, roughness: 0.9 })
      );
      jaw.name = 'Jaw';
      jaw.position.set(0, 0.92, 0.15);

      fallbackGroup.add(body, head, portrait, jaw);
      avatarRoot = fallbackGroup;
      jawBone = jaw;
      scene.add(fallbackGroup);
      setModelLoaded(true);
    };

    loader.load(
      glbPath,
      (gltf) => {
        avatarRoot = gltf.scene;
        avatarRoot.position.set(0, -1.45, 0);
        scene.add(avatarRoot);
        setModelLoaded(true);

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
        loadProceduralFallbackAvatar();
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
    <div className="stage-canvas-wrap">
      <div
        ref={mountRef}
        style={{ width: '100%', height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid #2b3f59' }}
      />
      {!modelLoaded ? (
        <div className="stage-fallback">
          <img
            src={thumbnailPath}
            alt="Interviewer preview"
            className="stage-fallback-image"
            onError={(event: SyntheticEvent<HTMLImageElement>) => {
              const target = event.currentTarget;
              if (target.src.endsWith(FALLBACK_THUMBNAIL)) {
                return;
              }
              target.src = FALLBACK_THUMBNAIL;
            }}
          />
          <p>Avatar model not found yet. Add the GLB file to continue with 3D animation.</p>
        </div>
      ) : null}
    </div>
  );
}
