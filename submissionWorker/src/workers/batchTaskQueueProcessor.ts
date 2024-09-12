import { redisClient } from "../database/redisClient";
import { dockerCommands } from "../config/dockerCommands";
import { exec } from "child_process";
import { promisify } from "util";
import { BatchSubmissionSchema } from "../types/zodSchemas";
import axios from "axios";

const execPromise = promisify(exec);

export async function batchTaskQueueProcessor() {
	while (redisClient.isOpen) {
		const batchTask = await redisClient.blPop("batch-task-execution-queue", 0);
		if (!batchTask) continue;
		const parcedBatchTask = JSON.parse(batchTask.element);

		const parced = BatchSubmissionSchema.safeParse(parcedBatchTask);
		if (!parced.success) {
			console.error("Invalid batch task data:", parced.error);
			continue;
		}

		const { id, submissionId, languageId, callbackUrl, tasks } = parced.data;

		const results = await Promise.all(
			tasks.map(async (task) => {
				const command = dockerCommands[languageId]?.replace(/_CODE/, task.code);
				if (!command) {
					console.error(`No command found for language ID ${languageId}`);
					await redisClient.set(
						`batchResult:${id}`,
						JSON.stringify({ status: "error", output: "languageId not found" }),
					);
					return false;
				}

				try {
					const { stdout, stderr } = await execPromise(command);

					const existingResult = await redisClient.get(`batchResult:${id}`);
					let batchResult = existingResult ? JSON.parse(existingResult) : { tasks: [] };

					if (stderr) {
						batchResult.tasks.push({ id: task.id, status: "error", output: stderr, accepted: false });
						await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
						return false;
					} else {
						const accepted = stdout == task.expectedOutput;
						batchResult.tasks.push({ id: task.id, status: "success", output: stdout, accepted });
						await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
						return accepted;
					}
				} catch (error) {
					//@ts-ignore
					const errorOutput = error.stderr || error.message;
					const existingResult = await redisClient.get(`batchResult:${id}`);
					let batchResult = existingResult ? JSON.parse(existingResult) : { tasks: [] };
					batchResult.tasks.push({ id: task.id, status: "error", output: errorOutput, accepted: false });
					await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
					return false;
				}
			}),
		);

		const allTasksAccepted = results.every((result) => result === true);

		if (callbackUrl) {
			await axios.post(callbackUrl, {
				submissionId: submissionId,
				accepted: allTasksAccepted,
			});
		}
	}
}
