import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import { ObjectId } from "mongodb";
import { clientPromise } from "@/lib/mongo";

const dbName = process.env.MONGODB_DB || "info-portal";

export const authOptions = {
  adapter: MongoDBAdapter(clientPromise, { databaseName: dbName }),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      const normalizeDepartments = (value) => {
        if (Array.isArray(value)) {
          return Array.from(
            new Set(
              value
                .map((d) => d?.trim?.())
                .filter(Boolean)
            )
          );
        }
        if (typeof value === "string") {
          return Array.from(
            new Set(
              value
                .split(",")
                .map((d) => d.trim())
                .filter(Boolean)
            )
          );
        }
        return [];
      };

      if (user) {
        token.role = user.role ?? "user";
        token.departments = normalizeDepartments(user.departments ?? user.department);
        token.name = user.name ?? token.name;
      } else if (token?.email || token?.sub) {
        const client = await clientPromise;
        const query = token.sub ? { _id: new ObjectId(token.sub) } : { email: token.email };
        const dbUser = await client
          .db(dbName)
          .collection("users")
          .findOne(query, { projection: { role: 1, department: 1, departments: 1, name: 1 } });

        token.role = dbUser?.role ?? "user";
        token.departments = normalizeDepartments(
          dbUser?.departments ?? dbUser?.department ?? []
        );
        token.name = dbUser?.name ?? token.name;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
        session.user.role = token.role ?? "user";
        session.user.departments = token.departments ?? [];
        session.user.name = token.name ?? session.user.name;

        try {
          if (token?.sub || token?.email) {
            const client = await clientPromise;
            const query = token.sub
              ? { _id: new ObjectId(token.sub) }
              : { email: token.email };
            const dbUser = await client
              .db(dbName)
              .collection("users")
              .findOne(query, { projection: { role: 1, department: 1, departments: 1, name: 1 } });

            session.user.role = dbUser?.role ?? session.user.role;
            session.user.departments =
              dbUser?.departments ??
              (dbUser?.department ? [dbUser.department] : session.user.departments);
            session.user.name = dbUser?.name ?? session.user.name;
          }
        } catch (error) {
          console.error("Failed to refresh session role", error);
        }
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const client = await clientPromise;
      await client
        .db(dbName)
        .collection("users")
        .updateOne(
          { _id: new ObjectId(user.id) },
          { $set: { role: "user", department: null, departments: [] } },
        );
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default authOptions;
