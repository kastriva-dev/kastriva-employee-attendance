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
    radiusMeters: Number.isFinite(radius) && radius >= 30 ? radius : DEFAULT_OFFICE_RADIUS_METERS,
    allowAnyLocation: String(values.office_allow_any_location || "FALSE").toUpperCase() === "TRUE"
  };
}

function updateOfficeSettings_(actor, payload) {
  const allowAnyLocation = payload.allowAnyLocation === true;
  const hasLatitude = payload.latitude !== null && payload.latitude !== undefined && String(payload.latitude).trim() !== "";
  const hasLongitude = payload.longitude !== null && payload.longitude !== undefined && String(payload.longitude).trim() !== "";
  const lat = hasLatitude ? Number(payload.latitude) : NaN;
  const lng = hasLongitude ? Number(payload.longitude) : NaN;
  const radius = Number(payload.radiusMeters || DEFAULT_OFFICE_RADIUS_METERS);
  if (hasLatitude !== hasLongitude) throw new Error("Latitude dan longitude kantor harus diisi berpasangan.");
  if (hasLatitude && (!Number.isFinite(lat) || lat < -90 || lat > 90)) throw new Error("Latitude kantor tidak valid.");
  if (hasLongitude && (!Number.isFinite(lng) || lng < -180 || lng > 180)) throw new Error("Longitude kantor tidak valid.");
  if (!allowAnyLocation && (!hasLatitude || !hasLongitude)) throw new Error("Koordinat kantor wajib diisi jika mode bebas lokasi dimatikan.");
  if (!Number.isInteger(radius) || radius < 30 || radius > 1000) throw new Error("Radius kantor harus 30–1.000 meter.");
  if (hasLatitude && hasLongitude) {
    setSetting_("office_latitude", String(lat));
    setSetting_("office_longitude", String(lng));
  }
  setSetting_("office_radius_meters", String(radius));
  setSetting_("office_allow_any_location", allowAnyLocation ? "TRUE" : "FALSE");
  log_("office.geofence.updated", actor.nik, "Office coordinates/radius updated; allowAnyLocation=" + allowAnyLocation);
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
    return !r.archived_at && String(r.employee_id) === String(user.employee_id) && attendanceDateKey_(r.tanggal) === today;
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
      return !r.archived_at && String(r.employee_id) === String(user.employee_id) && attendanceDateKey_(r.tanggal) === today;
    });
    if (existing) throw new Error("Absensi masuk hari ini sudah tercatat.");
    const now = new Date();
    const item = {
      attendance_id: "ATT-" + Utilities.getUuid().slice(0, 8).toUpperCase(),
      employee_id: user.employee_id, nik: user.nik, nama: user.nama,
      tanggal: today, jam_masuk: now, foto_masuk: saveAttendancePhoto_(payload.photoData, user, "masuk", now, location),
      lat_masuk: location.latitude, lng_masuk: location.longitude,
      accuracy_masuk: location.accuracy, status: "HADIR", created_at: now
    };
    appendObject_(sh, item);
    log_("attendance.check_in", user.nik, "GPS check-in accepted; distance " + (location.distance === null ? "unrestricted" : Math.round(location.distance) + "m"));
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
      return String(r.employee_id) === String(user.employee_id) && attendanceDateKey_(r.tanggal) === today;
    });
    if (!existing || !existing.jam_masuk) throw new Error("Belum ada absensi masuk hari ini.");
    if (existing.jam_pulang) throw new Error("Absensi pulang hari ini sudah tercatat.");
    const now = new Date();
    const photoId = saveAttendancePhoto_(payload.photoData, user, "pulang", now, location);
    const map = headerMap_(sh);
    sh.getRange(existing._row, map.foto_pulang).setValue(photoId);
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
  const hasOfficePoint = office.configured;
  const distance = hasOfficePoint ? haversineMeters_(lat, lng, office.latitude, office.longitude) : null;
  if (!office.allowAnyLocation && !hasOfficePoint) throw new Error("Lokasi kantor belum diatur administrator.");
  if (!office.allowAnyLocation && distance > office.radiusMeters) {
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

function attendanceDateKey_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, ATTENDANCE_TIMEZONE, "yyyy-MM-dd");
  }
  return String(value || "").trim();
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

/** Return persisted attendance history. Employees are restricted to their own records. */
function listAttendanceHistory_(user, payload) {
  const from = String(payload.from || "").trim();
  const to = String(payload.to || "").trim();
  const employeeId = String(payload.employee_id || "").trim();
  if (from && !/^\\d{4}-\\d{2}-\\d{2}$/.test(from)) throw new Error("Tanggal awal tidak valid.");
  if (to && !/^\\d{4}-\\d{2}-\\d{2}$/.test(to)) throw new Error("Tanggal akhir tidak valid.");
  if (from && to && from > to) throw new Error("Rentang tanggal tidak valid.");
  const isAdmin = user.role === "admin";
  const rows = readObjects_(sheet_("Attendance")).filter(function(r) {
    const date = attendanceDateKey_(r.tanggal);
    if (r.archived_at) return false;
    if (!isAdmin && String(r.employee_id) !== String(user.employee_id)) return false;
    if (isAdmin && employeeId && String(r.employee_id) !== employeeId) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
  rows.sort(function(a, b) {
    const da = attendanceDateKey_(a.tanggal) + " " + String(a.jam_masuk || a.created_at || "");
    const db = attendanceDateKey_(b.tanggal) + " " + String(b.jam_masuk || b.created_at || "");
    return db.localeCompare(da);
  });
  const total = rows.length;
  const limit = Math.min(200, Math.max(1, Number(payload.limit) || 100));
  const offset = Math.max(0, Number(payload.offset) || 0);
  return {
    total: total,
    limit: limit,
    offset: offset,
    records: rows.slice(offset, offset + limit).map(function(r) {
      return {
        attendance_id: String(r.attendance_id || ""),
        employee_id: String(r.employee_id || ""),
        nama: String(r.nama || ""),
        nik: String(r.nik || ""),
        tanggal: attendanceDateKey_(r.tanggal),
        jam_masuk: r.jam_masuk || "",
        jam_pulang: r.jam_pulang || "",
        status: String(r.status || "")
      };
    })
  };
}


/** Preview records that match a requested archive period. No data is modified. */
function previewAttendanceArchive_(admin, payload) {
  const from = String(payload.from || "").trim();
  const to = String(payload.to || "").trim();
  const employeeId = String(payload.employee_id || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("Tanggal awal dan akhir wajib diisi.");
  }
  if (from > to) throw new Error("Tanggal awal tidak boleh melewati tanggal akhir.");
  const rows = readObjects_(sheet_("Attendance")).filter(function(r) {
    const date = attendanceDateKey_(r.tanggal);
    return !r.archived_at && date >= from && date <= to &&
      (!employeeId || String(r.employee_id) === employeeId);
  });
  return { count: rows.length, from: from, to: to, employee_id: employeeId || "ALL" };
}

/** Soft archive matching records. Original attendance rows and photo references are preserved. */
function archiveAttendanceRecords_(admin, payload) {
  const preview = previewAttendanceArchive_(admin, payload);
  if (!preview.count) return { archived: 0, from: preview.from, to: preview.to };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_("Attendance");
    const headers = ["archived_at", "archived_by_employee_id", "archived_by_name", "archived_by_nik"];
    ensureHeaders_(sh, headers);
    const map = headerMap_(sh);
    const now = new Date();
    const rows = readObjects_(sh).filter(function(r) {
      const date = attendanceDateKey_(r.tanggal);
      return !r.archived_at && date >= preview.from && date <= preview.to &&
        (preview.employee_id === "ALL" || String(r.employee_id) === preview.employee_id);
    });
    rows.forEach(function(r) {
      sh.getRange(r._row, map.archived_at).setValue(now);
      sh.getRange(r._row, map.archived_by_employee_id).setValue(admin.employee_id);
      sh.getRange(r._row, map.archived_by_name).setValue(admin.nama);
      sh.getRange(r._row, map.archived_by_nik).setValue(admin.nik);
    });
    log_("attendance.records_archived", admin.nik,
      "Archived " + rows.length + " attendance records from " + preview.from + " to " + preview.to,
      {before_value:{count:rows.length,from:preview.from,to:preview.to,employee_id:preview.employee_id},
       after_value:{archived_count:rows.length,archived_at:now.toISOString()}});
    return { archived: rows.length, from: preview.from, to: preview.to };
  } finally {
    lock.releaseLock();
  }
}
