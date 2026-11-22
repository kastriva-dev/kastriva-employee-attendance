"use client";

import {useCallback,useEffect,useRef,useState} from "react";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Attendance={attendance_id:string;tanggal:string;jam_masuk:string|Date|null;jam_pulang:string|Date|null;status:string};
type Office={configured:boolean;latitude:number|null;longitude:number|null;radiusMeters:number};
type Geo={latitude:number;longitude:number;accuracy:number};
type AttendanceAction="attendance.checkIn"|"attendance.checkOut";

async function api(action:string,payload:Record<string,unknown>={}) {
  const response=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload}),cache:"no-store"});
  const result=await response.json();
  if(!response.ok||!result.ok) throw new Error(result.error||"Permintaan gagal.");
  return result.data;
}

function getPosition():Promise<Geo>{
  return new Promise((resolve,reject)=>{
    if(!("geolocation" in navigator)){reject(new Error("Browser tidak mendukung GPS."));return;}
    navigator.geolocation.getCurrentPosition(
      p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>reject(new Error(e.code===1?"Izin lokasi ditolak. Izinkan akses lokasi pada browser.":e.code===2?"Lokasi tidak dapat ditemukan. Aktifkan GPS lalu coba lagi.":"Waktu mengambil lokasi habis. Coba kembali.")),
      {enableHighAccuracy:true,timeout:20000,maximumAge:0}
    );
  });
}

function timeLabel(value:string|Date|null|undefined){
  if(!value)return "—";
  const d=value instanceof Date?value:new Date(value);
  return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

function localStamp(){
  return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"medium"}).format(new Date());
}

export default function AttendancePage(){
  const [user,setUser]=useState<User|null>(null);
  const [record,setRecord]=useState<Attendance|null>(null);
  const [office,setOffice]=useState<Office|null>(null);
  const [radius,setRadius]=useState("100");
  const [officeLatitude,setOfficeLatitude]=useState("");
  const [officeLongitude,setOfficeLongitude]=useState("");
  const [busy,setBusy]=useState(false);
  const [checking,setChecking]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [geo,setGeo]=useState<Geo|null>(null);
  const [cameraOpen,setCameraOpen]=useState(false);
  const [cameraReady,setCameraReady]=useState(false);
  const [cameraError,setCameraError]=useState("");
  const [photoDataUrl,setPhotoDataUrl]=useState("");
  const [pendingAction,setPendingAction]=useState<AttendanceAction|null>(null);
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null);

  const refresh=useCallback(async()=>{
    const d=await api("attendance.today");
    setRecord(d.record||null);
    setOffice(d.office||null);
    if(d.office?.radiusMeters)setRadius(String(d.office.radiusMeters));
    if(d.office?.configured){setOfficeLatitude(String(d.office.latitude));setOfficeLongitude(String(d.office.longitude));}
  },[]);

  useEffect(()=>{
    api("auth.me").then(async d=>{setUser(d.user);await refresh();})
      .catch(()=>{window.location.href="/";})
      .finally(()=>setChecking(false));
  },[refresh]);

  useEffect(()=>{
    if(!cameraOpen)return;
    let cancelled=false;
    setCameraReady(false);
    setCameraError("");
    const start=async()=>{
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error("Browser tidak mendukung kamera. Gunakan Chrome atau browser terbaru melalui HTTPS.");
        const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"user"},width:{ideal:720},height:{ideal:540}}});
        if(cancelled){stream.getTracks().forEach(track=>track.stop());return;}
        streamRef.current=stream;
        if(videoRef.current){
          videoRef.current.srcObject=stream;
          await videoRef.current.play();
          if(!cancelled)setCameraReady(true);
        }
      }catch(e){
        if(!cancelled)setCameraError(e instanceof Error?e.message:"Tidak dapat membuka kamera. Periksa izin kamera browser.");
      }
    };
    void start();
    return ()=>{
      cancelled=true;
      if(streamRef.current){streamRef.current.getTracks().forEach(track=>track.stop());streamRef.current=null;}
    };
  },[cameraOpen]);

  async function locate(){
    setBusy(true);setError("");setNotice("");
    try{const p=await getPosition();setGeo(p);setOfficeLatitude(String(p.latitude));setOfficeLongitude(String(p.longitude));setNotice("Lokasi berhasil diperoleh. Akurasi ±"+Math.round(p.accuracy)+" meter.");}
    catch(e){setError(e instanceof Error?e.message:"Gagal mengambil lokasi.");}
    finally{setBusy(false);}
  }

  async function saveOffice(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      const latitude=Number(officeLatitude);const longitude=Number(officeLongitude);
      if(!officeLatitude.trim()||!officeLongitude.trim()||!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error("Isi koordinat latitude dan longitude kantor yang valid.");
      const d=await api("settings.office.update",{latitude,longitude,radiusMeters:Number(radius)});
      setOffice(d.office);setNotice("Lokasi kantor dan radius geofence berhasil disimpan.");
    }catch(e){setError(e instanceof Error?e.message:"Gagal menyimpan lokasi kantor.");}
    finally{setBusy(false);}
  }

  async function beginAttendance(action:AttendanceAction){
    setBusy(true);setError("");setNotice("");setPhotoDataUrl("");setPendingAction(action);
    try{
      const p=await getPosition();
      if(p.accuracy>200)throw new Error("Akurasi GPS "+Math.round(p.accuracy)+" meter. Maksimal 200 meter; coba di area terbuka.");
      setGeo(p);
      setCameraOpen(true);
    }catch(e){setError(e instanceof Error?e.message:"Gagal mengambil lokasi GPS.");setPendingAction(null);}
    finally{setBusy(false);}
  }

  function capturePhoto(){
    const video=videoRef.current;
    if(!video||!cameraReady||!geo||!user){setCameraError("Kamera atau data lokasi belum siap.");return;}
    const sourceWidth=video.videoWidth;
    const sourceHeight=video.videoHeight;
    if(!sourceWidth||!sourceHeight){setCameraError("Tunggu sampai gambar kamera tampil, lalu ambil foto kembali.");return;}
    const scale=Math.min(1,720/sourceWidth);
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(sourceWidth*scale);
    canvas.height=Math.round(sourceHeight*scale);
    const ctx=canvas.getContext("2d");
    if(!ctx){setCameraError("Tidak dapat memproses foto pada perangkat ini.");return;}
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const bandHeight=Math.min(112,Math.max(94,canvas.height*.24));
    ctx.fillStyle="rgba(10,25,42,0.82)";
    ctx.fillRect(0,canvas.height-bandHeight,canvas.width,bandHeight);
    ctx.fillStyle="#ffffff";
    ctx.font="bold 16px Arial";
    ctx.fillText("KASTRIVA • BUKTI ABSENSI",14,canvas.height-bandHeight+23);
    ctx.font="14px Arial";
    ctx.fillText(user.nama+"  |  NIK: "+user.nik,14,canvas.height-bandHeight+46);
    ctx.fillText(localStamp(),14,canvas.height-bandHeight+68);
    ctx.font="12px Arial";
    ctx.fillText("GPS: "+geo.latitude.toFixed(6)+", "+geo.longitude.toFixed(6)+"  ±"+Math.round(geo.accuracy)+"m",14,canvas.height-bandHeight+88);
    setPhotoDataUrl(canvas.toDataURL("image/jpeg",0.72));
    setCameraOpen(false);
    setCameraError("");
  }

  async function sendAttendance(){
    if(!pendingAction||!photoDataUrl||!geo){setError("Selfie dan lokasi GPS wajib tersedia sebelum absensi dikirim.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const d=await api(pendingAction,{...geo,imageDataUrl:photoDataUrl});
      setRecord(d.record||null);
      setNotice((pendingAction==="attendance.checkIn"?"Absensi masuk":"Absensi pulang")+" berhasil dicatat dengan selfie dan GPS. Jarak dari kantor: "+d.distanceMeters+" meter.");
      setPhotoDataUrl("");setPendingAction(null);
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Absensi gagal.");}
    finally{setBusy(false);}
  }

  function cancelCapture(){
    setCameraOpen(false);setPhotoDataUrl("");setPendingAction(null);setCameraError("");
  }

  async function logout(){
    setBusy(true);
    try{await api("auth.logout");}finally{window.location.href="/";}
  }

  if(checking)return <main className="auth-shell"><div className="auth-card">Memeriksa sesi...</div></main>;
  if(!user)return <main className="auth-shell"><div className="auth-card">Sesi tidak ditemukan. <a href="/">Kembali ke login</a></div></main>;

  const checkedIn=Boolean(record?.jam_masuk);
  const checkedOut=Boolean(record?.jam_pulang);
  const actionLabel=pendingAction==="attendance.checkIn"?"Absen Masuk":"Absen Pulang";

  return <main className="workspace">
    <aside className="workspace-side">
      <div className="auth-brand"><b>K</b><span><strong>KASTRIVA</strong><small>EMPLOYEE SYSTEM</small></span></div>
      <div className="side-caption">WORKSPACE</div>
      <a className="side-link" href="/">▦　Ringkasan</a>
      <div className="side-link active">◎　Absensi GPS</div>
      <div className="side-user"><i>{user.nama.slice(0,1).toUpperCase()}</i><span><b>{user.nama}</b><small>{user.role==="admin"?"Administrator":"Karyawan"}</small></span></div>
    </aside>
    <section className="workspace-main">
      <header className="workspace-header"><div><small>WORKSPACE / ATTENDANCE</small><h1>Absensi GPS & Selfie</h1></div><button className="logout" onClick={logout} disabled={busy}>Keluar ↗</button></header>
      <div className="attendance-wrap">
        <a className="attendance-back" href="/">← Kembali ke dashboard</a>
        <section className="welcome-panel"><div><span className="welcome-tag">KASTRIVA EMPLOYEE ATTENDANCE</span><h2>Hadir dengan bukti<br/><em>lokasi dan selfie.</em></h2><p>Absensi hanya diterima jika perangkat berada dalam radius kantor dan foto diambil langsung melalui kamera.</p></div><div className="welcome-mark">GPS</div></section>
        <section className="attendance-card">
          <div className="section-heading"><div><small>KEHADIRAN HARI INI</small><h2>{record?.tanggal||new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Jakarta"})}</h2></div><button className="refresh" onClick={()=>refresh()} disabled={busy}>Perbarui ↻</button></div>
          <div className="attendance-status">
            <div className="attendance-chip">Masuk: <b>{timeLabel(record?.jam_masuk)}</b></div>
            <div className="attendance-chip">Pulang: <b>{timeLabel(record?.jam_pulang)}</b></div>
            <div className="attendance-chip">Status: <b>{record?.status||"Belum absen"}</b></div>
          </div>
          <p className="attendance-muted">{office?.configured?"Radius kantor aktif: "+office.radiusMeters+" meter.":"Lokasi kantor belum dikonfigurasi oleh administrator."} GPS harus memiliki akurasi maksimal 200 meter. Selfie kamera wajib.</p>
          {geo&&<p className="attendance-muted">Lokasi perangkat: {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)} · akurasi ±{Math.round(geo.accuracy)} m</p>}
          <div className="attendance-actions">
            <button className="secondary" onClick={locate} disabled={busy}>Ambil lokasi GPS</button>
            <button onClick={()=>beginAttendance("attendance.checkIn")} disabled={busy||!office?.configured||checkedIn}>{busy?"Memproses...":"Absen Masuk + Selfie"}</button>
            <button onClick={()=>beginAttendance("attendance.checkOut")} disabled={busy||!office?.configured||!checkedIn||checkedOut}>{busy?"Memproses...":"Absen Pulang + Selfie"}</button>
          </div>
          {photoDataUrl&&<div className="selfie-review"><p>Periksa foto sebelum dikirim. Foto ini diambil langsung dari kamera perangkat.</p><img src={photoDataUrl} alt="Pratinjau selfie absensi"/><div className="attendance-actions"><button className="secondary" onClick={()=>{setPhotoDataUrl("");setCameraOpen(true);}} disabled={busy}>Ambil ulang</button><button onClick={sendAttendance} disabled={busy}>{busy?"Mengirim...":"Konfirmasi & Kirim "+actionLabel}</button></div></div>}
          {checkedOut&&<p className="attendance-success">Absensi hari ini sudah lengkap.</p>}
          {error&&<p className="attendance-error">{error}</p>}
          {notice&&<p className="attendance-success">{notice}</p>}
        </section>
        {cameraOpen&&<section className="attendance-card camera-card">
          <div className="section-heading"><div><small>VERIFIKASI WAJIB</small><h2>Ambil selfie {actionLabel}</h2></div><span>Kamera langsung</span></div>
          <p className="attendance-muted">Posisikan wajah di dalam bingkai. Tidak tersedia pilihan unggah atau galeri.</p>
          {cameraError&&<p className="attendance-error">{cameraError}</p>}
          <div className="camera-frame"><video ref={videoRef} autoPlay playsInline muted className="camera-video"/>{!cameraReady&&<div className="camera-loading">{cameraError?"Kamera belum aktif":"Mengaktifkan kamera..."}</div>}</div>
          <div className="attendance-actions"><button className="secondary" onClick={cancelCapture} disabled={busy}>Batal</button><button onClick={capturePhoto} disabled={!cameraReady||busy}>Ambil Foto Selfie</button></div>
        </section>}
        {user.role==="admin"&&<section className="attendance-card">
          <div className="section-heading"><div><small>ADMINISTRATOR</small><h2>Pengaturan lokasi kantor</h2></div><span>{office?.configured?"Sudah dikonfigurasi":"Belum diatur"}</span></div>
          <p className="attendance-muted">Berdirilah di titik kantor yang akan dijadikan pusat geofence, lalu ambil lokasi GPS. Atur radius antara 30–1.000 meter.</p>
          <form className="attendance-form" onSubmit={saveOffice}>
            <label>Latitude<input value={officeLatitude} onChange={e=>setOfficeLatitude(e.target.value)} inputMode="decimal" placeholder="Contoh: -6.200000"/></label>
            <label>Longitude<input value={officeLongitude} onChange={e=>setOfficeLongitude(e.target.value)} inputMode="decimal" placeholder="Contoh: 106.816666"/></label>
            <label>Radius kantor (meter)<input type="number" min="30" max="1000" step="1" value={radius} onChange={e=>setRadius(e.target.value)} required/></label>
            <div className="attendance-actions"><button type="button" className="secondary" onClick={locate} disabled={busy}>Gunakan lokasi saya</button><button type="submit" disabled={busy||!officeLatitude.trim()||!officeLongitude.trim()}>{busy?"Menyimpan...":"Simpan lokasi kantor"}</button></div>
          </form>
          {office?.configured&&<p className="attendance-muted">Titik tersimpan: {office.latitude?.toFixed(6)}, {office.longitude?.toFixed(6)} · radius {office.radiusMeters} meter.</p>}
        </section>}
        <p className="attendance-muted">Foto selfie disimpan secara privat di Google Drive. Jangan menutup halaman saat proses pengiriman berlangsung.</p>
      </div>
    </section>
  </main>;
}
