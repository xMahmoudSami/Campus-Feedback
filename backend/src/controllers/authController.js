const authService = require('../services/authService');

/**
 * Handles user registration.
 * Expects { name / fullName, email, password, username?, role? }.
 */
async function register(req, res, next) {
  try {
    const { name, fullName, email, password, username, role } = req.body;
    const result = await authService.register({
      fullName: fullName || name,
      email,
      password,
      username,
      role,
    });
    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles user login.
 * Expects { username or email or identifier, password }.
 */
async function login(req, res, next) {
  try {
    const { loginIdentifier, password } = req.body;
    const result = await authService.login(loginIdentifier, password);
    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns safe profile of authenticated user.
 */
async function getMe(req, res, next) {
  try {
    const user = await authService.getUserProfile(req.user.id);
    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles logout with honest, well-defined semantics.
 * Note: JWT tokens in this architecture are stateless. The client application
 * is responsible for discarding the stored token from storage.
 */
function logout(req, res) {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please remove the authentication token from client storage.',
    semantics: 'Stateless JWT logout: token discarded client-side.',
  });
}

module.exports = {
  register,
  login,
  getMe,
  logout,
};
