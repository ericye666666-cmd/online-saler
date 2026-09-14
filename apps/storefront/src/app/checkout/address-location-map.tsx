/// <reference types="google.maps" />
"use client";

import { useCallback, useContext, useEffect, useRef, useState, type MutableRefObject } from "react";
import { APIProvider, APIProviderContext, APILoadingStatus, Map, useApiLoadingStatus, useMap } from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import type { DeliveryPoint } from "@online-saler/business-rules";

export const KIKUYU = { lat: -1.246, lng: 36.663 };

type Props = {
  apiKey: string;
  point: DeliveryPoint | null;
  label: string;
  onChange: (label: string, point: DeliveryPoint) => void;
  onError: () => void;
  onBusyChange?: (busy: boolean) => void;
  compact?: boolean;
  disabled?: boolean;
};

function samePoint(first: DeliveryPoint | null | undefined, second: DeliveryPoint | null | undefined) {
  return !!first && !!second && Math.abs(first.lat - second.lat) < 0.0000001 && Math.abs(first.lng - second.lng) < 0.0000001;
}

export default function AddressLocationMap({ apiKey, onError, ...props }: Props) {
  const [ready, setReady] = useState(false);
  const failed = useRef(false);
  const errorCallback = useRef(onError);
  errorCallback.current = onError;
  const busyCallback = useRef(props.onBusyChange);
  busyCallback.current = props.onBusyChange;
  const fail = useCallback(() => {
    if (failed.current) return;
    failed.current = true;
    busyCallback.current?.(false);
    errorCallback.current();
  }, []);

  // A blocked script or tile request must not strand the address dialog.
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(fail, 15000);
    return () => window.clearTimeout(timer);
  }, [ready, fail]);

  return <div className={`addressMap${props.compact ? " addressMapCompact" : ""}`}>
    <APIProvider apiKey={apiKey} region="KE" language="en" onError={fail}>
      <MapContent {...props} onReady={() => setReady(true)} onError={fail} />
    </APIProvider>
    {!ready ? <div className="addressMapLoading" role="status">Loading map…</div> : null}
  </div>;
}

function MapContent({ point, label, onChange, onBusyChange, compact, disabled = false, onReady, onError }: Omit<Props, "apiKey"> & { onReady: () => void }) {
  const status = useApiLoadingStatus();
  const version = useRef(0);
  const userMoved = useRef(false);
  const lastPublished = useRef<DeliveryPoint | null>(null);
  const busy = useRef(false);
  const latest = useRef({ point, label, onChange, onBusyChange, disabled });
  latest.current = { point, label, onChange, onBusyChange, disabled };
  const setBusy = useCallback((next: boolean) => {
    if (busy.current === next) return;
    busy.current = next;
    latest.current.onBusyChange?.(next);
  }, []);

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) onError();
  }, [status, onError]);
  useEffect(() => () => { version.current += 1; setBusy(false); }, [setBusy]);
  useEffect(() => {
    if (disabled) {
      version.current += 1;
      userMoved.current = false;
      setBusy(false);
    }
  }, [disabled, setBusy]);

  function beginInteraction() {
    if (disabled) return;
    const wasMoving = userMoved.current;
    version.current += 1;
    userMoved.current = true;
    // A new gesture cancels an older Places request. The camera-change/drag
    // events below mark busy only once the map actually starts moving.
    if (!wasMoving) setBusy(false);
  }

  const choose = useCallback((nextLabel: string, position: DeliveryPoint) => {
    if (latest.current.disabled) return;
    lastPublished.current = position;
    latest.current.onChange(nextLabel, position);
  }, []);

  return <>
    <div className="addressMapCanvas" inert={disabled} onPointerDownCapture={beginInteraction} onWheelCapture={beginInteraction}
      onKeyDownCapture={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-"].includes(event.key)) beginInteraction(); }}>
      <Map defaultCenter={point ?? KIKUYU} defaultZoom={16} style={{ width: "100%", height: "100%" }}
        gestureHandling={disabled ? "none" : "greedy"} keyboardShortcuts={!disabled}
        disableDefaultUI zoomControl={!disabled && !compact} clickableIcons={false}
        onTilesLoaded={onReady} onDragstart={() => { beginInteraction(); if (!disabled) setBusy(true); }}
        onCameraChanged={() => { if (!disabled && userMoved.current) setBusy(true); }}>
        <MapSelection point={point} label={label} disabled={disabled} version={version} userMoved={userMoved} busy={busy}
          lastPublished={lastPublished} onChange={choose} onBusyChange={setBusy} />
      </Map>
      <div className="addressMapPin" aria-hidden="true"><MapPin size={44} fill="currentColor" stroke="white" strokeWidth={1.8} /></div>
    </div>
    {!compact ? <PlaceSearch point={point} disabled={disabled} version={version} onBusyChange={(next) => {
      if (next) userMoved.current = false;
      setBusy(next);
    }} onChoose={(nextLabel, position) => {
      userMoved.current = false;
      choose(nextLabel, position);
    }} /> : null}
    {!compact ? <p className="addressMapHint">Move the map to place the pin at your address</p> : null}
  </>;
}

function MapSelection({ point, label, disabled, version, userMoved, busy, lastPublished, onChange, onBusyChange }: {
  point: DeliveryPoint | null;
  label: string;
  disabled: boolean;
  version: MutableRefObject<number>;
  userMoved: MutableRefObject<boolean>;
  busy: MutableRefObject<boolean>;
  lastPublished: MutableRefObject<DeliveryPoint | null>;
  onChange: (label: string, point: DeliveryPoint) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const map = useMap();
  const importLibrary = useContext(APIProviderContext)?.importLibrary;
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const latest = useRef({ disabled, point, onChange, onBusyChange, geocoder });
  latest.current = { disabled, point, onChange, onBusyChange, geocoder };

  useEffect(() => {
    if (!map || !importLibrary) return;
    let disposed = false;
    void importLibrary("geocoding").then((library) => {
      if (!disposed) setGeocoder(new (library as google.maps.GeocodingLibrary).Geocoder());
    }).catch(() => { /* The pin still works without reverse geocoding. */ });
    return () => { disposed = true; };
  }, [map, importLibrary]);

  useEffect(() => {
    if (!map || !point) return;
    // External changes (including geolocation) cancel older search/geocoding.
    // Our own coordinate echo must not cancel its pending address lookup.
    if (!samePoint(point, lastPublished.current)) {
      version.current += 1;
      latest.current.onBusyChange(false);
    }
    if (!samePoint(map.getCenter()?.toJSON(), point)) {
      userMoved.current = false;
      map.panTo(point);
    }
  }, [map, point?.lat, point?.lng, lastPublished, userMoved, version]);

  useEffect(() => {
    if (!geocoder || !point || disabled || busy.current || userMoved.current || label !== "Current delivery location") return;
    const position = point;
    const request = ++version.current;
    void geocoder.geocode({ location: position, region: "KE" }).then(({ results }) => {
      if (request !== version.current || latest.current.disabled || !results[0]?.formatted_address) return;
      latest.current.onChange(results[0].formatted_address, position);
    }).catch(() => { /* Geolocation remains usable without an address lookup. */ });
    return () => { if (version.current === request) version.current += 1; };
  }, [geocoder, point?.lat, point?.lng, disabled, label, version, busy, userMoved]);

  useEffect(() => {
    if (!map) return;
    const publish = (position: DeliveryPoint) => {
      if (latest.current.disabled || samePoint(position, latest.current.point)) return;
      const request = ++version.current;
      latest.current.onChange("Pinned delivery location", position);
      const service = latest.current.geocoder;
      if (!service) return;
      void service.geocode({ location: position, region: "KE" }).then(({ results }) => {
        if (request !== version.current || latest.current.disabled || !results[0]?.formatted_address) return;
        latest.current.onChange(results[0].formatted_address, position);
      }).catch(() => { /* Keep the exact pin if Google cannot resolve its address. */ });
    };
    const listener = map.addListener("idle", () => {
      if (!userMoved.current || latest.current.disabled) return;
      userMoved.current = false;
      const position = map.getCenter()?.toJSON();
      if (position) publish(position);
      latest.current.onBusyChange(false);
    });
    const clickListener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (latest.current.disabled || !event.latLng) return;
      userMoved.current = false;
      const position = event.latLng.toJSON();
      publish(position);
      latest.current.onBusyChange(false);
      map.panTo(position);
    });
    return () => { listener.remove(); clickListener.remove(); version.current += 1; };
  }, [map, userMoved, version]);
  return null;
}

function PlaceSearch({ point, disabled, version, onChoose, onBusyChange }: {
  point: DeliveryPoint | null;
  disabled: boolean;
  version: MutableRefObject<number>;
  onChoose: (label: string, point: DeliveryPoint) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const status = useApiLoadingStatus();
  const importLibrary = useContext(APIProviderContext)?.importLibrary;
  const host = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef({ point, disabled, onChoose, onBusyChange });
  latest.current = { point, disabled, onChoose, onBusyChange };

  useEffect(() => {
    if (status !== APILoadingStatus.LOADED || !importLibrary || !host.current) return;
    let disposed = false;
    let cleanup = () => {};
    let selectionTimer: number | undefined;
    let selectionRequest: number | null = null;
    const timer = window.setTimeout(() => { if (!disposed) setFailed(true); }, 12000);
    void importLibrary("places").then((library) => {
      if (disposed || !host.current) return;
      const places = library as google.maps.PlacesLibrary;
      const widget = new places.PlaceAutocompleteElement({ includedRegionCodes: ["ke"] });
      widget.setAttribute("aria-label", "Search for your delivery address");
      widget.setAttribute("placeholder", "Search address, building or landmark");
      widget.locationBias = { center: latest.current.point ?? KIKUYU, radius: 20000 };
      widgetRef.current = widget;
      const select = async (event: Event) => {
        const prediction = (event as google.maps.places.PlacePredictionSelectEvent).placePrediction;
        if (latest.current.disabled || !prediction) return;
        const request = ++version.current;
        selectionRequest = request;
        window.clearTimeout(selectionTimer);
        latest.current.onBusyChange(true);
        selectionTimer = window.setTimeout(() => {
          if (disposed || request !== version.current) return;
          version.current += 1;
          selectionRequest = null;
          setFailed(true);
          latest.current.onBusyChange(false);
        }, 12000);
        try {
          const place = prediction.toPlace();
          await place.fetchFields({ fields: ["formattedAddress", "displayName", "location"] });
          if (disposed || request !== version.current || latest.current.disabled) return;
          if (!place.location) { setFailed(true); return; }
          setFailed(false);
          latest.current.onChoose(place.formattedAddress || place.displayName || "Selected delivery location", place.location.toJSON());
        } catch { if (!disposed && request === version.current) setFailed(true); }
        finally {
          if (!disposed && request === version.current) {
            window.clearTimeout(selectionTimer);
            selectionRequest = null;
            latest.current.onBusyChange(false);
          }
        }
      };
      const error = () => {
        if (disposed) return;
        setFailed(true);
        if (selectionRequest === version.current) {
          version.current += 1;
          window.clearTimeout(selectionTimer);
          selectionRequest = null;
          latest.current.onBusyChange(false);
        }
      };
      // Invalidate a pending result when the user edits their next query, while
      // leaving the widget's own selection/value events and Enter handling alone.
      const input = (event: Event) => {
        if (!event.isTrusted) return;
        if (selectionRequest === version.current) latest.current.onBusyChange(false);
        version.current += 1;
        selectionRequest = null;
        window.clearTimeout(selectionTimer);
      };
      widget.addEventListener("gmp-select", select);
      widget.addEventListener("gmp-error", error);
      widget.addEventListener("input", input);
      host.current.appendChild(widget);
      setLoaded(true);
      setFailed(false);
      window.clearTimeout(timer);
      cleanup = () => {
        widget.removeEventListener("gmp-select", select);
        widget.removeEventListener("gmp-error", error);
        widget.removeEventListener("input", input);
        widget.remove();
        widgetRef.current = null;
      };
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      if (selectionRequest === version.current) latest.current.onBusyChange(false);
      version.current += 1;
      window.clearTimeout(timer);
      window.clearTimeout(selectionTimer);
      cleanup();
    };
  }, [status, importLibrary, version]);

  useEffect(() => {
    if (widgetRef.current) widgetRef.current.locationBias = { center: point ?? KIKUYU, radius: 20000 };
  }, [point?.lat, point?.lng]);

  return <div className="addressMapSearch" inert={disabled}>
    <div ref={host} className="addressMapSearchHost" />
    {!loaded && !failed ? <span role="status">Loading address search…</span> : null}
    {failed ? <p className="addressMapSearchError" role="status">Address search is unavailable. Move the map to choose your location.</p> : null}
  </div>;
}
