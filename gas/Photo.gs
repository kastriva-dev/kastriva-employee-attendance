/**
 * Private selfie evidence storage in Google Drive.
 * Required Script Property: ATTENDANCE_PHOTO_FOLDER_ID.
 */
function saveAttendancePhoto_(dataUrl, user, phase, capturedAt, location) {
  const folderId = PropertiesService.getScriptProperties().getProperty("ATTENDANCE_PHOTO_FOLDER_ID");
  if (!folderId) throw new Error("Folder foto absensi belum dikonfigurasi administrator.");
  const value = String(dataUrl || "");
  const match = value.match(/^data:image\/(jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[2].length > 240000) throw new Error("Selfie wajib diambil dari kamera dan ukuran foto maksimal sekitar 180 KB.");
  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length || bytes.length > 180 * 1024) throw new Error("Ukuran selfie terlalu besar. Ambil ulang dengan kualitas kamera lebih rendah.");
  const folder = DriveApp.getFolderById(folderId);
  const stamp = Utilities.formatDate(capturedAt, ATTENDANCE_TIMEZONE, "yyyyMMdd-HHmmss");
  const name = "ATT-" + user.employee_id + "-" + phase + "-" + stamp + ".jpg";
  const blob = Utilities.newBlob(bytes, "image/jpeg", name);
  const file = folder.createFile(blob);
  file.setDescription("Bukti selfie absensi " + phase + " | " + user.nama + " | " +
    Utilities.formatDate(capturedAt, ATTENDANCE_TIMEZONE, "yyyy-MM-dd HH:mm:ss") +
    " WIB | GPS " + location.latitude + ", " + location.longitude +
    " | akurasi " + Math.round(location.accuracy) + " m");
  // File remains private; only the Drive folder's authorized users can access it.
  return file.getId();
}


/**
 * Admin-only photo retrieval. Drive IDs never leave the GAS backend.
 * Photos older than the configured retention window cannot be previewed.
 */
function getAttendancePhoto_(admin, payload) {
  if (!admin || admin.role !== "admin") throw new Error("Akses khusus administrator.");
  const attendanceId = String(payload.attendance_id || "").trim();
  const phase = String(payload.phase || "").toLowerCase();
  if (!attendanceId || !["masuk", "pulang"].includes(phase)) throw new Error("Permintaan foto tidak valid.");

  const sh = sheet_("Attendance");
  const record = readObjects_(sh).find(function(r) {
    return String(r.attendance_id || "") === attendanceId;
  });
  if (!record) throw new Error("Data absensi tidak ditemukan.");

  const settings = readObjects_(sheet_("Settings"));
  const retentionRow = settings.find(function(r) { return String(r.key) === "photo_retention_days"; });
  const retentionDays = Math.max(1, Math.min(14, Number(retentionRow && retentionRow.value) || 14));
  const dateKey = attendanceDateKey_(record.tanggal);
  const parts = dateKey.split("-");
  const recordDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const ageDays = Math.floor((new Date(new Date().toDateString()).getTime() - recordDate.getTime()) / 86400000);
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > retentionDays) {
    throw new Error("Foto sudah melewati masa retensi " + retentionDays + " hari.");
  }

  const fileId = String(phase === "masuk" ? record.foto_masuk || "" : record.foto_pulang || "");
  if (!fileId) throw new Error("Foto selfie " + phase + " belum tersedia.");
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  if (!bytes.length || bytes.length > 180 * 1024) throw new Error("Ukuran foto tidak sesuai batas penyimpanan.");
  const mime = blob.getContentType() || "image/jpeg";
  if (!/^image\\/(jpeg|jpg|png|webp)$/i.test(mime)) throw new Error("Format bukti foto tidak didukung.");
  return {
    attendance_id: attendanceId,
    phase: phase,
    mimeType: mime,
    dataUrl: "data:" + mime + ";base64," + Utilities.base64Encode(bytes),
    nama: String(record.nama || ""),
    nik: String(record.nik || ""),
    tanggal: dateKey,
    capturedAt: phase === "masuk" ? record.jam_masuk || "" : record.jam_pulang || ""
  };
}
