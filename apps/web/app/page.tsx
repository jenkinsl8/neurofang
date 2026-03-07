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


const TRACE_WEBRTC =
  process.env.NEXT_PUBLIC_TRACE_WEBRTC === '1' || process.env.NEXT_PUBLIC_TRACE_WEBRTC === 'true';

function traceWebRtc(event: string, details?: Record<string, unknown>) {
  if (!TRACE_WEBRTC) {
    return;
  }

  const timestamp = new Date().toISOString();
  console.debug(`[trace:web][webrtc][${timestamp}] ${event}`, details ?? {});
}

function resolveAssetUrl(path: string | undefined) {
  if (!path) {
    return FALLBACK_THUMBNAIL;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith('/api/')) {
    return `${SERVER_URL}${path}`;
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

async function waitForIceGatheringComplete(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve) => {
    const onIceGatheringStateChange = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
        resolve();
      }
    };

    peer.addEventListener('icegatheringstatechange', onIceGatheringStateChange);
  });
}

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
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [error, setError] = useState<string>('');
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
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
      traceWebRtc('connect:start', { avatarId: selectedAvatar?.id, intake });
      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      peer.addEventListener('icegatheringstatechange', () => {
        traceWebRtc('ice:gathering-state-change', { state: peer.iceGatheringState });
      });

      peer.addEventListener('iceconnectionstatechange', () => {
        traceWebRtc('ice:connection-state-change', { state: peer.iceConnectionState });
      });

      peer.addEventListener('connectionstatechange', () => {
        traceWebRtc('peer:connection-state-change', { state: peer.connectionState });
      });
      remoteStreamRef.current = new MediaStream();
      setStatus('connecting');

      const userStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      traceWebRtc('media:get-user-media:success', {
        audioTracks: userStream.getAudioTracks().length,
        videoTracks: userStream.getVideoTracks().length
      });
      localStreamRef.current = userStream;
      setLocalStream(userStream);
      peer.addTransceiver('audio', { direction: 'sendrecv' });
      userStream
        .getAudioTracks()
        .forEach((track) => peer.addTrack(track, userStream));

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = userStream;
      }

      peer.ontrack = (event) => {
        traceWebRtc('peer:ontrack', {
          trackId: event.track.id,
          trackKind: event.track.kind,
          streamCount: event.streams.length
        });
        const remote = remoteStreamRef.current;
        if (!remote) {
          return;
        }

        if (!remote.getTracks().some((track) => track.id === event.track.id)) {
          remote.addTrack(event.track);
        }

        setRemoteStream(new MediaStream(remote.getAudioTracks()));

        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remote;
          void remoteAudioRef.current.play().catch((playError) => {
            if (
              playError instanceof DOMException &&
              (playError.name === 'AbortError' || playError.name === 'NotAllowedError')
            ) {
              return;
            }

            setError(playError instanceof Error ? playError.message : 'Failed to play remote audio');
          });
        }
      };

      const audio = remoteAudioRef.current;
      if (audio) {
        audio.srcObject = remoteStreamRef.current;
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

      const controlChannel = peer.createDataChannel('oai-events');
      controlChannelRef.current = controlChannel;
      controlChannel.onopen = () => {
        const kickoffEvent = {
          type: 'response.create',
          response: {
            modalities: ['audio', 'text'],
            instructions:
              'Begin now: greet the candidate, introduce yourself as the interviewer, summarize the role context, then ask the first interview question.'
          }
        };

        controlChannel.send(JSON.stringify(kickoffEvent));
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      traceWebRtc('peer:set-local-description', { sdpLength: offer.sdp?.length ?? 0 });
      await waitForIceGatheringComplete(peer);

      const localSdp = peer.localDescription?.sdp;
      traceWebRtc('peer:local-description-ready', { sdpLength: localSdp?.length ?? 0 });
      if (!localSdp) {
        throw new Error('Missing local SDP after ICE gathering');
      }

      traceWebRtc('session:request:start', { url: `${SERVER_URL}/session` });
      const sessionRes = await fetch(`${SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: localSdp, intake, avatarId: selectedAvatar?.id })
      });

      if (!sessionRes.ok) {
        const payload = (await sessionRes.json().catch(() => ({ error: 'Unknown server error' }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Session setup failed: ${sessionRes.status}`);
      }

      const { answerSdp } = (await sessionRes.json()) as { answerSdp: string };
      traceWebRtc('session:request:success', { answerSdpLength: answerSdp.length });
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      traceWebRtc('peer:set-remote-description');
      setStatus('connected');
      traceWebRtc('connect:completed');
    } catch (nextError) {
      traceWebRtc('connect:error', {
        message: nextError instanceof Error ? nextError.message : 'Failed to connect'
      });
      disconnect();
      setError(nextError instanceof Error ? nextError.message : 'Failed to connect');
    }
  }

  function disconnect() {
    traceWebRtc('disconnect:start', {
      hasLocalStream: Boolean(localStreamRef.current),
      hasPeer: Boolean(peerRef.current),
      hasRemoteStream: Boolean(remoteStreamRef.current)
    });
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    controlChannelRef.current?.close();
    controlChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setRemoteStream(null);
    setStageResetSignal((current) => current + 1);
    setStatus('idle');
    traceWebRtc('disconnect:completed');
  }

  return (
    <main>
      <h1>Dominion MVP</h1>
      <audio ref={remoteAudioRef} autoPlay playsInline controls />
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
        <h3>MakeHuman + Unity interviewer picker</h3>
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
            <div style={{ fontSize: 13, marginBottom: 6 }}>Camera feed (optional local coaching modules)</div>
            <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
          </div>
        </div>
        <AvatarStage
          unitySceneUrl={resolveAssetUrl(selectedAvatar?.unitySceneUrl)}
          thumbnailPath={resolveAssetUrl(selectedAvatar?.thumbnailPath)}
          remoteStream={remoteStream}
          localStream={localStream}
          resetSignal={stageResetSignal}
          sessionStatus={status}
        />
      </div>
    </main>
  );
}
