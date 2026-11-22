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
