'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AvatarCatalogEntry, InterviewIntake } from '@neurofang/shared';
import { AvatarStage } from '../components/AvatarStage';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:8787';

const defaultIntake: InterviewIntake = {
  company: 'Acme',
  jobTitle: 'Frontend Engineer',
  level: 'mid',
  difficulty: 'medium',
  personality: 'friendly'
};

export default function Page() {
  const [intake, setIntake] = useState<InterviewIntake>(defaultIntake);
  const [avatars, setAvatars] = useState<AvatarCatalogEntry[]>([]);
  const [avatarId, setAvatarId] = useState<string>('');
  const [status, setStatus] = useState('idle');
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const selectedAvatar = useMemo(() => avatars.find((avatar) => avatar.id === avatarId), [avatars, avatarId]);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/avatars`)
      .then((res) => res.json())
      .then((data) => {
        setAvatars(data.avatars);
        if (data.avatars[0]) setAvatarId(data.avatars[0].id);
      });
  }, []);

  async function connect() {
    const peer = new RTCPeerConnection();
    peerRef.current = peer;
    setStatus('connecting');

    const userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    userStream.getTracks().forEach((track) => peer.addTrack(track, userStream));

    const remote = new MediaStream();
    peer.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => remote.addTrack(track));
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    const audio = document.getElementById('remote-audio') as HTMLAudioElement;
    if (audio) {
      audio.srcObject = remote;
      void audio.play();
    }

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    const sessionRes = await fetch(`${SERVER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp: offer.sdp, intake, avatarId })
    });

    const { answerSdp } = await sessionRes.json();
    await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    setStatus('connected');
  }

  function disconnect() {
    peerRef.current?.close();
    peerRef.current = null;
    setRemoteStream(null);
    setStatus('idle');
  }

  async function pickRandomAvatar() {
    const res = await fetch(`${SERVER_URL}/api/avatars/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludeIds: [avatarId] })
    });
    const data = await res.json();
    setAvatarId(data.avatar.id);
  }

  return (
    <main>
      <h1>Neurofang MVP</h1>
      <audio id="remote-audio" autoPlay playsInline />
      <div className="card">
        <h3>Interview intake</h3>
        <div className="grid">
          <label>Company<input value={intake.company} onChange={(e) => setIntake({ ...intake, company: e.target.value })} /></label>
          <label>Job title<input value={intake.jobTitle} onChange={(e) => setIntake({ ...intake, jobTitle: e.target.value })} /></label>
          <label>Level<select value={intake.level} onChange={(e) => setIntake({ ...intake, level: e.target.value as InterviewIntake['level'] })}><option>junior</option><option>mid</option><option>senior</option><option>staff</option></select></label>
          <label>Difficulty<select value={intake.difficulty} onChange={(e) => setIntake({ ...intake, difficulty: e.target.value as InterviewIntake['difficulty'] })}><option>easy</option><option>medium</option><option>hard</option></select></label>
          <label>Personality<select value={intake.personality} onChange={(e) => setIntake({ ...intake, personality: e.target.value as InterviewIntake['personality'] })}><option>friendly</option><option>neutral</option><option>challenging</option></select></label>
        </div>
      </div>

      <div className="card">
        <h3>Avatar picker</h3>
        <div className="avatar-grid">
          {avatars.map((avatar) => (
            <button key={avatar.id} className="avatar-tile" onClick={() => setAvatarId(avatar.id)} style={{ outline: avatarId === avatar.id ? '2px solid #60a5fa' : 'none' }}>
              <strong>{avatar.name}</strong>
              <div>{avatar.gender} · {avatar.raceGroup}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}><button onClick={pickRandomAvatar}>Pick random diverse avatar</button></div>
      </div>

      <div className="card stage">
        <div>
          <h3>Interview stage</h3>
          <p>Status: {status}</p>
          <button onClick={connect} disabled={status === 'connecting' || status === 'connected'}>Connect</button>
          <div style={{ height: 8 }} />
          <button onClick={disconnect}>Disconnect</button>
        </div>
        <AvatarStage glbPath={selectedAvatar?.glbPath ?? '/avatars/ava-01.glb'} remoteStream={remoteStream} />
      </div>
    </main>
  );
}
