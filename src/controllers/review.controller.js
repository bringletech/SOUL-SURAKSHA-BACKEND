import { prisma } from "../db/prismaClientConfig.js";

const addReview = async (req, res) => {
  try {
    const { title, review, rating, therapistId } = req.body;

    const result = await prisma.$transaction(async (prisma) => {
      // 1. Create the new review
      const addedReview = await prisma.review.create({
        data: {
          title,
          review,
          rating,
          therapistId,
          studentId: req.user?.id,
        },
        include: {
          Student: {
            select: {
              fullName: true,
            },
          },
        },
      });

      // 2. Calculate average rating for the therapist
      const reviews = await prisma.review.findMany({
        where: {
          therapistId: therapistId,
        },
        select: {
          rating: true,
        },
      });

      // Calculate average rating
      const totalRating = reviews.reduce((acc, review) => acc + review.rating, 0);
      const averageRating = totalRating / reviews.length;

      // 3. Update therapist's rating
      await prisma.therapist.update({
        where: {
          id: therapistId,
        },
        data: {
          ratings: Number(averageRating.toFixed(1)), // Round to 1 decimal place
        },
      });

      return addedReview;
    });

    return res.status(201).json({
      data: result,
      message: "Review added successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      message: "Failed to add review",
      status: false,
    });
  }
};

export { addReview };
