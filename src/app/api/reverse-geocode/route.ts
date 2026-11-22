import {NextRequest,NextResponse} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return NextResponse.json({ok:false,error:"Koordinat GPS tidak valid."},{status:400});
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format","jsonv2");
    url.searchParams.set("lat",String(lat));
    url.searchParams.set("lon",String(lon));
    url.searchParams.set("zoom","18");
    url.searchParams.set("addressdetails","1");
    const response = await fetch(url.toString(),{
      headers:{
        "Accept":"application/json",
        "Accept-Language":"id,en",
        "User-Agent":"KastrivaEmployeeAttendance/1.0 (reverse geocoding)"
      },
      cache:"force-cache",
      next:{revalidate:3600},
      signal:AbortSignal.timeout(5000)
    });
    if(!response.ok) return NextResponse.json({ok:true,address:""},{status:200});
    const data = await response.json();
    const address = typeof data.display_name === "string" ? data.display_name : "";
    return NextResponse.json({ok:true,address:address.slice(0,500),attribution:"© OpenStreetMap contributors"},{status:200});
  } catch {
    return NextResponse.json({ok:true,address:""},{status:200});
  }
}
