import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logEvent } from "@/lib/server-log";

type LoginUserRow = {
    id: string;
    email: string;
    name: string;
    active: boolean;
    passwordHash: string;
    roleName: string;
    branchId: string | null;
    branchIds: string[] | null;
    permissions: string[] | null;
};

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
            async authorize(credentials, req) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Invalid credentials");
                }

                const email = credentials.email.trim().toLowerCase();
                const password = credentials.password;
                const headers = new Headers(req?.headers as HeadersInit);
                const ip = getClientIp(headers);
                const limited = checkRateLimit({
                    key: `login:${ip}:${email}`,
                    limit: 8,
                    windowMs: 10 * 60 * 1000,
                });
                if (!limited.allowed) {
                    logEvent("warn", "auth.rate_limited", { email, ip, retryAfterSeconds: limited.retryAfterSeconds });
                    throw new Error("Too many login attempts. Try again later.");
                }

                // One narrow query keeps login from waiting on several remote DB roundtrips.
                const [user] = await prisma.$queryRaw<LoginUserRow[]>`
                    select
                        u.id,
                        u.email,
                        u.name,
                        u.active,
                        u."passwordHash" as "passwordHash",
                        r.name as "roleName",
                        u."branchId" as "branchId",
                        coalesce(array_remove(array_agg(distinct ub."branchId"), null), array[]::text[]) as "branchIds",
                        coalesce(array_remove(array_agg(distinct p.key), null), array[]::text[]) as permissions
                    from "User" u
                    join "Role" r on r.id = u."roleId"
                    left join "UserBranch" ub on ub."userId" = u.id
                    left join "RolePermission" rp on rp."roleId" = r.id
                    left join "Permission" p on p.id = rp."permissionId"
                    where u.email = ${email}
                    group by u.id, r.name
                    limit 1
                `;

                if (!user || !user.active) {
                    logEvent("warn", "auth.failed", { email, ip, reason: "missing_or_inactive" });
                    throw new Error("User not found or inactive");
                }

                const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);
                if (!isPasswordCorrect) {
                    logEvent("warn", "auth.failed", { email, ip, reason: "invalid_password" });
                    throw new Error("Invalid password");
                }

                const usedDefaultPassword = password === "admin123";
                const branchIds =
                    (user.branchIds ?? []).filter(Boolean) ||
                    [];
                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.roleName,
                    permissions: user.permissions ?? [],
                    branchId: user.branchId,
                    branchIds: branchIds.length > 0 ? branchIds : (user.branchId ? [user.branchId] : []),
                    mustChangePassword: usedDefaultPassword,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }: { token: any, user: any }) {
            if (user) {
                token.id = user.id;
                token.email = user.email;
                token.role = user.role;
                token.permissions = user.permissions;
                token.branchId = user.branchId;
                token.branchIds = user.branchIds;
                token.mustChangePassword = user.mustChangePassword;
            }
            return token;
        },
        async session({ session, token }: { session: any, token: any }) {
            if (token?.id) {
                session.user.id = token.id;
                session.user.email = token.email;
                session.user.role = token.role;
                session.user.permissions = token.permissions;
                session.user.branchId = token.branchId;
                session.user.branchIds = token.branchIds;
                session.user.mustChangePassword = token.mustChangePassword;
            }
            return session;
        },
    },
};
