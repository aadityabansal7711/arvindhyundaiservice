import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

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

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email },
                    include: { role: { include: { permissions: { include: { permission: true } } } } },
                });

                if (!user || !user.active) {
                    throw new Error("User not found or inactive");
                }

                const isPasswordCorrect = await bcrypt.compare(
                    credentials.password,
                    user.passwordHash
                );

                if (!isPasswordCorrect) {
                    throw new Error("Invalid password");
                }

                const usedDefaultPassword = credentials.password === "admin123";

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
