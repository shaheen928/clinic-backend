import cron from "node-cron";
import doctorModel from "../models/doctorModel.js";

cron.schedule(
  "0 0 * * *",
  async () => {
    console.log("⏰ Running Daily Doctor Availability Automation Checker...");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const toDeactivate = await doctorModel.find({
        available: true,
        deactivationDate: { $lte: today },
      });

      for (let doc of toDeactivate) {
        doc.available = false;
        doc.deactivationDate = null;
        await doc.save();
        console.log(`❌ Doctor ${doc.name} has been auto-deactivated.`);
      }

      const toReactivate = await doctorModel.find({
        available: false,
        reactivationDate: { $lte: today },
      });

      for (let doc of toReactivate) {
        doc.available = true;
        doc.reactivationDate = null;
        await doc.save();
        console.log(
          `🟢 Doctor ${doc.name} has been auto-reactivated from vacation.`,
        );
      }
    } catch (error) {
      console.error("Cron Job Error:", error);
    }
  },
  {
    scheduled: true,
    timezone: "Asia/Karachi",
  },
);

export default cron;
