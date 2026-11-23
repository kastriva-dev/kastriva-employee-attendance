"use client";
import {useCallback,useEffect,useState} from "react";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Audit={log_id:string;event:string;actor:string;actor_employee_id:string;actor_name:string;actor_role:string;target_employee_id:string;target_name:string;target_nik:string;detail:string;before_value:string;after_value:string;created_at:string|Date};
async function api(action:string,payload:Record<string,unknown>={}){const r=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload}),cache:"no-store"});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Permintaan gagal.");return d.data;}
function dateTime(v:string|Date|undefined){if(!v)return "—";const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",weekday:"short",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(d)+" WIB";}
function eventLabel(v:string){const map:Record<string,string>={"leave.created":"Pengajuan izin dibuat","leave.reviewed":"Keputusan izin","employees.updated":"Perubahan data karyawan","employees.archived":"Akun diarsipkan","auth.login":"Login","admin.bootstrap":"Admin dibuat"};return map[v]||v;}
export default function LogsPage(){
 const [user,setUser]=useState<User|null>(null),[rows,setRows]=useState<Audit[]>([]),[total,setTotal]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[actor,setActor]=useState(""),[event,setEvent]=useState("");
 const load=useCallback(async()=>{setBusy(true);setError("");try{const d=await api("logs.list",{from,to,actor,event,limit:200,offset:0});setRows(d.records||[]);setTotal(d.total||0);}catch(e){setError(e instanceof Error?e.message:"Gagal memuat log.");}finally{setBusy(false);}},[from,to,actor,event]);
 useEffect(()=>{api("auth.me").then(d=>{if(d.user?.role!=="admin"){window.location.href="/";return;}setUser(d.user);}).catch(()=>{window.location.href="/";});},[]);
 useEffect(()=>{if(user?.role==="admin")load();},[user,load]);
 if(!user)return <main className="auth-shell"><div className="auth-card">Memeriksa hak akses...</div></main>;
 return <main className="workspace">
  <aside className="workspace-side">
   <div className="auth-brand"><img src="/kastriva-employee-attendance-mark.svg" alt="Kastriva"/><span><strong>KASTRIVA</strong><small>SISTEM KEPEGAWAIAN</small></span></div>
   <div className="side-caption">RUANG KERJA</div>
   <a className="side-link" href="/"><span className="nav-icon">▦</span><span className="nav-label">Dashboard</span></a>
   <a className="side-link" href="/attendance"><span className="nav-icon">⌖</span><span className="nav-label">Absensi GPS</span></a>
   <a className="side-link" href="/attendance/history"><span className="nav-icon">▤</span><span className="nav-label">Riwayat</span></a>
   <a className="side-link" href="/leave"><span className="nav-icon">▣</span><span className="nav-label">Izin & Cuti</span></a>
   <a className="side-link active" aria-current="page" href="/logs"><span className="nav-icon">◷</span><span className="nav-label">Log Aktivitas</span></a>
   <div className="side-user"><i>{user.nama.slice(0,1).toUpperCase()}</i><span><b>{user.nama}</b><small>Administrator</small></span></div>
  </aside>
  <section className="workspace-main">
   <header className="workspace-header"><div><small>ADMINISTRATOR / AUDIT TRAIL</small><h1>Log Aktivitas</h1></div><a className="logout" href="/">Kembali ↗</a></header>
   <div className="workspace-content">
    <section className="employee-section">
     <div className="section-heading"><div><small>REKAM JEJAK SISTEM</small><h2>Riwayat tindakan pengguna</h2><p>Catatan aktivitas dan keputusan administrator yang tersimpan di server.</p></div></div>
     <div className="employee-form leave-filter">
      <label>Dari tanggal<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai tanggal<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>Nama / NIK pelaku<input value={actor} onChange={e=>setActor(e.target.value)} placeholder="Cari akun pelaku"/></label>
      <label>Jenis aktivitas<select value={event} onChange={e=>setEvent(e.target.value)}><option value="">Semua aktivitas</option><option value="leave.created">Pengajuan izin dibuat</option><option value="leave.reviewed">Keputusan izin</option><option value="employees.updated">Perubahan data karyawan</option><option value="employees.archived">Akun diarsipkan</option><option value="auth.login">Login</option></select></label>
      <button disabled={busy} onClick={load}>Terapkan filter</button><button className="refresh" disabled={busy} onClick={()=>{setFrom("");setTo("");setActor("");setEvent("");}}>Reset</button>
     </div>
     {error&&<p className="auth-error">{error}</p>}
     <div className="section-heading"><div><h2>{total} aktivitas tercatat</h2><p>Waktu ditampilkan menurut zona Asia/Jakarta (WIB).</p></div><button className="refresh" disabled={busy} onClick={load}>Muat ulang ↻</button></div>
     <div className="leave-list">
      {rows.map(r=><article className="leave-item audit-item" key={r.log_id}>
       <div className="leave-item-head"><div><b>{eventLabel(r.event)}</b><small>{dateTime(r.created_at)}</small></div><span className="status-active">{r.actor_role==="admin"?"ADMIN":"AKUN"}</span></div>
       <p><strong>Pelaku:</strong> {r.actor_name||r.actor} {r.actor&&"· NIK "+r.actor}</p>
       {r.target_name&&<p><strong>Target:</strong> {r.target_name}{r.target_nik?" · NIK "+r.target_nik:""}</p>}
       {r.detail&&<p>{r.detail}</p>}
       {(r.before_value||r.after_value)&&<div className="audit-change"><div><small>SEBELUM</small><pre>{r.before_value||"—"}</pre></div><div><small>SESUDAH</small><pre>{r.after_value||"—"}</pre></div></div>}
       <small className="audit-id">ID: {r.log_id}</small>
      </article>)}
      {!busy&&!rows.length&&<p className="live-empty">Belum ada aktivitas untuk filter ini.</p>}
      {busy&&!rows.length&&<p className="live-empty">Memuat log aktivitas...</p>}
     </div>
    </section>
    <footer className="workspace-footer">© 2026 Kastriva. Hak cipta dilindungi.<span>Employee Attendance · Audit Trail</span></footer>
   </div>
  </section>
 </main>;
}
