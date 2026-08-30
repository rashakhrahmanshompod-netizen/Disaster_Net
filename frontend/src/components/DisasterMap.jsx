import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Home, Key, Layers, Navigation, RefreshCw, ShieldAlert, Truck, Warehouse, X } from 'lucide-react';
import { getGoogleMapsApiKey, hasGoogleMapsApiKey, loadGoogleMaps, setGoogleMapsApiKey } from '../services/googleMaps';

const BANGLADESH_CENTER = { lat: 23.685, lng: 90.3563 };

const asLatLngLiteral = (location) => {
  if (!location) return null;
  const lat = typeof location.lat === 'function' ? location.lat() : Number(location.lat);
  const lng = typeof location.lng === 'function' ? location.lng() : Number(location.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const straightLineDistanceKm = (a, b) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const loadLeaflet = () => {
  return new Promise((resolve, reject) => {
    if (window.L) {
      return resolve(window.L);
    }
    const existingScript = document.querySelector('script[data-leaflet="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.L), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Leaflet failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.dataset.leaflet = 'true';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Leaflet tile library failed to load from CDN.'));
    document.head.appendChild(script);
  });
};

const TILE_LAYERS = {
  dark: {
    name: 'Dark Canvas',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    subdomains: 'abcd',
  },
  streets: {
    name: 'Street Map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
  },
  satellite: {
    name: 'Satellite Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
};

const InteractiveLeafletMap = ({ disasters = [], inventories = [], requests = [], reason }) => {
  const mapContainerRef = useRef(null);
  const leafletInstanceRef = useRef(null);
  const [activeTileKey, setActiveTileKey] = useState('dark');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const activeDisaster = useMemo(() => {
    return disasters.find((item) => item.status === 'Active') || disasters[0] || null;
  }, [disasters]);

  const mapCenter = useMemo(() => {
    if (activeDisaster) {
      const lat = Number(activeDisaster.lat);
      const lng = Number(activeDisaster.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    return [BANGLADESH_CENTER.lat, BANGLADESH_CENTER.lng];
  }, [activeDisaster]);

  useEffect(() => {
    let isCancelled = false;

    const initLeaflet = async () => {
      try {
        setLoading(true);
        const L = await loadLeaflet();
        if (isCancelled || !mapContainerRef.current) return;

        if (leafletInstanceRef.current) {
          leafletInstanceRef.current.remove();
          leafletInstanceRef.current = null;
        }

        const map = L.map(mapContainerRef.current, {
          center: mapCenter,
          zoom: activeDisaster ? 9 : 7,
          zoomControl: true,
        });

        leafletInstanceRef.current = map;

        const tileConfig = TILE_LAYERS[activeTileKey] || TILE_LAYERS.dark;
        L.tileLayer(tileConfig.url, {
          attribution: tileConfig.attribution,
          subdomains: tileConfig.subdomains || 'abc',
          maxZoom: 19,
        }).addTo(map);

        const createMarkerIcon = (label, color, bg) => {
          return L.divIcon({
            className: 'custom-map-pin',
            html: `<div style="background:${bg}; border: 2px solid ${color}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 11px; box-shadow: 0 0 10px ${color}88;">${label}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
        };

        const createPopupStyle = (title, details, badgeColor = '#3b82f6') => `
          <div style="font-family: system-ui, sans-serif; padding: 4px 2px; min-width: 200px;">
            <div style="font-weight: 700; font-size: 0.95rem; color: #111827; margin-bottom: 4px;">${title}</div>
            <div style="height: 2px; background: ${badgeColor}; width: 40px; margin-bottom: 8px; border-radius: 2px;"></div>
            <div style="font-size: 0.82rem; color: #374151; line-height: 1.4;">${details}</div>
          </div>
        `;

        disasters.forEach((disaster) => {
          const lat = Number(disaster.lat);
          const lng = Number(disaster.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const marker = L.marker([lat, lng], {
            icon: createMarkerIcon('!', '#ef4444', 'rgba(239, 68, 68, 0.85)'),
          }).addTo(map);
          marker.bindPopup(createPopupStyle(
            disaster.title,
            `<strong>Type:</strong> ${disaster.disaster_type}<br/>
             <strong>Severity:</strong> ${disaster.severity}<br/>
             <strong>Affected:</strong> ${disaster.affected_districts}<br/>
             <strong>Status:</strong> ${disaster.status}`,
            '#ef4444'
          ));
        });

        inventories.forEach((item) => {
          const lat = Number(item.warehouse_lat);
          const lng = Number(item.warehouse_lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const marker = L.marker([lat, lng], {
            icon: createMarkerIcon('W', '#10b981', 'rgba(16, 185, 129, 0.85)'),
          }).addTo(map);
          marker.bindPopup(createPopupStyle(
            item.warehouse_location || 'Warehouse Depot',
            `<strong>Org:</strong> ${item.organization_name || 'Relief Agency'}<br/>
             <strong>Stock:</strong> ${item.item_name}: ${item.quantity} ${item.unit}`,
            '#10b981'
          ));
        });

        const defaultFacilities = [
          { name: 'Sylhet Disaster Shelter', lat: 24.8949 + 0.05, lng: 91.8687 - 0.04, type: 'shelter' },
          { name: 'Sunamganj Emergency Care', lat: 25.0658 - 0.03, lng: 91.3950 + 0.03, type: 'hospital' },
          { name: 'Dhaka Central Relief Hub', lat: 23.8103, lng: 90.4125, type: 'shelter' },
          { name: 'Chittagong Coastal Shelter', lat: 22.3569 + 0.04, lng: 91.7832 - 0.03, type: 'shelter' },
          { name: 'Khulna General Hospital', lat: 22.8456 - 0.02, lng: 89.5403 + 0.02, type: 'hospital' },
        ];

        defaultFacilities.forEach((fac) => {
          const color = fac.type === 'hospital' ? '#06b6d4' : '#3b82f6';
          const label = fac.type === 'hospital' ? 'H' : 'S';
          const marker = L.marker([fac.lat, fac.lng], {
            icon: createMarkerIcon(label, color, fac.type === 'hospital' ? 'rgba(6, 182, 212, 0.85)' : 'rgba(59, 130, 246, 0.85)'),
          }).addTo(map);
          marker.bindPopup(createPopupStyle(
            fac.name,
            `<strong>Facility:</strong> ${fac.type === 'hospital' ? 'Hospital' : 'Emergency Shelter'}<br/>
             <em>Click marker to view location on real street map.</em>`,
            color
          ));

          if (activeDisaster && fac.type === 'shelter') {
            const disLat = Number(activeDisaster.lat);
            const disLng = Number(activeDisaster.lng);
            if (Number.isFinite(disLat) && Number.isFinite(disLng)) {
              L.polyline([[disLat, disLng], [fac.lat, fac.lng]], {
                color: '#22c55e',
                weight: 4,
                opacity: 0.8,
                dashArray: '6, 8',
              }).addTo(map);
            }
          }
        });

        requests.filter((req) => req.status === 'In-Transit').forEach((req) => {
          const wh = inventories.find((inv) => req.assigned_warehouse?.includes(inv.warehouse_location));
          const startLat = wh ? Number(wh.warehouse_lat) : 23.8103;
          const startLng = wh ? Number(wh.warehouse_lng) : 90.4125;
          const endLat = Number(req.destination_lat) || 24.8949;
          const endLng = Number(req.destination_lng) || 91.8687;

          if ([startLat, startLng, endLat, endLng].every(Number.isFinite)) {
            L.polyline([[startLat, startLng], [endLat, endLng]], {
              color: '#f59e0b',
              weight: 4,
              opacity: 0.95,
              dashArray: '8, 6',
            }).addTo(map);
          }
        });

        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize Leaflet map:', err);
        if (!isCancelled) {
          setLoadError(err.message || 'Interactive map tiles failed to load.');
          setLoading(false);
        }
      }
    };

    initLeaflet();

    return () => {
      isCancelled = true;
      if (leafletInstanceRef.current) {
        leafletInstanceRef.current.remove();
        leafletInstanceRef.current = null;
      }
    };
  }, [activeTileKey, mapCenter, activeDisaster, disasters, inventories, requests]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#60a5fa' }}>
          <Layers size={15} />
          <span>Interactive OpenStreetMap (No Google key required)</span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {Object.entries(TILE_LAYERS).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setActiveTileKey(key)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: activeTileKey === key ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                background: activeTileKey === key ? '#1d4ed8' : 'rgba(31,41,55,0.7)',
                color: 'white',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: activeTileKey === key ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {config.name}
            </button>
          ))}
        </div>
      </div>

      {reason && (
        <div style={{ marginBottom: '10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', borderRadius: '8px', padding: '10px 12px', fontSize: '0.82rem' }}>
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Using interactive OpenStreetMap tiles because: {reason}
        </div>
      )}

      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
          Loading real interactive map tiles…
        </div>
      )}

      {loadError && (
        <div style={{ padding: '14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', fontSize: '0.82rem' }}>
          {loadError}
        </div>
      )}

      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '500px',
          borderRadius: '14px',
          border: '1px solid rgba(255,255,255,0.12)',
          overflow: 'hidden',
          background: '#0d1322',
          zIndex: 1,
        }}
      />
    </div>
  );
};

export const DisasterMap = ({ disasters = [], inventories = [], requests = [] }) => {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const evacuationPolylinesRef = useRef([]);
  const deliveryPolylinesRef = useRef([]);
  const infoWindowRef = useRef(null);

  const [mapError, setMapError] = useState('');
  const [mapLoading, setMapLoading] = useState(true);
  const [facilities, setFacilities] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);

  const [storedApiKey, setStoredApiKey] = useState(() => getGoogleMapsApiKey());
  const [keyInput, setKeyInput] = useState(() => getGoogleMapsApiKey());
  const [showKeyInput, setShowKeyInput] = useState(false);

  const activeDisaster = useMemo(() => {
    return disasters.find((item) => item.status === 'Active') || disasters[0] || null;
  }, [disasters]);

  const routeOrigin = useMemo(() => {
    if (!activeDisaster) return BANGLADESH_CENTER;
    const lat = Number(activeDisaster.lat);
    const lng = Number(activeDisaster.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : BANGLADESH_CENTER;
  }, [activeDisaster]);

  const handleApplyKey = () => {
    setGoogleMapsApiKey(keyInput);
    setStoredApiKey(keyInput.trim());
    setMapError('');
    setShowKeyInput(false);
  };

  const handleClearKey = () => {
    setGoogleMapsApiKey('');
    setStoredApiKey('');
    setKeyInput('');
    setMapError('');
  };

  useEffect(() => {
    let cancelled = false;

    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.setMap?.(null));
      markersRef.current = [];
    };

    const clearPolylines = (collectionRef) => {
      collectionRef.current.forEach((polyline) => polyline.setMap?.(null));
      collectionRef.current = [];
    };

    const addMarker = (google, map, position, title, label, color, html, onClick) => {
      const marker = new google.maps.Marker({
        map,
        position,
        title,
        label: label ? { text: label, color: 'white', fontWeight: '700' } : undefined,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 12,
        },
      });
      marker.addListener('click', () => {
        if (html) {
          infoWindowRef.current.setContent(html);
          infoWindowRef.current.open({ map, anchor: marker });
        }
        if (onClick) onClick();
      });
      markersRef.current.push(marker);
      return marker;
    };

    const drawRoute = async (origin, destination, kind = 'evacuation', facility = null) => {
      const { Route } = await window.google.maps.importLibrary('routes');
      const { routes } = await Route.computeRoutes({
        origin,
        destination,
        travelMode: 'DRIVING',
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
      });
      if (!routes?.length) return null;

      const route = routes[0];
      const polylines = route.createPolylines({
        polylineOptions: {
          strokeColor: kind === 'delivery' ? '#f59e0b' : '#22c55e',
          strokeOpacity: 0.9,
          strokeWeight: kind === 'delivery' ? 5 : 6,
        },
      });
      polylines.forEach((polyline) => polyline.setMap(mapRef.current));

      if (kind === 'delivery') {
        deliveryPolylinesRef.current.push(...polylines);
      } else {
        clearPolylines(evacuationPolylinesRef);
        evacuationPolylinesRef.current.push(...polylines);
        setRouteSummary({
          facility: facility?.name || 'Emergency facility',
          type: facility?.type || 'facility',
          distanceKm: route.distanceMeters ? (route.distanceMeters / 1000).toFixed(1) : null,
          minutes: route.durationMillis ? Math.max(1, Math.round(route.durationMillis / 60000)) : null,
        });
      }
      return route;
    };

    const initGoogleMap = async () => {
      if (!hasGoogleMapsApiKey()) {
        setMapError('No Google Maps API key provided. Using interactive OpenStreetMap.');
        setMapLoading(false);
        return;
      }

      try {
        setMapLoading(true);
        setMapError('');
        await loadGoogleMaps();
        if (cancelled || !mapElementRef.current) return;

        const google = window.google;
        const [{ Map, InfoWindow }, { Place, SearchNearbyRankPreference }] = await Promise.all([
          google.maps.importLibrary('maps'),
          google.maps.importLibrary('places'),
          google.maps.importLibrary('marker'),
        ]);

        if (!mapRef.current) {
          mapRef.current = new Map(mapElementRef.current, {
            center: routeOrigin,
            zoom: activeDisaster ? 10 : 7,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            gestureHandling: 'greedy',
            styles: [
              { elementType: 'geometry', stylers: [{ color: '#172033' }] },
              { elementType: 'labels.text.stroke', stylers: [{ color: '#172033' }] },
              { elementType: 'labels.text.fill', stylers: [{ color: '#a8b3c7' }] },
              { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d3b55' }] },
              { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
              { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b2545' }] },
            ],
          });
          infoWindowRef.current = new InfoWindow();
        } else {
          mapRef.current.setCenter(routeOrigin);
        }

        clearMarkers();
        clearPolylines(evacuationPolylinesRef);
        clearPolylines(deliveryPolylinesRef);
        setRouteSummary(null);

        disasters.forEach((disaster) => {
          const lat = Number(disaster.lat);
          const lng = Number(disaster.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          addMarker(
            google,
            mapRef.current,
            { lat, lng },
            disaster.title,
            '!',
            '#ef4444',
            `<div style="max-width:260px"><strong>${disaster.title}</strong><br/>${disaster.disaster_type} · ${disaster.severity}<br/>Affected: ${disaster.affected_districts}<br/>Status: ${disaster.status}</div>`,
          );
        });

        inventories.forEach((item) => {
          const lat = Number(item.warehouse_lat);
          const lng = Number(item.warehouse_lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          addMarker(
            google,
            mapRef.current,
            { lat, lng },
            item.warehouse_location,
            'W',
            '#10b981',
            `<div style="max-width:260px"><strong>${item.warehouse_location}</strong><br/>${item.organization_name}<br/>${item.item_name}: ${item.quantity} ${item.unit}</div>`,
          );
        });

        let hospitals = [];
        let shelters = [];

        try {
          const hospitalResult = await Place.searchNearby({
            fields: ['id', 'displayName', 'location', 'formattedAddress', 'googleMapsURI'],
            locationRestriction: { center: routeOrigin, radius: 50000 },
            includedPrimaryTypes: ['hospital'],
            maxResultCount: 8,
            rankPreference: SearchNearbyRankPreference.DISTANCE,
          });
          hospitals = (hospitalResult.places || []).map((place) => ({
            id: place.id,
            name: place.displayName || 'Hospital',
            type: 'hospital',
            location: asLatLngLiteral(place.location),
            address: place.formattedAddress || '',
            googleMapsURI: place.googleMapsURI,
          })).filter((item) => item.location);
        } catch (error) {
          console.warn('Google hospital search failed:', error);
        }

        try {
          const queries = ['disaster shelter', 'cyclone shelter'];
          const shelterResults = await Promise.all(queries.map((textQuery) => Place.searchByText({
            textQuery,
            fields: ['id', 'displayName', 'location', 'formattedAddress', 'googleMapsURI'],
            locationBias: routeOrigin,
            maxResultCount: 6,
            region: 'bd',
            language: 'en-US',
          })));
          const seen = new Set();
          shelters = shelterResults.flatMap((result) => result.places || []).map((place) => ({
            id: place.id,
            name: place.displayName || 'Emergency Shelter',
            type: 'shelter',
            location: asLatLngLiteral(place.location),
            address: place.formattedAddress || '',
            googleMapsURI: place.googleMapsURI,
          })).filter((item) => {
            if (!item.location || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          }).slice(0, 10);
        } catch (error) {
          console.warn('Google shelter search failed:', error);
        }

        if (cancelled) return;
        const allFacilities = [...shelters, ...hospitals];
        setFacilities(allFacilities);

        allFacilities.forEach((facility) => {
          const color = facility.type === 'hospital' ? '#06b6d4' : '#3b82f6';
          const label = facility.type === 'hospital' ? 'H' : 'S';
          addMarker(
            google,
            mapRef.current,
            facility.location,
            facility.name,
            label,
            color,
            `<div style="max-width:280px"><strong>${facility.name}</strong><br/>${facility.type === 'hospital' ? 'Hospital' : 'Emergency Shelter'}<br/>${facility.address || 'Google Maps facility'}<br/><em>Click marker to calculate an evacuation route.</em></div>`,
            () => {
              drawRoute(routeOrigin, facility.location, 'evacuation', facility).catch((error) => {
                console.error('Evacuation route failed:', error);
                setMapError(`Google route calculation failed: ${error.message}`);
              });
            },
          );
        });

        if (activeDisaster && allFacilities.length) {
          const nearest = [...allFacilities].sort((a, b) => straightLineDistanceKm(routeOrigin, a.location) - straightLineDistanceKm(routeOrigin, b.location))[0];
          try {
            await drawRoute(routeOrigin, nearest.location, 'evacuation', nearest);
          } catch (error) {
            console.warn('Automatic evacuation route failed:', error);
          }
        }

        const activeDeliveries = requests.filter((request) => request.status === 'In-Transit').slice(0, 5);
        for (const request of activeDeliveries) {
          const warehouse = inventories.find((item) => request.assigned_warehouse?.includes(item.warehouse_location));
          if (!warehouse) continue;
          const origin = { lat: Number(warehouse.warehouse_lat), lng: Number(warehouse.warehouse_lng) };
          const destination = { lat: Number(request.destination_lat), lng: Number(request.destination_lng) };
          if (![origin.lat, origin.lng, destination.lat, destination.lng].every(Number.isFinite)) continue;
          try {
            await drawRoute(origin, destination, 'delivery');
          } catch (error) {
            console.warn(`Delivery route #${request.id} could not be drawn:`, error);
          }
        }
      } catch (error) {
        console.error('Google Maps initialization failed:', error);
        if (!cancelled) setMapError(error.message || 'Google Maps could not be loaded.');
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    };

    initGoogleMap();
    return () => {
      cancelled = true;
    };
  }, [activeDisaster, disasters, inventories, requests, routeOrigin, storedApiKey]);

  return (
    <div className="glass-card" style={{ padding: '24px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation color="#3b82f6" /> Disaster Map & Facilities Locator
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: '4px' }}>
            Affected areas, nearby hospitals/shelters, evacuation routing and active relief-delivery routes.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              background: storedApiKey ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              border: storedApiKey ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
              color: storedApiKey ? '#34d399' : '#60a5fa',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Key size={14} />
            {storedApiKey ? 'Google Maps API Key Active' : 'Configure Google Maps Key'}
          </button>

          <div style={{ display: 'flex', gap: '10px', fontSize: '0.75rem', background: 'rgba(31,41,55,0.6)', padding: '8px 14px', borderRadius: '10px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171' }}><ShieldAlert size={14} /> Disaster</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399' }}><Warehouse size={14} /> Warehouse</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#60a5fa' }}><Home size={14} /> Shelter / Hospital</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}><Truck size={14} /> Delivery Route</span>
          </div>
        </div>
      </div>

      {showKeyInput && (
        <div style={{ marginBottom: '16px', background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'white', fontWeight: 600, fontSize: '0.88rem' }}>Google Maps Platform API Key</span>
            <button onClick={() => setShowKeyInput(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '10px' }}>
            Enter your Google Maps JavaScript API Key to enable Google Places, Google Driving Directions and Route Matrix optimization.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              style={{
                flex: 1,
                minWidth: '240px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(31,41,55,0.8)',
                color: 'white',
                fontSize: '0.85rem',
              }}
            />
            <button
              onClick={handleApplyKey}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Check size={14} /> Apply Key
            </button>
            {storedApiKey && (
              <button
                onClick={handleClearKey}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#f87171',
                  fontWeight: 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Clear Key
              </button>
            )}
          </div>
        </div>
      )}

      {storedApiKey && !mapError ? (
        <>
          {mapLoading && (
            <div style={{ marginBottom: '12px', color: '#93c5fd', fontSize: '0.85rem' }}>Loading Google Maps, facilities and routes…</div>
          )}
          <div ref={mapElementRef} style={{ width: '100%', height: '500px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', background: '#0d1322' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '16px' }}>
            <div style={{ background: 'rgba(31,41,55,0.7)', borderRadius: '12px', padding: '14px' }}>
              <div style={{ color: 'white', fontWeight: 700, marginBottom: '6px' }}>Nearest Emergency Facilities</div>
              <div style={{ color: '#9ca3af', fontSize: '0.82rem' }}>
                Google Places found {facilities.filter((item) => item.type === 'shelter').length} shelters and {facilities.filter((item) => item.type === 'hospital').length} hospitals near the active disaster.
              </div>
            </div>
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '12px', padding: '14px' }}>
              <div style={{ color: '#86efac', fontWeight: 700, marginBottom: '6px' }}>Suggested Evacuation Route</div>
              <div style={{ color: '#d1d5db', fontSize: '0.82rem' }}>
                {routeSummary
                  ? `${routeSummary.facility}${routeSummary.distanceKm ? ` · ${routeSummary.distanceKm} km` : ''}${routeSummary.minutes ? ` · ~${routeSummary.minutes} min` : ''}. Click another facility marker to recalculate.`
                  : 'A route will be drawn to the nearest Google Maps shelter/hospital when routing data is available.'}
              </div>
            </div>
          </div>
        </>
      ) : (
        <InteractiveLeafletMap
          disasters={disasters}
          inventories={inventories}
          requests={requests}
          reason={mapError}
        />
      )}
    </div>
  );
};
