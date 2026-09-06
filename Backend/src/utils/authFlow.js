const bcrypt = require("bcryptjs");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  cookieOptions,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
} = require("./tokens");
const { sendSuccess } = require("./apiResponse");
const AppError = require("./AppError");

/**
 * Shared token-issuing logic used by both passenger and driver auth
 * controllers so the two don't drift out of sync (this used to be
 * duplicated with inconsistent cookie maxAges — see tokens.js fix).
 */
async function issueTokensAndRespond(res, account, role, statusCode, message, dataKey) {
  const accessToken = signAccessToken({ id: account._id, role });
  const refreshToken = signRefreshToken({ id: account._id, role });

  account.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await account.save({ validateBeforeSave: false });

  res
    .cookie("accessToken", accessToken, { ...cookieOptions, maxAge: ACCESS_TOKEN_MAX_AGE_MS })
    .cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: REFRESH_TOKEN_MAX_AGE_MS });

  return sendSuccess(res, {
    statusCode,
    message,
    data: { [dataKey]: account.toSafeJSON(), accessToken, refreshToken },
  });
}

/**
 * Rotates an access token from a valid, non-revoked refresh token.
 * Also rotates the refresh token itself (rotation-on-use) so a stolen
 * refresh token has a shrinking window of validity.
 */
async function refreshTokens(req, res, Model, role, dataKey) {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) throw new AppError("Refresh token required", 401);

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const account = await Model.findById(decoded.id).select("+refreshTokenHash");
  if (!account || !account.refreshTokenHash) throw new AppError("Session no longer valid, please log in again", 401);

  const matches = await bcrypt.compare(token, account.refreshTokenHash);
  if (!matches) {
    // Refresh token reuse after rotation — treat as compromised and revoke.
    account.refreshTokenHash = null;
    await account.save({ validateBeforeSave: false });
    throw new AppError("Session invalid, please log in again", 401);
  }

  return issueTokensAndRespond(res, account, role, 200, "Token refreshed", dataKey);
}

module.exports = { issueTokensAndRespond, refreshTokens };
