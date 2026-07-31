import { updateSession } from "@/lib/supabase/middleware"
import { middlewareSession } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  // 1. Refresh Supabase session cookies safely (no redirect)
  const supabaseResponse = await updateSession(request)

  // 2. Ensure anonymous session cookie (`lem.session`) for existing auth system
  const session = middlewareSession(request)
  if (session.cookie) {
    const response = supabaseResponse.clone() ?? NextResponse.next({ request })
    response.headers.append("Set-Cookie", session.cookie)
    return response
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
