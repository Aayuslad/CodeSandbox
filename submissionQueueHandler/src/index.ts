import express from "express";
import { createClient } from "redis";
import zod from "zod";
import "dotenv/config";

const app = express();
const port = 3000;

app.use(express.json());

// Create a Redis client
export const redisClient = createClient({
	url: process.env.REDIS_URL || "redis://redis:6379",
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));


(async function () {
	try {
		await redisClient.connect();
		app.listen(port, () => {
			console.log(`Server listening on port ${port}`);
		});
	} catch (error) {
		console.log("Error connecting redis");
	}
})();

app.get("/", (req, res) => {
	console.log("someone pinged !");

	return res.send("working");
});

const jobSchema = zod.object({
	language: zod.string(),
	code: zod.string(),
	input: zod.string(),
});

// Endpoint to submit code for execution
app.post("/submit", async (req, res) => {

	try {
		const parced = jobSchema.safeParse(req.body);
		if (!parced.success) {
			return res.status(400).json({ error: "Invalid request body" });
		}
		const { language, code, input } = parced.data;

		console.log("inside submit");

		// Test a simple Redis command to verify connection
		await redisClient.set("test", "value");
		const testValue = await redisClient.get("test");
		console.log("Redis test value:", testValue);

		// Generate a unique job ID
		const jobId = Date.now().toString();

		// Add the job to the queue
		await redisClient.rPush(
			"code-execution-queue",
			JSON.stringify({
				id: jobId,
				language,
				code,
				input,
				status: "pending",
			}),
		);

		console.log("added in queue");
		return res.json({ jobId });
	} catch (error) {
		console.error("Error during Redis operation:", error);
		return res.status(500).json({ error: "Failed to add job to the queue" });
	}
});

// Endpoint to check job status
app.get("/status/:id", async (req, res) => {
	const jobId = req.params.id;
	const result = await redisClient.get(`result:${jobId}`);
	const jobs = await redisClient.lRange("code-execution-queue", 0, -1);
	const parcedJobs = jobs.map((job) => JSON.parse(job));
	const job = parcedJobs.find((job) => job.id === jobId);

	if (result) {
		console.log("Result found:", JSON.parse(result));
		res.json(JSON.parse(result));
	} else if (job) {
		console.log("Job :", job);
		res.json({ status: "pending" });
	} else {
		console.log("No result found for this job.");
		res.status(404).json({ error: "Job not found or pending" });
	}
});
