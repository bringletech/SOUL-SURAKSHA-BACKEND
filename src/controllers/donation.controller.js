import { z } from "zod";
import { prisma } from "../db/prismaClientConfig.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { deleteSingleObjectFromS3 } from "./aws.controller.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const DonationSchema = z.object({
  title: z
    .string()
    .min(2, { message: "Title must be at least 2 characters long" })
    .max(50, { message: "Title cannot exceed 50 characters" }),
  desc: z.string().min(1, { message: "Description cannot be empty" }),
  image: z.string().optional(),
  totalAmount: z
    .number()
    .positive({ message: "Total amount must be positive" })
    .min(1, { message: "Total amount must be at least 1" }),
  timePeriod: z.string().datetime(), // Changed this to handle ISO string
  organizedBy: z.string().min(1, { message: "Organizer name is required" }), // Added based on your model
});

const createDonation = async (req, res) => {
  try {
    const validatedData = DonationSchema.parse(req.body);

    const donationAmount = (validatedData.totalAmount * 20) / 100;

    console.log("donationAmount =====>", donationAmount);

    const donation = await prisma.donation.create({
      data: {
        title: validatedData.title,
        desc: validatedData.desc,
        imgUrl: validatedData.image || null,
        receivedAmount: donationAmount || 0,
        totalAmount: parseInt(validatedData?.timePeriod) || 0,
        timePeriod: new Date(validatedData.timePeriod),
        organizedBy: validatedData.organizedBy,
        isDonationActive: true,
      },
    });

    return res.status(200).json({
      message: "Donation created successfully",
      data: donation,
      status: true,
    });
  } catch (error) {
    console.log("error: >>", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
        status: false,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      status: false,
    });
  }
};

const updateDonation = async (req, res) => {
  try {
    const validatedData = DonationSchema.parse(req.body);

    const { id } = req.params;

    const donation = await prisma.donation.update({
      where: {
        id,
      },
      data: {
        title: validatedData.title,
        desc: validatedData.desc,
        imgUrl: validatedData.image || null,
        totalAmount: parseFloat(validatedData.totalAmount),
        timePeriod: new Date(validatedData.timePeriod),
        organizedBy: validatedData.organizedBy,
        isDonationActive: true,
      },
    });

    return res.status(200).json({
      message: "Donation updated successfully",
      data: donation,
      status: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
        status: false,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      status: false,
    });
  }
};

const getActiveDonations = async (req, res) => {
  try {
    const currentDate = new Date();

    const donations = await prisma.donation.findMany({
      where: {
        isDonationActive: true,
        timePeriod: {
          gt: currentDate, // Only show donations where timePeriod is in the future
        },
      },
    });

    // Automatically update expired donations to inactive
    const expiredDonations = await prisma.donation.findMany({
      where: {
        isDonationActive: true,
        timePeriod: {
          lte: currentDate, // Find donations where timePeriod has passed
        },
      },
    });

    if (expiredDonations.length > 0) {
      await prisma.donation.updateMany({
        where: {
          id: {
            in: expiredDonations.map((donation) => donation.id),
          },
        },
        data: {
          isDonationActive: false,
        },
      });
    }

    return res.status(200).json({
      message: "Active donations fetched successfully",
      data: donations,
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      status: false,
    });
  }
};

const getCompletedDonations = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.min(Number(limit), 50); // Limit max results to 50
    const skip = (pageNumber - 1) * pageSize;

    // Find donations where:
    // 1. They're marked as inactive (isDonationActive = false), AND
    // 2. The received amount has reached or exceeded the total amount
    const completedDonations = await prisma.donation.findMany({
      where: {
        isDonationActive: false,
        receivedAmount: {
          gte: prisma.donation.fields.totalAmount,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      skip,
      take: pageSize,
      include: {
        _count: {
          select: { donors: true },
        },
      },
    });

    // Get total count for pagination
    const totalCompletedDonations = await prisma.donation.count({
      where: {
        isDonationActive: false,
        receivedAmount: {
          gte: prisma.donation.fields.totalAmount,
        },
      },
    });

    // Calculate pagination values
    const totalPages = Math.ceil(totalCompletedDonations / pageSize);
    const hasNextPage = pageNumber < totalPages;
    const hasPreviousPage = pageNumber > 1;

    // Format donation statistics
    const formattedDonations = completedDonations.map((donation) => ({
      ...donation,
      percentageFunded: Math.min(
        Math.round((donation.receivedAmount / donation.totalAmount) * 100),
        100
      ),
      donorCount: donation._count.donors,
      _count: undefined, // Remove _count from response
    }));

    return res.status(200).json({
      message: "Completed donations fetched successfully",
      data: formattedDonations,
      pagination: {
        totalDonations: totalCompletedDonations,
        totalPages,
        hasNextPage,
        hasPreviousPage,
        currentPage: pageNumber,
        pageSize,
      },
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      status: false,
    });
  }
};

const deleteDonation = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedDonation = await prisma.donation.delete({
      where: {
        id,
      },
    });

    if (deletedDonation.imgUrl) {
      await deleteSingleObjectFromS3(deletedDonation.imgUrl);
    }

    return res.status(200).json({
      message: "Donation deleted successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      status: false,
    });
  }
};

const getSpecificDonation = async (req, res) => {
  try {
    const { id } = req.params;

    const donation = await prisma.donation.findUnique({
      where: {
        id,
      },
    });

    if (!donation) {
      return res.status(404).json({
        message: "Donation not found",
        status: false,
      });
    }

    return res.status(200).json({
      message: "Donation fetched successfully",
      data: donation,
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error while fetching donation",
      error: error.message,
      status: false,
    });
  }
};

const getSpecificUserDonationRecord = async (req, res) => {
  try {
    let records;

    if (req.role === "therapist") {
      records = await prisma.donationRecord.findMany({
        where: {
          therapistId: req.user?.id,
        },
        include: {
          donation: {
            select: {
              id: true,
              imgUrl: true,
              title: true,
              desc: true,
              organizedBy: true,
            },
          },
        },
      });
    } else if (req.role === "parent") {
      records = await prisma.donationRecord.findMany({
        where: {
          parentId: req.user?.id,
        },
        include: {
          donation: {
            select: {
              id: true,
              imgUrl: true,
              title: true,
              desc: true,
              organizedBy: true,
            },
          },
        },
      });
    }

    // Group records by donationId and calculate total amount for each donation
    const groupedDonations = records.reduce((acc, record) => {
      const donationId = record.donation.id;

      if (!acc[donationId]) {
        acc[donationId] = {
          donationInfo: record.donation,
          totalAmount: 0,
        };
      }

      acc[donationId].totalAmount += record.amount || 0;

      return acc;
    }, {});

    // Convert the grouped object to an array
    const formattedRecords = Object.values(groupedDonations);

    return res.status(200).json({
      data: formattedRecords,
      message: "Donation record fetched successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error while getting donation record",
      error: error.message,
      status: false,
    });
  }
};

const getInavtiveDonations = async (req, res) => {
  try {
    const donations = await prisma.donation.findMany({
      where: {
        isDonationActive: false,
      },
    });

    return res.status(200).json({
      data: donations,
      message: "Donation record fetched successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error while getting donation record",
      error: error.message,
      status: false,
    });
  }
};

//Implement Razorpay

const createOrder = async (req, res) => {
  try {
    const { amount, donationId } = req.body;

    console.log("amount:>>", amount);

    console.log("donationId: >>", donationId);

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `donation_${donationId.slice(0, 5)}_${Date.now()}`,
    };

    console.log(
      "process.env.RAZORPAY_KEY_SECRET: >>",
      process.env.RAZORPAY_KEY_SECRET
    );
    console.log("process.env.RAZORPAY_KEY_ID: >>", process.env.RAZORPAY_KEY_ID);

    console.log("options: >>", options);

    const order = await razorpay.orders.create(options);

    console.log("order: >>", order);

    return res.status(200).json({
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      message: "Order created successfully",
      status: true,
    });
  } catch (error) {
    console.log("Error creating order: ", error);
    res.status(500).json({
      error: error.message,
      message: "Error creating order",
      status: false,
    });
  }
};

const createDonationRecord = async (req, res) => {
  try {
    const {
      amount,
      donationId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    // Verify payment signature
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    shasum.update(`${razorpayOrderId}|${razorpayPaymentId}`);
    const digest = shasum.digest("hex");

    if (digest !== razorpaySignature) {
      return res.status(400).json({
        message: "Transaction not legit!",
        status: false,
      });
    }

    const therapistId = req.role === "therapist" ? req.user?.id : null;
    const parentId = req.role === "parent" ? req.user?.id : null;

    await prisma.$transaction(async (prisma) => {
      await prisma.donationRecord.create({
        data: {
          amount: amount / 100,
          donationId,
          parentId,
          therapistId,
          razorpayOrderId,
          razorpayPaymentId,
        },
      });

      const updatedDonation = await prisma.donation.update({
        where: {
          id: donationId,
        },
        data: {
          receivedAmount: {
            increment: amount / 100,
          },
        },
      });

      // FIX: Only mark as inactive if receivedAmount has reached or exceeded totalAmount
      if (updatedDonation.receivedAmount >= updatedDonation.totalAmount) {
        await prisma.donation.update({
          where: {
            id: donationId,
          },
          data: {
            isDonationActive: false,
          },
        });
      }
    });

    return res.status(200).json({
      message: "Donation record created successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error while creating donation record",
      error: error.message,
      status: false,
    });
  }
};

export {
  createDonation,
  getActiveDonations,
  updateDonation,
  deleteDonation,
  getSpecificDonation,
  getSpecificUserDonationRecord,
  getInavtiveDonations,
  createOrder,
  createDonationRecord,
  getCompletedDonations,
};
