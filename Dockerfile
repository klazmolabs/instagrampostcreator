# Specify the base Docker image
FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install production dependencies (keep optional deps for sharp native binaries)
RUN npm --quiet set progress=false \
    && npm install --omit=dev \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy source code
COPY . ./

# Run the actor
CMD npm start --silent
