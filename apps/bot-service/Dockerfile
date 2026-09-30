FROM node:22-alpine AS deps
WORKDIR /app
COPY . .
RUN npm install

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=deps /app .
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start"]
