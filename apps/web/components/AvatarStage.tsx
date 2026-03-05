'use client';

import { useEffect, useState } from 'react';
import { useRef } from 'react';

type Props = {
  synthesiaEmbedUrl: string;
  thumbnailPath: string;
  remoteStream?: MediaStream | null;
  resetSignal?: number;
};

const FALLBACK_THUMBNAIL = '/avatars/placeholder.svg';

export function AvatarStage({ synthesiaEmbedUrl, thumbnailPath, remoteStream, resetSignal = 0 }: Props) {
  const [imageSrc, setImageSrc] = useState(thumbnailPath);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [hasEmbedError, setHasEmbedError] = useState(false);
  const iframeKeyRef = useRef(0);

  useEffect(() => {
    setImageSrc(thumbnailPath);
  }, [thumbnailPath]);

  useEffect(() => {
    iframeKeyRef.current += 1;
    setHasEmbedError(false);
  }, [synthesiaEmbedUrl, resetSignal]);

  useEffect(() => {
    if (!remoteStream) {
      setSpeechLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(remoteStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }

    const samples = new Uint8Array(analyser.fftSize);
    let smoothed = 0;
    let rafId = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let squareSum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        squareSum += normalized * normalized;
      }

      const rms = Math.sqrt(squareSum / samples.length);
      const target = Math.min(1, rms * 6.5);
      smoothed += (target - smoothed) * 0.25;
      setSpeechLevel(smoothed);
      rafId = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.cancelAnimationFrame(rafId);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
    };
  }, [remoteStream, resetSignal]);

  return (
    <div className="stage-canvas-wrap" style={{ width: '100%' }}>
      {!hasEmbedError ? (
        <iframe
          key={iframeKeyRef.current}
          src={synthesiaEmbedUrl}
          style={{ width: '100%', height: 560, borderRadius: 12, overflow: 'hidden', border: '1px solid #2b3f59' }}
          allow="autoplay; fullscreen"
          title="Synthesia interviewer"
          onError={() => setHasEmbedError(true)}
        />
      ) : null}
      {hasEmbedError ? (
        <div className="stage-fallback">
          <img src={imageSrc} alt="Interviewer preview" className="stage-fallback-image" onError={() => setImageSrc(FALLBACK_THUMBNAIL)} />
          <p>Synthesia embed could not load. Using generated thumbnail fallback.</p>
        </div>
      ) : null}
      <div style={{ marginTop: 8, fontSize: 12, color: '#93c5fd' }}>
        Voice activity:{' '}
        <span style={{ color: '#e2e8f0' }}>{Math.round(speechLevel * 100)}%</span>
      </div>
    </div>
  );
}
