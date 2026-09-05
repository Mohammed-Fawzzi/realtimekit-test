import { useEffect, useState } from 'react';

/*
|--------------------------------------------------------------------------
| Class countdown (lesson duration)
|
| Uses an absolute endsAt timestamp in a RealtimeKit collaborative store so
| leave/rejoin does not reset the timer for anyone in the same session.
|--------------------------------------------------------------------------
*/

const DEFAULT_CLASS_MINUTES = 60;
const STORE_NAME = 'class-timer';
const ENDS_AT_KEY = 'endsAt';

function classMinutesFromQuery() {
  try {
    const raw = new URLSearchParams(window.location.search).get(
      'classMinutes',
    );
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    // ignore
  }
  return DEFAULT_CLASS_MINUTES;
}

function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;
}

function readEndsAt(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractEndsAtPayload(payload) {
  if (payload == null) return null;
  if (typeof payload === 'number') return readEndsAt(payload);
  if (typeof payload === 'object') {
    if (payload.endsAt !== undefined) return readEndsAt(payload.endsAt);
    if (payload.value !== undefined) return readEndsAt(payload.value);
  }
  return null;
}

function isRoomJoined(meeting) {
  if (!meeting?.self) return false;
  if (meeting.self.roomJoined === true) return true;
  const state = meeting.self.roomState;
  return state === 'joined' || state === 'joined-meeting';
}

export default function ClassCountdown({ meeting }) {
  const [endsAt, setEndsAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [joined, setJoined] = useState(() => isRoomJoined(meeting));

  useEffect(() => {
    if (!meeting?.self) return undefined;

    setJoined(isRoomJoined(meeting));

    const onJoined = () => setJoined(true);
    const onLeft = () => {
      setJoined(false);
      setReady(false);
    };

    try {
      meeting.self.on?.('roomJoined', onJoined);
      meeting.self.on?.('roomLeft', onLeft);
    } catch {
      // ignore
    }

    const poll = window.setInterval(() => {
      if (isRoomJoined(meeting)) setJoined(true);
    }, 1000);

    return () => {
      window.clearInterval(poll);
      try {
        meeting.self.off?.('roomJoined', onJoined);
        meeting.self.off?.('roomLeft', onLeft);
      } catch {
        // ignore
      }
    };
  }, [meeting]);

  useEffect(() => {
    if (!meeting || !joined) return undefined;

    let cancelled = false;
    let unsubscribe = null;

    const init = async () => {
      try {
        const store = await meeting.stores.create(STORE_NAME);
        if (cancelled || !store) return;

        let current = readEndsAt(store.get(ENDS_AT_KEY));

        if (!current) {
          const durationMs = classMinutesFromQuery() * 60 * 1000;
          const next = Date.now() + durationMs;
          try {
            await store.set(ENDS_AT_KEY, next);
          } catch (error) {
            console.error('❌ CLASS TIMER: store.set failed:', error);
          }
          current = readEndsAt(store.get(ENDS_AT_KEY)) || next;
        }

        if (cancelled) return;
        setEndsAt(current);
        setReady(true);

        const onRemote = (payload) => {
          const remote = extractEndsAtPayload(payload);
          if (!remote) return;
          setEndsAt((prev) => {
            if (!prev) return remote;
            return Math.min(prev, remote);
          });
        };

        store.subscribe(ENDS_AT_KEY, onRemote);
        unsubscribe = () => {
          try {
            store.unsubscribe(ENDS_AT_KEY, onRemote);
          } catch {
            // ignore
          }
        };
      } catch (error) {
        console.error('❌ CLASS TIMER: init failed:', error);
      }
    };

    void init();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [meeting, joined]);

  useEffect(() => {
    if (!endsAt || !joined) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAt, joined]);

  if (!joined || !ready || !endsAt) return null;

  const remaining = endsAt - now;
  const expired = remaining <= 0;
  const label = expired ? '00:00' : formatRemaining(remaining);

  return (
    <div
      className={`class-countdown${expired ? ' class-countdown--ended' : ''}`}
      title="مدة الحصة المتبقية"
      role="timer"
      aria-live="polite"
    >
      <span className="class-countdown__label">
        {expired ? 'انتهت' : 'الحصة'}
      </span>
      <span className="class-countdown__time">{label}</span>
    </div>
  );
}
