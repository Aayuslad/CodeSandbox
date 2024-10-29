import { connectRedis } from "./database/redisClient";
import { batchTaskQueueProcessor } from "./controller/batchTaskQueueProcessor";
import express from "express";
const app = express();
const PORT = 3001;

(async function () {
	try {
		await connectRedis();
		batchTaskQueueProcessor();
		console.log("Queue processor started");
		app.listen(PORT, () => {
			console.log("Worker started on port", PORT);
		});
	} catch (error) {
		console.log("Error initializing worker:", error);
	}
})();
