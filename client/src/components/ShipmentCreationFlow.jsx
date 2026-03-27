import React, { useState } from 'react';
import { createShipment } from '../services/apiSupplyChain';
import { RouteMap } from './RouteMap';

export const ShipmentCreationFlow = () => {
  const [source, setSource] = useState('A');
  const [dest, setDest] = useState('G');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await createShipment(source, dest);
      setResult(data.data);
    } catch (err) {
        console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-slate-900 text-white rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold mb-4">New Shipment</h2>
      <form onSubmit={handleSubmit} className="flex gap-4 mb-6">
        <input 
          value={source} onChange={(e) => setSource(e.target.value)} 
          placeholder="Origin Node" className="flex-1 bg-slate-800 p-2 rounded border border-slate-700" 
        />
        <input 
          value={dest} onChange={(e) => setDest(e.target.value)} 
          placeholder="Destination Node" className="flex-1 bg-slate-800 p-2 rounded border border-slate-700" 
        />
        <button type="submit" disabled={loading} className="bg-blue-600 px-6 py-2 rounded hover:bg-blue-700 transition">
          {loading ? 'Routing...' : 'Optimize'}
        </button>
      </form>

      {result && (
        <div className="space-y-4">
          <RouteMap route={result.route.path} riskScore={result.riskScore} />
          
          <div className="bg-slate-800 p-4 rounded border border-slate-700">
            <h3 className="text-lg font-semibold mb-2">Best Route Selected</h3>
            <p className="font-mono text-sm">{result.route.path.join(' → ')}</p>
            <p className="text-sm text-slate-400 mt-2">Cost: {result.route.totalCost}</p>
          </div>
          
          {result.alternatives.length > 0 && (
            <div className="bg-slate-800 p-4 rounded border border-slate-700">
              <h3 className="text-lg font-semibold mb-2 text-slate-300">Alternatives</h3>
              {result.alternatives.map((alt, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-700 last:border-0">
                  <span className="font-mono">{alt.path.join(' → ')}</span>
                  <span className="text-slate-400">Cost: {alt.cost}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
