import { Router, type IRouter } from "express";
import healthRouter from "./health";
import estimatingRouter from "./estimating";
import takeoffsRouter from "./takeoffs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(takeoffsRouter);
router.use(estimatingRouter);

export default router;
