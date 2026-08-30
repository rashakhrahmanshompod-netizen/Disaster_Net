let googleMapsPromise = null;

export const getGoogleMapsApiKey = () => {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (envKey) return envKey;
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('disasternet_gmaps_key') || '').trim();
  }
  return '';
};

export const setGoogleMapsApiKey = (key) => {
  if (typeof window !== 'undefined') {
    if (key) {
      localStorage.setItem('disasternet_gmaps_key', key.trim());
    } else {
      localStorage.removeItem('disasternet_gmaps_key');
    }
  }
};

export const hasGoogleMapsApiKey = () => Boolean(getGoogleMapsApiKey());

export const loadGoogleMaps = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only be loaded in the browser.'));
  }

  if (window.google?.maps?.importLibrary) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) return googleMapsPromise;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key is not configured.'));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-disasternet-google-maps="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps JavaScript API failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.dataset.disasternetGoogleMaps = 'true';
    script.onload = () => {
      if (window.google?.maps?.importLibrary) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps loaded but the Maps library is unavailable.'));
      }
    };
    script.onerror = () => reject(new Error('Google Maps JavaScript API failed to load. Check the API key, enabled APIs, billing, and internet connection.'));
    document.head.appendChild(script);
  }).catch((error) => {
    googleMapsPromise = null;
    throw error;
  });

  return googleMapsPromise;
};

export const calculateGoogleDistanceMatrix = async (warehouses, destination) => {
  if (!warehouses?.length) {
    throw new Error('No warehouse locations are available for route optimization.');
  }

  await loadGoogleMaps();
  const routesLibrary = await window.google.maps.importLibrary('routes');
  const origins = warehouses.map((warehouse) => ({
    lat: Number(warehouse.warehouse_lat),
    lng: Number(warehouse.warehouse_lng),
  }));
  const destinations = [{
    lat: Number(destination.lat),
    lng: Number(destination.lng),
  }];

  // Use the requested Google Distance Matrix service first. Google currently
  // classifies it as legacy/deprecated, so the modern RouteMatrix class is a
  // compatibility fallback if a project no longer permits the legacy service.
  try {
    const { DistanceMatrixService, TravelMode, UnitSystem } = routesLibrary;
    const service = new DistanceMatrixService();
    const response = await service.getDistanceMatrix({
      origins,
      destinations,
      travelMode: TravelMode.DRIVING,
      unitSystem: UnitSystem.METRIC,
      avoidFerries: false,
      avoidHighways: false,
      avoidTolls: false,
    });

    const candidates = response.rows
      .map((row, index) => {
        const element = row.elements?.[0];
        if (!element || element.status !== 'OK' || !element.distance || !element.duration) return null;
        return {
          warehouse: warehouses[index],
          distance_meters: element.distance.value,
          duration_seconds: element.duration.value,
          distance_text: element.distance.text,
          duration_text: element.duration.text,
          provider: 'Google Distance Matrix API',
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.distance_meters !== b.distance_meters) return a.distance_meters - b.distance_meters;
        return a.duration_seconds - b.duration_seconds;
      });

    if (candidates.length) return candidates[0];
    throw new Error('No route was returned by Google Distance Matrix.');
  } catch (legacyError) {
    console.warn('Google Distance Matrix legacy service unavailable; trying Route Matrix:', legacyError);

    const { RouteMatrix } = routesLibrary;
    if (!RouteMatrix?.computeRouteMatrix) throw legacyError;

    const { matrix } = await RouteMatrix.computeRouteMatrix({
      origins,
      destinations,
      travelMode: 'DRIVING',
      fields: ['distanceMeters', 'durationMillis', 'condition'],
    });

    const candidates = matrix.rows
      .map((row, index) => {
        const item = row.items?.[0];
        if (!item || item.condition !== 'ROUTE_EXISTS' || !item.distanceMeters || !item.durationMillis) return null;
        return {
          warehouse: warehouses[index],
          distance_meters: item.distanceMeters,
          duration_seconds: item.durationMillis / 1000,
          distance_text: `${(item.distanceMeters / 1000).toFixed(1)} km`,
          duration_text: `${Math.max(1, Math.round(item.durationMillis / 60000))} min`,
          provider: 'Google Routes Route Matrix',
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.distance_meters !== b.distance_meters) return a.distance_meters - b.distance_meters;
        return a.duration_seconds - b.duration_seconds;
      });

    if (!candidates.length) {
      throw new Error('Google could not find a drivable route from the available warehouses.');
    }
    return candidates[0];
  }
};
