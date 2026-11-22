"use client";
import {useEffect,useState} from "react";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Employee=User&{created_at?:string;last_login?:string};
type Dashboard={date:string;employeeTotal:number;activeEmployees:number;inactiveEmployees:number;presentToday:number;notCheckedInToday:number;checkInsToday:number;week:{date:string;count:number}[];latest:{employee_id:string;nik:string;nama:string;jam_masuk:string|Date;jam_pulang:string|Date;status:string}[]};
async function api(action:string,payload:Record<string,unknown>={}) {
  const response=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload}),cache:"no-store"});
  const result=await response.json();
  if(!response.ok||!result.ok) throw new Error(result.error||"Permintaan gagal.");
  return result.data;
}
function displayTime(value:string|Date){const parsed=new Date(value);return Number.isNaN(parsed.getTime())?"—":new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"}).format(parsed);}
export default function Home(){
  const [user,setUser]=useState<User|null>(null);
  const [checking,setChecking]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [nik,setNik]=useState("");
  const [pin,setPin]=useState("");
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [form,setForm]=useState({nik:"",nama:"",jabatan:"",pin:"",role:"employee"});
  const [editing,setEditing]=useState<{employee_id:string;nik:string;nama:string;jabatan:string}|null>(null);
  const [resetting,setResetting]=useState<string|null>(null);
  const [resetPin,setResetPin]=useState("");
  const [notice,setNotice]=useState("");

  async function loadEmployees(){const d=await api("employees.list");setEmployees(d.employees||[]);}
  async function loadDashboard(){const d=await api("admin.dashboard");setDashboard(d);}
  useEffect(()=>{api("auth.me").then(async d=>{setUser(d.user);if(d.user?.role==="admin")await Promise.all([loadEmployees(),loadDashboard()]);}).catch(()=>{}).finally(()=>setChecking(false));},[]);

  async function login(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{const d=await api("auth.login",{nik,pin});setUser(d.user);setPin("");if(d.user?.role==="admin")await Promise.all([loadEmployees(),loadDashboard()]);}
    catch(err){setError(err instanceof Error?err.message:"Login gagal.");}
    finally{setBusy(false);}
  }
  async function logout(){setBusy(true);try{await api("auth.logout");}finally{setUser(null);setEmployees([]);setDashboard(null);setBusy(false);}}
  async function createEmployee(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");setNotice("");
    try{await api("employees.create",form);setForm({nik:"",nama:"",jabatan:"",pin:"",role:"employee"});await Promise.all([loadEmployees(),loadDashboard()]);setNotice("Karyawan berhasil ditambahkan.");}
    catch(err){setError(err instanceof Error?err.message:"Gagal menambahkan karyawan.");}
    finally{setBusy(false);}
  }
  async function toggleStatus(item:Employee){
    setBusy(true);setError("");try{await api("employees.setStatus",{employee_id:item.employee_id,status:item.status==="ACTIVE"?"INACTIVE":"ACTIVE"});await Promise.all([loadEmployees(),loadDashboard()]);}
    catch(err){setError(err instanceof Error?err.message:"Gagal mengubah status.");}finally{setBusy(false);}
  }
  async function saveEmployee(e:React.FormEvent){
    e.preventDefault();if(!editing)return;setBusy(true);setError("");setNotice("");
    try{await api("employees.update",editing);await loadEmployees();setEditing(null);setNotice("Data karyawan berhasil diperbarui.");}
    catch(err){setError(err instanceof Error?err.message:"Gagal memperbarui karyawan.");}finally{setBusy(false);}
  }
  async function submitPinReset(e:React.FormEvent){
    e.preventDefault();if(!resetting)return;setBusy(true);setError("");setNotice("");
    try{const result=await api("employees.resetPin",{employee_id:resetting,pin:resetPin});await loadEmployees();setResetting(null);setResetPin("");setNotice(`PIN diperbarui. ${result.revokedSessions||0} sesi lama telah dicabut.`);}
    catch(err){setError(err instanceof Error?err.message:"Gagal mereset PIN.");}finally{setBusy(false);}
  }

  if(checking)return <main className="auth-shell"><div className="auth-card">Memeriksa sesi...</div></main>;
  if(!user)return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><b>K</b><span><strong>KASTRIVA</strong><small>EMPLOYEE ATTENDANCE</small></span></div>
    <div className="auth-kicker">SECURE WORKSPACE</div><h1>Selamat datang</h1><p>Masuk menggunakan NIK dan PIN yang telah didaftarkan administrator.</p>
    <form onSubmit={login} className="auth-form">
      <label>NIK<input value={nik} onChange={e=>setNik(e.target.value)} inputMode="numeric" autoComplete="username" placeholder="Masukkan NIK" required maxLength={20}/></label>
      <label>PIN<input value={pin} onChange={e=>setPin(e.target.value)} inputMode="numeric" type="password" autoComplete="current-password" placeholder="Masukkan PIN" required minLength={6} maxLength={12}/></label>
      {error&&<div className="auth-error">{error}</div>}
      <button disabled={busy}>{busy?"Memproses...":"Masuk ke sistem"} <span>↗</span></button>
    </form><small className="auth-foot">© 2026 Kastriva. All rights reserved.</small>
  </section></main>;

  return <main className="workspace">
    <aside className="workspace-side"><div className="auth-brand"><b>K</b><span><strong>KASTRIVA</strong><small>EMPLOYEE SYSTEM</small></span></div><div className="side-caption">WORKSPACE</div><div className="side-link active">▦　Ringkasan</div><a className="side-link nav-attendance" href="/attendance">◎　Absensi GPS</a>{user.role==="admin"&&<div className="side-link">♙　Manajemen Karyawan</div>}<div className="side-user"><i>{user.nama.slice(0,1).toUpperCase()}</i><span><b>{user.nama}</b><small>{user.role==="admin"?"Administrator":"Karyawan"}</small></span></div></aside>
    <section className="workspace-main"><header className="workspace-header"><div><small>WORKSPACE / OVERVIEW</small><h1>Halo, {user.nama.split(" ")[0]}.</h1></div><button className="logout" onClick={logout} disabled={busy}>Keluar ↗</button></header>
      <div className="workspace-content"><section className="welcome-panel"><div><span className="welcome-tag">KASTRIVA EMPLOYEE ATTENDANCE</span><h2>Sistem kehadiran<br/><em>yang lebih terukur.</em></h2><p>Selamat datang di ruang kerja digital Kastriva. Buka menu Absensi GPS untuk mencatat kehadiran dengan verifikasi lokasi dan foto selfie.</p></div><div className="welcome-mark">K</div></section>
      <div className="profile-panel"><div><small>AKUN AKTIF</small><h3>{user.nama}</h3><p>{user.nik} · {user.jabatan||"Tanpa jabatan"}</p></div><span className="status-active">● {user.status}</span></div>
      {user.role==="admin"&&dashboard&&<section className="dashboard-section"><div className="section-heading"><div><small>ATTENDANCE OVERVIEW</small><h2>Ringkasan Kehadiran</h2></div><span>{dashboard.date}</span></div><div className="dashboard-stats"><article><small>SELURUH KARYAWAN</small><b>{dashboard.employeeTotal}</b><span>{dashboard.activeEmployees} aktif · {dashboard.inactiveEmployees} nonaktif</span></article><article><small>HADIR HARI INI</small><b>{dashboard.presentToday}</b><span>dari {dashboard.activeEmployees} karyawan aktif</span></article><article><small>BELUM CHECK-IN</small><b>{dashboard.notCheckedInToday}</b><span>karyawan aktif yang belum mencatat masuk</span></article><article><small>CHECK-IN HARI INI</small><b>{dashboard.checkInsToday}</b><span>catatan kehadiran</span></article></div><div className="dashboard-detail"><section className="dashboard-chart"><h3>Hadir · 7 hari terakhir</h3><div className="chart-bars">{dashboard.week.map(day=>{const max=Math.max(1,...dashboard.week.map(item=>item.count));return <div className="chart-column" key={day.date}><b>{day.count}</b><div className="chart-track"><i style={{height:`${Math.max(5,day.count/max*100)}%`}}/></div><small>{day.date.slice(8,10)}</small></div>;})}</div></section><section className="dashboard-activity"><h3>Aktivitas masuk hari ini</h3>{dashboard.latest.length?dashboard.latest.slice(0,5).map(item=><div className="activity-row" key={item.employee_id}><span className="activity-avatar">{item.nama.slice(0,1).toUpperCase()}</span><div><b>{item.nama}</b><small>{item.nik} · Masuk {displayTime(item.jam_masuk)}</small></div></div>):<p className="dashboard-empty">Belum ada absensi masuk hari ini.</p>}</section></div></section>}
      {user.role==="admin"&&<><section className="employee-section"><div className="section-heading"><div><small>PEOPLE MANAGEMENT</small><h2>Tambah Karyawan</h2></div><span>{employees.length} akun</span></div>
        <form className="employee-form" onSubmit={createEmployee}>
          <label>NIK<input value={form.nik} onChange={e=>setForm({...form,nik:e.target.value})} inputMode="numeric" required placeholder="NIK karyawan"/></label>
          <label>Nama lengkap<input value={form.nama} onChange={e=>setForm({...form,nama:e.target.value})} required placeholder="Nama karyawan"/></label>
          <label>Jabatan<input value={form.jabatan} onChange={e=>setForm({...form,jabatan:e.target.value})} placeholder="Jabatan"/></label>
          <label>PIN awal<input value={form.pin} onChange={e=>setForm({...form,pin:e.target.value})} type="password" inputMode="numeric" minLength={6} maxLength={12} required placeholder="6–12 digit"/></label>
          <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="employee">Karyawan</option><option value="admin">Admin</option></select></label>
          <button disabled={busy}>Simpan karyawan</button>
        </form>{notice&&<p className="success-note">{notice}</p>}{error&&<p className="auth-error">{error}</p>}
      </section>
      <section className="employee-section"><div className="section-heading"><div><small>EMPLOYEE DIRECTORY</small><h2>Daftar Karyawan</h2></div><button className="refresh" onClick={()=>loadEmployees()}>Muat ulang ↻</button></div>
        {notice&&<p className="success-note">{notice}</p>}{error&&<p className="auth-error">{error}</p>}
        <div className="employee-list">{employees.map(item=><div className="employee-record" key={item.employee_id}><div className="employee-row"><div className="employee-avatar">{item.nama.slice(0,1).toUpperCase()}</div><div className="employee-info"><b>{item.nama}</b><small>{item.nik} · {item.jabatan||"Tanpa jabatan"} · {item.role}</small></div><span className={item.status==="ACTIVE"?"status-active":"status-inactive"}>{item.status}</span><button className="status-toggle" disabled={busy} onClick={()=>toggleStatus(item)}>{item.status==="ACTIVE"?"Nonaktifkan":"Aktifkan"}</button><button className="status-toggle" disabled={busy} onClick={()=>{setEditing({employee_id:item.employee_id,nik:item.nik,nama:item.nama,jabatan:item.jabatan||""});setResetting(null);}}>Edit</button><button className="status-toggle" disabled={busy} onClick={()=>{setResetting(item.employee_id);setResetPin("");setEditing(null);}}>Reset PIN</button></div>
          {editing?.employee_id===item.employee_id&&<form className="employee-inline-form" onSubmit={saveEmployee}><label>NIK<input value={editing.nik} onChange={e=>setEditing({...editing,nik:e.target.value})} inputMode="numeric" required minLength={6} maxLength={20}/></label><label>Nama lengkap<input value={editing.nama} onChange={e=>setEditing({...editing,nama:e.target.value})} required maxLength={100}/></label><label>Jabatan<input value={editing.jabatan} onChange={e=>setEditing({...editing,jabatan:e.target.value})} maxLength={100}/></label><div className="employee-inline-actions"><button disabled={busy}>Simpan perubahan</button><button type="button" className="status-toggle" onClick={()=>setEditing(null)}>Batal</button></div></form>}
          {resetting===item.employee_id&&<form className="employee-inline-form pin-reset-form" onSubmit={submitPinReset}><label>PIN baru<input value={resetPin} onChange={e=>setResetPin(e.target.value)} type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={12} required placeholder="6–12 digit"/></label><p>PIN lama akan diganti dan sesi aktif karyawan ini dicabut.</p><div className="employee-inline-actions"><button disabled={busy}>Simpan PIN baru</button><button type="button" className="status-toggle" onClick={()=>setResetting(null)}>Batal</button></div></form>}
        </div>)}</div>
      </section></>}
      {user.role!=="admin"&&<section className="employee-section"><div className="section-heading"><div><small>ATTENDANCE</small><h2>Modul absensi</h2></div><span>Siap digunakan</span></div><p>Gunakan menu Absensi GPS untuk mencatat masuk atau pulang. Sistem akan meminta verifikasi lokasi dan foto selfie.</p></section>}
      <footer className="workspace-footer">© 2026 Kastriva. All rights reserved.<span>Employee Attendance · v0.2.0</span></footer></div>
    </section>
  </main>;
}
