import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

interface LiveKitConfig {
  configured: boolean;
  url: string;
  missing: string[];
}

export default function LiveKitAlert() {
  const [config, setConfig] = useState<LiveKitConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void apiFetch<LiveKitConfig>('/livekit/config/').then(setConfig);
  }, []);

  if (dismissed || !config || config.configured) return null;

  return (
    <div className="global-alert" role="status">
      <i className="bx bx-video-off"></i>
      <div>
        <strong>Live video is not configured on this deployment.</strong>
        <span> Study rooms and whiteboards still work; calls need `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.</span>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss live video notice">
        <i className="bx bx-x"></i>
      </button>
    </div>
  );
}
