export type InterviewLevel = 'junior' | 'mid' | 'senior' | 'staff';
export type InterviewDifficulty = 'friendly' | 'neutral' | 'tough';
export type InterviewPersonality = 'friendly' | 'analytical' | 'skeptical' | 'executive';

export type InterviewIntake = {
  company: string;
  jobTitle: string;
  level: InterviewLevel;
  difficulty: InterviewDifficulty;
  personality: InterviewPersonality;
};

export type AvatarGender = 'male' | 'female';
export type AvatarRaceGroup = 'black' | 'white' | 'east-asian' | 'south-asian' | 'latino' | 'middle-eastern' | 'mixed';

export type AvatarCatalogEntry = {
  id: string;
  name: string;
  gender: AvatarGender;
  raceGroup: AvatarRaceGroup;
  makeHumanModelId: string;
  unitySceneUrl: string;
  thumbnailPath: string;
};

export type AvatarPickRequest = {
  excludeIds?: string[];
  preferredGender?: AvatarGender;
};

export type RealtimeSessionRequest = {
  sdp: string;
  intake?: InterviewIntake;
  avatarId?: string;
};

// Public STUN defaults improve post-signaling ICE connectivity when clients are behind NAT.
export const defaultRealtimeIceServers = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' }
];
