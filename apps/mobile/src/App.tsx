import { useEffect, useRef, useState } from 'react';
import { Button, SafeAreaView, Text, View } from 'react-native';
import { mediaDevices, RTCPeerConnection } from 'react-native-webrtc';
import type { AvatarCatalogEntry, InterviewIntake } from '@neurofang/shared';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://192.168.1.100:8787';

const defaultIntake: InterviewIntake = {
  company: 'Acme',
  jobTitle: 'Mobile Engineer',
  level: 'mid',
  difficulty: 'neutral',
  personality: 'friendly'
};

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
      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const res = await fetch(`${SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: offer.sdp, avatarId: avatar?.id, intake: defaultIntake })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: 'Unknown server error' }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Failed to connect: ${res.status}`);
      }

      const { answerSdp } = (await res.json()) as { answerSdp: string };
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
    setStatus('idle');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#111827', padding: 20 }}>
      <Text style={{ color: 'white', fontSize: 24, marginBottom: 10 }}>Neurofang Mobile MVP</Text>
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
        <Text style={{ color: '#e2e8f0' }}>3D avatar placeholder</Text>
        <Text style={{ color: '#94a3b8', marginTop: 8 }}>
          For production mobile 3D, use expo-three + @react-three/fiber/native and connect to the same lip-sync signal path used on web.
        </Text>
      </View>
    </SafeAreaView>
  );
}
