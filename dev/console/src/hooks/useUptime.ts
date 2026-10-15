import { useState, useEffect } from 'react';

const startedAt = Date.now();

export function useUptime() {
  const [uptime, setUptime] = useState('');

  useEffect(() => {
    function update() {
      const ms = Date.now() - startedAt;
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setUptime(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  return uptime;
}
