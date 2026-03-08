import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvatarStage } from '../AvatarStage';

afterEach(() => {
  cleanup();
});

describe('AvatarStage integration', () => {
  it('renders the embedded 3d interviewer scene when a scene URL exists', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get: () => ({ postMessage })
    });

    render(<AvatarStage unitySceneUrl="https://example.com/unity/interviewer" thumbnailPath="/avatars/ava-01.svg" />);

    expect(screen.getByTitle('MakeHuman Unity interviewer')).toBeInTheDocument();
    expect(screen.queryByAltText('Interviewer preview')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'neurofang-stage-state',
          payload: {
            speechLevel: 0,
            isSpeaking: false,
            isListening: false
          }
        },
        '*'
      );
    });
  });


  it('notifies interviewer status changes when the derived status updates', () => {
    const onInterviewerStatusChange = vi.fn();
    const { rerender } = render(
      <AvatarStage
        unitySceneUrl="https://example.com/unity/interviewer"
        thumbnailPath="/avatars/ava-01.svg"
        sessionStatus="idle"
        onInterviewerStatusChange={onInterviewerStatusChange}
      />
    );

    expect(onInterviewerStatusChange).toHaveBeenCalledTimes(1);
    expect(onInterviewerStatusChange).toHaveBeenLastCalledWith('idle/listening');

    rerender(
      <AvatarStage
        unitySceneUrl="https://example.com/unity/interviewer"
        thumbnailPath="/avatars/ava-01.svg"
        sessionStatus="connected"
        onInterviewerStatusChange={onInterviewerStatusChange}
      />
    );

    expect(onInterviewerStatusChange).toHaveBeenCalledTimes(2);
    expect(onInterviewerStatusChange).toHaveBeenLastCalledWith('active/listening');
  });

  it('falls back to thumbnail when the 3d scene url is missing and keeps a safe image fallback', () => {
    render(<AvatarStage unitySceneUrl="   " thumbnailPath="/avatars/ava-02.svg" />);

    expect(screen.queryByTitle('MakeHuman Unity interviewer')).not.toBeInTheDocument();
    expect(screen.getByText('Unity interviewer scene URL is unavailable. Using generated thumbnail fallback.')).toBeInTheDocument();

    const image = screen.getByAltText('Interviewer preview');
    expect(image).toHaveAttribute('src', '/avatars/ava-02.svg');

    fireEvent.error(image);
    expect(image).toHaveAttribute('src', '/avatars/placeholder.svg');
  });
});
