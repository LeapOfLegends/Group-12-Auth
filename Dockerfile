# Run npm run build first; Jenkins does this in its Build stage.
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY dist ./dist

EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
