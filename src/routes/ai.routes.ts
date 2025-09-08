import { Router } from "express";
import { uploadSingle } from "../middlewares/multer.middleware";
import { AIController } from "../controllers/ai.controller";
import { validateSessionId } from "../middlewares/sessionValidate.middleware";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();
const AI = new AIController();

router.use(authenticate);

//-------------------------------- EPIC 1 : DATA EXTRACTION ----------------------------------

router.post("/process-document", uploadSingle("image"), AI.processDocument);

//-------------------------------- EPIC 2 : LIVENESS & FACE MATCHING -------------------------

router.post("/start-liveness", AI.livenessStart);
router.get("/liveness-result/:id", validateSessionId, AI.livenessResult);
router.post("/compare-faces", uploadSingle("image"), AI.compareFaces);

//-------------------------------- EPIC 3 : VIDEO KYC ----------------------------------------

// router.post("/video-kyc", AI.videoKYC);

//-------------------------------- EPIC 4 : AI CHATBOT/VOICEBOT ------------------------------

router.get("/chat/initialize", AI.initialize_bot);
router.post("/chat", AI.chat);

export default router;
