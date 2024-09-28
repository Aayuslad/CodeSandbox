import express from "express";
import "dotenv/config";
import redisClient from "./database/redisClient";
import router from "./routes/route";
import bodyParser from "body-parser";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.json());

app.get("/", (req, res) => {
	return res.json({ message: "Code Sandbox is up and running 🔥" });
});

app.use(router);

async function startServer() {
	try {
		await redisClient.connect();
		console.log("Redis connected");
		app.listen(PORT, () => {
			console.log(`Server listening on port ${PORT}`);
		});
	} catch (error) {
		console.error("Error connecting to Redis:", error);
	}
}

startServer();
