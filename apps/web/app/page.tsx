'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function findTranscript(event: Record<string, unknown>): string | null {
  const directTranscript = toText(event.transcript) ?? toText(event.delta) ?? toText(event.text);
  if (directTranscript) {
    return directTranscript;
  }

  const rootContent = event.content;
  if (Array.isArray(rootContent)) {
    for (const entry of rootContent) {
      const contentEntry = asRecord(entry);
      if (!contentEntry) {
        continue;
      }

      const contentTranscript =
        toText(contentEntry.transcript) ?? toText(contentEntry.text) ?? toText(contentEntry.delta);
      if (contentTranscript) {
        return contentTranscript;
      }
    }
  }

  const item = asRecord(event.item);
  if (item) {
    const itemTranscript = toText(item.transcript) ?? toText(item.text);
    if (itemTranscript) {
      return itemTranscript;
    }

    const content = item.content;
    if (Array.isArray(content)) {
      for (const entry of content) {
        const contentEntry = asRecord(entry);
        if (!contentEntry) {
          continue;
        }

        const contentTranscript =
          toText(contentEntry.transcript) ?? toText(contentEntry.text) ?? toText(contentEntry.delta);
        if (contentTranscript) {
          return contentTranscript;
        }
      }
    }
  }

  return null;
}

function describeTrack(track: MediaStreamTrack) {
  return {
    id: track.id,
    kind: track.kind,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
    label: track.label
  };
}

type MicrophoneTraceController = {
  stop: () => void;
};

function monitorMicrophoneInput(stream: MediaStream): MicrophoneTraceController | null {
  if (!TRACE_WEBRTC) {
    return null;
  }

  const [audioTrack] = stream.getAudioTracks();
  if (!audioTrack) {
    traceWebRtc('microphone:monitor:skipped', { reason: 'missing-audio-track' });
    return null;
  }

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    traceWebRtc('microphone:monitor:skipped', { reason: 'audio-context-not-supported' });
    return null;
  }

  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const pcm = new Uint8Array(analyser.fftSize);
  const speechFloor = 0.02;
  let recentPeak = 0;
  let speaking = false;
  let segmentStartedAt = 0;

  traceWebRtc('microphone:monitor:started', {
    sampleRate: audioContext.sampleRate,
    audioTrackId: audioTrack.id,
    audioTrackLabel: audioTrack.label
  });

  const meterInterval = window.setInterval(() => {
    analyser.getByteTimeDomainData(pcm);

    let sumSquares = 0;
    for (let index = 0; index < pcm.length; index += 1) {
      const normalized = (pcm[index] - 128) / 128;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / pcm.length);
    recentPeak = Math.max(recentPeak, rms);

    traceWebRtc('microphone:input:level', {
      rms: Number(rms.toFixed(4)),
      peak: Number(recentPeak.toFixed(4)),
      speechDetected: rms >= speechFloor
    });

    if (rms >= speechFloor && !speaking) {
      speaking = true;
      segmentStartedAt = Date.now();
      traceWebRtc('microphone:input:speech-started', {
        rms: Number(rms.toFixed(4)),
        threshold: speechFloor
      });
      return;
    }

    if (rms < speechFloor && speaking) {
      speaking = false;
      const durationMs = Math.max(0, Date.now() - segmentStartedAt);
      traceWebRtc('microphone:input:speech-ended', {
        durationMs,
        peak: Number(recentPeak.toFixed(4))
      });
      recentPeak = 0;
    }
  }, 500);

  return {
    stop: () => {
      window.clearInterval(meterInterval);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
      traceWebRtc('microphone:monitor:stopped', { audioTrackId: audioTrack.id });
    }
  };
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
  const [interviewerStatus, setInterviewerStatus] = useState('idle');
  const [candidateTranscript, setCandidateTranscript] = useState('');
  const [interviewerTranscript, setInterviewerTranscript] = useState('');
  const aiTranscriptBufferRef = useRef<string>('');
  const userTranscriptBufferRef = useRef<string>('');
  const mediaTraceCleanupRef = useRef<(() => void) | null>(null);
  const microphoneTraceCleanupRef = useRef<(() => void) | null>(null);

  const selectedAvatar = useMemo(
    () => avatars.find((avatar) => avatar.id === avatarId) ?? avatars[0],
    [avatars, avatarId]
  );


  const handleInterviewerStatusChange = useCallback(
    (nextInterviewerStatus: string) => {
      setInterviewerStatus(nextInterviewerStatus);
      traceWebRtc('interviewer:status:changed', { interviewerStatus: nextInterviewerStatus });
    },
    []
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
      disconnect('pagehide');
    };

    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);


  function monitorLocalMediaTracks(stream: MediaStream) {
    mediaTraceCleanupRef.current?.();

    const listeners: Array<() => void> = [];
    stream.getTracks().forEach((track) => {
      const onMute = () => traceWebRtc(`media:${track.kind}:muted`, describeTrack(track));
      const onUnmute = () => traceWebRtc(`media:${track.kind}:unmuted`, describeTrack(track));
      const onEnded = () => traceWebRtc(`media:${track.kind}:ended`, describeTrack(track));

      track.addEventListener('mute', onMute);
      track.addEventListener('unmute', onUnmute);
      track.addEventListener('ended', onEnded);

      listeners.push(() => {
        track.removeEventListener('mute', onMute);
        track.removeEventListener('unmute', onUnmute);
        track.removeEventListener('ended', onEnded);
      });

      traceWebRtc(`media:${track.kind}:ready`, describeTrack(track));
    });

    mediaTraceCleanupRef.current = () => {
      listeners.forEach((cleanup) => cleanup());
      mediaTraceCleanupRef.current = null;
    };
  }

  async function connect() {
    try {
      setError('');
      setStageResetSignal((current) => current + 1);
      setInterviewerStatus('idle');
      setCandidateTranscript('');
      setInterviewerTranscript('');
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
      monitorLocalMediaTracks(userStream);
      microphoneTraceCleanupRef.current?.();
      microphoneTraceCleanupRef.current = monitorMicrophoneInput(userStream)?.stop ?? null;
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
      controlChannel.onerror = (event) => {
        traceWebRtc('datachannel:error', { event });
      };
      controlChannel.onclose = () => {
        traceWebRtc('datachannel:closed');
      };
      controlChannel.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as unknown;
          const parsed = asRecord(payload);
          if (!parsed) {
            return;
          }

          const type = toText(parsed.type);
          if (!type) {
            return;
          }

          traceWebRtc('datachannel:event', { type });

          if (
            type.startsWith('input_audio_') ||
            type.startsWith('conversation.item.input_audio_')
          ) {
            traceWebRtc('microphone:event', { type, payload: parsed });
          }

          const candidateDeltaTypes = new Set([
            'input_audio_transcription.partial',
            'input_audio_transcription.delta',
            'conversation.item.input_audio_transcription.partial',
            'conversation.item.input_audio_transcription.delta'
          ]);

          const candidateFinalTypes = new Set([
            'conversation.item.input_audio_transcription.completed',
            'input_audio_transcription.completed'
          ]);

          if (type === 'input_audio_buffer.speech_started') {
            userTranscriptBufferRef.current = '';
            setCandidateTranscript('');
            setInterviewerStatus('listening');
            traceWebRtc('interviewer:behavior:listening', { type });
            return;
          }

          if (type === 'response.output_audio.started') {
            aiTranscriptBufferRef.current = '';
            setInterviewerTranscript('');
            setInterviewerStatus('talking');
            traceWebRtc('interviewer:behavior:talking', { type });
            return;
          }

          if (type === 'response.created' || type === 'response.create') {
            setInterviewerStatus('thinking');
            return;
          }

          if (type === 'response.output_audio.done') {
            setInterviewerStatus('listening');
            return;
          }

          if (type === 'response.audio_transcript.delta' || type === 'response.output_text.delta') {
            const delta = findTranscript(parsed);
            if (!delta) {
              return;
            }

            aiTranscriptBufferRef.current = `${aiTranscriptBufferRef.current}${delta}`;
            setInterviewerTranscript(aiTranscriptBufferRef.current);
            traceWebRtc('interviewer:speech:delta', {
              type,
              text: delta,
              aggregate: aiTranscriptBufferRef.current
            });
            return;
          }

          if (type === 'response.audio_transcript.done' || type === 'response.output_text.done') {
            const transcript = findTranscript(parsed) ?? aiTranscriptBufferRef.current;
            if (!transcript) {
              return;
            }

            setInterviewerTranscript(transcript);
            traceWebRtc('interviewer:speech:final', {
              type,
              text: transcript
            });
            aiTranscriptBufferRef.current = '';
            return;
          }

          if (candidateFinalTypes.has(type)) {
            const transcript = findTranscript(parsed);
            if (!transcript) {
              return;
            }

            userTranscriptBufferRef.current = transcript;
            setCandidateTranscript(transcript);
            traceWebRtc('candidate:speech:final', {
              type,
              text: transcript
            });
            return;
          }

          if (candidateDeltaTypes.has(type)) {
            const delta = findTranscript(parsed);
            if (!delta) {
              return;
            }

            userTranscriptBufferRef.current = `${userTranscriptBufferRef.current}${delta}`;
            setCandidateTranscript(userTranscriptBufferRef.current);
            traceWebRtc('candidate:speech:delta', {
              type,
              text: delta,
              aggregate: userTranscriptBufferRef.current
            });
          }
        } catch (parseError) {
          traceWebRtc('datachannel:message:parse-error', {
            message: parseError instanceof Error ? parseError.message : 'unknown-parse-error',
            raw: String(event.data)
          });
        }
      };
      controlChannel.onopen = () => {
        traceWebRtc('datachannel:open');
        setInterviewerStatus('thinking');
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
      disconnect('connect-error');
      setError(nextError instanceof Error ? nextError.message : 'Failed to connect');
    }
  }

  function disconnect(reason = 'internal') {
    traceWebRtc('disconnect:start', {
      reason,
      hasLocalStream: Boolean(localStreamRef.current),
      hasPeer: Boolean(peerRef.current),
      hasRemoteStream: Boolean(remoteStreamRef.current)
    });
    localStreamRef.current?.getTracks().forEach((track) => {
      traceWebRtc(`media:${track.kind}:stop`, describeTrack(track));
      track.stop();
    });
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
    setInterviewerStatus('idle');
    setCandidateTranscript('');
    setInterviewerTranscript('');
    setStatus('idle');
    mediaTraceCleanupRef.current?.();
    microphoneTraceCleanupRef.current?.();
    microphoneTraceCleanupRef.current = null;
    traceWebRtc('disconnect:completed', { reason });
  }

  function handleDisconnectClick() {
    traceWebRtc('disconnect:click', { status });
    disconnect('user-click');
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
          <p>Interviewer status: {interviewerStatus}</p>
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
          <button onClick={handleDisconnectClick} disabled={status === 'idle'}>Disconnect</button>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13 }}>
              <strong>Candidate heard:</strong> {candidateTranscript || '—'}
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>Interviewer said:</strong> {interviewerTranscript || '—'}
            </div>
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
          onInterviewerStatusChange={handleInterviewerStatusChange}
        />
      </div>
    </main>
  );
}
