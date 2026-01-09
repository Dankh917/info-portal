import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import { ObjectId } from "mongodb";
import { clientPromise } from "@/lib/mongo";
import { logError } from "@/lib/logger";

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
        token.role = user.role ?? "general";
        const userDepts = normalizeDepartments(user.departments ?? user.department);
        // Ensure General department is always included for new users
        if (!userDepts.includes("General")) {
          userDepts.push("General");
        }
        token.departments = userDepts;
        token.name = user.name ?? token.name;
      } else if (token?.email || token?.sub) {
        try {
          const client = await clientPromise;
          const query = token.sub ? { _id: new ObjectId(token.sub) } : { email: token.email };
          const dbUser = await client
            .db(dbName)
            .collection("users")
            .findOne(query, { projection: { role: 1, department: 1, departments: 1, name: 1 } });

          token.role = dbUser?.role ?? "general";
          const dbUserDepts = normalizeDepartments(
            dbUser?.departments ?? dbUser?.department ?? []
          );
          // Ensure General department is always included
          if (!dbUserDepts.includes("General")) {
            dbUserDepts.push("General");
          }
          token.departments = dbUserDepts;
          token.name = dbUser?.name ?? token.name;
        } catch (error) {
          await logError("Failed to load user data in JWT callback", error, {
            userId: token.sub,
            email: token.email,
          });
          // Fallback to defaults
          token.role = token.role ?? "general";
          token.departments = token.departments ?? ["General"];
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
        session.user.role = token.role ?? "general";
        session.user.departments = token.departments ?? ["General"];
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
          await logError("Failed to refresh session role", error, {
            userId: token.sub,
            email: token.email,
          }
              (dbUser?.department ? [dbUser.department] : session.user.departments);
            // Ensure General department is always included
            if (!dbUserDepts.includes("General")) {
              dbUserDepts.push("General");
            }
            session.user.departments = dbUserDepts;
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
      console.log("[Auth] Creating new user", { userId: user.id, email: user.email });
      try {
        await client
          .db(dbName)
          .collection("users")
          .updateOne(
            { _id: new ObjectId(user.id) },
            { 
              $set: { 
                role: "general", 
                departments: ["General"],
                createdAt: new Date(),
              } 
            },
        await logError("Failed to create new user", error, {
          userId: user.id,
          email: user.email,
       
        console.log("[Auth] New user created successfully", { userId: user.id, role: "general", departments: ["General"] });
      } catch (error) {
        console.error("[Auth] Failed to create new user", { userId: user.id, error: error.message });
        throw error;
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default authOptions;
