'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AvatarCatalogEntry, InterviewIntake } from '@dominion/shared';

const AvatarStage = dynamic(
  () => import('../components/AvatarStage').then((module) => module.AvatarStage),
  { ssr: false }
);

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:8787';
const FALLBACK_THUMBNAIL = '/avatars/placeholder.svg';

function resolveAssetUrl(path: string | undefined) {
  if (!path) {
    return FALLBACK_THUMBNAIL;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith('/')) {
    return path;
  }

  return `${SERVER_URL}${path}`;
}

const defaultIntake: InterviewIntake = {
  company: 'Acme',
  jobTitle: 'Frontend Engineer',
  level: 'mid',
  difficulty: 'neutral',
  personality: 'friendly'
};

function AvatarThumbnail({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [imageSrc, setImageSrc] = useState(src);

  useEffect(() => {
    setImageSrc(src);
  }, [src]);

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (imageSrc !== FALLBACK_THUMBNAIL) {
          setImageSrc(FALLBACK_THUMBNAIL);
        }
      }}
    />
  );
}

export default function Page() {
  const [intake, setIntake] = useState<InterviewIntake>(defaultIntake);
  const [avatars, setAvatars] = useState<AvatarCatalogEntry[]>([]);
  const [avatarId, setAvatarId] = useState<string>('pick-for-me');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState<string>('');
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [stageResetSignal, setStageResetSignal] = useState(0);

  const selectedAvatar = useMemo(
    () => avatars.find((avatar) => avatar.id === avatarId) ?? avatars[0],
    [avatars, avatarId]
  );

  async function pickRandomAvatar(currentId = avatarId) {
    const res = await fetch(`${SERVER_URL}/api/avatars/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludeIds: currentId === 'pick-for-me' ? [] : [currentId] })
    });

    if (!res.ok) {
      throw new Error(`Avatar pick failed: ${res.status}`);
    }

    const data = (await res.json()) as { avatar: AvatarCatalogEntry };
    setAvatarId(data.avatar.id);
  }

  useEffect(() => {
    void (async () => {
      try {
        setError('');
        const avatarsResponse = await fetch(`${SERVER_URL}/api/avatars`);
        if (!avatarsResponse.ok) {
          throw new Error(`Failed to load avatars: ${avatarsResponse.status}`);
        }

        const data = (await avatarsResponse.json()) as { avatars: AvatarCatalogEntry[] };
        setAvatars(data.avatars);
        await pickRandomAvatar('pick-for-me');
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to initialize page');
      }
    })();
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      disconnect();
    };

    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  async function connect() {
    try {
      setError('');
      setStageResetSignal((current) => current + 1);
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      setStatus('connecting');

      const userStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = userStream;
      userStream
        .getAudioTracks()
        .forEach((track) => peer.addTrack(track, userStream));

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = userStream;
      }

      const remote = new MediaStream();
      peer.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => remote.addTrack(track));
        setRemoteStream(new MediaStream(remote.getTracks()));
      };

      const audio = remoteAudioRef.current;
      if (audio) {
        audio.srcObject = remote;
        void audio.play().catch((playError) => {
          if (
            playError instanceof DOMException &&
            (playError.name === 'AbortError' || playError.name === 'NotAllowedError')
          ) {
            return;
          }

          setError(playError instanceof Error ? playError.message : 'Failed to play remote audio');
        });
      }

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const sessionRes = await fetch(`${SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: offer.sdp, intake, avatarId: selectedAvatar?.id })
      });

      if (!sessionRes.ok) {
        const payload = (await sessionRes.json().catch(() => ({ error: 'Unknown server error' }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Session setup failed: ${sessionRes.status}`);
      }

      const { answerSdp } = (await sessionRes.json()) as { answerSdp: string };
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      setStatus('connected');
    } catch (nextError) {
      disconnect();
      setError(nextError instanceof Error ? nextError.message : 'Failed to connect');
    }
  }

  function disconnect() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setRemoteStream(null);
    setStageResetSignal((current) => current + 1);
    setStatus('idle');
  }

  return (
    <main>
      <h1>Dominion MVP</h1>
      <audio ref={remoteAudioRef} autoPlay playsInline />
      {error ? <p style={{ color: '#fca5a5' }}>{error}</p> : null}
      <div className="card">
        <h3>Interview intake</h3>
        <div className="grid">
          <label>Company<input value={intake.company} onChange={(e) => setIntake({ ...intake, company: e.target.value })} /></label>
          <label>Job title<input value={intake.jobTitle} onChange={(e) => setIntake({ ...intake, jobTitle: e.target.value })} /></label>
          <label>Level<select value={intake.level} onChange={(e) => setIntake({ ...intake, level: e.target.value as InterviewIntake['level'] })}><option>junior</option><option>mid</option><option>senior</option><option>staff</option></select></label>
          <label>Difficulty<select value={intake.difficulty} onChange={(e) => setIntake({ ...intake, difficulty: e.target.value as InterviewIntake['difficulty'] })}><option>friendly</option><option>neutral</option><option>tough</option></select></label>
          <label>Personality<select value={intake.personality} onChange={(e) => setIntake({ ...intake, personality: e.target.value as InterviewIntake['personality'] })}><option>friendly</option><option>analytical</option><option>skeptical</option><option>executive</option></select></label>
        </div>
      </div>

      <div className="card">
        <h3>Avatar picker</h3>
        <div className="avatar-grid">
          <button className="avatar-tile" onClick={() => void pickRandomAvatar()}>
            <strong>Pick for me</strong>
            <div>Diversity-aware default selection</div>
          </button>
          {avatars.map((avatar) => (
            <button key={avatar.id} className="avatar-tile" onClick={() => setAvatarId(avatar.id)} style={{ outline: avatarId === avatar.id ? '2px solid #60a5fa' : 'none' }}>
              <AvatarThumbnail src={resolveAssetUrl(avatar.thumbnailPath)} alt={`${avatar.name} avatar preview`} className="avatar-thumbnail" />
              <strong>{avatar.name}</strong>
              <div>{avatar.gender} · {avatar.raceGroup}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}><button onClick={() => void pickRandomAvatar()}>Pick random diverse avatar</button></div>
      </div>

      <div className="card stage">
        <div>
          <h3>Interview stage</h3>
          <p>Status: {status}</p>
          <p>Interviewer: {selectedAvatar?.name ?? 'Loading...'}</p>
          {selectedAvatar ? (
            <AvatarThumbnail
              src={resolveAssetUrl(selectedAvatar.thumbnailPath)}
              alt={`${selectedAvatar.name} interviewer thumbnail`}
              className="avatar-selected-thumbnail"
            />
          ) : null}
          <button onClick={connect} disabled={status !== 'idle' || !selectedAvatar}>Connect</button>
          <div style={{ height: 8 }} />
          <button onClick={disconnect} disabled={status === 'idle'}>Disconnect</button>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Camera feed for expression tracking</div>
            <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
          </div>
        </div>
        <AvatarStage
          glbPath={resolveAssetUrl(selectedAvatar?.glbPath)}
          thumbnailPath={resolveAssetUrl(selectedAvatar?.thumbnailPath)}
          remoteStream={remoteStream}
          resetSignal={stageResetSignal}
        />
      </div>
    </main>
  );
}
