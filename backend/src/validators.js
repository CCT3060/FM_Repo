import { validationResult } from "express-validator";

export const validate = (validations) => async (req, res, next) => {
  for (const validation of validations) {
    // Await each validation to run sequentially to ensure all rules execute
    // eslint-disable-next-line no-await-in-loop
    await validation.run(req);
  }
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  return res.status(400).json({ message: "Validation failed", errors: errors.array() });
};
