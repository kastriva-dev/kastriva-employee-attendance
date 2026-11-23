/** Kastriva Employee Attendance — GAS backend.
 * Required Script Properties:
 * APP_SHARED_SECRET, PIN_PEPPER.
 * To create the first administrator, temporarily add INITIAL_ADMIN_NIK,
 * INITIAL_ADMIN_NAME, INITIAL_ADMIN_PIN, then run createFirstAdmin().
 */
const APP_NAME = "Kastriva Employee Attendance";
const SHEET_NAMES = ["Employees", "Attendance", "Settings", "Logs", "Sessions"];
const SESSION_HOURS = 12;

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expected = PropertiesService.getScriptProperties().getProperty("APP_SHARED_SECRET");
    if (!expected || !body.secret || !constantTimeEquals_(String(body.secret), String(expected))) {
      return json_({ ok: false, error: "Unauthorized" });
    }
    const payload = body.payload || {};
    let data;
    switch (String(body.action || "")) {
      case "ping":
        data = { service: APP_NAME, status: "online" };
        break;
      case "initialize":
        data = setupSystem();
        break;
      case "auth.login":
        data = login_(payload);
        break;
      case "auth.me":
        data = { user: requireSession_(body.sessionToken) };
        break;
      case "auth.logout":
        data = logout_(body.sessionToken);
        break;
      case "employees.list":
        requireAdmin_(body.sessionToken);
        data = { employees: listEmployees_() };
        break;
      case "dashboard.summary":
        requireAdmin_(body.sessionToken);
        data = dashboardSummary_();
        break;
      case "dashboard.monthly":
        requireAdmin_(body.sessionToken);
        data = dashboardMonthlySummary_(payload);
        break;
      case "employees.create":
        requireAdmin_(body.sessionToken);
        data = { employee: createEmployee_(payload) };
        break;
      case "employees.setStatus":
        requireAdmin_(body.sessionToken);
        data = setEmployeeStatus_(payload);
        break;
      case "employees.update":
        data = updateEmployee_(requireAdmin_(body.sessionToken), payload);
        break;
      case "employees.delete":
        data = deleteEmployee_(requireAdmin_(body.sessionToken), payload);
        break;
      case "attendance.today":
        data = getTodayAttendance_(requireSession_(body.sessionToken));
        break;
      case "attendance.list":
        data = listAttendanceHistory_(requireSession_(body.sessionToken), payload);
        break;
      case "attendance.export":
        data = exportAttendanceRecords_(requireSession_(body.sessionToken), payload);
        break;
      case "settings.photoRetention.get":
        data = getPhotoRetentionSettings_(requireAdmin_(body.sessionToken));
        break;
      case "settings.photoRetention.update":
        data = updatePhotoRetentionSettings_(requireAdmin_(body.sessionToken), payload);
        break;
      case "attendance.photo":
        data = getAttendancePhoto_(requireAdmin_(body.sessionToken), payload);
        break;
      case "leaves.list":
        data = listLeaveRequests_(requireSession_(body.sessionToken), payload);
        break;
      case "leaves.create":
        data = createLeaveRequest_(requireSession_(body.sessionToken), payload);
        break;
      case "leaves.review":
        data = reviewLeaveRequest_(requireAdmin_(body.sessionToken), payload);
        break;
      case "attendance.checkIn":
        data = checkIn_(requireSession_(body.sessionToken), payload);
        break;
      case "attendance.checkOut":
        data = checkOut_(requireSession_(body.sessionToken), payload);
        break;
      case "settings.office.update":
        data = updateOfficeSettings_(requireAdmin_(body.sessionToken), payload);
        break;
      default:
        return json_({ ok: false, error: "Unknown action" });
    }
    return json_({ ok: true, action: body.action, data: data, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: safeError_(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: APP_NAME, message: "API ready. Use POST through Vercel proxy.", timestamp: new Date().toISOString() });
}

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Buka Apps Script dari Extensions > Apps Script pada Spreadsheet.");
  const props = PropertiesService.getScriptProperties();
  props.setProperty("SPREADSHEET_ID", ss.getId());
  if (!props.getProperty("PIN_PEPPER")) props.setProperty("PIN_PEPPER", Utilities.getUuid() + Utilities.getUuid());

  const schemas = {
    Employees: ["employee_id", "nik", "nama", "jabatan", "role", "pin_salt", "pin_hash", "status", "created_at", "last_login"],
    Attendance: ["attendance_id", "employee_id", "nik", "nama", "tanggal", "jam_masuk", "foto_masuk", "lat_masuk", "lng_masuk", "accuracy_masuk", "jam_pulang", "foto_pulang", "lat_pulang", "lng_pulang", "accuracy_pulang", "status", "created_at"],
    Settings: ["key", "value", "updated_at"],
    Logs: ["log_id", "event", "actor", "detail", "created_at"],
    Sessions: ["session_id", "employee_id", "token_hash", "expires_at", "created_at", "revoked_at"]
  };
  Object.keys(schemas).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    ensureHeaders_(sh, schemas[name]);
  });
  const settings = ss.getSheetByName("Settings");
  if (settings.getLastRow() === 1) {
    settings.getRange(2, 1, 4, 3).setValues([
      ["photo_retention_days", "14", new Date()],
      ["delete_photos_only", "TRUE", new Date()],
      ["office_latitude", "", new Date()],
      ["office_longitude", "", new Date()]
    ]);
  }
  return { spreadsheetId: ss.getId(), sheets: SHEET_NAMES, initialized: true };
}

/** Run manually once after setupSystem(). Add INITIAL_ADMIN_NIK, INITIAL_ADMIN_NAME,
 * INITIAL_ADMIN_PIN in Script Properties first. The temporary PIN property is deleted.
 */
function createFirstAdmin() {
  const props = PropertiesService.getScriptProperties();
  const nik = String(props.getProperty("INITIAL_ADMIN_NIK") || "").trim();
  const name = String(props.getProperty("INITIAL_ADMIN_NAME") || "").trim();
  const pin = String(props.getProperty("INITIAL_ADMIN_PIN") || "").trim();
  if (!nik || !name || !/^\d{6,12}$/.test(pin)) throw new Error("Isi INITIAL_ADMIN_NIK, INITIAL_ADMIN_NAME, dan INITIAL_ADMIN_PIN (6–12 digit) di Script Properties.");
  const sh = sheet_("Employees");
  const rows = readObjects_(sh);
  if (rows.some(function(r) { return r.role === "admin"; })) throw new Error("Admin sudah ada. Gunakan menu pengelolaan karyawan.");
  const employee = addEmployee_(sh, { nik: nik, nama: name, jabatan: "Administrator", role: "admin", pin: pin, status: "ACTIVE" });
  props.deleteProperty("INITIAL_ADMIN_PIN");
  props.deleteProperty("INITIAL_ADMIN_NIK");
  props.deleteProperty("INITIAL_ADMIN_NAME");
  log_("admin.bootstrap", nik, "First administrator created");
  return { created: true, nik: employee.nik, message: "Admin pertama berhasil dibuat. Properti PIN sementara telah dihapus." };
}

function login_(payload) {
  const nik = String(payload.nik || "").trim();
  const pin = String(payload.pin || "").trim();
  if (!nik || !/^\d{6,12}$/.test(pin)) throw new Error("NIK atau PIN tidak valid.");
  const sh = sheet_("Employees");
  const rows = readObjects_(sh);
  const user = rows.find(function(r) { return String(r.nik) === nik; });
  if (!user || String(user.status).toUpperCase() !== "ACTIVE") throw new Error("NIK/PIN salah atau akun tidak aktif.");
  const expected = hashPin_(pin, String(user.pin_salt || ""));
  if (!constantTimeEquals_(expected, String(user.pin_hash || ""))) throw new Error("NIK/PIN salah atau akun tidak aktif.");
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  const session = sheet_("Sessions");
  session.appendRow([Utilities.getUuid(), user.employee_id, sha256_(token), expires, now, ""]);
  const header = headerMap_(sh);
  sh.getRange(user._row, header.last_login).setValue(now);
  log_("auth.login", nik, "Login successful");
  return { sessionToken: token, expiresAt: expires.toISOString(), user: publicUser_(user) };
}

function requireSession_(token) {
  if (!token) throw new Error("Sesi tidak ditemukan. Silakan login kembali.");
  const hash = sha256_(String(token));
  const sh = sheet_("Sessions");
  const sessions = readObjects_(sh);
  const now = new Date();
  const active = sessions.find(function(s) {
    return String(s.token_hash) === hash && !s.revoked_at && new Date(s.expires_at).getTime() > now.getTime();
  });
  if (!active) throw new Error("Sesi berakhir atau tidak valid. Silakan login kembali.");
  const employees = readObjects_(sheet_("Employees"));
  const user = employees.find(function(u) { return String(u.employee_id) === String(active.employee_id); });
  if (!user || String(user.status).toUpperCase() !== "ACTIVE") throw new Error("Akun tidak aktif.");
  return publicUser_(user);
}

function requireAdmin_(token) {
  const user = requireSession_(token);
  if (user.role !== "admin") throw new Error("Akses khusus administrator.");
  return user;
}

function logout_(token) {
  if (!token) return { loggedOut: true };
  const sh = sheet_("Sessions");
  const rows = readObjects_(sh);
  const hash = sha256_(String(token));
  const match = rows.find(function(r) { return String(r.token_hash) === hash && !r.revoked_at; });
  if (match) sh.getRange(match._row, headerMap_(sh).revoked_at).setValue(new Date());
  return { loggedOut: true };
}

function listEmployees_() {
  return readObjects_(sheet_("Employees")).map(function(r) {
    return { employee_id: r.employee_id, nik: r.nik, nama: r.nama, jabatan: r.jabatan, role: r.role, status: r.status, created_at: r.created_at, last_login: r.last_login };
  });
}

function createEmployee_(payload) {
  const nik = String(payload.nik || "").trim();
  const nama = String(payload.nama || "").trim();
  const pin = String(payload.pin || "").trim();
  const jabatan = String(payload.jabatan || "").trim();
  const role = String(payload.role || "employee").toLowerCase();
  if (!/^\d{6,20}$/.test(nik)) throw new Error("NIK harus 6–20 digit.");
  if (!nama || nama.length > 100) throw new Error("Nama wajib diisi (maksimal 100 karakter).");
  if (!/^\d{6,12}$/.test(pin)) throw new Error("PIN harus 6–12 digit.");
  if (["admin", "employee"].indexOf(role) < 0) throw new Error("Role tidak valid.");
  const sh = sheet_("Employees");
  if (readObjects_(sh).some(function(r) { return String(r.nik) === nik; })) throw new Error("NIK sudah terdaftar.");
  return addEmployee_(sh, { nik: nik, nama: nama, jabatan: jabatan, role: role, pin: pin, status: "ACTIVE" });
}

function addEmployee_(sh, input) {
  const salt = Utilities.getUuid().replace(/-/g, "");
  const now = new Date();
  const item = {
    employee_id: "EMP-" + Utilities.getUuid().slice(0, 8).toUpperCase(),
    nik: input.nik, nama: input.nama, jabatan: input.jabatan || "",
    role: input.role || "employee", pin_salt: salt,
    pin_hash: hashPin_(input.pin, salt), status: input.status || "ACTIVE",
    created_at: now, last_login: ""
  };
  const map = headerMap_(sh);
  const row = new Array(sh.getLastColumn()).fill("");
  Object.keys(item).forEach(function(k) { if (map[k]) row[map[k] - 1] = item[k]; });
  sh.appendRow(row);
  return { employee_id: item.employee_id, nik: item.nik, nama: item.nama, jabatan: item.jabatan, role: item.role, status: item.status };
}

function setEmployeeStatus_(payload) {
  const id = String(payload.employee_id || "").trim();
  const status = String(payload.status || "").toUpperCase();
  if (!id || ["ACTIVE", "INACTIVE"].indexOf(status) < 0) throw new Error("Parameter status tidak valid.");
  const sh = sheet_("Employees");
  const user = readObjects_(sh).find(function(r) { return String(r.employee_id) === id; });
  if (!user) throw new Error("Karyawan tidak ditemukan.");
  if (user.role === "admin" && status === "INACTIVE") {
    const admins = readObjects_(sh).filter(function(r) { return r.role === "admin" && String(r.status).toUpperCase() === "ACTIVE"; });
    if (admins.length <= 1) throw new Error("Tidak dapat menonaktifkan satu-satunya admin aktif.");
  }
  sh.getRange(user._row, headerMap_(sh).status).setValue(status);
  return { updated: true, employee_id: id, status: status };
}

/** Update employee profile; PIN is optional and is re-hashed when supplied. */
function updateEmployee_(admin, payload) {
  const id = String(payload.employee_id || "").trim();
  const nik = String(payload.nik || "").trim();
  const nama = String(payload.nama || "").trim();
  const jabatan = String(payload.jabatan || "").trim();
  const role = String(payload.role || "employee").toLowerCase();
  const pin = String(payload.pin || "").trim();
  if (!id) throw new Error("ID karyawan tidak valid.");
  if (!/^\d{6,20}$/.test(nik)) throw new Error("NIK harus 6–20 digit.");
  if (!nama || nama.length > 100) throw new Error("Nama wajib diisi (maksimal 100 karakter).");
  if (["admin", "employee"].indexOf(role) < 0) throw new Error("Role tidak valid.");
  if (pin && !/^\d{6,12}$/.test(pin)) throw new Error("PIN baru harus 6–12 digit.");
  const sh = sheet_("Employees"), rows = readObjects_(sh);
  const user = rows.find(function(r) { return String(r.employee_id) === id; });
  if (!user) throw new Error("Karyawan tidak ditemukan.");
  if (rows.some(function(r) { return String(r.nik) === nik && String(r.employee_id) !== id; })) throw new Error("NIK sudah digunakan karyawan lain.");
  if (String(user.status).toUpperCase() === "DELETED") throw new Error("Akun yang diarsipkan harus dipulihkan sebelum diedit.");
  if (String(user.status).toUpperCase() === "ACTIVE" && user.role === "admin" && role !== "admin") {
    const admins = rows.filter(function(r) { return r.role === "admin" && String(r.status).toUpperCase() === "ACTIVE"; });
    if (admins.length <= 1) throw new Error("Tidak dapat mengubah role satu-satunya admin aktif.");
  }
  const map = headerMap_(sh);
  sh.getRange(user._row, map.nik).setValue(nik);
  sh.getRange(user._row, map.nama).setValue(nama);
  sh.getRange(user._row, map.jabatan).setValue(jabatan);
  sh.getRange(user._row, map.role).setValue(role);
  if (pin) {
    const salt = Utilities.getUuid().replace(/-/g, "");
    sh.getRange(user._row, map.pin_salt).setValue(salt);
    sh.getRange(user._row, map.pin_hash).setValue(hashPin_(pin, salt));
  }
  log_("employees.updated", admin.nik, "Updated employee " + id + (pin ? " with PIN reset" : ""));
  return { updated: true, employee_id: id };
}

/** Archive employee rather than deleting the row, preserving attendance history. */
function deleteEmployee_(admin, payload) {
  const id = String(payload.employee_id || "").trim();
  if (!id) throw new Error("ID karyawan tidak valid.");
  if (id === String(admin.employee_id)) throw new Error("Anda tidak dapat mengarsipkan akun yang sedang digunakan.");
  const sh = sheet_("Employees"), rows = readObjects_(sh);
  const user = rows.find(function(r) { return String(r.employee_id) === id; });
  if (!user) throw new Error("Karyawan tidak ditemukan.");
  if (String(user.status).toUpperCase() === "DELETED") throw new Error("Akun sudah diarsipkan.");
  if (user.role === "admin" && String(user.status).toUpperCase() === "ACTIVE") {
    const admins = rows.filter(function(r) { return r.role === "admin" && String(r.status).toUpperCase() === "ACTIVE"; });
    if (admins.length <= 1) throw new Error("Tidak dapat mengarsipkan satu-satunya admin aktif.");
  }
  const map = headerMap_(sh);
  sh.getRange(user._row, map.status).setValue("DELETED");
  const sessions = readObjects_(sheet_("Sessions"));
  const sessionMap = headerMap_(sheet_("Sessions"));
  sessions.filter(function(s) { return String(s.employee_id) === id && !s.revoked_at; }).forEach(function(s) {
    sheet_("Sessions").getRange(s._row, sessionMap.revoked_at).setValue(new Date());
  });
  log_("employees.archived", admin.nik, "Archived employee " + id);
  return { deleted: true, archived: true, employee_id: id };
}

function ensureHeaders_(sh, expected) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, expected.length).setValues([expected]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, expected.length).setBackground("#173653").setFontColor("#fff").setFontWeight("bold");
    return;
  }
  const existing = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  const missing = expected.filter(function(h) { return existing.indexOf(h) < 0; });
  if (missing.length) sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
}

function sheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Spreadsheet belum diinisialisasi. Jalankan setupSystem().");
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error("Sheet " + name + " belum ada. Jalankan setupSystem().");
  return sh;
}

function headerMap_(sh) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const map = {};
  headers.forEach(function(h, i) { if (h) map[h] = i + 1; });
  return map;
}

function readObjects_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function(row, index) {
    const obj = { _row: index + 2 };
    headers.forEach(function(h, i) { if (h) obj[h] = row[i]; });
    return obj;
  });
}

function publicUser_(user) {
  return { employee_id: user.employee_id, nik: user.nik, nama: user.nama, jabatan: user.jabatan, role: user.role, status: user.status };
}

function hashPin_(pin, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty("PIN_PEPPER");
  if (!pepper) throw new Error("PIN_PEPPER belum dibuat. Jalankan setupSystem().");
  return sha256_(salt + ":" + pin + ":" + pepper);
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { const v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? "0" + v : v; }).join("");
}

function log_(event, actor, detail) {
  try { sheet_("Logs").appendRow([Utilities.getUuid(), event, actor, detail, new Date()]); } catch (e) { console.warn(e); }
}

function safeError_(err) {
  const message = String(err && err.message || "Internal GAS error");
  return message.length > 180 ? message.slice(0, 180) : message;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function constantTimeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


/** Live dashboard metrics sourced directly from Employees and Attendance sheets. */
function dashboardSummary_() {
  const today = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
  const employees = readObjects_(sheet_("Employees"));
  const attendance = readObjects_(sheet_("Attendance")).filter(function(r) {
    return attendanceDateKey_(r.tanggal) === today;
  });
  const activeEmployees = employees.filter(function(r) {
    return String(r.status).toUpperCase() === "ACTIVE";
  });
  const byEmployee = {};
  attendance.forEach(function(r) { byEmployee[String(r.employee_id)] = r; });
  const present = attendance.filter(function(r) {
    return String(r.status).toUpperCase() === "HADIR" || Boolean(r.jam_masuk);
  }).length;
  const recent = attendance.slice().sort(function(a, b) {
    return new Date(b.jam_masuk || b.created_at || 0).getTime() - new Date(a.jam_masuk || a.created_at || 0).getTime();
  }).slice(0, 8).map(function(r) {
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
  });
  return {
    date: today,
    totalEmployees: employees.length,
    activeEmployees: activeEmployees.length,
    inactiveEmployees: employees.length - activeEmployees.length,
    present: present,
    notYetPresent: Math.max(0, activeEmployees.length - present),
    attendanceCount: attendance.length,
    recentAttendance: recent
  };
}


/** Monthly dashboard metrics. Read-only: never creates sheets or modifies production rows. */
function dashboardMonthlySummary_(payload) {
  const timezone = "Asia/Jakarta";
  const now = new Date();
  const currentMonth = Utilities.formatDate(now, timezone, "yyyy-MM");
  const month = String(payload.month || currentMonth).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Periode bulan tidak valid.");
  const parts = month.split("-").map(Number);
  const year = parts[0], monthNumber = parts[1];
  if (monthNumber < 1 || monthNumber > 12 || year < 2000 || year > 2100) throw new Error("Periode bulan tidak valid.");
  const monthStart = month + "-01";
  const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonth = Utilities.formatDate(nextMonthDate, "UTC", "yyyy-MM-dd");
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const employees = readObjects_(sheet_("Employees"));
  const activeEmployees = employees.filter(function(r) { return String(r.status).toUpperCase() === "ACTIVE"; });
  const rows = readObjects_(sheet_("Attendance")).filter(function(r) {
    const date = attendanceDateKey_(r.tanggal);
    return date >= monthStart && date < nextMonth;
  });
  const daily = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const key = month + "-" + (day < 10 ? "0" : "") + day;
    daily[key] = { date: key, present: 0, checkOut: 0, records: 0 };
  }
  let present = 0, checkOut = 0;
  const statusCounts = {};
  rows.forEach(function(r) {
    const date = attendanceDateKey_(r.tanggal);
    if (!daily[date]) return;
    const status = String(r.status || "TANPA STATUS").toUpperCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    daily[date].records++;
    if (r.jam_masuk || status === "HADIR") { present++; daily[date].present++; }
    if (r.jam_pulang) { checkOut++; daily[date].checkOut++; }
  });
  let leaveSummary = { total: 0, pending: 0, approved: 0, rejected: 0 };
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
  const leavesSheet = ss ? ss.getSheetByName("Leaves") : null;
  if (leavesSheet && leavesSheet.getLastRow() > 1) {
    readObjects_(leavesSheet).forEach(function(r) {
      const start = String(r.tanggal_mulai || "");
      const end = String(r.tanggal_selesai || start);
      if (!start || !end || end < monthStart || start >= nextMonth) return;
      const status = String(r.status || "PENDING").toLowerCase();
      if (Object.prototype.hasOwnProperty.call(leaveSummary, status)) leaveSummary[status]++;
      leaveSummary.total++;
    });
  }
  return {
    month: month,
    daysInMonth: daysInMonth,
    totalEmployees: employees.length,
    activeEmployees: activeEmployees.length,
    inactiveEmployees: employees.length - activeEmployees.length,
    attendanceRecords: rows.length,
    present: present,
    checkOut: checkOut,
    statusCounts: statusCounts,
    leaveRequests: leaveSummary,
    dailyTrend: Object.keys(daily).sort().map(function(key) { return daily[key]; })
  };
}


/** Export all filtered attendance rows, with employee access constrained to self. */
function exportAttendanceRecords_(user, payload) {
  const from = String(payload.from || "").trim();
  const to = String(payload.to || "").trim();
  const employeeId = String(payload.employee_id || "").trim();
  const status = String(payload.status || "").trim().toUpperCase();
  if (from && !/^\\d{4}-\\d{2}-\\d{2}$/.test(from)) throw new Error("Tanggal awal tidak valid.");
  if (to && !/^\\d{4}-\\d{2}-\\d{2}$/.test(to)) throw new Error("Tanggal akhir tidak valid.");
  if (from && to && from > to) throw new Error("Rentang tanggal tidak valid.");
  const isAdmin = user.role === "admin";
  const rows = readObjects_(sheet_("Attendance")).filter(function(r) {
    const date = attendanceDateKey_(r.tanggal);
    if (!isAdmin && String(r.employee_id) !== String(user.employee_id)) return false;
    if (isAdmin && employeeId && String(r.employee_id) !== employeeId) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    if (status && String(r.status || "").toUpperCase() !== status) return false;
    return true;
  }).sort(function(a,b) {
    return (attendanceDateKey_(a.tanggal) + String(a.nama || "")).localeCompare(attendanceDateKey_(b.tanggal) + String(b.nama || ""));
  });
  return { exportedAt: new Date().toISOString(), total: rows.length, records: rows.map(function(r) {
    return {
      attendance_id: String(r.attendance_id || ""), employee_id: String(r.employee_id || ""),
      nama: String(r.nama || ""), nik: String(r.nik || ""), tanggal: attendanceDateKey_(r.tanggal),
      jam_masuk: r.jam_masuk || "", jam_pulang: r.jam_pulang || "", status: String(r.status || ""),
      latitude_masuk: r.lat_masuk || "", longitude_masuk: r.lng_masuk || "", akurasi_masuk: r.accuracy_masuk || "",
      latitude_pulang: r.lat_pulang || "", longitude_pulang: r.lng_pulang || "", akurasi_pulang: r.accuracy_pulang || ""
    };
  }) };
}
