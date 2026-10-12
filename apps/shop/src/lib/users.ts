import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const WEEK_SECONDS = 7 * 24 * 3600;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 32);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export interface NewUser {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/** Stores the user with a hashed password. Records expire after a week (this is a demo shop). */
export async function createUser(user: NewUser): Promise<string> {
  const userId = `u_${randomBytes(6).toString("hex")}`;
  const table = process.env.USERS_TABLE;
  if (!table) return userId;
  await db.send(
    new PutCommand({
      TableName: table,
      Item: {
        env: process.env.LEAKGATE_ENV ?? "local",
        userId,
        name: user.name,
        email: user.email.toLowerCase(),
        phone: user.phone,
        passwordHash: await hashPassword(user.password),
        createdAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + WEEK_SECONDS,
      },
    }),
  );
  return userId;
}
