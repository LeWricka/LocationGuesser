/* LocationGuesser · v0.1 — web estática, sin backend.
   El reto viaja codificado en el enlace (#c=...). El mapa es Leaflet + OpenStreetMap. */
(function () {
  "use strict";

  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  // base64url sobre JSON (unicode-safe). No es cifrado: solo evita leer la respuesta de un vistazo.
  const enc = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const dec = (s) => { try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { return null; } };

  function haversine(a, b) {
    const R = 6371, rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); // km
  }
  const scoreFor = (km) => Math.max(0, Math.round(5000 * Math.exp(-km / 2000)));
  const fmtDist = (km) => km < 1 ? Math.round(km * 1000) + " m" : km < 100 ? km.toFixed(1) + " km" : Math.round(km) + " km";

  function copy(text, btn) {
    const done = () => { if (btn) { const t = btn.textContent; btn.textContent = "¡Copiado!"; setTimeout(() => (btn.textContent = t), 1400); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { const i = document.createElement("textarea"); i.value = text; document.body.appendChild(i); i.select(); try { document.execCommand("copy"); } catch (e) {} i.remove(); done(); }
  }

  const pinIcon = (emoji, cls) => L.divIcon({ className: "emoji-pin " + (cls || ""), html: emoji, iconSize: [34, 34], iconAnchor: [17, 32] });

  // ---------- router ----------
  const views = { home: $("#view-home"), create: $("#view-create"), play: $("#view-play") };
  function show(name) {
    Object.keys(views).forEach((k) => views[k].classList.toggle("hidden", k !== name));
    window.scrollTo(0, 0);
  }
  function route() {
    const h = location.hash;
    if (h.indexOf("#c=") === 0) { const ch = dec(h.slice(3)); if (ch && isFinite(ch.la) && isFinite(ch.ln)) { startPlay(ch); return; } }
    show("home");
  }
  window.addEventListener("hashchange", route);

  // ---------- HOME ----------
  $("#go-create").addEventListener("click", () => { location.hash = ""; show("create"); initCreate(); });
  $("#go-demo").addEventListener("click", () => {
    location.hash = "#c=" + enc({ t: "Ejemplo: ¿dónde es esto? 🗼", la: 48.8584, ln: 2.2945, ti: 60, im: "" });
  });

  // ---------- CREAR ----------
  let cMap, cMarker, cTimer = 60, cImg = "";
  function initCreate() {
    if (cMap) { setTimeout(() => cMap.invalidateSize(), 60); return; }
    cMap = L.map("map-create", { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(cMap);
    cMap.on("click", (e) => setC(e.latlng.lat, e.latlng.lng));
    setTimeout(() => cMap.invalidateSize(), 60);
  }
  function setC(lat, lng) {
    if (!cMarker) { cMarker = L.marker([lat, lng], { draggable: true, icon: pinIcon("📍", "me") }).addTo(cMap);
      cMarker.on("dragend", () => { const p = cMarker.getLatLng(); setCoords(p.lat, p.lng); }); }
    else cMarker.setLatLng([lat, lng]);
    setCoords(lat, lng);
  }
  function setCoords(lat, lng) {
    cMarker._loc = { lat, lng };
    $("#c-coords").textContent = "📍 " + lat.toFixed(5) + ", " + lng.toFixed(5);
    $("#c-generate").disabled = false;
  }
  $("#c-gps").addEventListener("click", () => {
    if (!navigator.geolocation) return alert("Tu navegador no permite geolocalización.");
    $("#c-gps").textContent = "buscando…";
    navigator.geolocation.getCurrentPosition(
      (pos) => { setC(pos.coords.latitude, pos.coords.longitude); cMap.setView([pos.coords.latitude, pos.coords.longitude], 16); $("#c-gps").textContent = "📡 Mi ubicación"; },
      () => { alert("No se pudo obtener tu ubicación. Pulsa en el mapa."); $("#c-gps").textContent = "📡 Mi ubicación"; },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
  $("#c-search").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return; e.preventDefault();
    const q = e.target.value.trim(); if (!q) return;
    fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q))
      .then((r) => r.json()).then((d) => { if (d && d[0]) { const lat = +d[0].lat, lng = +d[0].lon; setC(lat, lng); cMap.setView([lat, lng], 14); } else alert("No encontrado. Pulsa en el mapa."); })
      .catch(() => alert("No se pudo buscar. Pulsa en el mapa."));
  });
  $("#c-timer").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    [...$("#c-timer").children].forEach((x) => x.classList.remove("on")); b.classList.add("on"); cTimer = +b.dataset.t;
  });
  $("#c-imgurl").addEventListener("input", (e) => { cImg = e.target.value.trim(); preview(cImg); });
  $("#c-imgfile").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { preview(r.result); $("#c-imgurl").value = ""; cImg = ""; /* no se incrusta en el enlace; solo vista previa local */ }; r.readAsDataURL(f);
  });
  function preview(src) { const im = $("#c-imgprev"); if (src) { im.src = src; im.classList.remove("hidden"); } else im.classList.add("hidden"); }
  $("#c-back").addEventListener("click", () => { location.hash = ""; show("home"); });
  $("#c-generate").addEventListener("click", () => {
    const loc = cMarker && cMarker._loc; if (!loc) return;
    const ch = { t: $("#c-title").value.trim() || "¿Dónde estoy? 🌍", la: +loc.lat.toFixed(5), ln: +loc.lng.toFixed(5), ti: cTimer, im: /^https?:\/\//.test(cImg) ? cImg : "" };
    const link = location.origin + location.pathname + "#c=" + enc(ch);
    $("#c-link").value = link; $("#c-open").href = link;
    $("#c-result").classList.remove("hidden");
    $("#c-result").scrollIntoView({ behavior: "smooth" });
  });
  $("#c-copy").addEventListener("click", () => copy($("#c-link").value, $("#c-copy")));

  // ---------- JUGAR ----------
  let pMap, guess, gMarker, answer, countdown, revealed;
  function startPlay(ch) {
    show("play");
    answer = { lat: ch.la, lng: ch.ln }; guess = null; revealed = false;
    $("#p-title").textContent = ch.t || "Adivina dónde está";
    // foto
    const ph = $("#p-photo");
    if (ch.im) ph.innerHTML = '<img class="photo" src="' + ch.im.replace(/"/g, "&quot;") + '" alt="foto del reto" />';
    else resetDrop();
    // mapa
    if (!pMap) {
      pMap = L.map("map-play", { worldCopyJump: true }).setView([20, 0], 2);
      L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(pMap);
      pMap.on("click", (e) => { if (revealed) return; placeGuess(e.latlng.lat, e.latlng.lng); });
    } else { if (gMarker) { pMap.removeLayer(gMarker); gMarker = null; } pMap.eachLayer((l) => { if (l instanceof L.Polyline && !(l instanceof L.Polygon)) pMap.removeLayer(l); }); pMap.setView([20, 0], 2); }
    setTimeout(() => pMap.invalidateSize(), 60);
    $("#p-confirm").disabled = true; $("#p-confirm").textContent = "Confirmar mi apuesta";
    $("#p-result").classList.add("hidden"); $("#p-hint").classList.remove("hidden");
    // temporizador
    clearInterval(countdown);
    if (ch.ti > 0) { startTimer(ch.ti); } else $("#p-timer").classList.add("hidden");
  }
  function resetDrop() {
    $("#p-photo").innerHTML = '<div class="photo-drop" id="p-drop"><p>📷 ¿Te han pasado la foto?</p><label class="btn btn-sm" for="p-imgfile">Subir la foto</label><input id="p-imgfile" type="file" accept="image/*" hidden /><span class="or">o búscala en tu chat</span></div>';
    $("#p-imgfile").addEventListener("change", (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $("#p-photo").innerHTML = '<img class="photo" src="' + r.result + '" alt="foto" />'; }; r.readAsDataURL(f); });
  }
  function placeGuess(lat, lng) {
    guess = { lat, lng };
    if (!gMarker) { gMarker = L.marker([lat, lng], { draggable: true, icon: pinIcon("❓", "guess") }).addTo(pMap);
      gMarker.on("dragend", () => { if (revealed) return; const p = gMarker.getLatLng(); guess = { lat: p.lat, lng: p.lng }; }); }
    else gMarker.setLatLng([lat, lng]);
    $("#p-confirm").disabled = false;
  }
  function startTimer(secs) {
    const box = $("#p-timer"), out = $("#p-time"); box.classList.remove("hidden");
    let left = secs; out.textContent = left + "s";
    countdown = setInterval(() => {
      left--; out.textContent = left + "s"; box.classList.toggle("warn", left <= 10);
      if (left <= 0) { clearInterval(countdown); reveal(true); }
    }, 1000);
  }
  $("#p-confirm").addEventListener("click", () => reveal(false));
  function reveal(timeout) {
    if (revealed) return; revealed = true; clearInterval(countdown);
    $("#p-timer").classList.add("hidden"); $("#p-hint").classList.add("hidden");
    L.marker([answer.lat, answer.lng], { icon: pinIcon("🎯", "answer") }).addTo(pMap).bindPopup("Aquí estaba").openPopup();
    let km = null, score = 0;
    if (guess) {
      km = haversine(guess, answer); score = scoreFor(km);
      L.polyline([[guess.lat, guess.lng], [answer.lat, answer.lng]], { color: "#e6332a", weight: 3, dashArray: "6 6" }).addTo(pMap);
      pMap.fitBounds(L.latLngBounds([[guess.lat, guess.lng], [answer.lat, answer.lng]]).pad(0.4));
    } else { pMap.setView([answer.lat, answer.lng], 5); }
    $("#r-score").textContent = score;
    $("#r-dist").textContent = km == null ? (timeout ? "no diste a tiempo 😅" : "—") : fmtDist(km);
    const title = $("#p-title").textContent;
    const share = km == null ? "🌍 LocationGuesser — " + title + ": me quedé sin tiempo 😅. ¿Tú puedes? " + location.href
      : "🌍 LocationGuesser — " + title + ": a " + fmtDist(km) + " · " + score + " pts. ¿Me ganas? " + location.href;
    $("#r-share").value = share;
    $("#p-result").classList.remove("hidden");
    $("#p-confirm").disabled = true; $("#p-confirm").textContent = timeout ? "¡Se acabó el tiempo!" : "Apuesta confirmada";
    $("#p-result").scrollIntoView({ behavior: "smooth" });
  }
  $("#r-copy").addEventListener("click", () => copy($("#r-share").value, $("#r-copy")));
  $("#r-again").addEventListener("click", () => { location.hash = ""; show("create"); initCreate(); });

  // arranque
  route();
})();
