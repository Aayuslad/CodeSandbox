import redisClient from "../database/redisClient";
import { v4 as uuidv4 } from "uuid";
import { Request, Response } from "express";
import { BatchSubmissionSchema, taskSchema } from "../types/zodScham";
import { languages } from "../config/languageMappings";

export async function getLanguages(req: Request, res: Response) {
	try {
		return res.json(languages);
	} catch (error) {
		console.log("Error during getting languages:", error);
		return res.status(500).json({ error: "Failed to get languages" });
	}
}

export async function submitTask(req: Request, res: Response) {
	try {
		const parced = taskSchema.safeParse(req.body);
		if (!parced.success) {
			return res.status(400).json({ error: "Invalid request body" });
		}

		const { languageId, code, input, expectedOutput, callbackUrl } = parced.data;

		const id = uuidv4();

		await redisClient.rPush(
			"task-execution-queue",
			JSON.stringify({
				id,
				languageId,
				code,
				input: input || "",
				expectedOutput: expectedOutput || "",
				callbackUrl: callbackUrl || "",
			}),
		);

		return res.json({ taskId: id });
	} catch (error) {
		console.log("Error during adding a task to the queue:", error);
		return res.status(500).json({ error: "Failed to add task to the queue" });
	}
}

export async function Old_submitBatchTask(req: Request, res: Response) {
	try {
		const parsed = BatchSubmissionSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ error: "Invalid request body" });
		}

		const { submissionId, languageId, callbackUrl, tasks } = parsed.data;
		const id = uuidv4();

		await redisClient.rPush(
			"batch-task-execution-queue",
			JSON.stringify({ id, submissionId, languageId, callbackUrl, tasks }),
		);

		console.log("Batch task added to the queue:", id);

		return res.json({ batchTaskId: id });
	} catch (error) {
		console.log("Error during adding a task to the queue:", error);
		return res.status(500).json({ error: "Failed to add task to the queue" });
	}
}

export async function submitBatchTask(req: Request, res: Response) {
	try {
		const parsed = BatchSubmissionSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ error: "Invalid request body" });
		}

		const { submissionId, languageId, code, callbackUrl, tasks } = parsed.data;
		const id = uuidv4();

		await redisClient.rPush(
			"batch-task-execution-queue",
			JSON.stringify({ id, submissionId, languageId, code, callbackUrl, tasks }),
		);

		console.log("Batch task added to the queue:", id);

		return res.json({ batchTaskId: id });
	} catch (error) {
		console.log("Error during adding a task to the queue:", error);
		return res.status(500).json({ error: "Failed to add task to the queue" });
	}
}

export async function getTaskStatus(req: Request, res: Response) {
	try {
		const taskId = req.params.id;

		const result = await redisClient.get(`result:${taskId}`);
		if (result) {
			return res.json({ status: "completed", result: JSON.parse(result) });
		}

		const tasks = (await redisClient.lRange("task-execution-queue", 0, -1)).map((task) => JSON.parse(task));
		const task = tasks.find((task) => task.taskId === taskId);
		if (task) {
			return res.json({ status: "pending" });
		}

		return res.status(404).json({ error: "Task not found" });
	} catch (error) {
		console.log("Error during getting a task status:", error);
		return res.status(500).json({ error: "Failed to get task status" });
	}
}

export async function getBatchTaskStatus(req: Request, res: Response) {
	try {
		const batchTaskId = req.params.id;

		const result = await redisClient.get(`batchResult:${batchTaskId}`);
		if (result) {
			return res.json(JSON.parse(result));
		}

		const tasks = (await redisClient.lRange("batch-task-execution-queue", 0, -1)).map((task) => JSON.parse(task));
		const task = tasks.find((task) => task.id === batchTaskId);
		if (task) {
			return res.json({ status: "pending" });
		}

		return res.status(200).json({ status: "notFound" });
	} catch (error) {
		console.log("Error during getting a batch task status:", error);
		return res.status(500).json({ error: "Failed to get batch task status" });
	}
}
