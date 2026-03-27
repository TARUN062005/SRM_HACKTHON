import React from 'react';

export const RouteMap = ({ route, riskScore }) => {
  const getRiskColor = (score) => {
    if (score > 0.7) return 'red';
    if (score > 0.4) return 'yellow';
    return 'green';
  };

  return (
    <div className="w-full h-64 bg-slate-800 rounded-lg flex items-center justify-center relative border border-slate-700">
      <div className="absolute top-4 left-4 bg-black/50 p-2 rounded text-white text-sm">
        Risk: {(riskScore * 100).toFixed(0)}%
      </div>
      <svg className="w-full h-full" viewBox="0 0 100 100">
        <path 
          d="M 10 50 Q 50 10 90 50" 
          fill="none" 
          stroke={getRiskColor(riskScore)} 
          strokeWidth="2" 
        />
        <circle cx="10" cy="50" r="2" fill="white" />
        <circle cx="90" cy="50" r="2" fill="white" />
      </svg>
    </div>
  );
};
