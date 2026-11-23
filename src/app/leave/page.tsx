"use client";
import {useCallback,useEffect,useState} from "react";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Leave={request_id:string;employee_id:string;nik:string;nama:string;jenis:string;tanggal_mulai:string;tanggal_selesai:string;alasan:string;status:string;catatan_admin:string;created_at:string|Date;reviewed_at:string|Date;reviewed_by:string};
async function api(action:string,payload:Record<string,unknown>={}) {
 const response=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload}),cache:"no-store"});
 const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Permintaan gagal.");return result.data;
}
function statusClass(status:string){return status==="APPROVED"?"status-active":status==="REJECTED"?"status-inactive":"leave-pending";}
export default function LeavePage(){
 const [user,setUser]=useState<User|null>(null);
 const [rows,setRows]=useState<Leave[]>([]);
 const [jenis,setJenis]=useState("IZIN");
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [alasan,setAlasan]=useState("");
 const [from,setFrom]=useState("");
 const [to,setTo]=useState("");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [notes,setNotes]=useState<Record<string,string>>({});
 const admin=user?.role==="admin";
 const load=useCallback(async()=>{
  setBusy(true);setError("");
  try{const d=await api("leaves.list",{from,to,status,limit:100,offset:0});setRows(d.records||[]);}
  catch(e){setError(e instanceof Error?e.message:"Gagal memuat pengajuan.");}
  finally{setBusy(false);}
 },[from,to,status]);
 useEffect(()=>{api("auth.me").then(async d=>{setUser(d.user);}).catch(()=>{window.location.href="/";});},[]);
 useEffect(()=>{if(user)load();},[user,load]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  try{await api("leaves.create",{jenis,tanggal_mulai:start,tanggal_selesai:end,alasan});setStart("");setEnd("");setAlasan("");await load();setNotice("Pengajuan berhasil dikirim dan menunggu persetujuan administrator.");}
  catch(e){setError(e instanceof Error?e.message:"Pengajuan gagal.");}
  finally{setBusy(false);}
 }
 async function review(id:string,decision:"APPROVED"|"REJECTED"){
  setBusy(true);setError("");setNotice("");
  try{await api("leaves.review",{request_id:id,status:decision,catatan_admin:notes[id]||""});await load();setNotice("Status pengajuan berhasil diperbarui.");}
  catch(e){setError(e instanceof Error?e.message:"Gagal memproses pengajuan.");}
  finally{setBusy(false);}
 }
 if(!user)return <main className="auth-shell"><div className="auth-card">Memeriksa sesi...</div></main>;
 return <main className="workspace">
  <aside className="workspace-side">
   <div className="auth-brand"><img src="/kastriva-employee-attendance-mark.svg" alt="Kastriva"/><span><strong>KASTRIVA</strong><small>EMPLOYEE SYSTEM</small></span></div>
   <div className="side-caption">WORKSPACE</div>
   <a className="side-link" href="/"><span className="nav-icon">▦</span><span className="nav-label">Ringkasan</span></a><a className="side-link" href="/attendance"><span className="nav-icon">◎</span><span className="nav-label">Absensi GPS</span></a><a className="side-link" href="/attendance/history"><span className="nav-icon">▤</span><span className="nav-label">Riwayat</span></a><a className="side-link active" aria-current="page" href="/leave"><span className="nav-icon">▧</span><span className="nav-label">Izin & Cuti</span></a>
   <div className="side-user"><i>{user.nama.slice(0,1).toUpperCase()}</i><span><b>{user.nama}</b><small>{admin?"Administrator":"Karyawan"}</small></span></div>
  </aside>
  <section className="workspace-main">
   <header className="workspace-header"><div><small>WORKSPACE / REQUESTS</small><h1>Izin & Cuti</h1></div><a className="logout" href="/">Kembali ↗</a></header>
   <div className="workspace-content">
    <section className="employee-section">
     <div className="section-heading"><div><small>{admin?"REQUEST MANAGEMENT":"EMPLOYEE REQUEST"}</small><h2>{admin?"Pengajuan seluruh karyawan":"Ajukan izin atau cuti"}</h2><p>{admin?"Tinjau dan putuskan permohonan yang masuk.":"Pengajuan tersimpan di sistem dan menunggu keputusan administrator."}</p></div></div>
     <form className="leave-form" onSubmit={submit}>
      <label>Jenis pengajuan<select value={jenis} onChange={e=>setJenis(e.target.value)}><option value="IZIN">Izin</option><option value="CUTI">Cuti</option><option value="SAKIT">Sakit</option></select></label>
      <label>Tanggal mulai<input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label>
      <label>Tanggal selesai<input type="date" min={start||undefined} value={end} onChange={e=>setEnd(e.target.value)} required/></label>
      <label className="leave-reason">Alasan<textarea value={alasan} onChange={e=>setAlasan(e.target.value)} maxLength={500} rows={3} placeholder="Tuliskan alasan pengajuan..." required/></label>
      <button disabled={busy||!start||!end||!alasan.trim()}>Kirim pengajuan</button>
     </form>
    </section>
    <section className="employee-section">
     <div className="section-heading"><div><small>GOOGLE SHEETS · LIVE RECORDS</small><h2>{admin?"Daftar pengajuan":"Pengajuan saya"}</h2><p>{rows.length} catatan ditampilkan</p></div><button className="refresh" onClick={load} disabled={busy}>Muat ulang ↻</button></div>
     <form className="employee-form leave-filter" onSubmit={e=>{e.preventDefault();load();}}>
      <label>Dari tanggal<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai tanggal<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Semua status</option><option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option><option value="REJECTED">Ditolak</option></select></label>
      <button disabled={busy}>Terapkan filter</button>
     </form>
     {error&&<p className="auth-error">{error}</p>}{notice&&<p className="success-note">{notice}</p>}
     <div className="leave-list">
      {rows.map(r=><article className="leave-item" key={r.request_id}>
       <div className="leave-item-head"><div><b>{r.jenis} · {r.nama}</b><small>{r.nik} · {r.request_id}</small></div><span className={statusClass(r.status)}>{r.status==="PENDING"?"MENUNGGU":r.status==="APPROVED"?"DISETUJUI":"DITOLAK"}</span></div>
       <div className="leave-dates">{r.tanggal_mulai}{r.tanggal_selesai!==r.tanggal_mulai?" — "+r.tanggal_selesai:""}</div>
       <p>{r.alasan}</p>
       {r.catatan_admin&&<div className="leave-admin-note">Catatan admin: {r.catatan_admin}</div>}
       {admin&&r.status==="PENDING"&&<div className="leave-review"><input value={notes[r.request_id]||""} onChange={e=>setNotes({...notes,[r.request_id]:e.target.value})} maxLength={300} placeholder="Catatan admin (opsional)"/><button disabled={busy} onClick={()=>review(r.request_id,"APPROVED")}>Setujui</button><button className="reject" disabled={busy} onClick={()=>review(r.request_id,"REJECTED")}>Tolak</button></div>}
      </article>)}
      {!busy&&!rows.length&&<p className="live-empty">Belum ada pengajuan untuk filter ini.</p>}
      {busy&&!rows.length&&<p className="live-empty">Memuat data pengajuan...</p>}
     </div>
    </section>
    <footer className="workspace-footer">© 2026 Kastriva. All rights reserved.<span>Employee Attendance · v0.4.0</span></footer>
   </div>
  </section>
 </main>;
}
