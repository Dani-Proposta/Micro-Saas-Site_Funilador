import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString){
    throw new Error("faltou coisa no .env, a string do url n ta la provavelmente");
}

export const pool = new Pool({
    connectionString,
});