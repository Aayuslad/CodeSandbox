import { Router } from "express";
import { getLanguages, getTaskStatus, submitTask } from "../controller/taskController";
const router = Router();

router.get("/languages", getLanguages);
router.post("/submit-task", submitTask);
router.get("/task-status/:id", getTaskStatus);

export default router;
