import { useEffect, useRef, useState } from 'react';
import { Room as LiveKitRoom, RoomEvent, Track } from 'livekit-client';
import { apiFetch, apiFetchStrict } from '../lib/api';

interface TokenResponse {
  token: string;
  url: string;
  room: string;
  identity: string;
  expires_in: number;
}

interface Tile {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  cameraOn: boolean;
  micOn: boolean;
  video?: Track;
  audio?: Track;
}

function VideoSurface({ track, muted = false }: { track?: Track; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  if (!track) return null;
  return <video ref={ref} className="vc-video" autoPlay playsInline muted={muted} />;
}

function AudioSurface({ track }: { track?: Track }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;
    track.attach(element);
    element.play().catch(() => {
      // Autoplay may be blocked until the next gesture; LiveKit's startAudio
      // call is retried from the control bar.
    });
    return () => {
      track.detach(element);
    };
  }, [track]);

  if (!track) return null;
  return <audio ref={ref} autoPlay className="sr-only" />;
}

function syncTiles(room: LiveKitRoom): Tile[] {
  const people = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
  return people.map((participant) => {
    const camera = participant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    const microphone = participant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    return {
      identity: participant.identity,
      name: participant.name || participant.identity,
      isLocal: participant === room.localParticipant,
      isSpeaking: participant.isSpeaking,
      cameraOn: participant.isCameraEnabled,
      micOn: participant.isMicrophoneEnabled,
      video: camera,
      audio: microphone,
    };
  });
}

export default function VideoCall({
  roomId,
  roomName,
  livekitEnabled,
}: {
  roomId: string | number;
  roomName: string;
  livekitEnabled?: boolean;
}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const roomRef = useRef<LiveKitRoom | null>(null);
  const videoSessionRef = useRef<{ id: number; timer?: number } | null>(null);
  const callActiveRef = useRef(false);

  const stopVideoSession = () => {
    callActiveRef.current = false;
    const current = videoSessionRef.current;
    videoSessionRef.current = null;
    if (!current) return;
    if (current.timer) window.clearInterval(current.timer);
    void apiFetchStrict(`/rooms/${roomId}/video-sessions/${current.id}/end/`, {
      method: 'POST',
      // Let the browser finish this request when the tab is closing.
      keepalive: true,
    }).catch(() => {
      // A closed tab or a transient network failure must never block leaving.
    });
  };

  const startVideoSession = async () => {
    try {
      const data = await apiFetchStrict<{ id: number; heartbeat_interval: number }>(
        `/rooms/${roomId}/video-sessions/start/`,
        { method: 'POST' },
      );
      if (!data?.id || !callActiveRef.current || videoSessionRef.current) return;
      const timer = window.setInterval(() => {
        const session = videoSessionRef.current;
        if (!session) return;
        void apiFetchStrict(`/rooms/${roomId}/video-sessions/${session.id}/heartbeat/`, {
          method: 'POST',
        }).catch(() => {
          // Heartbeats are best-effort; the server caps stale sessions.
        });
      }, Math.max(15, data.heartbeat_interval || 30) * 1000);
      videoSessionRef.current = { id: data.id, timer };
    } catch {
      // Video calling still works when aggregate duration tracking is down.
    }
  };

  useEffect(() => {
    return () => {
      stopVideoSession();
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        room.removeAllListeners();
        void room.disconnect();
      }
    };
    // The cleanup intentionally runs once for the mounted call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    if (roomRef.current) setTiles(syncTiles(roomRef.current));
  };

  const join = async () => {
    if (connecting || roomRef.current) return;
    setConnecting(true);
    setError('');

    callActiveRef.current = true;
    const credentials = await apiFetch<TokenResponse>(`/rooms/${roomId}/livekit-token/`, { method: 'POST' });
    if (!credentials?.token) {
      callActiveRef.current = false;
      setConnecting(false);
      return;
    }

    const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.TrackSubscribed, refresh);
    room.on(RoomEvent.TrackUnsubscribed, refresh);
    room.on(RoomEvent.TrackMuted, refresh);
    room.on(RoomEvent.TrackUnmuted, refresh);
    room.on(RoomEvent.LocalTrackPublished, refresh);
    room.on(RoomEvent.LocalTrackUnpublished, refresh);
    room.on(RoomEvent.ActiveSpeakersChanged, refresh);
    room.on(RoomEvent.Disconnected, () => {
      stopVideoSession();
      setConnected(false);
      setTiles([]);
    });

    try {
      await room.connect(credentials.url, credentials.token);
      setConnected(true);
      void startVideoSession();
      await room.startAudio().catch(() => {});
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        setMicOn(false);
      }
      try {
        await room.localParticipant.setCameraEnabled(true);
      } catch {
        setCamOn(false);
        setError('The camera could not start. Check your browser permission, then use the Camera button.');
      }
      setMicOn(room.localParticipant.isMicrophoneEnabled);
      setCamOn(room.localParticipant.isCameraEnabled);
      refresh();
    } catch {
      callActiveRef.current = false;
      setError('Could not join the call. Check your connection and try again.');
      roomRef.current = null;
      room.removeAllListeners();
      await room.disconnect().catch(() => {});
    } finally {
      setConnecting(false);
    }
  };

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!micOn).catch(() => {});
    setMicOn(room.localParticipant.isMicrophoneEnabled);
    refresh();
  };

  const toggleCam = async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!camOn).catch(() => {});
    setCamOn(room.localParticipant.isCameraEnabled);
    refresh();
  };

  const leave = async () => {
    stopVideoSession();
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      await room.disconnect().catch(() => {});
    }
    setConnected(false);
    setTiles([]);
    setError('');
  };

  if (livekitEnabled === false) {
    return (
      <div className="video-empty">
        <div className="video-empty-icon"><i className="bx bx-video-off"></i></div>
        <h3>Live video isn’t configured yet</h3>
        <p className="text-sm text-muted">
          The room chat and whiteboard still work. Ask your administrator to add LiveKit credentials to enable calls.
        </p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="video-empty">
        <div className="video-empty-icon"><i className="bx bx-video"></i></div>
        <h3>Meet face to face</h3>
        <p className="text-sm text-muted">
          Join the live video room for <strong>{roomName}</strong>. Your camera and microphone stay off until you join.
        </p>
        {error && <p className="field-error">{error}</p>}
        <button type="button" className="btn btn-primary" onClick={() => void join()} disabled={connecting}>
          {connecting ? <><i className="bx bx-loader-alt bx-spin"></i> Connecting…</> : <><i className="bx bx-video"></i> Join video call</>}
        </button>
        <span className="text-xs text-muted">Powered by LiveKit · camera and mic permissions are requested next.</span>
      </div>
    );
  }

  return (
    <div className="video-call-shell">
      <div className="vc-topbar">
        <span className="vc-live-badge"><span className="vc-live-dot"></span> LIVE · {roomName}</span>
        <span className="vc-topbar-count">{tiles.length} in the room</span>
      </div>

      <div className="vc-grid" style={{ gridTemplateColumns: tiles.length <= 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
        {tiles.map((tile) => (
          <div className="vc-tile" key={tile.identity}>
            {tile.video && tile.cameraOn ? (
              <VideoSurface track={tile.video} muted={tile.isLocal} />
            ) : (
              <div className="vc-avatar">
                <div className={`vc-avatar-letter ${tile.isLocal ? 'local' : 'remote'}`}>
                  {tile.name.replace(/^user-/, '')[0]?.toUpperCase() || '?'}
                </div>
                <span className="vc-camera-off"><i className="bx bx-video-off"></i> camera off</span>
              </div>
            )}
            {!tile.isLocal && <AudioSurface track={tile.audio} />}
            {tile.isSpeaking && <span className="vc-speaking-ring" aria-hidden="true"></span>}
            <span className="vc-name-label">
              <span className={tile.micOn ? 'vc-name-online-dot' : 'vc-name-muted-dot'}></span>
              {tile.name}
              {!tile.micOn && <i className="bx bx-microphone-off"></i>}
            </span>
            {tile.isLocal && <span className="vc-you-badge">YOU</span>}
          </div>
        ))}
        {tiles.length === 0 && (
          <div className="vc-waiting">
            <div className="vc-waiting-icon"><i className="bx bx-user-voice"></i></div>
            <span>Waiting for the first collaborator…</span>
          </div>
        )}
      </div>

      {error && <p className="vc-inline-error">{error}</p>}

      <div className="vc-controls">
        <button type="button" className={`vc-ctrl-btn ${micOn ? '' : 'muted'}`} onClick={() => void toggleMic()} aria-pressed={!micOn}>
          <i className={micOn ? 'bx bx-microphone' : 'bx bx-microphone-off'}></i>
          <span>{micOn ? 'Mute' : 'Unmute'}</span>
        </button>
        <button type="button" className={`vc-ctrl-btn ${camOn ? '' : 'muted'}`} onClick={() => void toggleCam()} aria-pressed={!camOn}>
          <i className={camOn ? 'bx bx-video' : 'bx bx-video-off'}></i>
          <span>{camOn ? 'Camera off' : 'Camera on'}</span>
        </button>
        <span className="vc-controls-divider" />
        <button type="button" className="vc-leave-btn" onClick={() => void leave()}>
          <i className="bx bx-phone-off"></i> Leave call
        </button>
      </div>
    </div>
  );
}
