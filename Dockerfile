# Use Node.js with FFmpeg pre-installed
FROM node:18-bullseye

# Install FFmpeg and other dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create storage directory
RUN mkdir -p storage/temp

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]