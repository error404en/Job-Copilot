import { clerkMiddleware } from "@clerk/nextjs/server";

// Vercel Edge Runtime can sometimes struggle to auto-load env vars for Clerk
// Passing them explicitly ensures it has what it needs before it runs
import { NextResponse } from "next/server";

const clerk = clerkMiddleware({
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

export default function middleware(req: any, evt: any) {
  try {
    return clerk(req, evt);
  } catch (error) {
    console.error("CLERK CRASHED:", error);
    // If Clerk crashes, just let the user through so the site doesn't break
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
