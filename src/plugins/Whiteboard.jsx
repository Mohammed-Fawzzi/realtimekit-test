import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Excalidraw,
} from '@excalidraw/excalidraw';

import '@excalidraw/excalidraw/index.css';
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline';

/*
|--------------------------------------------------------------------------
| Whiteboard
|--------------------------------------------------------------------------
|
| Excalidraw
|     ↓
| React
|     ↓
| RealtimeKit collaborative store
|     ↓
| Other participants
|
|--------------------------------------------------------------------------
*/

export default function Whiteboard({ meeting }) {
  /*
   * ----------------------------------------------------------------------
   * Refs
   * ----------------------------------------------------------------------
   */

  const excalidrawAPIRef = useRef(null);

  const storeRef = useRef(null);

  const initializedRef = useRef(false);

  const cleanupStoreRef = useRef(null);

  const applyingRemoteRef = useRef(false);

  const initialSceneLoadedRef = useRef(false);

  const syncTimeoutRef = useRef(null);

  const rootRef = useRef(null);

  /*
   * ----------------------------------------------------------------------
   * State
   * ----------------------------------------------------------------------
   */

  const [initialData, setInitialData] = useState(null);

  const [ready, setReady] = useState(false);

  /*
   * ----------------------------------------------------------------------
   * Inject Excalidraw CSS into the SAME DOM ROOT
   *
   * This is important because the Whiteboard can be rendered inside
   * a RealtimeKit plugin/shadow DOM scope.
   * ----------------------------------------------------------------------
   */

  useEffect(() => {
    const element = rootRef.current;

    if (!element) {
      return;
    }

    const root = element.getRootNode();

    /*
     * If we're inside a ShadowRoot, global CSS imported by Vite
     * will not necessarily penetrate it.
     *
     * So inject Excalidraw's CSS directly into that root.
     */

    if (
      root &&
      root instanceof ShadowRoot
    ) {
      const existingStyle =
        root.querySelector(
          'style[data-excalidraw-whiteboard]',
        );

      if (!existingStyle) {
        const style =
          document.createElement('style');

        style.setAttribute(
          'data-excalidraw-whiteboard',
          'true',
        );

        style.textContent = excalidrawCss;

        root.appendChild(style);

        console.log(
          '🎨 WHITEBOARD: Excalidraw CSS injected into ShadowRoot',
        );
      }
    } else {
      console.log(
        '🎨 WHITEBOARD: Using normal document CSS',
      );
    }
  }, []);

  /*
   * ----------------------------------------------------------------------
   * Initialize RealtimeKit collaborative store
   * ----------------------------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    const initializeStore = async () => {
      /*
       * Meeting can come from App directly.
       */

      if (!meeting) {
        console.warn(
          '⚠️ WHITEBOARD: Meeting is not available yet',
        );

        return;
      }

      if (initializedRef.current) {
        return;
      }

      initializedRef.current = true;

      console.log(
        '🚀 WHITEBOARD: Initializing collaborative store...',
      );

      try {
        /*
         * Create / get the RealtimeKit store.
         */

        const store =
          await Promise.resolve(
            meeting.stores.create(
              'whiteboard',
            ),
          );

        if (cancelled) {
          return;
        }

        if (!store) {
          throw new Error(
            'RealtimeKit whiteboard store is undefined',
          );
        }

        storeRef.current = store;

        console.log(
          '✅ WHITEBOARD: Store ready:',
          store,
        );

        console.log(
          '🔎 WHITEBOARD STORE API:',
          {
            set: typeof store.set,
            get: typeof store.get,
            subscribe:
              typeof store.subscribe,
            unsubscribe:
              typeof store.unsubscribe,
          },
        );

        /*
         * ------------------------------------------------------------------
         * Restore existing scene
         * ------------------------------------------------------------------
         */

        if (
          typeof store.get ===
          'function'
        ) {
          try {
            const existingScene =
              await Promise.resolve(
                store.get('scene'),
              );

            console.log(
              '📥 WHITEBOARD: Existing scene:',
              existingScene,
            );

            if (
              existingScene &&
              typeof existingScene ===
                'object'
            ) {
              /*
               * Only use valid Excalidraw scene fields.
               */

              setInitialData({
                elements:
                  existingScene.elements ||
                  [],

                appState:
                  existingScene.appState ||
                  {
                    viewBackgroundColor:
                      '#ffffff',
                  },

                files:
                  existingScene.files ||
                  {},
              });
            }
          } catch (error) {
            console.warn(
              '⚠️ WHITEBOARD: Failed to restore scene:',
              error,
            );
          }
        }

        /*
         * ------------------------------------------------------------------
         * Subscribe to remote changes
         * ------------------------------------------------------------------
         */

        const handleRemoteScene = (
          payload,
        ) => {
          if (!payload) {
            return;
          }

          const remoteScene =
            payload?.value !== undefined
              ? payload.value
              : payload;

          if (
            !remoteScene ||
            typeof remoteScene !==
              'object'
          ) {
            return;
          }

          console.log(
            '📥 WHITEBOARD: Remote scene received',
            {
              elements:
                remoteScene.elements
                  ?.length || 0,
            },
          );

          const api =
            excalidrawAPIRef.current;

          /*
           * Excalidraw may not have mounted yet.
           *
           * Save it as initialData.
           */

          if (!api) {
            setInitialData({
              elements:
                remoteScene.elements ||
                [],

              appState:
                remoteScene.appState ||
                {
                  viewBackgroundColor:
                    '#ffffff',
                },

              files:
                remoteScene.files ||
                {},
            });

            return;
          }

          /*
           * Prevent onChange from sending this remote
           * update back to RealtimeKit.
           */

          applyingRemoteRef.current =
            true;

          try {
            api.updateScene({
              elements:
                remoteScene.elements ||
                [],

              appState: {
                ...(remoteScene.appState ||
                  {}),
              },

              files:
                remoteScene.files ||
                {},
            });

            /*
             * Also update files if Excalidraw
             * supports them.
             */

            if (
              remoteScene.files &&
              typeof api.addFiles ===
                'function'
            ) {
              const files =
                Object.values(
                  remoteScene.files,
                );

              if (files.length > 0) {
                try {
                  api.addFiles(files);
                } catch (error) {
                  console.warn(
                    '⚠️ WHITEBOARD: Failed to add remote files:',
                    error,
                  );
                }
              }
            }
          } catch (error) {
            console.error(
              '❌ WHITEBOARD: Failed to apply remote scene:',
              error,
            );
          }

          /*
           * Excalidraw can fire onChange after updateScene.
           *
           * Keep the guard alive for the next animation frame.
           */

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              applyingRemoteRef.current =
                false;
            });
          });
        };

        /*
         * RealtimeKit Store API.
         */

        const unsubscribe =
          store.subscribe(
            'scene',
            handleRemoteScene,
          );

        console.log(
          '✅ WHITEBOARD: Store subscription ready',
          unsubscribe,
        );

        /*
         * Save cleanup.
         */

        cleanupStoreRef.current =
          () => {
            try {
              if (
                typeof unsubscribe ===
                'function'
              ) {
                unsubscribe();
              } else if (
                typeof store.unsubscribe ===
                'function'
              ) {
                store.unsubscribe(
                  'scene',
                  handleRemoteScene,
                );
              }
            } catch (error) {
              console.warn(
                '⚠️ WHITEBOARD: Store unsubscribe failed:',
                error,
              );
            }
          };

        setReady(true);
      } catch (error) {
        console.error(
          '❌ WHITEBOARD: Store initialization failed:',
          error,
        );

        initializedRef.current =
          false;
      }
    };

    initializeStore();

    return () => {
      cancelled = true;

      if (
        syncTimeoutRef.current
      ) {
        clearTimeout(
          syncTimeoutRef.current,
        );
      }

      if (
        cleanupStoreRef.current
      ) {
        cleanupStoreRef.current();
        cleanupStoreRef.current =
          null;
      }

      storeRef.current = null;

      initializedRef.current =
        false;

      console.log(
        '🧹 WHITEBOARD: Store cleanup',
      );
    };
  }, [meeting]);

  /*
   * ----------------------------------------------------------------------
   * Excalidraw API
   * ----------------------------------------------------------------------
   */

  const handleExcalidrawAPI =
    useCallback((api) => {
      excalidrawAPIRef.current =
        api;

      console.log(
        '🎨 WHITEBOARD: Excalidraw API ready',
      );

      /*
       * If the store already had a scene,
       * apply it once Excalidraw is ready.
       */

      const store =
        storeRef.current;

      if (
        api &&
        store &&
        !initialSceneLoadedRef.current
      ) {
        initialSceneLoadedRef.current =
          true;

        Promise.resolve(
          store.get?.('scene'),
        )
          .then((scene) => {
            if (
              !scene ||
              !api
            ) {
              return;
            }

            console.log(
              '📥 WHITEBOARD: Applying stored scene to Excalidraw',
            );

            applyingRemoteRef.current =
              true;

            api.updateScene({
              elements:
                scene.elements ||
                [],

              appState: {
                ...(scene.appState ||
                  {}),
              },

              files:
                scene.files ||
                {},
            });

            requestAnimationFrame(
              () => {
                requestAnimationFrame(
                  () => {
                    applyingRemoteRef.current =
                      false;
                  },
                );
              },
            );
          })
          .catch((error) => {
            console.warn(
              '⚠️ WHITEBOARD: Failed to load stored scene:',
              error,
            );
          });
      }
    }, []);

  /*
   * ----------------------------------------------------------------------
   * Sync scene to RealtimeKit
   * ----------------------------------------------------------------------
   */

  const syncScene =
    useCallback(
      async (
        elements,
        appState,
        files,
      ) => {
        const store =
          storeRef.current;

        if (!store) {
          return;
        }

        if (
          applyingRemoteRef.current
        ) {
          return;
        }

        /*
         * Cancel previous sync.
         *
         * Drawing generates many onChange events.
         *
         * We don't want:
         *
         * 100 pointer events
         *       ↓
         * 100 network writes
         *
         * Instead:
         *
         * pointer events
         *       ↓
         * debounce
         *       ↓
         * one network write
         */

        if (
          syncTimeoutRef.current
        ) {
          clearTimeout(
            syncTimeoutRef.current,
          );
        }

        syncTimeoutRef.current =
          setTimeout(async () => {
            try {
              /*
               * Only store useful app state.
               *
               * Don't sync temporary UI state.
               */

              const sharedAppState =
                {
                  viewBackgroundColor:
                    appState
                      ?.viewBackgroundColor ||
                    '#ffffff',

                  currentItemStrokeColor:
                    appState
                      ?.currentItemStrokeColor ||
                    '#1e1e1e',

                  currentItemBackgroundColor:
                    appState
                      ?.currentItemBackgroundColor ||
                    'transparent',

                  currentItemFillStyle:
                    appState
                      ?.currentItemFillStyle ||
                    'hachure',

                  currentItemStrokeWidth:
                    appState
                      ?.currentItemStrokeWidth ||
                    2,

                  currentItemRoughness:
                    appState
                      ?.currentItemRoughness ||
                    1,

                  currentItemOpacity:
                    appState
                      ?.currentItemOpacity ??
                    100,

                  currentItemFontFamily:
                    appState
                      ?.currentItemFontFamily,

                  currentItemFontSize:
                    appState
                      ?.currentItemFontSize,

                  currentItemTextAlign:
                    appState
                      ?.currentItemTextAlign,

                  currentItemArrowhead:
                    appState
                      ?.currentItemArrowhead,
                };

              await store.set(
                'scene',
                {
                  elements:
                    Array.from(
                      elements || [],
                    ),

                  appState:
                    sharedAppState,

                  files:
                    files || {},
                },
              );

              console.log(
                '📤 WHITEBOARD: Scene synced',
                {
                  elements:
                    elements?.length ||
                    0,
                },
              );
            } catch (error) {
              console.error(
                '❌ WHITEBOARD: Failed to sync scene:',
                error,
              );
            }
          }, 150);
      },
      [],
    );

  /*
   * ----------------------------------------------------------------------
   * Excalidraw onChange
   * ----------------------------------------------------------------------
   */

  const handleChange =
    useCallback(
      (
        elements,
        appState,
        files,
      ) => {
        /*
         * Ignore changes produced by a remote participant.
         */

        if (
          applyingRemoteRef.current
        ) {
          return;
        }

        /*
         * Ignore the first empty scene event.
         *
         * Excalidraw normally fires onChange during initialization.
         * Without this guard, a new client could overwrite the
         * shared scene with [] before the existing scene is restored.
         */

        if (
          !initialSceneLoadedRef.current
        ) {
          return;
        }

        syncScene(
          elements,
          appState,
          files,
        );
      },
      [syncScene],
    );

  /*
   * ----------------------------------------------------------------------
   * Render
   * ----------------------------------------------------------------------
   */

  return (
    <div
      ref={rootRef}
      className="whiteboard-root"
      style={{
        position: 'relative',

        width: '100%',

        height: '100%',

        minWidth: 0,

        minHeight: 0,

        display: 'flex',

        flexDirection: 'column',

        overflow: 'hidden',

        background:
          '#ffffff',

        isolation: 'isolate',
      }}
    >
      {/*
       * ---------------------------------------------------------------
       * Excalidraw
       * ---------------------------------------------------------------
       */}

      <div
        style={{
          position: 'relative',

          flex: '1 1 auto',

          width: '100%',

          height: '100%',

          minWidth: 0,

          minHeight: 0,

          overflow: 'hidden',

          background:
            '#ffffff',
        }}
      >
        <Excalidraw
          /*
           * IMPORTANT:
           * This is the API used by Excalidraw 0.18.x.
           */

          onExcalidrawAPI={
            handleExcalidrawAPI
          }

          /*
           * Collaborative scene changes.
           */

          onChange={handleChange}

          /*
           * We want a fully interactive whiteboard.
           */

          viewModeEnabled={false}

          /*
           * Enable keyboard shortcuts.
           */

          handleKeyboardGlobally={true}

          /*
           * Light theme.
           */

          theme="light"

          /*
           * Initial data.
           *
           * If a scene exists, load it.
           */

          initialData={
            initialData || {
              elements: [],

              appState: {
                viewBackgroundColor:
                  '#ffffff',
              },

              files: {},
            }
          }

          /*
           * Full Excalidraw UI.
           */

          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor:
                true,

              clearCanvas:
                true,

              export: {
                saveFileToDisk:
                  true,
              },

              loadScene:
                true,

              toggleTheme:
                true,
            },
          }}
        />
      </div>

      {/*
       * ---------------------------------------------------------------
       * Small loading indicator
       * ---------------------------------------------------------------
       *
       * Only appears until the collaborative store is ready.
       *
       * It doesn't block the whiteboard.
       * ---------------------------------------------------------------
       */}

      {!ready && (
        <div
          style={{
            position: 'absolute',

            top: 12,

            right: 12,

            zIndex: 9999,

            padding:
              '6px 10px',

            borderRadius: 6,

            background:
              'rgba(0, 0, 0, 0.65)',

            color: '#ffffff',

            fontSize: 12,

            pointerEvents:
              'none',
          }}
        >
          Connecting...
        </div>
      )}
    </div>
  );
}