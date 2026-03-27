import { useEffect, useState } from 'react';

export const useLiveUpdates = (shipmentId) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!shipmentId) return;
    
    // Fallback polling if WebSockets are unavailable
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/shipment/${shipmentId}`);
        const result = await res.json();
        setData(result.data);
      } catch (e) {
        console.error('Polling error', e);
      }
    }, 10000); // 10s poll

    return () => clearInterval(interval);
  }, [shipmentId]);

  return data;
};
