import redisClient from "../database/redisClient";
import { v4 as uuidv4 } from "uuid";
import { Request, Response } from "express";
import { taskSchema } from "../types/zodScham";
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

		const { languageId, code, input } = parced.data;

		const id = uuidv4();

		await redisClient.rPush(
			"task-execution-queue",
			JSON.stringify({
				id,
				languageId,
				code,
				input: input || "",
			}),
		);

		return res.json({ taskId: id });
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
			return { status: "pending" };
		}

		return res.status(404).json({ error: "Task not found" });
	} catch (error) {
		console.log("Error during getting a task status:", error);
		return res.status(500).json({ error: "Failed to get task status" });
	}
}
