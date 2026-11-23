"use client";

import {useCallback,useEffect,useRef,useState} from "react";

type User={employee_id:string;nik:string;nama:string;jabatan:string;role:string;status:string};
type Attendance={attendance_id:string;tanggal:string;jam_masuk:string|Date|null;jam_pulang:string|Date|null;status:string};
type Office={configured:boolean;latitude:number|null;longitude:number|null;radiusMeters:number;allowAnyLocation:boolean};
type Geo={latitude:number;longitude:number;accuracy:number};

async function reverseGeocode(position:Geo):Promise<string>{
  const query=new URLSearchParams({lat:String(position.latitude),lon:String(position.longitude)});
  const response=await fetch("/api/reverse-geocode?"+query.toString(),{cache:"no-store",signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new Error("Alamat GPS tidak tersedia.");
  const result=await response.json();
  return typeof result.address==="string"?result.address:"";
}

async function api(action:string,payload:Record<string,unknown>={}) {
  const response=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload}),cache:"no-store"});
  const result=await response.json();
  if(!response.ok||!result.ok) throw new Error(result.error||"Permintaan gagal.");
  return result.data;
}

function formatAttendanceDate(value:string|undefined){
  if(!value)return "Memuat tanggal...";
  const dateOnly=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date=dateOnly?new Date(Number(dateOnly[1]),Number(dateOnly[2])-1,Number(dateOnly[3])):new Date(value);
  if(Number.isNaN(date.getTime()))return value;
  return date.toLocaleDateString("id-ID",{...(dateOnly?{}:{timeZone:"Asia/Jakarta"}),day:"numeric",month:"long",year:"numeric"});
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

export default function AttendancePage(){
  const [user,setUser]=useState<User|null>(null);
  const [record,setRecord]=useState<Attendance|null>(null);
  const [office,setOffice]=useState<Office|null>(null);
  const [radius,setRadius]=useState("100");
  const [allowAnyLocation,setAllowAnyLocation]=useState(false);
  const [officeLatitude,setOfficeLatitude]=useState("");
  const [officeLongitude,setOfficeLongitude]=useState("");
  const [busy,setBusy]=useState(false);
  const [checking,setChecking]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [geo,setGeo]=useState<Geo|null>(null);
  const [geoAddress,setGeoAddress]=useState("");
  const [photoData,setPhotoData]=useState("");
  const [photoPreview,setPhotoPreview]=useState("");
  const [pendingAction,setPendingAction]=useState<"attendance.checkIn"|"attendance.checkOut"|null>(null);
  const videoRef=useRef<HTMLVideoElement>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const [cameraOpen,setCameraOpen]=useState(false);
  const [cameraReady,setCameraReady]=useState(false);

  const refresh=useCallback(async()=>{
    const d=await api("attendance.today");
    setRecord(d.record||null);
    setOffice(d.office||null);
    setAllowAnyLocation(Boolean(d.office?.allowAnyLocation));
    if(d.office?.radiusMeters)setRadius(String(d.office.radiusMeters));
    if(d.office?.configured){setOfficeLatitude(String(d.office.latitude));setOfficeLongitude(String(d.office.longitude));}
  },[]);

  useEffect(()=>{
    api("auth.me").then(async d=>{setUser(d.user);await refresh();})
      .catch(()=>{window.location.href="/";})
      .finally(()=>setChecking(false));
  },[refresh]);

  function stopLiveCamera(){
    streamRef.current?.getTracks().forEach(track=>track.stop());
    streamRef.current=null;
    if(videoRef.current)videoRef.current.srcObject=null;
    setCameraOpen(false);setCameraReady(false);
  }

  async function openLiveCamera(){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("Kamera langsung tidak didukung browser ini. Gunakan Chrome terbaru melalui HTTPS.");
    stopLiveCamera();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"user"},width:{ideal:1280},height:{ideal:720}}});
      streamRef.current=stream;setCameraOpen(true);setCameraReady(false);
    }catch(e){
      const name=e instanceof Error?e.name:"";
      if(name==="NotAllowedError"||name==="PermissionDeniedError")throw new Error("Izin kamera ditolak. Izinkan akses kamera pada browser untuk melakukan absensi.");
      if(name==="NotFoundError"||name==="DevicesNotFoundError")throw new Error("Kamera tidak ditemukan pada perangkat ini.");
      throw new Error("Kamera tidak dapat dibuka. Pastikan kamera tidak sedang digunakan aplikasi lain, lalu coba lagi.");
    }
  }

  useEffect(()=>{
    if(!cameraOpen||!videoRef.current||!streamRef.current)return;
    const video=videoRef.current;video.srcObject=streamRef.current;
    video.play().then(()=>setCameraReady(true)).catch(()=>setError("Video kamera gagal dimulai. Tutup aplikasi lain yang menggunakan kamera lalu coba lagi."));
  },[cameraOpen]);

  useEffect(()=>()=>{streamRef.current?.getTracks().forEach(track=>track.stop());},[]);

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
      if(!allowAnyLocation&&(!officeLatitude.trim()||!officeLongitude.trim()||!Number.isFinite(latitude)||!Number.isFinite(longitude)))throw new Error("Isi koordinat latitude dan longitude kantor yang valid.");
      if((officeLatitude.trim()||officeLongitude.trim())&&(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180))throw new Error("Koordinat kantor tidak valid.");
      const d=await api("settings.office.update",{latitude:officeLatitude.trim()?latitude:null,longitude:officeLongitude.trim()?longitude:null,radiusMeters:Number(radius),allowAnyLocation});
      setOffice(d.office);setAllowAnyLocation(Boolean(d.office?.allowAnyLocation));setNotice("Pengaturan lokasi kantor berhasil disimpan.");
    }catch(e){setError(e instanceof Error?e.message:"Gagal menyimpan lokasi kantor.");}
    finally{setBusy(false);}
  }

  async function prepareAttendance(action:"attendance.checkIn"|"attendance.checkOut"){
    setBusy(true);setError("");setNotice("");setPhotoData("");setPhotoPreview("");
    try{
      const p=await getPosition();setGeo(p);setGeoAddress("");setPendingAction(action);
      setNotice("GPS terkunci. Mengambil alamat lokasi...");
      try{const address=await reverseGeocode(p);setGeoAddress(address);}
      catch{setGeoAddress("");}
      setNotice("GPS siap. Membuka kamera langsung...");
      await openLiveCamera();
      setNotice("Kamera aktif. Ambil foto langsung dari kamera untuk melanjutkan.");
    }catch(e){setError(e instanceof Error?e.message:"Gagal mengambil lokasi GPS.");}
    finally{setBusy(false);}
  }

  function captureLiveSelfie(){
    const video=videoRef.current;
    if(!video||!streamRef.current||!cameraReady||video.readyState<2){setError("Kamera belum siap. Tunggu gambar kamera tampil, lalu coba lagi.");return;}
    if(!geo||!pendingAction){setError("Ambil lokasi GPS terlebih dahulu.");return;}
    setBusy(true);setError("");
    try{
      const scale=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
      const canvas=document.createElement("canvas");
      canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
      const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Tidak dapat memproses foto.");
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const h=Math.max(125,Math.round(canvas.height*0.25));
      ctx.fillStyle="rgba(8,22,38,.78)";ctx.fillRect(0,canvas.height-h,canvas.width,h);
      const size=Math.max(13,Math.round(canvas.width*0.027));ctx.fillStyle="#fff";
      ctx.font="bold "+size+"px Arial";ctx.fillText("KASTRIVA • BUKTI ABSENSI",16,canvas.height-h+size+8);
      ctx.font=Math.max(11,Math.round(size*.78))+"px Arial";
      const stamp=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"full",timeStyle:"medium"}).format(new Date());
      ctx.fillText(stamp+" WIB",16,canvas.height-h+size*2.5,canvas.width-32);
      const addressLine="Lokasi: "+(geoAddress||"Alamat tidak tersedia");
      ctx.fillText(addressLine.length>105?addressLine.slice(0,102)+"…":addressLine,16,canvas.height-h+size*3.7,canvas.width-32);
      ctx.fillText("GPS "+geo.latitude.toFixed(6)+", "+geo.longitude.toFixed(6)+" • ±"+Math.round(geo.accuracy)+" m",16,canvas.height-h+size*4.9,canvas.width-32);
      const data=canvas.toDataURL("image/jpeg",0.68);
      if(data.length>235000)throw new Error("Ukuran foto masih terlalu besar. Coba ambil ulang.");
      setPhotoData(data);setPhotoPreview(data);setNotice("Selfie kamera langsung siap. Periksa foto, lalu kirim absensi.");
      stopLiveCamera();
    }catch(e){setError(e instanceof Error?e.message:"Gagal memproses selfie.");}
    finally{setBusy(false);}
  }

  async function submitAttendance(){
    if(!pendingAction||!photoData){setError("Selfie wajib diambil sebelum mengirim absensi.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const p=geo||await getPosition();
      const d=await api(pendingAction,{...p,photoData});
      setRecord(d.record||null);
      setNotice((pendingAction==="attendance.checkIn"?"Absensi masuk":"Absensi pulang")+" berhasil dicatat beserta selfie."+ (d.distanceMeters==null?" Mode bebas lokasi aktif; koordinat GPS tetap tersimpan.":" Jarak dari titik kantor: "+d.distanceMeters+" meter."));
      setPhotoData("");setPhotoPreview("");setPendingAction(null);stopLiveCamera();
    }catch(e){setError(e instanceof Error?e.message:"Absensi gagal.");}
    finally{setBusy(false);}
  }

  async function logout(){
    stopLiveCamera();setBusy(true);
    try{await api("auth.logout");}finally{window.location.href="/";}
  }

  if(checking)return <main className="auth-shell"><div className="auth-card">Memeriksa sesi...</div></main>;
  if(!user)return <main className="auth-shell"><div className="auth-card">Sesi tidak ditemukan. <a href="/">Kembali ke login</a></div></main>;

  const checkedIn=Boolean(record?.jam_masuk);
  const checkedOut=Boolean(record?.jam_pulang);

  return <main className="workspace">
    <aside className="workspace-side">
      <div className="auth-brand"><img src="/kastriva-employee-attendance-mark.svg" alt="Kastriva" /><span><strong>KASTRIVA</strong><small>EMPLOYEE SYSTEM</small></span></div>
      <div className="side-caption">WORKSPACE</div>
      <a className="side-link" href="/"><span className="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/></svg></span><span className="nav-label">Dashboard</span></a>
      <a className="side-link active" aria-current="page" href="/attendance"><span className="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/><path d="m16.5 5.5 1.5-1.5"/></svg></span><span className="nav-label">Absensi GPS</span></a><a className="side-link" href="/attendance/history"><span className="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3"/></svg></span><span className="nav-label">Riwayat</span></a><a className="side-link" href="/leave"><span className="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18m-13 5 2.5 2.5L16 14"/></svg></span><span className="nav-label">Izin & Cuti</span></a>
      <div className="side-user"><i>{user.nama.slice(0,1).toUpperCase()}</i><span><b>{user.nama}</b><small>{user.role==="admin"?"Administrator":"Karyawan"}</small></span></div>
    </aside>
    <section className="workspace-main">
      <header className="workspace-header"><div><small>WORKSPACE / ATTENDANCE</small><h1>Absensi GPS</h1></div><button className="logout" onClick={logout} disabled={busy}>Keluar ↗</button></header>
      <div className="attendance-wrap">
        <a className="attendance-back" href="/">← Kembali ke dashboard</a>
        <section className="welcome-panel"><div><span className="welcome-tag">KASTRIVA EMPLOYEE ATTENDANCE</span><h2>Catat kehadiran<br/><em>dengan lokasi GPS.</em></h2><p>Absensi hanya diterima jika perangkat berada dalam radius kantor yang ditentukan administrator.</p></div><div className="welcome-mark">GPS</div></section>
        <section className="attendance-card">
          <div className="section-heading"><div><small>KEHADIRAN HARI INI</small><h2>{formatAttendanceDate(record?.tanggal)}</h2></div><button className="refresh" onClick={()=>refresh()} disabled={busy}>Perbarui ↻</button></div>
          <div className="attendance-status">
            <div className="attendance-chip">Masuk: <b>{timeLabel(record?.jam_masuk)}</b></div>
            <div className="attendance-chip">Pulang: <b>{timeLabel(record?.jam_pulang)}</b></div>
            <div className="attendance-chip">Status: <b>{record?.status||"Belum absen"}</b></div>
          </div>
          <p className="attendance-muted">{office?.allowAnyLocation?"Absensi dari mana saja diizinkan administrator. GPS aktual tetap direkam.":office?.configured?"Radius kantor aktif: "+office.radiusMeters+" meter.":"Lokasi kantor belum dikonfigurasi oleh administrator."} GPS harus memiliki akurasi maksimal 200 meter.</p>
          {geo&&<p className="attendance-muted">Lokasi perangkat: {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)} · akurasi ±{Math.round(geo.accuracy)} m</p>}
          {cameraOpen&&<div style={{marginTop:18,maxWidth:480}}><video ref={videoRef} autoPlay muted playsInline style={{display:"block",width:"100%",aspectRatio:"4 / 3",objectFit:"cover",borderRadius:14,background:"#071827",border:"1px solid #d7e0e8"}}/><p className="attendance-muted">{cameraReady?"Kamera langsung aktif. Pastikan wajah terlihat jelas.":"Mengaktifkan kamera..."}</p><div className="attendance-actions"><button onClick={captureLiveSelfie} disabled={busy||!cameraReady}>Ambil Foto</button><button className="secondary" onClick={()=>{stopLiveCamera();setPendingAction(null);setNotice("Pengambilan selfie dibatalkan.");}} disabled={busy}>Batalkan</button></div></div>}
          <div className="attendance-actions">
            <button className="secondary" onClick={locate} disabled={busy}>Ambil lokasi GPS</button>
            <button onClick={()=>prepareAttendance("attendance.checkIn")} disabled={busy||(!office?.configured&&!office?.allowAnyLocation)||checkedIn}><span>Absen Masuk</span><small style={{display:"block",fontSize:10,fontWeight:500,opacity:.82,marginTop:3}}>Wajib selfie</small></button>
            <button onClick={()=>prepareAttendance("attendance.checkOut")} disabled={busy||(!office?.configured&&!office?.allowAnyLocation)||!checkedIn||checkedOut}><span>Absen Pulang</span><small style={{display:"block",fontSize:10,fontWeight:500,opacity:.82,marginTop:3}}>Wajib selfie</small></button>
          </div>
          {photoPreview&&<div style={{marginTop:18,maxWidth:360}}><img src={photoPreview} alt="Pratinjau selfie absensi" style={{width:"100%",borderRadius:14,border:"1px solid #d7e0e8"}}/><p className="attendance-muted">Selfie dengan watermark waktu dan koordinat GPS.</p><div className="attendance-actions"><button onClick={async()=>{setPhotoData("");setPhotoPreview("");setError("");try{await openLiveCamera();}catch(e){setError(e instanceof Error?e.message:"Kamera gagal dibuka.");}}} className="secondary" disabled={busy}>Ambil ulang</button><button onClick={submitAttendance} disabled={busy}>{busy?"Mengirim...":"Kirim Absensi"}</button></div></div>}
          {checkedOut&&<p className="attendance-success">Absensi hari ini sudah lengkap.</p>}
          {error&&<p className="attendance-error">{error}</p>}
          {notice&&<p className="attendance-success">{notice}</p>}
        </section>
        {user.role==="admin"&&<section className="attendance-card">
          <div className="section-heading"><div><small>ADMINISTRATOR</small><h2>Pengaturan lokasi kantor</h2></div><span>{office?.configured?"Sudah dikonfigurasi":"Belum diatur"}</span></div>
          <p className="attendance-muted">Atur titik kantor dan radius 30–1.000 meter. Jika mode bebas lokasi diaktifkan, karyawan dapat absen dari mana saja, tetapi GPS dan selfie tetap wajib.</p>
          <form className="attendance-form" onSubmit={saveOffice}>
            <label>Latitude<input value={officeLatitude} onChange={e=>setOfficeLatitude(e.target.value)} inputMode="decimal" placeholder="Contoh: -6.200000"/></label>
            <label>Longitude<input value={officeLongitude} onChange={e=>setOfficeLongitude(e.target.value)} inputMode="decimal" placeholder="Contoh: 106.816666"/></label>
            <label>Radius kantor (meter)<input type="number" min="30" max="1000" step="1" value={radius} onChange={e=>setRadius(e.target.value)} required/></label>
            <label style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:12,padding:14,border:"1px solid #d7e0e8",borderRadius:12}}><input type="checkbox" checked={allowAnyLocation} onChange={e=>setAllowAnyLocation(e.target.checked)} style={{width:18,height:18}}/><span><b>Izinkan absensi dari mana saja</b><small style={{display:"block",fontWeight:400,opacity:.75}}>Nonaktifkan pembatasan radius kantor. GPS aktual tetap wajib dan disimpan.</small></span></label>
            <div className="attendance-actions"><button type="button" className="secondary" onClick={locate} disabled={busy}>Gunakan lokasi saya</button><button type="submit" disabled={busy||(!allowAnyLocation&&(!officeLatitude.trim()||!officeLongitude.trim()))}>{busy?"Menyimpan...":"Simpan lokasi kantor"}</button></div>
          </form>
          {office?.configured&&<p className="attendance-muted">Titik tersimpan: {office.latitude?.toFixed(6)}, {office.longitude?.toFixed(6)} · radius {office.radiusMeters} meter.</p>}{allowAnyLocation&&<p className="attendance-success">Mode bebas lokasi aktif: karyawan dapat melakukan absensi dari mana saja.</p>}
        </section>}
        <p className="attendance-muted">Bukti selfie wajib untuk absen masuk dan pulang. Foto disimpan privat di folder Google Drive yang ditentukan administrator.</p>
      </div>
    </section>
  </main>;
}
