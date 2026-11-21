import { betterAuth } from "better-auth";
import { pool } from "./db.ts";
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
    database: pool,
    
    baseURL: "http://localhost:5173",

    trustedOrigins: ["http://localhost:5173/","http://192.168.15.14:5173"],

    emailAndPassword: {enabled:true, disableSignUp:true,},
    plugins: [admin()],
});