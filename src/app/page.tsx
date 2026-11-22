"use client";
import {useEffect,useState} from "react";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Employee=User&{created_at?:string;last_login?:string};
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
  const [form,setForm]=useState({nik:"",nama:"",jabatan:"",pin:"",role:"employee"});
  const [notice,setNotice]=useState("");

  async function loadEmployees(){const d=await api("employees.list");setEmployees(d.employees||[]);}
  useEffect(()=>{api("auth.me").then(d=>{setUser(d.user);if(d.user?.role==="admin")return loadEmployees();}).catch(()=>{}).finally(()=>setChecking(false));},[]);

  async function login(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{const d=await api("auth.login",{nik,pin});setUser(d.user);setPin("");if(d.user?.role==="admin")await loadEmployees();}
    catch(err){setError(err instanceof Error?err.message:"Login gagal.");}
    finally{setBusy(false);}
  }
  async function logout(){setBusy(true);try{await api("auth.logout");}finally{setUser(null);setEmployees([]);setBusy(false);}}
  async function createEmployee(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");setNotice("");
    try{await api("employees.create",form);setForm({nik:"",nama:"",jabatan:"",pin:"",role:"employee"});await loadEmployees();setNotice("Karyawan berhasil ditambahkan.");}
    catch(err){setError(err instanceof Error?err.message:"Gagal menambahkan karyawan.");}
    finally{setBusy(false);}
  }
  async function toggleStatus(item:Employee){
    setBusy(true);setError("");try{await api("employees.setStatus",{employee_id:item.employee_id,status:item.status==="ACTIVE"?"INACTIVE":"ACTIVE"});await loadEmployees();}
    catch(err){setError(err instanceof Error?err.message:"Gagal mengubah status.");}finally{setBusy(false);}
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
      <div className="workspace-content"><section className="welcome-panel"><div><span className="welcome-tag">KASTRIVA EMPLOYEE ATTENDANCE</span><h2>Sistem kehadiran<br/><em>yang lebih terukur.</em></h2><p>Selamat datang di ruang kerja digital Kastriva. Modul absensi GPS dan selfie akan hadir pada tahap berikutnya.</p></div><div className="welcome-mark">K</div></section>
      <div className="profile-panel"><div><small>AKUN AKTIF</small><h3>{user.nama}</h3><p>{user.nik} · {user.jabatan||"Tanpa jabatan"}</p></div><span className="status-active">● {user.status}</span></div>
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
        <div className="employee-list">{employees.map(item=><div className="employee-row" key={item.employee_id}><div className="employee-avatar">{item.nama.slice(0,1).toUpperCase()}</div><div className="employee-info"><b>{item.nama}</b><small>{item.nik} · {item.jabatan||"Tanpa jabatan"} · {item.role}</small></div><span className={item.status==="ACTIVE"?"status-active":"status-inactive"}>{item.status}</span><button className="status-toggle" disabled={busy} onClick={()=>toggleStatus(item)}>{item.status==="ACTIVE"?"Nonaktifkan":"Aktifkan"}</button></div>)}</div>
      </section></>}
      {user.role!=="admin"&&<section className="employee-section"><div className="section-heading"><div><small>ATTENDANCE</small><h2>Modul absensi</h2></div><span>Dalam pengembangan</span></div><p>Fitur absensi masuk dan pulang dengan GPS geofencing serta foto selfie akan diaktifkan pada tahap berikutnya.</p></section>}
      <footer className="workspace-footer">© 2026 Kastriva. All rights reserved.<span>Employee Attendance · v0.2.0</span></footer></div>
    </section>
  </main>;
}
