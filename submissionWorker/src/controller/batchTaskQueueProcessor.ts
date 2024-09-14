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
		const parcedBatchTask: BatchSubmissionSchema = JSON.parse(batchTask.element);

		console.log("batch task received:", parcedBatchTask.id);

		const parced = BatchSubmissionSchema.safeParse(parcedBatchTask);
		if (!parced.success) {
			console.error("Invalid batch task data:", parced.error);
			continue;
		}

		const { id, submissionId, languageId, callbackUrl, tasks } = parced.data;

		let allTasksAccepted = true;

		for (const task of tasks) {
			const command = dockerCommands[languageId]?.replace(/_CODE/, task.code);
			if (!command) {
				console.error(`No command found for language ID ${languageId}`);
				await redisClient.set(`batchResult:${id}`, JSON.stringify({ status: "error", output: "languageId not found" }));
				allTasksAccepted = false;
				break;
			}

			try {
				const { stdout, stderr } = await execPromise(command);

				console.log("output : ", stdout, stderr);

				const existingResult = await redisClient.get(`batchResult:${id}`);
				let batchResult = existingResult ? JSON.parse(existingResult) : { status: "executing", tasks: [] };

				if (stderr) {
					batchResult.tasks.push({
						id: task.id,
						status: "error",
						output: stderr,
						accepted: false,
						inputs: task.inputs,
						expectedOutput: task.expectedOutput,
					});
					await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
					allTasksAccepted = false;
				} else {
					const accepted = stdout == task.expectedOutput;
					batchResult.tasks.push({
						id: task.id,
						status: "success",
						output: stdout,
						accepted,
						inputs: task.inputs,
						expectedOutput: task.expectedOutput,
					});
					await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
					if (!accepted) {
						allTasksAccepted = false;
					}
				}
			} catch (error) {
				//@ts-ignore
				const errorOutput = error.stderr || error.message;
				const existingResult = await redisClient.get(`batchResult:${id}`);
				let batchResult = existingResult ? JSON.parse(existingResult) : { tasks: [] };
				batchResult.tasks.push({
					id: task.id,
					status: "error",
					output: errorOutput,
					accepted: false,
					inputs: task.inputs,
					expectedOutput: task.expectedOutput,
				});
				await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
				allTasksAccepted = false;
			}
		}

		const existingResult = await redisClient.get(`batchResult:${id}`);
		const parcedExstingResult = JSON.parse(existingResult as string);
		if (allTasksAccepted) {
			await redisClient.set(`batchResult:${id}`, JSON.stringify({ status: "accepted", tasks: parcedExstingResult.tasks }));
		} else {
			await redisClient.set(`batchResult:${id}`, JSON.stringify({ status: "rejected", tasks: parcedExstingResult.tasks }));
		}

		if (callbackUrl) {
			await axios.post(callbackUrl, {
				submissionId: submissionId,
				accepted: allTasksAccepted,
			});
		}
	}
}
