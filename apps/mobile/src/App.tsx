import { useEffect, useRef, useState } from 'react';
import { Button, SafeAreaView, Text, View } from 'react-native';
import { mediaDevices, RTCPeerConnection } from 'react-native-webrtc';
import { defaultRealtimeIceServers, type AvatarCatalogEntry, type InterviewIntake } from '@dominion/shared';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://192.168.1.100:8787';
const SESSION_REQUEST_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_SESSION_REQUEST_TIMEOUT_MS ?? 25000);


const TRACE_WEBRTC =
  process.env.EXPO_PUBLIC_TRACE_WEBRTC === '1' || process.env.EXPO_PUBLIC_TRACE_WEBRTC === 'true';

function traceWebRtc(event: string, details?: Record<string, unknown>) {
  if (!TRACE_WEBRTC) {
    return;
  }

  const timestamp = new Date().toISOString();
  console.debug(`[trace:mobile][webrtc][${timestamp}] ${event}`, details ?? {});
}

const defaultIntake: InterviewIntake = {
  company: 'Acme',
  jobTitle: 'Mobile Engineer',
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

async function exchangeSessionSdp(
  peer: RTCPeerConnection,
  options: {
    intake: InterviewIntake;
    avatarId: string | undefined;
    reason: 'initial' | 'ice-restart';
  }
) {
  traceWebRtc('signaling:exchange:start', {
    reason: options.reason,
    signalingState: peer.signalingState,
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState,
    iceGatheringState: peer.iceGatheringState
  });

  const offer = await peer.createOffer(options.reason === 'ice-restart' ? { iceRestart: true } : undefined);
  traceWebRtc('signaling:offer:created', { reason: options.reason, sdpLength: offer.sdp?.length ?? 0 });

  await peer.setLocalDescription(offer);
  traceWebRtc('signaling:offer:set-local-description', {
    reason: options.reason,
    signalingState: peer.signalingState,
    iceGatheringState: peer.iceGatheringState
  });

  traceWebRtc('signaling:ice-gathering:wait:start', { reason: options.reason });
  await waitForIceGatheringComplete(peer);
  traceWebRtc('signaling:ice-gathering:wait:done', {
    reason: options.reason,
    iceGatheringState: peer.iceGatheringState
  });

  const localSdp = peer.localDescription?.sdp;
  traceWebRtc('signaling:offer:ready', { reason: options.reason, sdpLength: localSdp?.length ?? 0 });
  if (!localSdp) {
    throw new Error(`Missing local SDP for ${options.reason}`);
  }

  traceWebRtc('session:request:start', {
    reason: options.reason,
    url: `${SERVER_URL}/session`,
    timeoutMs: SESSION_REQUEST_TIMEOUT_MS
  });
  const sessionRequestController = new AbortController();
  const sessionRequestTimeout = setTimeout(() => sessionRequestController.abort(), SESSION_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp: localSdp, avatarId: options.avatarId, intake: options.intake }),
      signal: sessionRequestController.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      traceWebRtc('session:request:timeout', { reason: options.reason, timeoutMs: SESSION_REQUEST_TIMEOUT_MS });
      throw new Error(`Session request timed out after ${SESSION_REQUEST_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(sessionRequestTimeout);
  }

  traceWebRtc('session:request:response', { reason: options.reason, status: res.status, ok: res.ok });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({ error: 'Unknown server error' }))) as { error?: string };
    traceWebRtc('session:request:failure', { reason: options.reason, error: payload.error ?? null });
    throw new Error(payload.error ?? `Session setup failed: ${res.status}`);
  }

  const { answerSdp } = (await res.json()) as { answerSdp: string };
  traceWebRtc('session:request:success', { reason: options.reason, answerSdpLength: answerSdp.length });

  await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  traceWebRtc('signaling:answer:set-remote-description', {
    reason: options.reason,
    signalingState: peer.signalingState,
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState
  });
}

export default function App() {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState('idle');
  const [avatar, setAvatar] = useState<AvatarCatalogEntry | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    void pickDiverseAvatar();
  }, []);

  async function pickDiverseAvatar() {
    try {
      setError('');
      const res = await fetch(`${SERVER_URL}/api/avatars/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeIds: avatar ? [avatar.id] : [] })
      });

      if (!res.ok) {
        throw new Error(`Failed to pick avatar: ${res.status}`);
      }

      const data = (await res.json()) as { avatar: AvatarCatalogEntry };
      setAvatar(data.avatar);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load avatar');
    }
  }

  async function connect() {
    try {
      setError('');
      setStatus('connecting');
      traceWebRtc('connect:start', { avatarId: avatar?.id });
      const peer = new RTCPeerConnection({ iceServers: [...defaultRealtimeIceServers] });
      peerRef.current = peer;

      peer.addEventListener('icegatheringstatechange', () => {
        traceWebRtc('ice:gathering-state-change', { state: peer.iceGatheringState });
      });

      let hasRetriedIceRecovery = false;
      peer.addEventListener('iceconnectionstatechange', () => {
        const state = peer.iceConnectionState;
        traceWebRtc('ice:connection-state-change', { state });

        if ((state === 'disconnected' || state === 'failed') && !hasRetriedIceRecovery) {
          hasRetriedIceRecovery = true;
          traceWebRtc('ice:recovery:restart-requested', { state });
          void (async () => {
            try {
              await exchangeSessionSdp(peer, {
                reason: 'ice-restart',
                avatarId: avatar?.id,
                intake: defaultIntake
              });
              traceWebRtc('ice:recovery:restart-succeeded');
            } catch (iceRecoveryError) {
              traceWebRtc('ice:recovery:restart-failed', {
                message: iceRecoveryError instanceof Error ? iceRecoveryError.message : 'Unknown error'
              });
            }
          })();
        }
      });

      peer.addEventListener('connectionstatechange', () => {
        traceWebRtc('peer:connection-state-change', { state: peer.connectionState });
      });

      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      traceWebRtc('media:get-user-media:success', {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length
      });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      await exchangeSessionSdp(peer, {
        reason: 'initial',
        avatarId: avatar?.id,
        intake: defaultIntake
      });
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
      hasPeer: Boolean(peerRef.current)
    });
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    setStatus('idle');
    traceWebRtc('disconnect:completed');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#111827', padding: 20 }}>
      <Text style={{ color: 'white', fontSize: 24, marginBottom: 10 }}>Dominion Mobile MVP</Text>
      <Text style={{ color: '#cbd5e1', marginBottom: 8 }}>Status: {status}</Text>
      {error ? <Text style={{ color: '#fca5a5', marginBottom: 8 }}>{error}</Text> : null}
      <Text style={{ color: '#cbd5e1', marginBottom: 20 }}>
        Interviewer: {avatar ? `${avatar.name} (${avatar.gender}, ${avatar.raceGroup})` : 'Loading...'}
      </Text>
      <Button title="Pick for me" onPress={() => void pickDiverseAvatar()} />
      <View style={{ height: 12 }} />
      <Button title="Connect" onPress={connect} disabled={status !== 'idle'} />
      <View style={{ height: 12 }} />
      <Button title="Disconnect" onPress={disconnect} disabled={status === 'idle'} />
      <View style={{ marginTop: 24, padding: 12, borderColor: '#334155', borderWidth: 1, borderRadius: 8 }}>
        <Text style={{ color: '#e2e8f0' }}>MakeHuman + Unity interviewer placeholder</Text>
        <Text style={{ color: '#94a3b8', marginTop: 8 }}>
          For production mobile rendering, load the selected Unity scene URL in a WebView and send stage-state messages (speech/listening) to drive MakeHuman rig animations.
        </Text>
      </View>
    </SafeAreaView>
  );
}
