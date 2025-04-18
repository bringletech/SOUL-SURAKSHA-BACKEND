import { z } from "zod";
import { prisma } from "../db/prismaClientConfig.js";
import { decryptPassword } from "../utils/passwordEncryptDescrypt.js";
import bcrypt from "bcryptjs";
import { deleteSingleObjectFromS3 } from "./aws.controller.js";
import { accessTokenGenerator } from "../utils/Helper.js";
import nodemailer from "nodemailer";
import { generateOTP } from "../utils/otpUtils.js";
import { sendMail } from "./student.controller.js";

const createdTherapistSchema = z.object({
  userName: z
    .string()
    .min(2, { message: "Username must be at least 2 characters long" })
    .max(50, { message: "Username cannot exceed 50 characters" }),

  phone: z.string().optional(),

  email: z.string().email({ message: "Invalid email address" }).toLowerCase(),

  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      {
        message:
          "Password must include uppercase, lowercase, number, and special character",
      }
    ),
  languageType: z.array(z.string()).optional(),
  qualifications: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  specialization: z.string().optional(),
  experience: z.string().optional(),
  licenseNO: z.string().optional(),
});

const TherapistLoginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }).toLowerCase(),
  password: z.string().min(1, { message: "Password is required" }),
  otp: z.string().optional(), // OTP is optional initially
});

const EditUserSchema = z.object({
  userName: z
    .string()
    .min(2, { message: "fullName must be at least 2 characters long" })
    .max(50, { message: "fullName cannot exceed 50 characters" }),

  qualifications: z.string().optional(),
  gender: z.string().optional(),
  recoveryEmail: z.string().optional(),
  licenseNO: z.string().optional(),
  languageType: z.array(z.string()).optional(),
  profileImage: z.string().optional(),
  bio: z.string().optional(),
  specialization: z.string().optional(),
  experience: z.string().optional(),
  imageBeforeChange: z.string().optional().nullable(),
});

// Nodemailer transporter configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Function to send OTP via email
export const sendTherapistOTP = async (email, otp) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Therapist Account OTP Verification",
      html: `<p>Your OTP for login is: <b>${otp}</b></p>`,
    });
    console.log("Therapist OTP email sent successfully");
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send OTP email");
  }
};

const createTherapist = async (req, res) => {
  try {
    // Validate input using Zod
    const {
      userName,
      phone,
      email,
      password,
      dob,
      gender,
      specialization,
      experience,
      licenseNO,
      languageType,
      qualifications,
      therapistImage,
    } = createdTherapistSchema.parse(req.body);

    // Check if email or phone already exists in student or parent models
    const [studentCheck, parentCheck] = await prisma.$transaction([
      prisma.student.findFirst({
        where: { OR: [{ email: email }, { phone: phone }] },
        select: { id: true, email: true, phone: true },
      }),
      prisma.parent.findFirst({
        where: { OR: [{ email: email }, { phone: phone }] },
        select: { id: true, email: true, phone: true },
      }),
    ]);

    // Handle conflicts with student accounts
    if (studentCheck) {
      return res.status(409).json({
        message: `${
          studentCheck.email === email ? "Email" : "Phone"
        } already registered as a student`,
        status: false,
      });
    }

    // Handle conflicts with parent accounts
    if (parentCheck) {
      return res.status(409).json({
        message: `${
          parentCheck.email === email ? "Email" : "Phone"
        } already registered as a parent`,
        status: false,
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if the user was initially created with phone or email
    const isSignupWithPhone = email.includes("@temp.com");

    // Find existing therapist by email OR phone
    const existingTherapist = await prisma.therapist.findFirst({
      where: {
        OR: [{ email: email }, { phone: phone }],
      },
    });

    // If no existing therapist, create a new one
    if (!existingTherapist) {
      try {
        const createdTherapist = await prisma.therapist.create({
          data: {
            userName,
            phone,
            email,
            password: hashedPassword,
            therapistImage,
            dob,
            gender,
            specialization,
            experience: parseFloat(experience),
            licenseNO,
            languageType,
            qualifications,
            isOtpVerify: true, // Since they've already verified OTP in the previous step
          },
          select: {
            id: true,
            userName: true,
            email: true,
            therapistImage: true,
            dob: true,
            createdAt: true,
            gender: true,
            specialization: true,
            experience: true,
            licenseNO: true,
            phone: true,
            languageType: true,
            qualifications: true,
          },
        });

        const { accessToken } = await accessTokenGenerator(
          createdTherapist.id,
          "therapist"
        );

        return res.status(201).json({
          data: createdTherapist,
          userType: "therapist",
          accessToken,
          message: "Therapist account created successfully",
          status: true,
        });
      } catch (createError) {
        // Handle unique constraint violations during creation
        if (createError.code === "P2002") {
          const field = createError.meta.target[0];
          return res.status(409).json({
            message: `${field} already exists in another therapist account`,
            status: false,
          });
        }
        throw createError;
      }
    }

    // Special handling for updating existing accounts based on signup method
    if (existingTherapist.email) {
      // For phone-based signups: Allow updating from temp email to real email
      // Check if the new email exists in another account with a non-null phone
      if (!existingTherapist.email.includes("@temp.com")) {
        const emailExists = await prisma.therapist.findUnique({
          where: { email: email },
          select: { phone: true },
        });

        if (emailExists && emailExists.phone) {
          return res.status(409).json({
            message: "Email already registered with another therapist account",
            status: false,
          });
        }
      }
    }

    // Check if we're trying to update to a phone that already exists
    if (existingTherapist.phone) {
      const phoneExists = await prisma.therapist.findUnique({
        where: { phone: phone },
        select: { id: true, email: true },
      });

      if (phoneExists && !phoneExists.email.includes("@temp.com")) {
        return res.status(409).json({
          message:
            "Phone number already registered with another therapist account",
          status: false,
        });
      }
    }

    try {
      // Update the existing therapist by ID (safest approach)
      const updatedTherapist = await prisma.therapist.update({
        where: { id: existingTherapist.id },
        data: {
          userName,
          phone,
          email,
          therapistImage,
          password: hashedPassword,
          gender,
          dob,
          specialization,
          experience: parseFloat(experience),
          licenseNO,
          languageType,
          qualifications,
          isOtpVerify: true, // Ensure OTP verification flag is set
        },
        select: {
          id: true,
          userName: true,
          email: true,
          therapistImage: true,
          dob: true,
          createdAt: true,
          gender: true,
          specialization: true,
          experience: true,
          licenseNO: true,
          phone: true,
          languageType: true,
          qualifications: true,
        },
      });

      const { accessToken } = await accessTokenGenerator(
        updatedTherapist.id,
        "therapist"
      );

      return res.status(200).json({
        data: updatedTherapist,
        userType: "therapist",
        accessToken,
        message: "Therapist account updated successfully",
        status: true,
      });
    } catch (updateError) {
      // Handle unique constraint violations during update
      if (updateError.code === "P2002") {
        const field = updateError.meta.target[0];
        return res.status(409).json({
          message: `${field} already exists in another therapist account`,
          status: false,
        });
      }
      throw updateError;
    }
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors.map((e) => e.message),
        status: false,
      });
    }

    // Handle other errors
    console.error(error);
    return res.status(500).json({
      message: "Error while creating therapist account",
      error: error.message,
      status: false,
    });
  }
};

const editTherapist = async (req, res) => {
  try {
    const {
      userName,
      languageType,
      profileImage,
      qualifications,
      bio,
      specialization,
      gender,
      recoveryEmail,
      licenseNO,
      experience,
      imageBeforeChange,
    } = EditUserSchema.parse(req.body);

    const therapistId = req.user.id;

    if (!therapistId) {
      return res.status(400).json({
        message: "Therapist ID not found",
        status: false,
      });
    }

    const checkTherapist = await prisma.therapist.findUnique({
      where: { id: therapistId },
    });

    if (!checkTherapist) {
      return res.status(404).json({
        message: "Therapist not found",
        status: false,
      });
    }

    const updatedTherapist = await prisma.therapist.update({
      where: { id: therapistId },
      data: {
        userName,
        languageType,
        therapistImage: profileImage,
        gender,
        recoveryEmail,
        licenseNO,
        qualifications,
        bio,
        specialization,
        experience: parseFloat(experience),
      },
      select: {
        userName: true,
        email: true,
        languageType: true,
        therapistImage: true,
        qualifications: true,
        bio: true,
        licenseNO: true,
        specialization: true,
        experience: true,
      },
    });

    if (checkTherapist.therapistImage) {
      await deleteSingleObjectFromS3(checkTherapist.therapistImage);
    }

    return res.status(200).json({
      data: updatedTherapist,
      message: "User updated successfully",
      status: true,
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors.map((e) => e.message),
        status: false,
      });
    }

    // Handle other errors
    console.error(error);
    return res.status(500).json({
      message: "Error while updating user",
      error: error.message,
      status: false,
    });
  }
};

const loginTherapist = async (req, res) => {
  try {
    // Validate input using Zod
    const { email, password, otp } = TherapistLoginSchema.parse(req.body);

    // Find user
    const therapist = await prisma.therapist.findUnique({
      where: { email },
    });

    if (!therapist) {
      return res.status(404).json({
        message: "Therapist Account not found. Check your email correctly",
        status: false,
      });
    }

    if (therapist && !therapist.isTherapistVerifiedByAdmin) {
      return res.status(401).json({
        message: "Therapist account is not verified by admin yet",
        status: false,
      });
    }

    // Verify password
    const isPasswordCorrect = await decryptPassword(
      password,
      therapist.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid Password",
        status: false,
      });
    }

    // Check if this is an OTP verification request
    if (otp) {
      // If OTP is provided, verify it
      if (therapist.otp !== otp) {
        return res.status(400).json({
          message: "Invalid OTP",
          status: false,
        });
      }

      // Clear OTP after successful verification
      await prisma.therapist.update({
        where: { email: email },
        data: { otp: null, isMailOtpVerify: true },
      });

      // Generate access token
      const { accessToken } = await accessTokenGenerator(
        therapist.id,
        "therapist"
      );

      // Respond with token and user details
      return res.status(200).json({
        data: {
          id: therapist.id,
          userName: therapist.userName,
          userType: "therapist",
          email: therapist.email,
        },
        accessToken,
        message: "Logged In Successfully",
        status: true,
      });
    } else {
      // If OTP is not provided, generate and send OTP
      const generatedOTP = generateOTP(); // Generate 4-digit OTP
      console.log("therapist otp:", generatedOTP);

      // Store OTP in the database
      await prisma.therapist.update({
        where: { email: email },
        data: { otp: generatedOTP },
      });

      // Send OTP via email
      try {
        await sendTherapistOTP(email, generatedOTP);
      } catch (error) {
        return res.status(500).json({
          message: "Failed to send OTP email",
          status: false,
        });
      }

      return res.status(200).json({
        message: "OTP sent to your email. Please verify.",
        status: true,
        requiresOTP: true, // Indicate that OTP is required
      });
    }
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors.map((e) => e.message),
        status: false,
      });
    }

    // Handle other errors
    console.error(error);
    return res.status(500).json({
      message: "Error while logging in",
      error: error.message,
      status: false,
    });
  }
};

const logoutTherapist = async (req, res) => {
  try {
    // Verify user exists
    await prisma.therapist.findFirstOrThrow({
      where: { id: req.user?.id },
    });

    return res.status(200).json({
      message: "Logged out Successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error while logging out user",
      error: error.message,
      status: false,
    });
  }
};
const getAllTherapist = async (_, res) => {
  try {
    const therapists = await prisma.therapist.findMany({
      select: {
        id: true,
        userName: true,
        specialization: true,
        therapistImage: true,
        experience: true,
        phone: true,
        bio: true,
        languageType: true,
        qualifications: true,
        ratings: true,
        Review: {
          select: {
            title: true,
            review: true,
            rating: true,
            createdAt: true,
            Student: {
              select: {
                fullName: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });
    return res.status(200).json({
      data: therapists,
      message: "All Therapists fetched successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error while fetching all therapists",
      error: error.message,
      status: false,
    });
  }
};

const getSpecificTherapist = async (req, res) => {
  try {
    const therapist = await prisma.therapist.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        userName: true,
        specialization: true,
        therapistImage: true,
        experience: true,
        phone: true,
        bio: true,
        languageType: true,
        qualifications: true,
        ratings: true,
        Review: {
          select: {
            title: true,
            review: true,
            rating: true,
            createdAt: true,
            Student: {
              select: {
                fullName: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });
    return res.status(200).json({
      data: therapist,
      message: "Therapists fetched successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error while fetching therapists",
      error: error.message,
      status: false,
    });
  }
};

const getUnverifiedTherapists = async (req, res) => {
  try {
    const therapists = await prisma.therapist.findMany({
      where: {
        isTherapistVerifiedByAdmin: false,
        isTherapistApprove: false,
        isTherapistReject: false,
      },
      select: {
        userName: true,
        id: true,
        specialization: true,
        createdAt: true,
      },
    });

    const formattedData = therapists.map((therapist) => {
      return {
        id: therapist.id,
        message: `Dr. ${therapist.userName} has registered as a new therapist`,
        isNew: true,
        therapistId: `T-${therapist.id.substring(0, 8)}`,
        specialty: therapist.specialization,
        timestamp: therapist.createdAt.toISOString(),
      };
    });

    return res.status(200).json({
      data: formattedData,
      message: "Unverified therapists fetched successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error while fetching Unverified therapist",
      error: error.message,
      status: false,
    });
  }
};

const getUnverifiedTherapist = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Please Provide id",
        error: error.message,
        status: false,
      });
    }
    const therapist = await prisma.therapist.findFirst({
      where: {
        id,
      },
      select: {
        userName: true,
        phone: true,
        email: true,
        gender: true,
        dob: true,
        licenseNO: true,
        languageType: true,
        qualifications: true,
        specialization: true,
        experience: true,
      },
    });

    if (!therapist) {
      return res.status(404).json({
        message: "Therapist Not Found",
        status: false,
      });
    }

    return res.status(200).json({
      data: therapist,
      message: "Therapist fatched successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "error while Fatching Therapist",
      error: error.message,
      status: false,
    });
  }
};

const approveTherapist = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        message: "Required fields are missing.",
        status: false,
      });
    }

    const approveUser = await prisma.therapist.update({
      where: {
        id,
      },
      data: {
        isTherapistVerifiedByAdmin: true,
        isTherapistApprove: true,
      },
    });

    if (!approveUser) {
      return res.status(404).json({
        message: "Therapist Not Found",
        status: false,
      });
    }

    await sendMail({
      email: approveUser.email,
      subject: "Approve Therapist",
      html: "",
    });
    return res.status(200).json({
      message: "Therapist Approve Successsfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error While Approve Therapist",
      error: error.message,
      status: false,
    });
  }
};

export {
  createTherapist,
  loginTherapist,
  logoutTherapist,
  editTherapist,
  getAllTherapist,
  getSpecificTherapist,
  getUnverifiedTherapists,
  getUnverifiedTherapist,
  approveTherapist,
};
