import { createClient } from "redis";
import "dotenv/config";

export const redisClient = createClient({
	url: process.env.REDIS_URL || "redis://redis:6379",
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));

export async function connectRedis() {
	try {
		await redisClient.connect();
		console.log("Redis connected");
	} catch (error) {
		console.error("Error connecting to Redis:", error);
		process.exit(1); // Exit process on error
	}
}
