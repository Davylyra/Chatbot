import jwt from 'jsonwebtoken';

export const verifyAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      message: 'Authentication required. Please log in to continue.',
      error: 'NO_TOKEN',
      requiresAuth: true 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // decoded should contain { id, email } from your register/login
    
    req.user = {
      ...decoded,
      id: decoded.id ? String(decoded.id) : decoded.id
    };

    next();
  } catch (err) {
    console.error('JWT Error:', err);
    
    let message = 'Authentication failed. Please log in again.';
    let error = 'INVALID_TOKEN';
    
    if (err.name === 'TokenExpiredError') {
      message = 'Your session has expired. Please log in again.';
      error = 'TOKEN_EXPIRED';
    } else if (err.name === 'JsonWebTokenError') {
      message = 'Invalid authentication token. Please log in again.';
      error = 'MALFORMED_TOKEN';
    }
    
    return res.status(401).json({ 
      success: false,
      message,
      error,
      requiresAuth: true 
    });
  }
};

export default verifyAuth;
export { verifyAuth as authMiddleware };