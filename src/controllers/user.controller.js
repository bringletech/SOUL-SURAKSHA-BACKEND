import { z } from "zod";
import { prisma } from "../db/prismaClientConfig.js";
import {
  accessTokenGenerator,
  getGoogleOauthTokens,
  getGoogleUser,
  isAllDigits,
} from "../utils/Helper.js";
import { createParent, editParent, loginParent } from "./parent.controller.js";
import {
  createStudent,
  editStudent,
  loginStudent,
  sendOTP,
} from "./student.controller.js";
import {
  createTherapist,
  editTherapist,
  loginTherapist,
  sendTherapistOTP,
} from "./therapist.controller.js";
import jwt from "jsonwebtoken";
import { decryptPassword } from "../utils/passwordEncryptDescrypt.js";

// Phone validation schema
export const phoneNumberSchema = z
  .string()
  .min(10, "Phone number must be at least 10 digits")
  .max(13, "Phone number cannot exceed 13 digits");

// Email validation schema for OTP verification
export const emailSchema = z
  .string()
  .email({ message: "Invalid email address" })
  .toLowerCase();

export const userTypeSchema = z.enum(["student", "parent", "therapist"], {
  errorMap: () => ({
    message: "User type must be either 'student', 'parent', or 'therapist'",
  }),
});

// Schema for phone-based OTP requests
export const otpRequestSchema = z.object({
  contact: z.union([phoneNumberSchema, emailSchema]),
  userType: userTypeSchema,
});

// Schema for email-based OTP requests
export const emailOtpRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "Password is required" }),
  userType: userTypeSchema,
});

// Schema for phone-based OTP verification
const verifyOtpSchema = z.object({
  contact: z.union([phoneNumberSchema, emailSchema]),
  otp: z.string().length(4, "OTP must be 4 digits"),
  userType: userTypeSchema,
});

// Schema for email-based OTP verification
const verifyEmailOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().length(4, "OTP must be 4 digits"),
  userType: userTypeSchema,
});

export const getCurrentUser = async (req, res) => {
  try {
    return res.status(200).json({
      data: req.user,
      message: "User profile retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error while retrieving user profile",
      error: error.message,
      status: false,
    });
  }
};

const createUser = async (req, res) => {
  try {
    const { userType } = req.body;

    if (!userType) {
      return res.status(400).json({
        message: "User type is required",
        status: false,
      });
    }

    // Convert userType to lowercase for case-insensitive comparison
    const userTypeLower = userType.toLowerCase();

    switch (userTypeLower) {
      case "student":
        return await createStudent(req, res);

      case "therapist":
        return await createTherapist(req, res);

      case "parent":
        return await createParent(req, res);

      default:
        return res.status(400).json({
          message:
            "Invalid user type. Must be either 'student','therapist' Or 'parent'",
          status: false,
        });
    }
  } catch (error) {
    console.error("Error in createUser middleware:", error);
    return res.status(500).json({
      message: "Error processing request",
      error: error.message,
      status: false,
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { userType, email, password, otp } = req.body;

    if (!userType) {
      return res.status(400).json({
        message: "User type is required",
        status: false,
      });
    }

    // Convert userType to lowercase for case-insensitive comparison
    const userTypeLower = userType.toLowerCase();

    // If email and password are provided but no OTP, we need to generate and send OTP
    if (email && password && !otp) {
      let user;

      // Find the user based on userType
      switch (userTypeLower) {
        case "student":
          user = await prisma.student.findUnique({
            where: { email },
          });
          break;
        case "parent":
          user = await prisma.parent.findUnique({
            where: { email },
          });
          break;
        case "therapist":
          user = await prisma.therapist.findUnique({
            where: { email },
          });
          break;
        default:
          return res.status(400).json({
            message: "Invalid user type",
            status: false,
          });
      }

      if (!user) {
        return res.status(404).json({
          message: "User not found. Check your email correctly",
          status: false,
        });
      }

      // Verify password (this will be handled in the specific login functions)

      // Handle the login process based on user type
      switch (userTypeLower) {
        case "student":
          return await loginStudent(req, res);
        case "parent":
          return await loginParent(req, res);
        case "therapist":
          return await loginTherapist(req, res);
        default:
          return res.status(400).json({
            message: "Invalid user type",
            status: false,
          });
      }
    }

    // If OTP is provided along with email and password, verify OTP
    if (email && password && otp) {
      switch (userTypeLower) {
        case "student":
          return await loginStudent(req, res);
        case "parent":
          return await loginParent(req, res);
        case "therapist":
          return await loginTherapist(req, res);
        default:
          return res.status(400).json({
            message: "Invalid user type",
            status: false,
          });
      }
    }

    // Handle other login flows (e.g., phone-based login)
    switch (userTypeLower) {
      case "student":
        return await loginStudent(req, res);
      case "parent":
        return await loginParent(req, res);
      case "therapist":
        return await loginTherapist(req, res);
      default:
        return res.status(400).json({
          message:
            "Invalid user type. Must be either 'student','therapist' Or 'parent'",
          status: false,
        });
    }
  } catch (error) {
    console.error("Error in loginUser middleware:", error);
    return res.status(500).json({
      message: "Error processing request",
      error: error.message,
      status: false,
    });
  }
};

const editUser = async (req, res) => {
  try {
    const { userType } = req.body;

    if (!userType) {
      return res.status(400).json({
        message: "User type is required",
        status: false,
      });
    }

    // Convert userType to lowercase for case-insensitive comparison
    const userTypeLower = userType.toLowerCase();

    switch (userTypeLower) {
      case "student":
        return await editStudent(req, res);

      case "therapist":
        return await editTherapist(req, res);

      case "parent":
        return await editParent(req, res);

      default:
        return res.status(400).json({
          message:
            "Invalid user type. Must be either 'student','therapist' Or 'parent'",
          status: false,
        });
    }
  } catch (error) {
    console.error("Error in editUser middleware:", error);
    return res.status(500).json({
      message: "Error processing request",
      error: error.message,
      status: false,
    });
  }
};

// Generate and send OTP to email
const sendEmailOtp = async (req, res) => {
  try {
    // Validate request body
    const validationResult = emailOtpRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((error) => ({
        field: error.path.join("."),
        message: error.message,
      }));

      return res.status(400).json({
        message: "Validation failed",
        errors,
        status: false,
      });
    }

    const { email, password, userType } = validationResult.data;

    // Check if email exists in respective user type
    let user;
    switch (userType) {
      case "student":
        user = await prisma.student.findUnique({
          where: { email },
        });
        break;
      case "parent":
        user = await prisma.parent.findUnique({
          where: { email },
        });
        break;
      case "therapist":
        user = await prisma.therapist.findUnique({
          where: { email },
        });
        break;
    }

    if (!user) {
      return res.status(404).json({
        message: "User not found with this email address",
        status: false,
      });
    }

    const userPassword = await decryptPassword(password, user.password);
    if (!userPassword) {
      return res.status(401).json({
        message: "Invalid password",
        status: false,
      });
    }
    if (userType === "therapist" && !user.isTherapistVerifiedByAdmin) {
      return res.status(401).json({
        message: "Therapist account is not verified by admin yet",
        status: false,
      });
    }

    // Generate 4-digit OTP
    const generatedOTP = Math.floor(1000 + Math.random() * 9000).toString();

    // Store OTP in the database
    switch (userType) {
      case "student":
        await prisma.student.update({
          where: { email },
          data: { otp: generatedOTP },
        });
        break;
      case "parent":
        await prisma.parent.update({
          where: { email },
          data: { otp: generatedOTP },
        });
        break;
      case "therapist":
        await prisma.therapist.update({
          where: { email },
          data: { otp: generatedOTP },
        });
        break;
    }

    // Send OTP via email
    try {
      await sendOTP(email, generatedOTP);
    } catch (error) {
      return res.status(500).json({
        message: "Failed to send OTP email",
        status: false,
      });
    }

    return res.status(200).json({
      message: "OTP sent to your email. Please verify.",
      status: true,
      requiresOTP: true,
    });
  } catch (error) {
    console.error("Error in sendEmailOtp middleware:", error);
    return res.status(500).json({
      message: "Error processing request",
      error: error.message,
      status: false,
    });
  }
};

// Verify email OTP
const verifyEmailOtp = async (req, res) => {
  try {
    // Validate request body
    const validationResult = verifyEmailOtpSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((error) => ({
        field: error.path.join("."),
        message: error.message,
      }));

      return res.status(400).json({
        message: "Validation failed",
        errors,
        status: false,
      });
    }

    const { email, otp, userType } = validationResult.data;

    // Check if user exists and verify OTP
    let user;
    switch (userType) {
      case "student":
        user = await prisma.student.findUnique({
          where: { email },
        });
        break;
      case "parent":
        user = await prisma.parent.findUnique({
          where: { email },
        });
        break;
      case "therapist":
        user = await prisma.therapist.findUnique({
          where: { email },
        });
        break;
    }

    if (!user) {
      return res.status(404).json({
        message: "User not found",
        status: false,
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({
        message: "Invalid OTP",
        status: false,
      });
    }

    // Update user record
    switch (userType) {
      case "student":
        await prisma.student.update({
          where: { email },
          data: {
            otp: null,
            isMailOtpVerify: true,
          },
        });
        break;
      case "parent":
        await prisma.parent.update({
          where: { email },
          data: {
            otp: null,
            isMailOtpVerify: true,
          },
        });
        break;
      case "therapist":
        await prisma.therapist.update({
          where: { email },
          data: {
            otp: null,
            isMailOtpVerify: true,
          },
        });
        break;
    }

    // Generate access token
    const { accessToken } = await accessTokenGenerator(user.id, userType);

    return res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        userType: userType,
      },
      accessToken,
      message: "OTP verified successfully. Logged in.",
      status: true,
    });
  } catch (error) {
    console.error("Error in verifyEmailOtp middleware:", error);
    return res.status(500).json({
      message: "Error processing request",
      error: error.message,
      status: false,
    });
  }
};

const googleOauthHandler = async (req, res) => {
  try {
    const code = req.query.code;
    const stateParam = req.query.state;
    const platform = req.query.platform || "web";

    // Decode and validate state parameter
    let userType;
    try {
      const stateData = JSON.parse(atob(stateParam));
      userType = stateData.userType;
      if (!["student", "parent"].includes(userType.toLowerCase())) {
        throw new Error("Invalid user type");
      }
    } catch (error) {
      const errorResponse = {
        message: "Invalid state parameter or user type",
        status: false,
      };

      return platform === "mobile"
        ? res.status(400).json(errorResponse)
        : handleWebRedirect(res, {
            error: true,
            message: errorResponse.message,
          });
    }

    // Get tokens and user info
    const { id_token, access_token } = await getGoogleOauthTokens({ code });
    const googleUser = await getGoogleUser({ id_token, access_token });

    if (!googleUser.verified_email) {
      const errorResponse = {
        message: "Google account is not verified",
        status: false,
      };

      return platform === "mobile"
        ? res.status(400).json(errorResponse)
        : handleWebRedirect(res, {
            error: true,
            message: errorResponse.message,
          });
    }

    // Check if user exists in either table
    const existingStudent = await prisma.student.findUnique({
      where: { email: googleUser.email },
    });

    const existingParent = await prisma.parent.findUnique({
      where: { email: googleUser.email },
    });

    let result;
    if (existingStudent || existingParent) {
      result = await handleGoogleSignin(
        googleUser,
        userType,
        existingStudent,
        existingParent
      );
    } else {
      result = await handleGoogleSignup(googleUser, userType);
    }

    // Return response based on platform
    if (platform === "mobile") {
      return res.status(200).json({
        status: true,
        ...result,
      });
    } else {
      return handleWebRedirect(res, {
        accessToken: result.accessToken,
        userType: result.userType,
        isNewUser: !existingStudent && !existingParent,
      });
    }
  } catch (error) {
    console.error("Error in googleOauthHandler:", error);

    let errorMessage;
    let statusCode = 400;

    switch (error.message) {
      case "Email already registered":
        errorMessage =
          "This email is already registered with a different account type.";
        break;
      case "Invalid user type":
        errorMessage =
          "Invalid user type for this account Or Email already registered with a different account type.";
        break;
      default:
        errorMessage = "Error processing request. Please try again.";
        statusCode = 500;
    }

    if (req.query.platform === "mobile") {
      return res.status(statusCode).json({
        status: false,
        message: errorMessage,
      });
    } else {
      return handleWebRedirect(res, {
        error: true,
        message: errorMessage,
      });
    }
  }
};

const googleOauthMobileHandler = async (req, res) => {
  try {
    const { email, userType, photoUrl, displayName } = req.body;
    const googleUser = {
      email,
      name: displayName,
      given_name: displayName,
      picture: photoUrl,
    };
    const existingStudent = await prisma.student.findUnique({
      where: { email: googleUser.email },
    });

    const existingParent = await prisma.parent.findUnique({
      where: { email: googleUser.email },
    });

    let result;
    if (existingStudent || existingParent) {
      result = await handleGoogleSignin(
        googleUser,
        userType,
        existingStudent,
        existingParent
      );
    } else {
      result = await handleGoogleSignup(googleUser, userType);
    }
    if (!result) {
      return res.status(400).json({
        status: false,
        message: "Error processing request. Please try again.",
      });
    } else {
      return res.status(200).json({
        status: true,
        ...result,
      });
    }
  } catch (error) {
    console.error("Error in googleOauthHandler:", error);

    let errorMessage;
    let statusCode = 400;

    switch (error.message) {
      case "Email already registered":
        errorMessage =
          "This email is already registered with a different account type.";
        break;
      case "Invalid user type":
        errorMessage =
          "Invalid user type for this account Or Email already registered with a different account type.";
        break;
      default:
        errorMessage = "Error processing request. Please try again.";
        statusCode = 500;
    }
    return res.status(statusCode).json({
      status: false,
      message: errorMessage,
    });
  }
};

const handleGoogleSignin = async (
  googleUser,
  requestedUserType,
  existingStudent,
  existingParent
) => {
  try {
    const userTypeLower = requestedUserType.toLowerCase();
    let existingUser;
    let finalUserType;

    if (userTypeLower === "student" && existingStudent) {
      existingUser = existingStudent;
      finalUserType = "student";

      // Update student information
      await prisma.student.update({
        where: { id: existingStudent.id },
        data: {
          studentImage: googleUser.picture,
        },
      });
    } else if (userTypeLower === "parent" && existingParent) {
      existingUser = existingParent;
      finalUserType = "parent";

      // Update parent information
      await prisma.parent.update({
        where: { id: existingParent.id },
        data: {
          parentImage: googleUser.picture,
        },
      });
    } else {
      throw new Error("Invalid user type");
    }

    // Generate access token
    const { accessToken } = await accessTokenGenerator(
      existingUser.id,
      finalUserType
    );

    return {
      data: existingUser,
      userType: finalUserType,
      accessToken,
    };
  } catch (error) {
    throw error;
  }
};

// Your existing handleGoogleSignup function remains the same
const handleGoogleSignup = async (googleUser, userType) => {
  try {
    const { email, name: fullName, given_name: userName, picture } = googleUser;

    // Convert userType to lowercase for consistency
    const userTypeLower = userType.toLowerCase();

    // Check if user already exists in either table
    const existingStudent = await prisma.student.findUnique({
      where: { email },
    });

    const existingParent = await prisma.parent.findUnique({
      where: { email },
    });

    if (existingStudent) {
      throw new Error("Email already registered as a student");
    }

    if (existingParent) {
      throw new Error("Email already registered as a parent");
    }

    let createdUser;
    let finalUserType;

    switch (userTypeLower) {
      case "student": {
        createdUser = await prisma.student.create({
          data: {
            email,
            fullName,
            userName,
            studentImage: picture,
            password: "", // Empty password for Google auth
            phone: null,
            trustPhoneNo: "",
          },
          select: {
            id: true,
            fullName: true,
            email: true,
            studentImage: true,
            dob: true,
            createdAt: true,
            gender: true,
          },
        });
        finalUserType = "student";
        break;
      }

      case "parent": {
        createdUser = await prisma.parent.create({
          data: {
            email,
            fullName,
            parentImage: picture,
            password: "", // Empty password for Google auth
            phone: null,
          },
          select: {
            id: true,
            fullName: true,
            email: true,
            parentImage: true,
            dob: true,
            createdAt: true,
            gender: true,
          },
        });
        finalUserType = "parent";
        break;
      }

      default:
        throw new Error(
          "Invalid user type. Must be either 'student' or 'parent'"
        );
    }

    // Generate access token
    const { accessToken } = await accessTokenGenerator(
      createdUser.id,
      finalUserType
    );

    return {
      data: createdUser,
      userType: finalUserType,
      accessToken,
    };
  } catch (error) {
    throw error;
  }
};

// Helper functions remain the same
const handleWebRedirect = (res, params) => {
  const redirectUrl = new URL(process.env.REDIRECT_URL);
  Object.entries(params).forEach(([key, value]) => {
    redirectUrl.searchParams.append(key, value);
  });
  return res.redirect(redirectUrl.toString());
};

const createUserAndGetOtp = async (req, res) => {
  try {
    // Validate request body using Zod
    const validationResult = otpRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((error) => ({
        field: error.path.join("."),
        message: error.message,
      }));

      return res.status(400).json({
        message: "Validation failed",
        errors,
        status: false,
      });
    }

    const { contact, userType } = validationResult.data;
    const isNumber = isAllDigits(contact);

    // Determine the field to query (phone or email)
    const queryField = isNumber ? "phone" : "email";
    console.log("queryField", queryField);

    // Check if phone number or email exists in all user types
    const [studentCheck, parentCheck, therapistCheck] =
      await prisma.$transaction([
        prisma.student.findUnique({
          where: { [queryField]: contact },
        }),
        prisma.parent.findUnique({
          where: { [queryField]: contact },
        }),
        prisma.therapist.findUnique({
          where: { [queryField]: contact },
        }),
      ]);

    console.log("studentCheck", studentCheck);

    // Check for existing accounts in ANY user type (not just the requested type)
    const existingUserTypes = [];

    // Add user types regardless of whether phone is empty or not
    if (studentCheck) {
      existingUserTypes.push("student");
    }
    if (parentCheck) {
      existingUserTypes.push("parent");
    }
    if (therapistCheck) {
      existingUserTypes.push("therapist");
    }

    console.log("existingUserTypes", existingUserTypes);

    // If contact exists in any user type (including the requested type), return error
    if (existingUserTypes.length > 0) {
      // If trying to register with the same user type as an existing account
      if (existingUserTypes.includes(userType)) {
        return res.status(409).json({
          message: `This ${queryField} is already registered as a ${userType}`,
          status: false,
          errorType: "ACCOUNT_EXISTS",
        });
      }

      // If trying to register with a different user type
      return res.status(409).json({
        message: `This ${queryField} is already registered as ${existingUserTypes.join(
          ", "
        )}. Please use a different ${queryField}.`,
        status: false,
        errorType: "ACCOUNT_TYPE_MISMATCH",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    if (!isNumber) {
      // Send email OTP
      await sendOTP(contact, otp);
    }

    // Handle user creation/update based on user type
    let user;
    try {
      switch (userType) {
        case "student":
          user = studentCheck
            ? await prisma.student.update({
                where: { [queryField]: contact },
                data: { otp, isOtpVerify: false },
              })
            : await prisma.student.create({
                data: {
                  [queryField]: contact,
                  otp,
                  fullName: `user_${Date.now()}`, // Temporary unique name
                  userName: `user_${Date.now()}`, // Temporary unique username
                  email: isNumber ? `temp_${Date.now()}@temp.com` : contact, // Use provided email if available
                  password: "123", // Temporary password
                },
              });
          break;

        case "parent":
          user = parentCheck
            ? await prisma.parent.update({
                where: { [queryField]: contact },
                data: { otp, isOtpVerify: false },
              })
            : await prisma.parent.create({
                data: {
                  [queryField]: contact,
                  otp,
                  fullName: `user_${Date.now()}`,
                  email: isNumber ? `temp_${Date.now()}@temp.com` : contact,
                  password: "123",
                },
              });
          break;

        case "therapist":
          user = therapistCheck
            ? await prisma.therapist.update({
                where: { [queryField]: contact },
                data: { otp, isOtpVerify: false },
              })
            : await prisma.therapist.create({
                data: {
                  [queryField]: contact,
                  otp,
                  userName: `user_${Date.now()}`,
                  email: isNumber ? `temp_${Date.now()}@temp.com` : contact,
                  password: "123",
                  languageType: [],
                },
              });
          break;
      }
    } catch (dbError) {
      console.error("Database Error:", dbError);

      // Handle unique constraint violations
      if (dbError.code === "P2002") {
        const field = dbError.meta.target[0];
        return res.status(409).json({
          message: `${field} already exists`,
          errorType: "UNIQUE_CONSTRAINT_ERROR",
          status: false,
        });
      }

      return res.status(500).json({
        message: "Database operation failed",
        errorType: "DATABASE_ERROR",
        status: false,
      });
    }

    if (!user) {
      return res.status(500).json({
        message: "Failed to process user account",
        errorType: "USER_CREATION_FAILED",
        status: false,
      });
    }

    // For development, returning OTP in response
    // In production, should integrate with SMS service
    return res.status(200).json({
      data: {
        otp,
        isOtpSent: true,
      },
      message: "OTP sent successfully!",
      status: true,
    });
  } catch (error) {
    console.error("Internal Server Error:", error);
    return res.status(500).json({
      message: "Internal server error",
      errorType: "INTERNAL_SERVER_ERROR",
      status: false,
    });
  }
};
const verifyOtp = async (req, res) => {
  try {
    // Validate request body
    const validationResult = verifyOtpSchema.safeParse(req.body);

    console.log("validationResult", validationResult);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((error) => ({
        field: error.path.join("."),
        message: error.message,
      }));

      return res.status(400).json({
        message: "Validation failed",
        errors,
        status: false,
      });
    }

    const { otp, contact, userType } = validationResult.data;

    const isNumber = isAllDigits(contact);

    // Determine the field to query (phone or email)
    const queryField = isNumber ? "phone" : "email";

    // Check if user exists and verify OTP
    if (userType === "student") {
      const student = await prisma.student.findUnique({
        where: { [queryField]: contact },
      });

      if (!student) {
        return res.status(404).json({
          message: "User not found",
          status: false,
        });
      }

      if (student.otp !== otp) {
        return res.status(400).json({
          message: "Invalid OTP",
          status: false,
        });
      }

      // Update patient record
      const updatedstudent = await prisma.student.update({
        where: { [queryField]: contact },
        data: {
          otp: "",
          isOtpVerify: true,
        },
      });

      return res.status(200).json({
        message: "OTP verified successfully",
        data: {
          isOtpVerify: updatedstudent.isOtpVerify,
        },
        status: true,
      });
    } else if (userType === "parent") {
      // Handle therapist authentication
      const parent = await prisma.parent.findUnique({
        where: { [queryField]: contact },
      });

      if (!parent) {
        return res.status(404).json({
          message: "User not found",
          status: false,
        });
      }

      if (parent.otp !== otp) {
        return res.status(400).json({
          message: "Invalid OTP",
          status: false,
        });
      }

      // Update patient record
      const updatedparent = await prisma.parent.update({
        where: {
          [queryField]: contact,
        },
        data: {
          otp: "",
          isOtpVerify: true,
        },
      });

      return res.status(200).json({
        message: "OTP verified successfully",
        data: {
          isOtpVerify: updatedparent.isOtpVerify,
        },
        status: true,
      });
    } else if (userType === "therapist") {
      // Handle therapist authentication
      const therapist = await prisma.therapist.findUnique({
        where: { [queryField]: contact },
      });

      if (!therapist) {
        return res.status(404).json({
          message: "User not found",
          status: false,
        });
      }

      if (therapist.otp !== otp) {
        return res.status(400).json({
          message: "Invalid OTP",
          status: false,
        });
      }

      // Update patient record
      const updatedtherapist = await prisma.therapist.update({
        where: {
          [queryField]: contact,
        },
        data: {
          otp: "",
          isOtpVerify: true,
        },
      });

      return res.status(200).json({
        message: "OTP verified successfully",
        data: {
          isOtpVerify: updatedtherapist.isOtpVerify,
        },
        status: true,
      });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    // Handle specific Prisma errors
    if (error.code === "P2002") {
      return res.status(409).json({
        message: "Phone number already registered",
        status: false,
      });
    }
    console.log("error", error);
    return res.status(500).json({
      message: "Error while authenticating user",
      error: error.message,
      status: false,
    });
  }
};

export {
  createUser,
  loginUser,
  editUser,
  googleOauthHandler,
  googleOauthMobileHandler,
  createUserAndGetOtp,
  verifyOtp,
  sendEmailOtp, // Add this
  verifyEmailOtp, // Add this
};
