import { NextResponse, type NextRequest } from "next/server";
import { isAllowedLogin } from "@/lib/allowed-users";
import {
  getEmailFromPrincipal,
  parseClientPrincipal,
} from "@/lib/client-principal";

const PROTECTED_PREFIXES = [
  "/stocks",
  "/disney",
  "/costs",
  "/council",
  "/soluna",
  "/docs",
  "/works",
  "/space",
  "/settings",
];

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
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "frame-src blob: https://www.youtube.com https://www.youtube-nocookie.com",
      "worker-src 'self' blob:",
      "font-src 'self' data: https://cdn.jsdelivr.net",
    ].join("; "),
  );
  return response;
}

export const config = {
  matcher: [
    "/stocks/:path*",
    "/disney/:path*",
    "/costs/:path*",
    "/council/:path*",
    "/soluna/:path*",
    "/docs/:path*",
    "/works/:path*",
    "/space/:path*",
    "/settings",
  ],
};
