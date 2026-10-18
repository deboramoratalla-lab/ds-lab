FROM node:22-slim
WORKDIR /app
COPY server ./server
COPY console/index.html ./console/index.html
ENV PORT=8000
EXPOSE 8000
CMD ["node", "server/server.mjs"]
