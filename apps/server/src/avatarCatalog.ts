import type { AvatarCatalogEntry } from '@dominion/shared';

type Seed = Omit<AvatarCatalogEntry, 'thumbnailPath'>;

const unitySceneBase = '/unity/interviewer/index.html';
const thumbnailProxy = (id: string) => `/api/avatars/${id}/thumbnail`;

const seeds: Seed[] = [
  { id: 'ava-01', name: 'Noah', gender: 'male', raceGroup: 'black', makeHumanModelId: 'mh-noah-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-01` },
  { id: 'ava-02', name: 'Liam', gender: 'male', raceGroup: 'white', makeHumanModelId: 'mh-liam-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-02` },
  { id: 'ava-03', name: 'Ethan', gender: 'male', raceGroup: 'east-asian', makeHumanModelId: 'mh-ethan-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-03` },
  { id: 'ava-04', name: 'Arjun', gender: 'male', raceGroup: 'south-asian', makeHumanModelId: 'mh-arjun-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-04` },
  { id: 'ava-05', name: 'Mateo', gender: 'male', raceGroup: 'latino', makeHumanModelId: 'mh-mateo-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-05` },
  { id: 'ava-06', name: 'Omar', gender: 'male', raceGroup: 'middle-eastern', makeHumanModelId: 'mh-omar-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-06` },
  { id: 'ava-07', name: 'Kai', gender: 'male', raceGroup: 'mixed', makeHumanModelId: 'mh-kai-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-07` },
  { id: 'ava-08', name: 'Theo', gender: 'male', raceGroup: 'white', makeHumanModelId: 'mh-theo-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-08` },
  { id: 'ava-09', name: 'Ava', gender: 'female', raceGroup: 'black', makeHumanModelId: 'mh-ava-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-09` },
  { id: 'ava-10', name: 'Emma', gender: 'female', raceGroup: 'white', makeHumanModelId: 'mh-emma-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-10` },
  { id: 'ava-11', name: 'Mei', gender: 'female', raceGroup: 'east-asian', makeHumanModelId: 'mh-mei-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-11` },
  { id: 'ava-12', name: 'Anika', gender: 'female', raceGroup: 'south-asian', makeHumanModelId: 'mh-anika-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-12` },
  { id: 'ava-13', name: 'Sofia', gender: 'female', raceGroup: 'latino', makeHumanModelId: 'mh-sofia-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-13` },
  { id: 'ava-14', name: 'Leila', gender: 'female', raceGroup: 'middle-eastern', makeHumanModelId: 'mh-leila-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-14` },
  { id: 'ava-15', name: 'Maya', gender: 'female', raceGroup: 'mixed', makeHumanModelId: 'mh-maya-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-15` },
  { id: 'ava-16', name: 'Grace', gender: 'female', raceGroup: 'white', makeHumanModelId: 'mh-grace-v1', unitySceneUrl: `${unitySceneBase}?avatar=ava-16` }
];

export const avatarCatalog: AvatarCatalogEntry[] = seeds.map((seed) => ({
  ...seed,
  thumbnailPath: thumbnailProxy(seed.id)
}));
