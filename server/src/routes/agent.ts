import { Router } from "express";

const router = Router();

router.post("/", (req, res) => {
    const { instruction, dom } = req.body;

    console.log("Agent request:", {
        instruction,
        dom,
    });

    res.json({
        actions: [],
    });
});

export default router;