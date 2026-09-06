function sendSuccess(res, { statusCode = 200, message = "Success", data = {} } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}

function sendError(res, { statusCode = 500, message = "Something went wrong", error = {} } = {}) {
  return res.status(statusCode).json({ success: false, message, error });
}

module.exports = { sendSuccess, sendError };
