const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  } else {
    // Development fallback: log email dispatch or create test account
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return transporter;
}

/**
 * Sends an urgent SOS Email to an emergency contact
 */
async function sendSosAlertEmail({
  to,
  contactName,
  passengerName,
  passengerPhone,
  driverName,
  driverPhone,
  vehicleModel,
  vehicleNumber,
  pickupAddress,
  dropAddress,
  latitude,
  longitude,
  mapsUrl,
  triggeredAt = new Date(),
}) {
  try {
    if (!to) return null;

    const senderEmail = process.env.SMTP_USER || "sos@goride.com";
    const from = process.env.SMTP_FROM || `"GoRide Emergency Safety" <${senderEmail}>`;
    const subject = `🚨 URGENT SOS ALERT: ${passengerName} needs emergency help!`;
    const formattedTime = new Date(triggeredAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const html = `
      <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 2px solid #ef4444; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <div style="background-color: #ef4444; padding: 20px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px;">🚨 EMERGENCY SOS ALERT</h1>
            <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.95;">GoRide Safety & Emergency Response</p>
          </div>

          <div style="padding: 24px;">
            <p style="font-size: 16px; line-height: 1.5; margin-top: 0;">
              Hello <strong>${contactName || "Emergency Contact"}</strong>,
            </p>
            <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
              <p style="margin: 0; color: #991b1b; font-weight: bold; font-size: 15px;">
                ${passengerName} (${passengerPhone}) has triggered an Emergency SOS alert during their ride!
              </p>
            </div>

            <div style="margin-bottom: 24px; text-align: center;">
              <a href="${mapsUrl}" target="_blank" style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: bold; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.4);">
                📍 VIEW REAL-TIME LIVE LOCATION ON MAP
              </a>
              <p style="font-size: 13px; color: #64748b; margin-top: 8px;">Coordinates: ${latitude}, ${longitude} (Triggered: ${formattedTime})</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Passenger:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${passengerName} (<a href="tel:${passengerPhone}" style="color: #ef4444;">${passengerPhone}</a>)</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Driver:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${driverName || "Assigned Driver"} (<a href="tel:${driverPhone || ""}" style="color: #ef4444;">${driverPhone || "N/A"}</a>)</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Vehicle:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${vehicleModel || "Cab"} - ${vehicleNumber || "N/A"}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Pickup Location:</td>
                <td style="padding: 8px 0; text-align: right; color: #334155;">${pickupAddress || "N/A"}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Destination:</td>
                <td style="padding: 8px 0; text-align: right; color: #334155;">${dropAddress || "N/A"}</td>
              </tr>
            </table>

            <div style="background-color: #f1f5f9; padding: 14px; border-radius: 8px; font-size: 13px; color: #475569;">
              <strong>Immediate Actions:</strong>
              <ul style="margin: 6px 0 0 0; padding-left: 20px;">
                <li>Try calling the passenger immediately: <a href="tel:${passengerPhone}"><strong>${passengerPhone}</strong></a></li>
                <li>If they are unreachable or in danger, immediately dial National Emergency / Police: <strong><a href="tel:112" style="color: #ef4444;">112</a></strong> or <strong><a href="tel:100" style="color: #ef4444;">100</a></strong>.</li>
              </ul>
            </div>
          </div>

          <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
            This is an automated safety alert generated by the GoRide Emergency Safety System.
          </div>
        </div>
      </div>
    `;

    const mail = getTransporter();
    const info = await mail.sendMail({
      from,
      to,
      subject,
      html,
    });

    logger.info({ to, messageId: info?.messageId }, "Emergency SOS email dispatched");
    return info;
  } catch (err) {
    logger.error({ err, to }, "Failed to send SOS alert email");
    return null;
  }
}

/**
 * Sends a high-priority simulated Police Control Room / Emergency Dispatch email
 */
async function sendPoliceDispatchEmail({
  rideId,
  passengerName,
  passengerPhone,
  passengerEmail,
  driverName,
  driverPhone,
  vehicleModel,
  vehicleNumber,
  vehicleType,
  pickupAddress,
  dropAddress,
  latitude,
  longitude,
  mapsUrl,
  triggeredAt = new Date(),
}) {
  try {
    const to = process.env.POLICE_DISPATCH_EMAIL || "aayushshrivastav102@gmail.com";
    const senderEmail = process.env.SMTP_USER || "dispatch@goride.com";
    const from = process.env.SMTP_FROM || `"GoRide Police Dispatch" <${senderEmail}>`;
    const subject = `🚨 [POLICE DISPATCH] CRITICAL: SOS Activated in Ride #${String(rideId).slice(-6).toUpperCase()}`;
    const formattedTime = new Date(triggeredAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #0b0f17; padding: 24px; color: #f8fafc;">
        <div style="max-width: 640px; margin: 0 auto; background: #161f2e; border-radius: 12px; overflow: hidden; border: 2px solid #ef4444; box-shadow: 0 8px 16px rgba(239,68,68,0.2);">
          
          <div style="background-color: #dc2626; padding: 18px 24px;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 1.5px;">
              🚓 EMERGENCY POLICE DISPATCH ALERT
            </h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #fecaca; font-weight: 600;">
              PRIORITY 1: PASSENGER IN-CAB SOS ACTIVATED
            </p>
          </div>

          <div style="padding: 24px;">
            <div style="background-color: #7f1d1d; border-left: 5px solid #ef4444; padding: 14px 18px; border-radius: 6px; margin-bottom: 20px;">
              <p style="margin: 0; color: #ffffff; font-size: 15px; font-weight: 700;">
                ACTIVE DISTRESS SIGNAL DETECTED — IMMEDIATE LAW ENFORCEMENT INTERVENTION ADVISABLE
              </p>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #fca5a5;">
                Trip ID: <strong>${rideId}</strong> | Triggered: <strong>${formattedTime}</strong>
              </p>
            </div>

            <!-- Live GPS Action -->
            <div style="margin: 20px 0 24px 0; text-align: center; background: #0f172a; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #94a3b8;">
                Real-Time Incident Coordinates: <span style="color: #38bdf8; font-family: monospace; font-weight: bold;">${latitude}, ${longitude}</span>
              </p>
              <a href="${mapsUrl}" target="_blank" style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: bold; letter-spacing: 0.5px;">
                📍 OPEN LIVE GPS TRACKING ON GOOGLE MAPS
              </a>
            </div>

            <!-- Telemetry Tables -->
            <h3 style="color: #38bdf8; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
              👤 Passenger Profile
            </h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; color: #e2e8f0; background: #0f172a; border-radius: 6px;">
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 10px 14px; color: #94a3b8;">Name:</td>
                <td style="padding: 10px 14px; font-weight: 600; text-align: right;">${passengerName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 10px 14px; color: #94a3b8;">Phone:</td>
                <td style="padding: 10px 14px; font-weight: 600; text-align: right;"><a href="tel:${passengerPhone}" style="color: #38bdf8;">${passengerPhone}</a></td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; color: #94a3b8;">Email:</td>
                <td style="padding: 10px 14px; text-align: right;">${passengerEmail || "N/A"}</td>
              </tr>
            </table>

            <h3 style="color: #f59e0b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
              🚖 Driver & Vehicle Telemetry
            </h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; color: #e2e8f0; background: #0f172a; border-radius: 6px;">
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 10px 14px; color: #94a3b8;">Driver Name:</td>
                <td style="padding: 10px 14px; font-weight: 600; text-align: right;">${driverName || "Unknown"}</td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 10px 14px; color: #94a3b8;">Driver Contact:</td>
                <td style="padding: 10px 14px; font-weight: 600; text-align: right;"><a href="tel:${driverPhone || ""}" style="color: #f59e0b;">${driverPhone || "N/A"}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 10px 14px; color: #94a3b8;">Vehicle Registration:</td>
                <td style="padding: 10px 14px; font-weight: 700; color: #facc15; text-align: right;">${vehicleNumber || "N/A"}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; color: #94a3b8;">Vehicle Model & Type:</td>
                <td style="padding: 10px 14px; text-align: right;">${vehicleModel || "Cab"} (${vehicleType || "standard"})</td>
              </tr>
            </table>

            <h3 style="color: #10b981; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
              🗺️ Route Coordinates
            </h3>
            <div style="background: #0f172a; padding: 14px; border-radius: 6px; font-size: 13px; line-height: 1.6; color: #cbd5e1;">
              <p style="margin: 0 0 6px 0;"><strong>Pickup:</strong> ${pickupAddress || "N/A"}</p>
              <p style="margin: 0;"><strong>Destination:</strong> ${dropAddress || "N/A"}</p>
            </div>
          </div>

          <div style="background-color: #0f172a; padding: 16px; text-align: center; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b;">
            CONFIDENTIAL EMERGENCY DISPATCH FEED • GORIDE CENTRAL SAFETY NETWORK
          </div>
        </div>
      </div>
    `;

    const mail = getTransporter();
    const info = await mail.sendMail({
      from,
      to,
      subject,
      html,
    });

    logger.info({ to, messageId: info?.messageId }, "Police control room dispatch email sent successfully");
    return info;
  } catch (err) {
    logger.error({ err }, "Failed to send police dispatch email");
    return null;
  }
}

module.exports = {
  sendSosAlertEmail,
  sendPoliceDispatchEmail,
};
