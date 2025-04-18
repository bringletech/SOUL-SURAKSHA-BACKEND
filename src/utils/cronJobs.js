import cron from "node-cron";
import { prisma } from "../db/prismaClientConfig.js";

// Function to check and update expired donations
async function checkAndUpdateDonations() {
  try {
    const currentDate = new Date();
    
    // Find and update all expired active donations
    const updatedDonations = await prisma.donation.updateMany({
      where: {
        AND: [
          { isDonationActive: true },
          { timePeriod: { lt: currentDate } }
        ]
      },
      data: {
        isDonationActive: false
      }
    });

    console.log(`Updated ${updatedDonations.count} expired donations`);
    
  } catch (error) {
    console.error('Error in donation status update:', error);
  }
}

// Schedule the cron job to run at 12:01 AM daily
function scheduleDonationCheck() {
  // '1 0 * * *' means "run at 1 minute past midnight (00:01) every day"
  cron.schedule('1 0 * * *', async () => {
    console.log('Running daily donation status check...');
    await checkAndUpdateDonations();
  });
}

export { scheduleDonationCheck };