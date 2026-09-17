"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Building2, Check, ChevronRight, Home, LocateFixed, MapPin, Monitor, Pencil, Plus, X } from "lucide-react";
import { parseDeliveryAddress, type DeliveryPoint } from "@online-saler/business-rules";
import { addressStorageKey, addressSummary, emptyDeliveryAddress, parseSavedAddresses, serializeDeliveryAddress, toSavedDeliveryAddress, upsertSavedAddress, validateSavedAddress, type PlaceType, type SavedDeliveryAddress } from "./saved-delivery-addresses";
import "./delivery-address-picker.css";

const AddressLocationMap = dynamic(() => import("./address-location-map"), { ssr: false });
type Props = { apiKey: string; draftKey: string; value: string; onChange: (value: string) => void; disabled: boolean };
type Step = "closed" | "list" | "map" | "type" | "details" | "entrance";
const placeTypes = [{ value: "house", label: "House", icon: Home }, { value: "apartment", label: "Apartment", icon: Building2 }, { value: "office", label: "Office", icon: Monitor }, { value: "other", label: "Other", icon: MapPin }] as const;

export default function DeliveryAddressPicker({ apiKey, draftKey, value, onChange, disabled }: Props) {
  const [step, setStep] = useState<Step>("closed");
  const [draft, setDraft] = useState<SavedDeliveryAddress>(emptyDeliveryAddress);
  const [addresses, setAddresses] = useState<SavedDeliveryAddress[]>([]);
  const [mapsError, setMapsError] = useState(false);
  const [manual, setManual] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [customLabel, setCustomLabel] = useState(false);
  const [returnFromMap, setReturnFromMap] = useState<"type" | "details">("type");
  const [entrancePoint, setEntrancePoint] = useState<DeliveryPoint | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestVersion = useRef(0);
  const previousLocation = useRef<{ address: string; point: DeliveryPoint | null } | null>(null);
  const headingId = useId();
  const open = step !== "closed";
  const hasMap = Boolean(apiKey) && !mapsError && !manual;
  const selected = addresses.find((address) => serializeDeliveryAddress(address) === value);
  const current = selected ?? toSavedDeliveryAddress(value);

  useEffect(() => {
    try { setAddresses(parseSavedAddresses(window.localStorage.getItem(addressStorageKey(draftKey)))); }
    catch { setAddresses([]); }
  }, [draftKey]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      requestVersion.current += 1;
      dialog?.close();
      document.body.style.overflow = overflow;
      focused?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (disabled) { requestVersion.current += 1; setLocationBusy(false); setStep("closed"); }
  }, [disabled]);

  function go(next: Step) {
    requestVersion.current += 1;
    setLocationBusy(false);
    setMapBusy(false);
    setMessage("");
    setStep(next);
  }

  function begin(address?: SavedDeliveryAddress) {
    const next = address ? { ...address } : emptyDeliveryAddress();
    setDraft(next);
    setCustomLabel(Boolean(next.label && !["Home", "Flat", "Work"].includes(next.label)));
    setManual(false);
    setReturnFromMap("type");
    go(address ? "details" : "map");
  }

  const choosePoint = useCallback((address: string, point: DeliveryPoint) => {
    requestVersion.current += 1;
    setLocationBusy(false);
    setDraft((previous) => ({ ...previous, address, point }));
    setMessage("");
  }, []);
  const failMap = useCallback(() => { setMapsError(true); setMapBusy(false); }, []);

  function locate(fromList = false) {
    if (fromList) begin();
    if (!navigator.geolocation) { setMessage("Location is unavailable. Search or enter your address."); return; }
    const version = ++requestVersion.current;
    setLocationBusy(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (version !== requestVersion.current) return;
      choosePoint("Current delivery location", { lat: coords.latitude, lng: coords.longitude });
    }, () => {
      if (version !== requestVersion.current) return;
      setLocationBusy(false);
      setMessage("Could not get your location. You can search or enter your address instead.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    const error = validateSavedAddress(draft);
    if (error) { setMessage(error); return; }
    const next = upsertSavedAddress(addresses, draft);
    const saved = next[0];
    if (!saved) return;
    try {
      window.localStorage.setItem(addressStorageKey(draftKey), JSON.stringify(next));
      setNotice("");
    } catch {
      setNotice("Address selected for this order. Your browser could not save it for next time.");
    }
    setAddresses(next);
    onChange(serializeDeliveryAddress(saved));
    go("closed");
  }

  function setField(field: keyof SavedDeliveryAddress, text: string) {
    setDraft((previous) => ({ ...previous, [field]: text }));
    setMessage("");
  }

  function selectType(placeType: PlaceType) {
    setDraft((previous) => ({ ...previous, placeType, floor: placeType === "house" || placeType === "other" ? "" : previous.floor, label: previous.label || ({ house: "Home", apartment: "Flat", office: "Work", other: "" }[placeType]) }));
    go("details");
  }

  function back() {
    if (step === "details") { setReturnFromMap("type"); go("type"); }
    else if (step === "type") { setReturnFromMap("type"); go("map"); }
    else if (step === "entrance") go("details");
    else if (returnFromMap === "details") {
      const previous = previousLocation.current;
      if (previous) setDraft((current) => ({ ...current, ...previous }));
      go("details");
    } else go("list");
  }

  const Icon = placeTypes.find((type) => type.value === draft.placeType)?.icon ?? MapPin;
  const title = step === "list" ? "Choose a delivery address" : step === "type" ? "What kind of place is this?" : step === "details" ? "Address details" : step === "entrance" ? "Mark your entrance" : "Choose your location";

  return <div className="deliveryAddressPicker">
    <span className="addressFieldCaption">Delivery address</span>
    <button type="button" className="addressCheckoutCard" disabled={disabled} onClick={() => go("list")}>
      <MapPin size={24} />
      <span>{value ? <><strong>{selected?.label || current.address.split("\n")[0]}</strong><small>{selected ? [selected.address, addressSummary(selected)].filter(Boolean).join(" · ") : parseDeliveryAddress(value).address}</small></> : <><strong>Add a delivery address</strong><small>Choose a location and add your door details</small></>}</span>
      <ChevronRight size={20} />
    </button>
    {notice ? <p className="addressNotice" role="status">{notice}</p> : null}
    {open ? createPortal(<dialog ref={dialogRef} className={`addressDialog addressStep-${step}`} aria-labelledby={headingId} onCancel={(event) => { event.preventDefault(); go("closed"); }} onClick={(event) => { if (event.target === event.currentTarget) go("closed"); }}>
      <div className="addressPanel">
        <header className="addressHeader">
          {step !== "list" ? <button type="button" className="addressIconButton" aria-label="Back" onClick={back}><ArrowLeft size={22} /></button> : null}
          <h2 id={headingId}>{title}</h2>
          <button type="button" className="addressIconButton" aria-label="Close address picker" onClick={() => go("closed")}><X size={22} /></button>
        </header>

        {step === "list" ? <>
          <div className="addressList">
            <button type="button" className="addressListSelect addressCurrentLocation" onClick={() => locate(true)}><LocateFixed size={24} /><span><strong>Use my current location</strong><small>Add building and door details next</small></span><ChevronRight size={20} /></button>
            {value && !selected ? <div className="addressListRow"><button type="button" className="addressListSelect" onClick={() => go("closed")}><MapPin size={24} /><span><strong>{current.address.split("\n")[0]}</strong><small>Current checkout address</small></span><Check size={18} /></button><button type="button" className="addressIconButton" aria-label="Edit current address" onClick={() => begin(current)}><Pencil size={20} /></button></div> : null}
            {addresses.map((address) => {
              const PlaceIcon = placeTypes.find((type) => type.value === address.placeType)?.icon ?? MapPin;
              return <div className="addressListRow" key={address.id}>
                <button type="button" className="addressListSelect" onClick={() => { onChange(serializeDeliveryAddress(address)); go("closed"); }}><PlaceIcon size={24} /><span><strong>{address.address}</strong><small>{[address.label, addressSummary(address)].filter(Boolean).join(" · ")}</small></span>{address.id === selected?.id ? <Check size={18} /> : null}</button>
                <button type="button" className="addressIconButton" aria-label={`Edit ${address.label || address.address}`} onClick={() => begin(address)}><Pencil size={20} /></button>
              </div>;
            })}
            {!addresses.length && !value ? <div className="addressEmpty"><MapPin size={36} /><h3>Where should we deliver?</h3><p>Save your address to make your next checkout quicker.</p></div> : null}
            {addresses.length ? <p className="addressDeviceHint">Saved for your account on this device</p> : null}
          </div>
          <footer className="addressFooter"><button type="button" className="addressPrimary addressSecondary" onClick={() => begin()}><Plus size={20} />Add a new address</button></footer>
        </> : null}

        {step === "map" || step === "entrance" ? <>
          <div className="addressMapStage">
            {hasMap ? <AddressLocationMap apiKey={apiKey} point={step === "entrance" ? entrancePoint : draft.point} label={draft.address} onChange={step === "entrance" ? (_address, point) => setEntrancePoint(point) : choosePoint} onError={failMap} compact={step === "entrance"} disabled={locationBusy} onBusyChange={setMapBusy} /> : <div className="addressManualLocation"><MapPin size={40} /><h3>Enter your delivery location</h3><p>{mapsError ? "The map could not load. You can still enter your address below." : "Enter a street, estate or nearby landmark."}</p></div>}
            {step === "map" ? <button type="button" className="addressLocateButton" onClick={() => locate()} disabled={locationBusy}><LocateFixed size={20} />{locationBusy ? "Finding location…" : "Use my location"}</button> : null}
          </div>
          <footer className="addressFooter addressLocationFooter">
            {step === "map" ? <>
              {hasMap ? <><strong className="addressLocationLabel">{draft.address || "Move the map to your delivery point"}</strong><p className="addressMuted">Search above or move the map to place the pin.</p><button type="button" className="addressTextButton" onClick={() => { setManual(true); setMapBusy(false); setDraft((previous) => ({ ...previous, point: null })); }}>Enter address manually</button></> : <label className="addressInput"><span>Street, estate or landmark</span><input autoComplete="street-address" maxLength={500} value={draft.address} placeholder="e.g. Kikuyu Road, near the market" onChange={(event) => { requestVersion.current += 1; setLocationBusy(false); setDraft((previous) => ({ ...previous, address: event.target.value, point: null })); }} /></label>}
              {message ? <p role="alert" className="addressError">{message}</p> : null}
              <button type="button" className="addressPrimary" disabled={locationBusy || (hasMap && mapBusy) || (hasMap ? !draft.point : !draft.address.trim())} onClick={() => go(returnFromMap)}>Use this location<ChevronRight size={20} /></button>
            </> : <><p className="addressMuted">Move the pin to the entrance your courier should use.</p><button type="button" className="addressPrimary" disabled={!entrancePoint || !hasMap || mapBusy} onClick={() => { setDraft((previous) => ({ ...previous, point: entrancePoint })); go("details"); }}>Confirm entrance</button></>}
          </footer>
        </> : null}

        {step === "type" ? <>
          <div className="addressTypeLocation">{hasMap && draft.point ? <AddressLocationMap apiKey={apiKey} point={draft.point} label={draft.address} onChange={choosePoint} onError={failMap} compact disabled /> : <MapPin size={40} />}<div className="addressMapCallout"><MapPin size={22} /><span><strong>{draft.address}</strong><small>We'll deliver here</small></span></div></div>
          <div className="addressTypeSheet"><h3>What kind of place is this?</h3><div className="addressTypeGrid">{placeTypes.map(({ value: placeType, label, icon: PlaceIcon }) => <button type="button" key={placeType} onClick={() => selectType(placeType)}><PlaceIcon size={26} /><strong>{label}</strong></button>)}</div></div>
        </> : null}

        {step === "details" ? <form className="addressDetailsForm" onSubmit={save}>
          <div className="addressDetailsScroll">
            <button type="button" className="addressSelectedLocation" onClick={() => { previousLocation.current = { address: draft.address, point: draft.point }; setManual(false); setReturnFromMap("details"); go("map"); }}><Icon size={24} /><span><strong>{draft.address}</strong><small>Change location</small></span><Pencil size={18} /></button>
            <label className="addressInput"><span>{draft.placeType === "office" ? "Company / building name" : draft.placeType === "house" ? "House / estate name" : draft.placeType === "other" ? "Place name" : "Building name"}{draft.placeType === "office" ? " *" : ""}</span><input autoComplete="address-line2" maxLength={120} required={draft.placeType === "office"} value={draft.building} placeholder={draft.placeType === "office" ? "Company or building" : "Name"} onChange={(event) => setField("building", event.target.value)} /></label>
            <div className="addressInputRow">
              {draft.placeType === "apartment" || draft.placeType === "office" ? <label className="addressInput"><span>Floor number{draft.placeType === "apartment" ? " *" : ""}</span><input maxLength={40} required={draft.placeType === "apartment"} value={draft.floor} placeholder="e.g. Ground, 3" onChange={(event) => setField("floor", event.target.value)} /></label> : null}
              <label className="addressInput"><span>{draft.placeType === "house" ? "House / door number" : "Door / room number"}{draft.placeType === "apartment" ? " *" : ""}</span><input maxLength={40} required={draft.placeType === "apartment"} value={draft.door} placeholder="e.g. C07" onChange={(event) => setField("door", event.target.value)} /></label>
            </div>
            <label className="addressInput"><span>Additional information</span><textarea maxLength={400} rows={2} value={draft.directions} placeholder="Gate colour, nearby shop or directions for the courier" onChange={(event) => setField("directions", event.target.value)} /></label>
            {hasMap && draft.point ? <div className="addressEntrance"><h3>Mark your entrance</h3><p>Help the courier reach you faster</p><div className="addressEntrancePreview"><AddressLocationMap apiKey={apiKey} point={draft.point} label={draft.address} onChange={() => {}} onError={failMap} compact disabled /><button type="button" aria-label="Adjust entrance on map" onClick={() => { setEntrancePoint(draft.point); go("entrance"); }}><span>Adjust entrance <Pencil size={16} /></span></button></div></div> : null}
            <div className="addressLabels"><h3>Add a label</h3><p>Find this address easily next time</p><div className="addressLabelChoices">{["Home", "Flat", "Work"].map((label) => <button key={label} type="button" aria-pressed={!customLabel && draft.label === label} onClick={() => { setCustomLabel(false); setField("label", label); }}>{label}</button>)}<button type="button" aria-pressed={customLabel} onClick={() => { if (!customLabel) setField("label", ""); setCustomLabel(true); }}>Custom</button></div>{customLabel ? <label className="addressInput"><span>Custom label</span><input maxLength={80} required value={draft.label} placeholder="e.g. Mum's house" onChange={(event) => setField("label", event.target.value)} /></label> : null}</div>
          </div>
          <footer className="addressFooter">{message ? <p role="alert" className="addressError">{message}</p> : null}<button type="submit" className="addressPrimary">Save address</button></footer>
        </form> : null}
      </div>
    </dialog>, document.body) : null}
  </div>;
}
