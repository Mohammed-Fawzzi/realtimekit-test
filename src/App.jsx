import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  createRoot,
} from 'react-dom/client';

import {
  RealtimeKitProvider,
  useRealtimeKitClient,
} from '@cloudflare/realtimekit-react';

import {
  RtkMeeting,
} from '@cloudflare/realtimekit-react-ui';

import {
  registerAddons,
  defaultConfig,
} from '@cloudflare/realtimekit-ui';

// ============================================================
// REALTIMEKIT ADDONS
// ============================================================

import CameraHostControl from '@cloudflare/realtimekit-ui-addons/camera-host-control';

import MicHostControl from '@cloudflare/realtimekit-ui-addons/mic-host-control';

import ChatHostControl from '@cloudflare/realtimekit-ui-addons/chat-host-control';

import HandRaise from '@cloudflare/realtimekit-ui-addons/hand-raise';

import ReactionsManagerAddon from '@cloudflare/realtimekit-ui-addons/reactions-manager';

import RealtimeKitVideoBackground from '@cloudflare/realtimekit-ui-addons/video-background';

import CustomControlbarButton from '@cloudflare/realtimekit-ui-addons/custom-controlbar-button';

// ============================================================
// WHITEBOARD
// ============================================================

import Whiteboard from './plugins/Whiteboard';

// ============================================================
// AUTH TOKEN
// ============================================================

const AUTH_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdJZCI6IjZkNmZiZTkxLTkwNGItNDU5OS1hZmE5LTA2NjBhYmRjYzg4MCIsIm1lZXRpbmdJZCI6ImJiYjYxOGU4LWM5ZjktNDI0My05NGI0LTdmNmI1NTg4OTg5MiIsInBhcnRpY2lwYW50SWQiOiJhYWFhOTBkNC0xOTdkLTQ3YTUtYTM5ZC01OTExYTE5NTI3ZGMiLCJwcmVzZXRJZCI6ImVlYjM4MjhmLTMwYmEtNGE0Ni04ZWNhLTI0YTM2N2QzYzA2MiIsImlhdCI6MTc4ODYxODI0OCwiZXhwIjoxNzk3MjU4MjQ4fQ.f3r3wkBvO7RQlki2TjHM5Jda8JNkl4SENy1vEyQtgVgoYPp3CYrhDyBVjNhwodTgnxAB5MP5eqNtwIbm7Z1xMRjCvDH5C3cSdyz4MJNTfGuGOqPJGnZmA-GZ9ypv-n3UQPvbynXzXCcZaHrGW4MqowEt3WVF1MCZuDpZCV5b7S6BWSTmQiIL7Xgb6jeVZa05QpEtddTA_yIQxFQqYFPDowmSjhLHQDXdx2-M_3C2c1zMVxZ6b_Xadrq_sSqU54zANnM0QIjL0NYSiKOaAz0vQR4k4VYfCYy2TA71Gr-7TAAQqSBu1PryQohfL6enXObEFvrqm9kr5Rtmum9xVHVDZg';

// Allow a second participant via ?authToken=... (same meetingId, different participantId)
const authTokenFromQuery =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('authToken')
    : null;

const RESOLVED_AUTH_TOKEN =
  authTokenFromQuery || AUTH_TOKEN;
// ============================================================
// WHITEBOARD PLUGIN HOST
// ============================================================
//
// RealtimeKit requires the plugin component to be an HTMLElement.
// We mount React/Excalidraw INSIDE this element (no body portal),
// so fullscreen on <rtk-meeting> includes the whiteboard and does
// not cover/hide meeting controls (Full Screen, etc.).
//

const whiteboardElement =
  document.createElement('div');

whiteboardElement.className =
  'realtimekit-whiteboard-anchor';

whiteboardElement.setAttribute(
  'data-rtk-whiteboard',
  'true',
);

whiteboardElement.style.width =
  '100%';

whiteboardElement.style.height =
  '100%';

whiteboardElement.style.minWidth =
  '0';

whiteboardElement.style.minHeight =
  '0';

whiteboardElement.style.display =
  'block';

whiteboardElement.style.position =
  'relative';

whiteboardElement.style.overflow =
  'hidden';

whiteboardElement.style.background =
  '#ffffff';

// ============================================================
// MEETING UI
// ============================================================

function MeetingUI({
  meeting,
  config,
}) {
  if (!meeting) {
    return (
      <div
        style={{
          width: '100vw',

          height: '100vh',

          display: 'flex',

          alignItems: 'center',

          justifyContent: 'center',

          background: '#111',

          color: '#fff',

          fontFamily:
            'Arial, sans-serif',
        }}
      >
        Loading meeting...
      </div>
    );
  }

  return (
    <div className="rtk-meeting-shell">
      <RtkMeeting
        meeting={meeting}
        config={config}
        mode="fill"
        showSetupScreen={true}
        applyDesignSystem={true}
      />
    </div>
  );
}

// ============================================================
// APP
// ============================================================

export default function App() {
  const [
    meeting,
    initMeeting,
  ] =
    useRealtimeKitClient();

  const [
    config,
    setConfig,
  ] =
    useState(defaultConfig);

  // ------------------------------------------------------------
  // Initialization guards
  // ------------------------------------------------------------

  const initializationStarted =
    useRef(false);

  const addonsInitialized =
    useRef(false);

  const whiteboardRootRef =
    useRef(null);

  // ============================================================
  // 1. INITIALIZE REALTIMEKIT
  // ============================================================

  useEffect(() => {
    if (
      initializationStarted.current
    ) {
      return;
    }

    initializationStarted.current =
      true;

    const initializeMeeting =
      async () => {
        try {
          console.log(
            '🚀 Initializing RealtimeKit...',
          );

          await initMeeting({
            authToken:
              RESOLVED_AUTH_TOKEN,

            defaults: {
              audio: true,

              video: true,

              // ==================================================
              // CUSTOM PLUGINS
              // ==================================================

              plugins: [
                {
                  id: 'whiteboard',

                  name: 'Whiteboard',

                  icon:
                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cpath d="M4 20h16M6 17l10-10 2 2L8 19H6v-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/%3E%3C/svg%3E',

                  permissions: {
                    canActivate:
                      true,

                    canDeactivate:
                      true,
                  },

                  component:
                    whiteboardElement,
                },
              ],
            },
          });

          console.log(
            '✅ RealtimeKit initialization requested',
          );
        } catch (error) {
          console.error(
            '❌ REALTIMEKIT INIT ERROR:',
            error,
          );
        }
      };

    initializeMeeting();
  }, [initMeeting]);

  // ============================================================
  // 2. MEETING READY
  // ============================================================

  useEffect(() => {
    if (!meeting) {
      return;
    }

    console.log(
      '======================================',
    );

    console.log(
      '✅ MEETING OBJECT READY',
    );

    console.log(
      'MEETING:',
      meeting,
    );

    console.log(
      'MEETING META:',
      meeting.meta,
    );

    console.log(
      'MEETING PLUGINS:',
      meeting.plugins,
    );

    console.log(
      '======================================');

    // ==========================================================
    // MOUNT WHITEBOARD INSIDE PLUGIN HOST (no portal overlay)
    // ==========================================================

    let whiteboardSession = 0;

    const renderWhiteboard = (active) => {
      if (!whiteboardRootRef.current) {
        console.log(
          '🎨 Creating Whiteboard React root...',
        );

        whiteboardRootRef.current =
          createRoot(whiteboardElement);
      }

      whiteboardRootRef.current.render(
        <Whiteboard
          meeting={meeting}
          active={active}
          sessionKey={
            whiteboardSession
          }
        />,
      );
    };

    renderWhiteboard(false);

    console.log(
      '✅ Whiteboard ready (waiting for plugin activate)',
    );

    // ==========================================================
    // Plugin activate / deactivate
    // ==========================================================

    try {
      const plugins =
        meeting.plugins?.all;

      const whiteboardPlugin =
        plugins &&
        typeof plugins.toArray ===
          'function'
          ? plugins
              .toArray()
              .find(
                (plugin) =>
                  plugin?.component ===
                    whiteboardElement ||
                  String(
                    plugin?.id || '',
                  ).includes(
                    'whiteboard',
                  ),
              )
          : null;

      if (whiteboardPlugin?.on) {
        let enableTimer = null;

        const onEnabled = () => {
          if (enableTimer) {
            clearTimeout(enableTimer);
          }

          enableTimer = setTimeout(() => {
            whiteboardSession += 1;

            console.log(
              '🔁 Whiteboard enabled — session',
              whiteboardSession,
            );

            renderWhiteboard(true);

            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.dispatchEvent(
                  new Event(
                    'rtk-whiteboard-activated',
                  ),
                );
                window.dispatchEvent(
                  new Event('resize'),
                );
              });
            });
          }, 50);
        };

        const onClosed = () => {
          if (enableTimer) {
            clearTimeout(enableTimer);
            enableTimer = null;
          }

          console.log(
            '⏹️ Whiteboard closed',
          );

          renderWhiteboard(false);
        };

        whiteboardPlugin.on(
          'enabled',
          onEnabled,
        );

        whiteboardPlugin.on(
          'ready',
          onEnabled,
        );

        whiteboardPlugin.on(
          'closed',
          onClosed,
        );

        if (whiteboardPlugin.active) {
          onEnabled();
        }
      }
    } catch (error) {
      console.warn(
        '⚠️ Could not attach whiteboard plugin listeners:',
        error,
      );
    }

    // ==========================================================
    // INITIALIZE ADDONS
    // ==========================================================

    if (
      addonsInitialized.current
    ) {
      return;
    }

    addonsInitialized.current =
      true;

    const initializeAddons =
      async () => {
        try {
          console.log(
            '🧩 Initializing RealtimeKit UI addons...',
          );

          // ======================================================
          // CAMERA HOST CONTROL
          // ======================================================

          const cameraHostControl =
            await CameraHostControl.init(
              {
                meeting,

                hostPresets: [
                  'webinar_presenter',
                ],

                targetPresets: [
                  'webinar_viewer',
                ],

                addActionInParticipantMenu:
                  true,
              },
            );

          console.log(
            '✅ Camera Host Control initialized',
          );

          // ======================================================
          // MIC HOST CONTROL
          // ======================================================

          const micHostControl =
            await MicHostControl.init(
              {
                meeting,

                hostPresets: [
                  'webinar_presenter',
                ],

                targetPresets: [
                  'webinar_viewer',
                ],

                addActionInParticipantMenu:
                  true,
              },
            );

          console.log(
            '✅ Mic Host Control initialized',
          );

          // ======================================================
          // CHAT HOST CONTROL
          // ======================================================

          const chatHostControl =
            await ChatHostControl.init(
              {
                meeting,

                hostPresets: [
                  'webinar_presenter',
                ],

                targetPresets: [
                  'webinar_viewer',
                ],

                addActionInParticipantMenu:
                  true,
              },
            );

          console.log(
            '✅ Chat Host Control initialized',
          );

          // ======================================================
          // HAND RAISE
          // ======================================================

          const handRaise =
            await HandRaise.init(
              {
                meeting,

                canRaiseHand:
                  true,

                canManageRaisedHand:
                  true,
              },
            );

          console.log(
            '🙋 Hand Raise initialized',
          );

          // ======================================================
          // REACTIONS
          // ======================================================

          const reactionsAddon =
            await ReactionsManagerAddon.init(
              {
                meeting,

                reactions: [
                  {
                    emoji: '🔥',
                    label: 'fire',
                  },

                  {
                    emoji: '😢',
                    label: 'sad',
                  },

                  {
                    emoji: '👍',
                    label: 'thumbs up',
                  },

                  {
                    emoji: '👎',
                    label: 'thumbs down',
                  },

                  {
                    emoji: '❤️',
                    label: 'heart',
                  },

                  {
                    emoji: '😂',
                    label: 'laugh',
                  },

                  {
                    emoji: '👏',
                    label: 'clap',
                  },

                  {
                    emoji: '🎉',
                    label: 'celebrate',
                  },
                ],

                canSendReactions:
                  true,
              },
            );

          console.log(
            '😀 Reactions initialized',
          );

          // ======================================================
          // VIDEO BACKGROUND
          // ======================================================

          const videoBackground =
            await RealtimeKitVideoBackground.init(
              {
                meeting,

                modes: [
                  'blur',
                  'virtual',
                  'random',
                ],

                blurStrength: 30,

                images: [
                  'https://images.unsplash.com/photo-1487088678257-3a541e6e3922?q=80&w=2874&auto=format&fit=crop',

                  'https://images.unsplash.com/photo-1496715976403-7e36dc43f17b?q=80&w=2848&auto=format&fit=crop',

                  'https://images.unsplash.com/photo-1600431521340-491eca880813?q=80&w=2938&auto=format&fit=crop',
                ],

                randomCount: 10,

                onVideoBackgroundUpdate:
                  ({
                    backgroundMode,
                    backgroundURL,
                  }) => {
                    console.log(
                      '🎥 Video Background Updated:',
                      {
                        backgroundMode,
                        backgroundURL,
                      },
                    );
                  },
              },
            );

          console.log(
            '🎥 Video Background initialized',
          );

          // ======================================================
          // CUSTOM CONTROL BAR
          // ======================================================

          const customControlBarButton =
            new CustomControlbarButton(
              {
                position:
                  'left',

                icon:
                  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 17.75a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5zM12 14c0-2.5 4-2.5 4-6a4 4 0 1 0-8 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',

                label:
                  'Test',

                onClick:
                  () => {
                    console.log(
                      '🧪 Custom Test button clicked',
                    );
                  },
              },
            );

          console.log(
            '🔘 Custom Control Bar initialized',
          );

          // ======================================================
          // REGISTER ADDONS
          // ======================================================

          const newConfig =
            registerAddons(
              [
                cameraHostControl,

                micHostControl,

                chatHostControl,

                handRaise,

                reactionsAddon,

                videoBackground,

                customControlBarButton,
              ],

              meeting,
            );

          // Keep Leave / More easy to reach on mobile (end of bar).
          const mobileBar = [
            'rtk-mic-toggle',
            'rtk-camera-toggle',
            'rtk-webinar-stage-toggle',
            'rtk-stage-toggle',
            'rtk-more-toggle',
            'rtk-leave-button',
          ];

          setConfig({
            ...newConfig,
            root: {
              ...newConfig.root,
              'div#controlbar-mobile': mobileBar,
            },
            styles: {
              ...newConfig.styles,
              'rtk-controlbar.sm': {
                ...(newConfig.styles?.['rtk-controlbar.sm'] || {}),
                display: 'flex',
                position: 'relative',
                zIndex: '50',
                backgroundColor:
                  'rgb(var(--rtk-colors-background-1000, 0 0 0))',
              },
              'rtk-controlbar.md': {
                ...(newConfig.styles?.['rtk-controlbar.md'] || {}),
                display: 'flex',
                position: 'relative',
                zIndex: '50',
                backgroundColor:
                  'rgb(var(--rtk-colors-background-1000, 0 0 0))',
              },
            },
          });
        } catch (error) {
          console.error(
            '❌ ADDONS INITIALIZATION ERROR:',
            error,
          );

          addonsInitialized.current =
            false;
        }
      };

    initializeAddons();
  }, [meeting]);

  // ============================================================
  // 3. CLEANUP
  // ============================================================

  useEffect(() => {
    return () => {
      try {
        if (
          whiteboardRootRef.current
        ) {
          console.log(
            '🧹 Unmounting Whiteboard React root...',
          );

          whiteboardRootRef.current.unmount();

          whiteboardRootRef.current =
            null;
        }
      } catch (error) {
        console.error(
          '❌ Whiteboard cleanup error:',
          error,
        );
      }
    };
  }, []);

  // ============================================================
  // 4. RENDER
  // ============================================================

  return (
    <RealtimeKitProvider
      value={meeting}
    >
      <MeetingUI
        meeting={meeting}
        config={config}
      />
    </RealtimeKitProvider>
  );
}