import express from "express";
import cluster from "cluster";
import { connectRedis } from "./database/redisClient";
import { taskProcessQueue } from "./workers/taskQueueProcessor";
import { batchTaskQueueProcessor } from "./workers/batchTaskQueueProcessor";

const PORT = 3001;

if (cluster.isPrimary) {
	const numCPUs = 2; // Limit to 2 workers
	console.log(`Primary ${process.pid} is running`);

	// Fork workers (2 workers only)
	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
	}

	// Restart worker on exit
	cluster.on("exit", (worker, code, signal) => {
		console.log(`Worker ${worker.process.pid} died. Restarting...`);
		cluster.fork();
	});
} else {
	// Worker processes
	(async function () {
		try {
			await connectRedis();
			console.log("Redis connected");

			const app = express();

			// Task assignment to worker 1 and worker 2
			if (cluster.worker && cluster.worker.id === 1) {
				await taskProcessQueue();
				console.log("Task Process Worker started");
			} else if (cluster.worker && cluster.worker.id === 2) {
				await batchTaskQueueProcessor();
				console.log("Batch Task Worker started");
			}

			// Each worker listens on the same port, managed by the primary process
			app.listen(PORT, () => {
				console.log(`Worker ${process.pid} handling requests on port ${PORT}`);
			});
		} catch (error) {
			console.log("Error initializing worker:", error);
		}
	})();
}
