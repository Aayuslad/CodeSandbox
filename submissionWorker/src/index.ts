import { exec } from "child_process";
import { createClient } from "redis";
import { dockerCommands } from "./executionCommands";
import "dotenv/config";

export const redisClient = createClient({
	url: process.env.REDIS_URL || "redis://redis:6379",
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));

(async function () {
	try {
		await redisClient.connect();
        console.log("Redis connected");
        processQueue();
	} catch (error) {
		console.log("Error connecting redis");
	}
})();

// Function to process jobs
export async function processQueue() {
	while (true && redisClient.isOpen) {
		console.log("inside while loop");

		// Get a job from the Redis list (blocking call)
		const jobData = await redisClient.blPop("code-execution-queue", 0);

		if (jobData) {
			const { id, language, code, input, status } = JSON.parse(jobData.element);

			console.log("picked : ", JSON.parse(jobData.element));

			const command = dockerCommands[language].replace(/_CODE/, code);

			exec(command, async (error, stdout, stderr) => {
				let result;
				if (error) {
					console.log("Execution error:", stderr);
					result = { status: "error", output: stderr };
				} else {
					console.log("Execution result:", stdout);
					result = { status: "success", output: stdout };
				}

				console.log(`Setting result for job ${id}:`, result);
				await redisClient.set(`result:${id}`, JSON.stringify(result));

				await redisClient.lPush("executed-job-queue", JSON.stringify(result));
			});

			console.log("Executed");
		}
	}
}
