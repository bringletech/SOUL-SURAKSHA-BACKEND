import { z } from "zod";

// Zod schema for userType validation
const UserTypeSchema = z.object({
  userType: z.enum(["student", "therapist", "STUDENT", "THERAPIST", "parent", "PARENT"], {
    errorMap: () => ({
      message: "User type must be either 'student','therapist' or 'parent'",
    }),
  }),
});

// Validation middleware
const validateUserType = async (req, res, next) => {
  try {
    await UserTypeSchema.parseAsync({ userType: req.body.userType });
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors.map((e) => e.message),
        status: false,
      });
    }
    next(error);
  }
};

export { validateUserType };
