"use client";
import {useCallback,useEffect,useState} from "react";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Employee={employee_id:string;nik:string;nama:string};
type RecordItem={attendance_id:string;employee_id:string;nama:string;nik:string;tanggal:string;jam_masuk:string|Date|null;jam_pulang:string|Date|null;status:string};
type Result={total:number;limit:number;offset:number;records:RecordItem[]};
async function api(action:string,payload:Record<string,unknown>={}) {
  const response=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload}),cache:"no-store"});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error||"Permintaan gagal.");
  return result.data;
}
function timeLabel(value:string|Date|null|undefined){
  if(!value)return "—";
  const d=value instanceof Date?value:new Date(value);
  return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"});
}
export default function AttendanceHistoryPage(){
  const [user,setUser]=useState<User|null>(null);
  const [records,setRecords]=useState<RecordItem[]>([]);
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [employeeId,setEmployeeId]=useState("");
  const [total,setTotal]=useState(0);
  const [offset,setOffset]=useState(0);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const limit=50;
  const load=useCallback(async(nextOffset=0)=>{
    setBusy(true);setError("");
    try{
      const d:Result=await api("attendance.list",{from,to,employee_id:employeeId,limit,offset:nextOffset});
      setRecords(d.records||[]);setTotal(d.total||0);setOffset(nextOffset);
    }catch(e){setError(e instanceof Error?e.message:"Gagal memuat riwayat.");}
    finally{setBusy(false);}
  },[from,to,employeeId]);
  useEffect(()=>{
    api("auth.me").then(async d=>{
      setUser(d.user);
      if(d.user?.role==="admin"){
        const e=await api("employees.list");
        setEmployees(e.employees||[]);
      }
      await load(0);
    }).catch(()=>{window.location.href="/";});
  },[load]);
  const isAdmin=user?.role==="admin";
  if(!user)return <main className="auth-shell"><div className="auth-card">Memeriksa sesi...</div></main>;
  return <main className="workspace">
    <aside className="workspace-side">
      <div className="auth-brand"><img src="/kastriva-employee-attendance-mark.svg" alt="Kastriva"/><span><strong>KASTRIVA</strong><small>EMPLOYEE SYSTEM</small></span></div>
      <div className="side-caption">WORKSPACE</div>
      <a className="side-link" href="/">▦　Ringkasan</a>
      <a className="side-link" href="/attendance">◎　Absensi GPS</a>
      <div className="side-link active">▤　Riwayat Absensi</div>
      <div className="side-user"><i>{user.nama.slice(0,1).toUpperCase()}</i><span><b>{user.nama}</b><small>{isAdmin?"Administrator":"Karyawan"}</small></span></div>
    </aside>
    <section className="workspace-main">
      <header className="workspace-header"><div><small>WORKSPACE / ATTENDANCE / HISTORY</small><h1>Riwayat Absensi</h1></div><a className="logout" href="/">Kembali ↗</a></header>
      <div className="workspace-content">
        <section className="employee-section">
          <div className="section-heading"><div><small>DATA TERSIMPAN · GOOGLE SHEETS</small><h2>{isAdmin?"Riwayat seluruh karyawan":"Riwayat kehadiran saya"}</h2><p>{total} catatan ditemukan</p></div><button className="refresh" onClick={()=>load(0)} disabled={busy}>Muat ulang ↻</button></div>
          <form className="employee-form" onSubmit={e=>{e.preventDefault();load(0);}}>
            <label>Dari tanggal<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
            <label>Sampai tanggal<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
            {isAdmin&&<label>Karyawan<select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">Semua karyawan</option>{employees.map(x=><option key={x.employee_id} value={x.employee_id}>{x.nama} · {x.nik}</option>)}</select></label>}
            <button type="submit" disabled={busy}>Terapkan filter</button>
          </form>
          {error&&<p className="auth-error">{error}</p>}
          <div className="live-table-wrap"><table className="live-table"><thead><tr>{isAdmin&&<th>Karyawan</th>}<th>Tanggal</th><th>NIK</th><th>Jam masuk</th><th>Jam pulang</th><th>Status</th></tr></thead><tbody>
            {records.map(r=><tr key={r.attendance_id}>{isAdmin&&<td>{r.nama}</td>}<td>{r.tanggal}</td><td>{r.nik}</td><td>{timeLabel(r.jam_masuk)}</td><td>{timeLabel(r.jam_pulang)}</td><td>{r.status||"—"}</td></tr>)}
            {!busy&&!records.length&&<tr><td colSpan={isAdmin?6:5}>Belum ada catatan pada rentang tanggal ini.</td></tr>}
            {busy&&!records.length&&<tr><td colSpan={isAdmin?6:5}>Memuat data dari Google Sheets...</td></tr>}
          </tbody></table></div>
          <div className="section-heading" style={{marginTop:20}}><span>Menampilkan {records.length?offset+1:0}–{Math.min(offset+records.length,total)} dari {total}</span><div style={{display:"flex",gap:8}}><button className="refresh" disabled={busy||offset===0} onClick={()=>load(Math.max(0,offset-limit))}>← Sebelumnya</button><button className="refresh" disabled={busy||offset+limit>=total} onClick={()=>load(offset+limit)}>Berikutnya →</button></div></div>
        </section>
        <footer className="workspace-footer">© 2026 Kastriva. All rights reserved.<span>Employee Attendance · v0.3.0</span></footer>
      </div>
    </section>
  </main>;
}
