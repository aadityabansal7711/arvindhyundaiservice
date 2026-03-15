import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import supabase from "@/lib/supabase";
import supabaseAdmin from "@/lib/supabase-admin";

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma) as any,
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/login",
    },
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Invalid credentials");
                }

                const email = credentials.email.trim().toLowerCase();
                const password = credentials.password;

                // 1. Try Supabase Auth first (canonical source once user is synced)
                let authData: { user?: { id: string } } | null = null;
                let authError: Error | null = null;
                try {
                    const res = await supabase.auth.signInWithPassword({ email, password });
                    authData = res.data;
                    authError = res.error as Error | null;
                } catch (e) {
                    authError = e instanceof Error ? e : new Error("Supabase sign-in failed");
                }

                if (!authError && authData?.user) {
                    const user = await prisma.user.findUnique({
                        where: { email },
                        include: { role: { include: { permissions: { include: { permission: true } } } } },
                    });
                    if (!user || !user.active) {
                        throw new Error("User not found or inactive");
                    }
                    const usedDefaultPassword = password === "admin123";
                    return {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role.name,
                        permissions: user.role.permissions.map((rp) => rp.permission.key),
                        branchId: user.branchId,
                        mustChangePassword: usedDefaultPassword,
                    };
                }

                // 2. Legacy: no Supabase Auth user or wrong password — try Prisma + bcrypt
                const user = await prisma.user.findUnique({
                    where: { email },
                    include: { role: { include: { permissions: { include: { permission: true } } } } },
                });

                if (!user || !user.active) {
                    throw new Error("User not found or inactive");
                }

                const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);
                if (!isPasswordCorrect) {
                    throw new Error("Invalid password");
                }

                // Migrate: create Supabase Auth user so next login uses Supabase
                try {
                    const { data: created } = await supabaseAdmin.auth.admin.createUser({
                        email,
                        password,
                        email_confirm: true,
                    });
                    if (created?.user?.id) {
                        await prisma.user.update({
                            where: { id: user.id },
                            data: { supabaseAuthId: created.user.id },
                        });
                    }
                } catch {
                    // ignore migration failure; user can still log in
                }

                const usedDefaultPassword = password === "admin123";
                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role.name,
                    permissions: user.role.permissions.map((rp) => rp.permission.key),
                    branchId: user.branchId,
                    mustChangePassword: usedDefaultPassword,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }: { token: any, user: any }) {
            if (user) {
                token.id = user.id;
                token.role = user.role;
                token.permissions = user.permissions;
                token.branchId = user.branchId;
                token.mustChangePassword = user.mustChangePassword;
            }
            return token;
        },
        async session({ session, token }: { session: any, token: any }) {
            if (token?.id) {
                session.user.id = token.id;
                session.user.role = token.role;
                session.user.permissions = token.permissions;
                session.user.branchId = token.branchId;
                session.user.mustChangePassword = token.mustChangePassword;
                // Fetch current role name from DB so renames in Data page are reflected without re-login
                const user = await prisma.user.findUnique({
                    where: { id: token.id },
                    select: { role: { select: { name: true } } },
                });
                if (user?.role?.name) session.user.role = user.role.name;
            }
            return session;
        },
    },
};
