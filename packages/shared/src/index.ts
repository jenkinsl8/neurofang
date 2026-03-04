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
  glbPath: string;
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
