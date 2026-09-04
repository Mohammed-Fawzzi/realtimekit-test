import { useCallback, useEffect, useRef, useState } from 'react';

import {
  EMPTY_SCENE,
  normalizeScene,
  pickNewerScene,
  readLocalBackup,
  writeLocalBackup,
} from './whiteboardScene.js';

/*
|--------------------------------------------------------------------------
| Whiteboard host
|
| - Loads Excalidraw in a same-origin iframe page (own window = correct pen)
| - Keeps collaborative store + localStorage in the parent
|--------------------------------------------------------------------------
*/

const FRAME_SRC = `${import.meta.env.BASE_URL}whiteboard-frame.html`;

export default function Whiteboard({
  meeting,
  active = true,
  sessionKey = 0,
}) {
  const iframeRef = useRef(null);
  const storeRef = useRef(null);
  const initializedRef = useRef(false);
  const cleanupStoreRef = useRef(null);
  const latestSceneRef = useRef(null);
  const lastSyncedAtRef = useRef(0);
  const writingRef = useRef(false);
  const frameReadyRef = useRef(false);

  const [bootError, setBootError] = useState(null);

  const postToFrame = useCallback((message) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(message, window.location.origin);
    } catch {
      // ignore
    }
  }, []);

  const persistScene = useCallback(
    async (scene, { force = false } = {}) => {
      const normalized = normalizeScene(scene);
      if (!normalized) return false;

      latestSceneRef.current = normalized;
      writeLocalBackup(meeting, normalized);

      const store = storeRef.current;
      if (!store) return false;

      if (
        !force &&
        normalized.updatedAt > 0 &&
        normalized.updatedAt <= lastSyncedAtRef.current
      ) {
        return false;
      }

      writingRef.current = true;

      try {
        await store.set('scene', normalized);
        lastSyncedAtRef.current = normalized.updatedAt;
        return true;
      } catch (error) {
        console.error(
          '❌ WHITEBOARD: store.set failed, retry without files:',
          error,
        );

        try {
          await store.set('scene', {
            ...normalized,
            files: {},
          });
          lastSyncedAtRef.current = normalized.updatedAt;
          return true;
        } catch (retryError) {
          console.error('❌ WHITEBOARD: save failed:', retryError);
          return false;
        }
      } finally {
        window.setTimeout(() => {
          writingRef.current = false;
        }, 200);
      }
    },
    [meeting],
  );

  const flushSync = useCallback(async () => {
    if (latestSceneRef.current) {
      await persistScene(latestSceneRef.current, { force: true });
    }
  }, [persistScene]);

  const pushInitToFrame = useCallback(() => {
    postToFrame({
      type: 'wb:init',
      scene: latestSceneRef.current || EMPTY_SCENE,
    });
  }, [postToFrame]);

  // Store
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!meeting || initializedRef.current) return;
      initializedRef.current = true;

      try {
        const store = await meeting.stores.create('whiteboard');
        if (cancelled) return;
        if (!store) throw new Error('Store undefined');

        storeRef.current = store;

        const fromStore = normalizeScene(store.get('scene'));
        const fromLocal = readLocalBackup(meeting);
        const restored = pickNewerScene(fromStore, fromLocal);

        if (restored) {
          latestSceneRef.current = restored;
          lastSyncedAtRef.current = restored.updatedAt || 0;

          if (
            fromLocal &&
            (!fromStore ||
              (fromLocal.updatedAt || 0) >
                (fromStore.updatedAt || 0))
          ) {
            await persistScene(fromLocal, { force: true });
          }
        }

        if (frameReadyRef.current) {
          pushInitToFrame();
        }

        const onRemote = (payload) => {
          if (writingRef.current) return;

          const remote = normalizeScene(
            payload?.value !== undefined
              ? payload.value
              : payload,
          );

          if (!remote) return;

          if (
            remote.updatedAt > 0 &&
            remote.updatedAt <= lastSyncedAtRef.current
          ) {
            return;
          }

          const current = latestSceneRef.current;

          if (
            current &&
            current.updatedAt > 0 &&
            remote.updatedAt > 0 &&
            remote.updatedAt < current.updatedAt
          ) {
            return;
          }

          latestSceneRef.current = remote;
          lastSyncedAtRef.current = Math.max(
            lastSyncedAtRef.current,
            remote.updatedAt || 0,
          );

          postToFrame({
            type: 'wb:remote-scene',
            scene: remote,
          });
        };

        store.subscribe('scene', onRemote);
        cleanupStoreRef.current = () => {
          try {
            store.unsubscribe('scene', onRemote);
          } catch {
            // ignore
          }
        };
      } catch (error) {
        console.error('❌ WHITEBOARD: store init failed:', error);
        initializedRef.current = false;

        const fromLocal = readLocalBackup(meeting);
        if (fromLocal) {
          latestSceneRef.current = fromLocal;
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      cleanupStoreRef.current?.();
      cleanupStoreRef.current = null;
      storeRef.current = null;
      initializedRef.current = false;
    };
  }, [meeting, persistScene, postToFrame, pushInitToFrame]);

  // Persist on hide / unmount
  useEffect(() => {
    const onHide = () => {
      void flushSync();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };

    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener(
        'visibilitychange',
        onVisibility,
      );
      void flushSync();
    };
  }, [flushSync]);

  // Frame ↔ parent messages
  useEffect(() => {
    if (!active) return undefined;

    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'wb:hello' || data.type === 'wb:ready') {
        frameReadyRef.current = true;
        setBootError(null);
        pushInitToFrame();
        return;
      }

      if (data.type === 'wb:scene') {
        const scene = normalizeScene(data.scene);
        if (!scene) return;
        latestSceneRef.current = scene;
        writeLocalBackup(meeting, scene);
        void persistScene(scene);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [active, meeting, persistScene, pushInitToFrame]);

  // Refresh Excalidraw when host size / fullscreen changes
  useEffect(() => {
    if (!active) return undefined;

    const refresh = () => {
      postToFrame({ type: 'wb:refresh' });
    };

    document.addEventListener('fullscreenchange', refresh);
    document.addEventListener('webkitfullscreenchange', refresh);
    window.addEventListener('resize', refresh);

    const iframe = iframeRef.current;
    const ro = iframe
      ? new ResizeObserver(() => refresh())
      : null;
    if (iframe && ro) ro.observe(iframe);

    return () => {
      document.removeEventListener('fullscreenchange', refresh);
      document.removeEventListener(
        'webkitfullscreenchange',
        refresh,
      );
      window.removeEventListener('resize', refresh);
      ro?.disconnect();
    };
  }, [active, sessionKey, postToFrame]);

  useEffect(() => {
    if (!active) {
      void flushSync();
      frameReadyRef.current = false;
      return undefined;
    }

    frameReadyRef.current = false;
    setBootError(null);

    const timeout = window.setTimeout(() => {
      if (!frameReadyRef.current) {
        setBootError('whiteboard frame not ready');
      }
    }, 8000);

    return () => {
      window.clearTimeout(timeout);
      void flushSync();
      frameReadyRef.current = false;
    };
  }, [active, sessionKey, flushSync]);

  if (!active) {
    return null;
  }

  return (
    <div
      className="realtimekit-whiteboard-anchor"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      <iframe
        key={sessionKey}
        ref={iframeRef}
        title="Whiteboard"
        src={FRAME_SRC}
        allow="clipboard-read; clipboard-write"
        style={{
          border: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          background: '#ffffff',
        }}
      />

      {bootError && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 5,
            padding: '6px 10px',
            borderRadius: 6,
            background: 'rgba(180, 40, 40, 0.85)',
            color: '#fff',
            fontSize: 12,
            pointerEvents: 'none',
          }}
        >
          {bootError}
        </div>
      )}
    </div>
  );
}
