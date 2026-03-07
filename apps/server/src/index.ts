import 'dotenv/config';
import cors from 'cors';
import express from 'express';

import fs from 'node:fs';
import path from 'node:path';
import type {
  AvatarPickRequest,
  InterviewDifficulty,
  InterviewPersonality,
  RealtimeSessionRequest
} from '@dominion/shared';
import { avatarCatalog } from './avatarCatalog.js';
import { pickAvatar } from './avatarPicker.js';
import { loadRecentAvatars } from './recentAvatarStore.js';

const app = express();
const PORT = Number(process.env.PORT ?? 8787);

const allowedDifficulties: InterviewDifficulty[] = ['friendly', 'neutral', 'tough'];
const allowedPersonalities: InterviewPersonality[] = ['friendly', 'analytical', 'skeptical', 'executive'];

const configuredRealtimeModel = process.env.OPENAI_REALTIME_MODEL?.trim();
const realtimeModel = configuredRealtimeModel === 'gpt-4o-realtime-preview'
  ? 'gpt-realtime'
  : configuredRealtimeModel || 'gpt-realtime';
const realtimeVoice = process.env.OPENAI_REALTIME_VOICE ?? 'alloy';


const TRACE_WEBRTC = process.env.TRACE_WEBRTC === '1' || process.env.TRACE_WEBRTC === 'true';

function traceWebRtc(event: string, details?: Record<string, unknown>) {
  if (!TRACE_WEBRTC) {
    return;
  }

  const timestamp = new Date().toISOString();
  console.log(`[trace:server][webrtc][${timestamp}] ${event}`, details ?? {});
}

function normalizeDifficulty(value: unknown): InterviewDifficulty {
  return allowedDifficulties.includes(value as InterviewDifficulty) ? (value as InterviewDifficulty) : 'neutral';
}

function normalizePersonality(value: unknown): InterviewPersonality {
  return allowedPersonalities.includes(value as InterviewPersonality)
    ? (value as InterviewPersonality)
    : 'friendly';
}

loadRecentAvatars();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const avatarAssetDirectories = [
  path.resolve(process.cwd(), 'apps/server/public/avatars'),
  path.resolve(process.cwd(), 'apps/web/public/avatars')
];

for (const assetDirectory of avatarAssetDirectories) {
  if (fs.existsSync(assetDirectory)) {
    app.use('/avatars', express.static(assetDirectory));
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/avatars', (_req, res) => {
  res.json({ avatars: avatarCatalog });
});

app.post('/api/avatars/pick', (req, res) => {
  const request = (req.body ?? {}) as AvatarPickRequest;
  const avatar = pickAvatar(request);
  res.json({ avatar });
});

async function generateAvatarThumbnail(avatarId: string) {
  const avatar = avatarCatalog.find((item) => item.id === avatarId);
  if (!avatar) {
    return null;
  }

  for (const assetDirectory of avatarAssetDirectories) {
    const localAvatarThumbnailPath = path.join(assetDirectory, `${avatar.id}.svg`);
    if (fs.existsSync(localAvatarThumbnailPath)) {
      return localAvatarThumbnailPath;
    }
  }

  return null;
}

app.get('/api/avatars/:avatarId/thumbnail', async (req, res) => {
  const avatar = avatarCatalog.find((item) => item.id === req.params.avatarId);
  if (!avatar) {
    res.status(404).json({ error: 'Avatar not found' });
    return;
  }

  try {
    const generatedImagePath = await generateAvatarThumbnail(avatar.id);
    if (generatedImagePath && fs.existsSync(generatedImagePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(generatedImagePath);
      return;
    }
  } catch (error) {
    console.warn(`Failed generating thumbnail for ${avatar.id}:`, error);
  }

  const fallbackPath = path.resolve(process.cwd(), 'apps/web/public/avatars/placeholder.svg');
  if (fs.existsSync(fallbackPath)) {
    res.sendFile(fallbackPath);
    return;
  }

  res.status(404).json({ error: 'No thumbnail available for avatar' });
});

app.post('/session', async (req, res) => {
  traceWebRtc('session:request:received', {
    hasSdp: Boolean((req.body as RealtimeSessionRequest | undefined)?.sdp),
    avatarId: (req.body as RealtimeSessionRequest | undefined)?.avatarId ?? null
  });
  const body = req.body as RealtimeSessionRequest;
  if (!body?.sdp) {
    traceWebRtc('session:request:invalid', { reason: 'missing_sdp' });
    res.status(400).json({ error: 'Missing SDP offer in body.sdp' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    traceWebRtc('session:request:invalid', { reason: 'missing_openai_api_key' });
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    return;
  }

  const selectedAvatar = avatarCatalog.find((avatar) => avatar.id === body.avatarId);
  const intake = body.intake;
  const difficultyLabel = normalizeDifficulty(intake?.difficulty);
  const personalityLabel = normalizePersonality(intake?.personality);
  const roleAtCompany = intake?.jobTitle?.trim() || 'Senior Interview Lead';
  const yearsExperience =
    intake?.level === 'junior'
      ? '4'
      : intake?.level === 'mid'
        ? '7'
        : intake?.level === 'senior'
          ? '11'
          : '14';

  const sessionInstructions = [
    'You are Dominion, a business-professional mock interviewer for technical interviews.',
    'Speak in English by default unless the candidate explicitly asks to switch languages.',
    `Use a ${difficultyLabel} interview difficulty and a ${personalityLabel} interviewer personality.`,
    'Stay respectful, concise, and realistic. Ask one question at a time and wait for the answer.',
    selectedAvatar
      ? `Interviewer profile: ${selectedAvatar.name}, ${selectedAvatar.gender}, ${selectedAvatar.raceGroup}.`
      : 'Interviewer profile: use a neutral professional tone.',
    `At the start of the call, immediately deliver a warm spoken introduction as the interviewer: introduce yourself by name, state your role as ${roleAtCompany}, and mention that you have ${yearsExperience} years of experience.`,
    'Then briefly explain the company mission, the department, and the key team members the candidate would collaborate with.',
    'Then explain the open role being interviewed for, including major responsibilities and expectations.',
    'After this introduction, begin the interview immediately by asking the first relevant interview question.',
    `Intake: ${JSON.stringify(intake ?? {})}`
  ].join(' ');

  const createSessionPayload = () => {
    return {
      type: 'realtime',
      model: realtimeModel,
      audio: {
        input: {
          turn_detection: {
            type: 'server_vad',
            create_response: false,
            interrupt_response: true
          }
        },
        output: {
          format: {
            type: 'audio/pcm',
            rate_hz: 24000
          },
          voice: realtimeVoice
        }
      },
      instructions: sessionInstructions
    };
  };

  const callOpenAiRealtime = async (sessionPayload: Record<string, unknown>) => {
    const form = new FormData();
    form.append('sdp', body.sdp);
    form.append('session', JSON.stringify(sessionPayload));

    return fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });
  };

  try {
    traceWebRtc('openai:request:start', {
      model: realtimeModel,
      voice: realtimeVoice,
      difficulty: difficultyLabel,
      personality: personalityLabel,
      sdpLength: body.sdp.length
    });

    const response = await callOpenAiRealtime(createSessionPayload());

    if (!response.ok) {
      const text = await response.text();
      traceWebRtc('openai:request:failure', {
        status: response.status,
        bodyLength: text.length,
        bodyPreview: text.slice(0, 500)
      });
      res.status(response.status).json({ error: text });
      return;
    }

    const answerSdp = await response.text();
    traceWebRtc('openai:request:success', { answerSdpLength: answerSdp.length });
    res.json({ answerSdp });
  } catch (error) {
    traceWebRtc('openai:request:error', { message: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.listen(PORT, () => {
  console.log(`Dominion server listening on http://localhost:${PORT}`);
  if (configuredRealtimeModel === 'gpt-4o-realtime-preview') {
    console.warn(
      'OPENAI_REALTIME_MODEL is set to deprecated gpt-4o-realtime-preview; automatically using gpt-realtime instead.'
    );
  }
  traceWebRtc('server:trace-enabled', { enabled: TRACE_WEBRTC });
});
