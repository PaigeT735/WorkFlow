import { Router } from "express";
import { createUser } from "./users";

const router = Router();
const auth = {
  required() {
    return true;
  },
};

router.post("/users", auth.required, async () => {
  await createUser("Ada");
});

export default router;
