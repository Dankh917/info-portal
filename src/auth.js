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
      if (user) {
        token.role = user.role ?? "user";
        token.department = user.department ?? null;
      } else if (token?.email || token?.sub) {
        const client = await clientPromise;
        const query = token.sub ? { _id: new ObjectId(token.sub) } : { email: token.email };
        const dbUser = await client
          .db(dbName)
          .collection("users")
          .findOne(query, { projection: { role: 1, department: 1 } });

        token.role = dbUser?.role ?? "user";
        token.department = dbUser?.department ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
        session.user.role = token.role ?? "user";
        session.user.department = token.department ?? null;

        try {
          if (token?.sub || token?.email) {
            const client = await clientPromise;
            const query = token.sub
              ? { _id: new ObjectId(token.sub) }
              : { email: token.email };
            const dbUser = await client
              .db(dbName)
              .collection("users")
              .findOne(query, { projection: { role: 1, department: 1 } });

            session.user.role = dbUser?.role ?? session.user.role;
            session.user.department =
              dbUser?.department ?? session.user.department;
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
          { $set: { role: "user", department: null } },
        );
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default authOptions;
