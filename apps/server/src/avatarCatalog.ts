import type { AvatarCatalogEntry } from '@dominion/shared';

type Seed = Omit<AvatarCatalogEntry, 'thumbnailPath'>;

const synthesiaBase = 'https://share.synthesia.io/embeds';
const thumbnailProxy = (id: string) => `/api/avatars/${id}/thumbnail`;

const seeds: Seed[] = [
  { id: 'ava-01', name: 'Noah', gender: 'male', raceGroup: 'black', synthesiaAvatarId: 'anna_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/anna_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/anna_costume1_cameraA.jpg' },
  { id: 'ava-02', name: 'Liam', gender: 'male', raceGroup: 'white', synthesiaAvatarId: 'luke_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/luke_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/luke_costume1_cameraA.jpg' },
  { id: 'ava-03', name: 'Ethan', gender: 'male', raceGroup: 'east-asian', synthesiaAvatarId: 'james_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/james_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/james_costume1_cameraA.jpg' },
  { id: 'ava-04', name: 'Arjun', gender: 'male', raceGroup: 'south-asian', synthesiaAvatarId: 'rajiv_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/rajiv_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/rajiv_costume1_cameraA.jpg' },
  { id: 'ava-05', name: 'Mateo', gender: 'male', raceGroup: 'latino', synthesiaAvatarId: 'carlos_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/carlos_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/carlos_costume1_cameraA.jpg' },
  { id: 'ava-06', name: 'Omar', gender: 'male', raceGroup: 'middle-eastern', synthesiaAvatarId: 'samir_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/samir_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/samir_costume1_cameraA.jpg' },
  { id: 'ava-07', name: 'Kai', gender: 'male', raceGroup: 'mixed', synthesiaAvatarId: 'kai_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/kai_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/kai_costume1_cameraA.jpg' },
  { id: 'ava-08', name: 'Theo', gender: 'male', raceGroup: 'white', synthesiaAvatarId: 'david_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/david_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/david_costume1_cameraA.jpg' },
  { id: 'ava-09', name: 'Ava', gender: 'female', raceGroup: 'black', synthesiaAvatarId: 'jennifer_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/jennifer_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/jennifer_costume1_cameraA.jpg' },
  { id: 'ava-10', name: 'Emma', gender: 'female', raceGroup: 'white', synthesiaAvatarId: 'emma_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/emma_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/emma_costume1_cameraA.jpg' },
  { id: 'ava-11', name: 'Mei', gender: 'female', raceGroup: 'east-asian', synthesiaAvatarId: 'mei_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/mei_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/mei_costume1_cameraA.jpg' },
  { id: 'ava-12', name: 'Anika', gender: 'female', raceGroup: 'south-asian', synthesiaAvatarId: 'anika_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/anika_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/anika_costume1_cameraA.jpg' },
  { id: 'ava-13', name: 'Sofia', gender: 'female', raceGroup: 'latino', synthesiaAvatarId: 'sofia_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/sofia_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/sofia_costume1_cameraA.jpg' },
  { id: 'ava-14', name: 'Leila', gender: 'female', raceGroup: 'middle-eastern', synthesiaAvatarId: 'leila_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/leila_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/leila_costume1_cameraA.jpg' },
  { id: 'ava-15', name: 'Maya', gender: 'female', raceGroup: 'mixed', synthesiaAvatarId: 'maya_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/maya_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/maya_costume1_cameraA.jpg' },
  { id: 'ava-16', name: 'Grace', gender: 'female', raceGroup: 'white', synthesiaAvatarId: 'grace_costume1_cameraA', synthesiaEmbedUrl: `${synthesiaBase}/grace_costume1_cameraA`, synthesiaThumbnailUrl: 'https://images.synthesia.io/avatars/grace_costume1_cameraA.jpg' }
];

export const avatarCatalog: AvatarCatalogEntry[] = seeds.map((seed) => ({
  ...seed,
  thumbnailPath: thumbnailProxy(seed.id)
}));
