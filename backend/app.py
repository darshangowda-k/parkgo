from __future__ import annotations

import hashlib
import json
import math
import mimetypes
import sys
import uuid
from copy import deepcopy
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"
DB_PATH = ROOT / "database.db"

HOST = "127.0.0.1"
PORT = 8000

VEHICLE_TYPES = [
    {"id": "bike", "label": "Bike"},
    {"id": "car", "label": "Car"},
    {"id": "suv", "label": "SUV"},
    {"id": "van", "label": "Van"},
]

OWNERSHIP_OPTIONS = [
    {"id": "own_vehicle", "label": "Own vehicle"},
    {"id": "no_parking", "label": "Parked in no-parking zone"},
]

TOW_RATE_PER_KM = {
    "bike": 8.0,
    "car": 15.0,
    "suv": 18.0,
    "van": 22.0,
}

KNOWN_LOCATIONS = [
    {"label": "Phoenix Marketcity, Bengaluru", "city": "Bengaluru", "lat": 12.995, "lng": 77.697},
    {"label": "Brigade Road, Bengaluru", "city": "Bengaluru", "lat": 12.976, "lng": 77.606},
    {"label": "Electronic City, Bengaluru", "city": "Bengaluru", "lat": 12.845, "lng": 77.660},
    {"label": "Marina Beach, Chennai", "city": "Chennai", "lat": 13.049, "lng": 80.282},
    {"label": "T. Nagar, Chennai", "city": "Chennai", "lat": 13.041, "lng": 80.233},
    {"label": "Gachibowli, Hyderabad", "city": "Hyderabad", "lat": 17.440, "lng": 78.348},
    {"label": "Hitech City, Hyderabad", "city": "Hyderabad", "lat": 17.444, "lng": 78.376},
    {"label": "Connaught Place, Delhi", "city": "Delhi", "lat": 28.631, "lng": 77.216},
    {"label": "Jio World Drive, Mumbai", "city": "Mumbai", "lat": 19.069, "lng": 72.869},
    {"label": "Pune Station, Pune", "city": "Pune", "lat": 18.528, "lng": 73.876},
    {"label": "Salt Lake Sector V, Kolkata", "city": "Kolkata", "lat": 22.568, "lng": 88.432},
    {"label": "Civic Center, Ahmedabad", "city": "Ahmedabad", "lat": 23.022, "lng": 72.571},
]


def normalize(text: str) -> str:
    return "".join(ch for ch in text.lower() if ch.isalnum())


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def today_iso() -> str:
    return datetime.now().date().isoformat()


def connect_unused() -> None:
    """Kept as a placeholder for the old SQLite implementation."""
    return None


def geocode_location(text: str | None) -> dict:
    value = (text or "").strip()
    if not value:
        return KNOWN_LOCATIONS[0]

    needle = normalize(value)
    for loc in KNOWN_LOCATIONS:
        key = normalize(loc["label"])
        city = normalize(loc["city"])
        if needle == key or needle == city or needle in key or key in needle:
            return loc

    digest = hashlib.sha1(needle.encode("utf-8")).digest()
    base = KNOWN_LOCATIONS[digest[0] % len(KNOWN_LOCATIONS)]
    lat_offset = ((digest[1] / 255.0) - 0.5) * 0.09
    lng_offset = ((digest[2] / 255.0) - 0.5) * 0.09
    return {
        "label": value,
        "city": base["city"],
        "lat": round(base["lat"] + lat_offset, 6),
        "lng": round(base["lng"] + lng_offset, 6),
    }


def haversine(a: dict, b: dict) -> float:
    radius_km = 6371.0
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    d_lat = math.radians(b["lat"] - a["lat"])
    d_lng = math.radians(b["lng"] - a["lng"])

    sin_lat = math.sin(d_lat / 2) ** 2
    sin_lng = math.sin(d_lng / 2) ** 2
    arc = sin_lat + math.cos(lat1) * math.cos(lat2) * sin_lng
    return radius_km * (2 * math.atan2(math.sqrt(arc), math.sqrt(1 - arc)))


def default_database() -> dict:
    return {
        "parking_providers": [
            {
                "id": 1,
                "name": "Metro Mall Parking",
                "area": "Phoenix Tower, Koramangala",
                "city": "Bengaluru",
                "latitude": 12.935,
                "longitude": 77.624,
                "hourly_rate": 35.0,
                "total_spaces": 180,
                "empty_spaces": 41,
                "ai_detected_empty_spaces": 46,
                "supported_vehicle_types": ["bike", "car"],
                "amenities": ["CCTV", "EV charging", "24x7 security"],
                "phone": "+91 80010 10001",
                "operating_hours": "Open 24x7",
            },
            {
                "id": 2,
                "name": "Civic Plaza Garage",
                "area": "Brigade Arcade, MG Road",
                "city": "Bengaluru",
                "latitude": 12.974,
                "longitude": 77.606,
                "hourly_rate": 42.0,
                "total_spaces": 220,
                "empty_spaces": 60,
                "ai_detected_empty_spaces": 65,
                "supported_vehicle_types": ["bike", "car", "suv"],
                "amenities": ["Lift access", "Valet", "Disabled parking"],
                "phone": "+91 80010 10002",
                "operating_hours": "6:00 AM - 11:00 PM",
            },
            {
                "id": 3,
                "name": "Skyline Public Lot",
                "area": "Jio World Drive, BKC",
                "city": "Mumbai",
                "latitude": 19.069,
                "longitude": 72.869,
                "hourly_rate": 55.0,
                "total_spaces": 310,
                "empty_spaces": 88,
                "ai_detected_empty_spaces": 92,
                "supported_vehicle_types": ["bike", "car", "suv", "van"],
                "amenities": ["EV charging", "Fast exit lane", "Smart sensors"],
                "phone": "+91 80010 10003",
                "operating_hours": "Open 24x7",
            },
            {
                "id": 4,
                "name": "Lakeside Supermart Parking",
                "area": "Hitech City Forum",
                "city": "Hyderabad",
                "latitude": 17.444,
                "longitude": 78.376,
                "hourly_rate": 28.0,
                "total_spaces": 150,
                "empty_spaces": 32,
                "ai_detected_empty_spaces": 35,
                "supported_vehicle_types": ["bike", "car"],
                "amenities": ["CCTV", "Cover parking", "Night patrol"],
                "phone": "+91 80010 10004",
                "operating_hours": "7:00 AM - 11:30 PM",
            },
            {
                "id": 5,
                "name": "SmartPark Arena",
                "area": "Pune Station Plaza",
                "city": "Pune",
                "latitude": 18.528,
                "longitude": 73.876,
                "hourly_rate": 25.0,
                "total_spaces": 210,
                "empty_spaces": 77,
                "ai_detected_empty_spaces": 80,
                "supported_vehicle_types": ["bike", "car", "suv"],
                "amenities": ["Fast entry", "Ticketless exit", "Family zones"],
                "phone": "+91 80010 10005",
                "operating_hours": "Open 24x7",
            },
            {
                "id": 6,
                "name": "City Center Basement",
                "area": "Connaught Circle",
                "city": "Delhi",
                "latitude": 28.631,
                "longitude": 77.216,
                "hourly_rate": 48.0,
                "total_spaces": 260,
                "empty_spaces": 92,
                "ai_detected_empty_spaces": 97,
                "supported_vehicle_types": ["bike", "car", "suv"],
                "amenities": ["EV charging", "On-site help desk", "Basement access"],
                "phone": "+91 80010 10006",
                "operating_hours": "5:30 AM - 12:00 AM",
            },
        ],
        "parking_bookings": [
            {
                "bookingCode": "PG-DEMO-001",
                "providerId": 1,
                "customerName": "Demo Driver",
                "location": "Koramangala, Bengaluru",
                "vehicleType": "car",
                "hours": 3,
                "amount": 105.0,
                "paymentMethod": "UPI",
                "qrPayload": "PARK.GO|PG-DEMO-001|Metro Mall Parking",
                "status": "paid",
                "createdAt": now_iso(),
            },
            {
                "bookingCode": "PG-DEMO-002",
                "providerId": 2,
                "customerName": "City Explorer",
                "location": "MG Road, Bengaluru",
                "vehicleType": "bike",
                "hours": 2,
                "amount": 84.0,
                "paymentMethod": "Card",
                "qrPayload": "PARK.GO|PG-DEMO-002|Civic Plaza Garage",
                "status": "paid",
                "createdAt": now_iso(),
            },
        ],
        "towing_requests": [
            {
                "requestCode": "TW-DEMO-001",
                "customerName": "Asha Kumar",
                "vehicleNumber": "KA01AB1234",
                "ownershipStatus": "own_vehicle",
                "complaintType": "regular_tow",
                "pickupLocation": "Brigade Road, Bengaluru",
                "dropLocation": "Civic Plaza Garage, Bengaluru",
                "contact": "+91 98765 43210",
                "vehicleType": "car",
                "distanceKm": 6.2,
                "ratePerKm": TOW_RATE_PER_KM["car"],
                "amount": round(6.2 * TOW_RATE_PER_KM["car"], 2),
                "paymentRequired": 1,
                "status": "paid",
                "etaMinutes": 47,
                "createdAt": now_iso(),
            },
            {
                "requestCode": "TW-DEMO-002",
                "customerName": "Ravi Mehta",
                "vehicleNumber": "MH12CD4455",
                "ownershipStatus": "no_parking",
                "complaintType": "complaint_only",
                "pickupLocation": "Jio World Drive, Mumbai",
                "dropLocation": "Jio World Drive, Mumbai",
                "contact": "+91 99887 77665",
                "vehicleType": "bike",
                "distanceKm": 0.0,
                "ratePerKm": TOW_RATE_PER_KM["bike"],
                "amount": 0.0,
                "paymentRequired": 0,
                "status": "complaint_confirmed",
                "etaMinutes": 20,
                "createdAt": now_iso(),
            },
        ],
    }


def ensure_database_shape(data: dict) -> dict:
    base = default_database()
    if not isinstance(data, dict):
        return base
    for key, value in base.items():
        if key not in data or not isinstance(data[key], list):
            data[key] = deepcopy(value)
    return data


def load_database() -> dict:
    if DB_PATH.exists():
        try:
            raw = DB_PATH.read_text(encoding="utf-8")
            data = json.loads(raw) if raw.strip() else default_database()
            return ensure_database_shape(data)
        except Exception:
            return default_database()
    return default_database()


def save_database(data: dict) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    DB_PATH.write_text(payload, encoding="utf-8")


def seed_database() -> None:
    if not DB_PATH.exists():
        save_database(default_database())
        return
    try:
        data = load_database()
        save_database(data)
    except Exception:
        save_database(default_database())


def bootstrap_payload() -> dict:
    return {
        "brand": "PARK.GO",
        "vehicleTypes": VEHICLE_TYPES,
        "ownershipOptions": OWNERSHIP_OPTIONS,
        "locations": KNOWN_LOCATIONS,
        "towingRates": TOW_RATE_PER_KM,
        "serviceFee": 0,
        "parkingDefaultHours": 2,
        "paymentMethods": ["UPI", "Card", "Wallet"],
    }


def provider_to_payload(provider: dict, origin: dict | None = None, vehicle_type: str | None = None) -> dict:
    supported = list(provider.get("supported_vehicle_types", []))
    amenities = list(provider.get("amenities", []))
    provider_geo = {
        "lat": provider["latitude"],
        "lng": provider["longitude"],
    }
    distance = round(haversine(origin, provider_geo), 2) if origin else 0.0
    selected_vehicle = (vehicle_type or "car").lower()
    compatible = selected_vehicle in supported
    total_spaces = max(int(provider.get("total_spaces", 1)), 1)
    empty_spaces = int(provider.get("empty_spaces", 0))
    return {
        "id": provider["id"],
        "name": provider["name"],
        "area": provider["area"],
        "city": provider["city"],
        "latitude": provider["latitude"],
        "longitude": provider["longitude"],
        "hourlyRate": round(float(provider["hourly_rate"]), 2),
        "totalSpaces": total_spaces,
        "emptySpaces": empty_spaces,
        "aiDetectedEmptySpaces": int(provider.get("ai_detected_empty_spaces", empty_spaces)),
        "supportedVehicleTypes": supported,
        "amenities": amenities,
        "phone": provider["phone"],
        "operatingHours": provider["operating_hours"],
        "distanceKm": distance,
        "compatible": compatible,
        "occupancy": round(100 - (empty_spaces / total_spaces * 100), 1),
        "estimatedTwoHourTotal": round(float(provider["hourly_rate"]) * 2, 2),
    }


def parking_search(location_text: str, vehicle_type: str) -> dict:
    origin = geocode_location(location_text)
    selected_vehicle = (vehicle_type or "car").lower()
    data = load_database()
    providers = data["parking_providers"]
    payloads = [provider_to_payload(provider, origin, selected_vehicle) for provider in providers]
    compatible = [item for item in payloads if item["compatible"]]
    sorted_providers = sorted(compatible or payloads, key=lambda item: item["distanceKm"])
    nearest = sorted_providers[0] if sorted_providers else None
    map_query = f"{nearest['name']}, {nearest['city']}" if nearest else location_text
    return {
        "location": origin,
        "vehicleType": selected_vehicle,
        "mapQuery": map_query,
        "providers": sorted_providers[:5],
        "nearestProvider": nearest,
    }


def create_parking_booking(body: dict) -> dict:
    provider_id = int(body.get("providerId") or 0)
    location = str(body.get("location") or "").strip() or "Selected location"
    vehicle_type = str(body.get("vehicleType") or "car").lower()
    hours = max(1, int(body.get("hours") or 2))
    customer_name = str(body.get("customerName") or "Guest driver").strip() or "Guest driver"
    payment_method = str(body.get("paymentMethod") or "UPI").strip() or "UPI"

    data = load_database()
    provider = next((item for item in data["parking_providers"] if int(item["id"]) == provider_id), None)
    if provider is None:
        raise ValueError("Parking provider not found.")

    amount = round(float(provider["hourly_rate"]) * hours, 2)
    booking_code = f"PG-{uuid.uuid4().hex[:8].upper()}"
    qr_payload = (
        f"PARK.GO|booking={booking_code}|provider={provider['name']}|"
        f"location={location}|vehicle={vehicle_type}|hours={hours}|amount={amount:.2f}"
    )

    data["parking_bookings"].append(
        {
            "bookingCode": booking_code,
            "providerId": provider_id,
            "customerName": customer_name,
            "location": location,
            "vehicleType": vehicle_type,
            "hours": hours,
            "amount": amount,
            "paymentMethod": payment_method,
            "qrPayload": qr_payload,
            "status": "paid",
            "createdAt": now_iso(),
        }
    )

    provider["empty_spaces"] = max(int(provider.get("empty_spaces", 0)) - 1, 0)
    provider["ai_detected_empty_spaces"] = max(int(provider.get("ai_detected_empty_spaces", 0)) - 1, 0)
    save_database(data)

    return {
        "bookingCode": booking_code,
        "providerId": provider_id,
        "providerName": provider["name"],
        "customerName": customer_name,
        "location": location,
        "vehicleType": vehicle_type,
        "hours": hours,
        "amount": amount,
        "paymentMethod": payment_method,
        "qrPayload": qr_payload,
        "status": "paid",
    }


def towing_quote(body: dict) -> dict:
    pickup = str(body.get("pickupLocation") or "").strip()
    drop = str(body.get("dropLocation") or "").strip()
    vehicle_type = str(body.get("vehicleType") or "car").lower()
    complaint_type = str(body.get("complaintType") or "regular_tow").strip()
    ownership_status = str(body.get("ownershipStatus") or "own_vehicle").strip()

    pickup_geo = geocode_location(pickup)
    drop_geo = geocode_location(drop or pickup)
    distance = round(haversine(pickup_geo, drop_geo), 2)
    rate = TOW_RATE_PER_KM.get(vehicle_type, TOW_RATE_PER_KM["car"])
    complaint_only = complaint_type == "complaint_only" or ownership_status == "no_parking"
    amount = 0.0 if complaint_only else round(distance * rate, 2)
    eta_minutes = 20 if complaint_only else max(20, int(distance * 6) + 12)
    return {
        "pickupLocation": pickup,
        "dropLocation": drop,
        "vehicleType": vehicle_type,
        "complaintType": complaint_type,
        "ownershipStatus": ownership_status,
        "distanceKm": distance,
        "ratePerKm": rate,
        "amount": amount,
        "paymentRequired": not complaint_only,
        "etaMinutes": eta_minutes,
    }


def create_towing_request(body: dict, quote: dict | None = None) -> dict:
    customer_name = str(body.get("customerName") or "Guest driver").strip() or "Guest driver"
    vehicle_number = str(body.get("vehicleNumber") or "Unknown").strip() or "Unknown"
    ownership_status = str(body.get("ownershipStatus") or "own_vehicle").strip()
    complaint_type = str(body.get("complaintType") or "regular_tow").strip()
    pickup_location = str(body.get("pickupLocation") or "").strip() or "Unknown pickup"
    drop_location = str(body.get("dropLocation") or "").strip() or pickup_location
    contact = str(body.get("contact") or "").strip() or "Not provided"
    vehicle_type = str(body.get("vehicleType") or "car").lower()

    current_quote = quote or towing_quote(body)
    payment_required = 1 if current_quote["paymentRequired"] else 0
    status = "complaint_confirmed" if payment_required == 0 else "paid"
    request_code = f"TW-{uuid.uuid4().hex[:8].upper()}"

    data = load_database()
    data["towing_requests"].append(
        {
            "requestCode": request_code,
            "customerName": customer_name,
            "vehicleNumber": vehicle_number,
            "ownershipStatus": ownership_status,
            "complaintType": complaint_type,
            "pickupLocation": pickup_location,
            "dropLocation": drop_location,
            "contact": contact,
            "vehicleType": vehicle_type,
            "distanceKm": current_quote["distanceKm"],
            "ratePerKm": current_quote["ratePerKm"],
            "amount": current_quote["amount"],
            "paymentRequired": payment_required,
            "status": status,
            "etaMinutes": current_quote["etaMinutes"],
            "createdAt": now_iso(),
        }
    )
    save_database(data)

    return {
        "requestCode": request_code,
        "customerName": customer_name,
        "vehicleNumber": vehicle_number,
        "ownershipStatus": ownership_status,
        "complaintType": complaint_type,
        "pickupLocation": pickup_location,
        "dropLocation": drop_location,
        "contact": contact,
        "vehicleType": vehicle_type,
        "distanceKm": current_quote["distanceKm"],
        "ratePerKm": current_quote["ratePerKm"],
        "amount": current_quote["amount"],
        "paymentRequired": bool(payment_required),
        "status": status,
        "etaMinutes": current_quote["etaMinutes"],
    }


def vendor_dashboard() -> dict:
    data = load_database()
    providers = sorted(data["parking_providers"], key=lambda item: item["hourly_rate"], reverse=True)
    bookings = sorted(data["parking_bookings"], key=lambda item: item["createdAt"], reverse=True)[:8]
    towing = sorted(data["towing_requests"], key=lambda item: item["createdAt"], reverse=True)[:8]
    bookings_today = sum(1 for item in data["parking_bookings"] if str(item.get("createdAt", "")).startswith(today_iso()))
    towing_today = sum(1 for item in data["towing_requests"] if str(item.get("createdAt", "")).startswith(today_iso()))

    provider_payloads = []
    provider_lookup = {int(item["id"]): item for item in providers}
    for row in providers:
        provider_payloads.append(
            {
                "id": row["id"],
                "name": row["name"],
                "city": row["city"],
                "area": row["area"],
                "hourlyRate": row["hourly_rate"],
                "totalSpaces": row["total_spaces"],
                "emptySpaces": row["empty_spaces"],
                "aiDetectedEmptySpaces": row["ai_detected_empty_spaces"],
                "operatingHours": row["operating_hours"],
                "phone": row["phone"],
                "occupancy": round(100 - (row["empty_spaces"] / max(row["total_spaces"], 1) * 100), 1),
            }
        )

    booking_payloads = [
        {
            "bookingCode": row["bookingCode"],
            "providerName": provider_lookup.get(int(row["providerId"]), {}).get("name", "Unknown provider"),
            "customerName": row["customerName"],
            "location": row["location"],
            "vehicleType": row["vehicleType"],
            "hours": row["hours"],
            "amount": row["amount"],
            "status": row["status"],
            "createdAt": row["createdAt"],
        }
        for row in bookings
    ]
    towing_payloads = [
        {
            "requestCode": row["requestCode"],
            "customerName": row["customerName"],
            "vehicleNumber": row["vehicleNumber"],
            "pickupLocation": row["pickupLocation"],
            "dropLocation": row["dropLocation"],
            "vehicleType": row["vehicleType"],
            "distanceKm": row["distanceKm"],
            "amount": row["amount"],
            "paymentRequired": bool(row["paymentRequired"]),
            "status": row["status"],
            "createdAt": row["createdAt"],
        }
        for row in towing
    ]

    return {
        "stats": {
            "providerCount": len(provider_payloads),
            "emptySpaces": sum(item["emptySpaces"] for item in provider_payloads),
            "bookingsToday": bookings_today,
            "towRequestsToday": towing_today,
        },
        "providers": provider_payloads,
        "bookings": booking_payloads,
        "towRequests": towing_payloads,
    }


def parse_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    raw = handler.rfile.read(length) if length else b"{}"
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {exc}") from exc


def send_json(handler: BaseHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def send_text(
    handler: BaseHTTPRequestHandler,
    text: str,
    status: int = 200,
    content_type: str = "text/plain; charset=utf-8",
) -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def serve_static_file(handler: BaseHTTPRequestHandler, relative_path: str) -> None:
    file_path = (FRONTEND_DIR / relative_path).resolve()
    if FRONTEND_DIR not in file_path.parents and file_path != FRONTEND_DIR:
        send_text(handler, "Forbidden", 403)
        return
    if not file_path.exists() or not file_path.is_file():
        send_text(handler, "Not found", 404)
        return

    content = file_path.read_bytes()
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    if content_type.startswith("text/") or content_type in {"application/javascript", "application/json"}:
        content_type = f"{content_type}; charset=utf-8"

    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(content)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(content)


class ParkGoHandler(BaseHTTPRequestHandler):
    server_version = "ParkGoHTTP/1.0"

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        timestamp = datetime.now().strftime("%H:%M:%S")
        message = format % args
        sys.stdout.write(f"[{timestamp}] {self.address_string()} {message}\n")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path in {"/", "/index.html"}:
            return serve_static_file(self, "index.html")
        if path in {"/user", "/user.html"}:
            return serve_static_file(self, "user.html")
        if path in {"/vendor", "/vendor.html"}:
            return serve_static_file(self, "vendor.html")
        if path == "/style.css":
            return serve_static_file(self, "style.css")
        if path == "/app.js":
            return serve_static_file(self, "app.js")
        if path == "/api/bootstrap":
            return send_json(self, bootstrap_payload())
        if path == "/api/parking/search":
            params = parse_qs(parsed.query)
            location = unquote(params.get("location", [""])[0])
            vehicle_type = unquote(params.get("vehicleType", ["car"])[0])
            return send_json(self, parking_search(location, vehicle_type))
        if path == "/api/vendor/dashboard":
            return send_json(self, vendor_dashboard())
        if path == "/api/health":
            return send_json(self, {"ok": True, "time": now_iso()})

        return send_text(self, "Not found", 404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        try:
            body = parse_json_body(self)
        except ValueError as exc:
            return send_json(self, {"ok": False, "error": str(exc)}, 400)

        if parsed.path == "/api/parking/quote":
            try:
                location = str(body.get("location") or "")
                vehicle_type = str(body.get("vehicleType") or "car")
                search_data = parking_search(location, vehicle_type)
                provider = search_data["nearestProvider"]
                if provider is None:
                    raise ValueError("No parking provider found.")
                hours = max(1, int(body.get("hours") or 2))
                amount = round(provider["hourlyRate"] * hours, 2)
                return send_json(
                    self,
                    {
                        "provider": provider,
                        "hours": hours,
                        "amount": amount,
                        "location": search_data["location"],
                    },
                )
            except Exception as exc:  # noqa: BLE001
                return send_json(self, {"ok": False, "error": str(exc)}, 400)

        if parsed.path == "/api/parking/book":
            try:
                payload = create_parking_booking(body)
                return send_json(self, {"ok": True, **payload})
            except Exception as exc:  # noqa: BLE001
                return send_json(self, {"ok": False, "error": str(exc)}, 400)

        if parsed.path == "/api/towing/quote":
            try:
                return send_json(self, {"ok": True, **towing_quote(body)})
            except Exception as exc:  # noqa: BLE001
                return send_json(self, {"ok": False, "error": str(exc)}, 400)

        if parsed.path == "/api/towing/submit":
            try:
                quote = towing_quote(body)
                payload = create_towing_request(body, quote=quote)
                return send_json(self, {"ok": True, **payload})
            except Exception as exc:  # noqa: BLE001
                return send_json(self, {"ok": False, "error": str(exc)}, 400)

        return send_json(self, {"ok": False, "error": "Not found"}, 404)


def main() -> None:
    seed_database()
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    else:
        port = PORT

    server = ThreadingHTTPServer((HOST, port), ParkGoHandler)
    print(f"Park.Go running at http://{HOST}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Park.Go...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
