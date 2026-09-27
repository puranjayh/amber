import { NextResponse, type NextRequest } from "next/server";

const DOCTOR_ONLY = process.env.NEXT_PUBLIC_DOCTOR_ONLY === "1";

/** With NEXT_PUBLIC_DOCTOR_ONLY=1 the deployment serves the doctor portal and its loop API, nothing else. */
export function proxy(request: NextRequest) {
  if (!DOCTOR_ONLY) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/api/loop/reset") return new NextResponse(null, { status: 404 });
  if (pathname === "/doctor" || pathname.startsWith("/doctor/") || pathname.startsWith("/api/loop")) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/doctor", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};
