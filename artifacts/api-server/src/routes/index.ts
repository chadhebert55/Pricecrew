import { Router, type IRouter } from "express";
import healthRouter from "./health";
import estimatingRouter from "./estimating";

const router: IRouter = Router();

router.use(healthRouter);
router.use(estimatingRouter);

export default router;
