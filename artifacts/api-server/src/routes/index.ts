import { Router, type IRouter } from "express";
import healthRouter from "./health";
import estimatingRouter from "./estimating";
import takeoffsRouter from "./takeoffs";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(takeoffsRouter);
router.use(estimatingRouter);
router.use(billingRouter);

export default router;
