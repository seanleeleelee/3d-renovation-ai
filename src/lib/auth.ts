import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { verifyOtp } from "@/lib/store";

const providers: Provider[] = [
  Credentials({
    id: "otp",
    name: "Email OTP",
    credentials: {
      email: { label: "Email", type: "email" },
      code: { label: "Code", type: "text" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "").toLowerCase().trim();
      const code = String(credentials?.code ?? "").trim();
      if (!email || !code) return null;
      const ok = await verifyOtp(email, code);
      if (!ok) return null;
      return { id: `email:${email}`, email, name: email.split("@")[0] };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? token.sub ?? "");
      }
      return session;
    },
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? "dev-secret-change-me",
});
