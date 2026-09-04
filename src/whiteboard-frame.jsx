import { useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw } from '@excalidraw/excalidraw';

import '@excalidraw/excalidraw/index.css';

import {
  EMPTY_SCENE,
  applySceneToApi,
  buildScenePayload,
  normalizeScene,
} from './plugins/whiteboardScene.js';

/*
|--------------------------------------------------------------------------
| Whiteboard iframe entry
|
| Runs Excalidraw in THIS window so pointer coords match the canvas.
| Parent page only hosts the iframe + collaborative store.
|--------------------------------------------------------------------------
*/

const FRAME_CSS = `
html, body, #root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #ffffff;
  touch-action: none;
}
#root {
  position: relative;
}
.excalidraw {
  width: 100% !important;
  height: 100% !important;
  position: absolute !important;
  inset: 0 !important;
}
.excalidraw .App {
  width: 100% !important;
  height: 100% !important;
}
.visually-hidden {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
`;

function injectFrameCss() {
  if (document.getElementById('wb-frame-css')) return;
  const style = document.createElement('style');
  style.id = 'wb-frame-css';
  style.textContent = FRAME_CSS;
  document.head.appendChild(style);
}

function postToParent(message) {
  try {
    window.parent?.postMessage(message, window.location.origin);
  } catch {
    // ignore
  }
}

function FrameEditor() {
  const apiRef = useRef(null);
  const applyingRef = useRef(false);
  const readyRef = useRef(false);
  const ignoreUntilRef = useRef(0);
  const initialSceneRef = useRef(EMPTY_SCENE);
  const syncTimeoutRef = useRef(null);

  const refreshApi = useCallback(() => {
    window.setTimeout(() => {
      try {
        apiRef.current?.refresh?.();
      } catch {
        // ignore
      }
    }, 50);
  }, []);

  const softApply = useCallback((scene) => {
    const api = apiRef.current;
    const normalized = normalizeScene(scene);
    if (!api || !normalized) return;

    applyingRef.current = true;
    ignoreUntilRef.current = Date.now() + 300;

    try {
      applySceneToApi(api, normalized);
    } catch (error) {
      console.error('❌ WHITEBOARD FRAME: apply failed:', error);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyingRef.current = false;
        refreshApi();
      });
    });
  }, [refreshApi]);

  const handleAPI = useCallback(
    (api) => {
      apiRef.current = api;
      readyRef.current = false;
      applyingRef.current = true;
      ignoreUntilRef.current = Date.now() + 500;

      try {
        applySceneToApi(api, initialSceneRef.current);
      } catch (error) {
        console.error('❌ WHITEBOARD FRAME: hydrate failed:', error);
      }

      window.setTimeout(() => {
        applyingRef.current = false;
        readyRef.current = true;
        ignoreUntilRef.current = Date.now() + 80;
        refreshApi();
        postToParent({ type: 'wb:ready' });
      }, 200);
    },
    [refreshApi],
  );

  useEffect(() => {
    injectFrameCss();

    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'wb:init') {
        const scene = normalizeScene(data.scene) || EMPTY_SCENE;
        initialSceneRef.current = scene;
        if (apiRef.current) {
          softApply(scene);
        }
        return;
      }

      if (data.type === 'wb:remote-scene') {
        softApply(data.scene);
        return;
      }

      if (data.type === 'wb:refresh') {
        refreshApi();
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('resize', refreshApi);

    const ro = new ResizeObserver(() => refreshApi());
    ro.observe(document.documentElement);

    postToParent({ type: 'wb:hello' });

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', refreshApi);
      ro.disconnect();
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [refreshApi, softApply]);

  const handleChange = useCallback((elements, appState, files) => {
    if (applyingRef.current) return;
    if (!readyRef.current) return;
    if (Date.now() < ignoreUntilRef.current) return;

    const payload = buildScenePayload(
      elements,
      appState,
      files,
      Date.now(),
    );

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      syncTimeoutRef.current = null;
      postToParent({ type: 'wb:scene', scene: payload });
    }, 280);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Excalidraw
        excalidrawAPI={handleAPI}
        onChange={handleChange}
        viewModeEnabled={false}
        zenModeEnabled={false}
        gridModeEnabled={false}
        handleKeyboardGlobally={false}
        detectScroll={false}
        theme="light"
        name="Whiteboard"
        initialData={EMPTY_SCENE}
        UIOptions={{
          welcomeScreen: false,
          canvasActions: {
            changeViewBackgroundColor: true,
            clearCanvas: true,
            export: { saveFileToDisk: true },
            loadScene: true,
            toggleTheme: true,
          },
        }}
      />
    </div>
  );
}

injectFrameCss();

createRoot(document.getElementById('root')).render(<FrameEditor />);
