import {NextRequest,NextResponse} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;
const SESSION_COOKIE = "kastriva_session";
const ALLOWED_ACTIONS = [
  "ping", "initialize", "auth.login", "auth.me", "auth.logout",
  "employees.list", "employees.create", "employees.setStatus"
];

export async function POST(request: NextRequest) {
  const url = process.env.GAS_WEB_APP_URL;
  const secret = process.env.GAS_SHARED_SECRET;
  if (!url || !secret) {
    return NextResponse.json({ok:false,error:"Backend belum dikonfigurasi. Isi GAS_WEB_APP_URL dan GAS_SHARED_SECRET."},{status:503});
  }
  if (!url.startsWith("https://script.google.com/") || !url.endsWith("/exec")) {
    return NextResponse.json({ok:false,error:"GAS_WEB_APP_URL tidak valid."},{status:500});
  }
  const size = Number(request.headers.get("content-length") || 0);
  if (size > MAX_BODY) return NextResponse.json({ok:false,error:"Permintaan terlalu besar."},{status:413});

  let input: {action?:string;payload?:Record<string,unknown>};
  try { input = await request.json(); }
  catch { return NextResponse.json({ok:false,error:"Body JSON tidak valid."},{status:400}); }
  const action = String(input.action || "");
  if (!ALLOWED_ACTIONS.includes(action)) return NextResponse.json({ok:false,error:"Action tidak dikenal."},{status:400});

  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  try {
    const upstream = await fetch(url, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action,payload:input.payload || {},secret,sessionToken:token}),
      cache:"no-store",
      redirect:"follow",
      signal:AbortSignal.timeout(20000)
    });
    const raw = await upstream.text();
    let data: Record<string,any>;
    try { data = JSON.parse(raw); }
    catch { return NextResponse.json({ok:false,error:"Respons GAS bukan JSON valid."},{status:502}); }
    if (!upstream.ok) return NextResponse.json({ok:false,error:"GAS gagal memproses permintaan."},{status:502});

    const response = NextResponse.json(data,{status:data.ok === false ? 400 : 200});
    if (action === "auth.login" && data.ok && data.data?.sessionToken) {
      response.cookies.set(SESSION_COOKIE,String(data.data.sessionToken),{
        httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"strict",
        path:"/",maxAge:12*60*60
      });
      delete data.data.sessionToken;
      response.headers.set("Cache-Control","no-store");
    }
    if (action === "auth.logout") {
      response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"strict",path:"/",maxAge:0});
    }
    response.headers.set("Cache-Control","no-store");
    return response;
  } catch {
    return NextResponse.json({ok:false,error:"Tidak dapat menghubungi Google Apps Script."},{status:502});
  }
}
