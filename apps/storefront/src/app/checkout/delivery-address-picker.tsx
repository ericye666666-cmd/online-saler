"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapPin, LocateFixed } from "lucide-react";
import { deliveryMapUrl, formatDeliveryAddress, parseDeliveryAddress, type DeliveryPoint } from "@online-saler/business-rules";

const KIKUYU = { lat: -1.246, lng: 36.663 };
type Props = { apiKey: string; value: string; onChange: (value: string) => void; disabled: boolean };

export default function DeliveryAddressPicker({ apiKey, value, onChange, disabled }: Props) {
  const [opened, setOpened] = useState(false);
  const [mapsError, setMapsError] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestVersion = useRef(0);
  const { address, point } = parseDeliveryAddress(value);
  useEffect(() => () => { requestVersion.current += 1; }, []);
  useEffect(() => { if (disabled) { requestVersion.current += 1; setLocationBusy(false); } }, [disabled]);
  const choose = useCallback((label: string, position: DeliveryPoint) => {
    requestVersion.current += 1;
    setLocationBusy(false);
    onChange(formatDeliveryAddress(label, position));
    setMessage("");
  }, [onChange]);

  function locate() {
    if (!navigator.geolocation) { setMessage("Location is unavailable. Please type your address."); return; }
    const version = ++requestVersion.current;
    setLocationBusy(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (version !== requestVersion.current) return;
      choose("Current delivery location", { lat: coords.latitude, lng: coords.longitude });
      if (apiKey) setOpened(true);
    }, () => {
      if (version !== requestVersion.current) return;
      setLocationBusy(false);
      setMessage("Could not get your location. Search the map or type your address below.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  return <div className="deliveryAddressBox">
    <div className="deliveryLocationActions">
      {apiKey && !mapsError ? <button type="button" disabled={disabled} onClick={() => setOpened(!opened)}>
        <MapPin size={17} />{opened ? "Hide map" : "Choose on Google Maps"}
      </button> : null}
      <button type="button" disabled={disabled || locationBusy} onClick={locate}>
        <LocateFixed size={17} />{locationBusy ? "Finding location…" : "Use my current location"}
      </button>
    </div>
    {opened && apiKey && !mapsError ? <APIProvider apiKey={apiKey} region="KE" language="en" onError={() => setMapsError(true)}>
      <LocationMap point={point} disabled={disabled} onChoose={choose} />
    </APIProvider> : null}
    <label className="checkoutField">
      <span>Delivery address or landmark</span>
      <input name="deliveryAddress" autoComplete="street-address" required maxLength={1500}
        placeholder="Estate, road, building or nearby landmark in Kikuyu" value={address} disabled={disabled}
        onChange={(event) => {
          requestVersion.current += 1;
          setLocationBusy(false);
          onChange(event.target.value);
        }} />
    </label>
    {point ? <div className="deliveryPlacePreview">
      <a href={deliveryMapUrl(point)} target="_blank" rel="noopener noreferrer">View selected delivery pin ↗</a>
      <span>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</span>
      <button type="button" disabled={disabled} onClick={() => onChange(address)}>Remove pin</button>
    </div> : null}
    {message || mapsError ? <p role="status">{message || "The map is unavailable. You can still type your address or use your current location."}</p> : null}
    <p className="deliveryMapHint">Free Kikuyu delivery. Add your building, house number and directions in the delivery note below. Customer service will confirm delivery arrangements.</p>
  </div>;
}

function LocationMap({ point, disabled, onChoose }: {
  point: DeliveryPoint | null; disabled: boolean; onChoose: (label: string, point: DeliveryPoint) => void;
}) {
  return <div className="deliveryLocationMap">
    <PlaceSearch disabled={disabled} onChoose={onChoose} />
    <Map defaultCenter={point ?? KIKUYU} defaultZoom={15} mapId="DEMO_MAP_ID"
      style={{ width: "100%", height: 280 }} gestureHandling="cooperative" disableDefaultUI
      zoomControl onClick={(event) => {
        if (!disabled && event.detail.latLng) onChoose("Pinned delivery location", event.detail.latLng);
      }}>
      {point ? <AdvancedMarker position={point} draggable={!disabled} onDragEnd={(event) => {
        if (!disabled && event.latLng) onChoose("Pinned delivery location", event.latLng.toJSON());
      }} /> : null}
      <PanToPoint point={point} />
    </Map>
    <p className="deliveryMapHint">Search above, tap the map or drag the pin to your delivery location.</p>
  </div>;
}

function PanToPoint({ point }: { point: DeliveryPoint | null }) {
  const map = useMap();
  useEffect(() => { if (map && point) map.panTo(point); }, [map, point?.lat, point?.lng]);
  return null;
}

function PlaceSearch({ disabled, onChoose }: { disabled: boolean; onChoose: (label: string, point: DeliveryPoint) => void }) {
  const places = useMapsLibrary("places");
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ disabled, onChoose });
  latest.current = { disabled, onChoose };
  useEffect(() => {
    if (!places || !container.current) return;
    let disposed = false;
    let version = 0;
    // Places (New), rather than the legacy Autocomplete restricted for new customers.
    const widget = new places.PlaceAutocompleteElement({ includedRegionCodes: ["ke"] });
    widget.setAttribute("aria-label", "Search for your delivery address on Google Maps");
    const select = async (event: Event) => {
      const current = ++version;
      const prediction = (event as Event & { placePrediction?: {
        toPlace: () => { fetchFields: (options: { fields: string[] }) => Promise<unknown>;
          formattedAddress?: string; displayName?: string; location?: { toJSON: () => DeliveryPoint } };
      } }).placePrediction;
      if (latest.current.disabled || !prediction) return;
      try {
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ["formattedAddress", "displayName", "location"] });
        if (!disposed && current === version && !latest.current.disabled && place.location) {
          latest.current.onChoose(place.formattedAddress || place.displayName || "Selected delivery location", place.location.toJSON());
        }
      } catch { if (!disposed) setFailed(true); }
    };
    const error = () => setFailed(true);
    const preventSubmit = (event: KeyboardEvent) => { if (event.key === "Enter") event.preventDefault(); };
    widget.addEventListener("gmp-select", select);
    widget.addEventListener("gmp-error", error);
    widget.addEventListener("keydown", preventSubmit);
    container.current.appendChild(widget);
    return () => {
      disposed = true;
      widget.removeEventListener("gmp-select", select);
      widget.removeEventListener("gmp-error", error);
      widget.removeEventListener("keydown", preventSubmit);
      widget.remove();
    };
  }, [places]);
  return <fieldset disabled={disabled} className="deliveryPlaceSearch">
    <div ref={container} />
    {failed ? <p role="status">Address search is unavailable. Tap the map or enter your address below.</p> : null}
  </fieldset>;
}
