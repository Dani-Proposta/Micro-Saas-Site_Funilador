import { betterAuth } from "better-auth";
import { pool } from "./db.ts";
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
    database: pool,
    
    baseURL: "http://localhost:5173",

    trustedOrigins: ["http://localhost:5173/","http://192.168.15.14:5173"],

    emailAndPassword: {enabled:true, disableSignUp:true, minPasswordLength:8, maxPasswordLength:128,},
    //alterações de perfil passam pela API com controle de intervalo
    disabledPaths: ["/update-user", "/admin/update-user"],
    session: {cookieCache: {enabled:false}},
    plugins: [admin()],
});