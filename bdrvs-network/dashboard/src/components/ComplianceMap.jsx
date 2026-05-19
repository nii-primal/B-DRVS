import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GHANA_CENTER } from '../utils/ghana-coords.js';
import { geolocate } from '../utils/geolocation.js';
import { fmtRelative, fmtRtt } from '../utils/format.js';

// Custom DivIcon — uses our hairline-stroked dot style rather than the
// default Leaflet pin so the map matches the editorial design language.
function makeIcon(status) {
  const klass =
    status === 'SOVEREIGNTY_VIOLATION' || status === 'VIOLATION'
      ? 'bdrvs-marker bdrvs-marker--violation'
      : status === 'COMPLIANT'
        ? 'bdrvs-marker'
        : 'bdrvs-marker bdrvs-marker--pending';
  return L.divIcon({
    html: `<span class="${klass}"></span>`,
    className: 'bdrvs-marker-wrapper',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });
}

/**
 * @param {Object[]} servers — array of latest-status records:
 *   { serverID, status, ipAddress, rtt, timestamp }
 */
export default function ComplianceMap({ servers = [] }) {
  const [points, setPoints] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const resolved = await Promise.all(
        servers.map(async (s) => {
          const geo = await geolocate(s.ipAddress, s.status);
          return { ...s, geo };
        }),
      );
      if (!cancelled) setPoints(resolved);
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [servers]);

  // Choose centre & zoom to fit all points. If all are inside Ghana,
  // centre on Ghana. If a violation has gone abroad, zoom out to world.
  const hasForeign = points.some((p) => p.geo && Math.abs(p.geo.lat - 7.95) > 5);
  const center = hasForeign ? [15, 20] : [GHANA_CENTER.lat, GHANA_CENTER.lng];
  const zoom = hasForeign ? 2 : 6;

  return (
    <div className="map-wrapper">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points
          .filter((p) => p.geo && !isNaN(p.geo.lat) && !isNaN(p.geo.lng))
          .map((p) => (
            <Marker
              key={p.serverID}
              position={[p.geo.lat, p.geo.lng]}
              icon={makeIcon(p.status)}
            >
              <Popup>
                <strong>{p.serverID}</strong>
                <div className="mono">{p.geo.label}</div>
                <div className="mono">{p.ipAddress || '—'}</div>
                <div className="mono">
                  RTT {fmtRtt(p.rtt)} · {fmtRelative(p.timestamp)}
                </div>
                <Link to={`/servers/${encodeURIComponent(p.serverID)}`} className="pop-link">
                  Open record →
                </Link>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
