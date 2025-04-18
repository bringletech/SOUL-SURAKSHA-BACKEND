import { prisma } from "../db/prismaClientConfig.js";

// Get all statistics
const getStats = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();

    // Get all counts in parallel for better performance
    const [
      therapistsCount,
      studentsCount,
      parentsCount,
      activeDonationsCount,
      totalBlogViews,
      studentsMonthly,
      parentsMonthly,
    ] = await Promise.all([
      prisma.therapist.count(),
      prisma.student.count(),
      prisma.parent.count(),
      prisma.donation.count({
        where: { isDonationActive: true },
      }),
      prisma.blog.aggregate({
        _sum: { viewCount: true },
      }),
      // Get students created each month
      prisma.student.groupBy({
        by: ["createdAt"],
        where: {
          createdAt: {
            gte: new Date(currentYear, 0, 1), // Start of current year
            lt: new Date(currentYear + 1, 0, 1), // Start of next year
          },
        },
      }),
      // Get parents created each month
      prisma.parent.groupBy({
        by: ["createdAt"],
        where: {
          createdAt: {
            gte: new Date(currentYear, 0, 1),
            lt: new Date(currentYear + 1, 0, 1),
          },
        },
      }),
    ]);

    // Calculate stats
    const statsCardData = {
      totalTherapists: therapistsCount,
      totalUsers: studentsCount + parentsCount,
      activedonations: activeDonationsCount,
      totalBlogViews: totalBlogViews._sum.viewCount || 0,
    };

    // Process monthly data
    const monthlyData = new Map();
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Initialize all months with zero counts
    months.forEach((month) => {
      monthlyData.set(month, { Students: 0, Parents: 0 });
    });

    // Count students per month
    studentsMonthly.forEach((record) => {
      const month = record.createdAt.toLocaleString("default", {
        month: "short",
      });
      const currentData = monthlyData.get(month);
      if (currentData) {
        currentData.Students++;
      }
    });

    // Count parents per month
    parentsMonthly.forEach((record) => {
      const month = record.createdAt.toLocaleString("default", {
        month: "short",
      });
      const currentData = monthlyData.get(month);
      if (currentData) {
        currentData.Parents++;
      }
    });

    // Convert map to array in required format
    const userStats = Array.from(monthlyData, ([month, data]) => ({
      month,
      ...data,
    }));

    return res.status(200).json({
      data: {
        statsCardData,
        userStats,
      },
      status: true,
      message: "Statistics fetched successfully",
    });
  } catch (error) {
    console.error("Error in getStats:", error);
    return res.status(500).json({ error: "Failed to fetch statistics" });
  }
};

const getActiveDonations = async (req, res) => {
  try {
    // Get active donations with their basic info
    const activeDonations = await prisma.donation.findMany({
      where: { isDonationActive: true },
      select: {
        title: true,
        totalAmount: true,
        receivedAmount: true,
        timePeriod: true,
        imgUrl: true,
        organizedBy: true,
        desc: true,
        id: true,
      },
    });

    // Calculate days left helper function
    const calculateDaysLeft = (timePeriod) => {
      const endDate = new Date(timePeriod);
      const currentDate = new Date();
      const timeDiff = endDate - currentDate;
      const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      return Math.max(0, daysLeft);
    };

    // Transform active donations data
    const activeDonationsData = activeDonations.map((donation) => ({
      ...donation,
      progress: Number(
        (((donation.receivedAmount || 0) / donation.totalAmount) * 100).toFixed(
          2
        )
      ),
      daysLeft: calculateDaysLeft(donation.timePeriod),
    }));

    // Get current date info for filtering
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Get all donations for the current year
    const yearlyDonations = await prisma.donationRecord.findMany({
      where: {
        createdAt: {
          gte: startOfYear,
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // Process donations into monthly data
    const monthlyData = new Array(12).fill(0);
    yearlyDonations.forEach((donation) => {
      const month = donation.createdAt.getMonth();
      monthlyData[month] += donation.amount;
    });

    // Transform into required chart format
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const chartData = monthlyData.map((amount, index) => ({
      month: months[index],
      Donation: amount,
    }));

    // Get stats using transaction for consistency
    const stats = await prisma.$transaction(async (prisma) => {
      // Calculate date ranges for current and previous periods
      const today = new Date();
      const startOfCurrentMonth = new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      );
      const startOfPreviousMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1
      );
      const endOfPreviousMonth = new Date(
        today.getFullYear(),
        today.getMonth(),
        0
      );
      const startOfYesterday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 1,
        0,
        0,
        0
      );
      const endOfYesterday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 1,
        23,
        59,
        59
      );

      // Total donations amount for the current and previous months
      const currentMonthDonations = await prisma.donationRecord.aggregate({
        where: {
          createdAt: {
            gte: startOfCurrentMonth,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const previousMonthDonations = await prisma.donationRecord.aggregate({
        where: {
          createdAt: {
            gte: startOfPreviousMonth,
            lt: startOfCurrentMonth,
          },
        },
        _sum: {
          amount: true,
        },
      });

      // Today's and yesterday's donations
      const todaysDonations = await prisma.donationRecord.aggregate({
        where: {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const yesterdaysDonations = await prisma.donationRecord.aggregate({
        where: {
          createdAt: {
            gte: startOfYesterday,
            lte: endOfYesterday,
          },
        },
        _sum: {
          amount: true,
        },
      });

      // Count new donors for the current month
      const newDonorsCount = await prisma.donationRecord.groupBy({
        by: ["parentId", "therapistId"],
        where: {
          createdAt: {
            gte: startOfCurrentMonth,
          },
        },
        having: {
          OR: [{ parentId: { not: null } }, { therapistId: { not: null } }],
        },
      });

      // Calculate percentage changes
      const currentMonthAmount = currentMonthDonations._sum.amount || 0;
      const previousMonthAmount = previousMonthDonations._sum.amount || 0;
      const todayAmount = todaysDonations._sum.amount || 0;
      const yesterdayAmount = yesterdaysDonations._sum.amount || 0;

      console.log("currentMonthAmount: >>", currentMonthAmount);
      console.log("previousMonthAmount: >>", previousMonthAmount);
      const monthlyChangePercentage =
        previousMonthAmount > 0
          ? Number(
              (
                ((currentMonthAmount - previousMonthAmount) /
                  previousMonthAmount) *
                100
              ).toFixed(2)
            )
          : 0;

      const dailyChangePercentage =
        yesterdayAmount > 0
          ? Number(
              (
                ((todayAmount - yesterdayAmount) / yesterdayAmount) *
                100
              ).toFixed(2)
            )
          : 0;

      return {
        totalDonations: {
          amount: currentMonthAmount,
          percentage: monthlyChangePercentage,
        },
        todaysDonations: {
          amount: todayAmount,
          percentage: dailyChangePercentage,
        },
        newDonors: {
          amount: newDonorsCount.length,
        },
      };
    });

    return res.status(200).json({
      data: { activeDonationsData, chartData, stats },
      status: true,
      message: "Active donations fetched successfully",
    });
  } catch (error) {
    console.error("Error in getActiveDonations:", error);
    return res.status(500).json({
      error: error.message,
      message: "Internal server error",
      status: false,
    });
  }
};

// Get top rated therapists
const getTopRatedTherapists = async (req, res) => {
  try {
    const topTherapists = await prisma.therapist.findMany({
      where: {
        ratings: { not: null },
      },
      select: {
        userName: true,
        ratings: true,
        id: true,
      },
      orderBy: {
        ratings: "desc",
      },
      take: 5,
    });

    // Get the total count of high-rated reviews (4 or 5 stars)
    const highRatedReviewsCount = await prisma.review.count({
      where: {
        rating: {
          gte: 4, // Greater than or equal to 4 stars
        },
      },
    });

    // Get total reviews count
    const totalReviewsCount = await prisma.review.count();

    return res.status(200).json({
      data: topTherapists,
      reviews: {
        highRated: highRatedReviewsCount,
        total: totalReviewsCount,
      },
      status: true,
      message: "Top rated therapists fetched successfully",
    });
  } catch (error) {
    console.error("Error in getTopRatedTherapists:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch top rated therapists" });
  }
};

const getBlogViewsStats = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1); // January 1st
    const endDate = new Date(currentYear, 11, 31); // December 31st

    // Get all blogs for the current year
    const blogs = await prisma.blog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        createdAt: true,
        viewCount: true,
      },
    });

    // Initialize monthly data structure
    const months = [
      { month: "Jan", views: 0 },
      { month: "Feb", views: 0 },
      { month: "Mar", views: 0 },
      { month: "Apr", views: 0 },
      { month: "May", views: 0 },
      { month: "Jun", views: 0 },
      { month: "Jul", views: 0 },
      { month: "Aug", views: 0 },
      { month: "Sep", views: 0 },
      { month: "Oct", views: 0 },
      { month: "Nov", views: 0 },
      { month: "Dec", views: 0 },
    ];

    // Aggregate views by month
    blogs.forEach((blog) => {
      const monthIndex = blog.createdAt.getMonth();
      months[monthIndex].views += blog.viewCount;
    });

    return res.status(200).json({
      success: true,
      data: months,
    });
  } catch (error) {
    console.error("Error getting blog stats:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get blog statistics",
    });
  }
};

export {
  getStats,
  getTopRatedTherapists,
  getBlogViewsStats,
  getActiveDonations,
};
