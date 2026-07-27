# Specify the base Docker image
FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install production dependencies (keep optional deps for sharp / resvg native binaries)
RUN npm --quiet set progress=false \
    && npm install --omit=dev \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy source, fonts, and config
COPY . ./

# Ensure bundled fonts are present for Instagram text overlays
RUN test -f assets/fonts/NotoSerif-Bold.ttf \
    && test -f assets/fonts/NotoSans-Bold.ttf \
    && test -f assets/fonts/NotoSans-Regular.ttf \
    && echo "Bundled fonts OK"

# Run the actor
CMD npm start --silent
