"use client";
import {useState} from "react";
export default function Home(){
 const [status,setStatus]=useState("Belum diperiksa");
 const [message,setMessage]=useState("Backend GAS belum diperiksa.");
 const [busy,setBusy]=useState(false);
 async function ping(){
  setBusy(true);setStatus("Memeriksa...");setMessage("Menghubungkan ke Google Apps Script...");
  try{
   const r=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"ping",payload:{}})});
   const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Koneksi gagal");
   setStatus("Terhubung");setMessage("Koneksi berhasil. Waktu server: "+new Date(d.timestamp).toLocaleString("id-ID"));
  }catch(e){setStatus("Belum terhubung");setMessage(e instanceof Error?e.message:"Koneksi gagal");}
  finally{setBusy(false);}
 }
 return <main className="shell">
  <aside className="side"><div className="brand"><b>K</b><span><strong>KASTRIVA</strong><small>EMPLOYEE SYSTEM</small></span></div><p className="navcap">WORKSPACE</p><div className="nav active">▦　Ringkasan</div><div className="nav muted">◷　Data Absensi <small>Segera</small></div><div className="nav muted">♙　Karyawan <small>Segera</small></div><div className="nav muted">⚙　Pengaturan <small>Segera</small></div><div className="profile"><i>K</i><span><b>Kastriva Admin</b><small>Administrator</small></span></div></aside>
  <section className="main"><header><div><small>WORKSPACE / OVERVIEW</small><h1>Ringkasan Sistem</h1></div><label><i/> Sistem fondasi <b>KA</b></label></header>
   <div className="content"><section className="hero"><div><span className="pill">ATTENDANCE MANAGEMENT</span><h2>Kelola kehadiran,<br/><em>lebih mudah dan terukur.</em></h2><p>Fondasi sistem absensi digital Kastriva. Integrasi data akan menghubungkan aplikasi, Google Sheets, dan Google Drive.</p></div><div className="visual"><div className="orbit"></div><div className="paper"><b>✓</b><span>ATTENDANCE<br/><strong>READY TO BUILD</strong></span></div></div></section>
    <div className="heading"><div><small>SYSTEM MONITORING</small><h3>Status Integrasi</h3></div><span>Tahap 01 · Foundation</span></div>
    <div className="grid">
     <article><i className="ico blue">N</i><span className="tag ok">READY</span><h4>Next.js Application</h4><p>Antarmuka web dan server API proxy.</p><footer>● Berjalan di aplikasi</footer></article>
     <article><i className="ico purple">G</i><span className="tag">{status.toUpperCase()}</span><h4>Google Apps Script</h4><p>Backend untuk validasi dan pengolahan data.</p><footer>● {status}</footer></article>
     <article><i className="ico green">▤</i><span className="tag">NEXT STEP</span><h4>Google Spreadsheet</h4><p>Penyimpanan data karyawan dan kehadiran.</p><footer>● Menunggu inisialisasi GAS</footer></article>
     <article><i className="ico amber">▣</i><span className="tag">NEXT STEP</span><h4>Google Drive</h4><p>Penyimpanan foto selfie dengan retensi terkontrol.</p><footer>● Retensi maksimal 14 hari</footer></article>
    </div>
    <section className="connect"><div><small>CONNECTION TEST</small><h3>Uji koneksi backend</h3><p>{message}</p></div><button onClick={ping} disabled={busy}>{busy?"Memeriksa...":"Uji koneksi GAS"}　↗</button></section>
    <footer className="copyright">© 2026 Kastriva. All rights reserved.<span>Employee Attendance · Foundation v0.1.0</span></footer>
   </div>
  </section>
 </main>;
}
