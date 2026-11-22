/**
 * GPS attendance and office geofence module.
 * Depends on shared helpers in Code.gs.
 */
const ATTENDANCE_TIMEZONE = "Asia/Jakarta";
const DEFAULT_OFFICE_RADIUS_METERS = 100;
const MAX_GPS_ACCURACY_METERS = 200;

function officeSettings_() {
  const rows = readObjects_(sheet_("Settings"));
  const values = {};
  rows.forEach(function(r) { values[String(r.key)] = String(r.value == null ? "" : r.value); });
  const lat = values.office_latitude === "" ? null : Number(values.office_latitude);
  const lng = values.office_longitude === "" ? null : Number(values.office_longitude);
  const radius = Number(values.office_radius_meters || DEFAULT_OFFICE_RADIUS_METERS);
  return {
    configured: Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180,
    latitude: lat,
    longitude: lng,
    radiusMeters: Number.isFinite(radius) && radius >= 30 ? radius : DEFAULT_OFFICE_RADIUS_METERS
  };
}

function updateOfficeSettings_(actor, payload) {
  const lat = Number(payload.latitude);
  const lng = Number(payload.longitude);
  const radius = Number(payload.radiusMeters || DEFAULT_OFFICE_RADIUS_METERS);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Latitude kantor tidak valid.");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Longitude kantor tidak valid.");
  if (!Number.isInteger(radius) || radius < 30 || radius > 1000) throw new Error("Radius kantor harus 30–1.000 meter.");
  setSetting_("office_latitude", String(lat));
  setSetting_("office_longitude", String(lng));
  setSetting_("office_radius_meters", String(radius));
  log_("office.geofence.updated", actor.nik, "Office coordinates and radius updated");
  return { office: officeSettings_(), saved: true };
}

function setSetting_(key, value) {
  const sh = sheet_("Settings");
  const rows = readObjects_(sh);
  const found = rows.find(function(r) { return String(r.key) === key; });
  const map = headerMap_(sh);
  if (found) {
    sh.getRange(found._row, map.value).setValue(value);
    if (map.updated_at) sh.getRange(found._row, map.updated_at).setValue(new Date());
  } else {
    sh.appendRow([key, value, new Date()]);
  }
}

function getTodayAttendance_(user) {
  const today = Utilities.formatDate(new Date(), ATTENDANCE_TIMEZONE, "yyyy-MM-dd");
  const rows = readObjects_(sheet_("Attendance"));
  const record = rows.find(function(r) {
    return String(r.employee_id) === String(user.employee_id) && String(r.tanggal) === today;
  }) || null;
  return { date: today, record: record ? publicAttendance_(record) : null, office: officeSettings_() };
}

function checkIn_(user, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const location = validateOfficeLocation_(payload);
    const today = Utilities.formatDate(new Date(), ATTENDANCE_TIMEZONE, "yyyy-MM-dd");
    const sh = sheet_("Attendance");
    const rows = readObjects_(sh);
    const existing = rows.find(function(r) {
      return String(r.employee_id) === String(user.employee_id) && String(r.tanggal) === today;
    });
    if (existing) throw new Error("Absensi masuk hari ini sudah tercatat.");
    const now = new Date();
    const item = {
      attendance_id: "ATT-" + Utilities.getUuid().slice(0, 8).toUpperCase(),
      employee_id: user.employee_id, nik: user.nik, nama: user.nama,
      tanggal: today, jam_masuk: now, foto_masuk: "",
      lat_masuk: location.latitude, lng_masuk: location.longitude,
      accuracy_masuk: location.accuracy, status: "HADIR", created_at: now
    };
    appendObject_(sh, item);
    log_("attendance.check_in", user.nik, "GPS check-in accepted; distance " + Math.round(location.distance) + "m");
    return { saved: true, record: publicAttendance_(item), distanceMeters: Math.round(location.distance) };
  } finally {
    lock.releaseLock();
  }
}

function checkOut_(user, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const location = validateOfficeLocation_(payload);
    const today = Utilities.formatDate(new Date(), ATTENDANCE_TIMEZONE, "yyyy-MM-dd");
    const sh = sheet_("Attendance");
    const rows = readObjects_(sh);
    const existing = rows.find(function(r) {
      return String(r.employee_id) === String(user.employee_id) && String(r.tanggal) === today;
    });
    if (!existing || !existing.jam_masuk) throw new Error("Belum ada absensi masuk hari ini.");
    if (existing.jam_pulang) throw new Error("Absensi pulang hari ini sudah tercatat.");
    const now = new Date();
    const map = headerMap_(sh);
    sh.getRange(existing._row, map.jam_pulang).setValue(now);
    sh.getRange(existing._row, map.lat_pulang).setValue(location.latitude);
    sh.getRange(existing._row, map.lng_pulang).setValue(location.longitude);
    sh.getRange(existing._row, map.accuracy_pulang).setValue(location.accuracy);
    sh.getRange(existing._row, map.status).setValue("HADIR");
    existing.jam_pulang = now;
    existing.lat_pulang = location.latitude;
    existing.lng_pulang = location.longitude;
    existing.accuracy_pulang = location.accuracy;
    log_("attendance.check_out", user.nik, "GPS check-out accepted; distance " + Math.round(location.distance) + "m");
    return { saved: true, record: publicAttendance_(existing), distanceMeters: Math.round(location.distance) };
  } finally {
    lock.releaseLock();
  }
}

function validateOfficeLocation_(payload) {
  const office = officeSettings_();
  if (!office.configured) throw new Error("Lokasi kantor belum diatur administrator.");
  const lat = Number(payload.latitude);
  const lng = Number(payload.longitude);
  const accuracy = Number(payload.accuracy);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("Koordinat GPS tidak valid. Aktifkan izin lokasi lalu coba lagi.");
  }
  if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > MAX_GPS_ACCURACY_METERS) {
    throw new Error("Akurasi GPS terlalu rendah. Coba di area terbuka dan ambil lokasi kembali.");
  }
  const distance = haversineMeters_(lat, lng, office.latitude, office.longitude);
  if (distance > office.radiusMeters) {
    throw new Error("Kamu berada di luar area kantor (" + Math.round(distance) + " m dari titik kantor).");
  }
  return { latitude: lat, longitude: lng, accuracy: accuracy, distance: distance };
}

function haversineMeters_(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function appendObject_(sh, item) {
  const map = headerMap_(sh);
  const row = new Array(sh.getLastColumn()).fill("");
  Object.keys(item).forEach(function(key) {
    if (map[key]) row[map[key] - 1] = item[key];
  });
  sh.appendRow(row);
}

function publicAttendance_(r) {
  return {
    attendance_id: r.attendance_id || "",
    tanggal: r.tanggal || "",
    jam_masuk: r.jam_masuk || "",
    jam_pulang: r.jam_pulang || "",
    status: r.status || ""
  };
}
