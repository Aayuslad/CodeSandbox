import express from "express";
import { connectRedis } from "./database/redisClient";
import { batchTaskQueueProcessor } from "./workers/batchTaskQueueProcessor";
import { taskProcessQueue } from "./workers/taskQueueProcessor";

const PORT = 3001;

(async function () {
	try {
		await connectRedis();
		console.log("Redis connected");

		const app = express();

		// can not ruth this bcz EC2 has only 1 cpu

		// await taskProcessQueue();
		// console.log("Task Worker started");

		await batchTaskQueueProcessor();
		console.log("Batch Task Worker started");

		app.listen(PORT, () => {
			console.log(`Server handling requests on port ${PORT}`);
		});
	} catch (error) {
		console.log("Error initializing server:", error);
	}
})();
