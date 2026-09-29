import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import agentRouter from "./routes/agent";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/agent", agentRouter);

const PORT = Number(process.env.PORT) || 3001;

app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "privacy-browser-agent-server",
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});