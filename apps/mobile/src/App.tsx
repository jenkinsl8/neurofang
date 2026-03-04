import { useRef, useState } from 'react';
import { Button, SafeAreaView, Text, View } from 'react-native';
import { mediaDevices, RTCPeerConnection } from 'react-native-webrtc';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://192.168.1.100:8787';

export default function App() {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState('idle');

  async function connect() {
    setStatus('connecting');
    const peer = new RTCPeerConnection();
    peerRef.current = peer;

    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    const res = await fetch(`${SERVER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp: offer.sdp })
    });
    const { answerSdp } = await res.json();
    await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    setStatus('connected');
  }

  function disconnect() {
    peerRef.current?.close();
    peerRef.current = null;
    setStatus('idle');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#111827', padding: 20 }}>
      <Text style={{ color: 'white', fontSize: 24, marginBottom: 10 }}>Neurofang Mobile MVP</Text>
      <Text style={{ color: '#cbd5e1', marginBottom: 20 }}>Status: {status}</Text>
      <Button title="Connect" onPress={connect} />
      <View style={{ height: 12 }} />
      <Button title="Disconnect" onPress={disconnect} />
      <View style={{ marginTop: 24, padding: 12, borderColor: '#334155', borderWidth: 1, borderRadius: 8 }}>
        <Text style={{ color: '#e2e8f0' }}>3D avatar placeholder</Text>
        <Text style={{ color: '#94a3b8', marginTop: 8 }}>
          To enable 3D on mobile later, render RPM GLBs using expo-three + @react-three/fiber/native and reuse the lip sync signals.
        </Text>
      </View>
    </SafeAreaView>
  );
}
