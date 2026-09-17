const logger = require("../utils/logger");

/**
 * Formats emergency text payload for Parents / Emergency Contacts
 * CRITICAL RULE: Uses 112 / 100 / 1091 police helplines. NEVER personal developer numbers.
 */
function formatParentsEmergencyMessage({
  contactName,
  passengerName,
  passengerPhone,
  driverName,
  driverPhone,
  vehicleNumber,
  vehicleModel,
  pickupAddress,
  dropAddress,
  latitude,
  longitude,
  mapsUrl,
  triggeredAt = new Date(),
}) {
  const formattedTime = new Date(triggeredAt).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    `🚨 *EMERGENCY SOS ALERT - GoRide Safety* 🚨\n\n` +
    `Dear ${contactName || "Parent / Guardian"},\n` +
    `*${passengerName}* (${passengerPhone}) has triggered an *EMERGENCY SOS* alert during their cab ride at ${formattedTime}!\n\n` +
    `📍 *Live GPS Location & Route Tracking:*\n` +
    `${mapsUrl}\n` +
    `(Coordinates: ${latitude}, ${longitude})\n\n` +
    `🚖 *Vehicle & Driver Details:*\n` +
    `• Vehicle: ${vehicleModel || "Cab"} - *${vehicleNumber || "Registration Unavailable"}*\n` +
    `• Driver: ${driverName || "Assigned Driver"} (${driverPhone || "N/A"})\n\n` +
    `🗺️ *Route:*\n` +
    `• Pickup: ${pickupAddress || "N/A"}\n` +
    `• Destination: ${dropAddress || "N/A"}\n\n` +
    `⚠️ *IMMEDIATE STEPS FOR PARENTS:*\n` +
    `1. Call passenger immediately: tel:${passengerPhone}\n` +
    `2. If unreachable or danger suspected, contact Police immediately:\n` +
    `   • National Emergency Helpline: *112*\n` +
    `   • Police Control Room: *100*\n` +
    `   • Women Safety Helpline: *1091*\n\n` +
    `_Automated emergency message dispatched by GoRide Safety Shield._`
  );
}

/**
 * Formats simulated Police Control Room / Emergency Dispatch text payload
 * Dispatched to Developer's contact (6205557309) during testing/simulation
 */
function formatPoliceDispatchMessage({
  rideId,
  passengerName,
  passengerPhone,
  passengerEmail,
  driverName,
  driverPhone,
  vehicleNumber,
  vehicleModel,
  pickupAddress,
  dropAddress,
  latitude,
  longitude,
  mapsUrl,
  triggeredAt = new Date(),
}) {
  const formattedTime = new Date(triggeredAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  return (
    `🚓 *[POLICE CONTROL ROOM DISPATCH - PRIORITY 1]*\n` +
    `CRITICAL IN-CAB DISTRESS SIGNAL DETECTED\n\n` +
    `• Trip ID: ${rideId}\n` +
    `• Timestamp: ${formattedTime}\n\n` +
    `📍 *Live Incident Coordinates:*\n` +
    `${mapsUrl}\n` +
    `Coordinates: ${latitude}, ${longitude}\n\n` +
    `👤 *Passenger Profile:*\n` +
    `• Name: ${passengerName}\n` +
    `• Phone: ${passengerPhone}\n` +
    `• Email: ${passengerEmail || "N/A"}\n\n` +
    `🚖 *Vehicle & Driver Telemetry:*\n` +
    `• Vehicle Reg: ${vehicleNumber || "N/A"} (${vehicleModel || "Cab"})\n` +
    `• Driver Name: ${driverName || "Unknown"}\n` +
    `• Driver Phone: ${driverPhone || "N/A"}\n\n` +
    `🗺️ *Route:*\n` +
    `• Pickup: ${pickupAddress || "N/A"}\n` +
    `• Destination: ${dropAddress || "N/A"}\n\n` +
    `ACTION: Emergency response unit / patrol dispatch alerted.`
  );
}

/**
 * Generates a direct WhatsApp link that can be tapped to open pre-filled chat
 */
function generateWhatsAppDeepLink(phone, message) {
  const cleanedPhone = String(phone).replace(/[^\d]/g, "");
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${cleanedPhone}?text=${encodedText}`;
}

/**
 * Sends real SMS using Fast2SMS Gateway API
 */
async function sendFast2SMSSms(phone, message) {
  const apiKey = (process.env.FAST2SMS_API_KEY || "").trim();
  if (!apiKey) {
    logger.warn("FAST2SMS_API_KEY not configured, skipping real SMS.");
    return { success: false, reason: "NO_API_KEY" };
  }

  const cleanedPhone = String(phone).replace(/[^\d]/g, "").slice(-10);
  if (cleanedPhone.length !== 10) {
    logger.warn({ phone }, "Invalid 10-digit phone for Fast2SMS");
    return { success: false, reason: "INVALID_PHONE" };
  }

  try {
    const fetchFn = globalThis.fetch || require("node-fetch");
    const response = await fetchFn("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "q",
        message: message.slice(0, 500),
        language: "english",
        flash: 0,
        numbers: cleanedPhone,
      }),
    });

    const data = await response.json();
    if (data?.return === true) {
      logger.info({ phone: cleanedPhone, requestId: data.request_id }, "Fast2SMS real SMS sent successfully");
      return { success: true, data };
    } else {
      logger.warn({ phone: cleanedPhone, fast2smsResponse: data }, "Fast2SMS API responded (recharge/verification may be required)");
      return { success: false, data };
    }
  } catch (err) {
    logger.error({ err, phone: cleanedPhone }, "Fast2SMS network dispatch failed");
    return { success: false, error: err.message };
  }
}

/**
 * Sends real SMS using Twilio REST API
 */
async function sendTwilioSms(phone, message) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const apiKey = (process.env.TWILIO_API_KEY_SID || "").trim();
  const apiSecret = (process.env.TWILIO_API_KEY_SECRET || "").trim();
  const fromNumber = (process.env.TWILIO_PHONE_NUMBER || "").trim();

  if (!accountSid || !apiKey || !apiSecret || !fromNumber) {
    logger.warn("Twilio credentials or TWILIO_PHONE_NUMBER not fully set, skipping Twilio dispatch.");
    return { success: false, reason: "TWILIO_INCOMPLETE" };
  }

  let formattedTo = String(phone).replace(/[^\d+]/g, "");
  if (!formattedTo.startsWith("+")) {
    const digits = formattedTo.replace(/[^\d]/g, "").slice(-10);
    formattedTo = `+91${digits}`;
  }

  try {
    const fetchFn = globalThis.fetch || require("node-fetch");
    const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const params = new URLSearchParams();
    params.append("To", formattedTo);
    params.append("From", fromNumber);
    params.append("Body", message.slice(0, 1500));

    const response = await fetchFn(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const data = await response.json();
    if (response.ok && data.sid) {
      logger.info({ to: formattedTo, sid: data.sid, status: data.status }, "Twilio real SMS sent successfully!");
      return { success: true, data };
    } else {
      logger.warn({ to: formattedTo, twilioError: data }, "Twilio SMS dispatch returned error");
      return { success: false, data };
    }
  } catch (err) {
    logger.error({ err, to: formattedTo }, "Twilio network dispatch failed");
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches emergency SMS and WhatsApp notifications
 * Sends to parents/emergency contacts and simulated police control room
 */
async function sendEmergencyMessagingAlerts({
  rideId,
  passenger,
  driver,
  ride,
  latitude,
  longitude,
  mapsUrl,
  triggeredAt = new Date(),
}) {
  const results = {
    parentsAlerts: [],
    policeAlert: null,
  };

  const passengerName = passenger?.name || "Passenger";
  const passengerPhone = passenger?.phone || "N/A";
  const passengerEmail = passenger?.email || "";
  const driverName = driver?.name || "Driver";
  const driverPhone = driver?.phone || "N/A";
  const vehicleNumber = driver?.vehicleNumber || "N/A";
  const vehicleModel = driver?.vehicleModel || "Cab";
  const pickupAddress = ride?.pickupAddress || "N/A";
  const dropAddress = ride?.dropAddress || "N/A";

  // 1. Dispatch to Parents / Emergency Contacts
  const emergencyContacts = passenger?.emergencyContacts || [];
  for (const contact of emergencyContacts) {
    if (!contact?.phone && !contact?.email) continue;

    const message = formatParentsEmergencyMessage({
      contactName: contact.name,
      passengerName,
      passengerPhone,
      driverName,
      driverPhone,
      vehicleNumber,
      vehicleModel,
      pickupAddress,
      dropAddress,
      latitude,
      longitude,
      mapsUrl,
      triggeredAt,
    });

    const whatsAppUrl = contact.phone
      ? generateWhatsAppDeepLink(contact.phone, message)
      : null;

    logger.warn(
      {
        recipient: contact.name,
        phone: contact.phone,
        relation: contact.relation,
        channel: "SMS/WHATSAPP",
      },
      `🚨 [EMERGENCY DISPATCH TO PARENTS] SMS/WhatsApp payload generated for ${contact.name} (${contact.phone || "No phone"})`
    );

    // Send real SMS via Twilio or Fast2SMS
    let smsResult = null;
    if (contact.phone) {
      smsResult = await sendTwilioSms(contact.phone, message);
      if (!smsResult.success && smsResult.reason === "TWILIO_INCOMPLETE") {
        smsResult = await sendFast2SMSSms(contact.phone, message);
      }
    }

    // Output formatted alert preview in dev/test logs
    // eslint-disable-next-line no-console
    console.log(`\n================== [EMERGENCY SMS/WHATSAPP TO PARENTS: ${contact.name}] ==================\n` +
      `To Phone: ${contact.phone}\n` +
      `WhatsApp Deep Link: ${whatsAppUrl || "N/A"}\n` +
      `Real SMS Dispatch: ${smsResult?.success ? "SENT" : "SIMULATED/PENDING"}\n\n` +
      `${message}\n` +
      `=========================================================================================\n`);

    results.parentsAlerts.push({
      recipient: contact.name,
      phone: contact.phone,
      relation: contact.relation,
      status: smsResult?.success ? "SENT" : "SIMULATED",
      whatsAppUrl,
      sms: smsResult,
      preview: message,
    });
  }

  // 2. Dispatch to Simulated Police Control Room (Developer's Contact)
  const policePhone = process.env.POLICE_DISPATCH_PHONE || "6205557309";
  const policeMessage = formatPoliceDispatchMessage({
    rideId,
    passengerName,
    passengerPhone,
    passengerEmail,
    driverName,
    driverPhone,
    vehicleNumber,
    vehicleModel,
    pickupAddress,
    dropAddress,
    latitude,
    longitude,
    mapsUrl,
    triggeredAt,
  });

  const policeWhatsAppUrl = generateWhatsAppDeepLink(policePhone, policeMessage);

  logger.warn(
    {
      target: "POLICE_CONTROL_ROOM",
      policePhone,
      channel: "SMS/WHATSAPP",
    },
    `🚓 [POLICE CONTROL ROOM DISPATCH] SMS/WhatsApp telemetry sent to ${policePhone}`
  );

  // Send real SMS to Police Dispatch phone via Twilio or Fast2SMS
  let policeSmsResult = null;
  if (policePhone) {
    policeSmsResult = await sendTwilioSms(policePhone, policeMessage);
    if (!policeSmsResult.success && policeSmsResult.reason === "TWILIO_INCOMPLETE") {
      policeSmsResult = await sendFast2SMSSms(policePhone, policeMessage);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n================== [POLICE DISPATCH TELEMETRY: ${policePhone}] ==================\n` +
    `Dispatch Phone: ${policePhone}\n` +
    `Police WhatsApp Link: ${policeWhatsAppUrl}\n` +
    `Real SMS Dispatch: ${policeSmsResult?.success ? "SENT" : "SIMULATED/PENDING"}\n\n` +
    `${policeMessage}\n` +
    `=================================================================================\n`);

  results.policeAlert = {
    target: "POLICE_CONTROL_ROOM",
    phone: policePhone,
    status: policeSmsResult?.success ? "SENT" : "SIMULATED",
    whatsAppUrl: policeWhatsAppUrl,
    sms: policeSmsResult,
    preview: policeMessage,
  };

  return results;
}

module.exports = {
  formatParentsEmergencyMessage,
  formatPoliceDispatchMessage,
  generateWhatsAppDeepLink,
  sendFast2SMSSms,
  sendTwilioSms,
  sendEmergencyMessagingAlerts,
};
