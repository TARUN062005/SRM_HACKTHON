import React, { useEffect, useState } from 'react';
import { getAlerts } from '../services/apiSupplyChain';

export const AlertsWidget = () => {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    getAlerts().then(res => setAlerts(res.data.data)).catch(console.error);
  }, []);

  return (
    <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      <div className="bg-red-900/40 p-3 border-b border-slate-700">
        <h3 className="text-red-400 font-bold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          Critical Risk Alerts
        </h3>
      </div>
      <div className="p-3 max-h-64 overflow-y-auto space-y-3">
        {alerts.map(alert => (
          <div key={alert._id} className="text-sm text-slate-300 border-l-2 border-red-500 pl-3">
            <div className="font-semibold text-white">
              Shipment {alert.shipmentId?.source} → {alert.shipmentId?.destination}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Risk Score: {(alert.finalScore * 100).toFixed(1)}%
            </div>
          </div>
        ))}
        {alerts.length === 0 && <p className="text-sm text-slate-500 text-center">No active alerts</p>}
      </div>
    </div>
  );
};
