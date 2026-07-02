export type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

const CACHE_KEY = "erp.deviceLocation";

export function readCachedDeviceLocation(): DeviceLocation | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceLocation;
    if (typeof parsed.latitude !== "number" || typeof parsed.longitude !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Ask browser for GPS once per session (user must tap Allow). Does not block long. */
export async function readDeviceLocation(timeoutMs = 5000): Promise<DeviceLocation | null> {
  const cached = readCachedDeviceLocation();
  if (cached) return cached;
  if (!navigator.geolocation) return null;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        const loc: DeviceLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(loc));
        resolve(loc);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300_000 }
    );
  });
}

export function deviceLocationPayload(loc: DeviceLocation | null) {
  if (!loc) return {};
  return {
    latitude: loc.latitude,
    longitude: loc.longitude,
    ...(loc.accuracy != null ? { location_accuracy: loc.accuracy } : {})
  };
}
