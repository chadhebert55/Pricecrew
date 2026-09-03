import { Router, type IRouter } from "express";
import healthRouter from "./health";
import estimatingRouter from "./estimating";
import takeoffsRouter from "./takeoffs";
import billingRouter from "./billing";
import assistantRouter from "./assistant";
import blobUploadRouter from "./blob-upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(takeoffsRouter);
router.use(estimatingRouter);
router.use(billingRouter);
router.use(assistantRouter);
router.use(blobUploadRouter);

export default router;
