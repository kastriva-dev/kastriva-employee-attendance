"use client";
import {useCallback,useEffect,useState} from "react";
import * as XLSX from "xlsx-js-style";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Employee={employee_id:string;nik:string;nama:string};
type RecordItem={attendance_id:string;employee_id:string;nama:string;nik:string;tanggal:string;jam_masuk:string|Date|null;jam_pulang:string|Date|null;status:string};
type Result={total:number;limit:number;offset:number;records:RecordItem[]};
type PhotoPreview={dataUrl:string;nama:string;nik:string;tanggal:string;phase:string;capturedAt:string|Date|null};
async function api(action:string,payload:Record<string,unknown>={}) {
  const response=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload}),cache:"no-store"});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error||"Permintaan gagal.");
  return result.data;
}
function PhotoCell({record,phase,onPreview}:{record:RecordItem;phase:"masuk"|"pulang";onPreview:(photo:PhotoPreview)=>void}){
  const [data,setData]=useState<PhotoPreview|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const node=document.getElementById("photo-cell-"+record.attendance_id+"-"+phase);
    if(!node)return;
    if(!("IntersectionObserver" in window)){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
    },{rootMargin:"160px"});
    observer.observe(node);
    return ()=>observer.disconnect();
  },[record.attendance_id,phase]);
  useEffect(()=>{
    if(!visible||!record.attendance_id)return;
    let active=true;
    setLoading(true);
    api("attendance.photo",{attendance_id:record.attendance_id,phase})
      .then(result=>{if(active)setData({dataUrl:result.dataUrl,nama:result.nama,nik:result.nik,tanggal:result.tanggal,phase:result.phase,capturedAt:result.capturedAt});})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Foto tidak tersedia.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[visible,record.attendance_id,phase]);
  const recordedTime=phase==="masuk"?record.jam_masuk:record.jam_pulang;
  if(!recordedTime)return <span style={{color:"#94a3b8"}}>—</span>;
  return <div id={"photo-cell-"+record.attendance_id+"-"+phase} style={{minWidth:72,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:5}}>
    {data?<button type="button" onClick={()=>onPreview(data)} title={"Perbesar foto "+phase} style={{display:"block",padding:2,border:"1px solid #dbe4ee",borderRadius:8,background:"#fff",cursor:"zoom-in"}}>
      <img src={data.dataUrl} alt={"Foto "+phase} loading="lazy" style={{display:"block",width:56,height:68,objectFit:"cover",borderRadius:5}}/>
    </button>:<div style={{width:60,height:72,border:"1px solid #e2e8f0",borderRadius:8,display:"grid",placeItems:"center",background:"#f8fafc",fontSize:10,color:error?"#b45309":"#64748b",textAlign:"center",padding:3}}>{loading?"Memuat…":error?"Foto tidak ada":"Menunggu"}</div>}
    <span style={{fontSize:11,fontWeight:600,color:"#334155",whiteSpace:"nowrap"}}>{timeLabel(recordedTime)} WIB</span>
  </div>;
}
function timeLabel(value:string|Date|null|undefined){
  if(!value)return "—";
  const d=value instanceof Date?value:new Date(value);
  return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"});
}
function dateTimeLabel(value:string|Date|null|undefined){
  if(!value)return "—";
  const d=value instanceof Date?value:new Date(value);
  return Number.isNaN(d.getTime())?"—":d.toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"medium"});
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
  const [photo,setPhoto]=useState<PhotoPreview|null>(null);
  const [photoZoom,setPhotoZoom]=useState(1);
  const [timestampCopied,setTimestampCopied]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [exportMessage,setExportMessage]=useState("");
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
  async function exportExcel(){
    setExporting(true);setExportMessage("");
    try{
      const result=await api("attendance.export",{from,to,employee_id:employeeId});
      const headers=["ID Absensi","ID Karyawan","Nama","NIK","Tanggal","Jam Masuk","Jam Pulang","Status","Latitude Masuk","Longitude Masuk","Akurasi Masuk (m)","Latitude Pulang","Longitude Pulang","Akurasi Pulang (m)"];
      const fields=["attendance_id","employee_id","nama","nik","tanggal","jam_masuk","jam_pulang","status","latitude_masuk","longitude_masuk","akurasi_masuk","latitude_pulang","longitude_pulang","akurasi_pulang"];
      const rows=(result.records||[]) as Record<string,unknown>[];
      const navy="17365D",blue="DCEAF7",pale="F3F7FC",white="FFFFFF",line="D7E1EC",ink="24364B";
      const aoa:unknown[][]=[
        ["REKAP ABSENSI KARYAWAN"],
        ["Periode",from||"Awal data","s.d.",to||"Data terakhir"],
        ["Total data",rows.length,"Diekspor",new Date().toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})],
        [],
        headers,
        ...rows.map(row=>fields.map(key=>{
          const value=row[key];
          if(value==null||value==="")return "";
          if(key==="jam_masuk"||key==="jam_pulang"){
            const date=new Date(String(value));
            return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
          }
          if(key==="tanggal"){
            const raw=String(value);
            const match=raw.match(/^(\\d{4}-\\d{2}-\\d{2})/);
            return match?match[1]:raw;
          }
          return value;
        }))
      ];
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:13}}];
      ws["!cols"]=[{wch:22},{wch:19},{wch:25},{wch:17},{wch:14},{wch:12},{wch:12},{wch:15},{wch:17},{wch:18},{wch:19},{wch:17},{wch:18},{wch:19}];
      ws["!rows"]=[{hpt:30},{hpt:22},{hpt:22},{hpt:10},{hpt:28}];
      const range=XLSX.utils.decode_range(ws["!ref"]||"A1:N5");
      for(let R=0;R<=range.e.r;R++){
        for(let C=0;C<=13;C++){
          const address=XLSX.utils.encode_cell({r:R,c:C});
          const cell=ws[address];
          if(!cell)continue;
          cell.s={font:{name:"Aptos",sz:10,color:{rgb:ink}},alignment:{vertical:"center",wrapText:R===4},border:{bottom:{style:"thin",color:{rgb:line}}}};
          if(R===0)cell.s={font:{name:"Aptos Display",sz:16,bold:true,color:{rgb:white}},fill:{fgColor:{rgb:navy}},alignment:{vertical:"center",horizontal:"left"}};
          else if(R===1||R===2)cell.s={font:{name:"Aptos",sz:10,bold:C%2===0,color:{rgb:ink}},fill:{fgColor:{rgb:"EAF1F8"}},alignment:{vertical:"center"}};
          else if(R===4)cell.s={font:{name:"Aptos",sz:10,bold:true,color:{rgb:white}},fill:{fgColor:{rgb:navy}},alignment:{vertical:"center",horizontal:"center",wrapText:true},border:{bottom:{style:"medium",color:{rgb:"5B9BD5"}}}};
          else if(R>=5)cell.s={font:{name:"Aptos",sz:10,color:{rgb:ink}},fill:{fgColor:{rgb:(R-5)%2===0?white:pale}},alignment:{vertical:"center"},border:{bottom:{style:"hair",color:{rgb:line}}}};
        }
      }
      for(let R=5;R<=range.e.r;R++){
        const statusCell=ws[XLSX.utils.encode_cell({r:R,c:7})];
        if(statusCell&&String(statusCell.v).toUpperCase().includes("HADIR"))statusCell.s={...statusCell.s,font:{name:"Aptos",sz:10,bold:true,color:{rgb:"18794E"}},fill:{fgColor:{rgb:"E4F5EC"}},alignment:{vertical:"center",horizontal:"center"}};
        for(const C of [8,9,10,11,12,13]){
          const cell=ws[XLSX.utils.encode_cell({r:R,c:C})];
          if(cell&&cell.v!==""&&cell.v!=null&&Number.isFinite(Number(cell.v)))cell.t="n";
        }
      }
      ws["!autofilter"]={ref:`A5:N${Math.max(5,range.e.r+1)}`};
      ws["!freeze"]={xSplit:0,ySplit:5,topLeftCell:"A6",activePane:"bottomLeft",state:"frozen"};
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,"Rekap Absensi");
      wb.Props={Title:"Rekap Absensi Karyawan",Subject:"Laporan kehadiran",Author:"Kastriva Employee Attendance",CreatedDate:new Date()};
      const fileName="rekap-absensi-"+(from||"awal")+"-sd-"+(to||"terakhir")+".xlsx";
      XLSX.writeFile(wb,fileName,{bookType:"xlsx",compression:true});
      setExportMessage(rows.length+" baris berhasil diekspor ke Excel (.xlsx).");
    }catch(e){setExportMessage(e instanceof Error?e.message:"Gagal mengekspor rekap.");}
    finally{setExporting(false);}
  }
  const isAdmin=user?.role==="admin";
  useEffect(()=>{setPhotoZoom(1);setTimestampCopied(false);},[photo?.dataUrl]);
  const copyPhotoTimestamp=async()=>{
    if(!photo?.capturedAt)return;
    const value=dateTimeLabel(photo.capturedAt)+" WIB";
    try{await navigator.clipboard.writeText(value);setTimestampCopied(true);window.setTimeout(()=>setTimestampCopied(false),1800);}
    catch{setTimestampCopied(false);}
  };

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
          <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"14px 0"}}><button type="button" className="refresh" onClick={exportExcel} disabled={exporting}>{exporting?"Menyiapkan...":"Unduh Excel (.xlsx) ↓"}</button></div>{exportMessage&&<p className="attendance-muted">{exportMessage}</p>}
          {error&&<p className="auth-error">{error}</p>}
          <div className="live-table-wrap"><table className="live-table"><thead><tr>{isAdmin&&<th>Karyawan</th>}<th>Tanggal</th><th>NIK</th>{!isAdmin&&<><th>Jam masuk</th><th>Jam pulang</th></>}<th>Status</th>{isAdmin&&<><th>Foto masuk · waktu</th><th>Foto pulang · waktu</th></>}</tr></thead><tbody>
            {records.map(r=><tr key={r.attendance_id}>{isAdmin&&<td>{r.nama}</td>}<td>{r.tanggal}</td><td>{r.nik}</td>{!isAdmin&&<><td>{timeLabel(r.jam_masuk)}</td><td>{timeLabel(r.jam_pulang)}</td></>}<td>{r.status||"—"}</td>{isAdmin&&<><td><PhotoCell record={r} phase="masuk" onPreview={setPhoto}/></td><td><PhotoCell record={r} phase="pulang" onPreview={setPhoto}/></td></>}</tr>)}
            {!busy&&!records.length&&<tr><td colSpan={isAdmin?6:5}>Belum ada catatan pada rentang tanggal ini.</td></tr>}
            {busy&&!records.length&&<tr><td colSpan={isAdmin?6:5}>Memuat data dari Google Sheets...</td></tr>}
          </tbody></table></div>
          <div className="section-heading" style={{marginTop:20}}><span>Menampilkan {records.length?offset+1:0}–{Math.min(offset+records.length,total)} dari {total}</span><div style={{display:"flex",gap:8}}><button className="refresh" disabled={busy||offset===0} onClick={()=>load(Math.max(0,offset-limit))}>← Sebelumnya</button><button className="refresh" disabled={busy||offset+limit>=total} onClick={()=>load(offset+limit)}>Berikutnya →</button></div></div>
        </section>
        <footer className="workspace-footer">© 2026 Kastriva. All rights reserved.<span>Employee Attendance · v0.3.0</span></footer>
      </div>
    </section>
    {photo&&<div role="dialog" aria-modal="true" aria-label="Pratinjau bukti selfie" onClick={()=>setPhoto(null)} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(7,18,31,.78)",display:"grid",placeItems:"center",padding:18}}>
      <section onClick={e=>e.stopPropagation()} style={{width:"min(100%,520px)",maxHeight:"92vh",overflow:"auto",background:"#fff",borderRadius:18,padding:18,boxShadow:"0 24px 80px rgba(0,0,0,.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12}}><div><small style={{color:"#64748b"}}>BUKTI SELFIE · {photo.phase.toUpperCase()}</small><h2 style={{margin:"4px 0",fontSize:20,color:"#173653"}}>{photo.nama}</h2></div><button className="refresh" onClick={()=>setPhoto(null)}>Tutup ✕</button></div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}><small style={{color:"#64748b"}}>Scroll roda mouse di atas foto untuk zoom · Gunakan tombol + / −</small><div style={{display:"flex",gap:6,alignItems:"center"}}><button type="button" className="refresh" onClick={()=>setPhotoZoom(z=>Math.max(1,Number((z-.25).toFixed(2))))} disabled={photoZoom<=1}>−</button><span style={{fontSize:12,minWidth:44,textAlign:"center"}}>{Math.round(photoZoom*100)}%</span><button type="button" className="refresh" onClick={()=>setPhotoZoom(z=>Math.min(4,Number((z+.25).toFixed(2))))} disabled={photoZoom>=4}>+</button><button type="button" className="refresh" onClick={()=>setPhotoZoom(1)}>Reset</button></div></div>
        <div onWheel={e=>{e.preventDefault();setPhotoZoom(z=>Math.max(1,Math.min(4,Number((z+(e.deltaY<0?.2:-.2)).toFixed(2)))));}} style={{width:"100%",height:"min(62vh,620px)",overflow:"auto",borderRadius:12,background:"#eef2f7",cursor:photoZoom>1?"grab":"zoom-in",overscrollBehavior:"contain"}}><div style={{minWidth:photoZoom>1?`${photoZoom*100}%`:"100%",minHeight:photoZoom>1?`${photoZoom*100}%`:"100%",display:"grid",placeItems:"center"}}><img src={photo.dataUrl} alt={"Bukti selfie "+photo.phase+" "+photo.nama} draggable={false} style={{display:"block",width:`${photoZoom*100}%`,maxWidth:"none",height:"auto",objectFit:"contain",borderRadius:12,transition:"width .12s ease"}}/></div></div>
        <div style={{fontSize:13,lineHeight:1.7,color:"#475569",marginTop:12}}><div><b>NIK:</b> {photo.nik}</div><div><b>Tanggal:</b> {photo.tanggal}</div><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span><b>Waktu tercatat:</b> {dateTimeLabel(photo.capturedAt)} WIB</span><button type="button" className="refresh" onClick={copyPhotoTimestamp}>{timestampCopied?"Tersalin ✓":"Salin timestamp"}</button></div><small>Foto diambil dari Drive privat dan hanya ditampilkan kepada administrator. Timestamp yang disalin berasal dari catatan absensi server.</small></div>
      </section>
    </div>}
  </main>;
}
