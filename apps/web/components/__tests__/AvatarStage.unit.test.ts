import { describe, expect, it } from 'vitest';
import { buildUnityStageMessage, resolveStageImageSrc } from '../AvatarStage';

describe('AvatarStage unit helpers', () => {
  it('uses a fallback thumbnail when thumbnail path is missing or blank', () => {
    expect(resolveStageImageSrc(undefined)).toBe('/avatars/placeholder.svg');
    expect(resolveStageImageSrc('')).toBe('/avatars/placeholder.svg');
    expect(resolveStageImageSrc('   ')).toBe('/avatars/placeholder.svg');
  });

  it('keeps explicit thumbnail path values', () => {
    expect(resolveStageImageSrc('/avatars/custom.png')).toBe('/avatars/custom.png');
  });

  it('builds a listening message when candidate is talking and interviewer is not', () => {
    expect(buildUnityStageMessage(0.05, 0.35)).toEqual({
      type: 'neurofang-stage-state',
      payload: {
        speechLevel: 0.05,
        isSpeaking: false,
        isListening: true
      }
    });
  });

  it('does not mark listening when both parties are quiet', () => {
    expect(buildUnityStageMessage(0.05, 0.06)).toEqual({
      type: 'neurofang-stage-state',
      payload: {
        speechLevel: 0.05,
        isSpeaking: false,
        isListening: false
      }
    });
  });

  it('builds a speaking message above the threshold', () => {
    expect(buildUnityStageMessage(0.55)).toEqual({
      type: 'neurofang-stage-state',
      payload: {
        speechLevel: 0.55,
        isSpeaking: true,
        isListening: false
      }
    });
  });
});
