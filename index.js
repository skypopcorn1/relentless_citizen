/************************************************************
 * dailyEmail.js
 *
 * Description:
 *  This script reads the last three emails and email count
 *  from "/bin/data.json", then uses the OpenAI API to generate
 *  a new email body, and finally sends the new email via NodeMailer.
 *  It then updates "data.json" with the new email body and increments
 *  the email count.
 *
 * NOTE:
 *  1) This script is meant to run once per day (e.g., via cron).
 *  2) It hard-codes the OpenAI system instructions (as requested).
 *  3) Replace all placeholder values (API keys, email credentials, etc.)
 *     with valid data in your environment.
 *
 ************************************************************/

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { Configuration, OpenAIApi } = require("openai");

// Load environment variables
const { GMAIL_APP_PASSWORD, OPENAI_API_KEY } = process.env;

// -------------------------------------
// 1. Read data.json for existing email info
// -------------------------------------
const dataFilePath = path.join(__dirname, "bin", "data.json");
let data = { count: 0, recent_emails: [] };

try {
  const fileContents = fs.readFileSync(dataFilePath, "utf-8");
  data = JSON.parse(fileContents);
} catch (err) {
  console.error("Error reading data.json. Using default values.");
}

// -------------------------------------
// 2. Prepare prompt inputs
// -------------------------------------
const { count, recent_emails } = data;

// Hard-coded system message (as requested)
const systemMessage = `
You are a concerned United States Citizen, living in Arlington Texas. 
Your Senator is John Cornyn. You write a letter each day to Senator Cornyn 
pleading with him to put a stop to the genocide being carried out by 
Israel against the Palestinian people in Gaza.
`;

// Last three emails as reference
const recent_emails_count = recent_emails ? recent_emails.length : 0;
const lastThreeEmailsText =
  recent_emails_count > 0
    ? recent_emails
        .map((emailBody, i) => `Email ${i + 1}: ${emailBody}`)
        .join("\n\n")
    : "";

/*
  We want a structured prompt that ensures only the *new* email body 
  is returned in a JSON object, with no additional keys or commentary.
*/
const userPrompt = `
${
  recent_emails_count > 0
    ? "Below are the most recent emails you have sent to Senator John Cornyn:\n"
    : ""
}

${lastThreeEmailsText}

Total emails sent so far: ${count}.

Today, please compose a brand new letter to Senator Cornyn. The letter should be 100 words or less. 

IMPORTANT:
1) Do NOT include any extraneous text or explanation outside of the JSON.
2) Only return a JSON object in the format:

{
  "email_body": "Your new email content here"
}
`;

const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// -------------------------------------
// 3. Generate new email via OpenAI
// -------------------------------------
async function generateNewEmail() {
  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    // The assistant's reply (should be a JSON with "email_body")
    const rawReply = completion.data.choices[0].message.content.trim();

    // Parse JSON safely
    let newEmailBody = "";
    try {
      const parsed = JSON.parse(rawReply);
      if (parsed.email_body) {
        newEmailBody = parsed.email_body;
      } else {
        // Throw an error if the JSON doesn't contain the expected key
        throw new Error("Invalid JSON response from OpenAI");
      }
    } catch (parseErr) {
      // Log the error and use the raw reply as the email body
      console.error("Error parsing JSON response:", parseErr);
    }

    return newEmailBody;
  } catch (error) {
    console.error("Error generating new email from OpenAI:", error);
    return null;
  }
}

// -------------------------------------
// 4. Send the email via NodeMailer
// -------------------------------------
async function sendEmail(emailBody) {
  try {
    // Configure mail transport
    // Replace placeholders with your email service credentials
    const transporter = nodemailer.createTransport({
      service: "gmail", // e.g., 'gmail'
      auth: {
        user: "jeremiahflickinger@gmail.com",
        pass: GMAIL_APP_PASSWORD, // App password for Gmail
      },
    });

    await transporter.sendMail({
      from: '"Jeremiah Flickinger" <jeremiahflickinger@gmail.com>',
      to: "jeremiahflickinger@gmail.com", //'john_cornyn@senate.gov', // or any test recipient
      subject: "Test email", //'Please End the Genocide in Gaza',
      text: emailBody,
    });

    console.log("Email sent successfully!");
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// -------------------------------------
// 5. Main process
// -------------------------------------
(async () => {
  const newEmail = await generateNewEmail();
  if (!newEmail) {
    console.error("No new email content was generated. Exiting.");
    return;
  }

  // Send the generated email
  await sendEmail(newEmail);

  // Update count
  data.count += 1;

  // Shift recent emails if necessary and add new email to the end
  data.recent_emails.push(newEmail);
  if (data.recent_emails.length > 3) {
    data.recent_emails.shift(); // keep only the last 3
  }

  // Write back to data.json
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), "utf-8");
    console.log("data.json updated successfully!");
  } catch (err) {
    console.error("Failed to update data.json:", err);
  }
})();
