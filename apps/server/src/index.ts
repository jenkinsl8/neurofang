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
const generatedAvatarDirectory = path.resolve(process.cwd(), 'apps/server/data/generated-avatars');

function normalizeDifficulty(value: unknown): InterviewDifficulty {
  return allowedDifficulties.includes(value as InterviewDifficulty) ? (value as InterviewDifficulty) : 'neutral';
}

function normalizePersonality(value: unknown): InterviewPersonality {
  return allowedPersonalities.includes(value as InterviewPersonality)
    ? (value as InterviewPersonality)
    : 'friendly';
}

loadRecentAvatars();
fs.mkdirSync(generatedAvatarDirectory, { recursive: true });

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

  const outputPath = path.join(generatedAvatarDirectory, `${avatar.id}.jpg`);
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  const response = await fetch(avatar.synthesiaThumbnailUrl);
  if (!response.ok) {
    throw new Error(`Synthesia thumbnail download failed: ${response.status} ${await response.text()}`);
  }

  const imageData = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, imageData);
  return outputPath;
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
  const body = req.body as RealtimeSessionRequest;
  if (!body?.sdp) {
    res.status(400).json({ error: 'Missing SDP offer in body.sdp' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    return;
  }

  const selectedAvatar = avatarCatalog.find((avatar) => avatar.id === body.avatarId);
  const intake = body.intake;
  const difficultyLabel = normalizeDifficulty(intake?.difficulty);
  const personalityLabel = normalizePersonality(intake?.personality);

  const form = new FormData();
  form.append('sdp', body.sdp);
  form.append(
    'session',
    JSON.stringify({
      type: 'realtime',
      model: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview',
      audio: {
        output: {
          voice: process.env.OPENAI_REALTIME_VOICE ?? 'alloy'
        }
      },
      instructions: [
        'You are Dominion, a business-professional mock interviewer for technical interviews.',
        'Speak in English by default unless the candidate explicitly asks to switch languages.',
        `Use a ${difficultyLabel} interview difficulty and a ${personalityLabel} interviewer personality.`,
        'Stay respectful, concise, and realistic. Ask one question at a time and wait for the answer.',
        selectedAvatar
          ? `Interviewer profile: ${selectedAvatar.name}, ${selectedAvatar.gender}, ${selectedAvatar.raceGroup}.`
          : 'Interviewer profile: use a neutral professional tone.',
        `Intake: ${JSON.stringify(intake ?? {})}`
      ].join(' ')
    })
  );

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: text });
      return;
    }

    const answerSdp = await response.text();
    res.json({ answerSdp });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.listen(PORT, () => {
  console.log(`Dominion server listening on http://localhost:${PORT}`);
});
