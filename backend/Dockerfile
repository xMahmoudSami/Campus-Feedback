# ==============================================================================
# Student Feedback System - Backend Dockerfile
# Multi-stage / optimized Node.js Alpine image
# Build context: backend/
# ==============================================================================

FROM node:24-alpine AS production

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Set working directory
WORKDIR /app

# Ensure proper permissions for the node user
RUN chown -R node:node /app

# Copy dependency specifications first to leverage Docker layer caching
COPY --chown=node:node package*.json ./

# Install production dependencies only
# We use npm install --omit=dev to ensure a clean, reproducible production dependency tree
USER node
RUN npm install --omit=dev --no-audit --no-fund

# Copy the rest of the application code
COPY --chown=node:node . .

# Expose the application listening port
EXPOSE 5000

# Start the application using the production npm script
CMD ["npm", "start"]
