import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AvatarCatalogEntry, InterviewIntake } from '@dominion/shared';

const defaultRealtimeIceServers: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://192.168.1.100:8787';
const SESSION_REQUEST_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_SESSION_REQUEST_TIMEOUT_MS ?? 25000);
const IS_EXPO_GO = Constants.appOwnership === 'expo';

type WebRtcModule = typeof import('react-native-webrtc');
type PeerConnection = InstanceType<WebRtcModule['RTCPeerConnection']>;
type RealtimeMediaStream = InstanceType<WebRtcModule['MediaStream']>;


type PeerEventName = 'icegatheringstatechange' | 'iceconnectionstatechange' | 'connectionstatechange';

function attachPeerEventListener(peer: PeerConnection, eventName: PeerEventName, listener: () => void) {
  const peerWithEvents = peer as PeerConnection & {
    addEventListener?: (event: string, listener: () => void) => void;
    removeEventListener?: (event: string, listener: () => void) => void;
  };

  if (typeof peerWithEvents.addEventListener === 'function') {
    peerWithEvents.addEventListener(eventName, listener);
    return () => {
      if (typeof peerWithEvents.removeEventListener === 'function') {
        peerWithEvents.removeEventListener(eventName, listener);
      }
    };
  }

  const fallbackHandlerKey = `on${eventName}`;
  (peer as unknown as Record<string, unknown>)[fallbackHandlerKey] = listener;
  return () => {
    (peer as unknown as Record<string, unknown>)[fallbackHandlerKey] = null;
  };
}

function getWebRtcModule(): WebRtcModule | null {
  if (IS_EXPO_GO) {
    return null;
  }

  return require('react-native-webrtc') as WebRtcModule;
}

const TRACE_WEBRTC =
  process.env.EXPO_PUBLIC_TRACE_WEBRTC === '1' || process.env.EXPO_PUBLIC_TRACE_WEBRTC === 'true';

function traceWebRtc(event: string, details?: Record<string, unknown>) {
  if (!TRACE_WEBRTC) {
    return;
  }

  const timestamp = new Date().toISOString();
  console.debug(`[trace:mobile][webrtc][${timestamp}] ${event}`, details ?? {});
}

const FALLBACK_THUMBNAIL = 'https://placehold.co/256x256/111826/f5f7fa?text=Avatar';

const defaultIntake: InterviewIntake = {
  company: 'Acme',
  jobTitle: 'Mobile Engineer',
  level: 'mid',
  difficulty: 'neutral',
  personality: 'friendly'
};

async function waitForIceGatheringComplete(peer: PeerConnection) {
  if (peer.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve) => {
    const onIceGatheringStateChange = () => {
      if (peer.iceGatheringState === 'complete') {
        detachIceGatheringStateChange();
        resolve();
      }
    };

    const detachIceGatheringStateChange = attachPeerEventListener(
      peer,
      'icegatheringstatechange',
      onIceGatheringStateChange
    );

    // Guard against a race where ICE reaches `complete` between the initial check
    // and listener registration, which would otherwise leave this promise unresolved.
    onIceGatheringStateChange();
  });
}

async function exchangeSessionSdp(
  peer: PeerConnection,
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
  const peerRef = useRef<PeerConnection | null>(null);
  const localStreamRef = useRef<RealtimeMediaStream | null>(null);
  const [intake, setIntake] = useState<InterviewIntake>(defaultIntake);
  const [avatars, setAvatars] = useState<AvatarCatalogEntry[]>([]);
  const [status, setStatus] = useState('idle');
  const [avatarId, setAvatarId] = useState<string>('pick-for-me');
  const [error, setError] = useState<string>('');

  const selectedAvatar = useMemo(
    () => avatars.find((nextAvatar) => nextAvatar.id === avatarId) ?? null,
    [avatars, avatarId]
  );

  useEffect(() => {
    void (async () => {
      try {
        setError('');
        const res = await fetch(`${SERVER_URL}/api/avatars`);
        if (!res.ok) {
          throw new Error(`Failed to load avatars: ${res.status}`);
        }

        const data = (await res.json()) as { avatars: AvatarCatalogEntry[] };
        setAvatars(data.avatars);
        await pickDiverseAvatar();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to initialize app');
      }
    })();
  }, []);

  async function pickDiverseAvatar() {
    try {
      setError('');
      const res = await fetch(`${SERVER_URL}/api/avatars/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeIds: selectedAvatar ? [selectedAvatar.id] : [] })
      });

      if (!res.ok) {
        throw new Error(`Failed to pick avatar: ${res.status}`);
      }

      const data = (await res.json()) as { avatar: AvatarCatalogEntry };
      setAvatarId(data.avatar.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load avatar');
    }
  }

  async function connect() {
    try {
      setError('');
      setStatus('connecting');
      traceWebRtc('connect:start', { avatarId: selectedAvatar?.id, intake });
      const webRtc = getWebRtcModule();
      if (!webRtc) {
        throw new Error('Expo Go cannot run this project (SDK/native modules mismatch). Build/open the custom development client with `npm run ios -w @dominion/mobile` or `npm run android -w @dominion/mobile`, then start Metro with `npm run start:dev-client -w @dominion/mobile`.');
      }

      const { RTCPeerConnection, mediaDevices } = webRtc;
      const peer = new RTCPeerConnection({ iceServers: defaultRealtimeIceServers });
      peerRef.current = peer;

      attachPeerEventListener(peer, 'icegatheringstatechange', () => {
        traceWebRtc('ice:gathering-state-change', { state: peer.iceGatheringState });
      });

      let hasRetriedIceRecovery = false;
      attachPeerEventListener(peer, 'iceconnectionstatechange', () => {
        const state = peer.iceConnectionState;
        traceWebRtc('ice:connection-state-change', { state });

        if ((state === 'disconnected' || state === 'failed') && !hasRetriedIceRecovery) {
          hasRetriedIceRecovery = true;
          traceWebRtc('ice:recovery:restart-requested', { state });
          void (async () => {
            try {
              await exchangeSessionSdp(peer, {
                reason: 'ice-restart',
                avatarId: selectedAvatar?.id,
                intake
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

      attachPeerEventListener(peer, 'connectionstatechange', () => {
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
        avatarId: selectedAvatar?.id,
        intake
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
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Dominion MVP</Text>
        <Text style={styles.status}>Status: {status}</Text>
      {IS_EXPO_GO ? (
          <Text style={styles.warning}>
          Running in Expo Go: this project uses native modules (react-native-webrtc), so Expo Go from the App Store is unsupported/incompatible. Open the custom development build instead.
        </Text>
      ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Interview intake</Text>
          <Text style={styles.label}>Company</Text>
          <TextInput value={intake.company} onChangeText={(company) => setIntake({ ...intake, company })} style={styles.input} />
          <Text style={styles.label}>Job title</Text>
          <TextInput value={intake.jobTitle} onChangeText={(jobTitle) => setIntake({ ...intake, jobTitle })} style={styles.input} />
          <ChoiceRow
            label="Level"
            options={['junior', 'mid', 'senior', 'staff']}
            selected={intake.level}
            onChange={(level) => setIntake({ ...intake, level: level as InterviewIntake['level'] })}
          />
          <ChoiceRow
            label="Difficulty"
            options={['friendly', 'neutral', 'tough']}
            selected={intake.difficulty}
            onChange={(difficulty) => setIntake({ ...intake, difficulty: difficulty as InterviewIntake['difficulty'] })}
          />
          <ChoiceRow
            label="Personality"
            options={['friendly', 'analytical', 'skeptical', 'executive']}
            selected={intake.personality}
            onChange={(personality) =>
              setIntake({ ...intake, personality: personality as InterviewIntake['personality'] })
            }
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>MakeHuman + Unity interviewer picker</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarList}>
            <AvatarTile
              title="Pick for me"
              subtitle="Diversity-aware default"
              selected={avatarId === 'pick-for-me'}
              onPress={() => {
                setAvatarId('pick-for-me');
                void pickDiverseAvatar();
              }}
            />
            {avatars.map((nextAvatar) => (
              <AvatarTile
                key={nextAvatar.id}
                title={nextAvatar.name}
                subtitle={`${nextAvatar.gender} · ${nextAvatar.raceGroup}`}
                selected={avatarId === nextAvatar.id}
                imageUri={nextAvatar.thumbnailPath ? `${SERVER_URL}${nextAvatar.thumbnailPath}` : FALLBACK_THUMBNAIL}
                onPress={() => setAvatarId(nextAvatar.id)}
              />
            ))}
          </ScrollView>
          <Pressable style={styles.primaryButton} onPress={() => void pickDiverseAvatar()}>
            <Text style={styles.primaryButtonText}>Pick random diverse avatar</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Interview stage</Text>
          <Text style={styles.meta}>Interviewer: {selectedAvatar?.name ?? 'Loading...'}</Text>
          {selectedAvatar ? (
            <Image
              source={{ uri: selectedAvatar.thumbnailPath ? `${SERVER_URL}${selectedAvatar.thumbnailPath}` : FALLBACK_THUMBNAIL }}
              style={styles.selectedAvatar}
            />
          ) : null}
          <Pressable style={styles.primaryButton} onPress={connect} disabled={status !== 'idle'}>
            <Text style={styles.primaryButtonText}>Connect</Text>
          </Pressable>
          <View style={styles.gap} />
          <Pressable style={styles.secondaryButton} onPress={disconnect} disabled={status === 'idle'}>
            <Text style={styles.secondaryButtonText}>Disconnect</Text>
          </Pressable>
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>MakeHuman + Unity interviewer placeholder</Text>
            <Text style={styles.placeholderText}>
          For production mobile rendering, load the selected Unity scene URL in a WebView and send stage-state messages (speech/listening) to drive MakeHuman rig animations.
        </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceRow({
  label,
  options,
  selected,
  onChange
}: {
  label: string;
  options: string[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.choiceBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const isSelected = option === selected;
          return (
            <Pressable
              key={option}
              style={[styles.choiceChip, isSelected ? styles.choiceChipSelected : null]}
              onPress={() => onChange(option)}
            >
              <Text style={[styles.choiceChipLabel, isSelected ? styles.choiceChipLabelSelected : null]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AvatarTile({
  title,
  subtitle,
  selected,
  onPress,
  imageUri
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  imageUri?: string;
}) {
  return (
    <Pressable style={[styles.avatarTile, selected ? styles.avatarTileSelected : null]} onPress={onPress}>
      {imageUri ? <Image source={{ uri: imageUri }} style={styles.avatarThumbnail} /> : null}
      <Text style={styles.avatarTitle}>{title}</Text>
      <Text style={styles.avatarSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#10151f' },
  content: { padding: 20, gap: 16 },
  title: { color: '#f5f7fa', fontSize: 30, fontWeight: '700' },
  status: { color: '#cbd5e1' },
  warning: { color: '#fde68a' },
  error: { color: '#fca5a5' },
  card: {
    backgroundColor: '#182130',
    borderColor: '#29384c',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8
  },
  cardTitle: { color: '#f5f7fa', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  label: { color: '#cbd5e1', fontSize: 14 },
  input: {
    borderColor: '#324862',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#f5f7fa',
    backgroundColor: '#111826'
  },
  choiceBlock: { gap: 8, marginTop: 4 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: {
    borderColor: '#324862',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#111826'
  },
  choiceChipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  choiceChipLabel: { color: '#cbd5e1', textTransform: 'capitalize' },
  choiceChipLabelSelected: { color: '#f5f7fa' },
  avatarList: { marginBottom: 12 },
  avatarTile: {
    width: 136,
    borderColor: '#2b3f59',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginRight: 10,
    backgroundColor: '#111826'
  },
  avatarTileSelected: { borderColor: '#60a5fa', borderWidth: 2 },
  avatarThumbnail: { width: '100%', height: 90, borderRadius: 8, marginBottom: 8 },
  avatarTitle: { color: '#f5f7fa', fontWeight: '600' },
  avatarSubtitle: { color: '#9fb1c8', fontSize: 12, marginTop: 4 },
  selectedAvatar: { width: 120, height: 120, borderRadius: 8, borderColor: '#334a67', borderWidth: 1 },
  meta: { color: '#cbd5e1' },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center'
  },
  primaryButtonText: { color: '#f5f7fa', fontWeight: '600' },
  secondaryButton: {
    backgroundColor: '#111826',
    borderRadius: 8,
    borderColor: '#324862',
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center'
  },
  secondaryButtonText: { color: '#f5f7fa', fontWeight: '600' },
  gap: { height: 4 },
  placeholder: { marginTop: 12, borderColor: '#334155', borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  placeholderTitle: { color: '#e2e8f0' },
  placeholderText: { color: '#94a3b8' }
});
