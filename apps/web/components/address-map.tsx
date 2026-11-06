"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";
type Position = { lat: number; lng: number; accuracy?: number };
let mapsPromise: Promise<void> | undefined;
function loadMaps() {
  if (!mapsPromise)
    mapsPromise = new Promise((resolve, reject) => {
      if (window.google?.maps) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "")}&v=weekly&loading=async&libraries=places,marker&language=vi&region=VN`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () =>
        reject(
          new Error(
            "Không tải được Google Maps. Bạn vẫn có thể nhập địa chỉ thủ công.",
          ),
        );
      (window as any).gm_authFailure = () =>
        reject(new Error("Khóa bản đồ chưa hợp lệ hoặc vượt hạn mức."));
      document.head.appendChild(s);
      setTimeout(() => {
        if (!window.google?.maps)
          reject(
            new Error("Bản đồ chưa phản hồi. Vui lòng nhập địa chỉ thủ công."),
          );
      }, 12000);
    });
  return mapsPromise;
}
export default function AddressMap({
  position,
  onPosition,
  onAddress,
}: {
  position?: Position;
  onPosition: (p: Position) => void;
  onAddress: (text: string) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [error, setError] = useState(""),
    [locating, setLocating] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null),
    searchEl = useRef<HTMLDivElement>(null),
    map = useRef<google.maps.Map | null>(null),
    marker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const callbacks = useRef({ onPosition, onAddress });
  callbacks.current = { onPosition, onAddress };
  async function reverse(lat: number, lng: number) {
    try {
      const r = await new google.maps.Geocoder().geocode({
        location: { lat, lng },
        language: "vi",
      });
      if (r.results[0])
        callbacks.current.onAddress(r.results[0].formatted_address);
      else
        setError(
          "Không tìm được địa chỉ tại ghim này. Vui lòng nhập thủ công.",
        );
    } catch {
      setError("Chưa đọc được địa chỉ từ bản đồ. Bạn có thể tự nhập.");
    }
  }
  useEffect(() => {
    if (!enabled || !key) return;
    let disposed = false;
    loadMaps()
      .then(async () => {
        await google.maps.importLibrary("maps");
        await google.maps.importLibrary("places");
        await google.maps.importLibrary("marker");
        if (disposed || !mapEl.current) return;
        const center = position || { lat: 10.7769, lng: 106.7009 };
        map.current = new google.maps.Map(mapEl.current, {
          center,
          zoom: position ? 17 : 12,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID || "DEMO_MAP_ID",
          streetViewControl: false,
          mapTypeControl: false,
        });
        marker.current = new google.maps.marker.AdvancedMarkerElement({
          map: map.current,
          position: center,
          gmpDraggable: true,
          title: "Kéo ghim đến địa chỉ nhận hàng",
        });
        marker.current.addListener(
          "dragend",
          (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            callbacks.current.onPosition(p);
            reverse(p.lat, p.lng);
          },
        );
        map.current.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          marker.current!.position = p;
          callbacks.current.onPosition(p);
          reverse(p.lat, p.lng);
        });
        const places = google.maps.places as any;
        const input = new places.PlaceAutocompleteElement({
          includedRegionCodes: ["vn"],
        });
        if (searchEl.current) {
          searchEl.current.replaceChildren(input);
        }
        input.addEventListener("gmp-select", async (e: any) => {
          try {
            const place = e.placePrediction.toPlace();
            await place.fetchFields({
              fields: ["formattedAddress", "location"],
            });
            if (place.location) {
              const p = {
                lat: place.location.lat(),
                lng: place.location.lng(),
              };
              map.current?.setCenter(p);
              map.current?.setZoom(17);
              marker.current!.position = p;
              callbacks.current.onPosition(p);
              callbacks.current.onAddress(place.formattedAddress || "");
            }
          } catch {
            setError("Không lấy được gợi ý địa chỉ. Vui lòng nhập thủ công.");
          }
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      disposed = true;
    };
  }, [enabled, key]);
  useEffect(() => {
    if (position && map.current) {
      map.current.setCenter(position);
      if (marker.current) marker.current.position = position;
    }
  }, [position?.lat, position?.lng]);
  function locate() {
    if (!navigator.geolocation) {
      setError(
        "Trình duyệt không hỗ trợ định vị. Vui lòng nhập địa chỉ thủ công.",
      );
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const point = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        };
        onPosition(point);
        setLocating(false);
        if (key) {
          setEnabled(true);
          if (window.google?.maps) reverse(point.lat, point.lng);
        }
      },
      (e) => {
        setLocating(false);
        setError(
          e.code === 1
            ? "Bạn đã từ chối định vị. Hãy nhập địa chỉ thủ công."
            : "Không xác định được vị trí. Hãy thử lại hoặc nhập địa chỉ thủ công.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  return (
    <div className="address-map">
      <p className="small muted">
        <MapPin size={15} /> Vị trí là tùy chọn, chỉ dùng hỗ trợ giao hàng. Luôn
        kiểm tra số nhà và địa chỉ cuối cùng.
      </p>
      <div className="row">
        <button
          type="button"
          className="button secondary small-button"
          onClick={locate}
          disabled={locating}
        >
          <LocateFixed size={15} />
          {locating ? "Đang định vị…" : "Dùng vị trí hiện tại"}
        </button>
        {key && !enabled && (
          <button
            type="button"
            className="text-link small"
            onClick={() => setEnabled(true)}
          >
            Mở Google Maps
          </button>
        )}
      </div>
      {!key && (
        <p className="small muted">
          Bản đồ chưa được cấu hình. Bạn vẫn có thể nhập địa chỉ và đặt hàng.
        </p>
      )}
      {position && (
        <p className="small">
          Vị trí: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          {position.accuracy
            ? ` · độ chính xác khoảng ${Math.round(position.accuracy)}m`
            : ""}
          . GPS không bảo đảm chính xác tuyệt đối.
        </p>
      )}
      {enabled && key && (
        <>
          <div ref={searchEl} />
          <div
            ref={mapEl}
            className="map-canvas"
            role="region"
            aria-label="Bản đồ chọn địa chỉ"
          />
          <small>
            Kéo ghim hoặc bấm bản đồ, sau đó xác nhận địa chỉ bằng văn bản.
          </small>
        </>
      )}
      {error && (
        <p className="field-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
