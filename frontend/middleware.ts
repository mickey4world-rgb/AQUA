import { NextResponse, type NextRequest } from "next/server";
import { isAllowedLogin } from "@/lib/allowed-users";
import {
  getEmailFromPrincipal,
  parseClientPrincipal,
} from "@/lib/client-principal";

const PROTECTED_PREFIXES = ["/stocks", "/disney", "/costs", "/council", "/docs", "/space", "/settings"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const principal = parseClientPrincipal(
    request.headers.get("x-ms-client-principal"),
  );

  if (!principal) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  const email = getEmailFromPrincipal(principal);
  if (!isAllowedLogin(principal.userDetails, email)) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  return applySecurityHeaders(NextResponse.next());
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "font-src 'self' data: https://cdn.jsdelivr.net",
    ].join("; "),
  );
  return response;
}

export const config = {
  matcher: ["/stocks/:path*", "/disney/:path*", "/costs/:path*", "/council/:path*", "/docs/:path*", "/space/:path*", "/settings"],
};
