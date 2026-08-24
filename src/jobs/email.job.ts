import { emailQueue } from "@core/queue/bull";

export const processEmail = async (job: any) => {
  const { to, subject, template, data } = job.data;
  console.log(`Sending email to ${to} with subject "${subject}"`);
  return { success: true };
};
