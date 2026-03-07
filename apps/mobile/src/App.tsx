import { useEffect, useRef, useState } from 'react';
import { Button, SafeAreaView, Text, View } from 'react-native';
import { mediaDevices, RTCPeerConnection } from 'react-native-webrtc';
import type { AvatarCatalogEntry, InterviewIntake } from '@dominion/shared';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://192.168.1.100:8787';


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

      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      traceWebRtc('media:get-user-media:success', {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length
      });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

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
      const res = await fetch(`${SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: localSdp, avatarId: avatar?.id, intake: defaultIntake })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: 'Unknown server error' }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Failed to connect: ${res.status}`);
      }

      const { answerSdp } = (await res.json()) as { answerSdp: string };
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
