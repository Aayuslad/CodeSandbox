import { connectRedis } from "./database/redisClient";
import { processQueue } from "./controllers/queueProcessor";

(async function () {
	try {
		await connectRedis();
		console.log("Redis connected");
		processQueue();
		console.log("Queue processor started");
	} catch (error) {
		console.log("Error initializing worker:", error);
	}
})();
