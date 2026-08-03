import { NextResponse, type NextRequest } from "next/server";
import { isAllowedLogin } from "@/lib/allowed-users";
import {
  getEmailFromPrincipal,
  parseClientPrincipal,
} from "@/lib/client-principal";

const PROTECTED_PREFIXES = ["/stocks", "/disney", "/costs", "/council", "/docs", "/settings"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const principal = parseClientPrincipal(
    request.headers.get("x-ms-client-principal"),
  );

  if (!principal) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const email = getEmailFromPrincipal(principal);
  if (!isAllowedLogin(principal.userDetails, email)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/stocks/:path*", "/disney/:path*", "/costs/:path*", "/council/:path*", "/docs/:path*", "/settings"],
};
