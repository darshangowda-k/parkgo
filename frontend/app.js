const state = {
  bootstrap: null,
  landingVehicle: "car",
  landingService: "parking",
  user: {
    mode: "parking",
    parkingSearch: null,
    providers: [],
    selectedProvider: null,
    parkingBooking: null,
    towingQuote: null,
    towingRequest: null,
  },
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatCurrencyPrecise(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDistance(value) {
  return `${Number(value || 0).toFixed(1)} km`;
}

function formatTime(value) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value || "--";
  }
}

function api(path, options = {}) {
  return fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  }).then(async (response) => {
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || response.statusText || "Request failed");
    }
    return data;
  });
}

function getBootstrap() {
  if (!state.bootstrap) {
    state.bootstrap = api("/api/bootstrap");
  }
  return state.bootstrap;
}

function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

function mapUrl(query) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
}

function setMap(iframe, query) {
  if (iframe) {
    iframe.src = mapUrl(query || "Parking");
  }
}

function renderDatalist(datalist, items) {
  if (!datalist) return;
  datalist.innerHTML = items
    .map((item) => `<option value="${escapeHtml(item.label)}"></option>`)
    .join("");
}

function renderVehiclePills(container, items, selectedId, onSelect) {
  if (!container) return;
  container.innerHTML = items
    .map(
      (item) =>
        `<button type="button" class="vehicle-chip ${item.id === selectedId ? "active" : ""}" data-vehicle="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`,
    )
    .join("");
  $all(".vehicle-chip", container).forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.vehicle;
      $all(".vehicle-chip", container).forEach((chip) => chip.classList.toggle("active", chip === button));
      if (onSelect) onSelect(next);
    });
  });
}

function renderSelectOptions(select, items, selectedId) {
  if (!select) return;
  select.innerHTML = items
    .map((item) => {
      const selected = item.id === selectedId ? "selected" : "";
      return `<option value="${escapeHtml(item.id)}" ${selected}>${escapeHtml(item.label)}</option>`;
    })
    .join("");
}

function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function currentLocationLabel(input, fallback) {
  return (input && input.value && input.value.trim()) || fallback || "";
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getSelectedVehicle(container, fallback = "car") {
  const active = container ? $(".vehicle-chip.active", container) : null;
  return active?.dataset.vehicle || fallback;
}

function renderParkingProviderCard(provider, selected = false) {
  const compatibility = provider.compatible
    ? `<span class="info-pill">Compatible</span>`
    : `<span class="info-pill">Check vehicle type</span>`;
  const chips = provider.supportedVehicleTypes
    .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
    .join("");
  return `
    <article class="provider-card ${selected ? "active" : ""}" data-provider-id="${provider.id}">
      <div class="flex-between">
        <h3>${escapeHtml(provider.name)}</h3>
        <span class="status-pill">${formatDistance(provider.distanceKm)}</span>
      </div>
      <p>${escapeHtml(provider.area)}, ${escapeHtml(provider.city)}</p>
      <div class="provider-meta">
        <div class="meta-box">
          <span>Rate per hour</span>
          <strong>${formatCurrency(provider.hourlyRate)}</strong>
        </div>
        <div class="meta-box">
          <span>Empty spaces</span>
          <strong>${provider.emptySpaces}</strong>
        </div>
        <div class="meta-box">
          <span>AI detected</span>
          <strong>${provider.aiDetectedEmptySpaces}</strong>
        </div>
        <div class="meta-box">
          <span>Occupancy</span>
          <strong>${provider.occupancy}%</strong>
        </div>
      </div>
      <div class="chip-row">${chips}</div>
      <div class="cta-row">
        ${compatibility}
      </div>
    </article>
  `;
}

function renderSelectedProvider(provider, locationLabel) {
  const name = $("#selectedProviderName");
  const address = $("#selectedProviderAddress");
  const distance = $("#selectedProviderDistance");
  const meta = $("#selectedProviderMeta");
  const amenities = $("#selectedProviderAmenities");

  if (!name || !address || !distance || !meta || !amenities || !provider) return;

  name.textContent = provider.name;
  address.textContent = `${provider.area}, ${provider.city} | selected for ${locationLabel}`;
  distance.textContent = `${formatDistance(provider.distanceKm)} away`;
  meta.innerHTML = `
    <div class="meta-box">
      <span>Rate per hour</span>
      <strong>${formatCurrency(provider.hourlyRate)}</strong>
    </div>
    <div class="meta-box">
      <span>Total spaces</span>
      <strong>${provider.totalSpaces}</strong>
    </div>
    <div class="meta-box">
      <span>AI empty slots</span>
      <strong>${provider.aiDetectedEmptySpaces}</strong>
    </div>
    <div class="meta-box">
      <span>Operating hours</span>
      <strong>${escapeHtml(provider.operatingHours)}</strong>
    </div>
  `;
  amenities.innerHTML = provider.amenities.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("");
}

function renderParkingPrice() {
  const hoursInput = $("#parkingHours");
  const hoursValue = $("#parkingHoursValue");
  const rate = $("#parkingRate");
  const total = $("#parkingTotal");
  const provider = state.user.selectedProvider;
  if (!hoursInput || !hoursValue || !rate || !total || !provider) return;
  const hours = safeNumber(hoursInput.value, 2);
  hoursValue.textContent = `${hours} hr${hours === 1 ? "" : "s"}`;
  rate.textContent = `${formatCurrency(provider.hourlyRate)}/hr`;
  total.textContent = formatCurrencyPrecise(provider.hourlyRate * hours);
}

function renderParkingSuccess(booking) {
  const success = $("#parkingSuccess");
  const text = $("#parkingSuccessText");
  if (!success || !text) return;
  text.textContent = `${booking.bookingCode} is active for ${booking.customerName}. Amount paid: ${formatCurrencyPrecise(booking.amount)}.`;
  success.classList.remove("hidden");
}

function renderQr(target, payload) {
  if (!target) return;
  target.innerHTML = "";
  if (!window.QRCode) {
    target.innerHTML = `
      <div class="empty-state">
        QR code library is unavailable, but the ticket reference is ready:<br><strong>${escapeHtml(payload)}</strong>
      </div>
    `;
    return;
  }
  // qrcodejs injects a canvas when available, which we can later download.
  // eslint-disable-next-line no-new
  new QRCode(target, {
    text: payload,
    width: 220,
    height: 220,
    colorDark: "#08111d",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function downloadQrFromTarget(target, filename) {
  if (!target) return;
  const canvas = target.querySelector("canvas");
  if (canvas) {
    const anchor = document.createElement("a");
    anchor.download = filename;
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
    return;
  }
  const image = target.querySelector("img");
  if (image) {
    const anchor = document.createElement("a");
    anchor.download = filename;
    anchor.href = image.src;
    anchor.click();
  }
}

function renderParkingProvidersList(providers) {
  const list = $("#parkingProviderList");
  if (!list) return;
  list.innerHTML = providers
    .map((provider) => renderParkingProviderCard(provider, state.user.selectedProvider?.id === provider.id))
    .join("");
  $all(".provider-card", list).forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.providerId);
      const provider = state.user.providers.find((item) => item.id === id);
      if (!provider) return;
      state.user.selectedProvider = provider;
      renderSelectedProvider(provider, state.user.parkingSearch?.location?.label || "your selected location");
      renderParkingPrice();
      renderParkingProvidersList(state.user.providers);
    });
  });
}

function openPaymentModal() {
  const modal = $("#paymentModal");
  const paymentSummary = $("#paymentSummary");
  const provider = state.user.selectedProvider;
  const hours = safeNumber($("#parkingHours")?.value, 2);
  const total = provider ? provider.hourlyRate * hours : 0;
  if (!modal || !paymentSummary || !provider) return;
  paymentSummary.innerHTML = `
    <div class="quote-stat"><span>Provider</span><strong>${escapeHtml(provider.name)}</strong></div>
    <div class="quote-stat"><span>Hours</span><strong>${hours} hr${hours === 1 ? "" : "s"}</strong></div>
    <div class="quote-stat"><span>Location</span><strong>${escapeHtml(state.user.parkingSearch?.location?.label || "Selected location")}</strong></div>
    <div class="quote-stat"><span>Total</span><strong>${formatCurrencyPrecise(total)}</strong></div>
  `;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closePaymentModal() {
  const modal = $("#paymentModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function setUserMode(mode) {
  const parkingPane = $("#parkingPane");
  const towingPane = $("#towingPane");
  const userModeTag = $("#userModeTag");
  const userTitle = $("#userTitle");
  const userSubtitle = $("#userSubtitle");

  if (mode === "towing") {
    parkingPane?.classList.add("hidden");
    towingPane?.classList.remove("hidden");
    if (userModeTag) userModeTag.textContent = "Towing";
    if (userTitle) userTitle.textContent = "Towing request form";
    if (userSubtitle) {
      userSubtitle.textContent =
        "Share pickup and drop details, calculate the towing distance, and either pay per km or confirm a no-parking complaint.";
    }
  } else {
    towingPane?.classList.add("hidden");
    parkingPane?.classList.remove("hidden");
    if (userModeTag) userModeTag.textContent = "Parking";
    if (userTitle) userTitle.textContent = "Parking space provider details";
    if (userSubtitle) {
      userSubtitle.textContent =
        "Select a provider, review the per-hour price, and complete payment to generate a unique QR code.";
    }
  }
}

async function initLandingPage() {
  const boot = await getBootstrap();
  const params = getQueryParams();
  const locationInput = $("#landingLocation");
  const datalist = $("#landingLocations");
  const map = $("#landingMap");
  const vehiclePills = $("#landingVehiclePills");
  const parkingPreview = $("#parkingPreview");
  const towingPreview = $("#towingPreview");
  const serviceTabs = $all(".service-tab");
  const continueButton = $("#landingParkingContinue");
  const nearestName = $("#landingNearestName");
  const nearestDistance = $("#landingNearestDistance");
  const aiSpaces = $("#landingAiSpaces");
  const aiSummary = $("#landingAiSummary");
  const towForm = $("#landingTowForm");

  renderDatalist(datalist, boot.locations);

  const defaultLocation = boot.locations[0]?.label || "";
  locationInput.value = params.get("location") || defaultLocation;
  state.landingVehicle = params.get("vehicle") || "car";

  renderVehiclePills(vehiclePills, boot.vehicleTypes, state.landingVehicle, (vehicle) => {
    state.landingVehicle = vehicle;
    updateLandingParkingPreview();
  });

  const populateTowQuickForm = () => {
    const selects = {
      landingTowVehicleType: boot.vehicleTypes,
      landingTowOwnership: boot.ownershipOptions,
    };
    Object.entries(selects).forEach(([id, options]) => {
      const select = document.getElementById(id);
      renderSelectOptions(select, options, options[0]?.id);
    });
  };

  populateTowQuickForm();

  function setService(service) {
    state.landingService = service === "towing" ? "towing" : "parking";
    serviceTabs.forEach((button) => button.classList.toggle("active", button.dataset.service === state.landingService));
    parkingPreview?.classList.toggle("hidden", state.landingService !== "parking");
    towingPreview?.classList.toggle("hidden", state.landingService !== "towing");
  }

  async function updateLandingParkingPreview() {
    const requestLocation = currentLocationLabel(locationInput, defaultLocation);
    const currentVehicle = getSelectedVehicle(vehiclePills, state.landingVehicle);
    try {
      const result = await api(
        `/api/parking/search?location=${encodeURIComponent(requestLocation)}&vehicleType=${encodeURIComponent(currentVehicle)}`,
      );
      const nearest = result.nearestProvider;
      if (nearest) {
        nearestName.textContent = nearest.name;
        nearestDistance.textContent = `${formatDistance(nearest.distanceKm)} away`;
        aiSpaces.textContent = `${nearest.aiDetectedEmptySpaces} empty spaces`;
        aiSummary.textContent = `${nearest.area}, ${nearest.city} | ${formatCurrency(nearest.hourlyRate)}/hr | ${nearest.occupancy}% occupied`;
        setMap(map, result.mapQuery);
      }
    } catch (error) {
      nearestName.textContent = "Live preview unavailable";
      nearestDistance.textContent = error.message;
      aiSpaces.textContent = "-- empty spaces";
      aiSummary.textContent = "Unable to fetch the nearest providers right now.";
      setMap(map, requestLocation);
    }
  }

  const debouncedParkingPreview = debounce(updateLandingParkingPreview, 220);
  locationInput?.addEventListener("input", debouncedParkingPreview);

  serviceTabs.forEach((button) => {
    button.addEventListener("click", () => setService(button.dataset.service));
  });

  continueButton?.addEventListener("click", () => {
    const location = currentLocationLabel(locationInput, defaultLocation);
    const paramsNext = new URLSearchParams({
      mode: "parking",
      location,
      vehicle: state.landingVehicle,
    });
    window.location.href = `/user.html?${paramsNext.toString()}`;
  });

  towForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(towForm);
    const values = Object.fromEntries(form.entries());
    const paramsNext = new URLSearchParams({
      mode: "towing",
      customerName: values.customerName || "",
      vehicleNumber: values.vehicleNumber || "",
      pickup: values.pickupLocation || "",
      drop: values.dropLocation || "",
      contact: values.contact || "",
      vehicle: values.vehicleType || "car",
      ownership: values.ownershipStatus || "own_vehicle",
      complaint: values.complaintType || "regular_tow",
    });
    window.location.href = `/user.html?${paramsNext.toString()}`;
  });

  setService(params.get("service") || "parking");
  await updateLandingParkingPreview();
}

function renderUserParkingSummary(provider, locationLabel) {
  const summaryName = $("#selectedProviderName");
  const summaryAddress = $("#selectedProviderAddress");
  const summaryDistance = $("#selectedProviderDistance");
  const meta = $("#selectedProviderMeta");
  const amenities = $("#selectedProviderAmenities");
  if (!provider) return;
  if (summaryName) summaryName.textContent = provider.name;
  if (summaryAddress) summaryAddress.textContent = `${provider.area}, ${provider.city} | nearest for ${locationLabel}`;
  if (summaryDistance) summaryDistance.textContent = `${formatDistance(provider.distanceKm)} away`;
  if (meta) {
    meta.innerHTML = `
      <div class="meta-box">
        <span>Rate per hour</span>
        <strong>${formatCurrency(provider.hourlyRate)}</strong>
      </div>
      <div class="meta-box">
        <span>Empty spaces</span>
        <strong>${provider.emptySpaces}</strong>
      </div>
      <div class="meta-box">
        <span>AI scan</span>
        <strong>${provider.aiDetectedEmptySpaces}</strong>
      </div>
      <div class="meta-box">
        <span>Operating hours</span>
        <strong>${escapeHtml(provider.operatingHours)}</strong>
      </div>
    `;
  }
  if (amenities) {
    amenities.innerHTML = provider.amenities.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("");
  }
}

function parkingSearchKey(locationLabel, vehicleType) {
  return `/api/parking/search?location=${encodeURIComponent(locationLabel)}&vehicleType=${encodeURIComponent(vehicleType)}`;
}

async function initParkingFlow(boot, params) {
  const locationLabel = params.get("location") || boot.locations[0]?.label || "Selected location";
  const vehicleType = params.get("vehicle") || "car";
  const hoursInput = $("#parkingHours");
  const hoursValue = $("#parkingHoursValue");
  const parkingRate = $("#parkingRate");
  const parkingTotal = $("#parkingTotal");
  const payNowButton = $("#parkingPayNow");
  const providerList = $("#parkingProviderList");
  const success = $("#parkingSuccess");
  const qr = $("#parkingQr");
  const download = $("#downloadParkingQr");
  const modal = $("#paymentModal");
  const closeModal = $("#closePaymentModal");
  const confirmPayment = $("#confirmParkingPayment");
  const paymentName = $("#paymentName");
  const paymentMethod = $("#paymentMethod");
  const paymentReference = $("#paymentReference");
  const paymentContact = $("#paymentContact");
  const selectedProvider = $("#selectedProviderName");

  $("#userModeTag").textContent = "Parking";
  $("#userTitle").textContent = "Parking space provider details";
  $("#userSubtitle").textContent =
    "Select a provider, review the per-hour price, and complete payment to generate a unique QR code.";

  renderSelectOptions(paymentMethod, boot.paymentMethods.map((item) => ({ id: item, label: item })), "UPI");

  try {
    const result = await api(parkingSearchKey(locationLabel, vehicleType));
    state.user.parkingSearch = result;
    state.user.providers = result.providers;
    state.user.selectedProvider = result.nearestProvider || result.providers[0];
    if (paymentName) paymentName.value = params.get("name") || "";
    if (paymentContact) paymentContact.value = params.get("contact") || "";
    if ($("#parkingCustomerName")) $("#parkingCustomerName").value = params.get("name") || "";
    renderSelectedProvider(state.user.selectedProvider, locationLabel);
    renderParkingProvidersList(state.user.providers);
    if (hoursInput) hoursInput.value = String(boot.parkingDefaultHours || 2);
    renderParkingPrice();
  } catch (error) {
    if (selectedProvider) selectedProvider.textContent = "Unable to load providers";
    providerList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }

  hoursInput?.addEventListener("input", renderParkingPrice);
  payNowButton?.addEventListener("click", openPaymentModal);
  closeModal?.addEventListener("click", closePaymentModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closePaymentModal();
    }
  });

  confirmPayment?.addEventListener("click", async () => {
    const provider = state.user.selectedProvider;
    if (!provider) return;
    const hours = safeNumber(hoursInput?.value, 2);
    const bookingPayload = {
      providerId: provider.id,
      location: state.user.parkingSearch?.location?.label || locationLabel,
      vehicleType,
      hours,
      customerName: $("#parkingCustomerName")?.value || paymentName?.value || "Guest driver",
      paymentMethod: paymentMethod?.value || "UPI",
    };
    try {
      confirmPayment.disabled = true;
      const result = await api("/api/parking/book", {
        method: "POST",
        body: JSON.stringify(bookingPayload),
      });
      state.user.parkingBooking = result;
      closePaymentModal();
      if (success) success.classList.remove("hidden");
      renderParkingSuccess(result);
      renderQr(qr, result.qrPayload);
      if (download) {
        download.onclick = () => downloadQrFromTarget(qr, `${result.bookingCode}.png`);
      }
      state.user.providers = state.user.providers.map((item) =>
        item.id === result.providerId
          ? {
              ...item,
              emptySpaces: Math.max(item.emptySpaces - 1, 0),
              aiDetectedEmptySpaces: Math.max(item.aiDetectedEmptySpaces - 1, 0),
            }
          : item,
      );
      state.user.selectedProvider = state.user.providers.find((item) => item.id === result.providerId) || state.user.selectedProvider;
      renderParkingProvidersList(state.user.providers);
      renderSelectedProvider(state.user.selectedProvider, locationLabel);
      renderParkingPrice();
    } catch (error) {
      alert(error.message);
    } finally {
      confirmPayment.disabled = false;
    }
  });
}

function renderTowQuote(quote, formValues) {
  const panel = $("#towQuotePanel");
  const title = $("#towSuccessTitle");
  if (!panel) return;

  const isComplaintOnly = !quote.paymentRequired;
  panel.innerHTML = `
    <p class="small-label">Quote preview</p>
    <div class="quote-card">
      <div class="quote-stat">
        <span>Pickup</span>
        <strong>${escapeHtml(quote.pickupLocation)}</strong>
      </div>
      <div class="quote-stat">
        <span>Drop</span>
        <strong>${escapeHtml(quote.dropLocation || quote.pickupLocation)}</strong>
      </div>
      <div class="quote-stat">
        <span>Distance</span>
        <strong>${formatDistance(quote.distanceKm)}</strong>
      </div>
      <div class="quote-stat">
        <span>Rate per km</span>
        <strong>${formatCurrencyPrecise(quote.ratePerKm)}</strong>
      </div>
      <div class="quote-stat">
        <span>ETA</span>
        <strong>${quote.etaMinutes} min</strong>
      </div>
      <div class="quote-stat">
        <span>Payment</span>
        <strong>${isComplaintOnly ? "No payment required" : formatCurrencyPrecise(quote.amount)}</strong>
      </div>
      <div class="quote-actions">
        <button type="button" class="primary-btn" id="${isComplaintOnly ? "towConfirmComplaint" : "towPayNow"}">
          ${isComplaintOnly ? "Confirm complaint" : "Pay now"}
        </button>
      </div>
    </div>
  `;

  if (title) {
    title.textContent = isComplaintOnly ? "Complaint confirmed" : "Towing request ready";
  }

  state.user.towingQuote = { ...quote, formValues };
}

function renderTowSuccess(result) {
  const section = $("#towSuccess");
  if (!section) return;
  $("#towReference").textContent = result.requestCode;
  $("#towStatus").textContent = result.paymentRequired ? "Paid towing request" : "Complaint confirmed";
  $("#towSuccessTitle").textContent = result.paymentRequired ? "Towing request paid" : "Complaint registered";
  $("#towSuccessText").textContent = result.paymentRequired
    ? `Payment saved for ${result.customerName}. The tow reference is ready.`
    : `Complaint logged for ${result.customerName}. No payment was required.`;
  section.classList.remove("hidden");
}

async function initTowingFlow(boot, params) {
  const form = $("#towingForm");
  const quotePanel = $("#towQuotePanel");
  const success = $("#towSuccess");
  const vehicleType = $("#towingVehicleType");
  const ownership = $("#towingOwnership");
  const complaint = $("#towingComplaint");

  renderDatalist($("#userLocations"), boot.locations);
  renderSelectOptions(vehicleType, boot.vehicleTypes, params.get("vehicle") || "car");
  renderSelectOptions(ownership, boot.ownershipOptions, params.get("ownership") || "own_vehicle");

  $("#towingCustomerName").value = params.get("customerName") || "";
  $("#towingVehicleNumber").value = params.get("vehicleNumber") || "";
  $("#towingPickup").value = params.get("pickup") || boot.locations[0]?.label || "";
  $("#towingDrop").value = params.get("drop") || boot.locations[1]?.label || boot.locations[0]?.label || "";
  $("#towingContact").value = params.get("contact") || "";
  complaint.value = params.get("complaint") || "regular_tow";

  if (success) success.classList.add("hidden");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    values.complaintType = complaint.value;
    values.vehicleType = vehicleType.value;
    values.ownershipStatus = ownership.value;
    try {
      const quote = await api("/api/towing/quote", {
        method: "POST",
        body: JSON.stringify(values),
      });
      renderTowQuote(quote, values);
      quotePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (quotePanel) {
        quotePanel.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      }
    }
  });

  quotePanel?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id !== "towPayNow" && target.id !== "towConfirmComplaint") return;
    const payload = state.user.towingQuote?.formValues;
    if (!payload) return;
    try {
      target.setAttribute("disabled", "true");
      const result = await api("/api/towing/submit", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.user.towingRequest = result;
      renderTowSuccess(result);
      success?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      alert(error.message);
    } finally {
      target.removeAttribute("disabled");
    }
  });
}

function renderVendorStats(data) {
  const stats = $("#vendorStats");
  if (!stats) return;
  const items = [
    { label: "Providers", value: data.stats.providerCount, detail: "Active parking partners" },
    { label: "Empty spaces", value: data.stats.emptySpaces, detail: "Visible across all providers" },
    { label: "Bookings today", value: data.stats.bookingsToday, detail: "Paid parking passes generated" },
    { label: "Tow requests", value: data.stats.towRequestsToday, detail: "Complaints or pickup jobs" },
  ];
  stats.innerHTML = items
    .map(
      (item) => `
        <article class="stat-card">
          <p class="small-label">${escapeHtml(item.label)}</p>
          <strong>${escapeHtml(item.value)}</strong>
          <p>${escapeHtml(item.detail)}</p>
        </article>
      `,
    )
    .join("");
}

function renderVendorProviders(providers) {
  const container = $("#vendorProviders");
  if (!container) return;
  if (!providers.length) {
    container.innerHTML = `<div class="empty-state">No provider records found.</div>`;
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Provider</th>
          <th>Spaces</th>
          <th>Occupancy</th>
          <th>Rate</th>
        </tr>
      </thead>
      <tbody>
        ${providers
          .map(
            (provider) => `
              <tr>
                <td>
                  <strong>${escapeHtml(provider.name)}</strong><br>
                  <span class="subtle">${escapeHtml(provider.area)}, ${escapeHtml(provider.city)}</span>
                </td>
                <td>${provider.emptySpaces}/${provider.totalSpaces}</td>
                <td>
                  <strong>${provider.occupancy}%</strong>
                  <div class="bar-track"><span style="width: ${provider.occupancy}%"></span></div>
                </td>
                <td>${formatCurrency(provider.hourlyRate)}/hr</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderVendorBookings(bookings) {
  const container = $("#vendorBookings");
  if (!container) return;
  if (!bookings.length) {
    container.innerHTML = `<div class="empty-state">No parking bookings yet.</div>`;
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Booking</th>
          <th>Provider</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${bookings
          .map(
            (booking) => `
              <tr>
                <td>
                  <strong>${escapeHtml(booking.bookingCode)}</strong><br>
                  <span class="subtle">${escapeHtml(booking.customerName)}</span>
                </td>
                <td>
                  ${escapeHtml(booking.providerName)}<br>
                  <span class="subtle">${escapeHtml(booking.location)}</span>
                </td>
                <td>${formatCurrencyPrecise(booking.amount)}</td>
                <td>${escapeHtml(booking.status)}<br><span class="subtle">${formatTime(booking.createdAt)}</span></td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderVendorTows(tows) {
  const container = $("#vendorTows");
  if (!container) return;
  if (!tows.length) {
    container.innerHTML = `<div class="empty-state">No towing requests yet.</div>`;
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Request</th>
          <th>Route</th>
          <th>Distance</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${tows
          .map(
            (item) => `
              <tr>
                <td>
                  <strong>${escapeHtml(item.requestCode)}</strong><br>
                  <span class="subtle">${escapeHtml(item.customerName)}</span>
                </td>
                <td>
                  ${escapeHtml(item.pickupLocation)}<br>
                  <span class="subtle">${escapeHtml(item.dropLocation)}</span>
                </td>
                <td>${formatDistance(item.distanceKm)}<br><span class="subtle">${formatCurrencyPrecise(item.amount)}</span></td>
                <td>${escapeHtml(item.status)}<br><span class="subtle">${item.paymentRequired ? "Payment required" : "Complaint only"}</span></td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function initVendorPage() {
  const data = await api("/api/vendor/dashboard");
  renderVendorStats(data);
  renderVendorProviders(data.providers);
  renderVendorBookings(data.bookings);
  renderVendorTows(data.towRequests);
}

async function initUserPage() {
  const boot = await getBootstrap();
  const params = getQueryParams();
  const mode = (params.get("mode") || "parking").toLowerCase();
  setUserMode(mode);

  const parkingLocation = params.get("location") || boot.locations[0]?.label || "Selected location";
  const parkingVehicle = params.get("vehicle") || "car";
  const paymentContact = $("#paymentContact");
  const paymentName = $("#paymentName");
  const paymentMethod = $("#paymentMethod");
  const paymentReference = $("#paymentReference");
  const parkingCustomerName = $("#parkingCustomerName");
  const towingCustomer = $("#towingCustomerName");
  const towingVehicleNo = $("#towingVehicleNumber");
  const towingPickup = $("#towingPickup");
  const towingDrop = $("#towingDrop");
  const towingContact = $("#towingContact");
  const towingComplaint = $("#towingComplaint");

  renderDatalist($("#userLocations"), boot.locations);
  renderSelectOptions($("#towingVehicleType"), boot.vehicleTypes, params.get("vehicle") || "car");
  renderSelectOptions($("#towingOwnership"), boot.ownershipOptions, params.get("ownership") || "own_vehicle");
  renderSelectOptions(paymentMethod, boot.paymentMethods.map((item) => ({ id: item, label: item })), "UPI");

  if (parkingCustomerName) parkingCustomerName.value = params.get("name") || "";
  if (paymentName) paymentName.value = params.get("name") || "";
  if (paymentContact) paymentContact.value = params.get("contact") || "";
  if (paymentReference) paymentReference.value = "";

  if (towingCustomer) towingCustomer.value = params.get("customerName") || params.get("name") || "";
  if (towingVehicleNo) towingVehicleNo.value = params.get("vehicleNumber") || "";
  if (towingPickup) towingPickup.value = params.get("pickup") || boot.locations[0]?.label || "";
  if (towingDrop) towingDrop.value = params.get("drop") || boot.locations[1]?.label || boot.locations[0]?.label || "";
  if (towingContact) towingContact.value = params.get("contact") || "";
  if (towingComplaint) towingComplaint.value = params.get("complaint") || "regular_tow";

  if (mode === "parking") {
    await initParkingFlow(boot, params);
  } else {
    await initTowingFlow(boot, params);
  }
}

async function start() {
  const page = document.body?.dataset.page;
  try {
    if (page === "landing") {
      await initLandingPage();
    } else if (page === "user") {
      await initUserPage();
    } else if (page === "vendor") {
      await initVendorPage();
    }
  } catch (error) {
    const fallback = document.querySelector(".page-shell") || document.body;
    if (fallback) {
      fallback.insertAdjacentHTML(
        "afterbegin",
        `<div class="empty-state">App initialization failed: ${escapeHtml(error.message)}</div>`,
      );
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
