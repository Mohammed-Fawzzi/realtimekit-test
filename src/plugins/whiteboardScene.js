export const EMPTY_SCENE = {
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
  updatedAt: 0,
};

const SAFE_APP_STATE_KEYS = [
  'viewBackgroundColor',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemArrowhead',
];

export function pickSafeAppState(appState) {
  const safe = {
    viewBackgroundColor: '#ffffff',
    viewModeEnabled: false,
    zenModeEnabled: false,
  };

  if (!appState || typeof appState !== 'object') {
    return safe;
  }

  for (const key of SAFE_APP_STATE_KEYS) {
    if (appState[key] !== undefined) {
      safe[key] = appState[key];
    }
  }

  return safe;
}

export function normalizeScene(scene) {
  if (!scene || typeof scene !== 'object') {
    return null;
  }

  return {
    elements: Array.isArray(scene.elements) ? scene.elements : [],
    appState: pickSafeAppState(scene.appState),
    files:
      scene.files && typeof scene.files === 'object'
        ? scene.files
        : {},
    updatedAt:
      typeof scene.updatedAt === 'number' ? scene.updatedAt : 0,
  };
}

export function sceneElementCount(scene) {
  return (scene?.elements || []).filter(
    (el) => el && !el.isDeleted,
  ).length;
}

export function pruneFiles(elements, files) {
  if (!files || typeof files !== 'object') {
    return {};
  }

  const alive = new Set();

  for (const el of elements || []) {
    if (el && !el.isDeleted && el.fileId) {
      alive.add(el.fileId);
    }
  }

  const next = {};

  for (const id of alive) {
    if (files[id]) {
      next[id] = files[id];
    }
  }

  return next;
}

export function buildScenePayload(elements, appState, files, updatedAt) {
  const list = Array.from(elements || []);

  return {
    elements: list,
    appState: pickSafeAppState(appState),
    files: pruneFiles(list, files || {}),
    updatedAt: updatedAt || Date.now(),
  };
}

export function pickNewerScene(a, b) {
  const sceneA = normalizeScene(a);
  const sceneB = normalizeScene(b);

  if (!sceneA) return sceneB;
  if (!sceneB) return sceneA;

  if (sceneA.updatedAt !== sceneB.updatedAt) {
    return sceneA.updatedAt > sceneB.updatedAt ? sceneA : sceneB;
  }

  return sceneElementCount(sceneA) >= sceneElementCount(sceneB)
    ? sceneA
    : sceneB;
}

export function applySceneToApi(api, scene) {
  if (!api || !scene) return;

  api.updateScene({
    elements: scene.elements || [],
    appState: {
      ...(scene.appState || {}),
      viewModeEnabled: false,
      zenModeEnabled: false,
      openMenu: null,
      openPopup: null,
      openDialog: null,
      openSidebar: null,
    },
  });

  if (scene.files && typeof api.addFiles === 'function') {
    const files = Object.values(scene.files);
    if (files.length) {
      try {
        api.addFiles(files);
      } catch {
        // ignore
      }
    }
  }
}

export function storageKey(meeting) {
  const meetingId =
    meeting?.meta?.meetingId ||
    meeting?.meta?.roomName ||
    meeting?.id ||
    'default';

  return `rtk-whiteboard-scene:${meetingId}`;
}

export function readLocalBackup(meeting) {
  try {
    const raw = localStorage.getItem(storageKey(meeting));
    if (!raw) return null;
    return normalizeScene(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalBackup(meeting, scene) {
  try {
    localStorage.setItem(
      storageKey(meeting),
      JSON.stringify(scene),
    );
  } catch (error) {
    console.warn('⚠️ WHITEBOARD: localStorage backup failed:', error);
  }
}
