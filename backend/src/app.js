const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const apiRoutes = require('./routes');
const { errorHandler, NotFoundError } = require('./middleware/errorHandler');

const app = express();

// Trust reverse proxies (useful in containerized/Dockerized environments)
app.set('trust proxy', 1);

// Configure CORS
const allowedOrigins = env.corsOrigin === '*'
  ? '*'
  : env.corsOrigin.split(',').map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or if wildcard
      if (!origin || allowedOrigins === '*' || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy blocked access from origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  })
);

// Cache invalidation headers so browser flushes stale cached HTML/JS
app.use((req, res, next) => {
  res.setHeader('Clear-Site-Data', '"cache"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// Standard body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Mount all API endpoints
app.use('/api', apiRoutes);

// Catch 404 for unknown routes
app.use((req, res, next) => {
  next(new NotFoundError(`Endpoint not found: ${req.method} ${req.originalUrl}`));
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
