/**
 * Leave and permission requests. Creates only the additive Leaves sheet when needed.
 * Existing employee, attendance, settings, log and session data are untouched.
 */
const LEAVE_HEADERS = ["request_id","employee_id","nik","nama","jenis","tanggal_mulai","tanggal_selesai","alasan","status","catatan_admin","created_at","reviewed_at","reviewed_by"];

function leaveSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Spreadsheet tidak dapat diakses.");
  let sh = ss.getSheetByName("Leaves");
  if (!sh) {
    sh = ss.insertSheet("Leaves");
    ensureHeaders_(sh, LEAVE_HEADERS);
  } else {
    ensureHeaders_(sh, LEAVE_HEADERS);
  }
  return sh;
}

function validLeaveDate_(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = s.split("-").map(Number);
  const d = new Date(Date.UTC(p[0], p[1]-1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1]-1 && d.getUTCDate() === p[2];
}

function listLeaveRequests_(user, payload) {
  const sh = leaveSheet_();
  const from = String(payload.from || "").trim();
  const to = String(payload.to || "").trim();
  const status = String(payload.status || "").trim().toUpperCase();
  if (from && !validLeaveDate_(from)) throw new Error("Tanggal awal tidak valid.");
  if (to && !validLeaveDate_(to)) throw new Error("Tanggal akhir tidak valid.");
  if (from && to && from > to) throw new Error("Rentang tanggal tidak valid.");
  if (status && ["PENDING","APPROVED","REJECTED"].indexOf(status) < 0) throw new Error("Filter status tidak valid.");
  const admin = user.role === "admin";
  const rows = readObjects_(sh).filter(function(r) {
    if (!admin && String(r.employee_id) !== String(user.employee_id)) return false;
    if (admin && payload.employee_id && String(r.employee_id) !== String(payload.employee_id)) return false;
    if (status && String(r.status).toUpperCase() !== status) return false;
    const start = String(r.tanggal_mulai || "");
    const end = String(r.tanggal_selesai || start);
    if (from && end < from) return false;
    if (to && start > to) return false;
    return true;
  });
  rows.sort(function(a,b) { return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(); });
  const total = rows.length;
  const limit = Math.min(100, Math.max(1, Number(payload.limit) || 50));
  const offset = Math.max(0, Number(payload.offset) || 0);
  return {
    total: total, limit: limit, offset: offset,
    records: rows.slice(offset, offset+limit).map(function(r) {
      return {
        request_id:String(r.request_id || ""), employee_id:String(r.employee_id || ""),
        nik:String(r.nik || ""), nama:String(r.nama || ""), jenis:String(r.jenis || ""),
        tanggal_mulai:String(r.tanggal_mulai || ""), tanggal_selesai:String(r.tanggal_selesai || ""),
        alasan:String(r.alasan || ""), status:String(r.status || "PENDING"),
        catatan_admin:String(r.catatan_admin || ""), created_at:r.created_at || "",
        reviewed_at:r.reviewed_at || "", reviewed_by:String(r.reviewed_by || "")
      };
    })
  };
}

function createLeaveRequest_(user, payload) {
  const jenis = String(payload.jenis || "").trim().toUpperCase();
  const start = String(payload.tanggal_mulai || "").trim();
  const end = String(payload.tanggal_selesai || "").trim();
  const alasan = String(payload.alasan || "").trim();
  if (["CUTI","IZIN","SAKIT"].indexOf(jenis) < 0) throw new Error("Jenis pengajuan tidak valid.");
  if (!validLeaveDate_(start) || !validLeaveDate_(end) || end < start) throw new Error("Tanggal pengajuan tidak valid.");
  if (!alasan || alasan.length > 500) throw new Error("Alasan wajib diisi (maksimal 500 karakter).");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = leaveSheet_();
    const rows = readObjects_(sh);
    const conflict = rows.some(function(r) {
      if (String(r.employee_id) !== String(user.employee_id)) return false;
      if (["PENDING","APPROVED"].indexOf(String(r.status).toUpperCase()) < 0) return false;
      const oldStart = String(r.tanggal_mulai || "");
      const oldEnd = String(r.tanggal_selesai || oldStart);
      return start <= oldEnd && end >= oldStart;
    });
    if (conflict) throw new Error("Ada pengajuan aktif pada rentang tanggal tersebut.");
    const now = new Date();
    const item = {
      request_id:"LEV-" + Utilities.getUuid().slice(0,8).toUpperCase(),
      employee_id:user.employee_id, nik:user.nik, nama:user.nama, jenis:jenis,
      tanggal_mulai:start, tanggal_selesai:end, alasan:alasan,
      status:"PENDING", catatan_admin:"", created_at:now,
      reviewed_at:"", reviewed_by:""
    };
    appendObject_(sh,item);
    log_("leave.created",user.nik,item.request_id + " " + jenis + " " + start + "–" + end);
    return {saved:true,request:{request_id:item.request_id,status:item.status}};
  } finally { lock.releaseLock(); }
}

function reviewLeaveRequest_(admin, payload) {
  const id = String(payload.request_id || "").trim();
  const status = String(payload.status || "").trim().toUpperCase();
  const note = String(payload.catatan_admin || "").trim();
  if (!id || ["APPROVED","REJECTED"].indexOf(status) < 0) throw new Error("Keputusan pengajuan tidak valid.");
  if (note.length > 300) throw new Error("Catatan admin maksimal 300 karakter.");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = leaveSheet_();
    const item = readObjects_(sh).find(function(r) { return String(r.request_id) === id; });
    if (!item) throw new Error("Pengajuan tidak ditemukan.");
    if (String(item.status).toUpperCase() !== "PENDING") throw new Error("Pengajuan ini sudah diproses.");
    const map = headerMap_(sh);
    const now = new Date();
    sh.getRange(item._row,map.status).setValue(status);
    sh.getRange(item._row,map.catatan_admin).setValue(note);
    sh.getRange(item._row,map.reviewed_at).setValue(now);
    sh.getRange(item._row,map.reviewed_by).setValue(admin.nik);
    log_("leave.reviewed",admin.nik,id + " " + status);
    return {updated:true,request_id:id,status:status};
  } finally { lock.releaseLock(); }
}
