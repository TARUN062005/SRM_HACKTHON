import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Circle, Popup, useMapEvents } from "react-leaflet";

const WEATHER_RISK = ["Rain", "Drizzle", "Thunderstorm", "Snow"];

function getIntermediatePoints(start, end, steps = 7) {
  let latDiff = (end[0] - start[0]) / steps;
  let lonDiff = (end[1] - start[1]) / steps;
  let points = [];
  for (let i = 0; i <= steps; i++) {
    points.push([start[0] + latDiff * i, start[1] + lonDiff * i]);
  }
  return points;
}

export default function WeatherRouteMap() {
  const [points, setPoints] = useState([]);
  const [route, setRoute] = useState([]);
  const [risks, setRisks] = useState([]);

  // Handle map clicks
  function MapClickHandler() {
    useMapEvents({
      click(e) {
        if (points.length < 2) {
          setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
        }
      },
    });
    return null;
  }

  // When two points are selected, process the route
  useEffect(() => {
    if (points.length === 2) {
      processRoute(points[0], points[1]);
    }
    // eslint-disable-next-line
  }, [points]);

  async function processRoute(start, end) {
    setRoute([start, end]);
    setRisks([]);
    const routePoints = getIntermediatePoints(start, end, 7);

    for (let p of routePoints) {
      try {
        const res = await fetch(`http://localhost:5000/weather?lat=${p[0]}&lon=${p[1]}`);
        const data = await res.json();
        if (WEATHER_RISK.includes(data.weather)) {
          setRisks((prev) => [
            ...prev,
            { lat: data.lat, lon: data.lon, weather: data.weather, temp: data.temp },
          ]);
        }
      } catch (e) {
        // Ignore errors for demo
      }
    }
  }

  function handleReset() {
    setPoints([]);
    setRoute([]);
    setRisks([]);
  }

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <MapContainer center={[40, -100]} zoom={4} style={{ height: "100vh", width: "100vw" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler />
        {points.map((p, i) => (
          <Marker key={i} position={p} />
        ))}
        {route.length === 2 && <Polyline positions={route} color="blue" />}
        {risks.map((r, i) => (
          <Circle
            key={i}
            center={[r.lat, r.lon]}
            radius={30000}
            color="red"
            fillOpacity={0.3}
          >
            <Popup>
              <b>⚠ {r.weather}</b>
              <br />
              Temp: {r.temp}°C
            </Popup>
          </Circle>
        ))}
      </MapContainer>
      <button
        onClick={handleReset}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 1000,
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "8px 16px",
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
        }}
      >
        Reset
      </button>
      <div style={{ position: "absolute", bottom: 20, left: 20, zIndex: 1000, background: "#fff", borderRadius: 8, padding: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
        <b>Instructions:</b> Click two points on the map to draw a route and see weather risks.
      </div>
    </div>
  );
}