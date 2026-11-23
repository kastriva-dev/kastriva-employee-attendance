"use client";
import {useEffect,useState} from "react";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Employee=User&{created_at?:string;last_login?:string};
type DashboardSummary={date:string;totalEmployees:number;activeEmployees:number;inactiveEmployees:number;present:number;notYetPresent:number;attendanceCount:number;recentAttendance:{attendance_id:string;employee_id:string;nama:string;nik:string;tanggal:string;jam_masuk:string|Date|null;jam_pulang:string|Date|null;status:string}[]};
type MonthlySummary={month:string;daysInMonth:number;totalEmployees:number;activeEmployees:number;inactiveEmployees:number;attendanceRecords:number;present:number;checkOut:number;statusCounts:Record<string,number>;leaveRequests:{total:number;pending:number;approved:number;rejected:number};dailyTrend:{date:string;present:number;checkOut:number;records:number}[]};
async function api(action:string,payload:Record<string,unknown>={}) {
  const response=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload}),cache:"no-store"});
  const result=await response.json();
  if(!response.ok||!result.ok) throw new Error(result.error||"Permintaan gagal.");
  return result.data;
}
export default function Home(){
  const [user,setUser]=useState<User|null>(null);
  const [checking,setChecking]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [nik,setNik]=useState("");
  const [pin,setPin]=useState("");
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [summary,setSummary]=useState<DashboardSummary|null>(null);
  const [monthlyMonth,setMonthlyMonth]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit"}).format(new Date()));
  const [monthly,setMonthly]=useState<MonthlySummary|null>(null);
  const [monthlyBusy,setMonthlyBusy]=useState(false);
  const [monthlyError,setMonthlyError]=useState("");
  const [form,setForm]=useState({nik:"",nama:"",jabatan:"",pin:"",role:"employee"});
  const [notice,setNotice]=useState("");
  const [editing,setEditing]=useState<Employee|null>(null);
  const [editForm,setEditForm]=useState({nik:"",nama:"",jabatan:"",role:"employee",pin:""});
  const [retentionDays,setRetentionDays]=useState(14);
  const [retentionBusy,setRetentionBusy]=useState(false);
  const [retentionNotice,setRetentionNotice]=useState("");

  async function loadEmployees(){const d=await api("employees.list");setEmployees(d.employees||[]);}
  async function loadSummary(){const d=await api("dashboard.summary");setSummary(d);}
  async function loadMonthly(month=monthlyMonth){setMonthlyBusy(true);setMonthlyError("");try{const d=await api("dashboard.monthly",{month});setMonthly(d);}catch(e){setMonthlyError(e instanceof Error?e.message:"Gagal memuat rekap bulanan.");}finally{setMonthlyBusy(false);}}
  async function loadAdminData(){await Promise.all([loadEmployees(),loadSummary()]);void loadMonthly();try{const settings=await api("settings.photoRetention.get");setRetentionDays(settings.retentionDays||14);}catch{/* GAS deployment may be updated separately; keep existing dashboard usable. */}}
  async function saveRetention(){setRetentionBusy(true);setRetentionNotice("");try{const d=await api("settings.photoRetention.update",{retentionDays});setRetentionDays(d.retentionDays);setRetentionNotice("Pengaturan tersimpan. Pembersihan foto berjalan otomatis setiap hari sekitar pukul 02.00 WIB.");}catch(e){setRetentionNotice(e instanceof Error?e.message:"Gagal menyimpan pengaturan.");}finally{setRetentionBusy(false);}}
  useEffect(()=>{api("auth.me").then(async d=>{setUser(d.user);if(d.user?.role==="admin")await loadAdminData();}).catch(()=>{}).finally(()=>setChecking(false));},[]);

  async function login(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{const d=await api("auth.login",{nik,pin});setUser(d.user);setPin("");if(d.user?.role==="admin")await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:"Login gagal.");}
    finally{setBusy(false);}
  }
  async function logout(){setBusy(true);try{await api("auth.logout");}finally{setUser(null);setEmployees([]);setSummary(null);setBusy(false);}}
  async function createEmployee(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");setNotice("");
    try{await api("employees.create",form);setForm({nik:"",nama:"",jabatan:"",pin:"",role:"employee"});await loadAdminData();setNotice("Karyawan berhasil ditambahkan.");}
    catch(err){setError(err instanceof Error?err.message:"Gagal menambahkan karyawan.");}
    finally{setBusy(false);}
  }
  function beginEdit(item:Employee){setEditing(item);setEditForm({nik:item.nik,nama:item.nama,jabatan:item.jabatan||"",role:item.role,pin:""});setError("");setNotice("");}
  async function saveEmployee(e:React.FormEvent){e.preventDefault();if(!editing)return;setBusy(true);setError("");setNotice("");try{await api("employees.update",{employee_id:editing.employee_id,...editForm});setEditing(null);await loadAdminData();setNotice("Data karyawan berhasil diperbarui.");}catch(err){setError(err instanceof Error?err.message:"Gagal memperbarui karyawan.");}finally{setBusy(false);}}
  async function archiveEmployee(item:Employee){if(!window.confirm("Arsipkan akun "+item.nama+"? Akun tidak dapat login, tetapi riwayat absensi tetap dipertahankan."))return;setBusy(true);setError("");setNotice("");try{await api("employees.delete",{employee_id:item.employee_id});if(editing?.employee_id===item.employee_id)setEditing(null);await loadAdminData();setNotice("Akun berhasil diarsipkan. Riwayat absensi tetap tersimpan.");}catch(err){setError(err instanceof Error?err.message:"Gagal mengarsipkan karyawan.");}finally{setBusy(false);}}
  async function toggleStatus(item:Employee){
    setBusy(true);setError("");try{await api("employees.setStatus",{employee_id:item.employee_id,status:item.status==="ACTIVE"?"INACTIVE":"ACTIVE"});await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:"Gagal mengubah status.");}finally{setBusy(false);}
  }

  if(checking)return <main className="auth-shell"><div className="auth-card">Memeriksa sesi...</div></main>;
  if(!user)return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><img src="/kastriva-employee-attendance-mark.svg" alt="Kastriva" /><span><strong>KASTRIVA</strong><small>EMPLOYEE ATTENDANCE</small></span></div>
    <div className="auth-kicker">SECURE WORKSPACE</div><h1>Selamat datang</h1><p>Masuk menggunakan NIK dan PIN yang telah didaftarkan administrator.</p>
    <form onSubmit={login} className="auth-form">
      <label>NIK<input value={nik} onChange={e=>setNik(e.target.value)} inputMode="numeric" autoComplete="username" placeholder="Masukkan NIK" required maxLength={20}/></label>
      <label>PIN<input value={pin} onChange={e=>setPin(e.target.value)} inputMode="numeric" type="password" autoComplete="current-password" placeholder="Masukkan PIN" required minLength={6} maxLength={12}/></label>
      {error&&<div className="auth-error">{error}</div>}
      <button disabled={busy}>{busy?"Memproses...":"Masuk ke sistem"} <span>↗</span></button>
    </form><small className="auth-foot">© 2026 Kastriva. All rights reserved.</small>
  </section></main>;

  return <main className="workspace">
    <aside className="workspace-side"><div className="auth-brand"><img src="/kastriva-employee-attendance-mark.svg" alt="Kastriva" /><span><strong>KASTRIVA</strong><small>EMPLOYEE SYSTEM</small></span></div><div className="side-caption">WORKSPACE</div><div className="side-link active">▦　Ringkasan</div><a className="side-link nav-attendance" href="/attendance">◎　Absensi GPS</a><a className="side-link" href="/attendance/history">▤　Riwayat Absensi</a><a className="side-link" href="/leave">▧　Izin & Cuti</a>{user.role==="admin"&&<div className="side-link">♙　Manajemen Karyawan</div>}<div className="side-user"><i>{user.nama.slice(0,1).toUpperCase()}</i><span><b>{user.nama}</b><small>{user.role==="admin"?"Administrator":"Karyawan"}</small></span></div></aside>
    <section className="workspace-main"><header className="workspace-header"><div><small>WORKSPACE / OVERVIEW</small><h1>Halo, {user.nama.split(" ")[0]}.</h1></div><button className="logout" onClick={logout} disabled={busy}>Keluar ↗</button></header>
      <div className="workspace-content"><section className="welcome-panel"><div><span className="welcome-tag">KASTRIVA EMPLOYEE ATTENDANCE</span><h2>Sistem kehadiran<br/><em>yang lebih terukur.</em></h2><p>Pantau kehadiran tim dan kelola data karyawan melalui satu ruang kerja digital yang terhubung ke sistem Kastriva.</p></div><div className="welcome-mark"><img src="/kastriva-employee-attendance-mark.svg" alt="" /></div></section>
      <div className="profile-panel"><div><small>AKUN AKTIF</small><h3>{user.nama}</h3><p>{user.nik} · {user.jabatan||"Tanpa jabatan"}</p></div><span className="status-active">● {user.status}</span></div>
      {user.role==="admin"&&<><section className="live-summary">
        <div className="live-summary-head"><div><small>DATA LANGSUNG · GOOGLE SHEETS</small><h2>Ringkasan kehadiran hari ini</h2><p>{summary?.date||"Memuat tanggal..."}</p></div><button className="refresh" onClick={()=>loadAdminData()}>Perbarui data ↻</button></div>
        <div className="live-summary-grid">
          <article><small>Total karyawan</small><strong>{summary?.totalEmployees??"—"}</strong><span>{summary?.activeEmployees??"—"} akun aktif</span></article>
          <article><small>Hadir hari ini</small><strong>{summary?.present??"—"}</strong><span>Catatan absensi masuk</span></article>
          <article><small>Belum hadir</small><strong>{summary?.notYetPresent??"—"}</strong><span>Dari karyawan aktif</span></article>
          <article><small>Akun nonaktif</small><strong>{summary?.inactiveEmployees??"—"}</strong><span>Perlu ditinjau admin</span></article>
        </div>
        <div className="live-recent"><div className="section-heading"><div><small>REAL ATTENDANCE RECORDS</small><h2>Aktivitas absensi hari ini</h2></div><a href="/attendance/history">Riwayat lengkap ↗</a></div>
          {summary?.recentAttendance?.length?<div className="live-table-wrap"><table className="live-table"><thead><tr><th>Karyawan</th><th>NIK</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr></thead><tbody>{summary.recentAttendance.map(row=><tr key={row.attendance_id}><td>{row.nama}</td><td>{row.nik}</td><td>{row.jam_masuk?new Date(row.jam_masuk).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"}):"—"}</td><td>{row.jam_pulang?new Date(row.jam_pulang).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"}):"—"}</td><td>{row.status||"—"}</td></tr>)}</tbody></table></div>:<p className="live-empty">{summary?"Belum ada catatan absensi untuk hari ini.":"Mengambil data absensi dari Google Sheets..."}</p>}
        </div>
      </section><section className="employee-section monthly-dashboard">
        <div className="section-heading"><div><small>MONTHLY ANALYTICS</small><h2>Rekap kehadiran bulanan</h2><p>Ringkasan berdasarkan catatan absensi dan pengajuan izin/cuti yang tersimpan.</p></div><div className="monthly-controls"><input aria-label="Pilih bulan rekap" type="month" value={monthlyMonth} onChange={e=>setMonthlyMonth(e.target.value)}/><button className="refresh" disabled={monthlyBusy||!monthlyMonth} onClick={()=>loadMonthly(monthlyMonth)}>{monthlyBusy?"Memuat...":"Tampilkan"}</button></div></div>
        {monthlyError&&<p className="auth-error">{monthlyError}</p>}
        <div className="monthly-metrics">
          <article><small>Catatan absensi</small><strong>{monthly?.attendanceRecords??"—"}</strong><span>Seluruh status pada bulan ini</span></article>
          <article><small>Check-in tercatat</small><strong>{monthly?.present??"—"}</strong><span>Memiliki jam masuk atau status hadir</span></article>
          <article><small>Check-out tercatat</small><strong>{monthly?.checkOut??"—"}</strong><span>Memiliki jam pulang</span></article>
          <article><small>Total pengajuan</small><strong>{monthly?.leaveRequests.total??"—"}</strong><span>{monthly?.leaveRequests.pending??0} menunggu · {monthly?.leaveRequests.approved??0} disetujui</span></article>
        </div>
        <div className="monthly-chart-panel"><div className="section-heading"><div><small>DAILY CHECK-IN TREND</small><h2>Tren kehadiran harian</h2></div><span>{monthly?.month||monthlyMonth}</span></div>
          {monthly?.dailyTrend?.length?<div className="monthly-bars">{monthly.dailyTrend.map(day=>{const max=Math.max(1,...monthly.dailyTrend.map(x=>x.present));return <div className="monthly-bar-col" key={day.date} title={day.date+": "+day.present+" check-in"}><div className="monthly-bar-track"><i style={{height:(day.present/max*100)+"%"}}/></div><small>{Number(day.date.slice(-2))}</small></div>;})}</div>:<p className="live-empty">{monthlyBusy?"Mengambil rekap bulanan...":"Belum ada data rekap untuk ditampilkan."}</p>}
        </div>
        <div className="monthly-statuses"><div><small>STATUS ABSENSI</small><div className="monthly-status-list">{monthly&&Object.entries(monthly.statusCounts).length?Object.entries(monthly.statusCounts).map(([status,count])=><span key={status}>{status}<b>{count}</b></span>):<span>Belum ada catatan status</span>}</div></div><div><small>STATUS IZIN & CUTI</small><div className="monthly-status-list"><span>Menunggu<b>{monthly?.leaveRequests.pending??0}</b></span><span>Disetujui<b>{monthly?.leaveRequests.approved??0}</b></span><span>Ditolak<b>{monthly?.leaveRequests.rejected??0}</b></span></div></div></div>
        <p className="attendance-muted">Catatan: rekap ini menghitung data yang benar-benar tercatat. Sistem belum menghitung keterlambatan maupun ketidakhadiran pada hari tanpa catatan absensi.</p>
      </section><section className="employee-section"><div className="section-heading"><div><small>PEOPLE MANAGEMENT</small><h2>Tambah Karyawan</h2></div><span>{employees.length} akun</span></div>
        <form className="employee-form" onSubmit={createEmployee}>
          <label>NIK<input value={form.nik} onChange={e=>setForm({...form,nik:e.target.value})} inputMode="numeric" required placeholder="NIK karyawan"/></label>
          <label>Nama lengkap<input value={form.nama} onChange={e=>setForm({...form,nama:e.target.value})} required placeholder="Nama karyawan"/></label>
          <label>Jabatan<input value={form.jabatan} onChange={e=>setForm({...form,jabatan:e.target.value})} placeholder="Jabatan"/></label>
          <label>PIN awal<input value={form.pin} onChange={e=>setForm({...form,pin:e.target.value})} type="password" inputMode="numeric" minLength={6} maxLength={12} required placeholder="6–12 digit"/></label>
          <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="employee">Karyawan</option><option value="admin">Admin</option></select></label>
          <button disabled={busy}>Simpan karyawan</button>
        </form>{notice&&<p className="success-note">{notice}</p>}{error&&<p className="auth-error">{error}</p>}
      </section>
      <section className="employee-section"><div className="section-heading"><div><small>EMPLOYEE DIRECTORY</small><h2>Daftar Karyawan</h2></div><button className="refresh" onClick={()=>loadAdminData()}>Muat ulang ↻</button></div>
        <div className="employee-list">{employees.map(item=><div className="employee-row" key={item.employee_id}><div className="employee-avatar">{item.nama.slice(0,1).toUpperCase()}</div><div className="employee-info"><b>{item.nama}</b><small>{item.nik} · {item.jabatan||"Tanpa jabatan"} · {item.role}</small></div><span className={item.status==="ACTIVE"?"status-active":"status-inactive"}>{item.status}</span><button className="status-toggle" disabled={busy||item.status==="DELETED"} onClick={()=>toggleStatus(item)}>{item.status==="ACTIVE"?"Nonaktifkan":item.status==="DELETED"?"Diarsipkan":"Aktifkan"}</button><button className="refresh" disabled={busy||item.status==="DELETED"} onClick={()=>beginEdit(item)}>Edit</button><button className="refresh" disabled={busy||item.status==="DELETED"||item.employee_id===user.employee_id} onClick={()=>archiveEmployee(item)}>Hapus</button></div>)}</div>
      {editing&&<section className="employee-section"><div className="section-heading"><div><small>EDIT EMPLOYEE</small><h2>Ubah data karyawan</h2></div><button className="refresh" type="button" onClick={()=>setEditing(null)}>Batal</button></div><form className="employee-form" onSubmit={saveEmployee}><label>NIK<input value={editForm.nik} onChange={e=>setEditForm({...editForm,nik:e.target.value})} inputMode="numeric" required maxLength={20}/></label><label>Nama lengkap<input value={editForm.nama} onChange={e=>setEditForm({...editForm,nama:e.target.value})} required maxLength={100}/></label><label>Jabatan<input value={editForm.jabatan} onChange={e=>setEditForm({...editForm,jabatan:e.target.value})}/></label><label>Role<select value={editForm.role} onChange={e=>setEditForm({...editForm,role:e.target.value})}><option value="employee">Karyawan</option><option value="admin">Admin</option></select></label><label>PIN baru (opsional)<input value={editForm.pin} onChange={e=>setEditForm({...editForm,pin:e.target.value})} type="password" inputMode="numeric" minLength={6} maxLength={12} placeholder="Kosongkan jika tidak diubah"/></label><button disabled={busy}>{busy?"Menyimpan...":"Simpan perubahan"}</button></form></section>}<p><a href="/attendance">Absensi GPS</a>　·　<a href="/attendance/history">Riwayat absensi</a>　·　<a href="/leave">Ajukan izin atau cuti</a></p></section></>}
      {user.role!=="admin"&&<section className="employee-section"><div className="section-heading"><div><small>ATTENDANCE</small><h2>Modul layanan karyawan</h2></div><span>Terhubung ke sistem</span></div><p>Gunakan absensi GPS untuk mencatat kehadiran, lihat riwayat pribadi, dan ajukan izin atau cuti melalui sistem yang tersimpan di Google Sheets.</p></section>}
      {user.role==="admin"&&(      <section className="employee-section"><div className="section-heading"><div><small>STORAGE & PRIVACY</small><h2>Pengaturan masa simpan foto absensi</h2><p>Hanya file foto di Google Drive yang dihapus. Data rekap, waktu, GPS, dan status absensi tetap disimpan.</p></div></div><div className="employee-form" style={{gridTemplateColumns:"minmax(0,240px) auto"}}><label>Simpan foto selama (hari)<input type="number" min="1" max="365" value={retentionDays} onChange={e=>setRetentionDays(Number(e.target.value))}/></label><button type="button" onClick={saveRetention} disabled={retentionBusy}>{retentionBusy?"Menyimpan...":"Simpan pengaturan"}</button></div><p className="attendance-muted">Contoh: 14 hari berarti foto yang usianya lebih dari 14 hari akan dipindahkan ke Sampah Google Drive oleh proses otomatis harian. Baris absensi tidak dihapus. Jadwal: sekitar pukul 02.00 WIB (waktu Google Apps Script dapat bergeser).</p>{retentionNotice&&<p className="success-note">{retentionNotice}</p>}</section>)}<footer className="workspace-footer">© 2026 Kastriva. All rights reserved.<span>Employee Attendance · v0.2.0</span></footer></div>
    </section>
  </main>;
}
