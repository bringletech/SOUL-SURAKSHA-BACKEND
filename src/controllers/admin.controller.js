import { prisma } from "../db/prismaClientConfig.js";
import { accessTokenGenerator } from "../utils/Helper.js";
import {
  decryptPassword,
  encryptPassword,
} from "../utils/passwordEncryptDescrypt.js";
import { deleteSingleObjectFromS3 } from "./aws.controller.js";

const createAdminAccount = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await encryptPassword(password);

    const admin = await prisma.admin.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    if (!admin) {
      return res.status(500).json({
        message: "Failed to create admin account",
        status: false,
      });
    }

    return res.status(200).json({
      message: "Admin account created successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      message: "Internal server error",
      status: false,
    });
  }
};

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await prisma.admin.findUnique({
      where: {
        email,
      },
    });

    if (!admin) {
      return res.status(404).json({
        message: "Invalid Email",
        status: false,
      });
    }

    const isPasswordCorrect = await decryptPassword(password, admin.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid Password",
        status: false,
      });
    }

    const { accessToken } = await accessTokenGenerator(admin.id, "admin");

    return res.status(200).json({
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
      },
      accessToken,
      message: "Login successful",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      message: "Internal server error",
      status: false,
    });
  }
};

const updateDetails = async (req, res) => {
  try {
    const { name, email, imgUrl, imageBeforeChange } = req.body;

    const updatedAdmin = await prisma.admin.update({
      where: {
        id: req.user?.id,
      },
      data: {
        name,
        email,
        imgUrl,
      },
    });

    if (imageBeforeChange) {
      await deleteSingleObjectFromS3(imageBeforeChange);
    }

    if (!updatedAdmin) {
      return res.status(400).json({
        message: "Failed to update admin details",
        status: false,
      });
    }

    return res.status(200).json({
      data: {
        id: updatedAdmin.id,
        name: updatedAdmin.name,
        email: updatedAdmin.email,
        imgUrl: updatedAdmin.imgUrl,
      },
      message: "Admin details updated successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      message: "Internal server error",
      status: false,
    });
  }
};

export { createAdminAccount, loginAdmin, updateDetails };
